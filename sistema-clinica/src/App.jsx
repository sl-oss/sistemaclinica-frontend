import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Items from "./Items";
import Venta from "./Venta";
import Deudas from "./Deudas";
import Citas from "./Citas";
import Reporte from "./Reporte";
import Clientes from "./Clientes";
import CajaDiaria from "./CajaDiaria";
import MetodoPago from "./MetodoPago";
import CajaChica from "./CajaChica";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [empresas, setEmpresas] = useState([]);
  const [empresaActiva, setEmpresaActiva] = useState(null);

  const [nuevaEmpresa, setNuevaEmpresa] = useState("");
  const [pantalla, setPantalla] = useState("menu");
  const [esMovil, setEsMovil] = useState(window.innerWidth < 900);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const cargarSesion = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };

    cargarSesion();

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
    });

    return () => listener?.subscription?.unsubscribe?.();
  }, []);

  useEffect(() => {
    const empresaGuardada = localStorage.getItem("empresa");
    if (empresaGuardada) {
      setEmpresaActiva(JSON.parse(empresaGuardada));
    }
  }, []);

  useEffect(() => {
    const onResize = () => setEsMovil(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (user) obtenerEmpresas();
  }, [user]);

  const obtenerEmpresas = async () => {
    const { data } = await supabase
      .from("empresas")
      .select("*")
      .eq("user_id", user.id);

    setEmpresas(data || []);
  };

  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) alert(error.message);
  };

  const register = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) alert(error.message);
    else alert("Cuenta creada");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("empresa");
    setEmpresaActiva(null);
  };

  const crearEmpresa = async () => {
    if (!nuevaEmpresa) return alert("Escribe un nombre");

    await supabase.from("empresas").insert([
      { nombre: nuevaEmpresa, user_id: user.id },
    ]);

    setNuevaEmpresa("");
    obtenerEmpresas();
  };

  const seleccionarEmpresa = (empresa) => {
    localStorage.setItem("empresa", JSON.stringify(empresa));
    setEmpresaActiva(empresa);
  };

  const cambiarPantalla = (p) => {
    setPantalla(p);
    if (esMovil) setMenuAbierto(false);
  };

  const renderContenido = () => {
    if (pantalla === "venta") return <Venta />;
    if (pantalla === "items") return <Items />;
    if (pantalla === "deudas") return <Deudas />;
    if (pantalla === "citas") return <Citas />;
    if (pantalla === "reporte") return <Reporte />;
    if (pantalla === "clientes") return <Clientes />;
    if (pantalla === "Caja Diaria") return <CajaDiaria />;
    if (pantalla === "Metodo de Pago") return <MetodoPago />;
    if (pantalla === "Caja Chica") return <CajaChica />;

    return (
      <div className="invoice-page" style={{ padding: 0, minHeight: "auto" }}>
        <div className="invoice-sheet" style={{ maxWidth: "100%" }}>
          <div className="invoice-content">
            <div className="invoice-header">
              <div className="invoice-brand">
                <h1>{empresaActiva.nombre}</h1>
                <p>Sistema dental y administrativo</p>
              </div>

              <div className="invoice-company">
                <div><strong>Panel principal</strong></div>
                <div>Bienvenido al sistema</div>
                <div>Seleccioná un módulo del menú</div>
              </div>
            </div>

            <div className="invoice-client-row">
              <div className="invoice-client">
                <div><strong>Empresa activa:</strong> {empresaActiva.nombre}</div>
                <div><strong>Módulos:</strong> ventas, pacientes, caja, citas, reportes</div>
                <div><strong>Estado:</strong> listo para trabajar</div>
              </div>

              <div className="invoice-number">Inicio</div>
            </div>

            <div className="invoice-info-box">
              <div className="invoice-info-item">
                <strong>Ventas</strong>
                Registro de productos, cobros y facturación.
              </div>
              <div className="invoice-info-item">
                <strong>Pacientes</strong>
                Gestión de clientes, citas y deudas.
              </div>
              <div className="invoice-info-item">
                <strong>Caja</strong>
                Caja diaria, caja chica y métodos de pago.
              </div>
              <div className="invoice-info-item">
                <strong>Reportes</strong>
                Consultas y resúmenes administrativos.
              </div>
            </div>

            <div className="invoice-footer">
              <div>{empresaActiva.nombre}</div>
              <small>Sistema dental</small>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getMenuStyle = (key) => ({
    ...styles.btnMenu,
    ...(pantalla === key ? styles.btnMenuActive : {}),
  });

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingCard}>Cargando sistema...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.authBg}>
        <div style={styles.authDecorTop}></div>
        <div style={styles.authDecorBottom}></div>

        <div style={styles.authCard}>
          <div style={styles.authBrand}>
            <h2 style={styles.authTitle}>🦷 Sistema Dental</h2>
            <p style={styles.authSubtitle}>Control clínico, ventas y caja</p>
          </div>

          <div style={styles.authForm}>
            <input
              style={styles.input}
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              style={styles.input}
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button style={styles.btnPrimary} onClick={login}>
              Iniciar sesión
            </button>

            <button style={styles.btnSecondary} onClick={register}>
              Crear cuenta
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (empresas.length === 0) {
    return (
      <div style={styles.authBg}>
        <div style={styles.authDecorTop}></div>
        <div style={styles.authDecorBottom}></div>

        <div style={styles.authCard}>
          <div style={styles.authBrand}>
            <h2 style={styles.authTitle}>Crear Empresa</h2>
            <p style={styles.authSubtitle}>Primero configurá tu clínica o negocio</p>
          </div>

          <input
            style={styles.input}
            placeholder="Nombre"
            value={nuevaEmpresa}
            onChange={(e) => setNuevaEmpresa(e.target.value)}
          />

          <button style={styles.btnPrimary} onClick={crearEmpresa}>
            Crear
          </button>

          <button style={styles.btnDanger} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!empresaActiva) {
    return (
      <div style={styles.authBg}>
        <div style={styles.authDecorTop}></div>
        <div style={styles.authDecorBottom}></div>

        <div style={styles.authCard}>
          <div style={styles.authBrand}>
            <h2 style={styles.authTitle}>Seleccionar empresa</h2>
            <p style={styles.authSubtitle}>Elegí con cuál empresa querés trabajar</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {empresas.map((e) => (
              <button
                key={e.id}
                style={styles.btnEmpresa}
                onClick={() => seleccionarEmpresa(e)}
              >
                {e.nombre}
              </button>
            ))}
          </div>

          <div style={styles.divider}></div>

          <input
            style={styles.input}
            placeholder="Nueva empresa"
            value={nuevaEmpresa}
            onChange={(e) => setNuevaEmpresa(e.target.value)}
          />

          <button style={styles.btnPrimary} onClick={crearEmpresa}>
            Crear empresa
          </button>

          <button style={styles.btnDanger} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <header style={styles.topPanel}>
        <div style={styles.topPanelLeft}>
          <div style={styles.logoBox}>🦷</div>

          <div style={styles.empresaBox}>
            <h3 style={styles.empresaNombre}>{empresaActiva.nombre}</h3>
            <p style={styles.empresaSub}>Sistema Dental</p>
          </div>
        </div>

        <div style={styles.topPanelRight}>
          <button
            style={styles.btnMini}
            onClick={() => {
              localStorage.removeItem("empresa");
              setEmpresaActiva(null);
            }}
          >
            Cambiar
          </button>

          <button style={styles.btnMiniDanger} onClick={logout}>
            Salir
          </button>
        </div>

        <div style={styles.menuRow}>
          <button style={getMenuStyle("venta")} onClick={() => cambiarPantalla("venta")}>
            🛒 Venta
          </button>

          <button style={getMenuStyle("deudas")} onClick={() => cambiarPantalla("deudas")}>
            📋 Deudas
          </button>

          <button style={getMenuStyle("citas")} onClick={() => cambiarPantalla("citas")}>
            📅 Citas
          </button>

          <button style={getMenuStyle("items")} onClick={() => cambiarPantalla("items")}>
            📦 Productos
          </button>

          <button style={getMenuStyle("reporte")} onClick={() => cambiarPantalla("reporte")}>
            📊 Reporte
          </button>

          <button style={getMenuStyle("clientes")} onClick={() => cambiarPantalla("clientes")}>
            👤 Pacientes
          </button>

          <button
            style={getMenuStyle("Caja Diaria")}
            onClick={() => cambiarPantalla("Caja Diaria")}
          >
            💲 Caja Diaria
          </button>

          <button
            style={getMenuStyle("Metodo de Pago")}
            onClick={() => cambiarPantalla("Metodo de Pago")}
          >
            💱 Métodos de Cobro
          </button>

          <button
            style={getMenuStyle("Caja Chica")}
            onClick={() => cambiarPantalla("Caja Chica")}
          >
            💵 Caja Chica
          </button>
        </div>
      </header>

      <main style={styles.content}>
        <div style={styles.contentCard}>{renderContenido()}</div>
      </main>
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    width: "100%",
    background: "#f4f4f6",
  },

  topPanel: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: "linear-gradient(180deg, #6b5a7a 0%, #574866 100%)",
    color: "#fff",
    boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
    padding: "14px 18px 12px",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
  },

  topPanelLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    flex: "1 1 420px",
  },

  logoBox: {
    width: 52,
    height: 52,
    minWidth: 52,
    borderRadius: 16,
    background: "rgba(255,255,255,0.14)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.15)",
  },

  empresaBox: {
    minWidth: 0,
  },

  empresaNombre: {
    margin: 0,
    fontSize: 22,
    lineHeight: 1.1,
    color: "#fff",
    wordBreak: "break-word",
  },

  empresaSub: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "rgba(255,255,255,0.80)",
  },

  topPanelRight: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flex: "0 0 auto",
  },

  menuRow: {
    width: "100%",
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    paddingTop: 10,
    borderTop: "1px solid rgba(255,255,255,0.14)",
  },

  btnMenu: {
    padding: "10px 14px",
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
    transition: "all 0.2s ease",
    whiteSpace: "nowrap",
  },

  btnMenuActive: {
    background: "rgba(255,255,255,0.22)",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
  },

  btnMini: {
    fontSize: 12,
    padding: "8px 14px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.20)",
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },

  btnMiniDanger: {
    fontSize: 12,
    padding: "8px 14px",
    borderRadius: 9,
    border: "none",
    background: "#ef4444",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  },

  content: {
    padding: "18px",
    boxSizing: "border-box",
    background: "#f4f4f6",
  },

  contentCard: {
    background: "transparent",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    overflowX: "hidden",
  },

  authBg: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#f4f4f6",
    padding: "20px",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
  },

  authDecorTop: {
    position: "absolute",
    top: "-140px",
    right: "-120px",
    width: "420px",
    height: "260px",
    background: "#e7e5ea",
    borderRadius: "50%",
  },

  authDecorBottom: {
    position: "absolute",
    bottom: "-100px",
    left: "-70px",
    width: "260px",
    height: "180px",
    background: "#e7e5ea",
    borderRadius: "50%",
  },

  authCard: {
    width: "100%",
    maxWidth: "420px",
    padding: "30px",
    borderRadius: "24px",
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    border: "1px solid #d7dbe2",
    position: "relative",
    zIndex: 1,
  },

  authBrand: {
    textAlign: "center",
    marginBottom: 18,
  },

  authTitle: {
    textAlign: "center",
    color: "#574866",
    marginBottom: "8px",
    fontSize: 28,
  },

  authSubtitle: {
    margin: 0,
    color: "#64748b",
    fontSize: 14,
  },

  authForm: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  input: {
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #d7dbe2",
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    fontSize: 14,
    outline: "none",
  },

  btnPrimary: {
    padding: "12px",
    background: "#6b5a7a",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    marginTop: "6px",
    fontWeight: 700,
  },

  btnSecondary: {
    padding: "12px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    cursor: "pointer",
    marginTop: "2px",
    fontWeight: 700,
  },

  btnDanger: {
    padding: "12px",
    background: "#fff",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    cursor: "pointer",
    marginTop: "10px",
    width: "100%",
    boxSizing: "border-box",
    fontWeight: 700,
  },

  btnEmpresa: {
    padding: "12px 14px",
    background: "#f8f8fa",
    color: "#334155",
    border: "1px solid #d7dbe2",
    borderRadius: "12px",
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
    fontWeight: 700,
    textAlign: "left",
  },

  divider: {
    height: 1,
    background: "#e5e7eb",
    margin: "16px 0",
  },

  loadingScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f4f4f6",
    padding: 20,
  },

  loadingCard: {
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: 20,
    padding: "20px 28px",
    boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
    color: "#574866",
    fontWeight: 700,
  },
};

export default App;