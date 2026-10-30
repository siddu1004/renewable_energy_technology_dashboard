# Renewable Energy Technology Dashboard & HelioTrack Solar MPPT Platform

Comprehensive full-stack engineering platform combining:
1. Physical Solar PV & 10 kHz DC Rheostatic Chopper Simulation in MATLAB/Simulink.
2. 2-State Extended Kalman Filter (EKF) Observer, Analytical Lambert-W Solver, and Tustin PI Regulator.
3. React 18, Vite, TypeScript, tRPC, Express, WebSockets, and SQLite Real-Time Web Dashboard.
4. ESP32 Dual-Core FreeRTOS Firmware with Native In-Browser WebSerial USB Telemetry.

Repository: https://github.com/siddardhvanguri-source/renewable_energy_technology_dashboard.git

================================================================================
TABLE OF CONTENTS
================================================================================
1. System Prerequisites
2. Step 1: Git Clone and IDE Setup (VS Code / Antigravity)
3. Step 2: Web Dashboard Setup and Execution
4. Step 3: MATLAB and Simulink Simulation Execution
5. Step 4: Connecting Simulink Live Stream to the Web Dashboard
6. Step 5: ESP32 Hardware Firmware Setup and WebSerial Connection
7. Repository File and Directory Structure
8. Troubleshooting and FAQ

================================================================================
1. SYSTEM PREREQUISITES
================================================================================
Before starting, ensure you have the following installed on your computer:
- Git: https://git-scm.com/
- Node.js (version 18.0.0 or higher): https://nodejs.org/
- MATLAB (version R2022b, R2023a/b, R2024a/b, R2025a, R2025b, or R2026a)
  Required Toolboxes: Simulink, Simscape, Simscape Electrical
- Optional for Hardware: Arduino IDE (v2.0+) or VS Code PlatformIO extension (for ESP32 flashing)

================================================================================
2. STEP 1: GIT CLONE AND IDE SETUP (VS CODE / ANTIGRAVITY)
================================================================================

Open PowerShell, Command Prompt, or Terminal on your computer:

```bash
git clone https://github.com/siddardhvanguri-source/renewable_energy_technology_dashboard.git
cd renewable_energy_technology_dashboard
```

To open in Visual Studio Code:
```bash
code .
```

To open in Antigravity IDE:
Open Antigravity IDE, select "Open Folder", and choose the cloned folder:
`renewable_energy_technology_dashboard`

================================================================================
3. STEP 2: WEB DASHBOARD SETUP AND EXECUTION
================================================================================

In the terminal inside your cloned repository folder, run:

1. Install project dependencies (only required the first time):
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. When you see:
```text
Server running on http://localhost:3000/
```
Open Google Chrome or Microsoft Edge and navigate to:
http://localhost:3000

The web dashboard is now running and ready to receive real-time data from either Simulink or ESP32 hardware.

================================================================================
4. STEP 3: MATLAB AND SIMULINK SIMULATION EXECUTION
================================================================================

Open MATLAB and navigate into the `matlab` folder inside your cloned repository:

```matlab
cd("c:\Your\Path\To\renewable_energy_technology_dashboard\matlab");
addpath(pwd);
```

You now have 3 simulation modes available:

--------------------------------------------------------------------------------
MODE A: Automated Batch MPPT Simulation (1-Click Run)
--------------------------------------------------------------------------------
In the MATLAB Command Window, run:

```matlab
master_orchestrator
```

What happens:
- Configures the 10W PV array parameters (Voc = 22.5V, Vmp = 19.25V, Isc = 0.55A, Imp = 0.52A).
- Injects dynamic cloud shading steps (400 -> 1000 -> 700 W/m^2).
- Simulates the 23.7 Ohm DC rheostatic chopper and EKF observer using the ode23t solver.
- Calculates and displays MPPT tracking efficiency (Target: >= 96%) and Section 7 voltage error.
- Opens a 4-pane telemetry plot of PV voltage, current, power, and duty cycle.

--------------------------------------------------------------------------------
MODE B: Interactive Live Simulation with On-Canvas Sliders
--------------------------------------------------------------------------------
In the MATLAB Command Window, run:

```matlab
open_system('Zero_Perturb_MPPT_Live')
```

How to operate:
1. In the Simulink toolbar, click the green "Run" button (runs in real-time paced at 1x speed).
2. On the Simulink canvas, drag the sliders:
   - Slider (Irradiance): 0 to 1200 W/m^2
   - Slider1 (Temperature): 0 to 60 deg C
3. Observe the live scopes, circular gauges, and EKF outputs updating with zero hunting.
4. Click "Stop" when done.

--------------------------------------------------------------------------------
MODE C: Multi-Algorithm Benchmark Comparison
--------------------------------------------------------------------------------
In the MATLAB Command Window, run:

```matlab
benchmark_mppt_comparison
```

What happens:
- Runs Perturb & Observe (P&O), Incremental Conductance (INC), Fractional Voc, Fractional Isc, Hill Climbing, and HelioTrack EKF under identical sensor noise (+- 35 mV) and irradiance ramps.
- Prints a side-by-side performance table.
- Generates `mppt_benchmark_comparison_graph.png`.
- Exports numerical data to `mppt_benchmark_comparison_data.csv`.

================================================================================
5. STEP 4: CONNECTING SIMULINK LIVE STREAM TO THE WEB DASHBOARD
================================================================================

To see Simulink slider movements reflected live on the web dashboard:

1. Make sure the dashboard server is running in terminal:
```bash
npm run dev
```

2. In MATLAB, navigate to `matlab/` and run:
```matlab
master_orchestrator('live')
```
(On Windows, you can alternatively double-click `matlab/run_live.bat`).

3. Open your browser to http://localhost:3000.
4. At the top of the dashboard, click the "MATLAB" or "DUAL" button in the source selector.
5. In Simulink, drag the Irradiance or Temperature sliders.
6. The web dashboard digital meters, power gauges, dynamic P-V curves, and ripple monitors update live at 15 Hz.
7. Press Ctrl+C in MATLAB Command Window to stop streaming.

================================================================================
6. STEP 5: ESP32 HARDWARE FIRMWARE SETUP AND WEBSERIAL CONNECTION
================================================================================

If you are connecting physical ESP32 hardware:

1. Firmware Location:
   The source code is located at:
   `esp32/esp32_mppt_firmware/esp32_mppt_firmware.ino`

2. Required Arduino Libraries:
   - Adafruit INA219
   - OneWire & DallasTemperature (for DS18B20)
   - ArduinoJson (v6+)

3. Uploading to ESP32:
   - Open `esp32/esp32_mppt_firmware/esp32_mppt_firmware.ino` in Arduino IDE.
   - Select Board: "ESP32 Dev Module".
   - Select your COM Port and click "Upload".

4. Connecting to the Web Dashboard (No software install required):
   - Connect the ESP32 to your PC via USB cable.
   - Open http://localhost:3000 in Google Chrome or Microsoft Edge.
   - Click the green "Connect ESP32 via USB Serial" button on the dashboard.
   - Select your ESP32 COM port and click "Connect".
   - The dashboard reads raw high-speed telemetry directly via native WebSerial at 115200 baud.

================================================================================
7. REPOSITORY DIRECTORY STRUCTURE
================================================================================

```text
renewable_energy_technology_dashboard/
├── client/                     # React 18 frontend (Vite, TypeScript, Tailwind)
│   ├── public/                 # Static assets, SVG brand icon & favicons
│   ├── src/
│   │   ├── pages/Home.tsx      # Main real-time telemetry dashboard interface
│   │   ├── components/         # Engineering charts, digital dials, liquid cards
│   │   └── lib/telemetry.ts    # Telemetry normalization and streaming logic
├── server/                     # Backend API & WebSocket servers
│   ├── _core/index.ts          # Main Express server entrypoint (Port 3000)
│   ├── matlabTransport.ts      # HTTP and WebSocket ingestion for Simulink live frames
│   ├── esp32Transport.ts       # ESP32 WebSocket and raw serial parser
│   └── db.ts                   # SQLite local database persistence
├── matlab/                     # Power stage simulation and control models
│   ├── Zero_Perturb_MPPT_Chopper.slx  # Batch simulation model (R2025a/b compatible)
│   ├── Zero_Perturb_MPPT_Live.slx     # Real-time interactive model with sliders
│   ├── master_orchestrator.m          # Master simulation runner & live streamer
│   ├── benchmark_mppt_comparison.m    # 6-algorithm benchmark comparison engine
│   ├── setup_live_simulink_bridge.m   # Pacing and live connection setup
│   └── run_live.bat                   # 1-click Windows streamer launcher
├── esp32/                      # Microcontroller firmware
│   └── esp32_mppt_firmware/    # FreeRTOS C++ dual-core MPPT firmware
└── package.json                # Project dependencies and script runner
```

================================================================================
8. TROUBLESHOOTING AND FAQ
================================================================================

1. Problem: "npm error: Cannot find module"
   Solution: Ensure you are in the root directory containing `package.json` before running `npm install`.

2. Problem: "Port 3000 is busy"
   Solution: The server will automatically pick the next available port (e.g. 3001) and print it in the console.

3. Problem: "Simulink model error: Version mismatch" in MATLAB R2025a or R2025b
   Solution: Open `HELIOTRACK_MPPT_SIMULATION_PACKAGE/Version_Specific_Models` which has files exported explicitly for R2025a and R2025b.

4. Problem: "WebSerial button says 'Not Supported'"
   Solution: WebSerial is supported natively in Google Chrome, Microsoft Edge, and Opera. Firefox does not support WebSerial.
