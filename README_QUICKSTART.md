# HelioTrack Solar MPPT System - Quickstart & Execution Guide

Target System: 10W PV Panel (Voc = 22.5V, Vmp = 19.25V, Isc = 0.55A, Imp = 0.52A)
Power Stage: 10 kHz PWM DC Rheostatic Chopper (R_load = 23.7 Ohm, Cin = 470 uF)
Controller: ESP32 SoC with 2-State EKF Observer ([I_ph, T_c]^T), Lambert-W Solver, and Tustin PI
Compatibility: MATLAB R2022b, R2023a/b, R2024a/b, R2025a, R2025b, R2026a

================================================================================
SECTION 1: UNPACKING AND MATLAB SETUP
================================================================================

1. Extract the file HELIOTRACK_MPPT_SIMULATION_PACKAGE.zip to your computer.
   Example path: C:\Projects\HelioTrack_MPPT

2. Open MATLAB.

3. In the MATLAB Command Window, navigate to your extracted folder and add it to path:

```matlab
cd("C:\Projects\HelioTrack_MPPT");
addpath(pwd);
```

================================================================================
SECTION 2: RUNNING THE MATLAB SIMULATION MODELS
================================================================================

METHOD A: Automated Batch MPPT Simulation (Evaluates 10W Panel & Tracking Efficiency)
Copy and paste this into the MATLAB Command Window:

```matlab
master_orchestrator
```

What it does:
- Simulates dynamic cloud irradiance steps (400 -> 1000 -> 700 W/m^2).
- Verifies MPPT tracking efficiency (Target: >= 96%).
- Verifies voltage convergence error (Target: < 2.0%).
- Opens a 4-pane telemetry plot of PV voltage, current, power, and duty cycle.

--------------------------------------------------------------------------------

METHOD B: Interactive Live Simulation with Sliders
Copy and paste this into the MATLAB Command Window:

```matlab
open_system('Zero_Perturb_MPPT_Live')
```

How to run:
1. In the Simulink window, click the green "Run" button.
2. While running at 1x real-time speed, drag the on-canvas sliders:
   - Slider (Irradiance): 0 to 1200 W/m^2
   - Slider1 (Temperature): 0 to 60 deg C
3. Watch the scopes, gauges, and EKF state estimates respond in real time without hunting.
4. Click "Stop" when done.

--------------------------------------------------------------------------------

METHOD C: Multi-Algorithm Benchmark Comparison
Copy and paste this into the MATLAB Command Window:

```matlab
benchmark_mppt_comparison
```

What it does:
- Simulates P&O, Incremental Conductance, FOCV, FSCC, Hill Climbing, and HelioTrack EKF.
- Generates mppt_benchmark_comparison_graph.png.
- Exports numerical data to mppt_benchmark_comparison_data.csv.

================================================================================
SECTION 3: INSTALLING AND LAUNCHING THE WEB DASHBOARD
================================================================================

PREREQUISITES:
- Node.js (v18.0.0 or higher) installed on your system.

STEP 1: Open Command Prompt or PowerShell and go to the project folder:

```powershell
cd "c:\Users\saisi\.antigravity-ide\renewable_energy_technology_dashboard"
```

STEP 2: Install dependencies (run once):

```powershell
npm install
```

STEP 3: Start the local server:

```powershell
npm run dev
```

STEP 4: Open your web browser and navigate to:

http://localhost:3000

================================================================================
SECTION 4: CONNECTING SIMULINK LIVE SIMULATION TO THE WEB DASHBOARD
================================================================================

To stream real-time telemetry from Simulink directly to http://localhost:3000:

1. Keep the web dashboard server running in terminal (`npm run dev`).
2. Open MATLAB, navigate to the simulation package folder, and run:

```matlab
master_orchestrator('live')
```

(Or double-click `run_live.bat` in Windows Explorer).

3. In your web browser at http://localhost:3000:
   - Click the "MATLAB" or "DUAL" button in the top source selector bar.
   - Now in Simulink, move the Irradiance or Temperature slider.
   - The web dashboard charts, gauges, and EKF telemetry will update live at 15 Hz.
4. To stop streaming, press Ctrl+C in the MATLAB Command Window.

================================================================================
SECTION 5: TROUBLESHOOTING
================================================================================

1. Error: "Undefined function or variable 'master_orchestrator'"
   Fix: Check your MATLAB Current Folder toolbar on the left. It must point to the folder containing master_orchestrator.m.

2. Warning: "Model was created in a newer version" (When using MATLAB R2025a or R2025b)
   Fix: Open the folder named `Version_Specific_Models` inside the package and open:
   - Zero_Perturb_MPPT_Chopper_R2025a.slx (for R2025a)
   - Zero_Perturb_MPPT_Chopper_R2025b.slx (for R2025b)

3. Error: "License checkout failed for Simscape_Electrical"
   Fix: Ensure Simscape and Simscape Electrical toolboxes are installed. Test in MATLAB with:
   license('test', 'Simscape_Electrical')
