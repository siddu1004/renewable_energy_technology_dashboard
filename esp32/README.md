# HelioTrack Robust ESP32 MPPT Firmware

**Firmware Version:** Industrial Robust Formulation (`DOC_METHOD_MPPT_ESP32_ROBUST`)  
**Target Hardware:** ESP32-WROOM-32 / NodeMCU-32S / ESP32 DevKit V1  
**Switched Chopper:** Low-Side IRLZ44N N-MOSFET, $23.50\,\Omega$ Power Resistor Load, TC4420 5V Gate Driver, $C_{\text{in}} = 470\,\mu\text{F}$ Buffer  
**Sensors:** Adafruit INA219 (32-sample hardware averaging on I2C), Dallas DS18B20 (1-Wire digital thermometer)

---

## 1. Architectural Safeguards

1. **Multi-Rate Extended Kalman Filter (EKF):**
   - **Fast 20 Hz (50 ms) Electrical Update:** Predicts and updates uncorrupted photocurrent $x_1 = I_{\text{ph}}$ and junction temperature $x_2 = T_c$ using the single-diode analytical Jacobian.
   - **Slow 1 Hz (1000 ms) Thermal Update:** Asynchronously samples DS18B20 on GPIO 4, preventing covariance overconfidence.
2. **Full-Domain Robust Lambert W0 Engine:**
   - **Two-Branch Seed:** Padé $[2/2]$ rational seed for $z \in [0, 3.0)$ and logarithmic asymptotic expansion for $z \ge 3.0$.
   - **Double-Pass Halley Rational Iteration:** Computes exact $V_{\text{mp,ref}}$ in closed form with residual error $< 10^{-10}$ and zero NaN vulnerability.
   - **Benchmarked Execution:** Monitored via hardware microsecond timer (`W0_Exec: ~28 us`).
3. **Discrete Tustin Bilinear PI Regulator with Actuator-Coupled Anti-Windup:**
   - Error definition: $e_k = V_{\text{pv}} - V_{\text{mp,ref}}$ (voltage-mode rheostatic control).
   - $\pm 40\,\text{mV}$ anti-hunting deadband freezes duty when settled.
   - Slew-rate clamped to 1 count ($0.024\%$ duty) per 50 ms tick.
   - Accumulator `u_PI_accum` locks directly to `pwmDuty12Bit` so the integrator never drifts ahead of the physical switch.
   - Upper clamp bound: 2800/4095 ($68.4\%$ duty) sized for the $10\,\text{W}$ panel into the $23.5\,\Omega$ load.
4. **Classical Perturb & Observe (P&O) Comparative Engine:**
   - Onboard real-time P&O baseline running at 4 Hz cadence.
   - Dynamic guards against constant-current collapse ($< 12.5\,\text{V}$) and open-circuit stall ($> 17.0\,\text{V}$).
5. **Hardware Sensor Averaging:**
   - INA219 register `0x00` configured to `0x3EEF` (32 samples bus + 32 samples shunt = $34.04\,\text{ms}$ conversion latency).
   - Guarantees clean, jitter-free voltage and current samples inside each 50 ms tick.

---

## 2. Pinout & Hardware Connections

| Peripheral | ESP32 Pin | Connection Target | Notes |
| :--- | :---: | :--- | :--- |
| **PWM Output** | **GPIO 18** | TC4420 Gate Driver Input (Pin 2) | 10 kHz 12-bit LEDC PWM (0 - 4095 counts) |
| **I2C SDA** | **GPIO 21** | INA219 SDA | 400 kHz Fast-Mode I2C Bus |
| **I2C SCL** | **GPIO 22** | INA219 SCL | 400 kHz Fast-Mode I2C Bus |
| **1-Wire Data** | **GPIO 4** | DS18B20 Data Line | Requires $4.7\,\text{k}\Omega$ pullup to 3.3V |
| **Voltage Div Fallback** | **GPIO 34** | Analog Voltage Divider | Optional ADC fallback input |
| **Power Supply** | **5V / VIN** | 5V Regulated Power Rail | Powers TC4420 and ESP32 |
| **Ground** | **GND** | System Common Star Ground | Connects PV-, Chopper ground, and ESP32 GND |

---

## 3. How to Upload in Arduino IDE

1. **Open Sketch:**  
   In Arduino IDE, open [`esp32/DOC_METHOD_MPPT_ESP32_ROBUST/DOC_METHOD_MPPT_ESP32_ROBUST.ino`](file:///c:/Users/saisi/.antigravity-ide/renewable_energy_technology_dashboard/esp32/DOC_METHOD_MPPT_ESP32_ROBUST/DOC_METHOD_MPPT_ESP32_ROBUST.ino) (or [`esp32/esp32_mppt_firmware/esp32_mppt_firmware.ino`](file:///c:/Users/saisi/.antigravity-ide/renewable_energy_technology_dashboard/esp32/esp32_mppt_firmware/esp32_mppt_firmware.ino)).
2. **Select Board:**  
   `Tools -> Board -> ESP32 Arduino -> DOIT ESP32 DEVKIT V1` (or your ESP32 board model).
3. **Select COM Port:**  
   `Tools -> Port -> COMx` (check Windows Device Manager for the CP2102/CH340 port).
4. **Required Libraries (Install via Library Manager):**
   - `Adafruit INA219` by Adafruit
   - `OneWire` by Paul Stoffregen
   - `DallasTemperature` by Miles Burton
5. **Click Upload (`Ctrl + U`)** and open Serial Monitor at **115200 baud**.

---

## 4. Interactive Serial Commands

Type any of the following into the Serial Monitor or transmit from the dashboard terminal:

- `AUTO` or `EKF` or `DOC` — Activate closed-loop Multi-Rate EKF + Lambert W0 MPPT tracking.
- `PO` or `P&O` — Switch to classical Perturb & Observe comparative algorithm.
- `STEP <counts>` — Set P&O perturbation step (default: 1.0 counts = $0.024\%$ duty).
- `V <volts>` — Enter constant-voltage hold mode (e.g. `V 19.25`).
- `D <percentage>` — Enter open-loop manual duty mode (e.g. `D 63.5`).
- `MAXD <counts>` — Adjust safe upper duty clamp bound (e.g. `MAXD 2800`).
- `R` — Reset EKF covariance matrix and state estimators.

---

## 5. Live Dashboard Streaming Bridge

To pipe ESP32 real-time telemetry into the local web dashboard at [`http://localhost:3000`](http://localhost:3000):

```powershell
python scripts/esp32_serial_bridge.py
```
*The bridge auto-detects the USB COM port, reads both JSON and formatted telemetry, and posts frames to `/api/telemetry/esp32` at up to 10 Hz.*
