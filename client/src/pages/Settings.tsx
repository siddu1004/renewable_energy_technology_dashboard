import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Cable, Check, LockKeyhole, Radio, Save, ServerCog, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { LiquidGlassCard } from "@/components/visual/LiquidGlassCard";

export default function Settings() {
  const { isAuthenticated } = useAuth();
  const query = trpc.dashboard.settings.useQuery({ deviceKey: "array-a" });
  const save = trpc.dashboard.updateSettings.useMutation({ onSuccess: () => { toast.success("Controller settings saved"); query.refetch(); }, onError: (error) => toast.error(error.message) });
  const [form, setForm] = useState({ sampleRateHz: 20, isrPeriodUs: 10, websocketPort: 81, activeScenario: "S5", autoStopEnabled: true });
  useEffect(() => { const d = query.data as any; if (d) setForm({ sampleRateHz: d.sampleRateHz ?? 20, isrPeriodUs: d.isrPeriodUs ?? 10, websocketPort: d.websocketPort ?? 81, activeScenario: d.activeScenario ?? "S5", autoStopEnabled: Boolean(d.autoStopEnabled ?? true) }); }, [query.data]);
  const update = (key: keyof typeof form, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="subpage"><div className="subpage-heading"><div><span className="eyebrow">CONTROL PLANE / DEVICE CONFIG</span><h1>Controller settings</h1><p>Configuration writes are authenticated and stored against the Array A controller record.</p></div><div className="auth-badge"><LockKeyhole size={14} /> {isAuthenticated ? "operator authenticated" : "sign-in required to save"}</div></div><div className="settings-grid"><LiquidGlassCard className="settings-main"><div className="panel-heading"><div><span className="eyebrow">FIRMWARE TRANSPORT</span><h2>Runtime parameters</h2></div><ServerCog size={18} /></div><div className="field-grid"><label><span><Radio size={14} /> telemetry sample rate</span><div className="field-control"><input type="number" min="1" max="100" value={form.sampleRateHz} onChange={(event) => update("sampleRateHz", Number(event.target.value))} /><em>Hz</em></div><small>ESP32 Core 0 WebSocket broadcast cadence.</small></label><label><span><SlidersHorizontal size={14} /> ISR period</span><div className="field-control"><input type="number" min="1" max="1000" value={form.isrPeriodUs} onChange={(event) => update("isrPeriodUs", Number(event.target.value))} /><em>μs</em></div><small>Control loop interrupt period on Core 1.</small></label><label><span><Cable size={14} /> WebSocket port</span><div className="field-control"><input type="number" min="1" max="65535" value={form.websocketPort} onChange={(event) => update("websocketPort", Number(event.target.value))} /><em>TCP</em></div><small>Default firmware endpoint is ws://192.168.4.1:81.</small></label><label><span><Radio size={14} /> active scenario</span><select value={form.activeScenario} onChange={(event) => update("activeScenario", event.target.value)}><option value="S1">S1 · STC baseline</option><option value="S2">S2 · transient</option><option value="S3">S3 · thermal ramp</option><option value="S4">S4 · low irradiance</option><option value="S5">S5 · EKF vs P&O</option></select><small>Selected validation context for new samples.</small></label></div><div className="setting-toggle"><div><strong>Automatic safety stop</strong><p>Disable output when the live transport drops unexpectedly.</p></div><button className={`toggle ${form.autoStopEnabled ? "on" : ""}`} aria-pressed={form.autoStopEnabled} onClick={() => update("autoStopEnabled", !form.autoStopEnabled)}><span /></button></div><div className="settings-footer"><span><Check size={14} /> Schema validated before write</span><button className="button primary" disabled={!isAuthenticated || save.isPending} onClick={() => save.mutate({ deviceKey: "array-a", ...form })}>{isAuthenticated ? <><Save size={14} /> {save.isPending ? "saving…" : "save configuration"}</> : <><LockKeyhole size={14} /> sign in to save</>}</button></div></LiquidGlassCard><LiquidGlassCard className="settings-side"><span className="eyebrow">TRANSPORT CONTRACT</span><h2>ESP32 payload</h2><pre>{`{
  "v_pv": 17.48,
  "i_pv": 0.56,
  "p_pv": 9.79,
  "v_mp": 17.50,
  "i_ph": 0.60,
  "duty": 0.42
}`}</pre><div className="contract-note"><Check size={14} /> fixed field names · no client-side renames</div>{!isAuthenticated ? <button className="button subtle full" onClick={() => startLogin()}><LockKeyhole size={14} /> authenticate operator</button> : null}</LiquidGlassCard></div></div>;
}
