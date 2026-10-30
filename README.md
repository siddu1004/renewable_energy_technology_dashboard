# Renewable Energy Technology Dashboard & HelioTrack Solar MPPT Platform

Comprehensive full-stack engineering platform combining:
1. Physical Solar PV & 10 kHz DC Rheostatic Chopper Simulation in MATLAB/Simulink.
2. 2-State Extended Kalman Filter (EKF) Observer, Analytical Lambert-W Solver, and Tustin PI Regulator.
3. React, Vite, TypeScript, tRPC, Express, WebSockets, and SQLite Real-Time Web Dashboard.
4. ESP32 Dual-Core FreeRTOS Firmware with Native In-Browser WebSerial USB Telemetry.

Repository: https://github.com/siddardhvanguri-source/renewable_energy_technology_dashboard.git

================================================================================
TABLE OF CONTENTS
================================================================================
1. System Prerequisites
2. Option A: Installing from the ZIP File (Fastest Setup)
3. Option B: Installing via Git Clone (VS Code / Antigravity)
4. Adding the 1-Click Smart Desktop Icon
5. Running the MATLAB & Simulink Simulations (R2025a, R2025b, R2026a+)
6. Connecting Simulink Live Stream to the Web Dashboard
7. Connecting ESP32 Hardware via USB WebSerial
8. Repository Directory Structure
9. Troubleshooting and FAQ

================================================================================
1. SYSTEM PREREQUISITES
================================================================================
Before starting, ensure you have the following installed on your computer:
- Node.js (version 18.0.0 or higher): https://nodejs.org/
- MATLAB (version R2022b, R2023a/b, R2024a/b, R2025a, R2025b, or R2026a)
  Required Toolboxes: Simulink, Simscape, Simscape Electrical
- Optional for Git Clone: Git (https://git-scm.com/)
- Optional for Hardware: Arduino IDE (v2.0+) for ESP32 flashing

================================================================================
2. OPTION A: INSTALLING FROM THE ZIP FILE (FASTEST SETUP)
================================================================================

Step 1: Extract the ZIP File
Right-click `renewable_energy_technology_dashboard_CLEAN.zip` and select "Extract All..." to any folder on your computer (for example, `C:\Projects\renewable_energy_technology_dashboard`).

Step 2: Open the Extracted Folder in Terminal or VS Code / Antigravity
Open PowerShell or Command Prompt and navigate into the extracted project folder:

```bash
cd "C:\Path\To\renewable_energy_technology_dashboard"
```

(Or open the extracted folder directly inside VS Code or Antigravity IDE and open the integrated terminal with `Ctrl + ~`).

Step 3: Install Dependencies (Only required once)
```bash
npm install
```

Step 4: Start the Web Dashboard Server
```bash
npm run dev
```

When you see:
```text
Server running on http://localhost:3000/
```
Open Google Chrome or Microsoft Edge and go to:
http://localhost:3000

(Alternative 1-Click Start: You can also simply double-click `launch_dashboard.bat` inside the extracted folder. It automatically runs `npm install` if needed, starts the background server on port 3000, and opens `http://localhost:3000` in your browser).

================================================================================
3. OPTION B: INSTALLING VIA GIT CLONE (VS CODE / ANTIGRAVITY)
================================================================================

Open PowerShell, Command Prompt, or Terminal:

```bash
git clone https://github.com/siddardhvanguri-source/renewable_energy_technology_dashboard.git
cd renewable_energy_technology_dashboard
npm install
npm run dev
```

Then open http://localhost:3000 in Google Chrome or Microsoft Edge.

================================================================================
4. ADDING THE 1-CLICK SMART DESKTOP ICON
================================================================================

To add the custom **HelioTrack MPPT Dashboard** icon to your Windows Desktop:
1. Open the project folder in Windows File Explorer.
2. Double-click `add_to_desktop.bat`.
3. A shortcut named **HelioTrack MPPT Dashboard** with the custom HelioTrack solar icon will appear on your Desktop.
4. Anytime you double-click this Desktop icon, it automatically checks if port 3000 is running, starts the Node.js server in the background if it is down, and opens `http://localhost:3000` in your browser.

================================================================================
5. RUNNING THE MATLAB AND SIMULINK SIMULATIONS
================================================================================

Open MATLAB and navigate into the `matlab` folder inside your extracted project folder:

```matlab
cd("C:\Path\To\renewable_energy_technology_dashboard\matlab");
addpath(pwd);
```

Note for MATLAB R2025a and R2025b users:
Pre-exported native models for R2025a and R2025b are also available in:
`HELIOTRACK_MPPT_SIMULATION_PACKAGE\Version_Specific_Models\`

You have 3 simulation modes available:

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
6. CONNECTING SIMULINK LIVE STREAM TO THE WEB DASHBOARD
================================================================================

To see Simulink slider movements reflected live on the web dashboard:

1. Ensure the dashboard server is running (`npm run dev` or via the Desktop icon).
2. In MATLAB, inside the `matlab` folder, run:
```matlab
master_orchestrator('live')
```
(On Windows, you can alternatively double-click `matlab\run_live.bat`).

3. Open your browser to http://localhost:3000.
4. At the top of the dashboard, click the "MATLAB" or "DUAL (BOTH)" button in the source selector.
5. In Simulink, drag the Irradiance or Temperature sliders.
6. The web dashboard digital meters, power gauges, dynamic P-V curves, and ripple monitors update live at 15 Hz.
7. Press Ctrl+C in the MATLAB Command Window to stop streaming.

================================================================================
7. CONNECTING ESP32 HARDWARE VIA USB WEBSERIAL
================================================================================

If you are connecting physical ESP32 hardware:

1. Firmware Location:
   `esp32/esp32_mppt_firmware/esp32_mppt_firmware.ino`

2. Required Arduino Libraries:
   - Adafruit INA219
   - OneWire & DallasTemperature (for DS18B20)
   - ArduinoJson (v6+)

3. Uploading to ESP32:
   - Open `esp32/esp32_mppt_firmware/esp32_mppt_firmware.ino` in Arduino IDE.
   - Select Board: "ESP32 Dev Module", select your COM Port, and click "Upload".

4. Connecting to the Web Dashboard:
   - Plug the ESP32 into your PC via USB cable.
   - Open http://localhost:3000 in Google Chrome or Microsoft Edge.
   - Click the "Connect ESP32 (USB)" button at the top right of the dashboard.
   - Select your ESP32 COM port and click "Connect".
   - Live telemetry streams directly into the dashboard at 115200 baud.

================================================================================
8. REPOSITORY DIRECTORY STRUCTURE
================================================================================

```text
renewable_energy_technology_dashboard/
├── add_to_desktop.bat          # 1-click installer for Smart Desktop Shortcut
├── launch_dashboard.bat        # 1-click server auto-starter & browser launcher
├── client/                     # React frontend (Vite, TypeScript, Tailwind)
│   ├── public/                 # Static assets, HelioTrack icons & favicons
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
9. TROUBLESHOOTING AND FAQ
================================================================================

1. Problem: "npm error: Cannot find module"
   Solution: Ensure you are in the root folder containing `package.json` and run `npm install`.

2. Problem: "Port 3000 is busy"
   Solution: The server automatically picks the next available port (e.g. 3001) and prints it in the terminal.

3. Problem: "Simulink model error: Created in a newer version of Simulink"
   Solution: Open `HELIOTRACK_MPPT_SIMULATION_PACKAGE/Version_Specific_Models` and open the `_R2025a.slx` or `_R2025b.slx` model matching your MATLAB release.

4. Problem: "WebSerial button says 'Not Supported'"
   Solution: Use Google Chrome or Microsoft Edge.
