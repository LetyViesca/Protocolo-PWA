import { useState } from "react";
import { dbOffline } from '../../servicios/dbOffline';

type Tab = "general" | "pacientes" | "insumos" | "cierre";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "pacientes", label: "Pacientes" },
  { id: "insumos", label: "Insumos" },
  { id: "cierre", label: "Cierre" },
];

export function ReporteCampo({ navBar }: { navBar?: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const activeIndex = TABS.findIndex(t => t.id === activeTab);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f9", paddingBottom: "100px", fontFamily: "sans-serif" }}>
      {navBar}

      {/* ENCABEZADO */}
      <div style={{ maxWidth: "800px", margin: "16px auto", padding: "0 16px" }}>
        <div style={{ background: "#0a1628", color: "white", padding: "16px", borderRadius: "12px", display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#60a5fa", fontWeight: "bold" }}>SCE · PREHOSPITALARIO</div>
            <h1 style={{ margin: 0, fontSize: "20px" }}>Reporte de Atención en Campo</h1>
          </div>
          <div style={{ background: "#162b55", padding: "6px 12px", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "bold" }}>UNIDAD: AMB-02</span>
          </div>
        </div>

        {/* PESTAÑAS SUPERIORES */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", background: "white", padding: "8px", borderRadius: "12px", marginTop: "12px" }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px",
                borderRadius: "8px",
                border: "none",
                fontWeight: "bold",
                cursor: "pointer",
                background: activeTab === tab.id ? "#162b55" : "#f1f5f9",
                color: activeTab === tab.id ? "white" : "#334155"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENIDO DE CADA SECCION */}
        <div style={{ background: "white", padding: "24px", borderRadius: "12px", marginTop: "16px", border: "1px solid #cbd5e1" }}>
          {activeTab === "general" && <h2>📋 Sección 1: Datos Generales e Incidentes</h2>}
          {activeTab === "pacientes" && <h2>👤 Sección 2: Registro de Pacientes y Triage</h2>}
          {activeTab === "insumos" && <h2>🧰 Sección 3: Insumos Utilizados</h2>}
          {activeTab === "cierre" && <h2>✅ Sección 4: Cierre y Firma del Reporte</h2>}
        </div>
      </div>

      {/* BARRA FLOTANTE DE BOTONES INFERIORES */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "white",
        borderTop: "2px solid #cbd5e1",
        padding: "16px",
        boxShadow: "0 -4px 12px rgba(0,0,0,0.15)",
        zIndex: 99999
      }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", gap: "12px" }}>
          <button
            type="button"
            onClick={() => {
              if (activeIndex > 0) setActiveTab(TABS[activeIndex - 1].id);
            }}
            disabled={activeIndex === 0}
            style={{
              flex: 1,
              height: "48px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              fontWeight: "bold",
              fontSize: "15px",
              cursor: activeIndex === 0 ? "not-allowed" : "pointer",
              background: activeIndex === 0 ? "#f1f5f9" : "#ffffff",
              color: activeIndex === 0 ? "#94a3b8" : "#0f172a"
            }}
          >
            ← Anterior
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeIndex < TABS.length - 1) {
                setActiveTab(TABS[activeIndex + 1].id);
              } else {
                alert("¡Reporte Guardado Exitosamente!");
              }
            }}
            style={{
              flex: 1,
              height: "48px",
              borderRadius: "10px",
              border: "none",
              fontWeight: "bold",
              fontSize: "15px",
              cursor: "pointer",
              background: activeTab === "cierre" ? "#16a34a" : "#dc2626",
              color: "white"
            }}
          >
            {activeTab !== "cierre" ? `Siguiente: ${TABS[activeIndex + 1]?.label} →` : "✅ Guardar Reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}