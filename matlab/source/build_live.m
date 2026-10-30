% build_live.m - Live model: boost power stage -> low-side rheostatic RC chopper, then apply_spec.
function build_live()
  root = fileparts(mfilename('fullpath'));
  wd = fullfile(root,'work3'); if ~exist(wd,'dir'), mkdir(wd); end
  src = 'C:\Users\saisi\Downloads\Zero_Perturb_MPPT_Live.slx';
  mdl = 'Zero_Perturb_MPPT_Live';
  copyfile(src, fullfile(wd,[mdl '.slx']));
  load_system(fullfile(wd,[mdl '.slx']));
  fprintf('Loaded %s\n', mdl);
  fprintf('Existing InitFcn: [%s]\n', get_param(mdl,'InitFcn'));

  % ---- locate blocks ----
  ind = bh(mdl,'^Inductor$'); dio = bh(mdl,'^Diode$'); cap = bh(mdl,'^Capacitor$');
  res = bh(mdl,'^Resistor$'); mos = bh(mdl,'^MOSFET'); isn = bh(mdl,'^Current Sensor$');
  vsn = bh(mdl,'^Voltage Sensor$'); vps = bh(mdl,'^V_pv_Sensor$'); pvs = bh(mdl,'^PV_Current_Source$');
  P = @(b) get_param(b,'PortHandles');

  % ---- 1. remove boost-only parts (inductor, freewheel diode) ----
  for b = [ind dio]
    ph = P(b);
    for p = [ph.LConn ph.RConn]
      L = get_param(p,'Line'); if ishandle(L) && L ~= -1, try, delete_line(L); catch, end, end
    end
    delete_block(b);
  end

  % ---- 2. move the sense/load chain onto the PV bus ----
  %   old OUT net = { Cap+, Current Sensor L1, Voltage Sensor + }  -> must join the PV bus net
  for p = [P(cap).LConn(1) P(isn).LConn(1) P(vsn).LConn(1)]
    L = get_param(p,'Line'); if ishandle(L) && L ~= -1, try, delete_line(L); catch, end, end
  end
  anchor = P(vps).LConn(1);                         % PV bus net (PV source +, V_pv_Sensor +)
  assert(branch(mdl, P(cap).LConn(1), anchor, cap, 'LConn1'), 'Cin -> bus failed');
  assert(branch(mdl, P(isn).LConn(1), anchor, isn, 'LConn1'), 'shunt -> bus failed');
  assert(branch(mdl, P(vsn).LConn(1), anchor, vsn, 'LConn1'), 'Vsense -> bus failed');

  % ---- 3. low-side switch: Resistor bottom -> MOSFET drain (source stays on ground) ----
  L = get_param(P(res).RConn(1),'Line'); if ishandle(L) && L ~= -1, delete_line(L); end
  L = get_param(P(mos).RConn(1),'Line'); if ishandle(L) && L ~= -1, try, delete_line(L); catch, end, end
  add_line(mdl, P(res).RConn(1), P(mos).RConn(1));

  % ---- 4. dangling-port scan, then spec changes ----
  fprintf('Dangling ports after power-stage rewire:\n'); report_dangling(mdl);
  apply_spec(mdl, 'memory', '2e-6');
  set_param(mdl,'SimulationCommand','update');
  fprintf('UPDATE (compile) OK\n');
  fprintf('Dangling ports FINAL:\n'); report_dangling(mdl);
  save_system(mdl); close_system(mdl,0);
  disp('BUILD_LIVE DONE');
end

function h = bh(mdl, pat)
  r = find_system(mdl,'SearchDepth',1,'LookUnderMasks','on','RegExp','on','Name',pat);
  assert(~isempty(r), 'block not found: %s', pat);
  h = get_param(r{1},'Handle');
end

function tf = merged(blkH, portType)
  pc = get_param(blkH,'PortConnectivity'); tf = false;
  for i=1:numel(pc)
    if strcmp(pc(i).Type, portType), tf = ~isempty(pc(i).DstBlock) && any(pc(i).DstBlock ~= -1); return; end
  end
end

function ok = branch(mdl, movingPort, anchorPort, movingBlk, movingType)
  ok = false;
  aLine = get_param(anchorPort,'Line');
  if ~(ishandle(aLine) && aLine ~= -1), return; end
  pts = get_param(aLine,'Points'); pp = round(get_param(movingPort,'Position'));
  cand = pts; for i=1:size(pts,1)-1, cand(end+1,:) = round((pts(i,:)+pts(i+1,:))/2); end %#ok<AGROW>
  for c=1:size(cand,1)
    jp = cand(c,:); if isequal(jp,pp), continue; end
    h = []; try, h = add_line(mdl,[jp; pp]); catch, h = []; end
    if merged(movingBlk, movingType), ok = true; return; end
    if ~isempty(h) && ishandle(h) && h ~= -1, try, delete_line(h); catch, end, end
  end
end

function report_dangling(mdl)
  n = 0; blks = find_system(mdl,'SearchDepth',1,'Type','Block');
  for i = 2:numel(blks)
    b = blks{i}; ph = get_param(b,'PortHandles'); nm = strrep(get_param(b,'Name'),newline,' ');
    for f = {'Inport','Outport','LConn','RConn'}
      hs = ph.(f{1});
      for j = 1:numel(hs)
        if get_param(hs(j),'Line') == -1, fprintf('    DANGLING: %s  %s%d\n', nm, f{1}, j); n = n + 1; end
      end
    end
  end
  if n == 0, fprintf('    (none)\n'); end
end
