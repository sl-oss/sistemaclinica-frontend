import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const TIPOS = {
  paciente_llego: {
    label: "Pacientes que llegaron",
    short: "Llegaron",
    icon: "🚶",
    color: "#15803d",
    bg: "#dcfce7",
    border: "#86efac",
  },
  cita_confirmada: {
    label: "Citas confirmadas",
    short: "Confirmadas",
    icon: "✅",
    color: "#0f7a4d",
    bg: "#eefcf3",
    border: "#c7eed5",
  },
  cita_cancelada: {
    label: "Citas canceladas",
    short: "Canceladas",
    icon: "❌",
    color: "#be123c",
    bg: "#fff1f2",
    border: "#fecdd3",
  },
  cita_reagendada: {
    label: "Citas reagendadas",
    short: "Reagendadas",
    icon: "🔁",
    color: "#574866",
    bg: "#f4f0f7",
    border: "#d3c7dd",
  },
  cita_lunes_contacto: {
    label: "Solicitudes lunes",
    short: "Lunes",
    icon: "📅",
    color: "#b45309",
    bg: "#fff7ed",
    border: "#fed7aa",
  },
  cita_enviada_cobro: {
    label: "Citas enviadas a cobro",
    short: "A cobro",
    icon: "💳",
    color: "#0369a1",
    bg: "#eff6ff",
    border: "#bfdbfe",
  },
};


const PERMISO_POR_TIPO = {
  paciente_llego: "notif_paciente_llego_ver",
  cita_confirmada: "notif_cita_confirmada_ver",
  cita_cancelada: "notif_cita_cancelada_ver",
  cita_reagendada: "notif_cita_reagendada_ver",
  cita_lunes_contacto: "notif_cita_lunes_contacto_ver",
  cita_enviada_cobro: "notif_cita_enviada_cobro_ver",
};

function leerPermisosActuales() {
  try {
    return JSON.parse(localStorage.getItem("permisos") || "{}");
  } catch {
    return {};
  }
}

function leerRolActual() {
  return String(localStorage.getItem("rol") || "").toLowerCase();
}

function puedeVerTipoNotificacion(tipo, contexto = null) {
  const rol = String(contexto?.rol || leerRolActual() || "").toLowerCase();

  if (rol === "owner" || rol === "admin" || rol === "propietario") {
    return true;
  }

  const permisos = contexto?.permisos || leerPermisosActuales();

  if (permisos.bandeja_notificaciones_ver === false) {
    return false;
  }

  const permisoTipo = PERMISO_POR_TIPO[tipo];

  if (!permisoTipo) {
    return Boolean(permisos.bandeja_notificaciones_ver);
  }

  if (tipo === "paciente_llego" && permisos[permisoTipo] === undefined) {
    return Boolean(
      permisos.citas_ver ||
      permisos.bandeja_notificaciones_ver ||
      permisos.notif_cita_confirmada_ver
    );
  }

  return Boolean(permisos[permisoTipo]);
}



function BandejaNotificaciones({ empresaActiva = null, empresasUsuario = [] }) {
  const [empresaLocal, setEmpresaLocal] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("empresa") || "null");
    } catch {
      return null;
    }
  });

  const [empresasAcceso, setEmpresasAcceso] = useState(() =>
    Array.isArray(empresasUsuario) ? empresasUsuario.filter(Boolean) : []
  );
  const [permisosPorEmpresa, setPermisosPorEmpresa] = useState({});
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarMiniPanel, setMostrarMiniPanel] = useState(false);
  const [mostrarBandeja, setMostrarBandeja] = useState(false);
  const [toast, setToast] = useState(null);
  const [permisosVersion, setPermisosVersion] = useState(0);

  // Evita que el mismo mensaje vuelva a caer como toast cada vez que se refresca la bandeja.
  const mensajesRef = useRef([]);
  const toastMostradosRef = useRef(new Set());
  const toastTimerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [sonidoActivo, setSonidoActivo] = useState(() => {
    return localStorage.getItem("sonido_notificaciones") !== "off";
  });

  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("pendientes");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroVigencia, setFiltroVigencia] = useState("ultima");

  useEffect(() => {
    mensajesRef.current = mensajes;
  }, [mensajes]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const empresa = empresaActiva || empresaLocal;

  const empresasConsultaIds = useMemo(() => {
    const base = empresasAcceso.length > 0 ? empresasAcceso : empresasUsuario;
    const ids = (base || [])
      .map((emp) => emp?.id)
      .filter(Boolean)
      .map((id) => String(id));

    if (ids.length === 0 && empresa?.id) return [String(empresa.id)];

    return Array.from(new Set(ids));
  }, [empresasAcceso, empresasUsuario, empresa?.id]);

  const obtenerContextoEmpresa = (empresaId) => {
    const key = String(empresaId || empresa?.id || "");
    return permisosPorEmpresa[key] || {
      rol: leerRolActual(),
      permisos: leerPermisosActuales(),
    };
  };

  const puedeVerMensaje = (mensaje) => {
    return puedeVerTipoNotificacion(
      mensaje?.tipo,
      obtenerContextoEmpresa(mensaje?.empresa_id)
    );
  };

  const puedeVerBandeja = useMemo(() => {
    if (empresasConsultaIds.length === 0) {
      return puedeVerTipoNotificacion("cita_confirmada");
    }

    return empresasConsultaIds.some((empresaId) => {
      const contexto = obtenerContextoEmpresa(empresaId);
      const rol = String(contexto?.rol || "").toLowerCase();

      if (rol === "owner" || rol === "admin" || rol === "propietario") {
        return true;
      }

      return contexto?.permisos?.bandeja_notificaciones_ver !== false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasConsultaIds.join("|"), permisosVersion]);

  const obtenerNombreEmpresaMensaje = (empresaId) => {
    return (
      empresasAcceso.find((emp) => String(emp.id) === String(empresaId))?.nombre ||
      empresasUsuario.find((emp) => String(emp.id) === String(empresaId))?.nombre ||
      empresa?.nombre ||
      "Empresa"
    );
  };

  const tiposVisibles = useMemo(() => {
    return Object.entries(TIPOS).filter(([tipo]) =>
      empresasConsultaIds.some((empresaId) =>
        puedeVerTipoNotificacion(tipo, obtenerContextoEmpresa(empresaId))
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permisosVersion, empresasConsultaIds.join("|")]);

  const tiposVisiblesObj = useMemo(() => {
    return Object.fromEntries(tiposVisibles);
  }, [tiposVisibles]);

  useEffect(() => {
    const refrescarPorPermisos = () => {
      setPermisosVersion((prev) => prev + 1);
      setFiltroTipo("todos");
      cargarMensajes(true);
    };

    window.addEventListener("storage", refrescarPorPermisos);
    window.addEventListener("accesosActualizados", refrescarPorPermisos);

    return () => {
      window.removeEventListener("storage", refrescarPorPermisos);
      window.removeEventListener("accesosActualizados", refrescarPorPermisos);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaActiva?.id]);

  const cargarEmpresasAcceso = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (!userId) {
        const base = Array.isArray(empresasUsuario) ? empresasUsuario.filter(Boolean) : [];
        setEmpresasAcceso(base);
        return;
      }

      const { data, error } = await supabase
        .from("empresa_usuarios")
        .select(`
          empresa_id,
          rol,
          permisos,
          activo,
          empresas (
            id,
            nombre
          )
        `)
        .eq("user_id", userId)
        .eq("activo", true);

      if (error) throw error;

      const empresas = (data || [])
        .map((fila) => ({
          ...(fila.empresas || {}),
          id: fila.empresas?.id || fila.empresa_id,
          rol_usuario: fila.rol,
          permisos_usuario: fila.permisos || {},
        }))
        .filter((emp) => emp?.id);

      const mapaPermisos = {};
      empresas.forEach((emp) => {
        mapaPermisos[String(emp.id)] = {
          rol: emp.rol_usuario,
          permisos: emp.permisos_usuario || {},
        };
      });

      setEmpresasAcceso(
        Array.from(new Map(empresas.map((emp) => [String(emp.id), emp])).values())
      );
      setPermisosPorEmpresa(mapaPermisos);
      setPermisosVersion((prev) => prev + 1);
    } catch (error) {
      console.error("Error cargando empresas para bandeja:", error);
      const base = Array.isArray(empresasUsuario) ? empresasUsuario.filter(Boolean) : [];
      setEmpresasAcceso(base);
    }
  };

  useEffect(() => {
    cargarEmpresasAcceso();

    window.addEventListener("accesosActualizados", cargarEmpresasAcceso);

    return () => {
      window.removeEventListener("accesosActualizados", cargarEmpresasAcceso);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasUsuario.length, empresaActiva?.id]);

  useEffect(() => {
    const actualizarEmpresa = () => {
      try {
        setEmpresaLocal(JSON.parse(localStorage.getItem("empresa") || "null"));
      } catch {
        setEmpresaLocal(null);
      }
    };

    window.addEventListener("storage", actualizarEmpresa);
    window.addEventListener("empresaActualizada", actualizarEmpresa);

    return () => {
      window.removeEventListener("storage", actualizarEmpresa);
      window.removeEventListener("empresaActualizada", actualizarEmpresa);
    };
  }, []);

  useEffect(() => {
    const actualizarBandeja = () => cargarMensajes(true);
    window.addEventListener("bandejaMensajesActualizada", actualizarBandeja);

    return () => {
      window.removeEventListener("bandejaMensajesActualizada", actualizarBandeja);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasConsultaIds.join("|")]);

  useEffect(() => {
    if (empresasConsultaIds.length === 0) return;

    cargarMensajes(false);

    const intervalo = setInterval(() => {
      cargarMensajes(true);
    }, 15000);

    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasConsultaIds.join("|"), permisosVersion]);


  useEffect(() => {
    if (
      filtroTipo !== "todos" &&
      !empresasConsultaIds.some((empresaId) =>
        puedeVerTipoNotificacion(filtroTipo, obtenerContextoEmpresa(empresaId))
      )
    ) {
      setFiltroTipo("todos");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo, permisosVersion, empresasConsultaIds.join("|")]);


  const obtenerAudioContext = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextClass();
    }

    return audioCtxRef.current;
  };

  const reproducirNota = (ctx, frecuencia, inicio, duracion, volumen = 0.45) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(frecuencia, inicio);

    gain.gain.setValueAtTime(0.0001, inicio);
    gain.gain.exponentialRampToValueAtTime(volumen, inicio + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(inicio);
    osc.stop(inicio + duracion + 0.08);
  };

  const reproducirSonidoNotificacion = async (tipo) => {
    if (!sonidoActivo) return;

    try {
      const ctx = obtenerAudioContext();
      if (!ctx) return;

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const ahora = ctx.currentTime;

      const patrones = {
        // Timbre tipo recepción: ding-dong-ding
        paciente_llego: [
          [1046, 0, 0.28],
          [784, 0.32, 0.34],
          [1046, 0.76, 0.22],
        ],

        // Confirmación: sonido positivo corto
        cita_confirmada: [
          [659, 0, 0.14],
          [880, 0.17, 0.18],
        ],

        // Cancelación: tono descendente más serio
        cita_cancelada: [
          [440, 0, 0.2],
          [330, 0.22, 0.22],
          [220, 0.46, 0.28],
        ],

        // Reagenda: tres tonos ascendentes
        cita_reagendada: [
          [523, 0, 0.12],
          [659, 0.16, 0.12],
          [784, 0.32, 0.18],
        ],

        // Lunes: doble beep
        cita_lunes_contacto: [
          [587, 0, 0.16],
          [587, 0.24, 0.16],
        ],

        // Cobro: tono más agudo y rápido
        cita_enviada_cobro: [
          [988, 0, 0.1],
          [1318, 0.14, 0.12],
          [988, 0.3, 0.14],
        ],
      };

      const patron = patrones[tipo] || [[700, 0, 0.14]];

      patron.forEach(([frecuencia, offset, duracion]) => {
        reproducirNota(ctx, frecuencia, ahora + offset, duracion);
      });
    } catch (error) {
      console.warn("No se pudo reproducir sonido de notificación:", error);
    }
  };

  const cambiarSonidoActivo = async () => {
    const nuevo = !sonidoActivo;
    setSonidoActivo(nuevo);
    localStorage.setItem("sonido_notificaciones", nuevo ? "on" : "off");

    if (nuevo) {
      await reproducirSonidoNotificacion("paciente_llego");
    }
  };

  const cargarMensajes = async (silencioso = false) => {
    if (empresasConsultaIds.length === 0) return;

    if (!silencioso) setCargando(true);

    const { data, error } = await supabase
      .from("bandeja_mensajes")
      .select(`
        id,
        empresa_id,
        cita_id,
        cliente_id,
        tipo,
        titulo,
        mensaje,
        estado,
        leida,
        datos,
        es_ultima_accion,
        created_at
      `)
      .in("empresa_id", empresasConsultaIds)
      .order("created_at", { ascending: false })
      .limit(150);

    if (!silencioso) setCargando(false);

    if (error) {
      console.error("Error cargando bandeja de mensajes:", error);
      return;
    }

    const nuevos = (data || []).filter((m) => puedeVerMensaje(m));

    if (silencioso) {
      const idsActuales = new Set(
        (mensajesRef.current || []).map((m) => String(m.id))
      );

      const nuevoMensaje = nuevos.find((m) => {
        const id = String(m.id);

        return (
          puedeVerMensaje(m) &&
          m.es_ultima_accion !== false &&
          !m.leida &&
          !idsActuales.has(id) &&
          !toastMostradosRef.current.has(id)
        );
      });

      if (nuevoMensaje) {
        mostrarToast(nuevoMensaje);
        reproducirSonidoNotificacion(nuevoMensaje.tipo);
      }
    }

    mensajesRef.current = nuevos;
    setMensajes(nuevos);
  };

  const mostrarToast = (mensaje) => {
    if (!mensaje?.id) return;

    const id = String(mensaje.id);

    if (toastMostradosRef.current.has(id)) {
      return;
    }

    toastMostradosRef.current.add(id);
    setToast(mensaje);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToast((actual) =>
        actual && String(actual.id) === id ? null : actual
      );
    }, 6000);
  };

  const resumen = useMemo(() => {
    const base = {};

    tiposVisibles.forEach(([tipo]) => {
      base[tipo] = {
        total: 0,
        pendientes: 0,
      };
    });

    mensajes
      .filter((m) => puedeVerMensaje(m) && m.es_ultima_accion !== false)
      .forEach((m) => {
        if (!base[m.tipo]) return;

        base[m.tipo].total += 1;

        if (!m.leida || m.estado === "pendiente") {
          base[m.tipo].pendientes += 1;
        }
      });

    return base;
  }, [mensajes, tiposVisibles]);

  const totalPendientes = useMemo(() => {
    return mensajes.filter(
      (m) =>
        puedeVerMensaje(m) &&
        m.es_ultima_accion !== false &&
        (!m.leida || m.estado === "pendiente")
    ).length;
  }, [mensajes, permisosVersion]);

  const mensajesFiltrados = useMemo(() => {
    const texto = filtroTexto.trim().toLowerCase();

    return mensajes.filter((m) => {
      if (!puedeVerMensaje(m)) return false;

      const datos = m.datos || {};
      const paciente = datos.paciente || "";
      const telefono = datos.telefono || "";

      const coincideTipo = filtroTipo === "todos" || m.tipo === filtroTipo;

      const coincideEstado =
        filtroEstado === "todos" ||
        (filtroEstado === "pendientes" && (!m.leida || m.estado === "pendiente")) ||
        (filtroEstado === "leidos" && m.leida && m.estado !== "pendiente");

      const coincideVigencia =
        filtroVigencia === "todos" ||
        (filtroVigencia === "ultima" && m.es_ultima_accion !== false) ||
        (filtroVigencia === "historial" && m.es_ultima_accion === false);

      const coincideTexto =
        !texto ||
        String(m.titulo || "").toLowerCase().includes(texto) ||
        String(m.mensaje || "").toLowerCase().includes(texto) ||
        String(paciente || "").toLowerCase().includes(texto) ||
        String(telefono || "").toLowerCase().includes(texto);

      return coincideTipo && coincideEstado && coincideVigencia && coincideTexto;
    });
  }, [mensajes, filtroTipo, filtroEstado, filtroVigencia, filtroTexto, permisosVersion]);

  const marcarLeido = async (mensajeId) => {
    const { error } = await supabase
      .from("bandeja_mensajes")
      .update({
        leida: true,
        estado: "leido",
      })
      .eq("id", mensajeId);

    if (error) {
      console.error(error);
      return alert("No se pudo marcar como leído");
    }

    setMensajes((prev) =>
      prev.map((m) =>
        String(m.id) === String(mensajeId)
          ? { ...m, leida: true, estado: "leido" }
          : m
      )
    );
  };

  const marcarTodosLeidos = async () => {
    if (empresasConsultaIds.length === 0) return;

    const pendientes = mensajes.filter(
      (m) => puedeVerMensaje(m) && (!m.leida || m.estado === "pendiente")
    );

    if (pendientes.length === 0) return;

    const idsPendientes = pendientes.map((m) => m.id);

    const { error } = await supabase
      .from("bandeja_mensajes")
      .update({
        leida: true,
        estado: "leido",
      })
      .in("empresa_id", empresasConsultaIds)
      .in("id", idsPendientes);

    if (error) {
      console.error(error);
      return alert("No se pudieron marcar como leídos");
    }

    await cargarMensajes(false);
  };

  const abrirBandejaCompleta = () => {
    setMostrarMiniPanel(false);
    setMostrarBandeja(true);
  };

  if (empresasConsultaIds.length === 0 || !puedeVerBandeja) return null;

  return (
    <>
      {toast && puedeVerMensaje(toast) && (
        <div
          style={styles.toast}
          onClick={() => {
            setToast(null);
            setMostrarMiniPanel(true);
          }}
        >
          <div style={styles.toastIcon}>{TIPOS[toast.tipo]?.icon || "🔔"}</div>
          <div>
            <strong>{toast.titulo || "Nueva notificación"}</strong>
            <p>{toast.mensaje || "Hay una nueva actualización."}</p>
          </div>
        </div>
      )}

      <div style={styles.floatingWrap}>
        {mostrarMiniPanel && (
          <div style={styles.miniPanel}>
            <div style={styles.miniHeader}>
              <div>
                <strong>Notificaciones</strong>
                <span>{totalPendientes} pendiente(s)</span>
              </div>

              <div style={styles.miniHeaderActions}>
                <button
                  type="button"
                  style={sonidoActivo ? styles.soundBtnActive : styles.soundBtn}
                  onClick={cambiarSonidoActivo}
                  title={sonidoActivo ? "Sonido activo" : "Sonido apagado"}
                >
                  {sonidoActivo ? "🔊" : "🔇"}
                </button>

                <button
                  type="button"
                  style={styles.closeBtn}
                  onClick={() => setMostrarMiniPanel(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={styles.summaryList}>
              {tiposVisibles.map(([tipo, info]) => {
                const item = resumen[tipo] || { total: 0, pendientes: 0 };

                return (
                  <button
                    key={tipo}
                    type="button"
                    style={styles.summaryItem}
                    onClick={() => {
                      setFiltroTipo(tipo);
                      abrirBandejaCompleta();
                    }}
                  >
                    <span style={{ ...styles.summaryIcon, background: info.bg, color: info.color }}>
                      {info.icon}
                    </span>

                    <span style={styles.summaryText}>
                      <strong>{info.short}</strong>
                      <small>{item.pendientes} pendiente(s) · {item.total} total</small>
                    </span>

                    {item.pendientes > 0 && (
                      <span style={styles.badgeCount}>{item.pendientes}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              style={styles.openInboxBtn}
              onClick={abrirBandejaCompleta}
            >
              Abrir bandeja de mensajes
            </button>

            <button
              type="button"
              style={styles.mutedBtn}
              onClick={marcarTodosLeidos}
            >
              Marcar todo como leído
            </button>
          </div>
        )}

        <button
          type="button"
          style={styles.bellBtn}
          onClick={async () => {
            if (sonidoActivo) {
              const ctx = obtenerAudioContext();
              if (ctx?.state === "suspended") await ctx.resume();
            }
            setMostrarMiniPanel((prev) => !prev);
          }}
          title="Notificaciones"
        >
          🔔
          {totalPendientes > 0 && (
            <span style={styles.bellBadge}>
              {totalPendientes > 99 ? "99+" : totalPendientes}
            </span>
          )}
        </button>
      </div>

      {mostrarBandeja && (
        <div style={styles.modalOverlay} onClick={() => setMostrarBandeja(false)}>
          <div style={styles.inboxModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>Bandeja de mensajes</h3>
                <p style={styles.modalText}>
                  Respuestas de pacientes y futuras notificaciones del sistema.
                </p>
              </div>

              <button
                type="button"
                style={styles.closeBtn}
                onClick={() => setMostrarBandeja(false)}
              >
                ✕
              </button>
            </div>

            <div style={styles.filtersGrid}>
              <input
                style={styles.input}
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Buscar paciente, teléfono o mensaje..."
              />

              <select
                style={styles.input}
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
              >
                <option value="todos">Todos los tipos</option>
                {tiposVisibles.map(([tipo, info]) => (
                  <option key={tipo} value={tipo}>
                    {info.label}
                  </option>
                ))}
              </select>

              <select
                style={styles.input}
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
              >
                <option value="pendientes">Pendientes</option>
                <option value="leidos">Leídos</option>
                <option value="todos">Todos</option>
              </select>

              <select
                style={styles.input}
                value={filtroVigencia}
                onChange={(e) => setFiltroVigencia(e.target.value)}
              >
                <option value="ultima">Solo última acción</option>
                <option value="historial">Solo historial</option>
                <option value="todos">Última + historial</option>
              </select>

              <button
                type="button"
                style={styles.refreshBtn}
                onClick={() => cargarMensajes(false)}
              >
                Actualizar
              </button>
            </div>

            <div style={styles.groupCards}>
              {tiposVisibles.map(([tipo, info]) => {
                const item = resumen[tipo] || { total: 0, pendientes: 0 };

                return (
                  <button
                    key={tipo}
                    type="button"
                    style={{
                      ...styles.groupCard,
                      ...(filtroTipo === tipo ? styles.groupCardActive : {}),
                    }}
                    onClick={() => setFiltroTipo(tipo)}
                  >
                    <span style={{ ...styles.groupIcon, background: info.bg, color: info.color }}>
                      {info.icon}
                    </span>
                    <strong>{item.pendientes}</strong>
                    <small>{info.short}</small>
                  </button>
                );
              })}
            </div>

            <div style={styles.inboxList}>
              {cargando ? (
                <div style={styles.emptyBox}>Cargando mensajes...</div>
              ) : mensajesFiltrados.length === 0 ? (
                <div style={styles.emptyBox}>No hay mensajes con esos filtros.</div>
              ) : (
                mensajesFiltrados.map((m) => {
                  const info = TIPOS[m.tipo] || {
                    icon: "🔔",
                    color: "#334155",
                    bg: "#f8fafc",
                    border: "#e2e8f0",
                    label: m.tipo,
                  };
                  const datos = m.datos || {};

                  return (
                    <div
                      key={m.id}
                      style={{
                        ...styles.messageItem,
                        borderLeft: `5px solid ${info.color}`,
                        opacity: m.leida && m.estado !== "pendiente" ? 0.78 : 1,
                      }}
                    >
                      <div style={{ ...styles.messageIcon, background: info.bg, color: info.color }}>
                        {info.icon}
                      </div>

                      <div style={styles.messageContent}>
                        <div style={styles.messageTop}>
                          <div style={styles.messageTitleLine}>
                            <strong>{m.titulo}</strong>
                            <span
                              style={
                                m.es_ultima_accion === false
                                  ? styles.historyBadge
                                  : styles.latestBadge
                              }
                            >
                              {m.es_ultima_accion === false
                                ? "Historial"
                                : "Última acción"}
                            </span>
                          </div>
                          <span>{formatearFechaHora(m.created_at)}</span>
                        </div>

                        <p style={styles.messageText}>{m.mensaje}</p>

                        <div style={styles.messageMeta}>
                          <span>Empresa: {obtenerNombreEmpresaMensaje(m.empresa_id)}</span>
                          {datos.paciente && <span>Paciente: {datos.paciente}</span>}
                          {datos.telefono && <span>Tel: {datos.telefono}</span>}
                          {datos.fecha_nueva && (
                            <span>Nueva fecha: {formatearFecha(datos.fecha_nueva)}</span>
                          )}
                          {datos.hora_nueva && <span>Hora: {normalizarHora(datos.hora_nueva)}</span>}
                          {datos.motivo_cancelacion && <span>Motivo: {datos.motivo_cancelacion}</span>}
                          {datos.total && <span>Total: ${Number(datos.total || 0).toFixed(2)}</span>}
                          {datos.venta_id && <span>CXC: {datos.venta_id}</span>}
                          {datos.atencion_id && <span>Atención: {datos.atencion_id}</span>}
                        </div>
                      </div>

                      <div style={styles.messageActions}>
                        {m.es_ultima_accion !== false &&
                          mensajes.some(
                            (otro) =>
                              String(otro.cita_id || "") === String(m.cita_id || "") &&
                              String(otro.id) !== String(m.id)
                          ) && (
                            <button
                              type="button"
                              style={styles.historyBtn}
                              onClick={() => {
                                setFiltroVigencia("todos");
                                setFiltroTipo("todos");
                                setFiltroTexto(datos.paciente || "");
                              }}
                            >
                              Ver historial
                            </button>
                          )}

                        {(!m.leida || m.estado === "pendiente") && (
                          <button
                            type="button"
                            style={styles.readBtn}
                            onClick={() => marcarLeido(m.id)}
                          >
                            Leído
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function normalizarHora(hora) {
  if (!hora) return "";
  const partes = String(hora).split(":");
  const hh = String(partes[0] || "00").padStart(2, "0");
  const mm = String(partes[1] || "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatearFecha(fecha) {
  if (!fecha) return "";
  const [y, m, d] = String(fecha).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function formatearFechaHora(fecha) {
  if (!fecha) return "";
  const d = new Date(fecha);

  return d.toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = {
  floatingWrap: {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: 9000,
  },

  bellBtn: {
    position: "relative",
    width: "58px",
    height: "58px",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, #6b5a7a 0%, #8a79a0 100%)",
    color: "#fff",
    fontSize: "24px",
    cursor: "pointer",
    boxShadow: "0 18px 40px rgba(107,90,122,0.32)",
  },

  bellBadge: {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    minWidth: "23px",
    height: "23px",
    borderRadius: "999px",
    background: "#ef4444",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: "11px",
    fontWeight: "950",
    border: "2px solid #fff",
    padding: "0 5px",
  },

  miniPanel: {
    position: "absolute",
    right: 0,
    bottom: "72px",
    width: "min(360px, calc(100vw - 28px))",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "22px",
    boxShadow: "0 24px 70px rgba(15,23,42,0.22)",
    padding: "14px",
    display: "grid",
    gap: "11px",
  },

  miniHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "flex-start",
    color: "#1f2937",
  },

  closeBtn: {
    border: "none",
    background: "#f1f5f9",
    color: "#334155",
    borderRadius: "11px",
    width: "34px",
    height: "34px",
    cursor: "pointer",
    fontWeight: "950",
  },

  summaryList: {
    display: "grid",
    gap: "8px",
  },

  summaryItem: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "#fbfbfc",
    borderRadius: "15px",
    padding: "10px",
    display: "grid",
    gridTemplateColumns: "38px minmax(0, 1fr) auto",
    gap: "10px",
    alignItems: "center",
    cursor: "pointer",
    textAlign: "left",
  },

  summaryIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "13px",
    display: "grid",
    placeItems: "center",
    fontSize: "19px",
  },

  summaryText: {
    display: "grid",
    gap: "2px",
    color: "#1f2937",
  },

  badgeCount: {
    minWidth: "26px",
    height: "26px",
    borderRadius: "999px",
    background: "#ef4444",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: "12px",
    fontWeight: "950",
  },

  openInboxBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    padding: "12px",
    cursor: "pointer",
    fontWeight: "950",
  },

  mutedBtn: {
    background: "#f8fafc",
    color: "#64748b",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "10px",
    cursor: "pointer",
    fontWeight: "850",
  },

  toast: {
    position: "fixed",
    right: "18px",
    top: "18px",
    width: "min(360px, calc(100vw - 28px))",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderLeft: "5px solid #6b5a7a",
    borderRadius: "18px",
    boxShadow: "0 18px 46px rgba(15,23,42,0.18)",
    padding: "13px",
    zIndex: 9500,
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr)",
    gap: "10px",
    cursor: "pointer",
  },

  toastIcon: {
    width: "40px",
    height: "40px",
    borderRadius: "14px",
    background: "#f4f0f7",
    display: "grid",
    placeItems: "center",
    fontSize: "20px",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    zIndex: 9100,
    display: "grid",
    placeItems: "center",
    padding: "18px",
  },

  inboxModal: {
    width: "min(1040px, calc(100vw - 28px))",
    maxHeight: "calc(100vh - 34px)",
    background: "#fff",
    borderRadius: "24px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 24px 80px rgba(15,23,42,0.24)",
    padding: "18px",
    display: "grid",
    gridTemplateRows: "auto auto auto minmax(0, 1fr)",
    gap: "13px",
    boxSizing: "border-box",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
  },

  modalTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "24px",
    fontWeight: "950",
  },

  modalText: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "13px",
  },

  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) 180px 130px 170px auto",
    gap: "9px",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cfd9e5",
    borderRadius: "13px",
    padding: "11px 12px",
    outline: "none",
    fontSize: "13px",
    background: "#fff",
    color: "#0f172a",
  },

  refreshBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "13px",
    padding: "11px 13px",
    cursor: "pointer",
    fontWeight: "900",
  },

  groupCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
    gap: "9px",
  },

  groupCard: {
    border: "1px solid #e2e8f0",
    background: "#fbfbfc",
    borderRadius: "16px",
    padding: "11px",
    display: "grid",
    gap: "4px",
    justifyItems: "start",
    cursor: "pointer",
    color: "#334155",
    textAlign: "left",
  },

  groupCardActive: {
    border: "1px solid #7c3aed",
    background: "#f4f0f7",
  },

  groupIcon: {
    width: "34px",
    height: "34px",
    borderRadius: "12px",
    display: "grid",
    placeItems: "center",
    fontSize: "18px",
  },

  inboxList: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "9px",
    paddingRight: "3px",
  },

  messageItem: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "17px",
    padding: "12px",
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr) auto",
    gap: "11px",
    alignItems: "start",
  },

  messageIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "14px",
    display: "grid",
    placeItems: "center",
    fontSize: "19px",
  },

  messageContent: {
    display: "grid",
    gap: "6px",
    minWidth: 0,
  },

  messageTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    color: "#1f2937",
  },

  messageText: {
    margin: 0,
    color: "#475569",
    fontSize: "13px",
    lineHeight: 1.4,
  },

  messageMeta: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },

  readBtn: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "12px",
  },

  emptyBox: {
    background: "#f8fafc",
    border: "1px dashed #cbd5e1",
    borderRadius: "16px",
    padding: "18px",
    color: "#64748b",
    textAlign: "center",
    fontWeight: "850",
  },
  messageTitleLine: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },

  latestBadge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "4px 8px",
    background: "#dcfce7",
    color: "#15803d",
    border: "1px solid #86efac",
    fontSize: "11px",
    fontWeight: "950",
  },

  historyBadge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "4px 8px",
    background: "#f1f5f9",
    color: "#64748b",
    border: "1px solid #cbd5e1",
    fontSize: "11px",
    fontWeight: "950",
  },

  messageActions: {
    display: "grid",
    gap: "7px",
    justifyItems: "end",
  },

  historyBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "12px",
    whiteSpace: "nowrap",
  },

  miniHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
  },

  soundBtn: {
    border: "none",
    background: "#f1f5f9",
    color: "#64748b",
    borderRadius: "11px",
    width: "34px",
    height: "34px",
    cursor: "pointer",
    fontWeight: "950",
  },

  soundBtnActive: {
    border: "none",
    background: "#dcfce7",
    color: "#15803d",
    borderRadius: "11px",
    width: "34px",
    height: "34px",
    cursor: "pointer",
    fontWeight: "950",
  },

};

export default BandejaNotificaciones;
