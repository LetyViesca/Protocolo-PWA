import { useState, useMemo } from "react";

type Category = "prehospitalario" | "limpieza" | "rescate" | "combustibles";
type Location = "Bodega Central" | "Ambulancia AMB-02" | "Estación Principal";

interface Supply {
  id: number;
  name: string;
  category: Category;
  location: Location;
  stock: number;
  min: number;
  unit: string;
}

const SEED: Supply[] = [
  { id: 1,  name: "Solución Salina 0.9% 500ml",  category: "prehospitalario", location: "Ambulancia AMB-02",    stock: 2,  min: 5,  unit: "bolsas" },
  { id: 2,  name: "Equipo de Venoclisis",          category: "prehospitalario", location: "Bodega Central",       stock: 18, min: 10, unit: "pzas" },
  { id: 3,  name: "Collar Cervical (talla M)",     category: "prehospitalario", location: "Ambulancia AMB-02",    stock: 1,  min: 3,  unit: "pzas" },
  { id: 4,  name: "Oxígeno Medicinal",             category: "prehospitalario", location: "Estación Principal",   stock: 4,  min: 6,  unit: "tanques" },
  { id: 5,  name: "Guantes de Látex (caja)",       category: "prehospitalario", location: "Ambulancia AMB-02",    stock: 3,  min: 4,  unit: "cajas" },
  { id: 6,  name: "Extintor ABC 6kg",              category: "rescate",         location: "Bodega Central",       stock: 0,  min: 3,  unit: "pzas" },
];

export function ControlAlmacen({ navBar }: { navBar?: React.ReactNode }) {
  const [supplies, setSupplies] = useState<Supply[]>(SEED);
  const [search, setSearch] = useState("");

  const adjust = (id: number, delta: number) => {
    setSupplies(ss => ss.map(s => s.id === id ? { ...s, stock: Math.max(0, s.stock + delta) } : s));
  };

  const filtered = useMemo(() => {
    return supplies.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  }, [supplies, search]);

  return (
    <div style={{ minHeight: "100dvh", background: "#f0f4f9", fontFamily: "'Inter', sans-serif" }}>
      {navBar}
      <div style={{ background: "linear-gradient(135deg, #0f2040 0%, #162b55 100%)", padding: "12px 16px 14px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", color: "#fff", fontSize: 18, fontWeight: 800 }}>
          Gestión de Almacén e Insumos 📦
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "16px auto", padding: "0 14px" }}>
        <input 
          placeholder="Buscar insumo..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          style={{ width: "100%", height: 46, padding: "0 14px", border: "1.5px solid #b8cfe8", borderRadius: 10, marginBottom: 14 }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(s => (
            <div key={s.id} style={{ background: "#fff", border: "1.5px solid #dce9f5", borderRadius: 12, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0a1628" }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>📍 {s.location} · Mín: {s.min} {s.unit}</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f0f4f9", padding: 4, borderRadius: 8 }}>
                <button onClick={() => adjust(s.id, -1)} style={{ width: 30, height: 30, border: "none", fontWeight: 800, cursor: "pointer" }}>-</button>
                <span style={{ fontSize: 14, fontWeight: 800, minWidth: 24, textAlign: "center" }}>{s.stock}</span>
                <button onClick={() => adjust(s.id, 1)} style={{ width: 30, height: 30, border: "none", fontWeight: 800, cursor: "pointer" }}>+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}