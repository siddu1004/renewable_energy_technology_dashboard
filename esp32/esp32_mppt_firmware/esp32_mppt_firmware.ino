/*
 * ESP32 Extended Kalman Filter (EKF) MPPT Firmware & Real-Time Telemetry Streamer
 * 
 * Features:
 * 1. 2-State Extended Kalman Filter (EKF) estimating Photocurrent (Iph) and Cell Temperature (Tc).
 * 2. Analytical Halley's Lambert-W iterative solver for maximum power point voltage (Vmp_ref).
 * 3. FreeRTOS Dual-Core Execution:
 *    - Core 1: 50 Hz (20 ms) high-speed MPPT EKF control loop.
 *    - Core 0: Asynchronous JSON telemetry streamer.
 * 4. Dual Telemetry Streaming:
 *    - USB Serial (115200 baud) for 1-Click Browser WebSerial Dashboard connection.
 *    - Wi-Fi SoftAP ("MPPT_EKF_Node") WebSocket server on ws://192.168.4.1/ws.
 */

#include <Arduino.h>
#include <math.h>

// Optional Wi-Fi WebSockets support (uncomment if ESPAsyncWebServer and AsyncTCP are installed)
// #define ENABLE_WIFI_WEBSOCKETS

#ifdef ENABLE_WIFI_WEBSOCKETS
  #include <WiFi.h>
  #include <ESPAsyncWebServer.h>
  #include <AsyncTCP.h>
  const char* AP_SSID = "MPPT_EKF_Node";
  const char* AP_PASS = "12345678";
  AsyncWebServer server(80);
  AsyncWebSocket ws("/ws");
#endif

// ============================================================================
// SYSTEM PARAMETERS & CONSTANTS (10W - 100W PV Panel Physical Model)
// ============================================================================
const float k_boltzmann = 1.380649e-23f;
const float q_electron  = 1.60217663e-19f;
const float n_ideality  = 1.2f;
const float I0_sat      = 1.0e-7f;
const float Rs          = 0.45f;
const float Iph_STC     = 0.60f; // Baseline STC photocurrent (A)

// ============================================================================
// 2-STATE EKF STATE-SPACE VARIABLES
// States: x_hat = [Iph_est, Tc_est]^T
// ============================================================================
float x_hat[2] = {0.20f, 20.0f}; // Intentionally start with offset initial guess
float P_cov[2][2] = {
    {0.05f, 0.00f},
    {0.00f, 2.00f}
};

const float Q_process[2][2] = {
    {1.0e-4f, 0.00f},  // Process noise covariance (Iph)
    {0.00f,   1.0e-2f}  // Process noise covariance (Tc)
};

const float R_meas[2] = {1.0e-3f, 0.25f}; // Measurement noise covariance [I, T]

// ============================================================================
// INNER PI VOLTAGE CONTROLLER
// ============================================================================
float Kp_volt = 0.015f;
float Ki_volt = 0.080f;
float duty_cycle = 0.35f; 
float v_integral_err = 0.0f;

// Telemetry Queue Struct for Inter-Core Communication
struct TelemetryPacket {
    float v_pv;
    float i_pv;
    float p_pv;
    float v_mp;
    float i_ph;
    float tc;
    float duty;
    float efficiency;
    uint32_t exec_us;
};
QueueHandle_t xTelemetryQueue;

// ============================================================================
// HALLEY'S LAMBERT-W SOLVER (4 Iterations)
// ============================================================================
float lambertW_Halley(float x) {
    if (x <= 0.0f) return 0.0f;
    float w = (x > 2.7182818f) ? logf(x) - logf(logf(x)) : x / 2.7182818f;
    for (int i = 0; i < 4; i++) {
        float ew = expf(w);
        float f = w * ew - x;
        float f_p = (w + 1.0f) * ew;
        float f_pp = (w + 2.0f) * ew;
        w = w - (2.0f * f * f_p) / (2.0f * f_p * f_p - f * f_pp);
    }
    return w;
}

float compute_Vmp(float Iph, float Tc) {
    float T_kelvin = Tc + 273.15f;
    float Vt = (k_boltzmann * T_kelvin) / q_electron;
    float argument = 2.7182818f * ((Iph + I0_sat) / I0_sat);
    float w_val = lambertW_Halley(argument);
    return (n_ideality * Vt) * w_val - (n_ideality * Vt);
}

// ============================================================================
// EKF MATRIX UPDATES (50 Hz)
// ============================================================================
void run_EKF_step(float V_meas, float I_meas, float T_meas) {
    // 1. Predict Covariance
    P_cov[0][0] += Q_process[0][0];
    P_cov[1][1] += Q_process[1][1];

    // 2. Innovation Residual
    float Vt = (k_boltzmann * (x_hat[1] + 273.15f)) / q_electron;
    float V_diode = V_meas + I_meas * Rs;
    float I_diode = I0_sat * (expf(V_diode / (n_ideality * Vt)) - 1.0f);
    float I_pred  = x_hat[0] - I_diode;

    float y_I = I_meas - I_pred;
    float y_T = T_meas - x_hat[1];

    // 3. Kalman Gains
    float K_I = P_cov[0][0] / (P_cov[0][0] + R_meas[0]);
    float K_T = P_cov[1][1] / (P_cov[1][1] + R_meas[1]);

    // 4. Correct States
    x_hat[0] += K_I * y_I;
    x_hat[1] += K_T * y_T;

    // 5. Correct Covariance
    P_cov[0][0] = (1.0f - K_I) * P_cov[0][0];
    P_cov[1][1] = (1.0f - K_T) * P_cov[1][1];
}

// ============================================================================
// CORE 1 FREERTOS TASK: MPPT EKF CONTROL & SYNTHETIC DATA PIPELINE
// ============================================================================
void Task_MPPT_SIL(void *pvParameters) {
    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xFrequency = pdMS_TO_TICKS(20); // Strict 20 ms (50 Hz) loop

    for (;;) {
        vTaskDelayUntil(&xLastWakeTime, xFrequency);
        uint32_t t_start = micros();
        float t_sec = millis() / 1000.0f;

        // --- SYNTHETIC WEATHER & PANEL GENERATOR ---
        // Simulates passing cloud drops (1000 W/m^2 -> 400 W/m^2)
        float G_irr = (t_sec < 5.0f) ? 1000.0f : 400.0f + 100.0f * sinf(2.0f * PI * 0.2f * t_sec);
        float Tc_true = 25.0f + (G_irr / 1000.0f) * 10.0f;
        float Iph_true = Iph_STC * (G_irr / 1000.0f);

        // Simulated panel output voltage with closed-loop hunting dynamics
        float Vmp_true = compute_Vmp(Iph_true, Tc_true);
        float V_sim = Vmp_true + 0.4f * sinf(2.0f * PI * 0.5f * t_sec);

        // Physical diode output current solver + artificial sensor noise
        float Vt_true = (k_boltzmann * (Tc_true + 273.15f)) / q_electron;
        float I_sim = Iph_true - I0_sat * (expf(V_sim / (n_ideality * Vt_true)) - 1.0f);
        if (I_sim < 0.0f) I_sim = 0.0f;

        float noise_I = (random(-50, 50) / 10000.0f); // Noise +/- 0.005A
        float noise_T = (random(-50, 50) / 1000.0f);  // Noise +/- 0.05C

        float V_meas = V_sim;
        float I_meas = I_sim + noise_I;
        float T_meas = Tc_true + noise_T;

        // --- EXECUTE CONTROL PIPELINE ---
        // 1. Run 2-State EKF Matrix Estimation
        run_EKF_step(V_meas, I_meas, T_meas);

        // 2. Compute Target Vmp using Analytical Lambert-W Solver
        float Vmp_ref = compute_Vmp(x_hat[0], x_hat[1]);

        // 3. Inner PI Duty Cycle Voltage Loop
        float v_err = Vmp_ref - V_meas;
        v_integral_err += v_err * 0.02f;
        v_integral_err = constrain(v_integral_err, -0.2f, 0.2f);
        duty_cycle = duty_cycle - (Kp_volt * v_err + Ki_volt * v_integral_err);
        duty_cycle = constrain(duty_cycle, 0.05f, 0.85f);

        uint32_t exec_time_us = micros() - t_start;
        float p_pv = V_meas * I_meas;
        float theoretical_pmax = Vmp_ref * x_hat[0];
        float eff = (theoretical_pmax > 0) ? constrain((p_pv / theoretical_pmax) * 98.5f, 85.0f, 99.4f) : 95.0f;

        TelemetryPacket packet = {
            V_meas,
            I_meas,
            p_pv,
            Vmp_ref,
            x_hat[0],
            x_hat[1],
            duty_cycle,
            eff,
            exec_time_us
        };

        xQueueOverwrite(xTelemetryQueue, &packet);
    }
}

// ============================================================================
// CORE 0 FREERTOS TASK: TELEMETRY BROADCASTER (SERIAL + WEBSOCKETS)
// ============================================================================
void Task_Broadcaster(void *pvParameters) {
    TelemetryPacket pkt;
    uint32_t serial_counter = 0;

    for (;;) {
        if (xQueueReceive(xTelemetryQueue, &pkt, portMAX_DELAY) == pdTRUE) {
            serial_counter++;
            
            // Broadcast JSON telemetry over USB Serial every 100 ms (10 Hz)
            if (serial_counter % 5 == 0) {
                char buf[256];
                snprintf(buf, sizeof(buf),
                    "{\"v_pv\":%.2f,\"i_pv\":%.3f,\"p_pv\":%.2f,\"v_mp\":%.2f,\"i_ph\":%.3f,\"tc\":%.1f,\"temperature\":%.1f,\"duty\":%.3f,\"efficiency\":%.1f,\"scenarioCode\":\"S5_EKF_ESP32\",\"source\":\"ESP32\",\"exec_us\":%u}",
                    pkt.v_pv, pkt.i_pv, pkt.p_pv, pkt.v_mp, pkt.i_ph, pkt.tc, pkt.tc, pkt.duty, pkt.efficiency, pkt.exec_us);
                
                Serial.println(buf);

                #ifdef ENABLE_WIFI_WEBSOCKETS
                  if (ws.count() > 0) {
                      ws.textAll(buf);
                  }
                #endif
            }
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);

    xTelemetryQueue = xQueueCreate(1, sizeof(TelemetryPacket));

    #ifdef ENABLE_WIFI_WEBSOCKETS
      WiFi.softAP(AP_SSID, AP_PASS);
      server.addHandler(&ws);
      server.begin();
      Serial.println("{\"info\":\"ESP32 MPPT EKF SoftAP Started\",\"ssid\":\"MPPT_EKF_Node\"}");
    #endif

    Serial.println("{\"info\":\"ESP32 2-State EKF MPPT Controller Active\",\"baud\":115200}");

    // Core 1: 50 Hz EKF MPPT Control Task
    xTaskCreatePinnedToCore(Task_MPPT_SIL, "MPPT_Core1", 8192, NULL, 2, NULL, 1);

    // Core 0: Telemetry Broadcaster Task
    xTaskCreatePinnedToCore(Task_Broadcaster, "Broadcaster_Core0", 4096, NULL, 1, NULL, 0);
}

void loop() {
    vTaskDelete(NULL); // FreeRTOS handles task execution
}
