% chopper_avg.m - fast averaged model of the PV -> Cin -> low-side MOSFET -> R_load chopper
% with the doc's control chain (EKF -> Lambert-W -> Tustin PI w/ deadband+slew, 50 ms tick).
% Used to tune/validate the PI presets before porting them into Simulink.
%   [res] = chopper_avg(preset)   preset: struct(Kp,Ki,Vdb,Umax,Slew,Duty0)
function res = chopper_avg(p, verbose)
  if nargin<2, verbose = true; end
  here = fileparts(mfilename('fullpath')); addpath(fullfile(here,'ekf_src'));
  clear EKF_Algorithm
  k=1.380649e-23; q=1.60217663e-19; Eg=1.12; T0=298.15;
  Ns=36; n=1.25; Rs=0.25; Rsh=500; Isc=0.55; I0r=1.7846e-9; alpha=0.000325;
  RL=23.5; Ts=0.05; Tsim=2.0; dt=0.005; rng(2);
  prof = @(t) cloud(t);
  N = round(Tsim/dt)+1;
  t=zeros(N,1); G=t; V=t; I=t; Pp=t; Pm=t; D=t; Vref=t; Tc=t;
  tc = 28.0; active = p.Duty0; u_pi = p.Duty0; e_prev = 0; Vr = 19;
  nextTick = 0; vm_prev = 19.0;
  for kk=1:N
    tk=(kk-1)*dt; [g,tamb]=prof(tk);
    % thermal plant (Stage1): Tc' = (Tamb + 0.022*G - Tc)/60
    tc = tc + dt*((tamb + 0.022*g - tc)/60);
    Tk = tc+273.15; Iph = g/1000*(Isc + alpha*(tc-25));
    I0 = I0r*(Tk/T0)^3*exp(q*Eg/(n*k)*(1/T0-1/Tk)); a = Ns*n*k*Tk/q;
    duty = round(active)/4095;
    % averaged operating point: I_pv(V) = duty*V/RL
    lo=1e-3; hi=22.6;
    for it=1:60
      mid=(lo+hi)/2; if ivx(mid,Iph,I0,a,Rs,Rsh) - duty*mid/RL > 0, lo=mid; else, hi=mid; end
    end
    v=(lo+hi)/2; i=ivx(v,Iph,I0,a,Rs,Rsh);
    % exact MPP for scoring
    vv=linspace(0.1,22.5,900); ii=arrayfun(@(x) ivx(x,Iph,I0,a,Rs,Rsh),vv); pm=max(vv.*ii);
    % control tick (50 ms)
    if tk >= nextTick - 1e-12
      nextTick = nextTick + Ts;
      vm = v + 0.005*randn; im = i + 0.0003*randn; tm = tc + 0.2*randn;
      Vr = EKF_Algorithm(vm, im, tm, tamb);
      e = vm_prev - Vr;            % PI sees the V_pv sample from the previous tick (loop-breaker Unit Delay)
      vm_prev = vm;
      if abs(e) > p.Vdb
        u_pi = u_pi + p.Kp*(e - e_prev) + p.Ki*(Ts/2)*(e + e_prev);
      end
      e_prev = e;
      u_pi = min(max(u_pi, 0), p.Umax);
      active = active + min(max(u_pi - active, -p.Slew), p.Slew);
    end
    t(kk)=tk; G(kk)=g; V(kk)=v; I(kk)=i; Pp(kk)=v*i; Pm(kk)=pm; D(kk)=duty; Vref(kk)=Vr; Tc(kk)=tc;
  end
  res.eta = trapz(t,Pp)/trapz(t,Pm)*100;
  res.t=t; res.V=V; res.Vref=Vref; res.P=Pp; res.Pm=Pm; res.D=D; res.G=G;
  w = t>=0.30 & t<=0.39; res.verr_pre = mean(abs(V(w)-Vref(w)));
  w = t>=1.8;            res.verr_end = mean(abs(V(w)-Vref(w)));
  if verbose
    fprintf('eta=%.2f%%  |V-Vref| @0.3-0.39s=%.3f V  @end=%.3f V  duty[min max]=[%.3f %.3f]\n', ...
      res.eta, res.verr_pre, res.verr_end, min(D), max(D));
  end
end

function [g,tamb] = cloud(t)
  if     t<0.40, g = 1000;
  elseif t<0.45, g = 1000 - 550*((t-0.40)/0.05);
  elseif t<1.00, g = 450;
  elseif t<1.40, g = 450 + 400*((t-1.00)/0.40);
  else,          g = 850 + 10*sin(2*pi*5*t);
  end
  tamb = 25 + 3*(1-exp(-t/0.8));
end

function I = ivx(V,Iph,I0,a,Rs,Rsh)
  arg = (Rs*I0*Rsh/((Rsh+Rs)*a))*exp((Rsh*(Rs*(Iph+I0)+V))/((Rsh+Rs)*a));
  if arg<1, w = arg*(1-arg+1.5*arg^2); else, l=log(arg); w=l-log(max(l,1e-9)); end
  for j=1:6, ew=exp(w); f=w*ew-arg; w=w-f/max(ew*(w+1)-(w+2)*f/(2*w+2),1e-300); end
  I = max((Rsh*(Iph+I0)-V)/(Rsh+Rs) - (a/Rs)*w, 0);
end
