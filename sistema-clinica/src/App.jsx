import { useEffect, useMemo, useState } from "react";
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
import Dashboard from "./Dashboard";
import UsuariosAccesos from "./UsuariosAccesos";
import EmpleadosComision from "./EmpleadosComision";
import ClasificacionesPacientes from "./ClasificacionesPacientes";
import ConfirmarCitaPublica from "./ConfirmarCitaPublica";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const [membresias, setMembresias] = useState([]);
  const [empresaActiva, setEmpresaActiva] = useState(() => {
    const guardada = localStorage.getItem("empresa");
    return guardada ? JSON.parse(guardada) : null;
  });

  const [rolActivo, setRolActivo] = useState(
    localStorage.getItem("rol") || ""
  );

  const [permisosActivos, setPermisosActivos] = useState(() => {
    const guardados = localStorage.getItem("permisos");
    return guardados ? JSON.parse(guardados) : {};
  });

  const [empresaUsuarioId, setEmpresaUsuarioId] = useState(
    localStorage.getItem("empresa_usuario_id") || ""
  );

  const [nuevaEmpresa, setNuevaEmpresa] = useState("");
  const [pantalla, setPantalla] = useState("dashboard");
  const [esMovil, setEsMovil] = useState(window.innerWidth < 900);

  const tokenConfirmacion = window.location.pathname.startsWith("/confirmar-cita/")
    ? window.location.pathname.split("/confirmar-cita/")[1]
    : null;


  useEffect(() => {
    const cargarSesion = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user || null);
      setLoading(false);
    };

    cargarSesion();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onResize = () => setEsMovil(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const prepararAccesos = async () => {
      if (user?.id) {
        await aceptarInvitacionesPendientes(user);
        await obtenerEmpresasDelUsuario(user.id);
      } else {
        setMembresias([]);
        setEmpresaActiva(null);
        setRolActivo("");
        setPermisosActivos({});
        setEmpresaUsuarioId("");
      }
    };

    prepararAccesos();
  }, [user?.id, user?.email]);

  useEffect(() => {
    const irVenta = () => setPantalla("venta");
    const irReporte = () => setPantalla("reporte");

    window.addEventListener("irAVenta", irVenta);
    window.addEventListener("irAReporte", irReporte);

    return () => {
      window.removeEventListener("irAVenta", irVenta);
      window.removeEventListener("irAReporte", irReporte);
    };
  }, []);

  const aceptarInvitacionesPendientes = async (usuarioActual) => {
    if (!usuarioActual?.id || !usuarioActual?.email) return false;

    const emailNormalizado = usuarioActual.email.trim().toLowerCase();

    const { data: invitaciones, error: errorInvitaciones } = await supabase
      .from("empresa_invitaciones")
      .select("*")
      .eq("email", emailNormalizado)
      .eq("estado", "pendiente");

    if (errorInvitaciones) {
      console.error("Error buscando invitaciones pendientes:", errorInvitaciones);
      return false;
    }

    if (!invitaciones || invitaciones.length === 0) return false;

    let huboCambios = false;

    for (const invitacion of invitaciones) {
      const { data: accesoExistente, error: errorBuscarAcceso } = await supabase
        .from("empresa_usuarios")
        .select("id")
        .eq("empresa_id", invitacion.empresa_id)
        .eq("user_id", usuarioActual.id)
        .maybeSingle();

      if (errorBuscarAcceso) {
        console.error("Error verificando acceso existente:", errorBuscarAcceso);
        continue;
      }

      if (!accesoExistente) {
        const { error: errorInsert } = await supabase
          .from("empresa_usuarios")
          .insert([
            {
              empresa_id: invitacion.empresa_id,
              user_id: usuarioActual.id,
              codigo_usuario: invitacion.codigo_usuario || null,
              nombre_mostrar:
                invitacion.nombre_mostrar ||
                usuarioActual.email ||
                "Usuario",
              rol: invitacion.rol || "colaborador",
              permisos: invitacion.permisos || {},
              activo: true,
            },
          ]);

        if (errorInsert) {
          console.error("Error aceptando invitación:", errorInsert);
          continue;
        }

        huboCambios = true;
      }

      const { error: errorUpdate } = await supabase
        .from("empresa_invitaciones")
        .update({
          estado: "aceptada",
          accepted_by: usuarioActual.id,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invitacion.id);

      if (errorUpdate) {
        console.error("Error actualizando invitación:", errorUpdate);
      }
    }

    return huboCambios;
  };

  const obtenerEmpresasDelUsuario = async (userId) => {
    const { data, error } = await supabase
      .from("empresa_usuarios")
      .select(`
        id,
        empresa_id,
        rol,
        permisos,
        activo,
        nombre_mostrar,
        codigo_usuario,
        empresas (
          id,
          nombre,
          owner_user_id
        )
      `)
      .eq("user_id", userId)
      .eq("activo", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al cargar empresas del usuario");
      return;
    }

    const membresiasValidas = (data || [])
      .filter((m) => m.empresas)
      .map((m) => ({
        ...m,
        empresa: m.empresas,
      }));

    setMembresias(membresiasValidas);

    if (membresiasValidas.length === 0) {
      limpiarEmpresaLocal();
      return;
    }

    const empresaGuardada = localStorage.getItem("empresa");
    const empresaGuardadaObj = empresaGuardada ? JSON.parse(empresaGuardada) : null;

    if (empresaGuardadaObj?.id) {
      const match = membresiasValidas.find(
        (m) => String(m.empresa.id) === String(empresaGuardadaObj.id)
      );

      if (match) {
        seleccionarEmpresaDesdeMembresia(match);
        return;
      }
    }

    if (membresiasValidas.length === 1) {
      seleccionarEmpresaDesdeMembresia(membresiasValidas[0]);
    } else {
      limpiarEmpresaLocal();
    }
  };

  const limpiarEmpresaLocal = () => {
    localStorage.removeItem("empresa");
    localStorage.removeItem("rol");
    localStorage.removeItem("permisos");
    localStorage.removeItem("empresa_usuario_id");

    setEmpresaActiva(null);
    setRolActivo("");
    setPermisosActivos({});
    setEmpresaUsuarioId("");
  };

  const seleccionarEmpresaDesdeMembresia = (membresia) => {
    const empresa = membresia.empresa;
    const rol = membresia.rol || "";
    const permisos = membresia.permisos || {};

    localStorage.setItem("empresa", JSON.stringify(empresa));
    localStorage.setItem("rol", rol);
    localStorage.setItem("permisos", JSON.stringify(permisos));
    localStorage.setItem("empresa_usuario_id", String(membresia.id));

    setEmpresaActiva(empresa);
    setRolActivo(rol);
    setPermisosActivos(permisos);
    setEmpresaUsuarioId(String(membresia.id));
    setPantalla("dashboard");
  };

  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    }
  };

  const register = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert("Cuenta creada correctamente");
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    limpiarEmpresaLocal();
  };

  const crearEmpresa = async () => {
    if (!nuevaEmpresa.trim()) {
      return alert("Escribe un nombre de empresa");
    }

    if (!user?.id) {
      return alert("No hay usuario logueado");
    }

    const { data: empresaCreada, error: errorEmpresa } = await supabase
      .from("empresas")
      .insert([
        {
          nombre: nuevaEmpresa.trim(),
          owner_user_id: user.id,
        },
      ])
      .select()
      .single();

    if (errorEmpresa) {
      console.error(errorEmpresa);
      return alert("No se pudo crear la empresa");
    }

    const permisosOwner = {
      empresas_ver: true,
      empresas_crear: true,
      usuarios_ver: true,
      usuarios_invitar: true,
      usuarios_editar: true,
      citas_ver: true,
      citas_crear: true,
      citas_editar: true,
      citas_cancelar: true,
      ventas_ver: true,
      ventas_crear: true,
      ventas_editar: true,
      ventas_eliminar: true,
      deudas_ver: true,
      deudas_cobrar: true,
      inventario_ver: true,
      inventario_editar: true,
      caja_ver: true,
      caja_cerrar: true,
      reportes_ver: true,
      reportes_exportar: true,
      configuracion_ver: true,
      configuracion_editar: true,

      pacientes_ver: true,
      pacientes_crear: true,
      pacientes_editar: true,
      pacientes_eliminar: true,

      caja_editar: true,
      caja_exportar: true,

      caja_chica_ver: true,
      caja_chica_crear: true,
      caja_chica_editar: true,
      caja_chica_eliminar: true,

      metodos_cobro_ver: true,
      metodos_cobro_editar: true,

      clasificaciones_ver: true,
      clasificaciones_crear: true,
      clasificaciones_editar: true,
      clasificaciones_eliminar: true,

      empleados_comision_ver: true,
      empleados_comision_crear: true,
      empleados_comision_editar: true,
      empleados_comision_eliminar: true,
    };

    const { error: errorRelacion } = await supabase
      .from("empresa_usuarios")
      .insert([
        {
          empresa_id: empresaCreada.id,
          user_id: user.id,
          rol: "owner",
          permisos: permisosOwner,
          activo: true,
          invitado_por: user.id,
          codigo_usuario: `OWNER-${Date.now()}`,
          nombre_mostrar: user.email || "Owner",
        },
      ]);

    if (errorRelacion) {
      console.error(errorRelacion);
      return alert("La empresa se creó, pero falló asignarla al usuario");
    }

    setNuevaEmpresa("");
    await obtenerEmpresasDelUsuario(user.id);
  };

  const cambiarPantalla = (nuevaPantalla) => {
    setPantalla(nuevaPantalla);
  };

  const tienePermiso = (clave) => {
    if (rolActivo === "owner" || rolActivo === "admin") return true;
    return Boolean(permisosActivos?.[clave]);
  };

  const menuVisible = useMemo(() => {
    return [
      { key: "usuarios", label: "👥 Usuarios / Accesos", permiso: "usuarios_ver" },
      { key: "venta", label: "🛒 Venta", permiso: "ventas_ver" },
      { key: "deudas", label: "📋 Deudas", permiso: "deudas_ver" },
      { key: "citas", label: "📅 Citas", permiso: "citas_ver" },
      { key: "items", label: "📦 Productos", permiso: "inventario_ver" },
      { key: "reporte", label: "📊 Reporte", permiso: "reportes_ver" },
      { key: "clientes", label: "👤 Pacientes", permiso: "citas_ver" },
      { key: "Caja Diaria", label: "💲 Caja Diaria", permiso: "caja_ver" },
      { key: "Metodo de Pago", label: "💱 Métodos de Cobro", permiso: "configuracion_ver" },
      { key: "clasificaciones", label: "🏷️ Clasificación Pacientes", permiso: "configuracion_ver" },
      { key: "empleadosComision", label: "👥 Empleados Comisión", permiso: "configuracion_ver" },
      { key: "Caja Chica", label: "💵 Caja Chica", permiso: "caja_chica_ver" },
    ].filter((item) => tienePermiso(item.permiso));
  }, [rolActivo, permisosActivos]);

  const renderContenido = () => {
    if (pantalla === "dashboard") return <Dashboard onNavigate={cambiarPantalla} />;
    if (pantalla === "usuarios" && tienePermiso("usuarios_ver")) return <UsuariosAccesos />;
    if (pantalla === "venta" && tienePermiso("ventas_ver")) return <Venta />;
    if (pantalla === "items" && tienePermiso("inventario_ver")) return <Items />;
    if (pantalla === "deudas" && tienePermiso("deudas_ver")) return <Deudas />;
    if (pantalla === "citas" && tienePermiso("citas_ver")) return <Citas />;
    if (pantalla === "reporte" && tienePermiso("reportes_ver")) return <Reporte />;
    if (pantalla === "clientes" && tienePermiso("citas_ver")) return <Clientes />;
    if (pantalla === "Caja Diaria" && tienePermiso("caja_ver")) return <CajaDiaria />;
    if (pantalla === "Metodo de Pago" && tienePermiso("configuracion_ver")) return <MetodoPago />;
    if (pantalla === "clasificaciones" && tienePermiso("configuracion_ver")) return <ClasificacionesPacientes />;
    if (pantalla === "empleadosComision" && tienePermiso("configuracion_ver")) return <EmpleadosComision />;
    if (pantalla === "Caja Chica" && tienePermiso("caja_chica_ver")) return <CajaChica />;

    return (
      <div style={styles.welcomeBox}>
        <h2 style={styles.welcomeTitle}>Bienvenido 👋</h2>
        <p style={styles.welcomeText}>
          Selecciona una opción del menú para comenzar.
        </p>
      </div>
    );
  };


  if (tokenConfirmacion) {
    return <ConfirmarCitaPublica token={tokenConfirmacion} />;
  }

  if (loading) {
    return <div style={styles.loading}>Cargando...</div>;
  }

  if (!user) {
    return (
      <div style={styles.authBgPro}>
        <div style={styles.loginShellPro}>
          <div style={styles.loginInfoPanel}>
            <div style={styles.loginLogoCircle}>🦷</div>
            <h1 style={styles.loginBrandTitle}>Sistema Dental</h1>
            <p style={styles.loginBrandText}>
              Control multiempresa para citas, ventas, caja diaria, comisiones y reportes.
            </p>

            <div style={styles.loginFeatureGrid}>
              <span>✅ Multiempresa</span>
              <span>✅ Multiusuario</span>
              <span>✅ Caja diaria</span>
              <span>✅ Comisiones</span>
            </div>
          </div>

          <div style={styles.loginCardPro}>
            <div style={styles.loginHeaderPro}>
              <div style={styles.loginMiniLogo}>🦷</div>
              <h2 style={styles.loginTitlePro}>Iniciar sesión</h2>
              <p style={styles.loginSubtitlePro}>
                Ingresa con tu correo y contraseña.
              </p>
            </div>

            <div style={styles.loginFieldPro}>
              <label style={styles.loginLabelPro}>Correo</label>
              <input
                style={styles.loginInputPro}
                placeholder="correo@clinica.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div style={styles.loginFieldPro}>
              <label style={styles.loginLabelPro}>Contraseña</label>
              <div style={styles.passwordBoxPro}>
                <input
                  style={styles.loginInputPasswordPro}
                  type={mostrarPassword ? "text" : "password"}
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") login();
                  }}
                />

                <button
                  type="button"
                  style={styles.showPasswordBtnPro}
                  onClick={() => setMostrarPassword((prev) => !prev)}
                >
                  {mostrarPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <button style={styles.loginPrimaryBtnPro} onClick={login}>
              Iniciar sesión
            </button>

            <button style={styles.loginSecondaryBtnPro} onClick={register}>
              Crear cuenta
            </button>

            <p style={styles.loginHelpText}>
              Si te invitaron, crea la cuenta con el mismo correo de la invitación.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (membresias.length === 0) {
    return (
      <div style={styles.authBgPro}>
        <div style={styles.simpleCenterCardPro}>
          <div style={styles.loginMiniLogo}>🦷</div>
          <h2 style={styles.loginTitlePro}>Crear primera empresa</h2>
          <p style={styles.loginSubtitlePro}>
            Todavía no tienes empresas asignadas. Puedes crear una o cerrar sesión si estás esperando una invitación.
          </p>

          <input
            style={styles.loginInputPro}
            placeholder="Nombre de empresa"
            value={nuevaEmpresa}
            onChange={(e) => setNuevaEmpresa(e.target.value)}
          />

          <button style={styles.loginPrimaryBtnPro} onClick={crearEmpresa}>
            Crear empresa
          </button>

          <button style={styles.loginDangerBtnPro} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!empresaActiva) {
    return (
      <div style={styles.authBgPro}>
        <div style={styles.companySelectCardPro}>
          <div style={styles.loginHeaderPro}>
            <div style={styles.loginMiniLogo}>🦷</div>
            <h2 style={styles.loginTitlePro}>Seleccionar empresa</h2>
            <p style={styles.loginSubtitlePro}>
              Elige con qué empresa deseas trabajar.
            </p>
          </div>

          <div style={styles.companyListPro}>
            {membresias.map((m) => (
              <button
                key={m.id}
                style={styles.companyOptionPro}
                onClick={() => seleccionarEmpresaDesdeMembresia(m)}
              >
                <span style={styles.companyOptionIconPro}>🏢</span>

                <span style={styles.companyOptionTextPro}>
                  <strong>{m.empresa?.nombre}</strong>
                  <small>Rol: {m.rol}</small>
                </span>

                <span style={styles.companyOptionArrowPro}>›</span>
              </button>
            ))}
          </div>

          <div style={styles.createCompanyBoxPro}>
            <label style={styles.loginLabelPro}>Crear nueva empresa</label>
            <input
              style={styles.loginInputPro}
              placeholder="Nombre de nueva empresa"
              value={nuevaEmpresa}
              onChange={(e) => setNuevaEmpresa(e.target.value)}
            />

            <button style={styles.loginPrimaryBtnPro} onClick={crearEmpresa}>
              Crear empresa
            </button>
          </div>

          <button style={styles.loginDangerBtnPro} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appShell}>
      <div style={styles.topbar}>
        <div style={styles.topbarLeft}>
          <button
            type="button"
            style={styles.logoBox}
            onClick={() => cambiarPantalla("dashboard")}
            title="Ir al dashboard"
          >
            🦷
          </button>

          <div>
            <div style={styles.companyName}>{empresaActiva.nombre}</div>
            <div style={styles.companySub}>
              Sistema Dental · {rolActivo || "sin rol"}
            </div>
          </div>
        </div>

        <div style={styles.topbarRight}>
          <button
            style={styles.smallTopButton}
            onClick={() => {
              limpiarEmpresaLocal();
            }}
          >
            Cambiar
          </button>

          <button style={styles.smallDangerButton} onClick={logout}>
            Salir
          </button>
        </div>
      </div>

      <div style={styles.menuBar}>
        {menuVisible.map((item) => (
          <button
            key={item.key}
            style={{
              ...styles.menuButton,
              ...(pantalla === item.key ? styles.menuButtonActive : {}),
            }}
            onClick={() => cambiarPantalla(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        style={{
          ...styles.contentWrap,
          padding: esMovil ? "14px" : "22px",
        }}
      >
        <div style={styles.contentCard}>{renderContenido()}</div>
      </div>
    </div>
  );
}

const styles = {
  authBgPro: {
    minHeight: "100vh",
    width: "100%",
    display: "grid",
    placeItems: "center",
    background:
      "radial-gradient(circle at top left, rgba(255,255,255,0.18), transparent 32%), linear-gradient(135deg, #5d4b6b 0%, #8b789d 55%, #6b5a7a 100%)",
    padding: "24px",
    boxSizing: "border-box",
  },

  loginShellPro: {
    width: "100%",
    maxWidth: "980px",
    display: "grid",
    gridTemplateColumns: "1.05fr 430px",
    gap: "24px",
    alignItems: "stretch",
  },

  loginInfoPanel: {
    borderRadius: "30px",
    padding: "38px",
    color: "#fff",
    background: "rgba(255,255,255,0.13)",
    border: "1px solid rgba(255,255,255,0.22)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.22)",
    backdropFilter: "blur(14px)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  loginLogoCircle: {
    width: "76px",
    height: "76px",
    borderRadius: "26px",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.22)",
    border: "1px solid rgba(255,255,255,0.26)",
    fontSize: "38px",
    marginBottom: "18px",
  },

  loginBrandTitle: {
    margin: 0,
    fontSize: "44px",
    lineHeight: 1,
    fontWeight: "950",
    letterSpacing: "-0.05em",
  },

  loginBrandText: {
    margin: "14px 0 0 0",
    color: "rgba(255,255,255,0.86)",
    fontSize: "16px",
    lineHeight: 1.65,
    maxWidth: "520px",
  },

  loginFeatureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "10px",
    marginTop: "26px",
  },

  loginCardPro: {
    background: "rgba(255,255,255,0.97)",
    border: "1px solid rgba(255,255,255,0.62)",
    borderRadius: "30px",
    padding: "32px",
    boxShadow: "0 28px 80px rgba(0,0,0,0.24)",
    display: "grid",
    gap: "15px",
    boxSizing: "border-box",
  },

  loginHeaderPro: {
    textAlign: "center",
    display: "grid",
    justifyItems: "center",
    gap: "4px",
    marginBottom: "4px",
  },

  loginMiniLogo: {
    width: "58px",
    height: "58px",
    borderRadius: "20px",
    display: "grid",
    placeItems: "center",
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    fontSize: "29px",
    boxShadow: "0 10px 24px rgba(107,90,122,0.12)",
  },

  loginTitlePro: {
    margin: "8px 0 0 0",
    color: "#4f3f5f",
    fontSize: "31px",
    fontWeight: "950",
    letterSpacing: "-0.03em",
  },

  loginSubtitlePro: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
    lineHeight: 1.5,
    textAlign: "center",
  },

  loginFieldPro: {
    display: "grid",
    gap: "7px",
  },

  loginLabelPro: {
    color: "#4b5f78",
    fontSize: "13px",
    fontWeight: "850",
  },

  loginInputPro: {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 15px",
    borderRadius: "16px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "14px",
    color: "#1f2937",
    boxShadow: "inset 0 1px 0 rgba(15,23,42,0.02)",
  },

  passwordBoxPro: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },

  loginInputPasswordPro: {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 96px 14px 15px",
    borderRadius: "16px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "14px",
    color: "#1f2937",
  },

  showPasswordBtnPro: {
    position: "absolute",
    right: "8px",
    top: "50%",
    transform: "translateY(-50%)",
    height: "34px",
    padding: "0 12px",
    borderRadius: "12px",
    border: "1px solid #d3c7dd",
    background: "#f4f0f7",
    color: "#574866",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "900",
  },

  loginPrimaryBtnPro: {
    background: "linear-gradient(135deg, #6b5a7a 0%, #8a79a0 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "14px 16px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "14px",
    boxShadow: "0 14px 28px rgba(107,90,122,0.28)",
  },

  loginSecondaryBtnPro: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "16px",
    padding: "13px 16px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "14px",
  },

  loginDangerBtnPro: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "13px 16px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "14px",
  },

  loginHelpText: {
    margin: "2px 0 0 0",
    color: "#64748b",
    fontSize: "12px",
    textAlign: "center",
    lineHeight: 1.45,
  },

  simpleCenterCardPro: {
    width: "100%",
    maxWidth: "470px",
    background: "rgba(255,255,255,0.97)",
    borderRadius: "30px",
    padding: "32px",
    display: "grid",
    gap: "14px",
    boxShadow: "0 28px 80px rgba(0,0,0,0.24)",
    boxSizing: "border-box",
  },

  companySelectCardPro: {
    width: "100%",
    maxWidth: "820px",
    background: "rgba(255,255,255,0.97)",
    borderRadius: "30px",
    padding: "32px",
    display: "grid",
    gap: "18px",
    boxShadow: "0 28px 80px rgba(0,0,0,0.24)",
    boxSizing: "border-box",
  },

  companyListPro: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "12px",
  },

  companyOptionPro: {
    width: "100%",
    border: "1px solid #d7dbe2",
    background: "linear-gradient(180deg, #ffffff 0%, #faf7fc 100%)",
    borderRadius: "20px",
    padding: "16px",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr) 22px",
    gap: "12px",
    alignItems: "center",
    color: "#1f2937",
    textAlign: "left",
    boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
  },

  companyOptionIconPro: {
    width: "46px",
    height: "46px",
    borderRadius: "16px",
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    display: "grid",
    placeItems: "center",
    fontSize: "21px",
  },

  companyOptionTextPro: {
    display: "grid",
    gap: "4px",
    minWidth: 0,
  },

  companyOptionArrowPro: {
    color: "#6b5a7a",
    fontSize: "30px",
    fontWeight: "900",
  },

  createCompanyBoxPro: {
    display: "grid",
    gap: "10px",
    padding: "14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
  },


  authLayout: {
    width: "100%",
    maxWidth: "980px",
    display: "grid",
    gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 430px)",
    gap: "22px",
    alignItems: "stretch",
  },

  authBrandPanel: {
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: "28px",
    padding: "34px",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    boxShadow: "0 25px 70px rgba(0,0,0,0.18)",
    backdropFilter: "blur(12px)",
  },

  logoBig: {
    width: "64px",
    height: "64px",
    borderRadius: "22px",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.22)",
    border: "1px solid rgba(255,255,255,0.28)",
    fontSize: "34px",
    margin: "0 auto 12px auto",
  },

  brandTitle: {
    margin: "10px 0 8px 0",
    fontSize: "38px",
    lineHeight: 1.05,
    fontWeight: "900",
    letterSpacing: "-0.04em",
  },

  brandText: {
    margin: 0,
    color: "rgba(255,255,255,0.86)",
    fontSize: "15px",
    lineHeight: 1.6,
    maxWidth: "430px",
  },

  brandPills: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "22px",
  },

  authCardModern: {
    background: "rgba(255,255,255,0.96)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.6)",
    borderRadius: "28px",
    padding: "32px",
    display: "grid",
    gap: "14px",
    boxShadow: "0 25px 70px rgba(0,0,0,0.2)",
  },

  authHeader: {
    textAlign: "center",
    marginBottom: "4px",
  },

  authSubtitle: {
    margin: "6px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
    lineHeight: 1.5,
    textAlign: "center",
  },

  authField: {
    display: "grid",
    gap: "6px",
  },

  authLabel: {
    color: "#4b5f78",
    fontSize: "13px",
    fontWeight: "800",
  },

  authInputModern: {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 15px",
    borderRadius: "16px",
    border: "1px solid #d7dbe2",
    background: "#fff",
    outline: "none",
    fontSize: "14px",
    color: "#1f2937",
  },

  passwordWrap: {
    position: "relative",
  },

  eyeBtn: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "#f4f0f7",
    color: "#574866",
    borderRadius: "12px",
    width: "34px",
    height: "34px",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    fontSize: "15px",
  },

  btnPrimaryModern: {
    background: "linear-gradient(135deg, #6b5a7a 0%, #8a79a0 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "14px 16px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "14px",
    boxShadow: "0 12px 26px rgba(107, 90, 122, 0.28)",
  },

  btnGhost: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "16px",
    padding: "13px 16px",
    cursor: "pointer",
    fontWeight: "900",
  },

  authFooterText: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "12px",
    textAlign: "center",
    lineHeight: 1.4,
  },

  emptyCompanyCard: {
    width: "100%",
    maxWidth: "460px",
    background: "rgba(255,255,255,0.96)",
    borderRadius: "28px",
    padding: "32px",
    display: "grid",
    gap: "14px",
    boxShadow: "0 25px 70px rgba(0,0,0,0.2)",
  },

  selectCompanyModern: {
    width: "100%",
    maxWidth: "780px",
    background: "rgba(255,255,255,0.96)",
    borderRadius: "28px",
    padding: "32px",
    display: "grid",
    gap: "18px",
    boxShadow: "0 25px 70px rgba(0,0,0,0.2)",
  },

  selectHeader: {
    display: "grid",
    gap: "4px",
    justifyItems: "center",
  },

  companyGridModern: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "12px",
  },

  companyCardModern: {
    width: "100%",
    textAlign: "left",
    border: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #ffffff 0%, #faf7fc 100%)",
    borderRadius: "18px",
    padding: "16px",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr) 20px",
    alignItems: "center",
    gap: "12px",
    color: "#1f2937",
    boxShadow: "0 8px 22px rgba(15, 23, 42, 0.06)",
  },

  companyIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "14px",
    background: "#f4f0f7",
    display: "grid",
    placeItems: "center",
    border: "1px solid #d3c7dd",
  },

  companyCardText: {
    display: "grid",
    gap: "4px",
    minWidth: 0,
  },

  companyRoleModern: {
    fontSize: "12px",
    color: "#64748b",
    textTransform: "capitalize",
  },

  companyArrow: {
    color: "#6b5a7a",
    fontSize: "28px",
    lineHeight: 1,
  },

  newCompanyModern: {
    display: "grid",
    gap: "10px",
    padding: "14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
  },

  btnDangerModern: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "13px 16px",
    cursor: "pointer",
    fontWeight: "900",
  },


  loading: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    fontSize: "18px",
    color: "#574866",
    background: "#f3f0f6",
  },

  authBg: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #6b5a7a 0%, #8a79a0 100%)",
    padding: "20px",
  },

  authCard: {
    width: "100%",
    maxWidth: "420px",
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.5)",
    borderRadius: "22px",
    padding: "28px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
    display: "grid",
    gap: "12px",
  },

  selectCompanyCard: {
    width: "100%",
    maxWidth: "700px",
    background: "rgba(255,255,255,0.95)",
    borderRadius: "24px",
    padding: "28px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
    display: "grid",
    gap: "16px",
  },

  authTitle: {
    margin: 0,
    textAlign: "center",
    color: "#574866",
    fontSize: "30px",
    fontWeight: "800",
  },

  authInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid #d7dbe2",
    background: "#fff",
    outline: "none",
    fontSize: "14px",
  },

  btnPrimary: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "14px",
  },

  btnSecondary: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "14px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "14px",
  },

  btnDanger: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "14px",
  },

  companyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "12px",
  },

  companyButton: {
    textAlign: "left",
    border: "1px solid #d7dbe2",
    background: "#fff",
    borderRadius: "16px",
    padding: "16px",
    cursor: "pointer",
    display: "grid",
    gap: "6px",
    color: "#1f2937",
    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
  },

  companyRole: {
    color: "#64748b",
    fontSize: "13px",
  },

  newCompanyBox: {
    display: "grid",
    gap: "10px",
    marginTop: "8px",
  },

  appShell: {
    minHeight: "100vh",
    background: "#ece8ef",
  },

  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    background: "linear-gradient(180deg, #6b5a7a 0%, #645470 100%)",
    color: "#fff",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  },

  topbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
  },

  logoBox: {
    width: "46px",
    height: "46px",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.18)",
    display: "grid",
    placeItems: "center",
    fontSize: "22px",
    flexShrink: 0,
    border: "1px solid rgba(255,255,255,0.18)",
    color: "#fff",
    cursor: "pointer",
    padding: 0,
  },

  companyName: {
    fontSize: "18px",
    fontWeight: "800",
    lineHeight: 1.2,
    wordBreak: "break-word",
  },

  companySub: {
    fontSize: "13px",
    opacity: 0.9,
    marginTop: "4px",
  },

  topbarRight: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  smallTopButton: {
    background: "rgba(255,255,255,0.14)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: "12px",
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  smallDangerButton: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  menuBar: {
    position: "sticky",
    top: "78px",
    zIndex: 90,
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    padding: "12px 16px",
    background: "#6b5a7a",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },

  menuButton: {
    background: "rgba(255,255,255,0.12)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "14px",
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: "700",
    whiteSpace: "nowrap",
  },

  menuButtonActive: {
    background: "rgba(255,255,255,0.24)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
  },

  contentWrap: {
    width: "100%",
    boxSizing: "border-box",
  },

  contentCard: {
    width: "100%",
    boxSizing: "border-box",
    background: "transparent",
  },

  welcomeBox: {
    background: "#fff",
    borderRadius: "22px",
    border: "1px solid #d7dbe2",
    padding: "28px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  welcomeTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "30px",
  },

  welcomeText: {
    margin: "8px 0 0 0",
    color: "#64748b",
  },
};

export default App;
