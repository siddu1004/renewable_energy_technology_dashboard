import { Activity, AlertTriangle, CheckCircle2, Clock3, Gauge, Wifi, WifiOff } from "lucide-react";

type LiveStatusBarProps = {
  connection: string;
  updatedAt: number;
  efficiency?: number;
  power: number;
};

export function LiveStatusBar({ connection, updatedAt, efficiency, power }: LiveStatusBarProps) {
  const isLive =
    connection === "LIVE" ||
    connection === "MATLAB LIVE" ||
    connection === "ESP32 USB LIVE" ||
    connection === "DUAL STREAM LIVE";
  const isOffline = connection === "DISCONNECTED" || connection === "ERROR";
  const age = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  const hasEff = typeof efficiency === "number" && !isNaN(efficiency) && efficiency > 0;
  const alert = isOffline ? "Connection lost" : hasEff && efficiency < 95 ? "Low efficiency" : null;
  const mode =
    connection === "DUAL STREAM LIVE"
      ? "DUAL STREAM"
      : connection === "ESP32 USB LIVE"
      ? "ESP32 USB"
      : connection === "MATLAB LIVE"
      ? "MATLAB LIVE"
      : isLive
      ? "LIVE"
      : isOffline
      ? "OFFLINE"
      : connection === "CONNECTING"
      ? "WAITING"
      : connection === "MATLAB SIMULATION"
      ? "MATLAB"
      : "STANDBY";
  return (
    <section className={`live-status-bar ${isOffline ? "offline" : ""}`} aria-label="Live system status" aria-live="polite">
      <div className="live-status-item status-mode">
        <span className="status-icon" aria-hidden="true">
          {isOffline ? <WifiOff size={16} /> : <Wifi size={16} />}
        </span>
        <div>
          <small>MODE</small>
          <strong className="tabular-nums">{mode}</strong>
        </div>
      </div>
      <div className="live-status-item">
        <Clock3 size={16} aria-hidden="true" />
        <div>
          <small>LAST UPDATE</small>
          <strong className="tabular-nums">{age < 2 ? "Just now" : `${age}s ago`}</strong>
        </div>
      </div>
      <div className="live-status-item">
        <Gauge size={16} aria-hidden="true" />
        <div>
          <small>EFFICIENCY</small>
          <strong className="tabular-nums">{hasEff ? `${efficiency!.toFixed(1)}%` : "N/A"}</strong>
        </div>
      </div>
      <div className="live-status-item">
        <Activity size={16} aria-hidden="true" />
        <div>
          <small>POWER</small>
          <strong className="tabular-nums">{power.toFixed(2)} W</strong>
        </div>
      </div>
      <div className={`live-alert ${alert ? "warning" : "ok"}`} role="status">
        {alert ? <AlertTriangle size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
        <span>{alert ?? "All systems normal"}</span>
      </div>
    </section>
  );
}
