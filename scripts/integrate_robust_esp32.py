import os
import shutil

src_path = r"c:\Users\saisi\Downloads\DOC_METHOD_MPPT_ESP32_ROBUST.ino"
if not os.path.exists(src_path):
    print(f"ERROR: {src_path} not found!")
    exit(1)

with open(src_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add JSON line after the formatted line
old_line = '    Serial.printf("[%s]  |  V_MPP (Target): %5.2f V  |  Actual Voltage: %5.2f V  (Diff: %+5.2f V)  |  Power: %5.1f mW  |  Current: %4.1f mA  |  PWM12: %4d/4095 (%4.2f%%)  |  Temp: %4.1f C  |  W0_Exec: %lld us\\n",\n                  statusStr, v_mp_ref, vSolar, (vSolar - v_mp_ref), power_mW, current_mA, (int)round(pwmDuty12Bit), dutyPct, tempC, lastLambertExecUs);'

new_line = '''    Serial.printf("[%s]  |  V_MPP (Target): %5.2f V  |  Actual Voltage: %5.2f V  (Diff: %+5.2f V)  |  Power: %5.1f mW  |  Current: %4.1f mA  |  PWM12: %4d/4095 (%4.2f%%)  |  Temp: %4.1f C  |  W0_Exec: %lld us\\n",
                  statusStr, v_mp_ref, vSolar, (vSolar - v_mp_ref), power_mW, current_mA, (int)round(pwmDuty12Bit), dutyPct, tempC, lastLambertExecUs);

    // High-Precision Telemetry JSON Frame for Dashboard & Python Serial Bridge:
    Serial.printf("{\\"status\\":\\"%s\\",\\"v_pv\\":%.3f,\\"i_pv\\":%.4f,\\"p_pv\\":%.3f,\\"v_mp\\":%.3f,\\"i_ph\\":%.4f,\\"duty\\":%.4f,\\"dutyCounts\\":%d,\\"temperature\\":%.1f,\\"w0_us\\":%lld,\\"source\\":\\"ESP32\\"}\\n",
                  statusStr, vSolar, currentA, powerW, v_mp_ref, x_hat[0], (dutyPct / 100.0f), (int)round(pwmDuty12Bit), tempC, lastLambertExecUs);'''

if old_line in content:
    content = content.replace(old_line, new_line)
    print("Embedded JSON serial telemetry frame alongside human-readable stream.")
else:
    print("Note: exact line match not found, integrating raw file directly.")

dest1 = r"c:\Users\saisi\.antigravity-ide\renewable_energy_technology_dashboard\esp32\esp32_mppt_firmware\esp32_mppt_firmware.ino"
dest2_dir = r"c:\Users\saisi\.antigravity-ide\renewable_energy_technology_dashboard\esp32\DOC_METHOD_MPPT_ESP32_ROBUST"
dest2 = os.path.join(dest2_dir, "DOC_METHOD_MPPT_ESP32_ROBUST.ino")

os.makedirs(os.path.dirname(dest1), exist_ok=True)
os.makedirs(dest2_dir, exist_ok=True)

with open(dest1, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Successfully updated primary firmware: {dest1}")

with open(dest2, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Successfully saved standalone sketch: {dest2}")
