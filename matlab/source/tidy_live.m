function tidy_live(srcFile, outFile, png)
  % Presentation clean-up of a chopper model: de-overlap blocks, orthogonal wiring, readable dashboard.
  root = fileparts(mfilename('fullpath'));
  wd = fullfile(root,'work4'); if ~exist(wd,'dir'), mkdir(wd); end
  if nargin<1, srcFile = 'C:\Users\saisi\Downloads\RC_Chopper_Final\Zero_Perturb_MPPT_Live.slx'; end
  [~,mdl] = fileparts(srcFile);
  if nargin<2, outFile = fullfile(wd,[mdl '.slx']); end
  if nargin<3, png = fullfile(root,'live_diagram3.png'); end
  copyfile(srcFile, outFile); load_system(outFile);

  % ---- 1. de-overlap the MOSFET gate corner ----
  mv = @(name,pos) try_set(mdl, name, 'Position', pos);
  mv('PV_Live_Scope',  [1480 560 1540 610]);
  mv('Sensor_Isolator',[1445 500 1475 530]);
  mv('TC4420_5V',      [1415 425 1455 445]);
  try, set_param([mdl '/TC4420_5V'],'ShowName','off'); catch, end

  % ---- 2. orthogonalise every diagonal wire segment ----
  lns = find_system(mdl,'SearchDepth',1,'FindAll','on','Type','Line');
  nfix = 0;
  for i = 1:numel(lns)
    try
      p = get_param(lns(i),'Points'); q = p(1,:);
      for k = 2:size(p,1)
        a = p(k-1,:); b = p(k,:);
        if a(1) ~= b(1) && a(2) ~= b(2), q(end+1,:) = [b(1) a(2)]; nfix = nfix + 1; end %#ok<AGROW>
        q(end+1,:) = b; %#ok<AGROW>
      end
      if size(q,1) ~= size(p,1), set_param(lns(i),'Points',q); end
    catch
    end
  end
  fprintf('orthogonalised %d diagonal segments\n', nfix);

  % ---- 3. dashboard: readable labels and a slider range that reaches lamp-level light ----
  try
    b = get_param([mdl '/Slider'],'Binding');  b.Label = 'Irradiance G [W/m^2]';  set_param([mdl '/Slider'],'Binding',b);
    b = get_param([mdl '/Slider1'],'Binding'); b.Label = 'Ambient temp [degC]';   set_param([mdl '/Slider1'],'Binding',b);
  catch e, fprintf('slider label: %s\n', e.message); end
  try, set_param([mdl '/Slider'],'Limits',[50 1200]); catch e, fprintf('limits: %s\n', e.message); end
  % gauge captions come from the bound signal names
  try
    ph = get_param([mdl '/P2S_V_pv'],'PortHandles'); L = get_param(ph.Outport(1),'Line'); set_param(L,'Name','V_pv (V)');
    ph = get_param([mdl '/Stage4_Output_Conditioning'],'PortHandles'); L = get_param(ph.Outport(2),'Line'); set_param(L,'Name','P_pv (W)');
  catch e, fprintf('signal names: %s\n', e.message); end

  % explicit captions (the web-rendered dashboard captions come from auto signal names)
  cap = @(txt,x,y,sz) add_caption(mdl, txt, x, y, sz);
  if ~isempty(find_system(mdl,'SearchDepth',1,'Name','Circular Gauge1'))
    cap('LIVE PV DASHBOARD  -  RC chopper, EKF + Lambert-W MPPT', -290, -150, 16);
    cap('PV panel voltage  V_pv  [V]   (Voc 22.5 V)',   -250,  78, 12);
    cap('PV power  P_pv  [W]   (rated 10 W)',           -250, 291, 12);
    cap('Irradiance  G  [W/m^2]   (slide to change)',   -290, 520, 12);
    cap('Ambient temperature  [degC]   (slide to change)', -282, 703, 12);
  end

  save_system(mdl); open_system(mdl); pause(2);
  print(['-s' mdl], '-dpng', '-r110', png);
  close_system(mdl,0);
  disp('TIDY DONE');
end

function add_caption(mdl, txt, x, y, sz)
  try
    a = Simulink.Annotation(mdl, txt);
    a.Position = [x y]; a.FontSize = sz; a.FontWeight = 'bold';
  catch e
    fprintf('caption "%s": %s\n', txt, e.message);
  end
end

function try_set(mdl, name, prop, val)
  try, set_param([mdl '/' name], prop, val); catch e, fprintf('%s: %s\n', name, e.message); end
end
