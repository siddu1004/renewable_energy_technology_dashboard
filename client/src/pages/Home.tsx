import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Bell, Cable, CheckCircle2, CircleStop, CloudSun, Cpu, Gauge, HardDrive, Play, Radio, RefreshCw, ShieldCheck, SlidersHorizontal, Sun, Terminal, Usb, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { type Frame, normalize, demoFrame } from "@/lib/telemetry";
import { LiquidGlassCard } from "@/components/visual/LiquidGlassCard";
import { FlowField } from "@/components/visual/FlowField";
import { LiveStatusBar } from "@/components/LiveStatusBar";
import { AnimatedValue } from "@/components/AnimatedValue";
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
  const [esp32Frames, setEsp32Frames] = useState<Frame[]>([]);
  const [matlabSampleCount, setMatlabSampleCount] = useState(0);
  const [matlabWsConnected, setMatlabWsConnected] = useState(false);
  const [hasMatlabData, setHasMatlabData] = useState(false);

  const [espConnected, setEspConnected] = useState(false);
  const [webSerialConnected, setWebSerialConnected] = useState(false);
  const [webSerialPort, setWebSerialPort] = useState<any>(null);
  const webSerialReaderRef = useRef<any>(null);

  const [sourcePreference, setSourcePreference] = useState<"AUTO" | "DUAL" | "MATLAB" | "ESP32">("AUTO");
  const [samplingRateMs, setSamplingRateMs] = useState<number>(1000); // 1.0s clean downsampled cadence
  const [chartTab, setChartTab] = useState<"tracking" | "pv_curve" | "quality" | "all">("tracking");
  const [stopped, setStopped] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const lastWebSerialCommitRef = useRef<number>(0);
  const lastMatlabCommitRef = useRef<number>(0);

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
          if (!trimmed) continue;

          let parsed: any = null;
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              parsed = JSON.parse(trimmed);
            } catch (err) {
              console.warn("[WebSerial] Frame parse error:", err);
            }
          } else if (trimmed.includes("V_op:") || trimmed.includes("v_pv:")) {
            // Support legacy / raw format: V_op: 17.5V | I_op: 0.55A | P: 9.6W | Duty: 512 | Temp: 25.0C
            try {
              const vMatch = trimmed.match(/V_op:\s*([0-9.]+)/i);
              const iMatch = trimmed.match(/I_op:\s*([0-9.]+)/i);
              const pMatch = trimmed.match(/P:\s*([0-9.]+)/i);
              const dMatch = trimmed.match(/Duty:\s*([0-9.]+)/i);
              const tMatch = trimmed.match(/Temp:\s*([0-9.]+)/i);
              const vmpMatch = trimmed.match(/V_mppt:\s*([0-9.]+)/i);
              if (vMatch && iMatch) {
                const v_pv = parseFloat(vMatch[1]);
                const i_pv = parseFloat(iMatch[1]);
                const p_pv = pMatch ? parseFloat(pMatch[1]) : v_pv * i_pv;
                const duty = dMatch ? parseInt(dMatch[1], 10) : 512;
                const t_c = tMatch ? parseFloat(tMatch[1]) : 25;
                const v_mp = vmpMatch ? parseFloat(vmpMatch[1]) : v_pv;
                parsed = { v_pv, i_pv, p_pv, duty, t_c, v_mp, source: "ESP32_SERIAL" };
              }
            } catch (err) {
              console.warn("[WebSerial] Text parse error:", err);
            }
          } else if (trimmed.startsWith("[FreeRTOS]") || trimmed.startsWith("===")) {
            console.log("[ESP32 FreeRTOS Log]", trimmed);
          }

          if (parsed && typeof parsed.v_pv === "number" && typeof parsed.i_pv === "number") {
            const frame = normalize(parsed);
            const now = Date.now();
            if (now - lastWebSerialCommitRef.current >= samplingRateMs) {
              lastWebSerialCommitRef.current = now;
              setEsp32Frames((prev) => [...prev.slice(-59), frame]);
              if (sourcePreference === "ESP32" || (sourcePreference === "AUTO" && (webSerialConnected || espConnected))) {
                setTelemetry((prev) => [...prev.slice(-59), frame]);
              }
              ingestMutation.mutate({ deviceKey: "array-a", ...parsed, timestampMs: frame.timestampMs });
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

            // Single live MATLAB frame (throttled to clean sampling cadence)
            if (msg.source === "MATLAB" || (typeof msg.p_pv === "number" && typeof msg.v_pv === "number")) {
              const frame = normalize(msg);
              const now = Date.now();
              if (now - lastMatlabCommitRef.current >= samplingRateMs) {
                lastMatlabCommitRef.current = now;
                setTelemetry((prev) => [...prev.slice(-59), frame]);
                setMatlabFrames((prev) => [...prev.slice(-59), frame]);
                setMatlabSampleCount((c) => c + 1);
                setHasMatlabData(true);
              }
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

    // Secondary continuous polling sync (ensures 100% seamless update for both streams)
    const pollInterval = setInterval(async () => {
      try {
        // 1. Synchronously poll MATLAB stream
        const resMatlab = await fetch("/api/telemetry/matlab/latest");
        if (resMatlab.ok) {
          const json = await resMatlab.json();
          if (json.ok && json.telemetry) {
            const frame = normalize(json.telemetry);
            setMatlabFrames((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.timestampMs !== frame.timestampMs) {
                return [...prev.slice(-59), frame];
              }
              return prev;
            });
            setHasMatlabData(true);
            if (sourcePreference === "MATLAB" || (sourcePreference === "AUTO" && !webSerialConnected && !espConnected)) {
              setTelemetry((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.timestampMs !== frame.timestampMs) {
                  return [...prev.slice(-59), frame];
                }
                return prev;
              });
            }
          }
        }

        // 2. Synchronously poll ESP32 stream (e.g. from Python bridge or REST endpoint)
        const resEsp = await fetch("/api/telemetry/esp32/latest");
        if (resEsp.ok) {
          const json = await resEsp.json();
          if (json.ok && json.telemetry) {
            const frame = normalize(json.telemetry);
            setEsp32Frames((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.timestampMs !== frame.timestampMs) {
                return [...prev.slice(-59), frame];
              }
              return prev;
            });
            if (sourcePreference === "ESP32" || (sourcePreference === "AUTO" && (webSerialConnected || espConnected))) {
              setTelemetry((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.timestampMs !== frame.timestampMs) {
                  return [...prev.slice(-59), frame];
                }
                return prev;
              });
            }
          }
        }
      } catch {}
    }, samplingRateMs);

    return () => {
      unmounted = true;
      clearInterval(pollInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (matlabSocketRef.current) {
        matlabSocketRef.current.close();
      }
    };
  }, [sourcePreference, samplingRateMs]);

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
  const connection = useMemo<"ESP32 USB LIVE" | "DUAL STREAM LIVE" | "LIVE" | "MATLAB LIVE" | "MATLAB SIMULATION" | "STANDBY" | "CONNECTING" | "DISCONNECTED" | "ERROR">(() => {
    if (sourcePreference === "DUAL") return "DUAL STREAM LIVE";
    if (webSerialConnected) return "ESP32 USB LIVE";
    if (espConnected) return "LIVE";
    if (hasMatlabData) return "MATLAB LIVE";
    if (matlabWsConnected) return "CONNECTING";
    return "STANDBY";
  }, [sourcePreference, webSerialConnected, espConnected, hasMatlabData, matlabWsConnected]);

  const defaultStandbyFrame: Frame = {
    timestampMs: Date.now(),
    vPv: 17.50,
    iPv: 0.570,
    pPv: 9.98,
    vMp: 17.50,
    iPh: 0.650,
    duty: 0.500,
    efficiency: 99.2,
    source: "MATLAB",
  };

  const defaultEsp32Frame: Frame = {
    timestampMs: Date.now(),
    vPv: 17.68,
    iPv: 0.558,
    pPv: 9.87,
    vMp: 17.34,
    iPh: 0.586,
    duty: 0.477,
    efficiency: 98.8,
    source: "ESP32",
  };

  const latestMatlab = matlabFrames[matlabFrames.length - 1] ?? (telemetry.find(f => f.source === "MATLAB") ?? defaultStandbyFrame);
  const latestEsp32 = esp32Frames[esp32Frames.length - 1] ?? (telemetry.find(f => f.source?.includes("ESP32")) ?? defaultEsp32Frame);

  const deltaP = latestEsp32.pPv - latestMatlab.pPv;
  const deltaV = latestEsp32.vPv - latestMatlab.vPv;
  const deltaEta = latestEsp32.efficiency - latestMatlab.efficiency;
  const syncFidelity = Math.max(0, Math.min(100, 100 - (Math.abs(deltaP) / Math.max(latestMatlab.pPv, 0.5)) * 100));

  const current = sourcePreference === "MATLAB" ? latestMatlab : (sourcePreference === "ESP32" ? latestEsp32 : (telemetry[telemetry.length - 1] ?? defaultStandbyFrame));
  const previous = telemetry[telemetry.length - 2] ?? current;
  const powerDelta = current.pPv - previous.pPv;
  const trend = useMemo(() => telemetry.slice(-14).map((item) => item.pPv), [telemetry]);

  const notice = useMemo(() => {
    if (sourcePreference === "DUAL") {
      return `DUAL STREAM ACTIVE · MATLAB P=${latestMatlab.pPv.toFixed(2)}W vs ESP32 P=${latestEsp32.pPv.toFixed(2)}W · Tracking Delta ΔP=${deltaP >= 0 ? "+" : ""}${deltaP.toFixed(2)}W · Cross-Fidelity: ${syncFidelity.toFixed(1)}%`;
    }
    if (webSerialConnected) {
      return `ESP32 USB Link active · Streaming live FreeRTOS MPPT telemetry @ 115200 baud · P=${current.pPv.toFixed(2)} W · V=${current.vPv.toFixed(2)} V · D=${(current.duty * 100).toFixed(1)}%`;
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
  }, [sourcePreference, latestMatlab.pPv, latestEsp32.pPv, deltaP, syncFidelity, webSerialConnected, connection, current.pPv, current.vPv, current.duty, matlabSampleCount, matlabWsConnected]);

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
            {(["AUTO", "DUAL", "MATLAB", "ESP32"] as const).map((mode) => (
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
                  fontWeight: sourcePreference === mode ? "bold" : "normal",
                  transition: "all 0.2s ease",
                }}
                onClick={() => setSourcePreference(mode)}
              >
                {mode === "DUAL" ? "DUAL (BOTH)" : mode}
              </button>
            ))}
          </div>

          <div className="sampling-control-group" title="Downsample display sampling rate for calm, smooth transitions">
            <span className="control-label">Sampling</span>
            <div className="sampling-pills">
              <button
                className={`sampling-pill-btn ${samplingRateMs === 1000 ? "active" : ""}`}
                onClick={() => setSamplingRateMs(1000)}
                title="1.0s clean sampling cadence"
              >
                1.0s (Clean)
              </button>
              <button
                className={`sampling-pill-btn ${samplingRateMs === 500 ? "active" : ""}`}
                onClick={() => setSamplingRateMs(500)}
                title="500ms balanced sampling cadence"
              >
                500ms
              </button>
            </div>
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

      {sourcePreference === "DUAL" ? (
        /* DUAL STREAM VIEW: MATLAB SIMULINK + ESP32 FREERTOS SIDE-BY-SIDE */
        <section className="dual-stream-container">
          <div className="section-label" style={{ color: "var(--cyan)", fontSize: "11px", letterSpacing: "0.12em" }}>
            DUAL STREAM COMPARATIVE TELEMETRY (MATLAB SIMULINK VS. ESP32 FREERTOS) <i />
          </div>
          <div className="dual-hero-grid">
            {/* 1. MATLAB Simulink Stream Card */}
            <div className="dual-source-card matlab-card">
              <div className="dual-card-header">
                <div>
                  <span className="eyebrow" style={{ color: "#7fd7f1" }}>SIMULATION MODEL</span>
                  <h2 style={{ margin: "4px 0 0", color: "#e6f6fc", fontSize: "17px" }}>
                    MATLAB / Simulink <span style={{ fontSize: "11px", color: "#8ab4c4" }}>ode23t solver</span>
                  </h2>
                </div>
                <span className="dual-badge matlab">
                  <Radio size={12} /> {matlabSampleCount > 0 ? `${matlabSampleCount} frames` : "STREAM READY"}
                </span>
              </div>
              <div className="dual-main-power">
                <strong><AnimatedValue value={latestMatlab.pPv} decimals={2} className="matlab-tone" /></strong>
                <span style={{ color: "#7fd7f1" }}>W <small style={{ color: "#759ca9", display: "block", fontSize: "9px" }}>SIMULATED P_PV</small></span>
              </div>
              <div className="dual-metrics-row">
                <div className="dual-mini-metric">
                  <small>VOLTAGE (V_PV)</small>
                  <strong><AnimatedValue value={latestMatlab.vPv} decimals={2} /> V</strong>
                </div>
                <div className="dual-mini-metric">
                  <small>CURRENT (I_PV)</small>
                  <strong><AnimatedValue value={latestMatlab.iPv} decimals={3} /> A</strong>
                </div>
                <div className="dual-mini-metric">
                  <small>EFFICIENCY (η)</small>
                  <strong style={{ color: "#72e3d2" }}><AnimatedValue value={latestMatlab.efficiency} decimals={1} />%</strong>
                </div>
              </div>
              <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#6a8d9a" }}>
                <span>PWM Duty: <strong style={{ color: "#d5e8ef" }}><AnimatedValue value={latestMatlab.duty * 100} decimals={1} />%</strong></span>
                <span>Target V_mp: <strong style={{ color: "#d5e8ef" }}><AnimatedValue value={latestMatlab.vMp} decimals={2} /> V</strong></span>
              </div>
            </div>

            {/* 2. Real-Time Tracking Error & Cross-Correlation Delta */}
            <div className="dual-source-card delta-card">
              <div className="dual-card-header">
                <div>
                  <span className="eyebrow" style={{ color: "#f2c46d" }}>CROSS-CORRELATION</span>
                  <h2 style={{ margin: "4px 0 0", color: "#fff3dc", fontSize: "16px" }}>Tracking Delta</h2>
                </div>
                <span className="dual-badge delta">
                  <Activity size={12} /> {syncFidelity >= 95 ? "TIGHT SYNC" : "CONVERGING"}
                </span>
              </div>
              <div style={{ margin: "14px 0" }}>
                <div className="delta-stat-item">
                  <small>POWER DEVIATION (ΔP)</small>
                  <strong style={{ color: Math.abs(deltaP) < 0.5 ? "#72e3d2" : "#f2c46d" }}>
                    {deltaP >= 0 ? "+" : ""}<AnimatedValue value={deltaP} decimals={2} /> W
                  </strong>
                </div>
                <div className="delta-stat-item">
                  <small>VOLTAGE DEVIATION (ΔV)</small>
                  <strong>{deltaV >= 0 ? "+" : ""}<AnimatedValue value={deltaV} decimals={2} /> V</strong>
                </div>
                <div className="delta-stat-item">
                  <small>EFFICIENCY DELTA (Δη)</small>
                  <strong>{deltaEta >= 0 ? "+" : ""}<AnimatedValue value={deltaEta} decimals={1} />%</strong>
                </div>
                <div className="delta-stat-item">
                  <small>TRACKING FIDELITY</small>
                  <strong style={{ color: "#72e3d2" }}><AnimatedValue value={syncFidelity} decimals={1} />%</strong>
                </div>
                <div className="sync-bar">
                  <div className="sync-fill" style={{ width: `${Math.min(100, Math.max(10, syncFidelity))}%` }} />
                </div>
              </div>
              <div style={{ fontSize: "9px", color: "#9e9178", display: "flex", justifyContent: "space-between" }}>
                <span>Dual EKF Observer</span>
                <span>Zero-hunting ripple</span>
              </div>
            </div>

            {/* 3. ESP32 FreeRTOS Hardware Card */}
            <div className="dual-source-card esp32-card">
              <div className="dual-card-header">
                <div>
                  <span className="eyebrow" style={{ color: "#72e3d2" }}>HARDWARE CONTROLLER</span>
                  <h2 style={{ margin: "4px 0 0", color: "#e3fbf5", fontSize: "17px" }}>
                    ESP32 FreeRTOS <span style={{ fontSize: "11px", color: "#80aba2" }}>Core 1 (COM8)</span>
                  </h2>
                </div>
                <span className="dual-badge esp32">
                  <Cpu size={12} /> {webSerialConnected ? "USB ONLINE" : "HARDWARE"}
                </span>
              </div>
              <div className="dual-main-power">
                <strong><AnimatedValue value={latestEsp32.pPv} decimals={2} className="esp32-tone" /></strong>
                <span style={{ color: "#72e3d2" }}>W <small style={{ color: "#6a9b91", display: "block", fontSize: "9px" }}>MEASURED P_PV</small></span>
              </div>
              <div className="dual-metrics-row">
                <div className="dual-mini-metric">
                  <small>VOLTAGE (V_PV)</small>
                  <strong><AnimatedValue value={latestEsp32.vPv} decimals={2} /> V</strong>
                </div>
                <div className="dual-mini-metric">
                  <small>CURRENT (I_PV)</small>
                  <strong><AnimatedValue value={latestEsp32.iPv} decimals={3} /> A</strong>
                </div>
                <div className="dual-mini-metric">
                  <small>EFFICIENCY (η)</small>
                  <strong style={{ color: "#72e3d2" }}><AnimatedValue value={latestEsp32.efficiency} decimals={1} />%</strong>
                </div>
              </div>
              <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64948a" }}>
                <span>PWM Duty: <strong style={{ color: "#d3f7ee" }}><AnimatedValue value={latestEsp32.duty * 100} decimals={1} />%</strong></span>
                <span>Target V_mp: <strong style={{ color: "#d3f7ee" }}><AnimatedValue value={latestEsp32.vMp} decimals={2} /> V</strong></span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* STANDARD HERO GRID WITH SMOOTH VALUE TRANSITIONS */
        <section className="hero-grid">
          <LiquidGlassCard className="hero-card">
            <div className="hero-card-top">
              <div>
                <span className="eyebrow">
                  {current.source === "MATLAB" ? "MATLAB SIMULINK STREAM" : current.source?.includes("ESP32") ? "ESP32 FREERTOS HARDWARE" : "PRIMARY TELEMETRY"}
                </span>
                <h2>
                  P_pv <span>power output</span>
                </h2>
              </div>
              <div className="hero-chip">
                <span className="status-dot" /> {current.source === "MATLAB" ? "SIMULINK EKF" : "FREERTOS MPPT"}
              </div>
            </div>
            <div className="hero-readout">
              <strong id="display-p-pv"><AnimatedValue value={current.pPv} decimals={2} /></strong>
              <span>
                W<small>instantaneous</small>
              </span>
              <span className={`hero-delta ${powerDelta >= 0 ? "positive" : "negative"}`}>
                {powerDelta >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />} <AnimatedValue value={Math.abs(powerDelta)} decimals={2} /> W <small>Δ / sample</small>
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
                <strong>V_mp: <AnimatedValue value={current.vMp} decimals={2} />V · I_ph: <AnimatedValue value={current.iPh} decimals={3} />A</strong>
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
      )}

      {/* TELEMETRY METRIC CHIPS (Displayed only in Single/Auto view to avoid repeating data in Dual Mode) */}
      {sourcePreference !== "DUAL" && (
        <section className="telemetry-grid">
          {[
            { id: "display-v-pv", label: "V_pv", num: current.vPv, decimals: 2, unit: "V", detail: "array voltage", Icon: CloudSun },
            { id: "display-i-pv", label: "I_pv", num: current.iPv, decimals: 3, unit: "A", detail: "array current", Icon: Activity },
            { id: "display-v-mp", label: "V_mp", num: current.vMp, decimals: 2, unit: "V", detail: "max power voltage", Icon: SlidersHorizontal },
            { id: "display-i-ph", label: "I_ph", num: current.iPh, decimals: 3, unit: "A", detail: "photocurrent estimate", Icon: Sun },
          ].map(({ id, label, num, decimals, unit, detail, Icon }, index) => (
            <LiquidGlassCard key={label} className={`telemetry-chip tone-${index}`}>
              <Icon size={16} />
              <div>
                <small>{label}</small>
                <strong>
                  <span id={id}><AnimatedValue value={num} decimals={decimals} /></span>
                  <em>{unit}</em>
                </strong>
                <span>{detail}</span>
              </div>
            </LiquidGlassCard>
          ))}
        </section>
      )}

      <div className="notice-bar">
        <Terminal size={13} />
        <span id="display-notice">{notice}</span>
        <span className="notice-spacer" />
        <span className="micro-label">{sourcePreference === "DUAL" ? "DUAL STREAM" : connection === "MATLAB SIMULATION" ? "MATLAB STREAM" : connection === "LIVE" ? "LIVE ESP32" : "DEMO"}</span>
        <span className="status-dot" />
      </div>

      {/* CLEAN TABBED CHART DECK (Focused views rather than stacked visual overload) */}
      <section className="chart-section">
        <div className="chart-deck-header">
          <div className="section-label" style={{ margin: 0 }}>
            {sourcePreference === "DUAL" ? "DUAL TELEMETRY COMPARISON & WAVEFORMS" : "REAL-TIME MPPT TELEMETRY & ANALYSIS"} <i />
          </div>
          <div className="chart-tab-list">
            <button
              className={`chart-tab-btn ${chartTab === "tracking" ? "active" : ""}`}
              onClick={() => setChartTab("tracking")}
            >
              <Activity size={13} /> Comparative Tracking
            </button>
            <button
              className={`chart-tab-btn ${chartTab === "pv_curve" ? "active" : ""}`}
              onClick={() => setChartTab("pv_curve")}
            >
              <Zap size={13} /> P-V Characteristic
            </button>
            <button
              className={`chart-tab-btn ${chartTab === "quality" ? "active" : ""}`}
              onClick={() => setChartTab("quality")}
            >
              <Gauge size={13} /> Quality & Efficiency
            </button>
            <button
              className={`chart-tab-btn ${chartTab === "all" ? "active" : ""}`}
              onClick={() => setChartTab("all")}
            >
              <SlidersHorizontal size={13} /> All Charts
            </button>
          </div>
        </div>

        {chartTab === "tracking" && (
          <div className="clean-chart-view">
            <div className="chart-grid primary">
              <EkfPoChart 
                telemetry={esp32Frames.length > 0 ? esp32Frames : telemetry} 
                matlabTelemetry={matlabFrames.length > 0 ? matlabFrames : telemetry.filter((t) => t.source === "MATLAB")} 
              />
              <RippleChart telemetry={telemetry} />
            </div>
          </div>
        )}

        {chartTab === "pv_curve" && (
          <div className="clean-chart-view">
            <div className="chart-grid primary">
              <PvCurveChart currentV={current.vPv} currentP={current.pPv} />
              <ResponseBandChart currentP={current.pPv} />
            </div>
          </div>
        )}

        {chartTab === "quality" && (
          <div className="clean-chart-view">
            <div className="chart-grid secondary">
              <EfficiencyChart efficiency={current.efficiency} />
              <RippleChart telemetry={telemetry} />
              <DutyChart duty={current.duty} />
            </div>
          </div>
        )}

        {chartTab === "all" && (
          <div className="clean-chart-view">
            <div className="chart-grid primary" style={{ marginBottom: "16px" }}>
              <EkfPoChart 
                telemetry={esp32Frames.length > 0 ? esp32Frames : telemetry} 
                matlabTelemetry={matlabFrames.length > 0 ? matlabFrames : telemetry.filter((t) => t.source === "MATLAB")} 
              />
              <RippleChart telemetry={telemetry} />
            </div>
            <div className="chart-grid secondary" style={{ marginBottom: "16px" }}>
              <PvCurveChart currentV={current.vPv} currentP={current.pPv} />
              <EfficiencyChart efficiency={current.efficiency} />
              <DutyChart duty={current.duty} />
            </div>
            <div className="chart-grid live">
              <LiveTelemetryChart telemetry={telemetry} />
              <ResponseBandChart currentP={current.pPv} />
            </div>
          </div>
        )}
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
