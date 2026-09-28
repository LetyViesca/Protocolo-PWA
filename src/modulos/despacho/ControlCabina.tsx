import { useState, useEffect } from "react";

type IncidentType = "vehicular" | "incendio" | "medica" | "parto" | "rescate" | "";
type CallStatus = "camino" | "atencion" | "finalizado";

interface ActiveCall {
  id: string;
  folio: string;
  hora: string;
  ubicacion: string;
  tipo: IncidentType;
  unidad: string;
  status: CallStatus;
}

const INCIDENT_TYPES: { id: IncidentType; label: string; icon: string; color: string }[] = [
  { id: "vehicular", label: "Acc. Vehicular", icon: "🚗", color: "#dc2626" },
  { id: "incendio",  label: "Incendio",       icon: "🔥", color: "#ea580c" },
  { id: "medica",    label: "Emerg. Médica",  icon: "🫀", color: "#7c3aed" },
  { id: "parto",     label: "Parto",          icon: "👶", color: "#db2777" },
  { id: "rescate",   label: "Rescate",        icon: "⛑️", color: "#0369a1" },
];

const UNITS = ["AMB-01", "AMB-02", "AMB-03", "BOMBA R-1", "BOMBA R-2", "RESCATE-01", "MOTO-01"];

const SEED_CALLS: ActiveCall[] = [
  { id: "1", folio: "INC-2026-0899", hora: "08:14", ubicacion: "Av. Constitución 2310, Col. Centro", tipo: "vehicular", unidad: "AMB-01", status: "atencion" },
  { id: "2", folio: "INC-2026-0900", hora: "09:02", ubicacion: "Calle Morelos 88, Col. Moderna",    tipo: "incendio",  unidad: "BOMBA R-1", status: "camino" },
  { id: "3", folio: "INC-2026-0901", hora: "09:47", ubicacion: "Blvd. Díaz Ordaz 510, Local 4",    tipo: "medica",    unidad: "AMB-03",   status: "finalizado" },
];

function nowTime() {
  return new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ControlCabina({ online = true, navBar }: { online?: boolean; navBar?: React.ReactNode }) {
  const [calls, setCalls] = useState<ActiveCall[]>(SEED_CALLS);
  const [dispatched, setDispatched] = useState(false);
  const [reportante, setReportante] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [tipo, setTipo] = useState<IncidentType>("");
  const [unidad, setUnidad] = useState("");
  const [clock, setClock] = useState(nowTime());

  useEffect(() => {
    const t = setInterval(() => setClock(nowTime()), 30000);
    return () => clearInterval(t);
  }, []);

  const handleDispatch = () => {
    if (!unidad || !tipo || !direccion) return;
    const newCall: ActiveCall = {
      id: Date.now().toString(),
      folio: "INC-2026-" + String(Math.floor(Math.random() * 9000) + 1000),
      hora: clock,
      ubicacion: direccion,
      tipo,
      unidad,
      status: "camino",
    };
    setCalls(prev => [newCall, ...prev]);
    setDispatched(true);
    setTimeout(() => setDispatched(false), 3000);
    setReportante(""); setTelefono(""); setDireccion(""); setTipo(""); setUnidad("");
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f0f4f9", fontFamily: "'Inter', sans-serif" }}>
      {navBar}
      <div style={{ background: "linear-gradient(135deg, #0f2040 0%, #162b55 100%)", padding: "14px 20px 16px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#4a7ab5", fontWeight: 600 }}>Cabina de Despacho</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#fff" }}>Control de Emergencias 📡</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "16px auto", padding: "0 16px" }}>
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #dce9f5", padding: 18, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0a1628", marginBottom: 12 }}>Nueva Llamada de Emergencia</h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input placeholder="Quien llama" value={reportante} onChange={e => setReportante(e.target.value)} style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
            <input placeholder="Teléfono" value={telefono} onChange={e => setTelefono(e.target.value)} style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
          </div>

          <input placeholder="Dirección del Incidente *" value={direccion} onChange={e => setDireccion(e.target.value)} style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, marginBottom: 12 }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}>
            {INCIDENT_TYPES.map(t => (
              <button key={t.id} onClick={() => setTipo(t.id)} style={{ padding: 8, borderRadius: 8, border: `2px solid ${tipo === t.id ? t.color : "#b8cfe8"}`, background: tipo === t.id ? t.color + "14" : "#fff", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
                <span style={{ fontSize: 18, display: "block" }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {UNITS.map(u => (
              <button key={u} onClick={() => setUnidad(u)} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${unidad === u ? "#162b55" : "#b8cfe8"}`, background: unidad === u ? "#162b55" : "#fff", color: unidad === u ? "#fff" : "#162b55", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                {u}
              </button>
            ))}
          </div>

          <button onClick={handleDispatch} disabled={!tipo || !direccion || !unidad} style={{ width: "100%", height: 50, background: (!tipo || !direccion || !unidad) ? "#94a3b8" : "#dc2626", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
            {dispatched ? "✅ Unidades Despachadas" : "📡 Despachar Unidad"}
          </button>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #dce9f5", padding: 18 }}>
          <h4 style={{ fontSize: 14, fontWeight: 800, color: "#0a1628", marginBottom: 10 }}>Llamadas Activas ({calls.length})</h4>
          {calls.map(c => (
            <div key={c.id} style={{ borderBottom: "1px solid #dce9f5", padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0a1628" }}>{c.folio} · {c.unidad}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{c.ubicacion}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 12, background: "#fef3c7", color: "#78350f" }}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}