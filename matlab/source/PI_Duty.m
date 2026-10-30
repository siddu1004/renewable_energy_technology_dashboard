function duty = PI_Duty(V_pv, V_mp_ref)
    % Discrete Tustin bilinear PI (CIRCUIT_AND_LOGIC_DESCRIPTION s5.3), output = PWM duty (0..1)
    % e = V_pv - V_mp_ref : e>0 -> raise duty (load pulls the panel voltage down)
    persistent e_prev u_pi active
    if isempty(active)
        e_prev = 0.0;
        u_pi   = PI_Duty0;
        active = PI_Duty0;
    end
    e = V_pv - V_mp_ref;
    if abs(e) > PI_Vdb                                   % anti-hunting deadband (frozen inside)
        u_pi = u_pi + PI_Kp * (e - e_prev) + PI_Ki * (PI_Ts / 2.0) * (e + e_prev);
    end
    e_prev = e;
    u_pi   = min(max(u_pi, 0.0), PI_Umax);               % anti-windup clamp [0, Umax] counts
    active = active + min(max(u_pi - active, -PI_Slew), PI_Slew);   % slew limit counts/tick
    duty   = round(active) / 4095.0;                     % 12-bit LEDC resolution
end
