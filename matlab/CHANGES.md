# RC Chopper: model audit against CIRCUIT_AND_LOGIC_DESCRIPTION.txt

Base used: `Zero_Perturb_MPPT_Chopper.slx` (Build) and `Zero_Perturb_MPPT_Live.slx` (Live), both rebuilt.
Your files in Downloads are untouched, except `master_orchestrator.m`, which was edited in place.

## Verified results
| Check | Build (cloud transient, 2 s) | Live (410 W/m^2 slider default) |
|---|---|---|
| Compiles, no unconnected ports (all subsystems) | yes | yes |
| Tracking efficiency vs exact single-diode MPP | **97.58 %** (full Simscape run, 147 s) | **100.0 %** (3.19 W of 3.191 W, V = 17.6 V) |
| V_pv - V_mp_ref at end | 7 mV (inside the 40 mV deadband) | settled |
| Duty | 0.62 -> 0.23-0.28 (cloud) -> 0.51 | follows load |

## Circuit (matches doc section 4)
PV+ bus carries Cin (470 uF), the shunt/current sensor and the voltage sensors. The load path is
PV+ -> shunt -> **23.5 ohm** -> IRLZ44N drain, with the source on ground (low-side switch).
No inductor, no diode. Gate path: PWM comparator -> x5 gain (TC4420 5 V swing) -> MOSFET gate.

## Problems found and fixed
1. **Missing connections in `Zero_Perturb_MPPT_Chopper.slx`.** The PV source control input and the
   bus-voltage sensor output were unconnected, so the PV source injected 0 A and V_pv read 0 V. Reconnected.
2. **Gate signal was filtered into DC.** `S2P_Gate` had a 1 ms input filter against a 100 us PWM period,
   so the MOSFET never switched. Set to "zero input derivatives".
3. **Gate drive amplitude.** The 0/1 logic signal never exceeded the 2 V threshold. Added the x5 driver gain;
   MOSFET set to IRLZ44N values (Rds 22 mohm, Vth 1.5 V).
4. **Boost duty law.** The V_batt divide/subtract logic was boost-specific. Replaced by the doc's Tustin PI
   (e = V_pv - V_mp_ref, +-40 mV deadband, anti-windup clamp, slew limit, 12-bit duty), 10 kHz carrier.
5. **EKF did not match the doc.** Replaced with the doc's 2-state [I_ph, T_c] EKF: Ts 50 ms, tau 60 s,
   Q = diag(1e-6, 0.01), R = diag(1e-5, 0.05), full H with the gamma term, Joseph covariance update.
6. **PV plant parameters** set to the doc: Isc 0.55 A, Rs 0.25, Rsh 500, n 1.25. I0 refitted to 1.7846 nA
   so that Voc = 22.5 V (the old 1.2 nA gave 22.95 V). MPPT tick 50 ms; safety clamp 5-22.5 V.
7. **Orchestrator** now reads the model's logged outputs and scores against the exact MPP. The old fallback
   produced a synthetic number. MaxStep 1e-5 -> 2e-6 (10 kHz PWM), R 23.5 ohm.

## Decisions for you
- **R_load = 23.5 ohm** (doc: 2 x 47 ohm in parallel). Your earlier message said 23.7 ohm. One value to change
  in `Resistor`, and `Chopper.R` in the orchestrator, if 23.7 is what you built.
- **Lambert-W:** the doc's closed form is off from the true MPP by +0.3 V at 1000 W/m^2 and ~+1 V at
  200 W/m^2 with Rs = 0.25 ohm and Rsh = 500 ohm. It is kept as the seed, then refined with 3 Newton steps on
  the exact Lambert-W current (bounded run time).
- **PI presets** (`PI_Preset` in the base workspace, default `'sun'`):
  - `'bench'` = doc constants (Kp 1.2, Ki 0.5, 600-count clamp, 1 count/50 ms). On the cloud profile this gives
    only 87.7 % in my averaged test, because 600 counts is 14.6 % duty and full sun needs ~63 %.
  - `'sun'` = Kp 100, Ki 2500, clamp 3900, slew 1000 counts/tick (the setting used for the results above).
- **Doc inconsistency:** with Rsh = 500 ohm the panel leaks ~30 mA at 15 V, more than the ~25 mA lamp photocurrent,
  so the doc's indoor-bench numbers (14.8 V / 18 mA) cannot come out of its own single-diode parameters.
  The nominal 19.25 V / 0.52 A / 10 W point is not reproduced either: this parameter set peaks at 19.0 V / 0.48 A / 9.2 W.
- Cin stays across the panel (needed so the ideal PV current source has a path while the switch is off).

## Live dashboard and layout check
- **Wiring:** gauge 1 = V_pv (0-25 V), gauge 2 = P_pv (0-15 W), sliders = irradiance and ambient temperature.
  All four were bound correctly; ranges suit the 22.5 V / 10 W panel.
- **Slider range:** irradiance 200-1200 -> **50-1200 W/m^2** so lamp-level light can be set.
  Verified at both ends: 99.9 % of the exact MPP at 50 W/m^2 (0.095 W at 6.9 V) and at 1200 W/m^2 (11.15 W at 18.95 V).
- **Captions:** added readable text captions with units (the auto captions still show raw signal names such as
  `P2S_V_pv:1`; I could not change those programmatically).
- **Layout:** the new gate-gain block, `S2P_Gate`, a delay and a scope were stacked on each other, and some wires ran
  diagonally. Blocks moved apart and wires made orthogonal. Connectivity re-checked (no unconnected ports) and
  results unchanged: Build 97.58 %, Live 3.19 W at 410 W/m^2.
- Previews are in `screenshots/`. They were rendered by MATLAB's print function, not the live editor, so check the
  dashboard once in Simulink before presenting.

## Files
- `Zero_Perturb_MPPT_Build.slx`, `Zero_Perturb_MPPT_Live.slx`, `master_orchestrator.m`, `screenshots/`
- `source/`: `EKF_Algorithm.m`, `PI_Duty.m` (the chart scripts), `apply_spec.m`, `build_*.m` (reproduce the edits),
  `chopper_avg.m` (fast averaged model used to tune the PI gains)

Run: `cd` to this folder, `open_system('Zero_Perturb_MPPT_Build')`, then `master_orchestrator`.
