% apply_spec.m - apply the CIRCUIT_AND_LOGIC_DESCRIPTION changes to an already-loaded chopper model
% (power-stage values, PV plant, 50 ms MPPT tick, EKF + Lambert-W, Tustin-PI duty law, 10 kHz PWM).
function apply_spec(mdl, breaker, maxstep)
  root = fileparts(mfilename('fullpath'));

  % ---------- power stage values ----------
  set_param([mdl '/Resistor'],'R','23.5');
  set_param([mdl '/Capacitor'],'c','470e-6');
  mos = find_system(mdl,'SearchDepth',1,'RegExp','on','Name','^MOSFET');
  set_param(mos{1},'Rds','0.022','Vth','1.5');                     % IRLZ44N
  % gate path: drop the 1 ms input filter (it low-passed the 10 kHz PWM into DC) + 5 V TC4420 swing
  set_param([mdl '/S2P_Gate'],'FilteringAndDerivatives','zero');
  phg = get_param([mdl '/S2P_Gate'],'PortHandles');
  Lg  = get_param(phg.Inport(1),'Line'); srcp = get_param(Lg,'SrcPortHandle');
  delete_line(Lg);
  add_block('simulink/Math Operations/Gain',[mdl '/TC4420_5V'],'Gain','5','Position',[1440 425 1470 445]);
  phk = get_param([mdl '/TC4420_5V'],'PortHandles');
  add_line(mdl, srcp, phk.Inport(1), 'autorouting','on');
  add_line(mdl, phk.Outport(1), phg.Inport(1), 'autorouting','on');

  % ---------- PV plant (Stage1-4) ----------
  set_param([mdl '/Stage1_Thermal_Dynamics/Gain_Inv_Tau'],'Gain','1/60');
  set_param([mdl '/Stage2_Parameter_Scaling/Bias_Add_Isc'],'Bias','0.55');
  set_param([mdl '/Stage2_Parameter_Scaling/Fcn_I0'],'Expr', ...
      '1.7846e-9 * (u[1]/298.15)^3 * exp(10397.6 * (1/298.15 - 1/u[1]))');
  set_param([mdl '/Stage3_Electrical_Core/Gain_Inv_Rsh'],'Gain','1/500');
  set_param([mdl '/Stage3_Electrical_Core/Gain_Rs'],'Gain','0.25');
  set_param([mdl '/Stage3_Electrical_Core/Memory_I_est'],'InitialCondition','0.55');
  set_param([mdl '/Stage4_Output_Conditioning/Sat_I_pv'],'UpperLimit','0.60');

  % ---------- MPPT wrapper: 50 ms tick ----------
  zp = [mdl '/Zero_Perturb_MPPT'];
  for b = {'ADC_Delay_1','ADC_Delay_2'}
    try, set_param([zp '/' b{1}],'SampleTime','0.05'); catch, end
  end
  for b = {'ZOH1','ZOH2','ZOH3','ZOH4'}, set_param([zp '/' b{1}],'SampleTime','0.05'); end
  set_param([zp '/Safety_Limit'],'UpperLimit','22.5','LowerLimit','5.0');
  set_param([zp '/Memory_Break_Loop'],'InitialCondition','19');

  % ---------- EKF chart script ----------
  rt = sfroot;
  ch = rt.find('-isa','Stateflow.EMChart','Path',[zp '/EKF_Algorithm']);
  if isempty(ch), error('EKF chart not found'); end
  ch(1).Script = fileread(fullfile(root,'ekf_src','EKF_Algorithm.m'));
  fprintf('EKF chart script replaced (%d chars)\n', numel(ch(1).Script));

  % ---------- Duty generator -> Tustin PI ----------
  dg = [mdl '/Duty_Cycle_PWM_Generator'];
  lns = find_system(dg,'SearchDepth',1,'FindAll','on','Type','Line');
  for i=1:numel(lns), try, delete_line(lns(i)); catch, end, end
  for nm = {'Constant_1','Denom_Clamp','Divide','Duty_Limit','Subtract'}
    delete_block([dg '/' nm{1}]);
  end
  set_param([dg '/V_batt'],'Name','V_pv');
  set_param([dg '/Carrier_40kHz'],'rep_seq_t','[0 1e-4]','rep_seq_y','[0 1]');
  set_param([dg '/Carrier_40kHz'],'Name','Carrier_10kHz');
  add_block('simulink/User-Defined Functions/MATLAB Function',[dg '/PI_Duty'],'Position',[200 60 330 130]);
  pich = rt.find('-isa','Stateflow.EMChart','Path',[dg '/PI_Duty']);
  pich(1).Script = fileread(fullfile(root,'ekf_src','PI_Duty.m'));
  pich(1).ChartUpdate = 'DISCRETE'; pich(1).SampleTime = '0.05';
  for nm = {'PI_Kp','PI_Ki','PI_Vdb','PI_Ts','PI_Umax','PI_Slew','PI_Duty0'}
    d = Stateflow.Data(pich(1)); d.Name = nm{1}; d.Scope = 'Parameter';
  end
  if strcmp(breaker,'memory')     % one solver-step delay (microseconds): same trick as Memory_Break_Loop
    add_block('simulink/Discrete/Memory',[dg '/V_pv_ZOH'],'InitialCondition','19','Position',[120 60 160 90]);
  else
    add_block('simulink/Discrete/Unit Delay',[dg '/V_pv_ZOH'],'SampleTime','0.05','InitialCondition','19','Position',[120 60 160 90]);
  end
  add_line(dg,'V_pv/1','V_pv_ZOH/1','autorouting','on');
  add_line(dg,'V_pv_ZOH/1','PI_Duty/1','autorouting','on');
  add_line(dg,'V_mp_ref/1','PI_Duty/2','autorouting','on');
  add_line(dg,'PI_Duty/1','Comparator/1','autorouting','on');
  add_line(dg,'Carrier_10kHz/1','Comparator/2','autorouting','on');
  add_line(dg,'Comparator/1','Data Type Conversion/1','autorouting','on');
  add_line(dg,'Data Type Conversion/1','Gate_Signal/1','autorouting','on');

  % ---------- preset defaults (base workspace), keep any existing InitFcn ----------
  old = get_param(mdl,'InitFcn');
  new = sprintf(['if ~exist(''PI_Preset'',''var''), PI_Preset = ''sun''; end\n' ...
    'switch PI_Preset\n' ...
    '  case ''bench''  %% doc constants, indoor-lamp bench (3-5%% duty)\n' ...
    '    PI_Kp=1.2; PI_Ki=0.5; PI_Vdb=0.04; PI_Umax=600; PI_Slew=1; PI_Duty0=150;\n' ...
    '  otherwise       %% full-sun / cloud transient (retuned, see report)\n' ...
    '    PI_Kp=100; PI_Ki=2500; PI_Vdb=0.04; PI_Umax=3900; PI_Slew=1000; PI_Duty0=2500;\n' ...
    'end\nPI_Ts = 0.05;\n']);
  set_param(mdl,'InitFcn',[old newline new]);
  set_param(mdl,'MaxStep',maxstep);
end
