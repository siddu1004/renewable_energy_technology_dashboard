function [V_mp_ref, I_ph_est, T_c_est] = EKF_Algorithm(V_pv_meas, I_pv_meas, T_c_meas, T_amb)
    % 2-state EKF [I_ph; T_c(degC)] + Lambert-W MPP, per CIRCUIT_AND_LOGIC_DESCRIPTION s5.1/5.2
    persistent x_est P_est is_initialized Param

    if isempty(is_initialized)
        Param.Voc = 22.5;  Param.I0 = 1.7846e-9;           % I0 fitted so Voc(STC)=22.5 V
        Param.Rs  = 0.25;  Param.Rsh = 500.0;  Param.n = 1.25;  Param.Ns = 36;
        Param.Ts  = 0.05;  Param.tau_th = 60.0;
        Param.Q = [1.0e-6, 0.0; 0.0, 0.01];
        Param.R = [1.0e-5, 0.0; 0.0, 0.05];
        x_est = [0.40; 28.0];
        P_est = [1.0e-2, 0.0; 0.0, 1.0];
        is_initialized = true;
    end

    q = 1.60217663e-19; k = 1.380649e-23; Eg = 1.12; T0 = 298.15;
    Ts = Param.Ts; tau = Param.tau_th;

    % ---- Prediction: Iph random walk, Newtonian thermal convection ----
    F = [1.0, 0.0; 0.0, 1.0 - Ts / tau];
    x_pred = [x_est(1); x_est(2) + (Ts / tau) * (T_amb - x_est(2))];
    P_pred = F * P_est * F' + Param.Q;

    % ---- Measurement model h(x) = single-diode current ----
    Tk  = x_pred(2) + 273.15;
    Vt  = Param.Ns * Param.n * k * Tk / q;                 % collective thermal voltage
    I0T = Param.I0 * (Tk / T0)^3 * exp((q * Eg / (Param.n * k)) * (1.0 / T0 - 1.0 / Tk));
    Vj  = V_pv_meas + I_pv_meas * Param.Rs;
    ex  = exp(min(max(Vj / Vt, -20.0), 40.0));
    h1  = x_pred(1) - I0T * (ex - 1.0) - Vj / Param.Rsh;

    % dh1/dTc (gamma)
    dI0   = I0T * (3.0 / Tk + q * Eg / (Param.n * k * Tk^2));
    gamma = -dI0 * (ex - 1.0) + I0T * ex * Vj / (Vt * Tk);
    H = [1.0, gamma; 0.0, 1.0];

    innov = [I_pv_meas - h1; T_c_meas - x_pred(2)];
    S = H * P_pred * H' + Param.R;
    K = (P_pred * H') / S;
    x_est = x_pred + K * innov;
    x_est(1) = max(x_est(1), 0.0);
    x_est(2) = min(max(x_est(2), -20.0), 120.0);
    IKH = eye(2) - K * H;
    P_est = IKH * P_pred * IKH' + K * Param.R * K';       % Joseph form

    % ---- Lambert-W MPP at the estimated states ----
    Tk  = x_est(2) + 273.15;
    Vt  = Param.Ns * Param.n * k * Tk / q;
    I0h = Param.I0 * (Tk / T0)^3 * exp((q * Eg / (Param.n * k)) * (1.0 / T0 - 1.0 / Tk));
    Iph = x_est(1);
    th  = Param.Rsh / (Param.Rs + Param.Rsh);

    % doc closed form (seed): z, asymptotic guess, one Halley pass
    z  = th * ((Iph + I0h) / I0h) * exp(1.0 + th * Param.Rs * (Iph + I0h) / Vt);
    L1 = log(z); L2 = log(L1); w = L1 - L2 + L2 / L1;
    ew = exp(w); f = w * ew - z;
    w  = w - f / (ew * (w + 1.0) - (w + 2.0) * f / (2.0 * (w + 1.0)));
    V  = (Vt / th) * (w - 1.0) - Param.Rs * Iph;

    % exact refinement: 3 Newton steps on dP/dV = I + V*dI/dV using exact Lambert-W I(V)
    for it = 1:3
        f0 = dpdv(V,       Iph, I0h, Vt, Param.Rs, Param.Rsh);
        f1 = dpdv(V + 1e-3, Iph, I0h, Vt, Param.Rs, Param.Rsh);
        df = (f1 - f0) / 1e-3;
        if df < -1e-9
            V = V - f0 / df;
        end
        V = min(max(V, 3.0), Param.Voc);
    end

    V_mp_ref = min(max(V, 5.0), Param.Voc);
    I_ph_est = x_est(1);
    T_c_est  = x_est(2);
end

function f = dpdv(V, Iph, I0, Vt, Rs, Rsh)
    % dP/dV = I(V) + V*dI/dV for the single-diode model solved with Lambert W
    arg = (Rs * I0 * Rsh / ((Rsh + Rs) * Vt)) * exp(Rsh * (Rs * (Iph + I0) + V) / ((Rsh + Rs) * Vt));
    W   = lambertw0(arg);
    I   = (Rsh * (Iph + I0) - V) / (Rsh + Rs) - (Vt / Rs) * W;
    dI  = -1.0 / (Rsh + Rs) - (Rsh / (Rs * (Rsh + Rs))) * W / (1.0 + W);
    f   = I + V * dI;
end

function w = lambertw0(x)
    % principal branch for x >= 0, Halley iteration
    if x < 1.0
        w = x * (1.0 - x + 1.5 * x * x);
    else
        l = log(x); w = l - log(max(l, 1.0e-9));
    end
    for i = 1:6
        ew = exp(w); f = w * ew - x;
        w = w - f / max(ew * (w + 1.0) - (w + 2.0) * f / (2.0 * w + 2.0), 1.0e-300);
    end
end
