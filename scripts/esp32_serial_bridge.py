"""
ESP32 USB Serial Telemetry Bridge Script
Reads JSON telemetry lines from USB-connected ESP32 (e.g. COM3, COM4, /dev/ttyUSB0)
and posts them to the local MPPT Dashboard server at http://localhost:3000/api/telemetry/esp32
"""

import sys
import time
import json
import urllib.request

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("pyserial package not found. Installing pyserial...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyserial"])
    import serial
    import serial.tools.list_ports

SERVER_URL = "http://localhost:3000/api/telemetry/esp32"
BAUD_RATE = 115200

def find_esp32_port():
    ports = serial.tools.list_ports.comports()
    print("Available Serial Ports:")
    for p in ports:
        print(f" - {p.device}: {p.description}")
        if "CP210" in p.description or "CH340" in p.description or "USB" in p.description or "ESP32" in p.description:
            return p.device
    if ports:
        return ports[0].device
    return None

def main():
    port_name = find_esp32_port()
    if not port_name:
        print("Error: No USB serial device detected. Please connect your ESP32 via USB!")
        sys.exit(1)
    
    print(f"\nOpening USB Serial port {port_name} at {BAUD_RATE} baud...")
    try:
        ser = serial.Serial(port_name, BAUD_RATE, timeout=2)
    except Exception as e:
        print(f"Could not open port {port_name}: {e}")
        sys.exit(1)
        
    print(f"Connected to ESP32 on {port_name}!")
    print(f"Forwarding telemetry to {SERVER_URL}...\n")

    count = 0
    while True:
        try:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if not line:
                continue
            
            payload = None
            if line.startswith("{") and line.endswith("}"):
                try:
                    payload = json.loads(line)
                except Exception as json_err:
                    print(f"JSON decode warning: {json_err}")
            elif "V_op:" in line:
                import re
                try:
                    v_match = re.search(r"V_op:\s*([0-9.]+)", line)
                    i_match = re.search(r"I_op:\s*([0-9.]+)", line)
                    p_match = re.search(r"P:\s*([0-9.]+)", line)
                    d_match = re.search(r"Duty:\s*([0-9.]+)", line)
                    t_match = re.search(r"Temp:\s*([0-9.]+)", line)
                    if v_match and i_match:
                        v = float(v_match.group(1))
                        i = float(i_match.group(1))
                        p = float(p_match.group(1)) if p_match else v * i
                        d = int(d_match.group(1)) if d_match else 512
                        t = float(t_match.group(1)) if t_match else 25.0
                        payload = {"v_pv": v, "i_pv": i, "p_pv": p, "duty": d, "t_c": t, "timestampMs": int(time.time() * 1000)}
                except Exception as regex_err:
                    pass

            if payload:
                try:
                    data = json.dumps(payload).encode('utf-8')
                    req = urllib.request.Request(
                        SERVER_URL,
                        data=data,
                        headers={'Content-Type': 'application/json'}
                    )
                    with urllib.request.urlopen(req, timeout=2) as response:
                        res = response.read().decode('utf-8')
                        count += 1
                        print(f"[{count}] Frame forwarded -> P={payload.get('p_pv', 0)}W, V={payload.get('v_pv', 0)}V, D={payload.get('duty', 0)}")
                except Exception as post_err:
                    print(f"Error posting frame: {post_err}")
            else:
                print(f"[ESP32 message]: {line}")

        except KeyboardInterrupt:
            print("\nBridge stopped by user.")
            break
        except Exception as err:
            print(f"Serial read error: {err}")
            time.sleep(1)

    ser.close()

if __name__ == "__main__":
    main()
