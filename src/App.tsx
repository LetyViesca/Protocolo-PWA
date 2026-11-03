import React, { useState, useEffect, useMemo, useRef } from "react";

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Screen = "inicio" | "login" | "registroOpciones" | "registro" | "registroUsuario" | "solicitar-asociacion" | "sin-acceso" | "gestionSolicitudes" | "gestion-directores" | "campo" | "despacho" | "inventario" | "reportes";
type RequestStatus = "Pendiente de Aprobación" | "Aceptada" | "APROBADO" | "Rechazada";
type UserRole = "Director" | "Administrador" | "Paramédico" | "Bombero" | "Comandante" | "Administrativo" | "Socorrista" | "Apoyo Logístico" | "Atención Comunitaria" | "Despachador" | "Almacén";
type OperationalScreen = "campo" | "despacho" | "inventario" | "reportes";
type InventoryAccess = "none" | "read" | "consume" | "manage";

interface RolePermissions {
  screens: OperationalScreen[];
  canEditCampo: boolean;
  canEditDespacho: boolean;
  inventory: InventoryAccess;
  canManageRequests: boolean;
  canViewReports: boolean;
}

interface AuthenticatedUser {
  id_usuario: number | string;
  correo: string;
  id_asociacion: number | string | null;
  id_rol: number | string;
  estatus_aprobado: string;
  esDirector?: boolean;
  nombre_rol?: string | null;
  nombre_asociacion?: string | null;
  codigo_invitacion?: string | null;
  permisos?: string[];
}

interface AssociationRequest {
  id: string;
  userId?: string;
  userEmail: string;
  status: RequestStatus;
  role: UserRole;
  roleId?: number;
  permissions?: AssociationPermissions;
  nombre_completo?: string | null;
  nombre?: string | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  fecha_nacimiento?: string | null;
  tipo_sangre?: string | null;
  alergias?: string | null;
  padecimientos?: string | null;
  contacto_emergencia_nombre?: string | null;
  contacto_emergencia_telefono?: string | null;
}

interface RoleOption {
  id: number;
  name: UserRole;
}

interface AssociationPermissions {
  puedeVerCampo: boolean;
  puedeModificarCampo: boolean;
  puedeVerDespacho: boolean;
  puedeModificarDespacho: boolean;
  puedeVerAlmacen: boolean;
  puedeModificarAlmacen: boolean;
  puedeVerReportes: boolean;
}

interface Association {
  id: string;
  name: string;
  code: string;
  directorEmail: string;
  requests: AssociationRequest[];
}

const ASSOCIATIONS_STORAGE_KEY = "protocolo-pwa-associations";
const API_HOSTNAME = window.location.hostname;
const API_BASE_URL = `http://${API_HOSTNAME}/Protocolo-PWA/api`;
const API_SOLICITUDES_URL = `${API_BASE_URL}/routes/solicitudes.php`;
const API_PERSONAL_URL = `${API_BASE_URL}/routes/personal.php`;
const API_AUTH_URL = `${API_BASE_URL}/routes/auth.php`;
const API_REGISTRO_URL = `${API_BASE_URL}/routes/registro.php`;
const API_REPORTES_URL = `${API_BASE_URL}/routes/reportes.php`;
const API_INVENTARIO_URL = `${API_BASE_URL}/routes/inventario.php`;
const API_CAMPO_URL = `${API_BASE_URL}/routes/campo.php`;
const DEFAULT_ASSOCIATION: Association = {
  id: "1",
  name: "Pruebas",
  code: "SCE-TEST01",
  directorEmail: "director@test.com",
  requests: [],
};

function ensureDefaultAssociation(associations: Association[]): Association[] {
  return associations.some(association => association.id === "1")
    ? associations
    : [...associations, DEFAULT_ASSOCIATION];
}

function isApprovedRequest(request: AssociationRequest): boolean {
  return request.status === "Aceptada" || request.status === "APROBADO";
}

function isApprovedAccount(user: AuthenticatedUser): boolean {
  return isApprovedStatus(user.estatus_aprobado);
}

function isApprovedStatus(status: string): boolean {
  return ["APROBADO", "ACEPTADA", "ACEPTADO"].includes(status.trim().toUpperCase());
}

function isPendingStatus(status: string): boolean {
  return status.trim().toUpperCase() === "PENDIENTE";
}

function isManagementRole(user: AuthenticatedUser): boolean {
  const role = String(user.nombre_rol ?? user.id_rol).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return user.esDirector === true || Number(user.id_rol) === 1 || Number(user.id_rol) === 5 || role === "director" || role === "administrador";
}

function roleForDatabaseName(value: unknown): UserRole {
  const role = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const roles: Record<string, UserRole> = {
    director: "Director",
    administrador: "Administrador",
    paramedico: "Paramédico",
    bombero: "Bombero",
    comandante: "Comandante",
    administrativo: "Administrativo",
    socorrista: "Socorrista",
    "apoyo logistico": "Apoyo Logístico",
    "atencion comunitaria": "Atención Comunitaria",
    despachador: "Despachador",
    almacen: "Almacén",
  };
  return roles[role] ?? "Socorrista";
}

function roleForAuthenticatedUser(user: AuthenticatedUser, associations: Association[]): UserRole {
  if (isManagementRole(user)) {
    const role = String(user.nombre_rol ?? user.id_rol).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return role === "administrador" ? "Administrador" : "Director";
  }
  if (!isApprovedAccount(user)) return "Socorrista";
  const savedRole = associations
    .flatMap(association => association.requests)
    .find(request => request.userEmail.toLowerCase() === user.correo.toLowerCase() && isApprovedRequest(request))
    ?.role;
  return savedRole ?? "Paramédico";
}

function isStoredAssociationPermissions(value: unknown): value is AssociationPermissions {
  if (!value || typeof value !== "object") return false;
  const permissions = value as Record<string, unknown>;
  return ["puedeVerCampo", "puedeModificarCampo", "puedeVerDespacho", "puedeModificarDespacho", "puedeVerAlmacen", "puedeModificarAlmacen"]
    .every(key => typeof permissions[key] === "boolean")
    && (permissions.puedeVerReportes === undefined || typeof permissions.puedeVerReportes === "boolean");
}

const PERMISSION_KEYS: Record<keyof AssociationPermissions, string> = {
  puedeVerCampo: "campo_ver",
  puedeModificarCampo: "campo_modificar",
  puedeVerDespacho: "despacho_ver",
  puedeModificarDespacho: "despacho_modificar",
  puedeVerAlmacen: "almacen_ver",
  puedeModificarAlmacen: "almacen_modificar",
  puedeVerReportes: "reportes_ver",
};

function permissionsFromGrantNames(grants: string[] | undefined): AssociationPermissions | null {
  if (!grants?.includes("permissions_configured")) return null;
  return {
    puedeVerCampo: grants.includes(PERMISSION_KEYS.puedeVerCampo),
    puedeModificarCampo: grants.includes(PERMISSION_KEYS.puedeModificarCampo),
    puedeVerDespacho: grants.includes(PERMISSION_KEYS.puedeVerDespacho),
    puedeModificarDespacho: grants.includes(PERMISSION_KEYS.puedeModificarDespacho),
    puedeVerAlmacen: grants.includes(PERMISSION_KEYS.puedeVerAlmacen),
    puedeModificarAlmacen: grants.includes(PERMISSION_KEYS.puedeModificarAlmacen),
    puedeVerReportes: grants.includes(PERMISSION_KEYS.puedeVerReportes),
  };
}

function grantNamesFromPermissions(permissions: AssociationPermissions): string[] {
  return Object.entries(PERMISSION_KEYS)
    .filter(([key]) => permissions[key as keyof AssociationPermissions])
    .map(([, grant]) => grant);
}

function isStoredAssociation(value: unknown): value is Association {
  if (!value || typeof value !== "object") return false;
  const association = value as Record<string, unknown>;
  return typeof association.id === "string"
    && typeof association.name === "string"
    && typeof association.code === "string"
    && typeof association.directorEmail === "string"
    && Array.isArray(association.requests)
    && association.requests.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const request = item as Record<string, unknown>;
      return typeof request.id === "string"
        && (request.userId === undefined || typeof request.userId === "string")
        && typeof request.userEmail === "string"
        && ["Pendiente de Aprobación", "Aceptada", "APROBADO", "Rechazada"].includes(String(request.status))
        && typeof request.role === "string"
        && (request.permissions === undefined || isStoredAssociationPermissions(request.permissions));
    });
}

function loadStoredAssociations(): { associations: Association[]; canPersist: boolean } {
  try {
    const stored = window.localStorage.getItem(ASSOCIATIONS_STORAGE_KEY);
    if (!stored) return { associations: [DEFAULT_ASSOCIATION], canPersist: true };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isStoredAssociation)) {
      throw new Error("El formato guardado de asociaciones no es válido.");
    }
    const normalized = parsed.map(association => ({
      ...association,
      requests: association.requests.map(request => request.permissions
        ? { ...request, permissions: { ...request.permissions, puedeVerReportes: request.permissions.puedeVerReportes ?? false } }
        : request),
    }));
    return { associations: ensureDefaultAssociation(normalized), canPersist: true };
  } catch (error) {
    console.error("No se pudieron cargar las asociaciones guardadas.", error);
    return { associations: [DEFAULT_ASSOCIATION], canPersist: false };
  }
}

function getRolePermissions(role: UserRole | null): RolePermissions {
  const normalizedRole = role?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  switch (normalizedRole) {
    case "director":
    case "administrador":
    case "comandante":
      return { screens: ["campo", "despacho", "inventario", "reportes"], canEditCampo: true, canEditDespacho: true, inventory: "manage", canManageRequests: true, canViewReports: true };
    case "paramedico":
    case "socorrista":
      return { screens: ["campo", "inventario"], canEditCampo: true, canEditDespacho: false, inventory: "read", canManageRequests: false, canViewReports: false };
    case "despachador":
      return { screens: ["campo", "despacho"], canEditCampo: false, canEditDespacho: true, inventory: "none", canManageRequests: false, canViewReports: false };
    case "bombero":
      return { screens: ["campo", "despacho", "inventario"], canEditCampo: false, canEditDespacho: false, inventory: "consume", canManageRequests: false, canViewReports: false };
    case "administrativo":
    case "apoyo logistico":
      return { screens: ["campo", "inventario"], canEditCampo: false, canEditDespacho: false, inventory: "manage", canManageRequests: false, canViewReports: false };
    case "atencion comunitaria":
      return { screens: ["campo"], canEditCampo: false, canEditDespacho: false, inventory: "none", canManageRequests: false, canViewReports: false };
    default:
      return { screens: [], canEditCampo: false, canEditDespacho: false, inventory: "none", canManageRequests: false, canViewReports: false };
  }
}

function getDefaultAssociationPermissions(role: UserRole): AssociationPermissions {
  const rolePermissions = getRolePermissions(role);
  return {
    puedeVerCampo: rolePermissions.screens.includes("campo"),
    puedeModificarCampo: rolePermissions.canEditCampo,
    puedeVerDespacho: rolePermissions.screens.includes("despacho"),
    puedeModificarDespacho: rolePermissions.canEditDespacho,
    puedeVerAlmacen: rolePermissions.inventory !== "none",
    puedeModificarAlmacen: rolePermissions.inventory === "manage" || rolePermissions.inventory === "consume",
    puedeVerReportes: rolePermissions.canViewReports,
  };
}

function getFirstAvailableScreen(permissions: AssociationPermissions | null): Screen | null {
  if (!permissions) return null;
  if (permissions.puedeVerCampo) return "campo";
  if (permissions.puedeVerDespacho) return "despacho";
  if (permissions.puedeVerAlmacen) return "inventario";
  if (permissions.puedeVerReportes) return "reportes";
  return null;
}

function applyAssociationPermissions(role: UserRole | null, assigned: AssociationPermissions | null): RolePermissions {
  const rolePermissions = getRolePermissions(role);
  if (!assigned) return rolePermissions;
  return {
    ...rolePermissions,
    screens: [
      ...(assigned.puedeVerCampo ? ["campo" as OperationalScreen] : []),
      ...(assigned.puedeVerDespacho ? ["despacho" as OperationalScreen] : []),
      ...(assigned.puedeVerAlmacen ? ["inventario" as OperationalScreen] : []),
      ...(assigned.puedeVerReportes ? ["reportes" as OperationalScreen] : []),
    ],
    canEditCampo: assigned.puedeModificarCampo,
    canEditDespacho: assigned.puedeModificarDespacho,
    inventory: !assigned.puedeVerAlmacen
      ? "none"
      : !assigned.puedeModificarAlmacen
        ? "read"
        : rolePermissions.inventory === "consume"
          ? "consume"
          : "manage",
    canViewReports: assigned.puedeVerReportes,
  };
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
type CallStatus = "camino" | "atencion" | "finalizado" | "en_reporte";

interface ActiveCall {
  id: string;
  folio: string;
  hora: string;
  ubicacion: string;
  tipo: IncidentType;
  unidad: string;
  status: CallStatus;
}

type Category = "todos" | "prehospitalario" | "limpieza" | "rescate" | "contra-incendios" | "combustibles";

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
function GlobalNavBar({ screen, setScreen, online, isAuthenticated, permissions, isDirector, hasActiveAssociation, onLogout }: { screen: Screen; setScreen: (s: Screen) => void; online: boolean; isAuthenticated: boolean; permissions: RolePermissions; isDirector: boolean; hasActiveAssociation: boolean; onLogout: () => void }) {
  if (!isAuthenticated) return null;

  const availableScreens: { id: Screen; label: string; icon: string }[] = isDirector
    ? [
      { id: "despacho", label: "Despacho", icon: "📡" },
      { id: "campo", label: "Campo", icon: "🚑" },
      { id: "inventario", label: "Almacén", icon: "📦" },
      { id: "reportes", label: "Reportes", icon: "📊" },
      { id: "gestion-directores", label: "Solicitudes / Personal", icon: "⚙️" },
    ]
    : !hasActiveAssociation
    ? []
    : [
      ...(permissions.screens.includes("despacho") ? [{ id: "despacho" as Screen, label: "Despacho", icon: "📡" }] : []),
      ...(permissions.screens.includes("campo") ? [{ id: "campo" as Screen, label: "Campo", icon: "🚑" }] : []),
      ...(permissions.screens.includes("inventario") ? [{ id: "inventario" as Screen, label: "Almacén", icon: "📦" }] : []),
      ...(permissions.canViewReports ? [{ id: "reportes" as Screen, label: "Reportes", icon: "📊" }] : []),
      ...(permissions.canManageRequests
        ? [{ id: "gestionSolicitudes" as Screen, label: "Solicitudes", icon: "👥" }]
        : []),
    ];
  return (
    <header style={{ background: "#0a1628", position: "sticky", top: 0, zIndex: 1000, boxShadow: "0 2px 14px rgba(0,0,0,0.4)", borderBottom: "1px solid #1e3a6e" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <nav style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto" }}>
          {availableScreens.map(s => {
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: online ? "rgba(22,163,74,0.15)" : "rgba(217,119,6,0.15)", border: `1px solid ${online ? "rgba(22,163,74,0.3)" : "rgba(217,119,6,0.3)"}`, borderRadius: 20, padding: "4px 8px" }}>
            <span style={{ fontSize: 8 }}>{online ? "🟢" : "🟡"}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: online ? "#4ade80" : "#fbbf24" }}>{online ? "Conectado" : "Offline"}</span>
          </div>
          <button type="button" onClick={onLogout} style={{ padding: "7px 10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            🚪 Cerrar Sesión
          </button>
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

function LoginScreen({ onLoginSuccess, goBack, successNotice }: { onLoginSuccess: (email: string, password: string) => Promise<void>; goBack: () => void; successNotice: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await onLoginSuccess(email.trim(), password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo iniciar sesión.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: "48px auto", padding: "0 16px" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 16, padding: 24 }}>
        <h1 style={{ color: "#0a1628", fontSize: 22, margin: "0 0 20px" }}>Iniciar Sesión</h1>
        {successNotice && <p role="status" style={{ color: "#166534", background: "#dcfce7", padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 600 }}>{successNotice}</p>}
        <label style={{ display: "block", color: "#162b55", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>CORREO ELECTRÓNICO</label>
        <input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, marginBottom: 16 }} />
        <label style={{ display: "block", color: "#162b55", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>CONTRASEÑA</label>
        <input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, marginBottom: 20 }} />
        {error && <p role="alert" style={{ color: "#991b1b", fontSize: 13, fontWeight: 600 }}>{error}</p>}
        <button type="submit" disabled={isSubmitting} style={{ width: "100%", minHeight: 48, background: isSubmitting ? "#94a3b8" : "#dc2626", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: isSubmitting ? "wait" : "pointer" }}>{isSubmitting ? "Validando..." : "Entrar"}</button>
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

function SeleccionarAsociacionScreen({ associations, userEmail, approvalStatus, associationId, onRequest, onApprovalDetected, onCancelRequest, onLogout }: {
  associations: Association[];
  userEmail: string;
  approvalStatus: string;
  associationId: string | null;
  onRequest: (association: Association, request: AssociationRequest) => void;
  onApprovalDetected: (user: AuthenticatedUser) => void;
  onCancelRequest: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [associationCode, setAssociationCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [submittedAssociationId, setSubmittedAssociationId] = useState<string | null>(null);
  const requestFor = (association: Association) => association.requests.find(request => request.userEmail.toLowerCase() === userEmail.toLowerCase());
  const submittedAssociation = associations.find(association => association.id === (submittedAssociationId ?? associationId))
    ?? associations.find(association => requestFor(association)?.status === "Pendiente de Aprobación");
  const isPending = isPendingStatus(approvalStatus);

  const submitCode = async (code = associationCode) => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setMessage("Ingresa el código de asociación antes de enviar la solicitud.");
      setSubmittedAssociationId(null);
      return;
    }
    setIsSubmittingCode(true);
    setMessage("");
    setSubmittedAssociationId(null);

    try {
      const response = await fetch(API_SOLICITUDES_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo: userEmail, codigo_invitacion: normalizedCode }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
          ? result.mensaje
          : `La API respondió con HTTP ${response.status}.`;
        throw new Error(errorMessage);
      }
      if (!result || typeof result !== "object" || !("asociacion" in result) || !("solicitud" in result)) {
        throw new Error("La respuesta de la API no contiene los datos de la solicitud.");
      }
      const data = result as {
        asociacion: { id_asociacion: number | string; nombre_asociacion: string; codigo_invitacion: string };
        solicitud: { id_usuario: number | string; correo: string; estatus_aprobado: string };
      };
      const association: Association = {
        id: String(data.asociacion.id_asociacion),
        name: data.asociacion.nombre_asociacion,
        code: data.asociacion.codigo_invitacion,
        directorEmail: "",
        requests: [],
      };
      const request: AssociationRequest = {
        id: String(data.solicitud.id_usuario),
        userId: String(data.solicitud.id_usuario),
        userEmail: data.solicitud.correo,
        status: "Pendiente de Aprobación",
        role: "Socorrista",
      };
      onRequest(association, request);
      setSubmittedAssociationId(association.id);
      setAssociationCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo enviar la solicitud.");
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const cancelRequest = async () => {
    setIsCancellingRequest(true);
    setMessage("");
    try {
      await onCancelRequest();
      setSubmittedAssociationId(null);
      setAssociationCode("");
      setMessage("Solicitud cancelada. Puedes ingresar un código para volver a solicitar acceso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cancelar la solicitud.");
    } finally {
      setIsCancellingRequest(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;
    const checkApproval = async () => {
      try {
        const response = await fetch(API_AUTH_URL, { credentials: "include" });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("usuario" in result)) return;
        const data = result as { usuario: Record<string, unknown> };
        if (
          (typeof data.usuario.id_asociacion !== "number" && typeof data.usuario.id_asociacion !== "string")
          || (submittedAssociationId && String(data.usuario.id_asociacion) !== submittedAssociationId)
          || (typeof data.usuario.id_usuario !== "number" && typeof data.usuario.id_usuario !== "string")
          || (typeof data.usuario.id_rol !== "number" && typeof data.usuario.id_rol !== "string")
          || typeof data.usuario.correo !== "string"
          || typeof data.usuario.estatus_aprobado !== "string"
          || String(data.usuario.estatus_aprobado).trim().toUpperCase() !== "APROBADO"
        ) return;
        if (!isCurrent) return;
        onApprovalDetected({
          id_usuario: data.usuario.id_usuario,
          correo: data.usuario.correo,
          id_asociacion: data.usuario.id_asociacion,
          id_rol: data.usuario.id_rol,
          estatus_aprobado: data.usuario.estatus_aprobado,
          nombre_rol: typeof data.usuario.nombre_rol === "string" ? data.usuario.nombre_rol : null,
          nombre_asociacion: typeof data.usuario.nombre_asociacion === "string" ? data.usuario.nombre_asociacion : null,
          codigo_invitacion: typeof data.usuario.codigo_invitacion === "string" ? data.usuario.codigo_invitacion : null,
          permisos: Array.isArray(data.usuario.permisos) && data.usuario.permisos.every(item => typeof item === "string")
            ? data.usuario.permisos
            : undefined,
        });
      } catch (error) {
        console.warn("No se pudo consultar el estado de aprobación.", error);
      }
    };
    void checkApproval();
    const intervalId = window.setInterval(() => void checkApproval(), 5000);
    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
    };
  }, [submittedAssociationId, userEmail]);

  return (
    <div style={{ maxWidth: 680, margin: "32px auto", padding: "0 16px 40px" }}>
      <section style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 16, padding: 24 }}>
        <h1 style={{ color: "#0a1628", fontSize: 22, margin: "0 0 8px" }}>Seleccionar Asociación</h1>
        <p style={{ color: "#475569", margin: "0 0 20px" }}>Solicita acceso a una asociación para continuar. El Director deberá aprobar tu solicitud.</p>
        {isPending && (
          <div role="status" style={{ background: "#fef3c7", color: "#78350f", borderRadius: 8, padding: 12, marginBottom: 16, fontWeight: 700 }}>
            ⏳ Solicitud enviada exitosamente{submittedAssociation ? ` a la asociación '${submittedAssociation.name}'` : ""}. Esperando aprobación del Director.
          </div>
        )}
        {isPending ? (
          <button type="button" onClick={() => void cancelRequest()} disabled={isCancellingRequest} style={{ minHeight: 44, padding: "0 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: isCancellingRequest ? "wait" : "pointer" }}>
            {isCancellingRequest ? "Cancelando..." : "🗑️ Cancelar / Eliminar Solicitud"}
          </button>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            <input value={associationCode} onChange={event => { setAssociationCode(event.target.value); setMessage(""); }} placeholder="SCE-TEST01" aria-label="Código de Asociación" style={{ flex: "1 1 220px", minHeight: 44, boxSizing: "border-box", padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8 }} />
            <button type="button" onClick={() => void submitCode()} disabled={isSubmittingCode} style={{ minHeight: 44, padding: "0 16px", background: "#162b55", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: isSubmittingCode ? "wait" : "pointer" }}>{isSubmittingCode ? "Consultando..." : "Usar Código / Enviar"}</button>
          </div>
        )}
        {message && <p role="alert" style={{ color: "#162b55", fontWeight: 600 }}>{message}</p>}
        <button type="button" onClick={() => void onLogout()} style={{ marginTop: 20, minHeight: 42, padding: "0 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>🚪 Cerrar Sesión</button>
      </section>
    </div>
  );
}

function GestionSolicitudesScreen({ associations, associationId, currentUserEmail, onUpdateRequest, onSaveMember, onLogout }: {
  associations: Association[];
  associationId: string;
  currentUserEmail: string;
  onUpdateRequest: (associationId: string, requestId: string, status: RequestStatus, role: UserRole, userId?: string, userEmail?: string, permissions?: AssociationPermissions, roleId?: number) => Promise<void>;
  onSaveMember: (associationId: string, request: AssociationRequest, role: UserRole, roleId: number, permissions: AssociationPermissions) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [backendRequests, setBackendRequests] = useState<AssociationRequest[]>([]);
  const [backendMembers, setBackendMembers] = useState<AssociationRequest[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const directorAssociations = [associations.find(association => association.id === associationId) ?? {
    ...DEFAULT_ASSOCIATION,
    id: associationId,
  }];
  const roles: UserRole[] = roleOptions.length > 0
    ? roleOptions.map(option => option.name)
    : ["Paramédico", "Bombero", "Comandante", "Despachador", "Administrativo", "Socorrista", "Apoyo Logístico", "Atención Comunitaria", "Almacén"];

  useEffect(() => {
    let isCurrent = true;
    const loadPendingRequests = async () => {
      setRequestsLoading(true);
      setRequestsError("");
      try {
        const response = await fetch(`${API_SOLICITUDES_URL}?id_asociacion=${encodeURIComponent(associationId)}`, { credentials: "include" });
        const result: unknown = await response.json();
        if (!response.ok) {
          const errorMessage = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
            ? result.mensaje
            : `La API respondió con HTTP ${response.status}.`;
          throw new Error(errorMessage);
        }
        if (!result || typeof result !== "object" || !("solicitudes" in result) || !Array.isArray(result.solicitudes)) {
          throw new Error("La respuesta de la API no contiene una lista de solicitudes válida.");
        }
        const parseUserRow = (item: unknown, status: RequestStatus): AssociationRequest => {
          if (!item || typeof item !== "object") throw new Error("La API devolvió una solicitud inválida.");
          const row = item as Record<string, unknown>;
          if (
            (typeof row.id_usuario !== "number" && typeof row.id_usuario !== "string")
            || typeof row.correo !== "string"
          ) {
            throw new Error("La API devolvió una solicitud sin ID o correo.");
          }
          return {
            id: String(row.id_usuario),
            userId: String(row.id_usuario),
            userEmail: row.correo,
            status,
            role: roleForDatabaseName(row.nombre_rol),
            roleId: typeof row.id_rol === "number" ? row.id_rol : Number(row.id_rol),
            nombre_completo: typeof row.nombre_completo === "string" ? row.nombre_completo : null,
            nombre: typeof row.nombre === "string" ? row.nombre : null,
            apellido_paterno: typeof row.apellido_paterno === "string" ? row.apellido_paterno : null,
            apellido_materno: typeof row.apellido_materno === "string" ? row.apellido_materno : null,
            fecha_nacimiento: typeof row.fecha_nacimiento === "string" ? row.fecha_nacimiento : null,
            tipo_sangre: typeof row.tipo_sangre === "string" ? row.tipo_sangre : null,
            alergias: typeof row.alergias === "string" ? row.alergias : null,
            padecimientos: typeof row.padecimientos === "string" ? row.padecimientos : null,
            contacto_emergencia_nombre: typeof row.contacto_emergencia_nombre === "string" ? row.contacto_emergencia_nombre : null,
            contacto_emergencia_telefono: typeof row.contacto_emergencia_telefono === "string" ? row.contacto_emergencia_telefono : null,
            permissions: permissionsFromGrantNames(
              Array.isArray(row.permisos) && row.permisos.every(permission => typeof permission === "string")
                ? row.permisos
                : undefined
            ) ?? undefined,
          };
        };
        const requests = result.solicitudes.map((item: unknown) => parseUserRow(item, "Pendiente de Aprobación"));
        const members = "miembros" in result && Array.isArray(result.miembros)
          ? result.miembros.map((item: unknown) => parseUserRow(item, "APROBADO"))
          : [];
        const rolesFromApi = "roles" in result && Array.isArray(result.roles)
          ? result.roles.flatMap((item: unknown) => {
            if (!item || typeof item !== "object") return [];
            const row = item as Record<string, unknown>;
            const id = Number(row.id_rol);
            const name = roleForDatabaseName(row.nombre_rol);
            return Number.isInteger(id) && id > 0 ? [{ id, name }] : [];
          })
          : [];
        if (isCurrent) {
          setBackendRequests(requests);
          setBackendMembers(members);
          setRoleOptions(rolesFromApi);
        }
      } catch (error) {
        if (isCurrent) {
          setRequestsError(error instanceof Error ? error.message : "No se pudieron cargar las solicitudes.");
        }
      } finally {
        if (isCurrent) setRequestsLoading(false);
      }
    };
    void loadPendingRequests();
    return () => { isCurrent = false; };
  }, [associationId, refreshVersion]);

  const refreshRequests = () => setRefreshVersion(version => version + 1);

  return (
    <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ color: "#0a1628", fontSize: 22, margin: 0 }}>Gestión de Solicitudes</h1>
        <button type="button" onClick={() => void onLogout()} style={{ minHeight: 40, padding: "0 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>🚪 Cerrar Sesión</button>
      </div>
      {requestsError && <p role="alert" style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 8 }}>{requestsError}</p>}
      {directorAssociations.map(association => (
        <section key={association.id} style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <h2 style={{ color: "#162b55", fontSize: 16, margin: "0 0 12px" }}>{association.name}</h2>
          <p style={{ color: "#475569", fontSize: 12, margin: "0 0 16px" }}>Código de asociación: {association.code}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <h3 style={{ color: "#162b55", fontSize: 14 }}>Solicitudes pendientes</h3>
            <button type="button" onClick={refreshRequests} disabled={requestsLoading} style={{ minHeight: 34, padding: "0 10px", background: "#162b55", color: "#fff", border: "none", borderRadius: 7, fontWeight: 700, cursor: requestsLoading ? "wait" : "pointer" }}>{requestsLoading ? "Actualizando..." : "↻ Actualizar"}</button>
          </div>
          {requestsLoading && <p role="status" style={{ color: "#475569" }}>Cargando solicitudes del servidor...</p>}
          {(() => {
            const pendingByEmail = new Map<string, AssociationRequest>();
            association.requests
              .filter(request => request.status === "Pendiente de Aprobación")
              .forEach(request => pendingByEmail.set(request.userEmail.toLowerCase(), request));
            backendRequests.forEach(request => {
              const localRequest = pendingByEmail.get(request.userEmail.toLowerCase());
              pendingByEmail.set(request.userEmail.toLowerCase(), {
                ...localRequest,
                ...request,
                id: request.id,
                userId: request.userId,
              });
            });
            const pendingRequests = Array.from(pendingByEmail.values());
            return pendingRequests.length === 0 ? (
            <p style={{ color: "#64748b" }}>No hay solicitudes pendientes.</p>
            ) : pendingRequests.map(request => (
              <RequestReview key={`${request.userId ?? request.id}`} association={association} request={request} roles={roles} roleOptions={roleOptions} onUpdate={onUpdateRequest} onUpdated={refreshRequests} />
            ));
          })()}
          {(() => {
            const membersById = new Map<string, AssociationRequest>();
            association.requests.filter(isApprovedRequest).forEach(request => membersById.set(request.userId ?? request.id, request));
            backendMembers.forEach(member => membersById.set(member.userId ?? member.id, { ...membersById.get(member.userId ?? member.id), ...member }));
            const members = Array.from(membersById.values()).filter(member =>
              member.userEmail.toLowerCase() !== currentUserEmail.trim().toLowerCase()
              && member.roleId !== 1
              && member.role !== "Director"
              && member.role !== "Administrador"
            );
            return members.length > 0 && (
            <>
              <h3 style={{ color: "#162b55", fontSize: 14, marginTop: 20 }}>Miembros y roles</h3>
              {members.map(request => (
                <RequestReview key={request.id} association={association} request={request} roles={roles} roleOptions={roleOptions} onUpdate={onUpdateRequest} onSaveMember={onSaveMember} />
              ))}
            </>
            );
          })()}
        </section>
      ))}
    </div>
  );
}

interface ReportRow {
  id_reporte: number;
  folio: string;
  fecha: string;
  unidad: string;
  paciente: string;
  detalle: {
    general?: Record<string, unknown>;
    pacientes?: Array<Record<string, unknown>>;
    insumos?: Array<Record<string, unknown>>;
    personal?: Record<string, unknown>;
    firma_digital?: string;
    hora_despacho?: string;
    hora_arribo?: string;
    ubicacion?: string;
  };
  evidencias: string[];
}

function ReportesScreen() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadReports = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(API_REPORTES_URL, { credentials: "include" });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
            ? result.mensaje
            : `La API respondió con HTTP ${response.status}.`;
          throw new Error(message);
        }
        if (!result || typeof result !== "object" || !("reportes" in result) || !Array.isArray(result.reportes)) {
          throw new Error("La API no devolvió una lista de reportes válida.");
        }
        const rows = result.reportes.map((item: unknown): ReportRow => {
          if (!item || typeof item !== "object") throw new Error("La API devolvió un reporte inválido.");
          const row = item as Record<string, unknown>;
          if (
            (typeof row.id_reporte !== "number" && typeof row.id_reporte !== "string")
            || typeof row.folio !== "string"
            || typeof row.fecha !== "string"
            || typeof row.unidad !== "string"
            || typeof row.paciente !== "string"
          ) throw new Error("La API devolvió un reporte incompleto.");
          return {
            id_reporte: Number(row.id_reporte),
            folio: row.folio,
            fecha: row.fecha,
            unidad: row.unidad,
            paciente: row.paciente,
            detalle: row.detalle && typeof row.detalle === "object" && !Array.isArray(row.detalle)
              ? row.detalle as ReportRow["detalle"]
              : {},
            evidencias: Array.isArray(row.evidencias) && row.evidencias.every(path => typeof path === "string")
              ? row.evidencias
              : [],
          };
        });
        if (active) setReports(rows);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los reportes.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadReports();
    return () => { active = false; };
  }, []);

  const getExportValues = (report: ReportRow): string[] => {
    const detail = report.detalle;
    const general = detail.general ?? {};
    const patients = detail.pacientes ?? [];
    const supplies = detail.insumos ?? [];
    const patientSummary = patients.map(patient => [
      patient.nombre,
      patient.edad ? `${patient.edad} años` : "",
      patient.sexo,
      patient.triage ? `Triage ${patient.triage}` : "",
      patient.alergias ? `Alergias: ${patient.alergias}` : "",
      patient.observaciones ? `Observaciones: ${patient.observaciones}` : "",
    ].filter(Boolean).join(" | ")).filter(Boolean).join(" || ") || report.paciente;
    const vitalSummary = patients.flatMap((patient, index) => {
      const vitals = Array.isArray(patient.vitales) ? patient.vitales : [];
      return vitals.map((vital: unknown) => {
        if (!vital || typeof vital !== "object") return "";
        const row = vital as Record<string, unknown>;
        return `Paciente ${index + 1} ${String(row.hora ?? "")}: FR ${String(row.fr ?? "")}, FC ${String(row.fc ?? "")}, TA ${String(row.ta ?? "")}, SpO2 ${String(row.spo2 ?? "")}`;
      });
    }).filter(Boolean).join(" || ");
    const supplySummary = supplies.map(supply =>
      `${String(supply.nombre ?? `Insumo ${String(supply.id_insumo ?? "")}`)}: ${String(supply.cantidad_usada ?? "")} ${String(supply.unidad_medida ?? "")}`.trim()
    ).join(" || ");
    const staff = detail.personal ?? {};
    return [
      report.folio,
      report.fecha,
      String(detail.hora_despacho ?? general.horaLlamada ?? ""),
      String(detail.hora_arribo ?? general.horaLlegada ?? ""),
      String(detail.ubicacion ?? general.direccion ?? ""),
      patients.map(patient => String(patient.triage ?? "")).filter(Boolean).join(" || "),
      patientSummary,
      vitalSummary,
      supplySummary,
      String(staff.paramedico ?? general.paramedicoCargo ?? ""),
      String(staff.operador ?? general.operador ?? ""),
      String(staff.apoyo ?? general.elementosApoyo ?? ""),
      detail.firma_digital ? "Firma digital adjunta" : "Sin firma digital",
      report.evidencias.join(" | "),
    ];
  };
  const exportHeaders = [
    "Folio", "Fecha", "Hora Despacho", "Hora Arribo", "Ubicación / Dirección", "Triage",
    "Datos del Paciente", "Historial de Signos Vitales (FR, FC, TA, SpO2)", "Insumos Consumidos",
    "Paramédico Responsable", "Operador / Conductor", "Personal de Apoyo", "Firma Digital", "Evidencias",
  ];
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] ?? character);
  const downloadReport = (report: ReportRow, format: "csv" | "excel" | "pdf") => {
    const values = getExportValues(report);
    if (format === "pdf") {
      const printWindow = window.open("", "_blank", "width=1000,height=800");
      if (!printWindow) return;
      printWindow.opener = null;
      const rows = exportHeaders.map((header, index) => `<tr><th>${escapeHtml(header)}</th><td>${escapeHtml(values[index] || "")}</td></tr>`).join("");
      const signature = report.detalle.firma_digital?.startsWith("data:image/")
        ? `<section><h2>Firma Digital</h2><img class="signature" src="${report.detalle.firma_digital}" alt="Firma digital del responsable"></section>`
        : "";
      const evidence = report.evidencias.map(path => {
        const url = new URL(path, `${API_BASE_URL.replace(/\/api$/, "")}/`).href;
        return `<img class="evidence" src="${escapeHtml(url)}" alt="Evidencia del servicio">`;
      }).join("");
      const evidenceSection = evidence ? `<section><h2>Evidencias del Servicio</h2><div class="evidence-list">${evidence}</div></section>` : "";
      printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(report.folio)}</title><style>body{font-family:Arial,sans-serif;color:#0a1628;padding:24px}h1{font-size:20px}h2{font-size:16px;margin:22px 0 8px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:8px;border:1px solid #cbd5e1}th{width:28%;background:#f1f5f9}.signature{max-width:500px;width:100%;height:130px;object-fit:contain;border:1px solid #cbd5e1}.evidence-list{display:flex;flex-wrap:wrap;gap:10px}.evidence{width:180px;height:150px;object-fit:contain;border:1px solid #cbd5e1}@media print{body{padding:0}}</style></head><body><h1>Reporte de Atención · ${escapeHtml(report.folio)}</h1><table>${rows}</table>${signature}${evidenceSection}<script>window.onload=()=>window.print()</script></body></html>`);
      printWindow.document.close();
      return;
    }
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const content = [exportHeaders, values].map(row => row.map(escapeCsv).join(",")).join("\r\n");
    const isExcel = format === "excel";
    const blob = isExcel
      ? new Blob([`<html><meta charset="utf-8"><table><thead><tr>${exportHeaders.map(value => `<th>${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody><tr>${values.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr></tbody></table></html>`], { type: "application/vnd.ms-excel;charset=utf-8" })
      : new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.folio || `reporte-${report.id_reporte}`}.${isExcel ? "xls" : "csv"}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px 40px" }}>
      <h1 style={{ color: "#0a1628", fontSize: 22 }}>📊 Reportes de Atención</h1>
      {error && <p role="alert" style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 8 }}>{error}</p>}
      {loading ? <p role="status">Cargando reportes...</p> : (
        <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #dce9f5", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead><tr>{["Folio", "Fecha", "Unidad", "Paciente", "Acción"].map(label => <th key={label} style={{ padding: 12, color: "#162b55", borderBottom: "1px solid #dce9f5" }}>{label}</th>)}</tr></thead>
            <tbody>
              {reports.map(report => (
                <tr key={report.id_reporte}>
                  <td style={{ padding: 12, borderBottom: "1px solid #eef2f7", color: "#0a1628", opacity: 1 }}>{report.folio}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eef2f7", color: "#0a1628", opacity: 1 }}>{report.fecha}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eef2f7", color: "#0a1628", opacity: 1 }}>{report.unidad}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eef2f7", color: "#0a1628", opacity: 1 }}>{report.paciente || "Sin nombre"}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eef2f7" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button type="button" onClick={() => downloadReport(report, "csv")} style={{ padding: "8px 10px", background: "#162b55", color: "#fff", border: 0, borderRadius: 7, fontWeight: 700, cursor: "pointer" }}>CSV</button>
                      <button type="button" onClick={() => downloadReport(report, "excel")} style={{ padding: "8px 10px", background: "#166534", color: "#fff", border: 0, borderRadius: 7, fontWeight: 700, cursor: "pointer" }}>Excel</button>
                      <button type="button" onClick={() => downloadReport(report, "pdf")} style={{ padding: "8px 10px", background: "#b91c1c", color: "#fff", border: 0, borderRadius: 7, fontWeight: 700, cursor: "pointer" }}>PDF</button>
                      <button type="button" onClick={() => downloadReport(report, "pdf")} style={{ padding: "8px 10px", background: "#475569", color: "#fff", border: 0, borderRadius: 7, fontWeight: 700, cursor: "pointer" }}>Imprimir</button>
                    </div>
                  </td>
                </tr>
              ))}
              {reports.length === 0 && <tr><td colSpan={5} style={{ padding: 18, color: "#64748b", textAlign: "center" }}>No hay reportes registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RequestReview({ association, request, roles, roleOptions = [], onUpdate, onSaveMember, onUpdated }: {
  association: Association;
  request: AssociationRequest;
  roles: UserRole[];
  onUpdate: (associationId: string, requestId: string, status: RequestStatus, role: UserRole, userId?: string, userEmail?: string, permissions?: AssociationPermissions, roleId?: number) => Promise<void>;
  roleOptions?: RoleOption[];
  onSaveMember?: (associationId: string, request: AssociationRequest, role: UserRole, roleId: number, permissions: AssociationPermissions) => Promise<void>;
  onUpdated?: () => void;
}) {
  const [role, setRole] = useState<UserRole>(request.role);
  const [roleId, setRoleId] = useState<number>(request.roleId ?? 2);
  const [memberPermissions, setMemberPermissions] = useState<AssociationPermissions>(
    request.permissions ?? getDefaultAssociationPermissions(request.role)
  );
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [expedienteOpen, setExpedienteOpen] = useState(false);
  const [expedienteLoading, setExpedienteLoading] = useState(false);
  const [expedienteSaving, setExpedienteSaving] = useState(false);
  const [expedienteError, setExpedienteError] = useState("");
  const [expedienteSuccess, setExpedienteSuccess] = useState("");
  const [expediente, setExpediente] = useState({
    nombreCompleto: "",
    fechaNacimiento: "",
    tipoSangre: "",
    alergias: "",
    padecimientos: "",
    contactoNombre: "",
    contactoTelefono: "",
  });
  useEffect(() => {
    setRole(request.role);
    setRoleId(request.roleId ?? 2);
    setMemberPermissions(request.permissions ?? getDefaultAssociationPermissions(request.role));
  }, [request.role, request.roleId, request.permissions]);
  const updateRequest = async (status: RequestStatus) => {
    setActionError("");
    setActionSuccess("");
    try {
      await onUpdate(association.id, request.id, status, role, request.userId, request.userEmail, memberPermissions, roleId);
      onUpdated?.();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo actualizar la solicitud.");
    }
  };
  const saveMember = async () => {
    if (!onSaveMember) return;
    setActionError("");
    setActionSuccess("");
    try {
      await onSaveMember(association.id, request, role, roleId, memberPermissions);
      setActionSuccess("Permisos actualizados correctamente");
      onUpdated?.();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudieron guardar los cambios del usuario.");
    }
  };
  const mapExpediente = (record: Record<string, unknown>) => ({
    nombreCompleto: String(record.nombre_completo || record.nombreCompleto || [record.nombre, record.apellido_paterno, record.apellido_materno].filter(value => typeof value === "string" && value.trim()).join(" ") || ""),
    fechaNacimiento: String(record.fecha_nacimiento || record.fechaNacimiento || ""),
    tipoSangre: String(record.tipo_sangre || record.tipoSangre || ""),
    alergias: String(record.alergias || ""),
    padecimientos: String(record.padecimientos || ""),
    contactoNombre: String(record.contacto_emergencia_nombre || record.contactoNombre || ""),
    contactoTelefono: String(record.contacto_emergencia_telefono || record.contactoTelefono || ""),
  });
  const openExpediente = async () => {
    setExpedienteOpen(true);
    setExpedienteLoading(true);
    setExpedienteError("");
    setExpedienteSuccess("");
    setExpediente(mapExpediente(request as unknown as Record<string, unknown>));
    try {
      const response = await fetch(`${API_PERSONAL_URL}?email=${encodeURIComponent(request.userEmail)}`, { credentials: "include" });
      const result: unknown = await response.json();
      const userRecord = result && typeof result === "object" && "usuario" in result && result.usuario && typeof result.usuario === "object"
        ? result.usuario
        : result && typeof result === "object" && "expediente" in result && result.expediente && typeof result.expediente === "object"
          ? result.expediente
          : null;
      if (!response.ok || !userRecord) {
        const message = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
          ? result.mensaje
          : "No se pudo cargar el expediente del miembro.";
        throw new Error(message);
      }
      const record = userRecord as Record<string, unknown>;
      setExpediente(mapExpediente(record));
    } catch (error) {
      setExpedienteError(error instanceof Error ? error.message : "No se pudo cargar el expediente.");
    } finally {
      setExpedienteLoading(false);
    }
  };
  const saveExpediente = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setExpedienteSaving(true);
    setExpedienteError("");
    setExpedienteSuccess("");
    try {
      const response = await fetch(API_PERSONAL_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_usuario: Number(request.userId ?? request.id), email: request.userEmail, ...expediente }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("success" in result && result.success === true) && !("status" in result && result.status === "success")) {
        const message = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
          ? result.mensaje
          : "No se pudo guardar el expediente.";
        throw new Error(message);
      }
      const updatedUser = "usuario" in result && result.usuario && typeof result.usuario === "object"
        ? result.usuario
        : "expediente" in result && result.expediente && typeof result.expediente === "object"
          ? result.expediente
          : null;
      if (updatedUser) {
        setExpediente(mapExpediente(updatedUser as Record<string, unknown>));
      }
      setExpedienteSuccess("Ficha personal guardada correctamente.");
    } catch (error) {
      setExpedienteError(error instanceof Error ? error.message : "No se pudo guardar el expediente.");
    } finally {
      setExpedienteSaving(false);
    }
  };
  const ageFromBirthDate = (birthDate: string) => {
    if (!birthDate) return "";
    const date = new Date(`${birthDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    if (today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) age -= 1;
    return age >= 0 ? String(age) : "";
  };
  const permissionOptions: { key: keyof AssociationPermissions; label: string }[] = [
    { key: "puedeVerCampo", label: "Ver Campo" },
    { key: "puedeModificarCampo", label: "Modificar Campo" },
    { key: "puedeVerDespacho", label: "Ver Despacho" },
    { key: "puedeModificarDespacho", label: "Modificar Despacho" },
    { key: "puedeVerAlmacen", label: "Ver Almacén" },
    { key: "puedeModificarAlmacen", label: "Modificar Almacén" },
    { key: "puedeVerReportes", label: "Acceso a Reportes" },
  ];
  return (
    <div style={{ borderTop: "1px solid #dce9f5", padding: "14px 0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <div style={{ flex: "1 1 180px", color: "#0a1628", fontWeight: 600 }}>{request.userEmail}</div>
      <select value={roleId} onChange={event => {
        const selectedRoleId = Number(event.target.value);
        setRoleId(selectedRoleId);
        const selectedRole = roleOptions.find(option => option.id === selectedRoleId);
        if (selectedRole) setRole(selectedRole.name);
      }} aria-label={`Rol para ${request.userEmail}`} style={{ minHeight: 40, border: "1px solid #b8cfe8", borderRadius: 8, padding: "0 8px", color: "#0a1628", background: "#fff", fontWeight: 600 }}>
        {roleOptions.length > 0
          ? roleOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)
          : roles.map((item, index) => <option key={item} value={index + 2}>{item}</option>)}
      </select>
      {request.status === "Pendiente de Aprobación" ? (
        <>
          <button type="button" onClick={() => void updateRequest("APROBADO")} style={{ minHeight: 40, padding: "0 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>✅ Aceptar Usuario</button>
          <button type="button" onClick={() => void updateRequest("Rechazada")} style={{ minHeight: 40, padding: "0 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>🗑️ Eliminar / Rechazar Solicitud</button>
        </>
      ) : (
        <button type="button" onClick={() => void updateRequest("APROBADO")} style={{ minHeight: 40, padding: "0 12px", background: "#162b55", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Guardar rol</button>
      )}
      {(
        <div style={{ flex: "1 1 100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, paddingTop: 4 }}>
          {permissionOptions.map(option => (
            <label key={option.key} style={{ display: "flex", alignItems: "center", gap: 6, color: "#162b55", fontSize: 12, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={memberPermissions[option.key]}
                onChange={event => {
                  const updatedPermissions = { ...memberPermissions, [option.key]: event.target.checked };
                  setMemberPermissions(updatedPermissions);
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
      {request.status === "APROBADO" && onSaveMember && (
        <>
          <button type="button" onClick={() => void saveMember()} style={{ minHeight: 40, padding: "0 12px", background: "#162b55", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>💾 Guardar cambios</button>
          <button type="button" onClick={() => void openExpediente()} style={{ minHeight: 40, padding: "0 12px", background: "#0f766e", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>📋 Ver Expediente / Ficha</button>
        </>
      )}
      {actionError && <p role="alert" style={{ flex: "1 1 100%", margin: 0, color: "#991b1b", fontSize: 12 }}>{actionError}</p>}
      {actionSuccess && <p role="status" style={{ flex: "1 1 100%", margin: 0, color: "#166534", fontSize: 12, fontWeight: 700 }}>{actionSuccess}</p>}
      {expedienteOpen && (
        <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setExpedienteOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 100001, background: "rgba(10,22,40,0.58)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`expediente-title-${request.id}`} style={{ width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 16 }}>
              <div>
                <h2 id={`expediente-title-${request.id}`} style={{ margin: 0, color: "#0a1628", fontSize: 19 }}>Expediente / Ficha Personal</h2>
                <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>{request.userEmail}</p>
              </div>
              <button type="button" onClick={() => setExpedienteOpen(false)} aria-label="Cerrar expediente" style={{ width: 36, height: 36, border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#0a1628", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            {expedienteLoading ? <p role="status" style={{ color: "#475569" }}>Cargando ficha...</p> : (
              <form onSubmit={saveExpediente}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
                  <label style={{ display: "grid", gap: 5, color: "#162b55", fontSize: 12, fontWeight: 700, gridColumn: "1 / -1" }}>Nombre Completo
                    <input required maxLength={150} value={expediente.nombreCompleto} onChange={event => setExpediente(current => ({ ...current, nombreCompleto: event.target.value }))} style={{ minHeight: 40, padding: "0 10px", border: "1px solid #b8cfe8", borderRadius: 7, color: "#0a1628" }} />
                  </label>
                  <label style={{ display: "grid", gap: 5, color: "#162b55", fontSize: 12, fontWeight: 700 }}>Fecha de Nacimiento
                    <input type="date" value={expediente.fechaNacimiento} onChange={event => setExpediente(current => ({ ...current, fechaNacimiento: event.target.value }))} style={{ minHeight: 40, padding: "0 10px", border: "1px solid #b8cfe8", borderRadius: 7, color: "#0a1628" }} />
                  </label>
                  <label style={{ display: "grid", gap: 5, color: "#162b55", fontSize: 12, fontWeight: 700 }}>Edad
                    <input readOnly value={ageFromBirthDate(expediente.fechaNacimiento)} placeholder="Se calcula con la fecha de nacimiento" style={{ minHeight: 40, padding: "0 10px", border: "1px solid #b8cfe8", borderRadius: 7, color: "#0a1628", background: "#f8fafc" }} />
                  </label>
                  <label style={{ display: "grid", gap: 5, color: "#162b55", fontSize: 12, fontWeight: 700 }}>Tipo de Sangre (RH)
                    <select value={expediente.tipoSangre} onChange={event => setExpediente(current => ({ ...current, tipoSangre: event.target.value }))} style={{ minHeight: 40, padding: "0 10px", border: "1px solid #b8cfe8", borderRadius: 7, color: "#0a1628", background: "#fff" }}>
                      <option value="">Sin especificar</option>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 5, color: "#162b55", fontSize: 12, fontWeight: 700 }}>Alergias
                    <textarea rows={3} value={expediente.alergias} onChange={event => setExpediente(current => ({ ...current, alergias: event.target.value }))} style={{ padding: 9, border: "1px solid #b8cfe8", borderRadius: 7, color: "#0a1628", resize: "vertical" }} />
                  </label>
                  <label style={{ display: "grid", gap: 5, color: "#162b55", fontSize: 12, fontWeight: 700 }}>Padecimientos
                    <textarea rows={3} value={expediente.padecimientos} onChange={event => setExpediente(current => ({ ...current, padecimientos: event.target.value }))} style={{ padding: 9, border: "1px solid #b8cfe8", borderRadius: 7, color: "#0a1628", resize: "vertical" }} />
                  </label>
                  <label style={{ display: "grid", gap: 5, color: "#162b55", fontSize: 12, fontWeight: 700 }}>Contacto de Emergencia · Nombre
                    <input maxLength={150} value={expediente.contactoNombre} onChange={event => setExpediente(current => ({ ...current, contactoNombre: event.target.value }))} style={{ minHeight: 40, padding: "0 10px", border: "1px solid #b8cfe8", borderRadius: 7, color: "#0a1628" }} />
                  </label>
                  <label style={{ display: "grid", gap: 5, color: "#162b55", fontSize: 12, fontWeight: 700 }}>Contacto de Emergencia · Teléfono
                    <input type="tel" maxLength={30} value={expediente.contactoTelefono} onChange={event => setExpediente(current => ({ ...current, contactoTelefono: event.target.value }))} style={{ minHeight: 40, padding: "0 10px", border: "1px solid #b8cfe8", borderRadius: 7, color: "#0a1628" }} />
                  </label>
                </div>
                {expedienteError && <p role="alert" style={{ color: "#991b1b", fontWeight: 600, fontSize: 13 }}>{expedienteError}</p>}
                {expedienteSuccess && <p role="status" style={{ color: "#166534", fontWeight: 700, fontSize: 13 }}>{expedienteSuccess}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                  <button type="button" onClick={() => setExpedienteOpen(false)} style={{ minHeight: 40, padding: "0 12px", border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#0a1628", fontWeight: 700, cursor: "pointer" }}>Cerrar</button>
                  <button type="submit" disabled={expedienteSaving || expedienteLoading} style={{ minHeight: 40, padding: "0 12px", border: 0, borderRadius: 7, background: expedienteSaving ? "#94a3b8" : "#0f766e", color: "#fff", fontWeight: 700, cursor: expedienteSaving ? "wait" : "pointer" }}>{expedienteSaving ? "Guardando..." : "💾 Guardar Ficha"}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function RegistroUsuarioScreen({ onRegistered, goBack }: { onRegistered: (message: string) => void; goBack: () => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [tipoSangre, setTipoSangre] = useState("");
  const [alergias, setAlergias] = useState("");
  const [padecimientos, setPadecimientos] = useState("");
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [hasFirstAidTraining, setHasFirstAidTraining] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const ageFromBirthDate = (birthDate: string) => {
    if (!birthDate) return "";
    const date = new Date(`${birthDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    if (today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) age -= 1;
    return age >= 0 ? String(age) : "";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(API_REGISTRO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "usuario",
          nombre: nombre.trim(),
          correo: email.trim(),
          contrasena: password,
          telefono: telefono.trim(),
          fecha_nacimiento: fechaNacimiento,
          tipo_sangre: tipoSangre,
          alergias: alergias.trim(),
          padecimientos: padecimientos.trim(),
          contacto_emergencia_nombre: contactoNombre.trim(),
          contacto_emergencia_telefono: contactoTelefono.trim(),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
          ? result.mensaje
          : `No se pudo crear la cuenta (HTTP ${response.status}).`;
        throw new Error(errorMessage);
      }
      if (!result || typeof result !== "object" || !("status" in result) || result.status !== "success") {
        throw new Error("El servidor devolvió una respuesta de registro inválida.");
      }
      const successMessage = "Cuenta creada correctamente. Ya puedes iniciar sesión.";
      onRegistered(successMessage);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo completar el registro.");
    } finally {
      setIsSubmitting(false);
    }
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
              <input type="tel" value={telefono} onChange={event => setTelefono(event.target.value)} autoComplete="tel" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>EDAD</label>
              <input readOnly value={ageFromBirthDate(fechaNacimiento)} style={{ ...fieldStyle, background: "#f8fafc" }} />
            </div>
            <div>
              <label style={labelStyle}>FECHA DE NACIMIENTO</label>
              <input type="date" value={fechaNacimiento} onChange={event => setFechaNacimiento(event.target.value)} style={fieldStyle} />
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
              <select value={tipoSangre} onChange={event => setTipoSangre(event.target.value)} style={fieldStyle}>
                <option value="" disabled>Selecciona tu tipo de sangre</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(type => <option key={type}>{type}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>ALERGIAS O PADECIMIENTOS MÉDICOS RELEVANTES</label>
              <textarea value={alergias} onChange={event => setAlergias(event.target.value)} style={textAreaStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>PADECIMIENTOS</label>
              <textarea value={padecimientos} onChange={event => setPadecimientos(event.target.value)} style={textAreaStyle} />
            </div>
            {[1, 2].map(contact => (
              <div key={contact} style={{ gridColumn: "1 / -1", display: "grid", ...fieldGridStyle }}>
                <h3 style={{ gridColumn: "1 / -1", color: "#162b55", fontSize: 13, margin: "4px 0 0" }}>Contacto {contact}</h3>
                <div>
                  <label style={labelStyle}>NOMBRE</label>
                  {contact === 1
                    ? <input value={contactoNombre} onChange={event => setContactoNombre(event.target.value)} style={fieldStyle} />
                    : <input style={fieldStyle} />}
                </div>
                <div>
                  <label style={labelStyle}>TELÉFONO</label>
                  {contact === 1
                    ? <input type="tel" value={contactoTelefono} onChange={event => setContactoTelefono(event.target.value)} style={fieldStyle} />
                    : <input type="tel" style={fieldStyle} />}
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

        {error && <p role="alert" style={{ color: "#991b1b", background: "#fee2e2", padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 600 }}>{error}</p>}
        <button type="submit" disabled={isSubmitting} style={{ width: "100%", minHeight: 48, background: isSubmitting ? "#94a3b8" : "#dc2626", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: isSubmitting ? "wait" : "pointer" }}>{isSubmitting ? "Creando cuenta..." : "Crear cuenta"}</button>
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [form, setForm] = useState({ asociacion: "", razonSocial: "", cedula: "", ejercicioFiscal: "2026", directorNombre: "", directorApPat: "", directorApMat: "", directorEmail: "", password: "", confirmPassword: "" });
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value })) });
  const inputStyle: React.CSSProperties = { width: "100%", minHeight: 48, padding: "0 14px", border: "1.5px solid #b8cfe8", borderRadius: 10, fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#0a1628", background: "#fff", outline: "none" };

  const handleBiometric = () => {
    if (biometric === "scanning") return;
    setBiometric("scanning");
    setTimeout(() => setBiometric(Math.random() > 0.1 ? "verified" : "failed"), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    if (!form.password) {
      setSubmitError("La contraseña es obligatoria.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setSubmitError("Las contraseñas no coinciden");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(API_REGISTRO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "asociacion",
          asociacion: form.asociacion.trim(),
          razonSocial: form.razonSocial.trim(),
          cedula: form.cedula.trim(),
          ejercicioFiscal: form.ejercicioFiscal,
          tipoInstitucion: institutionType,
          directorNombre: form.directorNombre.trim(),
          directorApPat: form.directorApPat.trim(),
          directorApMat: form.directorApMat.trim(),
          directorEmail: form.directorEmail.trim(),
          contrasena: form.password,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("id_asociacion" in result) || !("codigo_invitacion" in result)) {
        const message = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
          ? result.mensaje
          : `No se pudo registrar la institución (HTTP ${response.status}).`;
        throw new Error(message);
      }
      const associationId = String(result.id_asociacion);
      const code = String(result.codigo_invitacion);
      setInviteCode(code);
      onAssociationCreated({
        id: associationId,
        name: form.asociacion,
        code,
        directorEmail: form.directorEmail,
        requests: [],
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "No se pudo completar el registro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🚨</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0a1628", textAlign: "center", marginBottom: 6 }}>¡Institución Registrada!</div>
        <div style={{ fontSize: 13, color: "#475569", textAlign: "center", marginBottom: 24, maxWidth: 360 }}>Tu institución y cuenta de Director se registraron. Ya puedes iniciar sesión con {form.directorEmail} y la contraseña que elegiste.</div>
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
            <input placeholder="Ej. Cruz Roja San Pedro" maxLength={100} required style={inputStyle} {...field("asociacion")} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>RAZÓN SOCIAL *</label>
            <input placeholder="Conforme a Secretaría de Economía" maxLength={100} required style={inputStyle} {...field("razonSocial")} />
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
            <input type="email" placeholder="director@institucion.org.mx" maxLength={100} required style={inputStyle} {...field("directorEmail")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>CONTRASEÑA *</label>
              <input type="password" placeholder="Ingresa tu contraseña" required autoComplete="new-password" style={inputStyle} {...field("password")} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#162b55", marginBottom: 4 }}>CONFIRMAR CONTRASEÑA *</label>
              <input type="password" placeholder="Confirma tu contraseña" required autoComplete="new-password" style={inputStyle} {...field("confirmPassword")} />
            </div>
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
        {submitError && <p role="alert" style={{ color: "#991b1b", background: "#fee2e2", padding: 12, borderRadius: 8, fontWeight: 700 }}>{submitError}</p>}
        <button type="submit" disabled={isSubmitting} style={{ width: "100%", height: 52, background: isSubmitting ? "#94a3b8" : "#dc2626", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: isSubmitting ? "wait" : "pointer", fontFamily: "'Inter', sans-serif" }}>
          {isSubmitting ? "Registrando institución..." : "🚨 Registrar Institución y Generar Código"}
        </button>
        <button type="button" onClick={goBack} style={{ width: "100%", minHeight: 44, marginTop: 8, background: "transparent", color: "#162b55", border: "none", fontWeight: 700, cursor: "pointer" }}>
          ← Volver
        </button>
      </form>
    </div>
  );
}

// ─── SECCIÓN 2: ATENCIÓN EN CAMPO ─────────────────────────────────────────────
interface InventoryItem {
  id_insumo: number;
  nombre: string;
  unidad_medida: string;
  cantidad_disponible: number;
}

function CampoScreen({ initialCall, onPrefillConsumed }: { initialCall: ActiveCall | null; onPrefillConsumed: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [guardando, setGuardando] = useState(false);
  const [mensajeResultado, setMensajeResultado] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [usedSupplies, setUsedSupplies] = useState<Array<{ id_insumo: number; cantidad_usada: number }>>([]);
  const [inventoryError, setInventoryError] = useState("");
  const [evidenceImages, setEvidenceImages] = useState<Array<{ file: File; preview: string }>>([]);
  const evidencePreviewUrls = useRef<string[]>([]);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingSignature = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [unitOptions, setUnitOptions] = useState(["AMB-01", "AMB-02", "AMB-03", "BOMBA R-1", "RESCATE-01", "MOTO-01"]);

  useEffect(() => () => evidencePreviewUrls.current.forEach(URL.revokeObjectURL), []);

  useEffect(() => {
    let active = true;
    const loadUnits = async () => {
      try {
        const response = await fetch(`${API_CAMPO_URL}?accion=unidades`, { credentials: "include" });
        const result: unknown = await response.json();
        if (!response.ok || !result || typeof result !== "object" || !("unidades" in result) || !Array.isArray(result.unidades)) return;
        const names = result.unidades.flatMap((unit: unknown) =>
          unit && typeof unit === "object" && "nombre_unidad" in unit && typeof unit.nombre_unidad === "string"
            ? [unit.nombre_unidad]
            : []
        );
        if (active && names.length > 0) setUnitOptions(Array.from(new Set(names)));
      } catch {
        // Keep the known unit options available if the catalog is offline.
      }
    };
    void loadUnits();
    return () => { active = false; };
  }, []);

  const getSignaturePoint = (clientX: number, clientY: number) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * canvas.width / rect.width,
      y: (clientY - rect.top) * canvas.height / rect.height,
    };
  };

  const startSignature = (clientX: number, clientY: number) => {
    const canvas = signatureCanvasRef.current;
    const point = getSignaturePoint(clientX, clientY);
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !point) return;
    isDrawingSignature.current = true;
    setHasSignature(true);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.strokeStyle = "#0a1628";
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
  };

  const moveSignature = (clientX: number, clientY: number) => {
    if (!isDrawingSignature.current) return;
    const context = signatureCanvasRef.current?.getContext("2d");
    const point = getSignaturePoint(clientX, clientY);
    if (!context || !point) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopSignature = () => {
    isDrawingSignature.current = false;
    signatureCanvasRef.current?.getContext("2d")?.closePath();
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const TABS_LIST: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "pacientes", label: "Pacientes" },
    { id: "insumos", label: "Insumos" },
    { id: "cierre", label: "Cierre" },
  ];

  const activeIndex = TABS_LIST.findIndex(t => t.id === activeTab);

  const [generalData, setGeneralData] = useState(() => ({
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
    ...(initialCall ? {
      folio: initialCall.folio,
      direccion: initialCall.ubicacion,
      unidad: initialCall.unidad,
      horaLlamada: initialCall.hora,
    } : {}),
  }));

  useEffect(() => {
    if (initialCall) onPrefillConsumed();
  }, [initialCall, onPrefillConsumed]);

  useEffect(() => {
    let active = true;
    const loadInventory = async () => {
      setInventoryError("");
      try {
        const response = await fetch(`${API_INVENTARIO_URL}?unidad=${encodeURIComponent(generalData.unidad.trim())}`, { credentials: "include" });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
            ? result.mensaje
            : `La API respondió con HTTP ${response.status}.`;
          throw new Error(message);
        }
        if (!result || typeof result !== "object" || !("insumos" in result) || !Array.isArray(result.insumos)) {
          throw new Error("La API no devolvió un inventario válido.");
        }
        const items = result.insumos.map((item: unknown): InventoryItem => {
          if (!item || typeof item !== "object") throw new Error("La API devolvió un insumo inválido.");
          const row = item as Record<string, unknown>;
          if (
            (typeof row.id_insumo !== "number" && typeof row.id_insumo !== "string")
            || typeof row.nombre !== "string"
            || typeof row.unidad_medida !== "string"
            || (typeof row.cantidad_disponible !== "number" && typeof row.cantidad_disponible !== "string")
          ) throw new Error("La API devolvió un insumo incompleto.");
          return {
            id_insumo: Number(row.id_insumo),
            nombre: row.nombre,
            unidad_medida: row.unidad_medida,
            cantidad_disponible: Number(row.cantidad_disponible),
          };
        });
        if (active) setInventoryItems(items);
      } catch (error) {
        if (active) {
          setInventoryItems([]);
          setInventoryError(error instanceof Error ? error.message : "No se pudo cargar el inventario.");
        }
      }
    };
    void loadInventory();
    return () => { active = false; };
  }, [generalData.unidad]);

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
      insumos: usedSupplies,
      firma_digital: hasSignature ? signatureCanvasRef.current?.toDataURL("image/png") ?? "" : "",
      fechaCaptura: new Date().toISOString(),
    };

    try {
      if (!navigator.onLine) {
        throw new Error("Se requiere conexión para guardar el reporte y descontar insumos del inventario.");
      }
      const reportForm = new FormData();
      reportForm.append("reporte", JSON.stringify(payload));
      evidenceImages.forEach(({ file }) => reportForm.append("evidencias[]", file, file.name));
      const response = await fetch(API_CAMPO_URL, {
        method: "POST",
        credentials: "include",
        body: reportForm,
      });
      const res: unknown = await response.json();
      if (!response.ok || !res || typeof res !== "object" || !("status" in res) || res.status !== "success") {
        const message = res && typeof res === "object" && "mensaje" in res && typeof res.mensaje === "string"
          ? res.mensaje
          : `No se pudo registrar el reporte (HTTP ${response.status}).`;
        throw new Error(message);
      }
      setMensajeResultado(`✅ Reporte registrado, stock actualizado y ${evidenceImages.length} fotografía(s) guardada(s).`);
    } catch (error) {
      setMensajeResultado(error instanceof Error ? `❌ ${error.message}` : "❌ No se pudo guardar el reporte.");
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
        <label style={{ display: "flex", alignItems: "center", gap: 6, background: "#162b55", padding: "4px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#fff" }}>
          UNIDAD
          <select value={generalData.unidad} onChange={event => setGeneralData(current => ({ ...current, unidad: event.target.value }))} aria-label="Unidad asignada al reporte" style={{ maxWidth: 130, minHeight: 32, color: "#0a1628", background: "#fff", border: 0, borderRadius: 5, padding: "0 6px", fontWeight: 700 }}>
            {!unitOptions.includes(generalData.unidad) && <option value={generalData.unidad}>{generalData.unidad}</option>}
            {unitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
      </div>

      {/* Tabs Principales */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#fff", padding: 6, borderRadius: 10, border: "1px solid #dce9f5" }}>
        {(["general", "pacientes", "insumos", "cierre"] as Tab[]).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ flex: 1, height: 38, border: "none", borderRadius: 8, background: activeTab === t ? "#162b55" : "transparent", color: activeTab === t ? "#fff" : "#162b55", fontWeight: 700, fontSize: 12, cursor: "pointer", textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
      </div>

      <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
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
                <select value={generalData.unidad} onChange={event => setGeneralData(current => ({ ...current, unidad: event.target.value }))} style={{ width: "100%", height: 42, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 8, fontWeight: 700, background: "#fff" }}>
                  {!unitOptions.includes(generalData.unidad) && <option value={generalData.unidad}>{generalData.unidad}</option>}
                  {unitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </select>
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
                      <th style={{ padding: 6, color: "#0a1628", fontWeight: 700 }}>Hora</th><th style={{ padding: 6, color: "#0a1628", fontWeight: 700 }}>FR</th><th style={{ padding: 6, color: "#0a1628", fontWeight: 700 }}>FC</th><th style={{ padding: 6, color: "#0a1628", fontWeight: 700 }}>TA</th><th style={{ padding: 6, color: "#0a1628", fontWeight: 700 }}>SpO2</th>
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
          {inventoryError && <p role="alert" style={{ color: "#991b1b" }}>{inventoryError}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <select value={selectedInventoryId} onChange={event => setSelectedInventoryId(event.target.value)} disabled={inventoryItems.length === 0} aria-label="Insumo disponible" style={{ flex: "1 1 200px", minHeight: 40, border: "1px solid #b8cfe8", borderRadius: 8, padding: "0 10px" }}>
              <option value="">Selecciona un insumo del botiquín</option>
              {inventoryItems.map(item => <option key={item.id_insumo} value={item.id_insumo}>{item.nombre} · disponible: {item.cantidad_disponible} {item.unidad_medida}</option>)}
            </select>
            <input type="number" min={1} value={selectedQuantity} onChange={event => setSelectedQuantity(Math.max(1, Number(event.target.value)))} aria-label="Cantidad utilizada" style={{ width: 100, minHeight: 40, border: "1px solid #b8cfe8", borderRadius: 8, padding: "0 10px" }} />
            <button type="button" disabled={!selectedInventoryId} onClick={() => {
              const id = Number(selectedInventoryId);
              const item = inventoryItems.find(candidate => candidate.id_insumo === id);
              const alreadyUsed = usedSupplies.find(supply => supply.id_insumo === id)?.cantidad_usada ?? 0;
              if (!item || selectedQuantity + alreadyUsed > item.cantidad_disponible) {
                setInventoryError("La cantidad utilizada supera el stock disponible.");
                return;
              }
              setInventoryError("");
              setUsedSupplies(current => {
                const existing = current.find(supply => supply.id_insumo === id);
                return existing
                  ? current.map(supply => supply.id_insumo === id ? { ...supply, cantidad_usada: supply.cantidad_usada + selectedQuantity } : supply)
                  : [...current, { id_insumo: id, cantidad_usada: selectedQuantity }];
              });
            }} style={{ background: "#162b55", color: "#fff", border: "none", padding: "0 14px", borderRadius: 8, fontWeight: 700, opacity: !selectedInventoryId ? 0.6 : 1 }}>+ Agregar</button>
          </div>
          {inventoryItems.length === 0 && !inventoryError && <p style={{ color: "#64748b" }}>No hay insumos con stock asignados a esta unidad.</p>}
          {usedSupplies.map(supply => {
            const item = inventoryItems.find(candidate => candidate.id_insumo === supply.id_insumo);
            return <div key={supply.id_insumo} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #dce9f5" }}>
              <span>{item?.nombre ?? `Insumo ${supply.id_insumo}`} · {supply.cantidad_usada} {item?.unidad_medida}</span>
              <button type="button" onClick={() => setUsedSupplies(current => current.filter(entry => entry.id_insumo !== supply.id_insumo))} style={{ color: "#b91c1c", border: 0, background: "transparent", cursor: "pointer" }}>Eliminar</button>
            </div>;
          })}
        </div>
      )}

      {/* ✅ CIERRE DE REPORTE */}
      {activeTab === "cierre" && (
        <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #dce9f5", textAlign: "center" }}>
          <h4 style={{ fontSize: 14, fontWeight: 800, color: "#0a1628", marginBottom: 12 }}>Cierre y Firma Digital de Reporte</h4>
          <canvas
            ref={signatureCanvasRef}
            width={600}
            height={120}
            aria-label="Área para firma digital"
            onMouseDown={event => startSignature(event.clientX, event.clientY)}
            onMouseMove={event => moveSignature(event.clientX, event.clientY)}
            onMouseUp={stopSignature}
            onMouseLeave={stopSignature}
            onTouchStart={event => { event.preventDefault(); const touch = event.touches[0]; if (touch) startSignature(touch.clientX, touch.clientY); }}
            onTouchMove={event => { event.preventDefault(); const touch = event.touches[0]; if (touch) moveSignature(touch.clientX, touch.clientY); }}
            onTouchEnd={stopSignature}
            style={{ display: "block", width: "100%", height: 120, border: "2px dashed #b8cfe8", borderRadius: 10, marginBottom: 8, touchAction: "none", cursor: "crosshair" }}
          />
          <button type="button" onClick={clearSignature} style={{ marginBottom: 14, minHeight: 34, padding: "0 10px", border: "1px solid #b8cfe8", borderRadius: 7, background: "#fff", color: "#162b55", fontWeight: 700, cursor: "pointer" }}>Limpiar Firma</button>
          <div style={{ textAlign: "left", marginBottom: 16 }}>
            <label htmlFor="evidence-images" style={{ display: "block", color: "#0a1628", fontWeight: 700, marginBottom: 8 }}>
              Adjuntar Fotografías / Evidencia del Servicio
            </label>
            <input
              ref={evidenceInputRef}
              id="evidence-images"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={event => {
                const files = Array.from(event.target.files ?? []).filter(file => file.type.startsWith("image/"));
                const newImages = files.map(file => ({ file, preview: URL.createObjectURL(file) }));
                evidencePreviewUrls.current.push(...newImages.map(image => image.preview));
                setEvidenceImages(current => [
                  ...current,
                  ...newImages,
                ]);
                event.target.value = "";
              }}
              style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}
            />
            <button type="button" onClick={() => evidenceInputRef.current?.click()} style={{ minHeight: 42, padding: "0 12px", background: "#162b55", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>📷 Tomar foto / Adjuntar</button>
            {evidenceImages.length > 0 && (
              <div aria-label="Vista previa de fotografías adjuntas" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {evidenceImages.map((image, index) => (
                  <img key={`${image.file.name}-${index}`} src={image.preview} alt={`Evidencia ${index + 1}: ${image.file.name}`} style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8, border: "1px solid #cbd5e1" }} />
                ))}
              </div>
            )}
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

          {activeTab !== "cierre" ? (
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
function DespachoScreen({ online: _online, readOnly = false, onCallFinalized }: { online: boolean; readOnly?: boolean; onCallFinalized: (call: ActiveCall) => void }) {
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
    const call = calls.find(activeCall => activeCall.id === callId);
    if (status === "finalizado" && call) {
      const reportCall = { ...call, status: "en_reporte" as const };
      setCalls(current => current.map(activeCall => activeCall.id === callId ? reportCall : activeCall));
      onCallFinalized(reportCall);
      return;
    }
    setCalls(current => current.map(activeCall => activeCall.id === callId ? { ...activeCall, status } : activeCall));
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
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 12, background: c.status === "atencion" ? "#fee2e2" : ["finalizado", "en_reporte"].includes(c.status) ? "#dcfce7" : "#fef3c7", color: c.status === "atencion" ? "#991b1b" : ["finalizado", "en_reporte"].includes(c.status) ? "#166534" : "#78350f" }}>{c.status.toUpperCase()}</span>
              {!readOnly && c.status !== "finalizado" && c.status !== "en_reporte" && (
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
  const fallbackUnits = [
    { id: -1, name: "AMB-01" },
    { id: -2, name: "AMB-02" },
    { id: -3, name: "AMB-03" },
    { id: -4, name: "BOMBA R-1" },
    { id: -5, name: "MOTO-01" },
  ];
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [units, setUnits] = useState<Array<{ id: number; name: string }>>(fallbackUnits);
  const [locationFilter, setLocationFilter] = useState("BODEGA");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<Category>("todos");
  const [newSupply, setNewSupply] = useState({ name: "", category: "prehospitalario" as Exclude<Category, "todos">, location: "BODEGA", stock: "", min: "", unit: "" });
  const [transferTargets, setTransferTargets] = useState<Record<number, string>>({});
  const [transferQuantities, setTransferQuantities] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const loadInventory = async () => {
      setLoading(true);
      setActionError("");
      try {
        const response = await fetch(`${API_INVENTARIO_URL}?ubicacion=${encodeURIComponent(locationFilter)}`, { credentials: "include" });
        const result: unknown = await response.json();
        if (!response.ok || !result || typeof result !== "object" || !("insumos" in result) || !Array.isArray(result.insumos)) {
          const message = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
            ? result.mensaje
            : "No se pudo consultar el inventario.";
          throw new Error(message);
        }
        const categoryMap: Record<string, Exclude<Category, "todos">> = {
          PREHOSPITALARIO: "prehospitalario",
          LIMPIEZA: "limpieza",
          RESCATE: "rescate",
          RESCATE_ACUATICO: "rescate",
          CONTRA_INCENDIOS: "contra-incendios",
          COMBUSTIBLES: "combustibles",
        };
        const rows = result.insumos.map((item: unknown): Supply => {
          if (!item || typeof item !== "object") throw new Error("El inventario devolvió un insumo inválido.");
          const row = item as Record<string, unknown>;
          return {
            id: Number(row.id_insumo),
            name: String(row.nombre ?? ""),
            category: categoryMap[String(row.categoria ?? "").toUpperCase()] ?? "prehospitalario",
            location: locationFilter === "BODEGA" ? "Bodega Central / Base" : locationFilter,
            stock: Number(row.cantidad_disponible ?? 0),
            min: Number(row.stock_minimo ?? 0),
            unit: String(row.unidad_medida ?? ""),
          };
        });
        const unitRows = "unidades" in result && Array.isArray(result.unidades)
          ? result.unidades.flatMap((item: unknown) => {
            if (!item || typeof item !== "object") return [];
            const row = item as Record<string, unknown>;
            return [{ id: Number(row.id_unidades), name: String(row.nombre_unidad ?? "") }].filter(unit => unit.id > 0 && unit.name !== "");
          })
          : [];
        const mergedUnits = [
          ...fallbackUnits,
          ...unitRows.filter(unit => !fallbackUnits.some(fallback => fallback.name === unit.name)),
        ];
        if (active) {
          setSupplies(rows);
          setUnits(mergedUnits);
        }
      } catch (error) {
        if (active) {
          setSupplies([]);
          setActionError(error instanceof Error ? error.message : "No se pudo consultar el inventario.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadInventory();
    return () => { active = false; };
  }, [locationFilter, refreshVersion]);

  const addSupply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (access !== "manage") return;
    setActionError("");
    try {
      const response = await fetch(API_INVENTARIO_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "alta",
          nombre: newSupply.name.trim(),
          categoria: newSupply.category,
          ubicacion: newSupply.location,
          cantidad: Number(newSupply.stock),
          stock_minimo: Number(newSupply.min),
          unidad_medida: newSupply.unit.trim(),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === "object" && "mensaje" in result ? String(result.mensaje) : "No se pudo dar de alta el insumo.");
      setLocationFilter(newSupply.location);
      setNewSupply({ name: "", category: "prehospitalario", location: "BODEGA", stock: "", min: "", unit: "" });
      setRefreshVersion(version => version + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo dar de alta el insumo.");
    }
  };

  const transferSupply = async (supply: Supply) => {
    const target = transferTargets[supply.id] ?? units[0]?.name ?? "";
    const quantity = transferQuantities[supply.id] ?? 1;
    if (!target || quantity < 1) return;
    setActionError("");
    try {
      const response = await fetch(API_INVENTARIO_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "transferir", id_insumo: supply.id, cantidad: quantity, unidad: target }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === "object" && "mensaje" in result ? String(result.mensaje) : "No se pudo transferir el insumo.");
      setRefreshVersion(version => version + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo transferir el insumo.");
    }
  };

  const unitLabel = (name: string) => {
    if (name.startsWith("AMB-")) return `🚑 Ambulancia ${name}`;
    if (name.startsWith("BOMBA")) return `🚒 Unidad ${name}`;
    if (name.startsWith("MOTO")) return `🏍️ Unidad Moto ${name}`;
    return `🚑 ${name}`;
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
              {(["prehospitalario", "limpieza", "rescate", "contra-incendios", "combustibles"] as Exclude<Category, "todos">[]).map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <select aria-label="Ubicación inicial" value={newSupply.location} onChange={event => setNewSupply({ ...newSupply, location: event.target.value })} required>
              <option value="BODEGA">🏢 Bodega Central / Base</option>
              {units.map(unit => <option key={unit.name} value={unit.name}>{unitLabel(unit.name)}</option>)}
            </select>
            <input aria-label="Stock inicial" type="number" min={0} placeholder="Stock inicial" value={newSupply.stock} onChange={event => setNewSupply({ ...newSupply, stock: event.target.value })} required />
            <input aria-label="Stock mínimo" type="number" min={0} placeholder="Stock mínimo" value={newSupply.min} onChange={event => setNewSupply({ ...newSupply, min: event.target.value })} required />
            <input aria-label="Unidad" placeholder="Unidad (pzas, L...)" value={newSupply.unit} onChange={event => setNewSupply({ ...newSupply, unit: event.target.value })} required />
          </div>
          <button type="submit" style={{ width: "100%", minHeight: 42, marginTop: 10, background: "#162b55", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Agregar insumo</button>
        </form>
      )}
      {actionError && <p role="alert" style={{ padding: 10, background: "#fee2e2", color: "#991b1b", borderRadius: 8, fontWeight: 600 }}>{actionError}</p>}
      <label style={{ display: "block", color: "#162b55", fontWeight: 700, marginBottom: 6 }}>Ubicación de inventario</label>
      <select value={locationFilter} onChange={event => setLocationFilter(event.target.value)} aria-label="Filtrar inventario por ubicación" style={{ width: "100%", minHeight: 44, marginBottom: 12, padding: "0 10px", border: "1.5px solid #b8cfe8", borderRadius: 8, background: "#fff", color: "#0a1628", fontWeight: 700 }}>
        <option value="BODEGA">🏢 Bodega Central / Base</option>
        {units.map(unit => <option key={unit.name} value={unit.name}>{unitLabel(unit.name)}</option>)}
      </select>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar insumo o medicamento..." style={{ width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #b8cfe8", borderRadius: 10, marginBottom: 12, color: "#0a1628", background: "#ffffff", fontWeight: 600 }} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 14 }}>
        {(["todos", "prehospitalario", "rescate", "contra-incendios", "limpieza", "combustibles"] as Category[]).map(cat => (
          <button key={cat} onClick={() => setCatFilter(cat)} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${catFilter === cat ? "#162b55" : "#b8cfe8"}`, background: catFilter === cat ? "#162b55" : "#ffffff", color: catFilter === cat ? "#ffffff" : "#0a1628", fontWeight: 700, fontSize: 11, cursor: "pointer", textTransform: "capitalize", whiteSpace: "nowrap" }}>
            {cat}
          </button>
        ))}
      </div>
      {loading && <p role="status" style={{ color: "#475569" }}>Cargando stock de ubicación...</p>}
      {!loading && filtered.length === 0 && <p style={{ padding: 16, color: "#475569", background: "#fff", border: "1px solid #dce9f5", borderRadius: 10 }}>No hay insumos asignados a esta ubicación.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(s => (
          <div key={s.id} style={{ background: "#fff", border: "1px solid #dce9f5", borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0a1628" }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "#475569" }}>📍 {s.location} · Mín: {s.min} {s.unit}</div>
              {s.stock < s.min && <span style={{ fontSize: 10, background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>¡Stock Bajo!</span>}
            </div>
            <span style={{ color: "#0a1628", fontSize: 15, fontWeight: 800, minWidth: 44, textAlign: "right" }}>{s.stock} {s.unit}</span>
            {access === "manage" && locationFilter === "BODEGA" && (
              <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 8, borderTop: "1px solid #eef2f7" }}>
                <select value={transferTargets[s.id] ?? units[0]?.name ?? ""} onChange={event => setTransferTargets(current => ({ ...current, [s.id]: event.target.value }))} aria-label={`Unidad destino para ${s.name}`} disabled={units.length === 0} style={{ flex: "1 1 150px", minHeight: 38, border: "1px solid #b8cfe8", borderRadius: 7, padding: "0 8px" }}>
                  {units.length === 0 ? <option value="">No hay unidades registradas</option> : units.map(unit => <option key={unit.name} value={unit.name}>{unitLabel(unit.name)}</option>)}
                </select>
                <input type="number" min={1} max={s.stock} value={transferQuantities[s.id] ?? 1} onChange={event => setTransferQuantities(current => ({ ...current, [s.id]: Math.max(1, Number(event.target.value)) }))} aria-label={`Cantidad a transferir de ${s.name}`} style={{ width: 90, minHeight: 38, border: "1px solid #b8cfe8", borderRadius: 7, padding: "0 8px" }} />
                <button type="button" onClick={() => void transferSupply(s)} disabled={units.length === 0 || s.stock === 0 || (transferQuantities[s.id] ?? 1) > s.stock} style={{ minHeight: 38, padding: "0 10px", border: 0, borderRadius: 7, background: "#162b55", color: "#fff", fontWeight: 700, cursor: "pointer" }}>🔄 Transferir a Unidad</button>
              </div>
            )}
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
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [registrationNotice, setRegistrationNotice] = useState("");
  const [online, setOnline] = useState(true);
  const [storedAssociationState] = useState(loadStoredAssociations);
  const [associations, setAssociations] = useState<Association[]>(storedAssociationState.associations);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentAssociationId, setCurrentAssociationId] = useState<string | null>(null);
  const [currentApprovalStatus, setCurrentApprovalStatus] = useState("");
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [currentAssignedPermissions, setCurrentAssignedPermissions] = useState<AssociationPermissions | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [callToReport, setCallToReport] = useState<ActiveCall | null>(null);
  const approvedMembership = associations
    .flatMap(association => association.requests.map(request => ({ association, request })))
    .find(({ request }) => request.userEmail.toLowerCase() === currentUserEmail.toLowerCase() && isApprovedRequest(request));
  const associationPermissions = approvedMembership
    ? currentAssignedPermissions
      ?? approvedMembership.request.permissions
      ?? getDefaultAssociationPermissions(approvedMembership.request.role)
    : null;
  const permissions = applyAssociationPermissions(currentRole, associationPermissions);
  const hasActiveAssociation = isAuthenticated && (
    isDirector
    || (currentAssociationId !== null && isApprovedStatus(currentApprovalStatus) && permissions.screens.length > 0)
  );

  const applyAuthenticatedUser = (user: AuthenticatedUser) => {
    const role = roleForAuthenticatedUser(user, associations);
    const associationId = user.id_asociacion === null ? null : String(user.id_asociacion);
    const director = isManagementRole(user);
    const assignedPermissions = permissionsFromGrantNames(user.permisos);
    setCurrentUserEmail(user.correo);
    setCurrentAssociationId(associationId);
    setCurrentApprovalStatus(user.estatus_aprobado);
    setCurrentRole(role);
    setCurrentAssignedPermissions(assignedPermissions);
    setIsAuthenticated(true);
    setIsDirector(director);

    if (associationId) {
      setAssociations(current => {
        const index = current.findIndex(association => association.id === associationId);
        const existing = index >= 0 ? current[index] : {
          ...DEFAULT_ASSOCIATION,
          id: associationId,
          name: user.nombre_asociacion ?? DEFAULT_ASSOCIATION.name,
          code: user.codigo_invitacion ?? DEFAULT_ASSOCIATION.code,
          directorEmail: director ? user.correo : DEFAULT_ASSOCIATION.directorEmail,
        };
        const updated = {
          ...existing,
          name: user.nombre_asociacion ?? existing.name,
          code: user.codigo_invitacion ?? existing.code,
          directorEmail: director ? user.correo : existing.directorEmail,
        };
        return index >= 0
          ? current.map((association, currentIndex) => currentIndex === index ? updated : association)
          : [...current, updated];
      });
    }

    if (director) {
      setScreen("gestion-directores");
      return;
    }
    if (associationId && isApprovedAccount(user)) {
      const association = associations.find(item => item.id === associationId) ?? {
        ...DEFAULT_ASSOCIATION,
        id: associationId,
        name: user.nombre_asociacion ?? DEFAULT_ASSOCIATION.name,
        code: user.codigo_invitacion ?? DEFAULT_ASSOCIATION.code,
      };
      const existingRequest = association.requests.find(request =>
        request.userId === String(user.id_usuario) || request.userEmail.toLowerCase() === user.correo.toLowerCase()
      );
      const request: AssociationRequest = {
        ...(existingRequest ?? {}),
        id: String(user.id_usuario),
        userId: String(user.id_usuario),
        userEmail: user.correo,
        status: "APROBADO",
        role,
        permissions: assignedPermissions ?? existingRequest?.permissions ?? getDefaultAssociationPermissions(role),
      };
      const updatedAssociation = {
        ...association,
        requests: existingRequest
          ? association.requests.map(item => item.userEmail.toLowerCase() === user.correo.toLowerCase() ? request : item)
          : [...association.requests, request],
      };
      setAssociations(current => current.some(item => item.id === associationId)
        ? current.map(item => item.id === associationId ? updatedAssociation : item)
        : [...current, updatedAssociation]);
      setScreen(getFirstAvailableScreen(request.permissions ?? getDefaultAssociationPermissions(role)) ?? "sin-acceso");
      return;
    }
    setScreen("solicitar-asociacion");
  };

  useEffect(() => {
    let isCurrent = true;
    const restoreSession = async () => {
      try {
        const response = await fetch(API_AUTH_URL, { credentials: "include" });
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(`No se pudo restaurar la sesión (HTTP ${response.status}).`);
        }
        if (
          result && typeof result === "object"
          && "authenticated" in result && result.authenticated === true
          && "usuario" in result
        ) {
          applyAuthenticatedUser(result.usuario as AuthenticatedUser);
        }
      } catch (error) {
        console.error("No se pudo comprobar la sesión de usuario.", error);
      } finally {
        if (isCurrent) setIsCheckingSession(false);
      }
    };
    void restoreSession();
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    if (!storedAssociationState.canPersist) return;
    try {
      window.localStorage.setItem(ASSOCIATIONS_STORAGE_KEY, JSON.stringify(associations));
    } catch (error) {
      console.error("No se pudieron guardar las asociaciones.", error);
    }
  }, [associations, storedAssociationState.canPersist]);

  useEffect(() => {
    const syncAssociations = (event: StorageEvent) => {
      if (event.key !== ASSOCIATIONS_STORAGE_KEY && event.key !== null) return;
      const stored = loadStoredAssociations();
      if (stored.canPersist) setAssociations(ensureDefaultAssociation(stored.associations));
    };
    window.addEventListener("storage", syncAssociations);
    return () => window.removeEventListener("storage", syncAssociations);
  }, []);

  const approvedPermissionsKey = associationPermissions
    ? Object.values(associationPermissions).join(":")
    : "";
  useEffect(() => {
    if (!isAuthenticated || isDirector) return;
    if (currentAssociationId === null || !isApprovedStatus(currentApprovalStatus)) {
      if (screen !== "solicitar-asociacion") setScreen("solicitar-asociacion");
      return;
    }
    if (!approvedMembership) return;
    setCurrentRole(approvedMembership.request.role);
    const nextScreen = getFirstAvailableScreen(associationPermissions) ?? "sin-acceso";
    const currentScreenIsOperational = (["campo", "despacho", "inventario", "reportes"] as Screen[]).includes(screen);
    if (
      screen === "solicitar-asociacion"
      || screen === "sin-acceso"
      || (currentScreenIsOperational && !permissions.screens.includes(screen as OperationalScreen))
    ) {
      setScreen(nextScreen);
    }
  }, [
    isAuthenticated,
    isDirector,
    currentAssociationId,
    currentApprovalStatus,
    approvedMembership?.request.id,
    approvedMembership?.request.role,
    approvedMembership?.request.status,
    approvedPermissionsKey,
    screen,
    permissions.screens.join(":"),
  ]);

  const handleLoginSuccess = async (email: string, password: string) => {
    const normalizedEmail = email.trim();
    let response: Response;
    try {
      response = await fetch(API_AUTH_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo: normalizedEmail, contrasena: password }),
      });
    } catch {
      throw new Error("No se pudo conectar con el servicio de inicio de sesión. Verifica que el backend esté disponible e inténtalo de nuevo.");
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      if (!response.ok) {
        throw new Error(`El servicio de inicio de sesión no está disponible (HTTP ${response.status}). Inténtalo de nuevo más tarde.`);
      }
      throw new Error("El servicio de inicio de sesión devolvió una respuesta inválida.");
    }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 404) {
        throw new Error(`El servicio de inicio de sesión no está disponible (HTTP ${response.status}). Inténtalo de nuevo más tarde.`);
      }
      const errorMessage = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
        ? result.mensaje
        : `No se pudo iniciar sesión (HTTP ${response.status}).`;
      throw new Error(errorMessage);
    }
    if (!result || typeof result !== "object" || !("usuario" in result)) {
      throw new Error("El backend no devolvió los datos de la cuenta autenticada.");
    }
    const rawUser = result.usuario;
    if (
      !rawUser || typeof rawUser !== "object"
      || !("id_usuario" in rawUser) || !("correo" in rawUser)
      || !("id_asociacion" in rawUser) || !("id_rol" in rawUser) || !("estatus_aprobado" in rawUser)
      || (typeof rawUser.id_usuario !== "number" && typeof rawUser.id_usuario !== "string")
      || typeof rawUser.correo !== "string"
      || (rawUser.id_asociacion !== null && typeof rawUser.id_asociacion !== "number" && typeof rawUser.id_asociacion !== "string")
      || (typeof rawUser.id_rol !== "number" && typeof rawUser.id_rol !== "string")
      || typeof rawUser.estatus_aprobado !== "string"
    ) {
      throw new Error("El backend devolvió un perfil de usuario inválido.");
    }
    const user: AuthenticatedUser = {
      id_usuario: rawUser.id_usuario,
      correo: rawUser.correo,
      id_asociacion: typeof rawUser.id_asociacion === "number" || typeof rawUser.id_asociacion === "string"
        ? rawUser.id_asociacion
        : null,
      id_rol: rawUser.id_rol,
      estatus_aprobado: rawUser.estatus_aprobado,
      esDirector: "esDirector" in rawUser && rawUser.esDirector === true,
      nombre_rol: "nombre_rol" in rawUser && typeof rawUser.nombre_rol === "string" ? rawUser.nombre_rol : null,
      nombre_asociacion: "nombre_asociacion" in rawUser && typeof rawUser.nombre_asociacion === "string"
        ? rawUser.nombre_asociacion
        : null,
      codigo_invitacion: "codigo_invitacion" in rawUser && typeof rawUser.codigo_invitacion === "string"
        ? rawUser.codigo_invitacion
        : null,
      permisos: "permisos" in rawUser && Array.isArray(rawUser.permisos) && rawUser.permisos.every(item => typeof item === "string")
        ? rawUser.permisos
        : undefined,
    };
    applyAuthenticatedUser(user);
  };

  const handleAssociationRequest = (requestedAssociation: Association, requested: AssociationRequest) => {
    setCurrentAssociationId(requestedAssociation.id);
    setCurrentApprovalStatus("PENDIENTE");
    setCurrentRole("Socorrista");
    setAssociations(current => {
      const existingAssociationIndex = current.findIndex(association =>
        association.code.trim().toUpperCase() === requestedAssociation.code.trim().toUpperCase()
      );
      const association = existingAssociationIndex >= 0
        ? current[existingAssociationIndex]
        : requestedAssociation;
      const existingRequest = association.requests.find(request => request.userEmail.toLowerCase() === requested.userEmail.toLowerCase());
      const updatedAssociation = {
        ...requestedAssociation,
        ...(existingAssociationIndex >= 0 ? association : {}),
        requests: existingRequest
          ? association.requests.map(item => item.userEmail.toLowerCase() === requested.userEmail.toLowerCase() ? requested : item)
          : [...association.requests, requested],
      };
      if (existingAssociationIndex < 0) return [...current, updatedAssociation];
      return current.map((item, index) => index === existingAssociationIndex ? updatedAssociation : item);
    });
  };

  const cancelCurrentAssociationRequest = async () => {
    const response = await fetch(API_SOLICITUDES_URL, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estatus_aprobado: "SIN_SOLICITUD" }),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const errorMessage = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
        ? result.mensaje
        : `La API respondió con HTTP ${response.status}.`;
      throw new Error(errorMessage);
    }
    setCurrentApprovalStatus("SIN_SOLICITUD");
    setCurrentRole("Socorrista");
    setAssociations(current => current.map(association => ({
      ...association,
      requests: association.requests.map(request =>
        request.userEmail.toLowerCase() === currentUserEmail.toLowerCase()
          && request.status === "Pendiente de Aprobación"
          ? { ...request, status: "Rechazada" }
          : request
      ),
    })));
  };

  const updateAssociationRequest = async (associationId: string, requestId: string, status: RequestStatus, role: UserRole, userId?: string, userEmail?: string, assignedPermissions?: AssociationPermissions, roleId?: number) => {
    if (status === "APROBADO" || status === "Rechazada") {
      if (!userId) throw new Error("No se encontró el ID de usuario requerido para aprobar en MySQL.");
      const response = await fetch(API_SOLICITUDES_URL, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_usuario: Number(userId),
          ...(roleId ? { id_rol: roleId } : {}),
          estatus_aprobado: status === "APROBADO" ? "APROBADO" : "SIN_SOLICITUD",
          permisos: grantNamesFromPermissions(assignedPermissions ?? getDefaultAssociationPermissions(role)),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
          ? result.mensaje
          : `La API respondió con HTTP ${response.status}.`;
        throw new Error(errorMessage);
      }
    }

    const updatedRequest = associations
      .find(association => association.id === associationId)
      ?.requests.find(request => request.id === requestId || (userId && request.userId === userId));
    const nextRequest: AssociationRequest = {
      ...(updatedRequest ?? { id: requestId, userId, userEmail: userEmail ?? "", role }),
      id: requestId,
      userId: userId ?? updatedRequest?.userId,
      userEmail: updatedRequest?.userEmail ?? userEmail ?? "",
      status,
      role,
      permissions: status === "Aceptada" || status === "APROBADO"
        ? updatedRequest?.permissions ?? getDefaultAssociationPermissions(role)
        : updatedRequest?.permissions,
    };
    setAssociations(current => {
      const index = current.findIndex(association => association.id === associationId);
      const association = index >= 0 ? current[index] : { ...DEFAULT_ASSOCIATION, id: associationId };
      const requestIndex = association.requests.findIndex(request =>
        request.id === requestId || (userId && request.userId === userId)
      );
      const requests = requestIndex >= 0
        ? association.requests.map((request, currentIndex) => currentIndex === requestIndex
          ? { ...request, ...nextRequest, userEmail: request.userEmail }
          : request)
        : [...association.requests, nextRequest];
      const updatedAssociation = { ...association, requests };
      if (index < 0) return [...current, updatedAssociation];
      return current.map((item, currentIndex) => currentIndex === index ? updatedAssociation : item);
    });
    if ((updatedRequest?.userEmail ?? userEmail)?.toLowerCase() === currentUserEmail.toLowerCase()) {
      if (status === "Aceptada" || status === "APROBADO") {
        setCurrentRole(role);
        const isManager = role === "Director" || role === "Administrador";
        setIsDirector(isManager);
        const assigned = assignedPermissions ?? updatedRequest?.permissions ?? getDefaultAssociationPermissions(role);
        setCurrentAssignedPermissions(assigned);
        setCurrentApprovalStatus("APROBADO");
        setScreen(isManager ? "gestion-directores" : getFirstAvailableScreen(assigned) ?? "sin-acceso");
      } else if (status === "Rechazada") {
        setCurrentRole(null);
        setCurrentAssignedPermissions(null);
        setIsDirector(false);
        setCurrentApprovalStatus("SIN_SOLICITUD");
        setScreen("solicitar-asociacion");
      }
    }
  };

  const saveAssociationMember = async (associationId: string, request: AssociationRequest, role: UserRole, roleId: number, assignedPermissions: AssociationPermissions) => {
    if (!request.userId) throw new Error("No se encontró el ID del usuario que se desea actualizar.");
    const permissionPayload = {
      ver_campo: assignedPermissions.puedeVerCampo,
      modificar_campo: assignedPermissions.puedeModificarCampo,
      ver_despacho: assignedPermissions.puedeVerDespacho,
      modificar_despacho: assignedPermissions.puedeModificarDespacho,
      ver_almacen: assignedPermissions.puedeVerAlmacen,
      modificar_almacen: assignedPermissions.puedeModificarAlmacen,
      acceso_reportes: assignedPermissions.puedeVerReportes,
    };
    const response = await fetch(API_SOLICITUDES_URL, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "actualizar_miembro", id_usuario: Number(request.userId), id_rol: roleId, ...permissionPayload }),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const errorMessage = result && typeof result === "object" && "mensaje" in result && typeof result.mensaje === "string"
        ? result.mensaje
        : `La API respondió con HTTP ${response.status}.`;
      throw new Error(errorMessage);
    }
    const updatedRequest: AssociationRequest = { ...request, role, roleId, permissions: assignedPermissions };
    setAssociations(current => current.map(association => association.id !== associationId
      ? association
      : {
        ...association,
        requests: association.requests.map(member =>
          member.id === request.id || member.userId === request.userId
            ? { ...member, ...updatedRequest }
            : member
        ),
      }
    ));
  };

  const handleLogout = async () => {
    const logoutErrors: string[] = [];
    try {
      const response = await fetch(API_AUTH_URL, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        logoutErrors.push(`No se pudo cerrar la sesión del servidor (HTTP ${response.status}).`);
      }
    } catch (error) {
      logoutErrors.push(error instanceof Error ? error.message : "No se pudo cerrar la sesión del servidor.");
    }
    try {
      window.localStorage.clear();
    } catch (error) {
      logoutErrors.push(error instanceof Error
        ? `No se pudo limpiar el almacenamiento local: ${error.message}`
        : "No se pudo limpiar el almacenamiento local.");
    }
    setIsAuthenticated(false);
    setCurrentUserEmail("");
    setCurrentAssociationId(null);
    setCurrentApprovalStatus("");
    setCurrentRole(null);
    setCurrentAssignedPermissions(null);
    setIsDirector(false);
    setSessionError(logoutErrors.join(" "));
    setScreen("login");
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
      {isCheckingSession ? (
        <main role="status" style={{ maxWidth: 480, margin: "48px auto", padding: 24, textAlign: "center", color: "#162b55" }}>
          Verificando sesión...
        </main>
      ) : (
      <>
      {sessionError && <div role="alert" style={{ maxWidth: 680, margin: "12px auto", padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8 }}>{sessionError}</div>}
      <GlobalNavBar screen={screen} setScreen={setScreen} online={online} isAuthenticated={isAuthenticated} permissions={permissions} isDirector={isDirector} hasActiveAssociation={hasActiveAssociation} onLogout={handleLogout} />
      <main>
        {!isAuthenticated && screen === "inicio" && (
          <InicioScreen goToLogin={() => setScreen("login")} goToRegister={() => setScreen("registroOpciones")} />
        )}
        {!isAuthenticated && screen === "login" && (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            goBack={() => setScreen("inicio")}
            successNotice={registrationNotice}
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
            onRegistered={message => {
              setRegistrationNotice(message);
              setScreen("login");
            }}
            goBack={() => setScreen("registroOpciones")}
          />
        )}
        {!isAuthenticated && screen === "registro" && (
          <RegistroAsociacionScreen
            onAssociationCreated={association => setAssociations(current => [...current, association])}
            goNext={() => {
              setRegistrationNotice("Institución y cuenta de Director creadas. Inicia sesión con el correo y la contraseña registrados.");
              setScreen("login");
            }}
            goBack={() => setScreen("registroOpciones")}
          />
        )}
        {isAuthenticated && screen === "solicitar-asociacion" && (
          <SeleccionarAsociacionScreen
            associations={associations}
            userEmail={currentUserEmail}
            approvalStatus={currentApprovalStatus}
            associationId={currentAssociationId}
            onRequest={handleAssociationRequest}
            onApprovalDetected={applyAuthenticatedUser}
            onCancelRequest={cancelCurrentAssociationRequest}
            onLogout={handleLogout}
          />
        )}
        {isAuthenticated && permissions.canManageRequests && screen === "gestionSolicitudes" && (
          <GestionSolicitudesScreen associations={associations} associationId={currentAssociationId ?? "1"} currentUserEmail={currentUserEmail} onUpdateRequest={updateAssociationRequest} onSaveMember={saveAssociationMember} onLogout={handleLogout} />
        )}
        {isAuthenticated && isDirector && screen === "gestion-directores" && (
          <GestionSolicitudesScreen associations={associations} associationId={currentAssociationId ?? "1"} currentUserEmail={currentUserEmail} onUpdateRequest={updateAssociationRequest} onSaveMember={saveAssociationMember} onLogout={handleLogout} />
        )}
        {(isDirector || (hasActiveAssociation && permissions.screens.includes("campo"))) && screen === "campo" && <CampoScreen initialCall={callToReport} onPrefillConsumed={() => setCallToReport(null)} />}
        {(isDirector || (hasActiveAssociation && permissions.screens.includes("despacho"))) && screen === "despacho" && <DespachoScreen online={online} readOnly={!isDirector && !permissions.canEditDespacho} onCallFinalized={call => { setCallToReport(call); setScreen("campo"); }} />}
        {(isDirector || (hasActiveAssociation && permissions.inventory !== "none")) && screen === "inventario" && <InventarioScreen access={isDirector || permissions.inventory === "none" ? "manage" : permissions.inventory} />}
        {(isDirector || (hasActiveAssociation && permissions.canViewReports)) && screen === "reportes" && <ReportesScreen />}
        {isAuthenticated && screen === "sin-acceso" && (
          <div role="status" style={{ maxWidth: 600, margin: "48px auto", padding: 20, background: "#fff", border: "1px solid #dce9f5", borderRadius: 12, color: "#475569", textAlign: "center" }}>
            Tu cuenta pertenece a una asociación, pero aún no tiene módulos habilitados. Contacta al Director para solicitar acceso.
          </div>
        )}
      </main>
      </>
      )}
    </div>
  );
}