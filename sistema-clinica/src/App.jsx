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

    supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
    });
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
      {
        nombre: nuevaEmpresa,
        user_id: user.id,
      },
    ]);

    setNuevaEmpresa("");
    obtenerEmpresas();
  };

  const seleccionarEmpresa = (empresa) => {
    localStorage.setItem("empresa", JSON.stringify(empresa));
    setEmpresaActiva(empresa);
  };

  useEffect(() => {
    const irVenta = () => setPantalla("venta");
    window.addEventListener("irAVenta", irVenta);
    return () => window.removeEventListener("irAVenta", irVenta);
  }, []);

  const cambiarPantalla = (nuevaPantalla) => {
    setPantalla(nuevaPantalla);
    if (esMovil) setMenuAbierto(false);
  };

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  if (!user) {
    return (
      <div style={styles.bg}>
        <div style={styles.cardGlass}>
          <h2 style={styles.title}>🦷 Sistema Dental</h2>

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
          <button style={styles.btnAlt} onClick={register}>
            Crear cuenta
          </button>
        </div>
      </div>
    );
  }

  if (empresas.length === 0) {
    return (
      <div style={styles.bg}>
        <div style={styles.cardGlass}>
          <h2>Crear Empresa</h2>

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
      <div style={styles.bg}>
        <div style={styles.cardGlass}>
          <h2>Seleccionar empresa</h2>

          {empresas.map((emp) => (
            <button
              key={emp.id}
              style={styles.btnMenuLight}
              onClick={() => seleccionarEmpresa(emp)}
            >
              {emp.nombre}
            </button>
          ))}

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
    return <h2>Bienvenido 👋</h2>;
  };

  return (
    <div
      style={{
        ...styles.app,
        flexDirection: esMovil ? "column" : "row",
      }}
    >
      {esMovil && (
        <div style={styles.mobileTopbar}>
          <button
            style={styles.mobileMenuBtn}
            onClick={() => setMenuAbierto(!menuAbierto)}
          >
            ☰ Menú
          </button>
          <strong style={{ color: "white" }}>{empresaActiva.nombre}</strong>
        </div>
      )}

      {(!esMovil || menuAbierto) && (
        <div
          style={{
            ...styles.sidebar,
            width: esMovil ? "100%" : "220px",
            minWidth: esMovil ? "100%" : "220px",
          }}
        >
          {!esMovil && <h3 style={{ marginBottom: 20 }}>{empresaActiva.nombre}</h3>}

          <button style={styles.btnMenu} onClick={() => cambiarPantalla("venta")}>
            🛒 Venta
          </button>
          <button style={styles.btnMenu} onClick={() => cambiarPantalla("deudas")}>
            📋 Deudas
          </button>
          <button style={styles.btnMenu} onClick={() => cambiarPantalla("citas")}>
            📅 Citas
          </button>
          <button style={styles.btnMenu} onClick={() => cambiarPantalla("items")}>
            📦 Productos
          </button>
          <button style={styles.btnMenu} onClick={() => cambiarPantalla("reporte")}>
            📊 Reporte
          </button>
          <button style={styles.btnMenu} onClick={() => cambiarPantalla("clientes")}>
            👤 Pacientes
          </button>

          <button style={styles.btnMenu} onClick={() => cambiarPantalla("Caja Diaria")}>
            💲Caja Diaria
          </button>

          <button style={styles.btnMenu} onClick={() => cambiarPantalla("Metodo de Pago")}>
            💱 Metodos de Cobro
          </button>

          <button style={styles.btnMenu} onClick={() => cambiarPantalla("Caja Chica")}>
            💵 Caja Chica
          </button>

          <div style={{ flex: 1 }} />

          <button
            style={styles.btnDanger}
            onClick={() => {
              localStorage.removeItem("empresa");
              setEmpresaActiva(null);
              if (esMovil) setMenuAbierto(false);
            }}
          >
            Cambiar empresa
          </button>

          <button style={styles.btnDanger} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      )}

      <div style={styles.content}>
        <div style={styles.card}>{renderContenido()}</div>
      </div>
    </div>
  );
}

const styles = {
  app: {
    display: "flex",
    minHeight: "100vh",
    width: "100%",
    background: "#f1f5f9",
    overflowX: "hidden",
  },

  sidebar: {
    background: "#111827",
    color: "white",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
  },

  content: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    padding: "20px",
    boxSizing: "border-box",
    overflowX: "hidden",
  },

  card: {
    background: "white",
    padding: "20px",
    borderRadius: "12px",
    minHeight: "calc(100vh - 40px)",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
    overflowX: "auto",
  },

  mobileTopbar: {
    width: "100%",
    background: "#111827",
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxSizing: "border-box",
  },

  mobileMenuBtn: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "none",
    background: "#1f2937",
    color: "white",
    cursor: "pointer",
  },

  bg: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg, #22c55e, #06b6d4)",
    padding: "20px",
    boxSizing: "border-box",
  },

  cardGlass: {
    width: "100%",
    maxWidth: "380px",
    padding: "30px",
    borderRadius: "16px",
    background: "rgba(255,255,255,0.15)",
    backdropFilter: "blur(12px)",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
  },

  title: {
    textAlign: "center",
    color: "white",
    marginBottom: "15px",
  },

  input: {
    padding: "12px",
    marginBottom: "10px",
    borderRadius: "8px",
    border: "none",
    width: "100%",
    boxSizing: "border-box",
  },

  btnPrimary: {
    padding: "12px",
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    marginTop: "10px",
  },

  btnAlt: {
    padding: "12px",
    background: "#0ea5e9",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    marginTop: "10px",
  },

  btnDanger: {
    padding: "10px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    marginTop: "10px",
    width: "100%",
    boxSizing: "border-box",
  },

  btnMenu: {
    padding: "12px",
    marginBottom: "8px",
    background: "rgba(255,255,255,0.1)",
    border: "none",
    borderRadius: "8px",
    color: "white",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    boxSizing: "border-box",
  },

  btnMenuLight: {
    padding: "12px",
    marginBottom: "8px",
    background: "rgba(255,255,255,0.2)",
    border: "none",
    borderRadius: "8px",
    color: "white",
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
  },

  loading: {
    padding: 20,
  },
};

export default App;