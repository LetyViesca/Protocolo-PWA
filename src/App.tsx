import React, { useState, useEffect, useMemo } from "react";

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Screen = "inicio" | "login" | "registroOpciones" | "registro" | "registroUsuario" | "seleccionarAsociacion" | "gestionSolicitudes" | "campo" | "despacho" | "inventario";
type RequestStatus = "Pendiente de Aprobación" | "Aceptada" | "Rechazada";
type UserRole = "Director" | "Paramédico" | "Bombero" | "Comandante" | "Administrativo" | "Socorrista" | "Apoyo Logístico" | "Atención Comunitaria" | "Despachador";
type OperationalScreen = "campo" | "despacho" | "inventario";
type InventoryAccess = "none" | "read" | "consume" | "manage";

interface RolePermissions {
  screens: OperationalScreen[];
  canEditCampo: boolean;
  canEditDespacho: boolean;
  inventory: InventoryAccess;
  canManageRequests: boolean;
}

interface AssociationRequest {
  id: string;
  userEmail: string;
  status: RequestStatus;
  role: UserRole;
}

interface Association {
  id: string;
  name: string;
  code: string;
  directorEmail: string;
  requests: AssociationRequest[];
}

function getRolePermissions(role: UserRole | null): RolePermissions {
  const normalizedRole = role?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  switch (normalizedRole) {
    case "director":
    case "comandante":
      return { screens: ["campo", "despacho", "inventario"], canEditCampo: true, canEditDespacho: true, inventory: "manage", canManageRequests: true };
    case "paramedico":
    case "socorrista":
      return { screens: ["campo", "inventario"], canEditCampo: true, canEditDespacho: false, inventory: "read", canManageRequests: false };
    case "despachador":
      return { screens: ["campo", "despacho"], canEditCampo: false, canEditDespacho: true, inventory: "none", canManageRequests: false };
    case "bombero":
      return { screens: ["campo", "despacho", "inventario"], canEditCampo: false, canEditDespacho: false, inventory: "consume", canManageRequests: false };
    case "administrativo":
    case "apoyo logistico":
      return { screens: ["campo", "inventario"], canEditCampo: false, canEditDespacho: false, inventory: "manage", canManageRequests: false };
    case "atencion comunitaria":
      return { screens: ["campo"], canEditCampo: false, canEditDespacho: false, inventory: "none", canManageRequests: false };
    default:
      return { screens: [], canEditCampo: false, canEditDespacho: false, inventory: "none", canManageRequests: false };
  }
}
type InstitutionType = "gubernamental" | "iap" | "independiente" | "";
type BiometricState = "idle" | "scanning" | "verified" | "failed";
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

type Category = "todos" | "prehospitalario" | "limpieza" | "rescate" | "combustibles";

interface Supply {
  id: number;
  name: string;
  category: Exclude<Category, "todos">;
  location: string;
  stock: number;
  min: number;
  unit: string;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function nowDate() {
  return new Date().toISOString().split("T")[0];
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

// ─── COMPONENTE: NAVEGACIÓN GLOBAL ───────────────────────────────────────────
function GlobalNavBar({ screen, setScreen, online, isAuthenticated, role, hasActiveAssociation }: { screen: Screen; setScreen: (s: Screen) => void; online: boolean; isAuthenticated: boolean; role: UserRole | null; hasActiveAssociation: boolean }) {
  if (!isAuthenticated || !hasActiveAssociation) return null;

  const availableScreens: { id: Screen; label: string; icon: string }[] = [
    { id: "campo",      label: "Campo",    icon: "🚑" },
    { id: "despacho",   label: "Despacho", icon: "📡" },
    { id: "inventario", label: "Almacén",  icon: "📦" },
    ...(getRolePermissions(role).canManageRequests ? [{ id: "gestionSolicitudes" as Screen, label: "Solicitudes", icon: "👥" }] : []),
  ];
  const screens = availableScreens.filter(item =>
    item.id === "gestionSolicitudes" || getRolePermissions(role).screens.includes(item.id as OperationalScreen)
  );

  return (
    <header style={{ background: "#0a1628", position: "sticky", top: 0, zIndex: 1000, boxShadow: "0 2px 14px rgba(0,0,0,0.4)", borderBottom: "1px solid #1e3a6e" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <nav style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto" }}>
          {screens.map(s => {
            const isActive = screen === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScreen(s.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: isActive ? "#dc2626" : "transparent",
                  color: isActive ? "#fff" : "#b8cfe8",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 5, background: online ? "rgba(22,163,74,0.15)" : "rgba(217,119,6,0.15)", border: `1px solid ${online ? "rgba(22,163,74,0.3)" : "rgba(217,119,6,0.3)"}`, borderRadius: 20, padding: "4px 8px", flexShrink: 0 }}>
          <span style={{ fontSize: 8 }}>{online ? "🟢" : "🟡"}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: online ? "#4ade80" : "#fbbf24" }}>{online ? "Conectado" : "Offline"}</span>
        </div>
      </div>
    </header>
  );
}

function InicioScreen({ goToLogin, goToRegister }: { goToLogin: () => void; goToRegister: () => void }) {
  return (
    <div style={{ maxWidth: 480, margin: "48px auto", padding: "0 16px" }}>
      <div style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 16, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🚑</div>
        <h1 style={{ color: "#0a1628", fontSize: 22, margin: "0 0 8px" }}>Sistema de Emergencias</h1>
        <p style={{ color: "#475569", fontSize: 14, margin: "0 0 24px" }}>Inicia sesión o crea una cuenta para continuar.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={goToLogin} style={{ minHeight: 50, background: "#162b55", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            🔑 Iniciar Sesión
          </button>
          <button onClick={goToRegister} style={{ minHeight: 50, background: "#fff", color: "#162b55", border: "1.5px solid #b8cfe8", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            📝 Registrarse
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, goBack }: { onLogin: (email: string) => void; goBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLogin(email.trim());
  };

  return (
    <div style={{ maxWidth: 480, margin: "48px auto", padding: "0 16px" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 16, padding: 24 }}>
        <h1 style={{ color: "#0a1628", fontSize: 22, margin: "0 0 20px" }}>Iniciar Sesión</h1>
        <label style={{ display: "block", color: "#162b55", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>CORREO ELECTRÓNICO</label>
        <input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, marginBottom: 16 }} />
        <label style={{ display: "block", color: "#162b55", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>CONTRASEÑA</label>
        <input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, marginBottom: 20 }} />
        <button type="submit" style={{ width: "100%", minHeight: 48, background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Entrar</button>
        <button type="button" onClick={goBack} style={{ width: "100%", minHeight: 44, background: "transparent", color: "#162b55", border: "none", fontWeight: 700, cursor: "pointer", marginTop: 8 }}>← Volver al inicio</button>
      </form>
    </div>
  );
}

function RegistroChoiceScreen({ goToAssociation, goToUser, goBack }: { goToAssociation: () => void; goToUser: () => void; goBack: () => void }) {
  return (
    <div style={{ maxWidth: 480, margin: "48px auto", padding: "0 16px" }}>
      <div style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 16, padding: 24 }}>
        <h1 style={{ color: "#0a1628", fontSize: 22, margin: "0 0 8px" }}>Crear una cuenta</h1>
        <p style={{ color: "#475569", fontSize: 14, margin: "0 0 24px" }}>Selecciona el tipo de registro que deseas realizar.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={goToAssociation} style={{ minHeight: 50, background: "#162b55", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🏛️ Registrar Asociación</button>
          <button onClick={goToUser} style={{ minHeight: 50, background: "#fff", color: "#162b55", border: "1.5px solid #b8cfe8", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>👤 Registrar Usuario</button>
          <button onClick={goBack} style={{ minHeight: 44, background: "transparent", color: "#162b55", border: "none", fontWeight: 700, cursor: "pointer" }}>← Volver al inicio</button>
        </div>
      </div>
    </div>
  );
}

function SeleccionarAsociacionScreen({ associations, userEmail, onRequest, onLogout }: {
  associations: Association[];
  userEmail: string;
  onRequest: (associationId: string) => void;
  onLogout: () => void;
}) {
  const [associationCode, setAssociationCode] = useState("");
  const [message, setMessage] = useState("");
  const requestFor = (association: Association) => association.requests.find(request => request.userEmail === userEmail);
  const requestedAssociation = associations.find(association => requestFor(association)?.status === "Pendiente de Aprobación");

  const submitCode = () => {
    const match = associations.find(association => association.code.toLowerCase() === associationCode.trim().toLowerCase());
    if (!match) {
      setMessage("No se encontró una asociación con ese código.");
      return;
    }
    const existingRequest = requestFor(match);
    if (existingRequest && existingRequest.status !== "Rechazada") {
      setMessage(`Tu solicitud para ${match.name} está: ${existingRequest.status}.`);
      return;
    }
    onRequest(match.id);
    setMessage(`Solicitud enviada a ${match.name}. Estado: Pendiente de Aprobación.`);
  };

  return (
    <div style={{ maxWidth: 680, margin: "32px auto", padding: "0 16px 40px" }}>
      <section style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 16, padding: 24 }}>
        <h1 style={{ color: "#0a1628", fontSize: 22, margin: "0 0 8px" }}>Seleccionar Asociación</h1>
        <p style={{ color: "#475569", margin: "0 0 20px" }}>Solicita acceso a una asociación para continuar. El Director deberá aprobar tu solicitud.</p>
        {requestedAssociation && (
          <div style={{ background: "#fef3c7", color: "#78350f", borderRadius: 8, padding: 12, marginBottom: 16, fontWeight: 700 }}>
            Solicitud en espera de aprobación por el Director de {requestedAssociation.name}.
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          <input value={associationCode} onChange={event => setAssociationCode(event.target.value)} placeholder="Ej. SCE-X892A" aria-label="Código de Asociación" style={{ flex: "1 1 220px", minHeight: 44, boxSizing: "border-box", padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
          <button type="button" onClick={submitCode} disabled={!associationCode.trim()} style={{ minHeight: 44, padding: "0 16px", background: "#162b55", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: associationCode.trim() ? "pointer" : "not-allowed" }}>Usar código</button>
        </div>
        {message && <p role="status" style={{ color: "#162b55", fontWeight: 600 }}>{message}</p>}
        <h2 style={{ color: "#162b55", fontSize: 15, margin: "0 0 10px" }}>Asociaciones disponibles</h2>
        {associations.length === 0 ? (
          <p style={{ color: "#64748b" }}>Aún no hay asociaciones registradas disponibles. Solicita un código al Director de tu asociación.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {associations.map(association => {
              const request = requestFor(association);
              return (
                <div key={association.id} style={{ border: "1px solid #dce9f5", borderRadius: 10, padding: 14, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ color: "#0a1628", fontWeight: 700 }}>{association.name}</div>
                    <div style={{ color: "#475569", fontSize: 12 }}>Código: {association.code}</div>
                    {request && <div style={{ color: request.status === "Pendiente de Aprobación" ? "#92400e" : "#475569", fontSize: 12, fontWeight: 700, marginTop: 4 }}>{request.status}{request.status === "Aceptada" ? ` · ${request.role}` : ""}</div>}
                  </div>
                  <button type="button" onClick={() => { onRequest(association.id); setMessage(`Solicitud enviada a ${association.name}. Estado: Pendiente de Aprobación.`); }} disabled={Boolean(request && request.status !== "Rechazada")} style={{ minHeight: 40, padding: "0 12px", background: request && request.status !== "Rechazada" ? "#e2e8f0" : "#dc2626", color: request && request.status !== "Rechazada" ? "#475569" : "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: request && request.status !== "Rechazada" ? "not-allowed" : "pointer" }}>
                    {request?.status === "Pendiente de Aprobación" ? "Solicitud pendiente" : request?.status === "Aceptada" ? "Mi asociación" : "Solicitar ingreso"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" onClick={onLogout} style={{ marginTop: 20, minHeight: 42, background: "transparent", color: "#162b55", border: "none", fontWeight: 700, cursor: "pointer" }}>Cerrar sesión</button>
      </section>
    </div>
  );
}

function GestionSolicitudesScreen({ associations, directorEmail, onUpdateRequest }: {
  associations: Association[];
  directorEmail: string;
  onUpdateRequest: (associationId: string, requestId: string, status: RequestStatus, role: UserRole) => void;
}) {
  const directorAssociations = associations.filter(association => association.directorEmail.toLowerCase() === directorEmail.toLowerCase());
  const roles: UserRole[] = ["Paramédico", "Bombero", "Comandante", "Despachador", "Administrativo", "Socorrista", "Apoyo Logístico", "Atención Comunitaria"];

  return (
    <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 16px 40px" }}>
      <h1 style={{ color: "#0a1628", fontSize: 22 }}>Gestión de Solicitudes</h1>
      {directorAssociations.length === 0 && <p style={{ color: "#475569" }}>No hay asociaciones registradas a tu nombre como Director.</p>}
      {directorAssociations.map(association => (
        <section key={association.id} style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <h2 style={{ color: "#162b55", fontSize: 16, margin: "0 0 12px" }}>{association.name}</h2>
          <p style={{ color: "#475569", fontSize: 12, margin: "0 0 16px" }}>Código de asociación: {association.code}</p>
          <h3 style={{ color: "#162b55", fontSize: 14 }}>Solicitudes pendientes</h3>
          {association.requests.filter(request => request.status === "Pendiente de Aprobación").length === 0 ? (
            <p style={{ color: "#64748b" }}>No hay solicitudes pendientes.</p>
          ) : association.requests.filter(request => request.status === "Pendiente de Aprobación").map(request => (
            <RequestReview key={request.id} association={association} request={request} roles={roles} onUpdate={onUpdateRequest} />
          ))}
          {association.requests.some(request => request.status === "Aceptada") && (
            <>
              <h3 style={{ color: "#162b55", fontSize: 14, marginTop: 20 }}>Miembros y roles</h3>
              {association.requests.filter(request => request.status === "Aceptada").map(request => (
                <RequestReview key={request.id} association={association} request={request} roles={roles} onUpdate={onUpdateRequest} />
              ))}
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function RequestReview({ association, request, roles, onUpdate }: {
  association: Association;
  request: AssociationRequest;
  roles: UserRole[];
  onUpdate: (associationId: string, requestId: string, status: RequestStatus, role: UserRole) => void;
}) {
  const [role, setRole] = useState<UserRole>(request.role);
  useEffect(() => setRole(request.role), [request.role]);
  return (
    <div style={{ borderTop: "1px solid #dce9f5", padding: "14px 0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <div style={{ flex: "1 1 180px", color: "#0a1628", fontWeight: 600 }}>{request.userEmail}</div>
      <select value={role} onChange={event => setRole(event.target.value as UserRole)} aria-label={`Rol para ${request.userEmail}`} style={{ minHeight: 40, border: "1px solid #b8cfe8", borderRadius: 8, padding: "0 8px", color: "#0a1628", background: "#fff", fontWeight: 600 }}>
        {roles.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
      {request.status === "Pendiente de Aprobación" ? (
        <>
          <button type="button" onClick={() => onUpdate(association.id, request.id, "Aceptada", role)} style={{ minHeight: 40, padding: "0 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Aceptar</button>
          <button type="button" onClick={() => onUpdate(association.id, request.id, "Rechazada", role)} style={{ minHeight: 40, padding: "0 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Rechazar</button>
        </>
      ) : (
        <button type="button" onClick={() => onUpdate(association.id, request.id, "Aceptada", role)} style={{ minHeight: 40, padding: "0 12px", background: "#162b55", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Guardar rol</button>
      )}
    </div>
  );
}

function RegistroUsuarioScreen({ onRegistered, goBack }: { onRegistered: () => void; goBack: () => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hasFirstAidTraining, setHasFirstAidTraining] = useState(false);

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 44,
    boxSizing: "border-box",
    padding: "0 12px",
    border: "1.5px solid #b8cfe8",
    borderRadius: 8,
    color: "#0a1628",
    background: "#ffffff",
    fontWeight: 600,
  };
  const textAreaStyle: React.CSSProperties = {
    ...fieldStyle,
    minHeight: 96,
    padding: 12,
    resize: "vertical",
  };
  const sectionStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #dce9f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  };
  const sectionTitleStyle: React.CSSProperties = {
    color: "#162b55",
    fontSize: 14,
    fontWeight: 800,
    margin: "0 0 14px",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    color: "#162b55",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
  };
  const fieldGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    gap: 12,
  };
  const checkboxLabelStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#0a1628",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.5,
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRegistered();
  };

  return (
    <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 16px 40px" }}>
      <form onSubmit={handleSubmit}>
        <h1 style={{ color: "#0a1628", fontSize: 22, margin: "0 0 16px" }}>Registrar Usuario</h1>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Datos Personales</h2>
          <div style={fieldGridStyle}>
            <div>
              <label style={labelStyle}>NOMBRE COMPLETO</label>
              <input value={nombre} onChange={event => setNombre(event.target.value)} required autoComplete="name" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>CORREO ELECTRÓNICO</label>
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>CONTRASEÑA</label>
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>TELÉFONO</label>
              <input type="tel" autoComplete="tel" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>EDAD</label>
              <input type="number" min={0} max={120} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>FECHA DE NACIMIENTO</label>
              <input type="date" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>GÉNERO</label>
              <select defaultValue="" style={fieldStyle}>
                <option value="" disabled>Selecciona una opción</option>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>FOTOGRAFÍA DE PERFIL</label>
              <input type="file" accept="image/*" style={{ ...fieldStyle, padding: 8 }} />
            </div>
            <div>
              <label style={labelStyle}>CIUDAD</label>
              <input autoComplete="address-level2" style={fieldStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>DIRECCIÓN COMPLETA</label>
              <input autoComplete="street-address" style={fieldStyle} />
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Perfil Operativo y Habilidades</h2>
          <div style={fieldGridStyle}>
            <div>
              <label style={labelStyle}>PERFIL DE HABILIDADES</label>
              <select defaultValue="" style={fieldStyle}>
                <option value="" disabled>Selecciona un perfil</option>
                <option>Socorrista</option>
                <option>Rescate</option>
                <option>Apoyo Logístico</option>
                <option>Atención Comunitaria</option>
                <option>Apoyo Administrativo</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>PROFESIÓN U OCUPACIÓN ACTUAL</label>
              <input style={fieldStyle} />
            </div>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" />
              Cuento con licencia de conducir activa
            </label>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={hasFirstAidTraining} onChange={event => setHasFirstAidTraining(event.target.checked)} />
              Cursos previos de primeros auxilios
            </label>
            {hasFirstAidTraining && (
              <div>
                <label style={labelStyle}>CONSTANCIA O DIPLOMA</label>
                <input type="file" accept=".pdf,image/*" style={{ ...fieldStyle, padding: 8 }} />
              </div>
            )}
            <div>
              <label style={labelStyle}>MANEJO DE IDIOMAS (IDIOMA Y NIVEL)</label>
              <input placeholder="Ej. Inglés - Intermedio" style={fieldStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>CONOCIMIENTOS TÉCNICOS</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 10 }}>
                {["Mecánica", "Eléctrica", "Radiofrecuencia"].map(skill => (
                  <label key={skill} style={checkboxLabelStyle}>
                    <input type="checkbox" />
                    {skill}
                  </label>
                ))}
              </div>
              <textarea placeholder="Describe tus conocimientos técnicos..." style={textAreaStyle} />
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Datos Médicos y Contactos de Emergencia</h2>
          <div style={fieldGridStyle}>
            <div>
              <label style={labelStyle}>TIPO DE SANGRE</label>
              <select defaultValue="" style={fieldStyle}>
                <option value="" disabled>Selecciona tu tipo de sangre</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(type => <option key={type}>{type}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>ALERGIAS O PADECIMIENTOS MÉDICOS RELEVANTES</label>
              <textarea style={textAreaStyle} />
            </div>
            {[1, 2].map(contact => (
              <div key={contact} style={{ gridColumn: "1 / -1", display: "grid", ...fieldGridStyle }}>
                <h3 style={{ gridColumn: "1 / -1", color: "#162b55", fontSize: 13, margin: "4px 0 0" }}>Contacto {contact}</h3>
                <div>
                  <label style={labelStyle}>NOMBRE</label>
                  <input style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>TELÉFONO</label>
                  <input type="tel" style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>PARENTESCO</label>
                  <input style={fieldStyle} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Términos y Condiciones</h2>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" required />
            Acepto los Términos y Condiciones y el Aviso de Privacidad de Datos
          </label>
        </section>

        <button type="submit" style={{ width: "100%", minHeight: 48, background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Crear cuenta</button>
        <button type="button" onClick={goBack} style={{ width: "100%", minHeight: 44, background: "transparent", color: "#162b55", border: "none", fontWeight: 700, cursor: "pointer", marginTop: 8 }}>← Volver</button>
      </form>
    </div>
  );
}

// ─── SECCIÓN 1: REGISTRO INSTITUCIONAL ───────────────────────────────────────
function RegistroAsociacionScreen({ onAssociationCreated, goNext, goBack }: { onAssociationCreated: (association: Association) => void; goNext: () => void; goBack: () => void }) {
  const [institutionType, setInstitutionType] = useState<InstitutionType>("gubernamental");
  const [, setActaFile] = useState<File | null>(null);
  const [, setIdFile] = useState<File | null>(null);
  const [biometric, setBiometric] = useState<BiometricState>("idle");
  const [submitted, setSubmitted] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [form, setForm] = useState({ asociacion: "", razonSocial: "", cedula: "", ejercicioFiscal: "2026", directorNombre: "", directorApPat: "", directorApMat: "", directorEmail: "" });
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value })) });
  const inputStyle: React.CSSProperties = { width: "100%", minHeight: 48, padding: "0 14px", border: "1.5px solid #b8cfe8", borderRadius: 10, fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#0a1628", background: "#fff", outline: "none" };

  const handleBiometric = () => {
    if (biometric === "scanning") return;
    setBiometric("scanning");
    setTimeout(() => setBiometric(Math.random() > 0.1 ? "verified" : "failed"), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = "SCE-" + Math.random().toString(36).toUpperCase().slice(2, 7);
    setInviteCode(code);
    onAssociationCreated({
      id: `${Date.now()}`,
      name: form.asociacion,
      code,
      directorEmail: form.directorEmail,
      requests: [],
    });
    setSubmitted(true);
    window.setTimeout(goNext, 2000);
  };

  if (submitted) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🚨</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0a1628", textAlign: "center", marginBottom: 6 }}>¡Institución Registrada!</div>
        <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 24, maxWidth: 320 }}>Tu institución se registró exitosamente en el sistema.</div>
        <div style={{ background: "#0f2040", borderRadius: 16, padding: "20px 28px", textAlign: "center", width: "100%", maxWidth: 340, marginBottom: 20, color: "#fff" }}>
          <div style={{ fontSize: 11, color: "#4a7ab5", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Código de Invitación</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "0.12em" }}>{inviteCode}</div>
        </div>
        <button onClick={goNext} style={{ minHeight: 50, width: "100%", maxWidth: 340, background: "#dc2626", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
          🔑 Ir a Iniciar Sesión
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ background: "linear-gradient(135deg, #0f2040 0%, #162b55 100%)", padding: "18px 20px", color: "#fff" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ fontSize: 11, color: "#4a7ab5", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>REGISTRO INSTITUCIONAL</div>
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>Alta de Asociación y Perfil del Director</div>
          <div style={{ fontSize: 12, color: "#b8cfe8", marginTop: 4 }}>Completa los datos para dar de alta tu unidad operativa.</div>
        </div>
      </div>
      <form onSubmit={handleSubmit} style={{ maxWidth: 600, margin: "16px auto 0", padding: "0 16px" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "20px 16px", marginBottom: 16, border: "1px solid #dce9f5" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#162b55", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14, paddingBottom: 8, borderBottom: "2px solid #f0f4f9" }}>
            PASO 1 · Datos de la Asociación
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>NOMBRE DE LA ASOCIACIÓN / DELEGACIÓN *</label>
            <input placeholder="Ej. Cruz Roja San Pedro" required style={inputStyle} {...field("asociacion")} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>RAZÓN SOCIAL *</label>
            <input placeholder="Conforme a Secretaría de Economía" required style={inputStyle} {...field("razonSocial")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>CÉDULA FISCAL / RFC *</label>
              <input placeholder="XAXX010101000" maxLength={13} style={{ ...inputStyle, textTransform: "uppercase" }} {...field("cedula")} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>AÑO FISCAL *</label>
              <input type="number" placeholder="2026" style={inputStyle} {...field("ejercicioFiscal")} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 6 }}>TIPO DE INSTITUCIÓN *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ id: "gubernamental", label: "Gubernamental", icon: "🏛️" }, { id: "iap", label: "I.A.P.", icon: "🤝" }, { id: "independiente", label: "Independiente", icon: "🔹" }].map(opt => (
                <div key={opt.id} onClick={() => setInstitutionType(opt.id as InstitutionType)} style={{ flex: 1, height: 48, border: `1.5px solid ${institutionType === opt.id ? "#162b55" : "#b8cfe8"}`, borderRadius: 8, cursor: "pointer", background: institutionType === opt.id ? "#162b55" : "#fff", color: institutionType === opt.id ? "#fff" : "#162b55", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
                  <span>{opt.icon}</span><span>{opt.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>ACTA CONSTITUTIVA (PDF / IMAGEN) *</label>
            <input type="file" onChange={e => setActaFile(e.target.files?.[0] || null)} style={{ width: "100%", padding: 8, border: "1.5px dashed #b8cfe8", borderRadius: 8 }} />
          </div>
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: "20px 16px", marginBottom: 16, border: "1px solid #dce9f5" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#162b55", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14, paddingBottom: 8, borderBottom: "2px solid #f0f4f9" }}>
            PASO 2 · Verificación del Director
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>NOMBRE(S) *</label>
            <input placeholder="Nombre del director" required style={inputStyle} {...field("directorNombre")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>APELLIDO PATERNO *</label>
              <input placeholder="Paterno" required style={inputStyle} {...field("directorApPat")} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>APELLIDO MATERNO</label>
              <input placeholder="Materno" style={inputStyle} {...field("directorApMat")} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>CORREO ELECTRÓNICO *</label>
            <input type="email" placeholder="director@institucion.org.mx" required style={inputStyle} {...field("directorEmail")} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>IDENTIFICACIÓN OFICIAL (INE / PASS) *</label>
            <input type="file" onChange={e => setIdFile(e.target.files?.[0] || null)} style={{ width: "100%", padding: 8, border: "1.5px dashed #b8cfe8", borderRadius: 8 }} />
          </div>
          <button type="button" onClick={handleBiometric} style={{ width: "100%", height: 50, border: "1.5px dashed #162b55", borderRadius: 10, background: biometric === "verified" ? "#16a34a" : "#f8fafc", color: biometric === "verified" ? "#fff" : "#162b55", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {biometric === "idle" && "🪪 Iniciar Verificación Biométrica Facial"}
            {biometric === "scanning" && "🔄 Escaneando rostro..."}
            {biometric === "verified" && "✅ Identidad Verificada Exitosamente"}
            {biometric === "failed" && "❌ Falló verificación (reintentar)"}
          </button>
        </div>
        <button type="submit" style={{ width: "100%", height: 52, background: "#dc2626", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
          🚨 Registrar Institución y Generar Código
        </button>
        <button type="button" onClick={goBack} style={{ width: "100%", minHeight: 44, marginTop: 8, background: "transparent", color: "#162b55", border: "none", fontWeight: 700, cursor: "pointer" }}>
          ← Volver
        </button>
      </form>
    </div>
  );
}

// ─── SECCIÓN 2: ATENCIÓN EN CAMPO ─────────────────────────────────────────────
function CampoScreen({ readOnly = false }: { readOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [guardando, setGuardando] = useState(false);
  const [mensajeResultado, setMensajeResultado] = useState<string | null>(null);

  const TABS_LIST: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "pacientes", label: "Pacientes" },
    { id: "insumos", label: "Insumos" },
    { id: "cierre", label: "Cierre" },
  ];

  const activeIndex = TABS_LIST.findIndex(t => t.id === activeTab);

  const [generalData, setGeneralData] = useState({
    folio: "FOL-2026-0988",
    fecha: nowDate(),
    horaLlamada: "14:20",
    horaLlegada: "14:32",
    tipoIncidente: "Accidente Vehicular",
    direccion: "Av. Hidalgo #450, Col. Centro, San Pedro",
    referencia: "Frente a la gasolinería",
    unidad: "AMB-02",
    operador: "Juan Carlos Gómez",
    paramedicoCargo: "TAMP María Rodríguez",
    elementosApoyo: "Bomberos R-1, Policía Municipal 204",
  });

  const [pacientes, setPacientes] = useState<Paciente[]>([makePaciente(1)]);
  const [activePacienteId, setActivePacienteId] = useState(1);
  const pac = pacientes.find(p => p.id === activePacienteId) || pacientes[0];

  const updatePac = (patch: Partial<Paciente>) => {
    setPacientes(ps => ps.map(p => p.id === pac.id ? { ...p, ...patch } : p));
  };

  const updateGineco = (patch: Partial<Paciente["gineco"]>) => {
    setPacientes(ps => ps.map(p => p.id === pac.id ? { ...p, gineco: { ...p.gineco, ...patch } } : p));
  };

  const addVital = () => {
    updatePac({ vitales: [...pac.vitales, makeVital(Date.now())] });
  };

  const addPaciente = () => {
    const id = Date.now();
    setPacientes(ps => [...ps, makePaciente(id)]);
    setActivePacienteId(id);
  };

  const triageOpts: { id: Triage; label: string; emoji: string; bg: string }[] = [
    { id: "rojo", label: "Rojo", emoji: "🔴", bg: "#dc2626" },
    { id: "amarillo", label: "Amarillo", emoji: "🟡", bg: "#d97706" },
    { id: "verde", label: "Verde", emoji: "🟢", bg: "#16a34a" },
    { id: "negro", label: "Negro", emoji: "⬛", bg: "#111827" },
  ];

  const handleGuardarReporte = async () => {
    setGuardando(true);
    setMensajeResultado(null);

    const payload = {
      general: generalData,
      pacientes: pacientes,
      fechaCaptura: new Date().toISOString(),
    };

    try {
      if (navigator.onLine) {
        const response = await fetch("http://localhost/Protocolo-PWA/api/routes/campo.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const res = await response.json();
        if (res.status === "success") {
          setMensajeResultado("✅ Reporte registrado exitosamente en MySQL.");
        } else {
          throw new Error(res.mensaje || "Error al registrar");
        }
      } else {
        setMensajeResultado("🟡 Sin conexión: Reporte respaldado localmente en la aplicación.");
      }
    } catch {
      setMensajeResultado("🟡 Guardado localmente en modo Offline.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 120px" }}>
      {/* Header Info */}
      <div style={{ background: "#0f2040", color: "#fff", padding: "12px 16px", borderRadius: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "#4a7ab5", fontWeight: 700 }}>SCE · PREHOSPITALARIO</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Reporte de Atención en Campo</div>
        </div>
        <div style={{ background: "#162b55", padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#fff" }}>
          UNIDAD: {generalData.unidad}
        </div>
      </div>

      {/* Tabs Principales */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#fff", padding: 6, borderRadius: 10, border: "1px solid #dce9f5" }}>
        {(["general", "pacientes", "insumos", "cierre"] as Tab[]).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ flex: 1, height: 38, border: "none", borderRadius: 8, background: activeTab === t ? "#162b55" : "transparent", color: activeTab === t ? "#fff" : "#162b55", fontWeight: 700, fontSize: 12, cursor: "pointer", textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
      </div>

      {readOnly && (
        <div role="status" style={{ background: "#fef3c7", color: "#78350f", padding: 12, borderRadius: 8, marginBottom: 16, fontWeight: 700, textAlign: "center" }}>
          Modo Solo Lectura
        </div>
      )}
      <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {/* 📋 DATOS GENERALES DEL INCIDENTE */}
      {activeTab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #dce9f5" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#162b55", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #f0f4f9" }}>
              📋 Identificación y Horarios
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>FOLIO DE SERVICIO</label>
                <input value={generalData.folio} onChange={e => setGeneralData({ ...generalData, folio: e.target.value })} style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, fontWeight: 700, color: "#dc2626", background: "#f8fafc" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>FECHA DEL INCIDENTE</label>
                <input type="date" value={generalData.fecha} onChange={e => setGeneralData({ ...generalData, fecha: e.target.value })} style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>HORA DESPACHO / LLAMADA</label>
                <input type="time" value={generalData.horaLlamada} onChange={e => setGeneralData({ ...generalData, horaLlamada: e.target.value })} style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>HORA LLEGADA A SITIO</label>
                <input type="time" value={generalData.horaLlegada} onChange={e => setGeneralData({ ...generalData, horaLlegada: e.target.value })} style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
              </div>
            </div>
          </div>
          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #dce9f5" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#162b55", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #f0f4f9" }}>
              📍 Ubicación del Incidente
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>DIRECCIÓN / UBICACIÓN EXACTA *</label>
              <input value={generalData.direccion} onChange={e => setGeneralData({ ...generalData, direccion: e.target.value })} placeholder="Calle, número, colonia o carretera" style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>REFERENCIAS O PUNTOS CERCANOS</label>
              <input value={generalData.referencia} onChange={e => setGeneralData({ ...generalData, referencia: e.target.value })} placeholder="Ej. Frente a tienda o entre calles..." style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
            </div>
          </div>
          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #dce9f5" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#162b55", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #f0f4f9" }}>
              👥 Datos del Equipo Respondiente
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>UNIDAD</label>
                <input value={generalData.unidad} onChange={e => setGeneralData({ ...generalData, unidad: e.target.value })} style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, fontWeight: 700 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>PARAMÉDICO / RESPONSABLE A CARGO *</label>
                <input value={generalData.paramedicoCargo} onChange={e => setGeneralData({ ...generalData, paramedicoCargo: e.target.value })} placeholder="Nombre y cédula/puesto" style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>CONDUCTOR / OPERADOR</label>
              <input value={generalData.operador} onChange={e => setGeneralData({ ...generalData, operador: e.target.value })} placeholder="Nombre del operador" style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>OTRAS UNIDADES / EQUIPOS DE APOYO EN SITIO</label>
              <input value={generalData.elementosApoyo} onChange={e => setGeneralData({ ...generalData, elementosApoyo: e.target.value })} placeholder="Ej. Bomberos, Policía, Cruz Roja..." style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
            </div>
          </div>
        </div>
      )}

      {/* 👤 ATENCIÓN A PACIENTES */}
      {activeTab === "pacientes" && (
        <div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
            {pacientes.map((p, i) => (
              <button key={p.id} onClick={() => setActivePacienteId(p.id)} style={{ flexShrink: 0, height: 40, padding: "0 14px", borderRadius: 8, border: `1.5px solid ${activePacienteId === p.id ? "#162b55" : "#b8cfe8"}`, background: activePacienteId === p.id ? "#162b55" : "#fff", color: activePacienteId === p.id ? "#fff" : "#162b55", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                👤 {p.nombre.trim() ? p.nombre.split(" ")[0] : `Paciente ${i + 1}`}
              </button>
            ))}
            <button onClick={addPaciente} style={{ flexShrink: 0, height: 40, padding: "0 14px", borderRadius: 8, border: "1.5px dashed #4a7ab5", background: "transparent", color: "#1e3a6e", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              + Agregar Paciente
            </button>
          </div>
          <div style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 14, padding: 18 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>NOMBRE COMPLETO *</label>
              <input value={pac.nombre} onChange={e => updatePac({ nombre: e.target.value })} placeholder="Nombre y Apellidos" style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, fontSize: 14 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>EDAD</label>
                <input type="number" value={pac.edad} onChange={e => updatePac({ edad: e.target.value })} placeholder="Años" style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>SEXO</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["M", "F"] as Sexo[]).map(s => (
                    <button key={s} onClick={() => updatePac({ sexo: s })} style={{ flex: 1, height: 44, border: `1.5px solid ${pac.sexo === s ? "#162b55" : "#b8cfe8"}`, borderRadius: 8, background: pac.sexo === s ? "#162b55" : "#fff", color: pac.sexo === s ? "#fff" : "#162b55", fontWeight: 700, cursor: "pointer" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 6 }}>CLASIFICACIÓN TRIAGE</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {triageOpts.map(t => (
                  <button key={t.id} onClick={() => updatePac({ triage: t.id })} style={{ height: 48, border: `2px solid ${pac.triage === t.id ? t.bg : "#b8cfe8"}`, borderRadius: 8, background: pac.triage === t.id ? t.bg : "#fff", color: pac.triage === t.id ? "#fff" : "#162b55", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "2px solid #f0f4f9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#162b55" }}>SIGNOS VITALES</span>
                <button onClick={addVital} style={{ background: "#162b55", color: "#fff", border: "none", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Toma</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                      <th style={{ padding: 6 }}>Hora</th><th style={{ padding: 6 }}>FR</th><th style={{ padding: 6 }}>FC</th><th style={{ padding: 6 }}>TA</th><th style={{ padding: 6 }}>SpO2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pac.vitales.map(v => (
                      <tr key={v.id} style={{ borderBottom: "1px solid #f0f4f9" }}>
                        <td style={{ padding: 4 }}><input value={v.hora} onChange={e => { v.hora = e.target.value; updatePac({}); }} style={{ width: 50, border: "none" }} /></td>
                        <td style={{ padding: 4 }}><input placeholder="rpm" value={v.fr} onChange={e => { v.fr = e.target.value; updatePac({}); }} style={{ width: 40, border: "none" }} /></td>
                        <td style={{ padding: 4 }}><input placeholder="lpm" value={v.fc} onChange={e => { v.fc = e.target.value; updatePac({}); }} style={{ width: 40, border: "none" }} /></td>
                        <td style={{ padding: 4 }}><input placeholder="mmHg" value={v.ta} onChange={e => { v.ta = e.target.value; updatePac({}); }} style={{ width: 50, border: "none" }} /></td>
                        <td style={{ padding: 4 }}><input placeholder="%" value={v.spo2} onChange={e => { v.spo2 = e.target.value; updatePac({}); }} style={{ width: 40, border: "none" }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "2px solid #f0f4f9" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#162b55", cursor: "pointer" }}>
                <input type="checkbox" checked={pac.parto} onChange={e => updatePac({ parto: e.target.checked })} />
                👶 Atención de Parto / Gineco-Obstétrico
              </label>
              {pac.parto && (
                <div style={{ marginTop: 12, padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #b8cfe8" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#162b55" }}>SEMANAS GESTACIÓN</label>
                      <input placeholder="Ej. 38" value={pac.gineco.semanas} onChange={e => updateGineco({ semanas: e.target.value })} style={{ width: "100%", height: 36, border: "1px solid #b8cfe8", borderRadius: 6, padding: "0 8px" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#162b55" }}>HORA NACIMIENTO</label>
                      <input value={pac.gineco.horaNacimiento} onChange={e => updateGineco({ horaNacimiento: e.target.value })} style={{ width: "100%", height: 36, border: "1px solid #b8cfe8", borderRadius: 6, padding: "0 8px" }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#162b55" }}>APGAR (1-10)</label>
                      <input placeholder="Ej. 8/9" value={pac.gineco.apgar} onChange={e => updateGineco({ apgar: e.target.value })} style={{ width: "100%", height: 36, border: "1px solid #b8cfe8", borderRadius: 6, padding: "0 8px" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#162b55" }}>SILVERMAN</label>
                      <input placeholder="Ej. 0" value={pac.gineco.silverman} onChange={e => updateGineco({ silverman: e.target.value })} style={{ width: "100%", height: 36, border: "1px solid #b8cfe8", borderRadius: 6, padding: "0 8px" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "2px solid #f0f4f9" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#162b55", cursor: "pointer" }}>
                <input type="checkbox" checked={pac.traslado} onChange={e => updatePac({ traslado: e.target.checked })} />
                🏥 Requiere Traslado Hospitalario
              </label>
              {pac.traslado && (
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#162b55" }}>HOSPITAL RECEPTOR</label>
                    <input placeholder="Hospital General / IMSS" value={pac.hospitalReceptor} onChange={e => updatePac({ hospitalReceptor: e.target.value })} style={{ width: "100%", height: 38, border: "1px solid #b8cfe8", borderRadius: 6, padding: "0 8px" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#162b55" }}>MÉDICO QUE RECIBE</label>
                    <input placeholder="Dr. Juan Pérez" value={pac.medicoRecibe} onChange={e => updatePac({ medicoRecibe: e.target.value })} style={{ width: "100%", height: 38, border: "1px solid #b8cfe8", borderRadius: 6, padding: "0 8px" }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🧰 INSUMOS CONSUMIDOS */}
      {activeTab === "insumos" && (
        <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #dce9f5" }}>
          <h4 style={{ fontSize: 14, fontWeight: 800, color: "#0a1628", marginBottom: 12 }}>Insumos Consumidos en Atención</h4>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input placeholder="Nombre de insumo..." style={{ flex: 1, height: 40, border: "1px solid #b8cfe8", borderRadius: 8, padding: "0 10px" }} />
            <button style={{ background: "#162b55", color: "#fff", border: "none", padding: "0 14px", borderRadius: 8, fontWeight: 700 }}>+ Agregar</button>
          </div>
        </div>
      )}

      {/* ✅ CIERRE DE REPORTE */}
      {activeTab === "cierre" && (
        <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #dce9f5", textAlign: "center" }}>
          <h4 style={{ fontSize: 14, fontWeight: 800, color: "#0a1628", marginBottom: 12 }}>Cierre y Firma Digital de Reporte</h4>
          <div style={{ width: "100%", height: 120, border: "2px dashed #b8cfe8", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", marginBottom: 14 }}>
            Firme aquí con el dedo o stylus ✍️
          </div>
          {mensajeResultado && (
            <div style={{ padding: 12, background: "#0f2040", color: "#34d399", fontWeight: 600, borderRadius: 10, width: "100%", textAlign: "center", marginBottom: 12 }}>
              {mensajeResultado}
            </div>
          )}
          <button onClick={handleGuardarReporte} disabled={guardando} style={{ width: "100%", height: 48, background: guardando ? "#94a3b8" : "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            {guardando ? "⌛ Guardando..." : "✅ Finalizar y Enviar Reporte"}
          </button>
        </div>
      )}
      </fieldset>

      {/* BARRA FLOTANTE DE BOTONES INFERIORES DE NAVEGACIÓN SECUENCIAL */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "rgba(255, 255, 255, 0.98)",
        borderTop: "1.5px solid #b8cfe8",
        boxShadow: "0 -4px 20px rgba(10,22,40,0.15)",
        padding: "12px 16px",
      }}>
        <div style={{ display: "flex", gap: 12, maxWidth: 640, margin: "0 auto" }}>
          <button
            type="button"
            onClick={() => {
              if (activeIndex > 0) {
                setActiveTab(TABS_LIST[activeIndex - 1].id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            disabled={activeIndex === 0}
            style={{
              flex: 1,
              height: 48,
              border: "1.5px solid #b8cfe8",
              borderRadius: 10,
              background: activeIndex === 0 ? "#f1f5f9" : "#fff",
              color: activeIndex === 0 ? "#94a3b8" : "#162b55",
              fontSize: 14,
              fontWeight: 700,
              cursor: activeIndex === 0 ? "not-allowed" : "pointer",
            }}
          >
            ← Anterior
          </button>

          {readOnly ? (
            <div role="status" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#78350f", background: "#fef3c7", borderRadius: 10, fontWeight: 700 }}>
              Modo Solo Lectura
            </div>
          ) : activeTab !== "cierre" ? (
            <button
              type="button"
              onClick={() => {
                if (activeIndex < TABS_LIST.length - 1) {
                  setActiveTab(TABS_LIST[activeIndex + 1].id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              style={{
                flex: 1,
                height: 48,
                border: "none",
                borderRadius: 10,
                background: "#dc2626",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 10px rgba(220,38,38,0.25)",
              }}
            >
              Siguiente: {TABS_LIST[activeIndex + 1]?.label} →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGuardarReporte}
              disabled={guardando}
              style={{
                flex: 1,
                height: 48,
                border: "none",
                borderRadius: 10,
                background: guardando ? "#94a3b8" : "#16a34a",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: guardando ? "not-allowed" : "pointer",
                boxShadow: "0 4px 10px rgba(22,163,74,0.25)",
              }}
            >
              {guardando ? "⌛ Guardando..." : "✅ Finalizar Reporte"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SECCIÓN 3: CABINA DE DESPACHO ─────────────────────────────────────────────
function DespachoScreen({ online: _online, readOnly = false }: { online: boolean; readOnly?: boolean }) {
  const [calls, setCalls] = useState<ActiveCall[]>([
    { id: "1", folio: "INC-2026-0899", hora: "08:14", ubicacion: "Av. Constitución 2310, Col. Centro", tipo: "vehicular", unidad: "AMB-01", status: "atencion" },
    { id: "2", folio: "INC-2026-0900", hora: "09:02", ubicacion: "Calle Morelos 88, Col. Moderna", tipo: "incendio", unidad: "BOMBA R-1", status: "camino" },
  ]);
  const [direccion, setDireccion] = useState("");
  const [tipo, setTipo] = useState<IncidentType>("");
  const [unidad, setUnidad] = useState("");

  const handleDispatch = () => {
    if (!direccion || !tipo || !unidad) return;
    const newCall: ActiveCall = {
      id: Date.now().toString(),
      folio: "INC-2026-" + Math.floor(1000 + Math.random() * 9000),
      hora: nowTime(),
      ubicacion: direccion,
      tipo,
      unidad,
      status: "camino",
    };
    setCalls([newCall, ...calls]);
    setDireccion(""); setTipo(""); setUnidad("");
  };

  const updateCallStatus = (callId: string, status: CallStatus) => {
    setCalls(current => current.map(call => call.id === callId ? { ...call, status } : call));
  };

  return (
    <div style={{ maxWidth: 680, margin: "16px auto", padding: "0 16px 80px" }}>
      {readOnly && (
        <div role="status" style={{ background: "#fef3c7", color: "#78350f", padding: 12, borderRadius: 8, marginBottom: 16, fontWeight: 700, textAlign: "center" }}>
          Modo Solo Lectura
        </div>
      )}
      <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #dce9f5", padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0a1628", marginBottom: 12 }}>Nueva Llamada de Emergencia 📡</h3>
        <input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección del Incidente *" style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
          {[
            { id: "vehicular", label: "Acc. Vehicular", icon: "🚗" },
            { id: "incendio", label: "Incendio", icon: "🔥" },
            { id: "medica", label: "Emerg. Médica", icon: "🫀" },
            { id: "parto", label: "Parto", icon: "👶" },
            { id: "rescate", label: "Rescate", icon: "⛑️" },
          ].map(t => (
            <button key={t.id} onClick={() => setTipo(t.id as IncidentType)} style={{ padding: 8, borderRadius: 8, border: `2px solid ${tipo === t.id ? "#dc2626" : "#b8cfe8"}`, background: tipo === t.id ? "#fee2e2" : "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {["AMB-01", "AMB-02", "AMB-03", "BOMBA R-1", "RESCATE-01", "MOTO-01"].map(u => (
            <button key={u} onClick={() => setUnidad(u)} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${unidad === u ? "#162b55" : "#b8cfe8"}`, background: unidad === u ? "#162b55" : "#fff", color: unidad === u ? "#fff" : "#162b55", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {u}
            </button>
          ))}
        </div>
        <button onClick={handleDispatch} disabled={!direccion || !tipo || !unidad} style={{ width: "100%", height: 48, background: (!direccion || !tipo || !unidad) ? "#94a3b8" : "#dc2626", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
          📡 Despachar Unidad
        </button>
      </div>
      </fieldset>
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #dce9f5", padding: 18 }}>
        <h4 style={{ fontSize: 14, fontWeight: 800, color: "#0a1628", marginBottom: 10 }}>Llamadas Activas en Cabina ({calls.length})</h4>
        {calls.map(c => (
          <div key={c.id} style={{ borderBottom: "1px solid #dce9f5", padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0a1628" }}>{c.folio} · {c.unidad}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{c.ubicacion}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 12, background: c.status === "atencion" ? "#fee2e2" : c.status === "finalizado" ? "#dcfce7" : "#fef3c7", color: c.status === "atencion" ? "#991b1b" : c.status === "finalizado" ? "#166534" : "#78350f" }}>{c.status.toUpperCase()}</span>
              {!readOnly && c.status !== "finalizado" && (
                <button type="button" onClick={() => updateCallStatus(c.id, c.status === "camino" ? "atencion" : "finalizado")} style={{ minHeight: 34, padding: "0 8px", border: "none", borderRadius: 6, background: "#162b55", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {c.status === "camino" ? "Marcar en sitio" : "Finalizar"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SECCIÓN 4: ALMACÉN E INSUMOS ─────────────────────────────────────────────
function InventarioScreen({ access = "manage" }: { access?: Exclude<InventoryAccess, "none"> }) {
  const [supplies, setSupplies] = useState<Supply[]>([
    { id: 1, name: "Solución Salina 0.9% 500ml", category: "prehospitalario", location: "Ambulancia AMB-02", stock: 2, min: 5, unit: "bolsas" },
    { id: 2, name: "Equipo de Venoclisis", category: "prehospitalario", location: "Bodega Central", stock: 18, min: 10, unit: "pzas" },
    { id: 3, name: "Guantes de Látex (caja)", category: "prehospitalario", location: "Ambulancia AMB-02", stock: 3, min: 4, unit: "cajas" },
    { id: 4, name: "Gasolina Magna (Litros)", category: "combustibles", location: "Estación Principal", stock: 120, min: 50, unit: "L" },
    { id: 5, name: "Desinfectante Quirúrgico", category: "limpieza", location: "Bodega Central", stock: 5, min: 8, unit: "L" },
    { id: 6, name: "Cuerda de Rescate 50m", category: "rescate", location: "RESCATE-01", stock: 2, min: 2, unit: "pzas" },
  ]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<Category>("todos");
  const [newSupply, setNewSupply] = useState({ name: "", category: "prehospitalario" as Exclude<Category, "todos">, location: "", stock: "", min: "", unit: "" });

  const adjust = (id: number, delta: number) => {
    setSupplies(ss => ss.map(s => s.id === id ? { ...s, stock: Math.max(0, s.stock + delta) } : s));
  };

  const addSupply = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (access !== "manage") return;
    setSupplies(current => [...current, {
      id: Date.now(),
      name: newSupply.name.trim(),
      category: newSupply.category,
      location: newSupply.location.trim(),
      stock: Number(newSupply.stock),
      min: Number(newSupply.min),
      unit: newSupply.unit.trim(),
    }]);
    setNewSupply({ name: "", category: "prehospitalario", location: "", stock: "", min: "", unit: "" });
  };

  const filtered = useMemo(() => {
    return supplies.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = catFilter === "todos" || s.category === catFilter;
      return matchSearch && matchCat;
    });
  }, [supplies, search, catFilter]);

  return (
    <div style={{ maxWidth: 680, margin: "16px auto", padding: "0 16px 80px" }}>
      {access === "read" && (
        <div role="status" style={{ background: "#fef3c7", color: "#78350f", padding: 12, borderRadius: 8, marginBottom: 16, fontWeight: 700, textAlign: "center" }}>
          Modo Solo Lectura
        </div>
      )}
      {access === "consume" && (
        <div role="status" style={{ background: "#eff6ff", color: "#1e3a8a", padding: 12, borderRadius: 8, marginBottom: 16, fontWeight: 700, textAlign: "center" }}>
          Registra consumos de insumos; no puedes modificar el stock disponible.
        </div>
      )}
      {access === "manage" && (
        <form onSubmit={addSupply} style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h2 style={{ color: "#162b55", fontSize: 15, margin: "0 0 12px" }}>Alta de insumo</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8 }}>
            <input aria-label="Nombre del insumo" placeholder="Nombre del insumo" value={newSupply.name} onChange={event => setNewSupply({ ...newSupply, name: event.target.value })} required />
            <select aria-label="Categoría" value={newSupply.category} onChange={event => setNewSupply({ ...newSupply, category: event.target.value as Exclude<Category, "todos"> })}>
              {(["prehospitalario", "limpieza", "rescate", "combustibles"] as Exclude<Category, "todos">[]).map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <input aria-label="Ubicación" placeholder="Ubicación" value={newSupply.location} onChange={event => setNewSupply({ ...newSupply, location: event.target.value })} required />
            <input aria-label="Stock inicial" type="number" min={0} placeholder="Stock inicial" value={newSupply.stock} onChange={event => setNewSupply({ ...newSupply, stock: event.target.value })} required />
            <input aria-label="Stock mínimo" type="number" min={0} placeholder="Stock mínimo" value={newSupply.min} onChange={event => setNewSupply({ ...newSupply, min: event.target.value })} required />
            <input aria-label="Unidad" placeholder="Unidad (pzas, L...)" value={newSupply.unit} onChange={event => setNewSupply({ ...newSupply, unit: event.target.value })} required />
          </div>
          <button type="submit" style={{ width: "100%", minHeight: 42, marginTop: 10, background: "#162b55", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Agregar insumo</button>
        </form>
      )}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar insumo o medicamento..." style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 10, marginBottom: 12, color: "#0a1628", background: "#ffffff", fontWeight: 600 }} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 14 }}>
        {(["todos", "prehospitalario", "rescate", "limpieza", "combustibles"] as Category[]).map(cat => (
          <button key={cat} onClick={() => setCatFilter(cat)} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${catFilter === cat ? "#162b55" : "#b8cfe8"}`, background: catFilter === cat ? "#162b55" : "#ffffff", color: catFilter === cat ? "#ffffff" : "#0a1628", fontWeight: 700, fontSize: 11, cursor: "pointer", textTransform: "capitalize", whiteSpace: "nowrap" }}>
            {cat}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(s => (
          <div key={s.id} style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 12, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0a1628" }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "#475569" }}>📍 {s.location} · Mín: {s.min} {s.unit}</div>
              {s.stock < s.min && <span style={{ fontSize: 10, background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>¡Stock Bajo!</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f0f4f9", border: "1px solid #b8cfe8", padding: 4, borderRadius: 8 }}>
              {access === "manage" && <button type="button" aria-label={`Disminuir stock de ${s.name}`} onClick={() => adjust(s.id, -1)} style={{ background: "#162b55", color: "#ffffff", border: "none", width: 32, height: 32, borderRadius: 6, cursor: "pointer", fontWeight: 800 }}>-</button>}
              <span style={{ color: "#0a1628", fontSize: 15, fontWeight: 800, minWidth: 24, textAlign: "center" }}>{s.stock}</span>
              {access === "manage" && <button type="button" aria-label={`Aumentar stock de ${s.name}`} onClick={() => adjust(s.id, 1)} style={{ background: "#162b55", color: "#ffffff", border: "none", width: 32, height: 32, borderRadius: 6, cursor: "pointer", fontWeight: 800 }}>+</button>}
              {access === "consume" && <button type="button" aria-label={`Registrar consumo de ${s.name}`} disabled={s.stock === 0} onClick={() => adjust(s.id, -1)} style={{ padding: "0 8px", height: 32, background: s.stock === 0 ? "#94a3b8" : "#162b55", color: "#ffffff", border: "none", borderRadius: 6, cursor: s.stock === 0 ? "not-allowed" : "pointer", fontWeight: 700 }}>Registrar consumo</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP COMPONENT ────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>("inicio");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [online, setOnline] = useState(true);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const permissions = getRolePermissions(currentRole);
  const hasActiveAssociation = isAuthenticated && permissions.screens.length > 0;

  const handleLogin = (email: string) => {
    const directorAssociation = associations.find(association => association.directorEmail.toLowerCase() === email.toLowerCase());
    const approvedMembership = associations
      .flatMap(association => association.requests.map(request => ({ association, request })))
      .find(({ request }) => request.userEmail.toLowerCase() === email.toLowerCase() && request.status === "Aceptada");

    setCurrentUserEmail(email);
    setIsAuthenticated(true);
    if (directorAssociation) {
      setCurrentRole("Director");
      setScreen("gestionSolicitudes");
    } else if (approvedMembership) {
      setCurrentRole(approvedMembership.request.role);
      setScreen("campo");
    } else {
      setCurrentRole(null);
      setScreen("seleccionarAsociacion");
    }
  };

  const handleAssociationRequest = (associationId: string) => {
    setAssociations(current => current.map(association => {
      if (association.id !== associationId) return association;
      const existingRequest = association.requests.find(request => request.userEmail.toLowerCase() === currentUserEmail.toLowerCase());
      const request: AssociationRequest = existingRequest
        ? { ...existingRequest, status: "Pendiente de Aprobación" }
        : { id: `${Date.now()}`, userEmail: currentUserEmail, status: "Pendiente de Aprobación", role: "Socorrista" };
      return {
        ...association,
        requests: existingRequest
          ? association.requests.map(item => item.id === existingRequest.id ? request : item)
          : [...association.requests, request],
      };
    }));
  };

  const updateAssociationRequest = (associationId: string, requestId: string, status: RequestStatus, role: UserRole) => {
    const updatedRequest = associations
      .find(association => association.id === associationId)
      ?.requests.find(request => request.id === requestId);
    setAssociations(current => current.map(association => association.id === associationId
      ? { ...association, requests: association.requests.map(request => request.id === requestId ? { ...request, status, role } : request) }
      : association
    ));
    if (updatedRequest?.userEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
      if (status === "Aceptada") {
        setCurrentRole(role);
        setScreen("campo");
      } else if (status === "Rechazada") {
        setCurrentRole(null);
        setScreen("seleccionarAsociacion");
      }
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUserEmail("");
    setCurrentRole(null);
    setScreen("inicio");
  };

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "#f0f4f9", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        input {
          color: #0a1628 !important;
          background: #ffffff !important;
          font-weight: 600 !important;
        }

        input::placeholder {
          color: #64748b !important;
          opacity: 1 !important;
        }
      `}</style>
      <GlobalNavBar screen={screen} setScreen={setScreen} online={online} isAuthenticated={isAuthenticated} role={currentRole} hasActiveAssociation={hasActiveAssociation} />
      <main>
        {!isAuthenticated && screen === "inicio" && (
          <InicioScreen goToLogin={() => setScreen("login")} goToRegister={() => setScreen("registroOpciones")} />
        )}
        {!isAuthenticated && screen === "login" && (
          <LoginScreen
            onLogin={handleLogin}
            goBack={() => setScreen("inicio")}
          />
        )}
        {!isAuthenticated && screen === "registroOpciones" && (
          <RegistroChoiceScreen
            goToAssociation={() => setScreen("registro")}
            goToUser={() => setScreen("registroUsuario")}
            goBack={() => setScreen("inicio")}
          />
        )}
        {!isAuthenticated && screen === "registroUsuario" && (
          <RegistroUsuarioScreen
            onRegistered={() => setScreen("login")}
            goBack={() => setScreen("registroOpciones")}
          />
        )}
        {!isAuthenticated && screen === "registro" && (
          <RegistroAsociacionScreen
            onAssociationCreated={association => setAssociations(current => [...current, association])}
            goNext={() => setScreen("login")}
            goBack={() => setScreen("registroOpciones")}
          />
        )}
        {isAuthenticated && screen === "seleccionarAsociacion" && (
          <SeleccionarAsociacionScreen
            associations={associations}
            userEmail={currentUserEmail}
            onRequest={handleAssociationRequest}
            onLogout={handleLogout}
          />
        )}
        {isAuthenticated && permissions.canManageRequests && screen === "gestionSolicitudes" && (
          <GestionSolicitudesScreen associations={associations} directorEmail={currentUserEmail} onUpdateRequest={updateAssociationRequest} />
        )}
        {isAuthenticated && permissions.screens.includes("campo") && screen === "campo" && <CampoScreen readOnly={!permissions.canEditCampo} />}
        {isAuthenticated && permissions.screens.includes("despacho") && screen === "despacho" && <DespachoScreen online={online} readOnly={!permissions.canEditDespacho} />}
        {isAuthenticated && permissions.inventory !== "none" && screen === "inventario" && <InventarioScreen access={permissions.inventory} />}
      </main>
    </div>
  );
}