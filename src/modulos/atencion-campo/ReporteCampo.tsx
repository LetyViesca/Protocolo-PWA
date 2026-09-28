import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "general" | "pacientes" | "insumos" | "cierre";
type Triage = "rojo" | "amarillo" | "verde" | "negro" | "";
type Sexo = "M" | "F" | "";

interface VitalRow {
  id: number;
  hora: string;
  fr: string;
  fc: string;
  ta: string;
  spo2: string;
  temp: string;
  glucosa: string;
}

interface Paciente {
  id: number;
  nombre: string;
  edad: string;
  sexo: Sexo;
  triage: Triage;
  vitales: VitalRow[];
  parto: boolean;
  gineco: {
    semanas: string;
    gestas: string;
    horaNacimiento: string;
    estadoProducto: "vivo" | "obito";
    apgar: string;
    silverman: string;
  };
  traslado: boolean;
  hospitalReceptor: string;
  medicoRecibe: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowTime() {
  return new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function makeVital(id: number): VitalRow {
  return { id, hora: nowTime(), fr: "", fc: "", ta: "", spo2: "", temp: "", glucosa: "" };
}

function makePaciente(id: number): Paciente {
  return {
    id,
    nombre: "",
    edad: "",
    sexo: "",
    triage: "",
    vitales: [makeVital(1)],
    parto: false,
    gineco: { semanas: "", gestas: "", horaNacimiento: nowTime(), estadoProducto: "vivo", apgar: "", silverman: "" },
    traslado: false,
    hospitalReceptor: "",
    medicoRecibe: "",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#162b55", marginBottom: 6 }}>
      {children}{required && <span style={{ color: "#dc2626", marginLeft: 3 }}>*</span>}
    </label>
  );
}

function FieldInput({
  placeholder,
  value,
  onChange,
  type = "text",
  style: extra,
}: {
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%",
        minHeight: 48,
        padding: "0 14px",
        border: "1.5px solid #b8cfe8",
        borderRadius: 10,
        fontSize: 14,
        fontFamily: "'Inter', sans-serif",
        color: "#0a1628",
        background: "#fff",
        outline: "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
        ...extra,
      }}
      onFocus={e => { e.target.style.borderColor = "#1e3a6e"; e.target.style.boxShadow = "0 0 0 3px rgba(30,58,110,0.1)"; }}
      onBlur={e => { e.target.style.borderColor = "#b8cfe8"; e.target.style.boxShadow = "none"; }}
    />
  );
}

function Toggle({ value, onChange, label, accent = "#162b55" }: { value: boolean; onChange: (v: boolean) => void; label: string; accent?: string }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}
      onClick={() => onChange(!value)}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: "#162b55", flex: 1 }}>{label}</span>
      <div
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          background: value ? accent : "#cbd5e1",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            left: value ? 23 : 3,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
          }}
        />
      </div>
    </div>
  );
}

const TRIAGE_OPTIONS: { id: Triage; label: string; emoji: string; color: string; bg: string; border: string }[] = [
  { id: "rojo",     label: "Rojo",     emoji: "🔴", color: "#fff",    bg: "#dc2626", border: "#dc2626" },
  { id: "amarillo", label: "Amarillo", emoji: "🟡", color: "#78350f", bg: "#fde68a", border: "#d97706" },
  { id: "verde",    label: "Verde",    emoji: "🟢", color: "#fff",    bg: "#16a34a", border: "#16a34a" },
  { id: "negro",    label: "Negro",    emoji: "⬛", color: "#fff",    bg: "#111827", border: "#111827" },
];

const TABS: { id: Tab; label: string; num: number }[] = [
  { id: "general",   label: "General",   num: 1 },
  { id: "pacientes", label: "Pacientes", num: 2 },
  { id: "insumos",   label: "Insumos",   num: 3 },
  { id: "cierre",    label: "Cierre",    num: 4 },
];

function Stepper({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <div style={{ display: "flex", background: "#0f2040", borderBottom: "1px solid #1e3a6e" }}>
      {TABS.map((tab, i) => {
        const isActive = tab.id === active;
        const isPast = TABS.findIndex(t => t.id === active) > i;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              flex: 1,
              minHeight: 56,
              background: isActive ? "#fff" : "transparent",
              border: "none",
              borderTop: isActive ? "3px solid #dc2626" : "3px solid transparent",
              cursor: "pointer",
              padding: "8px 4px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              transition: "background 0.15s",
              fontFamily: "'Inter', sans-serif",
              position: "relative",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: isActive ? "#dc2626" : isPast ? "#16a34a" : "#1e3a6e",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isPast ? "✓" : tab.num}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "#162b55" : isPast ? "#4ade80" : "#4a7ab5",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function VitalsTable({ vitales, onChange }: { vitales: VitalRow[]; onChange: (v: VitalRow[]) => void }) {
  const cols: { key: keyof VitalRow; label: string; placeholder: string; width: number }[] = [
    { key: "hora",    label: "Hora",    placeholder: "HH:MM", width: 56 },
    { key: "fr",      label: "FR",      placeholder: "rpm",   width: 44 },
    { key: "fc",      label: "FC",      placeholder: "lpm",   width: 44 },
    { key: "ta",      label: "TA",      placeholder: "mmHg",  width: 60 },
    { key: "spo2",    label: "SpO₂",   placeholder: "%",     width: 44 },
    { key: "temp",    label: "Temp",    placeholder: "°C",    width: 44 },
    { key: "glucosa", label: "Gluc",    placeholder: "mg/dL", width: 52 },
  ];

  const updateCell = (rowId: number, key: keyof VitalRow, val: string) => {
    onChange(vitales.map(v => v.id === rowId ? { ...v, [key]: val } : v));
  };

  const addRow = () => onChange([...vitales, makeVital(Date.now())]);

  const removeRow = (id: number) => {
    if (vitales.length === 1) return;
    onChange(vitales.filter(v => v.id !== id));
  };

  return (
    <div>
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1.5px solid #b8cfe8" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
          <thead>
            <tr style={{ background: "#0f2040" }}>
              {cols.map(c => (
                <th key={c.key} style={{ padding: "8px 6px", fontSize: 10, fontWeight: 700, color: "#b8cfe8", letterSpacing: "0.06em", textAlign: "center", whiteSpace: "nowrap", width: c.width }}>
                  {c.label}
                </th>
              ))}
              <th style={{ width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {vitales.map((row, ri) => (
              <tr key={row.id} style={{ background: ri % 2 === 0 ? "#f8fafc" : "#fff", borderTop: "1px solid #dce9f5" }}>
                {cols.map(c => (
                  <td key={c.key} style={{ padding: "4px 4px" }}>
                    <input
                      value={row[c.key] as string}
                      onChange={e => updateCell(row.id, c.key, e.target.value)}
                      placeholder={c.placeholder}
                      style={{ width: "100%", height: 36, border: "none", background: "transparent", textAlign: "center", fontSize: 12, fontFamily: "'Inter', sans-serif", color: "#0a1628", outline: "none" }}
                    />
                  </td>
                ))}
                <td style={{ padding: "4px 4px", textAlign: "center" }}>
                  <button onClick={() => removeRow(row.id)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 14, cursor: "pointer", padding: 4 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, background: "none", border: "1.5px dashed #4a7ab5", borderRadius: 8, color: "#1e3a6e", fontSize: 13, fontWeight: 600, padding: "8px 14px", cursor: "pointer", width: "100%", justifyContent: "center" }}>
        + Nueva Toma de Signos
      </button>
    </div>
  );
}

function PlaceholderTab({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#162b55", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, color: "#64748b" }}>{desc}</div>
    </div>
  );
}

// Exportación como componente modular
export function ReporteCampo({ navBar }: { navBar?: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<Tab>("pacientes");
  const [pacientes, setPacientes] = useState<Paciente[]>([makePaciente(1)]);
  const [activePacienteId, setActivePacienteId] = useState(1);

  const rawPac = pacientes.find(p => p.id === activePacienteId)!;
  const pac: Paciente = {
    ...rawPac,
    gineco: rawPac.gineco ?? { semanas: "", gestas: "", horaNacimiento: nowTime(), estadoProducto: "vivo", apgar: "", silverman: "" },
  };

  const updatePac = (patch: Partial<Paciente>) => {
    setPacientes(ps => ps.map(p => p.id === activePacienteId ? { ...p, ...patch } : p));
  };

  const addPaciente = () => {
    const id = Date.now();
    setPacientes(ps => [...ps, makePaciente(id)]);
    setActivePacienteId(id);
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f0f4f9", fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 50 }}>
        {navBar}
        <div style={{ background: "#0a1628", boxShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "6px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: "#4a7ab5", fontWeight: 600, letterSpacing: "0.06em" }}>SCE · REPORTE PREHOSPITALARIO</div>
            <div style={{ background: "#162b55", border: "1px solid #1e3a6e", borderRadius: 8, padding: "3px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#4a7ab5", fontWeight: 600, letterSpacing: "0.08em" }}>UNIDAD</div>
              <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>AMB-02</div>
            </div>
          </div>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <Stepper active={activeTab} onSelect={setActiveTab} />
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", maxWidth: 640, margin: "0 auto", width: "100%", padding: "16px 16px 120px" }}>
        {activeTab === "general" && <PlaceholderTab icon="📋" title="Datos Generales del Incidente" desc="Folio, fecha, ubicación del incidente y datos del equipo respondiente." />}
        {activeTab === "pacientes" && (
          <div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16 }}>
              {pacientes.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setActivePacienteId(p.id)}
                  style={{
                    flexShrink: 0, minHeight: 44, padding: "6px 14px", borderRadius: 10,
                    border: `1.5px solid ${activePacienteId === p.id ? "#162b55" : "#b8cfe8"}`,
                    background: activePacienteId === p.id ? "#162b55" : "#fff",
                    color: activePacienteId === p.id ? "#fff" : "#162b55",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {p.triage === "rojo" && <span>🔴</span>}
                  {p.triage === "amarillo" && <span>🟡</span>}
                  {p.triage === "verde" && <span>🟢</span>}
                  {p.triage === "negro" && <span>⬛</span>}
                  {!p.triage && <span style={{ fontSize: 10 }}>👤</span>}
                  <span>{p.nombre.trim() ? p.nombre.split(" ")[0] : `Paciente ${i + 1}`}</span>
                </button>
              ))}
              <button onClick={addPaciente} style={{ flexShrink: 0, minHeight: 44, padding: "6px 14px", borderRadius: 10, border: "1.5px dashed #4a7ab5", background: "transparent", color: "#1e3a6e", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                + Agregar
              </button>
            </div>

            <div style={{ background: "#162b55", borderRadius: "12px 12px 0 0", padding: "12px 18px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{pac.triage === "rojo" ? "🔴" : pac.triage === "amarillo" ? "🟡" : pac.triage === "verde" ? "🟢" : pac.triage === "negro" ? "⬛" : "👤"}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{pac.nombre.trim() || "Paciente sin nombre"}</div>
                <div style={{ fontSize: 11, color: "#4a7ab5" }}>{pac.edad ? `${pac.edad} años` : "Edad no registrada"} · {pac.sexo === "M" ? "Masculino" : pac.sexo === "F" ? "Femenino" : "Sexo no indicado"}</div>
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid #dce9f5", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "20px 18px", marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <Label required>Nombre Completo</Label>
                <FieldInput placeholder="Nombre(s) y Apellidos" value={pac.nombre} onChange={v => updatePac({ nombre: v })} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <Label required>Edad</Label>
                  <FieldInput type="number" placeholder="años" value={pac.edad} onChange={v => updatePac({ edad: v })} />
                </div>
                <div>
                  <Label required>Sexo</Label>
                  <div style={{ display: "flex", gap: 8, height: 48 }}>
                    {(["M", "F"] as Sexo[]).map(s => (
                      <button key={s} onClick={() => updatePac({ sexo: s })} style={{ flex: 1, height: 48, border: `1.5px solid ${pac.sexo === s ? "#162b55" : "#b8cfe8"}`, borderRadius: 10, background: pac.sexo === s ? "#162b55" : "#fff", color: pac.sexo === s ? "#fff" : "#162b55", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                        {s === "M" ? "♂ M" : "♀ F"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <Label required>Clasificación Triage</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  {TRIAGE_OPTIONS.map(opt => (
                    <button key={opt.id} onClick={() => updatePac({ triage: opt.id })} style={{ minHeight: 56, border: `2px solid ${pac.triage === opt.id ? opt.border : "#b8cfe8"}`, borderRadius: 10, background: pac.triage === opt.id ? opt.bg : "#fff", color: pac.triage === opt.id ? opt.color : "#162b55", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "6px 4px" }}>
                      <span style={{ fontSize: 18 }}>{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <Label>Signos Vitales en Campo</Label>
                <VitalsTable vitales={pac.vitales} onChange={v => updatePac({ vitales: v })} />
              </div>
            </div>
          </div>
        )}
        {activeTab === "insumos" && <PlaceholderTab icon="🧰" title="Registro de Insumos Utilizados" desc="Medicamentos, material de curación y equipos empleados." />}
        {activeTab === "cierre" && <PlaceholderTab icon="✅" title="Cierre y Firma de Reporte" desc="Revisión final y firma digital del paramédico." />}
      </div>
    </div>
  );
}