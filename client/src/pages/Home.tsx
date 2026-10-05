import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Bell, Cable, CheckCircle2, CircleStop, CloudSun, Cpu, HardDrive, Play, Radio, RefreshCw, ShieldCheck, SlidersHorizontal, Sun, Terminal, Usb, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { type Frame, normalize, demoFrame } from "@/lib/telemetry";
import { LiquidGlassCard } from "@/components/visual/LiquidGlassCard";
import { FlowField } from "@/components/visual/FlowField";
import { LiveStatusBar } from "@/components/LiveStatusBar";
import { DutyChart, EfficiencyChart, EkfPoChart, LiveTelemetryChart, PvCurveChart, ResponseBandChart, RippleChart } from "@/components/EngineeringCharts";

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${34 - ((value - min) / Math.max(max - min, 0.001)) * 29}`).join(" ");
  return (
    <svg viewBox="0 0 100 38" preserveAspectRatio="none" className="sparkline" aria-label="Power trend">
      <polyline points={points} fill="none" stroke="#72e3d2" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Home() {
  const snapshotQuery = trpc.dashboard.snapshot.useQuery({ deviceKey: "array-a" });
  const ingestMutation = trpc.dashboard.ingest.useMutation();
  const commandMutation = trpc.dashboard.command.useMutation({
    onSuccess: ({ accepted }) => (accepted ? toast.success("Command queued in controller history") : toast.error("Command could not be queued")),
  });

  // Main telemetry stream displayed across all instruments
  const [telemetry, setTelemetry] = useState<Frame[]>([]);
  const [matlabFrames, setMatlabFrames] = useState<Frame[]>([]);
  const [matlabSampleCount, setMatlabSampleCount] = useState(0);
  const [matlabWsConnected, setMatlabWsConnected] = useState(false);
  const [hasMatlabData, setHasMatlabData] = useState(false);

  const [espConnected, setEspConnected] = useState(false);
  const [webSerialConnected, setWebSerialConnected] = useState(false);
  const [webSerialPort, setWebSerialPort] = useState<any>(null);
  const webSerialReaderRef = useRef<any>(null);

  const [sourcePreference, setSourcePreference] = useState<"AUTO" | "MATLAB" | "ESP32" | "DEMO">("AUTO");
  const [stopped, setStopped] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const matlabSocketRef = useRef<WebSocket | null>(null);
  const espSocketRef = useRef<WebSocket | null>(null);
  const snapshot = snapshotQuery.data;

  // -------------------------------------------------------------
  // WebSerial USB Serial Port Handler
  // -------------------------------------------------------------
  const connectWebSerial = async () => {
    if (!("serial" in navigator)) {
      toast.error("WebSerial is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      setWebSerialPort(port);
      setWebSerialConnected(true);
      toast.success("ESP32 USB Serial port connected at 115200 baud!");

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      webSerialReaderRef.current = reader;

      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              const parsed = JSON.parse(trimmed);
              if (typeof parsed.v_pv === "number" && typeof parsed.i_pv === "number") {
                const frame = normalize(parsed);
                setTelemetry((prev) => [...prev.slice(-59), frame]);
                ingestMutation.mutate({ deviceKey: "array-a", ...parsed, timestampMs: frame.timestampMs });
              }
            } catch (err) {
              console.warn("[WebSerial] Frame parse error:", err);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        toast.error(`WebSerial connection error: ${err.message || err}`);
      }
      setWebSerialConnected(false);
    }
  };

  const disconnectWebSerial = async () => {
    try {
      if (webSerialReaderRef.current) {
        await webSerialReaderRef.current.cancel();
      }
      if (webSerialPort) {
        await webSerialPort.close();
      }
    } catch {}
    setWebSerialPort(null);
    setWebSerialConnected(false);
    toast.info("ESP32 USB Serial disconnected");
  };

  // -------------------------------------------------------------
  // 1. Direct WebSocket connection to /ws/matlab
  // -------------------------------------------------------------
  useEffect(() => {
    let unmounted = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

    function connectMatlabWs() {
      if (unmounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/matlab`;
      console.log("[MATLAB WS] Connecting to", wsUrl);

      try {
        const ws = new WebSocket(wsUrl);
        matlabSocketRef.current = ws;

        ws.onopen = () => {
          console.log("[MATLAB WS] Connected. readyState:", ws.readyState);
          setMatlabWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === "connection") {
              console.log("[MATLAB WS] Handshake:", msg.message, "historyCount:", msg.historyCount);
              return;
            }

            // Batch history replay from server memory
            if (msg.type === "history" && Array.isArray(msg.history) && msg.history.length > 0) {
              const batch = msg.history.map(normalize);
              console.log(`[MATLAB WS] Replayed ${batch.length} MATLAB frames`);
              setTelemetry(batch.slice(-60));
              setMatlabFrames(batch.slice(-60));
              setMatlabSampleCount((c) => c + batch.length);
              setHasMatlabData(true);
              return;
            }

            // Single live MATLAB frame
            if (msg.source === "MATLAB" || (typeof msg.p_pv === "number" && typeof msg.v_pv === "number")) {
              const frame = normalize(msg);
              setTelemetry((prev) => [...prev.slice(-59), frame]);
              setMatlabFrames((prev) => [...prev.slice(-59), frame]);
              setMatlabSampleCount((c) => c + 1);
              setHasMatlabData(true);
              return;
            }
          } catch (err) {
            console.warn("[MATLAB WS] Frame parse error:", err);
          }
        };

        ws.onclose = () => {
          console.log("[MATLAB WS] Disconnected. Reconnecting in 3s...");
          setMatlabWsConnected(false);
          matlabSocketRef.current = null;
          if (!unmounted) {
            reconnectTimeout = setTimeout(connectMatlabWs, 3000);
          }
        };

        ws.onerror = (err) => {
          console.warn("[MATLAB WS] Error:", err);
        };
      } catch (err) {
        console.warn("[MATLAB WS] Init failed:", err);
        if (!unmounted) {
          reconnectTimeout = setTimeout(connectMatlabWs, 3000);
        }
      }
    }

    connectMatlabWs();

    // Secondary continuous polling sync (ensures 100% seamless update even if WS blips)
    const pollInterval = setInterval(async () => {
      try {
        if (sourcePreference === "ESP32") {
          const res = await fetch("/api/telemetry/esp32/latest");
          if (res.ok) {
            const json = await res.json();
            if (json.ok && json.telemetry) {
              const frame = normalize(json.telemetry);
              setTelemetry((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.timestampMs !== frame.timestampMs) {
                  return [...prev.slice(-59), frame];
                }
                return prev;
              });
            }
          }
        } else {
          const res = await fetch("/api/telemetry/matlab/latest");
          if (res.ok) {
            const json = await res.json();
            if (json.ok && json.telemetry) {
              const frame = normalize(json.telemetry);
              setTelemetry((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.timestampMs !== frame.timestampMs) {
                  return [...prev.slice(-59), frame];
                }
                return prev;
              });
              setMatlabFrames((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.timestampMs !== frame.timestampMs) {
                  return [...prev.slice(-59), frame];
                }
                return prev;
              });
              setHasMatlabData(true);
            }
          }
        }
      } catch {}
    }, 500);

    return () => {
      unmounted = true;
      clearInterval(pollInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (matlabSocketRef.current) {
        matlabSocketRef.current.close();
      }
    };
  }, [sourcePreference]);

  // -------------------------------------------------------------
  // 2. Initialize from database snapshot
  // -------------------------------------------------------------
  useEffect(() => {
    if (snapshot?.history?.length) {
      const dbSamples = snapshot.history.map(normalize);
      const matlabDbSamples = dbSamples.filter((s) => s.source === "MATLAB");
      if (matlabDbSamples.length > 0) {
        setTelemetry(matlabDbSamples.slice(-60));
        setMatlabFrames(matlabDbSamples.slice(-60));
        setHasMatlabData(true);
        setMatlabSampleCount((c) => Math.max(c, matlabDbSamples.length));
      } else if (!hasMatlabData && !telemetry.length) {
        setTelemetry(dbSamples.slice(-60));
      }
    }
  }, [snapshot?.history]);

  // -------------------------------------------------------------
  // 3. Standby & Derived States (No demo data interval)
  // -------------------------------------------------------------
  const connection = useMemo<"ESP32 USB LIVE" | "LIVE" | "MATLAB LIVE" | "MATLAB SIMULATION" | "STANDBY" | "CONNECTING" | "DISCONNECTED" | "ERROR">(() => {
    if (webSerialConnected) return "ESP32 USB LIVE";
    if (espConnected) return "LIVE";
    if (hasMatlabData) return "MATLAB LIVE";
    if (matlabWsConnected) return "CONNECTING";
    return "STANDBY";
  }, [webSerialConnected, espConnected, hasMatlabData, matlabWsConnected]);

  const defaultStandbyFrame: Frame = {
    timestampMs: Date.now(),
    vPv: 0,
    iPv: 0,
    pPv: 0,
    vMp: 0,
    iPh: 0,
    duty: 0,
    efficiency: 0,
    source: "MATLAB",
  };

  const current = telemetry[telemetry.length - 1] ?? defaultStandbyFrame;
  const previous = telemetry[telemetry.length - 2] ?? current;
  const powerDelta = current.pPv - previous.pPv;
  const trend = useMemo(() => telemetry.slice(-14).map((item) => item.pPv), [telemetry]);

  const notice = useMemo(() => {
    if (webSerialConnected) {
      return `ESP32 USB Link active · Streaming live synthetic MPPT telemetry @ 115200 baud · P=${current.pPv.toFixed(2)} W · V=${current.vPv.toFixed(2)} V · D=${(current.duty * 100).toFixed(1)}%`;
    }
    if (connection === "LIVE") {
      return "ESP32 hardware link established";
    }
    if (connection === "MATLAB LIVE" || connection === "MATLAB SIMULATION") {
      return `MATLAB LIVE stream active · P=${current.pPv.toFixed(2)} W · V=${current.vPv.toFixed(2)} V · D=${(current.duty * 100).toFixed(1)}% (${matlabSampleCount} samples)`;
    }
    if (matlabWsConnected) {
      return "WebSocket connected to /ws/matlab · Ready for MATLAB LIVE stream";
    }
    return "System ready · Connect ESP32 via USB or run start_live_matlab_stream in MATLAB";
  }, [webSerialConnected, connection, current.pPv, current.vPv, current.duty, matlabSampleCount, matlabWsConnected]);

  // -------------------------------------------------------------
  // 5. ESP32 hardware connection handler
  // -------------------------------------------------------------
  const connectEsp32 = () => {
    const url = window.localStorage.getItem("mppt_ws_url") || snapshot?.device?.websocketUrl || "ws://192.168.4.1:81";
    espSocketRef.current?.close();
    toast.info(`Connecting to ESP32: ${url}`);
    try {
      const socket = new WebSocket(url);
      espSocketRef.current = socket;
      socket.onopen = () => {
        setEspConnected(true);
        toast.success("ESP32 hardware link established");
      };
      socket.onmessage = (event) => {
        try {
          const next = JSON.parse(event.data);
          if (["v_pv", "i_pv", "p_pv", "v_mp", "i_ph", "duty"].every((key) => typeof next[key] === "number")) {
            const frame = normalize(next);
            setTelemetry((items) => [...items.slice(-59), frame]);
            ingestMutation.mutate({ deviceKey: "array-a", ...next, timestampMs: frame.timestampMs });
          }
        } catch {
        }
      };
      socket.onerror = () => {
        toast.error("ESP32 link unavailable");
        setEspConnected(false);
      };
      socket.onclose = () => {
        espSocketRef.current = null;
        setEspConnected(false);
      };
    } catch {
      espSocketRef.current = null;
      setEspConnected(false);
    }
  };

  const sendCommand = (command: "stop" | "resume" | "sync") => {
    commandMutation.mutate({ deviceKey: "array-a", command });
  };

  const sendStop = () => {
    const payload = JSON.stringify({ cmd: "stop" });
    if (espSocketRef.current?.readyState === WebSocket.OPEN) espSocketRef.current.send(payload);
    sendCommand("stop");
    setStopped(true);
  };

  const resumeDemo = () => {
    if (espSocketRef.current?.readyState === WebSocket.OPEN) espSocketRef.current.send(JSON.stringify({ cmd: "resume" }));
    sendCommand("resume");
    setStopped(false);
  };

  return (
    <div className="instrument-page">
      <FlowField density="sparse" />
      <div className="ambient-orbit orbit-one" />
      <div className="ambient-orbit orbit-two" />

      <section className="instrument-heading">
        <div>
          <div className="eyebrow">ARRAY A · MPPT TELEMETRY</div>
          <h1>MPPT Dashboard</h1>
          <p>Real-time telemetry, Simulink EKF model integration, and ESP32 hardware tracking.</p>
        </div>
        <div className="heading-actions">
          <div className="segmented" style={{ display: "flex", gap: "4px", background: "rgba(10,24,34,0.6)", padding: "4px", borderRadius: "8px", border: "1px solid rgba(127,194,218,0.15)" }}>
            {(["AUTO", "MATLAB", "ESP32"] as const).map((mode) => (
              <button
                key={mode}
                className={`button subtle ${sourcePreference === mode ? "selected" : ""}`}
                style={{
                  padding: "4px 10px",
                  fontSize: "11px",
                  borderRadius: "6px",
                  background: sourcePreference === mode ? "rgba(114,227,210,0.18)" : "transparent",
                  color: sourcePreference === mode ? "#72e3d2" : "#98afba",
                  border: sourcePreference === mode ? "1px solid rgba(114,227,210,0.4)" : "1px solid transparent",
                }}
                onClick={() => setSourcePreference(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          <span className={`status-pill ${connection.toLowerCase().replace(/[\s\/]+/g, "-")}`}>
            <span className="status-dot" />
            {connection}
          </span>
          {webSerialConnected ? (
            <button className="button danger" onClick={disconnectWebSerial} title="Disconnect ESP32 USB Serial">
              <Usb size={14} /> Disconnect USB
            </button>
          ) : (
            <button className="button primary" onClick={connectWebSerial} title="Connect ESP32 via USB Serial (WebSerial)">
              <Usb size={14} /> Connect ESP32 (USB)
            </button>
          )}
          <button className="button subtle" onClick={connectEsp32} title="Connect ESP32 WebSocket">
            <Cable size={14} /> ESP32 WS
          </button>
          <button className="button icon" aria-label="Refresh" onClick={() => snapshotQuery.refetch()}>
            <RefreshCw size={15} />
          </button>
        </div>
      </section>

      <LiveStatusBar connection={connection} updatedAt={current.timestampMs} efficiency={current.efficiency} power={current.pPv} />

      <section className="hero-grid">
        <LiquidGlassCard className="hero-card">
          <div className="hero-card-top">
            <div>
              <span className="eyebrow">
                {current.source === "MATLAB" ? "MATLAB SIMULINK STREAM" : "PRIMARY TELEMETRY"}
              </span>
              <h2>
                P_pv <span>power output</span>
              </h2>
            </div>
            <div className="hero-chip">
              <span className="status-dot" /> {current.source === "MATLAB" ? "SIMULINK EKF" : "MPPT TRACKING"}
            </div>
          </div>
          <div className="hero-readout">
            <strong id="display-p-pv">{current.pPv.toFixed(2)}</strong>
            <span>
              W<small>instantaneous</small>
            </span>
            <span className={`hero-delta ${powerDelta >= 0 ? "positive" : "negative"}`}>
              {powerDelta >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />} {Math.abs(powerDelta).toFixed(2)} W <small>Δ / sample</small>
            </span>
          </div>
          <div className="hero-sparkline">
            <Sparkline values={trend} />
            <div>
              <span>-12 s</span>
              <span>now</span>
            </div>
          </div>
          <div className="hero-meta">
            <div>
              <small>TRACKING ALGORITHM</small>
              <strong>Extended Kalman Filter</strong>
            </div>
            <div>
              <small>OPERATING POINT</small>
              <strong>V_mp: {current.vMp.toFixed(2)}V · I_ph: {current.iPh.toFixed(3)}A</strong>
            </div>
            <div>
              <small>ACTIVE SOURCE</small>
              <strong id="display-source">{current.source === "MATLAB" ? "MATLAB / SIMULATION" : current.source} · {matlabSampleCount > 0 ? `${matlabSampleCount} samples` : "10 Hz"}</strong>
            </div>
          </div>
        </LiquidGlassCard>

        <LiquidGlassCard className={`stop-card ${stopped ? "stopped" : ""}`}>
          <div className="stop-card-head">
            <div>
              <span className="eyebrow">SAFETY & INTERLOCK</span>
              <h2>{stopped ? "Stopped" : "Active"}</h2>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="stop-state">
            <span className={`status-dot ${stopped ? "red" : ""}`} />
            <strong>{stopped ? "OUTPUT OFF" : "OUTPUT ON"}</strong>
          </div>
          <button className="stop-button" onClick={stopped ? resumeDemo : sendStop}>
            {stopped ? <Play size={18} /> : <CircleStop size={18} />}
            <span>{stopped ? "RESUME" : "STOP"}</span>
          </button>
          <p>{stopped ? "Press resume to reactivate." : "Safe software cutoff for power output."}</p>
        </LiquidGlassCard>
      </section>

      <section className="telemetry-grid">
        {[
          { id: "display-v-pv", label: "V_pv", value: current.vPv.toFixed(2), unit: "V", detail: "array voltage", Icon: CloudSun },
          { id: "display-i-pv", label: "I_pv", value: current.iPv.toFixed(3), unit: "A", detail: "array current", Icon: Activity },
          { id: "display-v-mp", label: "V_mp", value: current.vMp.toFixed(2), unit: "V", detail: "max power voltage", Icon: SlidersHorizontal },
          { id: "display-i-ph", label: "I_ph", value: current.iPh.toFixed(3), unit: "A", detail: "photocurrent estimate", Icon: Sun },
        ].map(({ id, label, value, unit, detail, Icon }, index) => (
          <LiquidGlassCard key={label} className={`telemetry-chip tone-${index}`}>
            <Icon size={16} />
            <div>
              <small>{label}</small>
              <strong>
                <span id={id}>{value}</span>
                <em>{unit}</em>
              </strong>
              <span>{detail}</span>
            </div>
          </LiquidGlassCard>
        ))}
      </section>

      <div className="notice-bar">
        <Terminal size={13} />
        <span id="display-notice">{notice}</span>
        <span className="notice-spacer" />
        <span className="micro-label">{connection === "MATLAB SIMULATION" ? "MATLAB STREAM" : connection === "LIVE" ? "LIVE ESP32" : "DEMO"}</span>
        <span className="status-dot" />
      </div>

      <section className="chart-section">
        <div className="section-label">
          LIVE / MATLAB SIMULATION COMPARISON <i />
        </div>
        <div className="chart-grid primary">
          <EkfPoChart telemetry={telemetry} matlabTelemetry={matlabFrames.length > 0 ? matlabFrames : telemetry.filter((t) => t.source === "MATLAB")} />
          <RippleChart telemetry={telemetry} />
        </div>
        <div className="chart-grid secondary">
          <PvCurveChart currentV={current.vPv} currentP={current.pPv} />
          <EfficiencyChart efficiency={current.efficiency} />
          <DutyChart duty={current.duty} />
        </div>
        <div className="section-label">
          REAL-TIME RESPONSE & SIGNALS <i />
        </div>
        <div className="chart-grid live">
          <LiveTelemetryChart telemetry={telemetry} />
          <ResponseBandChart currentP={current.pPv} />
        </div>
      </section>

      <footer className="instrument-footer">
        <span>
          <Cpu size={14} /> ESP32 MPPT · ARRAY A
        </span>
        <span>
          <Radio size={14} /> {matlabSampleCount > 0 ? `MATLAB SIMULATION (${matlabSampleCount} FRAMES)` : "DEMO / LIVE BRIDGE"}
        </span>
        <span>
          <HardDrive size={14} /> {telemetry.length} SAMPLES BUFFERED
        </span>
      </footer>

      {notificationsOpen ? (
        <div className="notification-drawer">
          <div className="drawer-head">
            <div>
              <span>NOTIFICATIONS</span>
              <small>ARRAY A · SIMULATION & TELEMETRY</small>
            </div>
            <button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">
              <X size={14} />
            </button>
          </div>
          <div className="notification-summary">
            <strong>0</strong>
            <span>active alerts</span>
            <i />
            <strong>{matlabSampleCount > 0 ? "3" : "2"}</strong>
            <span>system events</span>
          </div>
          {matlabSampleCount > 0 ? (
            <div className="event-item priority-normal">
              <span className="event-icon">
                <Radio size={14} />
              </span>
              <div>
                <strong>MATLAB Ingest Active</strong>
                <small>{matlabSampleCount} telemetry frames received from ekf.slx simulation.</small>
              </div>
              <time>live</time>
            </div>
          ) : null}
          <div className="event-item priority-normal">
            <span className="event-icon">
              <CheckCircle2 size={14} />
            </span>
            <div>
              <strong>MPPT stable</strong>
              <small>Operating point within target efficiency window.</small>
            </div>
            <time>now</time>
          </div>
          <div className="event-item priority-info">
            <span className="event-icon">
              <HardDrive size={14} />
            </span>
            <div>
              <strong>History buffer ready</strong>
              <small>{telemetry.length} live samples active in memory.</small>
            </div>
            <time>live</time>
          </div>
        </div>
      ) : null}

      <button className="floating-events" aria-label="Open notifications" onClick={() => setNotificationsOpen((value) => !value)}>
        <Bell size={16} />
        <span>{matlabSampleCount > 0 ? 3 : 2}</span>
      </button>
    </div>
  );
}
