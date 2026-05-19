import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// Cambiá este número por el WhatsApp real de recepción/clínica.
// Formato requerido: código de país + número, sin +, espacios ni guiones.
// Ejemplo El Salvador: 50377777777
const NUMERO_WHATSAPP_CLINICA = "50377497483";

// Si los lunes son selectivos, dejamos bloqueada la reagenda automática en lunes.
// Si después querés permitir lunes, cambiá false por true.
const PERMITIR_REAGENDAR_LUNES = false;

const HORARIOS_REAGENDA = [
  { desde: "09:00", hasta: "11:45" },
  { desde: "14:00", hasta: "17:45" },
];


function ConfirmarCitaPublica({ token }) {

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [ultimaAccion, setUltimaAccion] = useState(null);
  const [modoCambiarDecision, setModoCambiarDecision] = useState(false);

  const [tokenData, setTokenData] = useState(null);
  const [cita, setCita] = useState(null);
  const [citasFecha, setCitasFecha] = useState([]);

  const [accion, setAccion] = useState("");
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [cancelarDeseaReagendar, setCancelarDeseaReagendar] = useState(null);

  const [fechaReagendar, setFechaReagendar] = useState(obtenerFechaSV());
  const [horaReagendar, setHoraReagendar] = useState("09:00");

  const horasDisponibles = useMemo(() => {
    return construirHorariosReagenda(fechaReagendar);
  }, [fechaReagendar]);

  const esLunesSeleccionado = useMemo(() => {
    return esLunes(fechaReagendar);
  }, [fechaReagendar]);

  const esDomingoSeleccionado = useMemo(() => {
    return esDomingo(fechaReagendar);
  }, [fechaReagendar]);

  const fechaReagendarBloqueada = useMemo(() => {
    if (!fechaReagendar) return true;
    if (esDomingoSeleccionado) return true;
    if (esLunesSeleccionado && !PERMITIR_REAGENDAR_LUNES) return true;
    return false;
  }, [fechaReagendar, esDomingoSeleccionado, esLunesSeleccionado]);

  const puedeReagendarFecha = useMemo(() => {
    return !fechaReagendarBloqueada;
  }, [fechaReagendarBloqueada]);

  useEffect(() => {
    cargarCitaPublica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const cargarCitaPublica = async (mantenerMensaje = false) => {
    if (!token) {
      setError("Enlace inválido.");
      setCargando(false);
      return;
    }

    setCargando(true);
    setError("");
    if (!mantenerMensaje) {
      setMensaje("");
      setUltimaAccion(null);
      setModoCambiarDecision(false);
    }

    const { data: tokenEncontrado, error: errorToken } = await supabase
      .from("citas_tokens_publicos")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (errorToken || !tokenEncontrado) {
      console.error(errorToken);
      setError("Este enlace no existe o ya no es válido.");
      setCargando(false);
      return;
    }

    if (tokenEncontrado.expira_en && new Date(tokenEncontrado.expira_en) < new Date()) {
      setError("Este enlace ya venció. Por favor contacte a la clínica.");
      setCargando(false);
      return;
    }

    const { data: citaEncontrada, error: errorCita } = await supabase
      .from("citas")
      .select(`
        id,
        empresa_id,
        cliente_id,
        fecha,
        hora,
        servicio,
        estado,
        confirmada,
        motivo_cancelacion,
        desea_reprogramar,
        fecha_reprogramada,
        hora_reprogramada,
        clientes(nombre, telefono),
        empresas(id, nombre)
      `)
      .eq("id", tokenEncontrado.cita_id)
      .eq("empresa_id", tokenEncontrado.empresa_id)
      .maybeSingle();

    if (errorCita || !citaEncontrada) {
      console.error(errorCita);
      setError("No encontramos la cita relacionada a este enlace.");
      setCargando(false);
      return;
    }

    setTokenData(tokenEncontrado);
    setCita(citaEncontrada);
    setFechaReagendar(citaEncontrada.fecha || obtenerFechaSV());
    setHoraReagendar(normalizarHora(citaEncontrada.hora) || "09:00");

    await cargarCitasPorFecha(citaEncontrada.fecha, citaEncontrada.empresa_id, citaEncontrada.id);

    setCargando(false);
  };

  const cargarCitasPorFecha = async (fechaConsulta, empresaId, citaActualId = cita?.id) => {
    if (!fechaConsulta || !empresaId) return;

    const { data, error } = await supabase
      .from("citas")
      .select(`
        id,
        empresa_id,
        fecha,
        hora,
        estado,
        confirmada,
        clientes(nombre, telefono)
      `)
      .eq("empresa_id", empresaId)
      .eq("fecha", fechaConsulta)
      .neq("estado", "cancelada")
      .order("hora", { ascending: true });

    if (error) {
      console.error(error);
      setCitasFecha([]);
      return;
    }

    setCitasFecha((data || []).filter((item) => String(item.id) !== String(citaActualId)));
  };

  const contarCitasEnBloque = (horaTexto) => {
    return citasFecha.filter((item) => normalizarHora(item.hora) === horaTexto).length;
  };

  const abrirWhatsAppClinica = (accionRealizada, detalleExtra = "") => {
    if (!NUMERO_WHATSAPP_CLINICA || NUMERO_WHATSAPP_CLINICA === "50300000000") {
      console.warn("Configura NUMERO_WHATSAPP_CLINICA en ConfirmarCitaPublica.jsx");
      return;
    }

    const empresaNombre = cita?.empresas?.nombre || "Clínica";
    const paciente = cita?.clientes?.nombre || "Paciente";
    const telefonoPaciente = cita?.clientes?.telefono || "Sin teléfono";

    const mensaje = `Notificación de cita - ${empresaNombre}

Paciente: ${paciente}
Teléfono: ${telefonoPaciente}
Acción: ${accionRealizada}

Cita actual:
Fecha: ${formatearFechaPantalla(cita?.fecha)}
Hora: ${normalizarHora(cita?.hora)}
${detalleExtra ? `\nDetalle:\n${detalleExtra}` : ""}`;

    const texto = encodeURIComponent(mensaje);
    const esApple = /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent);
    const url = esApple
      ? `https://api.whatsapp.com/send?phone=${NUMERO_WHATSAPP_CLINICA}&text=${texto}`
      : `https://wa.me/${NUMERO_WHATSAPP_CLINICA}?text=${texto}`;

    window.location.href = url;
  };

  const enviarPushNotificacion = async (titulo, mensajeDetalle, tipo, datosExtra = {}) => {
    if (!cita?.empresa_id) return;

    try {
      const { data: tokensData, error: tokensError } = await supabase
        .from("push_tokens")
        .select("token")
        .eq("empresa_id", cita.empresa_id)
        .eq("activo", true);

      if (tokensError) {
        console.error("Error obteniendo tokens push:", tokensError);
        return;
      }

      const tokens = (tokensData || [])
        .map((item) => item.token)
        .filter(Boolean);

      if (tokens.length === 0) {
        console.log("No hay tokens push para esta empresa.");
        return;
      }

      const dataPush = {
        tipo: String(tipo || ""),
        cita_id: String(cita?.id || ""),
        empresa_id: String(cita?.empresa_id || ""),
        cliente_id: String(cita?.cliente_id || ""),
      };

      Object.entries(datosExtra || {}).forEach(([key, value]) => {
        dataPush[key] = value == null ? "" : String(value);
      });

      const { data: pushData, error: pushError } = await supabase.functions.invoke("enviar-push", { 
        body: {
          tokens,
          title: titulo || "Nueva notificación",
          message: mensajeDetalle || "Hay una nueva actualización.",
          data: dataPush,
        },
      });

      console.log("RESPUESTA PUSH:", pushData);

if (pushError) {
  console.error("Error enviando push:", pushError);
}

      if (pushError) {
        console.error("Error enviando push:", pushError);
      }
    } catch (error) {
      console.error("Error push firebase:", error);
    }
  };

  const guardarNotificacionInterna = async (tipo, titulo, mensajeDetalle = "", datosExtra = {}) => {
    if (!cita?.empresa_id) return;

    // Para saber cuál fue la última decisión del paciente, guardamos historial,
    // pero antes marcamos las notificaciones anteriores de esta cita como historial.
    if (cita?.id) {
      const { error: errorHistorial } = await supabase
        .from("bandeja_mensajes")
        .update({ es_ultima_accion: false })
        .eq("cita_id", cita.id);

      if (errorHistorial) {
        console.error("Error marcando historial de notificaciones:", errorHistorial);
      }
    }

    const payload = {
      empresa_id: cita.empresa_id,
      cita_id: cita.id,
      cliente_id: cita.cliente_id,
      tipo,
      titulo,
      mensaje: mensajeDetalle,
      estado: "pendiente",
      leida: false,
      es_ultima_accion: true,
      datos: {
        paciente: cita?.clientes?.nombre || "Paciente",
        telefono: cita?.clientes?.telefono || "",
        fecha_original: cita?.fecha || null,
        hora_original: cita?.hora || null,
        ...datosExtra,
      },
    };

    const { error } = await supabase.from("bandeja_mensajes").insert([payload]);

    if (error) {
      console.error("Error guardando notificación interna:", error);
      return;
    }

    window.dispatchEvent(new Event("bandejaMensajesActualizada"));

    await enviarPushNotificacion(titulo, mensajeDetalle, tipo, datosExtra);
  };

  const contactarClinicaPorLunes = async () => {
    await guardarNotificacionInterna(
      "cita_lunes_contacto",
      "Solicitud para reagendar lunes",
      `${cita?.clientes?.nombre || "Paciente"} quiere consultar disponibilidad para reagendar lunes.`,
      {
        motivo: "lunes_selectivo",
        fecha_solicitada: fechaReagendar,
      }
    );

    const mensaje = `Hola, quiero reagendar mi cita para un día lunes.

Paciente: ${cita?.clientes?.nombre || "Paciente"}
Teléfono: ${cita?.clientes?.telefono || "Sin teléfono"}
Fecha actual: ${formatearFechaPantalla(cita?.fecha)}
Hora actual: ${normalizarHora(cita?.hora)}

Me gustaría consultar disponibilidad para poder agendar.`;

    const texto = encodeURIComponent(mensaje);
    const esApple = /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent);
    const url = esApple
      ? `https://api.whatsapp.com/send?phone=${NUMERO_WHATSAPP_CLINICA}&text=${texto}`
      : `https://wa.me/${NUMERO_WHATSAPP_CLINICA}?text=${texto}`;

    window.location.href = url;
  };

  const notificarDomingoCerrado = async () => {
    await guardarNotificacionInterna(
      "cita_domingo_cerrado",
      "Intento de reagendar domingo",
      `${cita?.clientes?.nombre || "Paciente"} intentó seleccionar domingo para reagendar, pero ese día está cerrado.`,
      {
        motivo: "domingo_cerrado",
        fecha_solicitada: fechaReagendar,
      }
    );

    setMensaje("Los domingos no se brindan consultas. Por favor seleccione otro día disponible.");
  };

  const confirmarCita = async () => {
    if (!cita || !tokenData) return;

    setGuardando(true);
    setMensaje("");
    setError("");

    const { error: errorUpdate } = await supabase
      .from("citas")
      .update({
        confirmada: true,
        estado: "pendiente",
        motivo_cancelacion: null,
        desea_reprogramar: false,
        fecha_reprogramada: null,
        hora_reprogramada: null,
      })
      .eq("id", cita.id)
      .eq("empresa_id", cita.empresa_id);

    setGuardando(false);

    if (errorUpdate) {
      console.error(errorUpdate);
      setError("No pudimos confirmar la cita. Por favor contacte a la clínica.");
      return;
    }

    await guardarNotificacionInterna(
      "cita_confirmada",
      "Cita confirmada",
      `${cita?.clientes?.nombre || "Paciente"} confirmó su cita para el ${formatearFechaPantalla(cita.fecha)} a las ${normalizarHora(cita.hora)}.`
    );

    setUltimaAccion({
      tipo: "confirmada",
      titulo: "Cita confirmada",
      detalle: "",
    });
    setMensaje("¡Gracias! Su cita ha sido confirmada. La clínica recibirá su respuesta.");
    await cargarCitaPublica(true);
  };

  const cancelarCita = async () => {
    if (!cita || !tokenData) return;

    if (!motivoCancelacion.trim()) {
      alert("Por favor escriba el motivo de cancelación.");
      return;
    }

    if (cancelarDeseaReagendar === null) {
      alert("Por favor indique si desea reagendar su cita.");
      return;
    }

    setGuardando(true);
    setMensaje("");
    setError("");

    const { error: errorUpdate } = await supabase
      .from("citas")
      .update({
        estado: "cancelada",
        confirmada: false,
        motivo_cancelacion: motivoCancelacion.trim(),
        desea_reprogramar: Boolean(cancelarDeseaReagendar),
      })
      .eq("id", cita.id)
      .eq("empresa_id", cita.empresa_id);

    setGuardando(false);

    if (errorUpdate) {
      console.error(errorUpdate);
      setError("No pudimos cancelar la cita. Por favor contacte a la clínica.");
      return;
    }

    await guardarNotificacionInterna(
      "cita_cancelada",
      cancelarDeseaReagendar ? "Cita cancelada - desea reagendar" : "Cita cancelada",
      `${cita?.clientes?.nombre || "Paciente"} canceló su cita. Motivo: ${motivoCancelacion.trim()}. ${cancelarDeseaReagendar ? "El paciente indicó que desea reagendar." : "El paciente indicó que no desea reagendar."}`,
      {
        motivo_cancelacion: motivoCancelacion.trim(),
        desea_reagendar: Boolean(cancelarDeseaReagendar),
      }
    );

    setUltimaAccion({
      tipo: "cancelada",
      titulo: cancelarDeseaReagendar ? "Cita cancelada - desea reagendar" : "Cita cancelada",
      detalle: `Motivo: ${motivoCancelacion.trim()}\nDesea reagendar: ${cancelarDeseaReagendar ? "Sí" : "No"}`,
    });
    setMensaje(
      cancelarDeseaReagendar
        ? "Su cita fue cancelada. La clínica recibirá su solicitud para reagendar."
        : "Su cita fue cancelada. La clínica recibirá su respuesta."
    );
    await cargarCitaPublica(true);
  };

  const reagendarCita = async () => {
    if (!cita || !tokenData) return;

    if (!puedeReagendarFecha) {
      if (esDomingoSeleccionado) {
        await notificarDomingoCerrado();
        alert("Los domingos no se brindan consultas. Por favor seleccione otro día disponible.");
        return;
      }

      alert("Los lunes se atiende de forma selectiva. Por favor contacte directamente a la clínica para reagendar.");
      return;
    }

    if (!horasDisponibles.includes(horaReagendar)) {
      alert("Seleccione un horario disponible dentro del horario de atención.");
      return;
    }

    const cupos = contarCitasEnBloque(horaReagendar);

    if (cupos >= 4) {
      alert("Ese horario ya tiene 4 pacientes. Por favor seleccione otro bloque de 15 minutos.");
      return;
    }

    setGuardando(true);
    setMensaje("");
    setError("");

    const { error: errorUpdate } = await supabase
      .from("citas")
      .update({
        fecha: fechaReagendar,
        hora: horaReagendar,
        estado: "pendiente",
        confirmada: false,
        desea_reprogramar: true,
        fecha_reprogramada: fechaReagendar,
        hora_reprogramada: horaReagendar,
        motivo_cancelacion: null,
      })
      .eq("id", cita.id)
      .eq("empresa_id", cita.empresa_id);

    setGuardando(false);

    if (errorUpdate) {
      console.error(errorUpdate);
      setError("No pudimos reagendar la cita. Por favor contacte a la clínica.");
      return;
    }

    await guardarNotificacionInterna(
      "cita_reagendada",
      "Cita reagendada",
      `${cita?.clientes?.nombre || "Paciente"} reagendó su cita para el ${formatearFechaPantalla(fechaReagendar)} a las ${normalizarHora(horaReagendar)}.`,
      {
        fecha_nueva: fechaReagendar,
        hora_nueva: horaReagendar,
      }
    );

    setUltimaAccion({
      tipo: "reagendada",
      titulo: "Cita reagendada",
      detalle: `Nueva fecha: ${formatearFechaPantalla(fechaReagendar)}\nNueva hora: ${normalizarHora(horaReagendar)}`,
    });
    setMensaje("Su cita fue reagendada correctamente. La clínica recibirá su respuesta.");
    await cargarCitaPublica(true);
  };

  const info = leerServicio(cita?.servicio);
  const puedeCambiarDecision = cita?.estado !== "cancelada" || modoCambiarDecision;

  if (cargando) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.loading}>Cargando cita...</div>
        </div>
      </div>
    );
  }

  if (ultimaAccion) {
  return (
    <div style={styles.page}>
      <div style={styles.resultCard}>
        <div
          style={{
            ...styles.resultIcon,
            background:
              ultimaAccion.tipo === "confirmada"
                ? "#dcfce7"
                : ultimaAccion.tipo === "cancelada"
                ? "#fee2e2"
                : "#ede9fe",
            color:
              ultimaAccion.tipo === "confirmada"
                ? "#15803d"
                : ultimaAccion.tipo === "cancelada"
                ? "#b91c1c"
                : "#6d28d9",
          }}
        >
          {ultimaAccion.tipo === "confirmada"
            ? "✅"
            : ultimaAccion.tipo === "cancelada"
            ? "❌"
            : "🔄"}
        </div>

        <h1 style={styles.resultTitle}>
          {ultimaAccion.titulo}
        </h1>

        <p style={styles.resultText}>
          {mensaje}
        </p>

        {ultimaAccion.detalle && (
          <div style={styles.resultDetailBox}>
            {ultimaAccion.detalle
              .split("\n")
              .map((linea, index) => (
                <div key={index}>{linea}</div>
              ))}
          </div>
        )}

        <div style={styles.resultButtons}>
          <button
            type="button"
            style={styles.resultSecondaryBtn}
            onClick={() => {
              setUltimaAccion(null);
              setAccion("");
              setMensaje("");
            }}
          >
            Cambiar decisión
          </button>

          <button
            type="button"
            style={styles.resultPrimaryBtn}
            onClick={() => {
              window.close();

              setTimeout(() => {
                window.location.href = "about:blank";
              }, 300);
            }}
          >
            Finalizar
          </button>
        </div>
      </div>
    </div>
  );
}

  if (error && !cita) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>🦷</div>
          <h1 style={styles.title}>Enlace no disponible</h1>
          <p style={styles.errorBox}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <div style={styles.logo}>🦷</div>
            <h1 style={styles.title}>Confirmar cita</h1>
            <p style={styles.subtitle}>{cita?.empresas?.nombre || "Clínica dental"}</p>
          </div>
        </div>

        {mensaje && (
          <div style={styles.successBox}>
            <div>{mensaje}</div>
          </div>
        )}
        {error && <div style={styles.errorBox}>{error}</div>}

        {modoCambiarDecision && cita?.estado === "cancelada" && (
          <div style={styles.changeDecisionBox}>
            Está cambiando una decisión anterior. Puede confirmar, cancelar nuevamente o reagendar la cita.
          </div>
        )}

        <div style={styles.appointmentBox}>
          <span style={styles.label}>Paciente</span>
          <strong style={styles.patientName}>{cita?.clientes?.nombre || "Paciente"}</strong>

          <div style={styles.infoGrid}>
            <div>
              <span style={styles.label}>Fecha</span>
              <strong>{formatearFechaPantalla(cita?.fecha)}</strong>
            </div>

            <div>
              <span style={styles.label}>Hora</span>
              <strong>{normalizarHora(cita?.hora)}</strong>
            </div>
          </div>

          <div style={styles.badgesRow}>
            <span style={{ ...styles.badge, ...prioridadStyle(info.tipo) }}>
              {labelTipo(info.tipo)}
            </span>

            <span style={cita?.confirmada ? styles.badgeOk : styles.badgePending}>
              {cita?.confirmada ? "Confirmada" : "Pendiente"}
            </span>

            {cita?.estado === "cancelada" && (
              <span style={styles.badgeCancelada}>Cancelada</span>
            )}
          </div>

          {info.comentario && (
            <p style={styles.comment}>{info.comentario}</p>
          )}
        </div>

        {puedeCambiarDecision && (
          <div style={styles.actionsGrid}>
            <button
              type="button"
              style={styles.confirmBtn}
              onClick={confirmarCita}
              disabled={guardando}
            >
              Confirmar
            </button>

            <button
              type="button"
              style={styles.cancelBtn}
              onClick={() => {
                setAccion((prev) => (prev === "cancelar" ? "" : "cancelar"));
                setCancelarDeseaReagendar(null);
              }}
              disabled={guardando}
            >
              Cancelar
            </button>

            <button
              type="button"
              style={styles.reagendarBtn}
              onClick={async () => {
                const nuevaAccion = accion === "reagendar" ? "" : "reagendar";
                setAccion(nuevaAccion);

                if (nuevaAccion === "reagendar") {
                  await cargarCitasPorFecha(fechaReagendar, cita.empresa_id, cita.id);
                }
              }}
              disabled={guardando}
            >
              Reagendar
            </button>
          </div>
        )}

        {accion === "cancelar" && puedeCambiarDecision && (
          <div style={styles.panel}>
            <label style={styles.label}>Motivo de cancelación</label>
            <textarea
              style={styles.textarea}
              value={motivoCancelacion}
              onChange={(e) => setMotivoCancelacion(e.target.value)}
              placeholder="Escriba el motivo de cancelación..."
            />

            <div style={styles.cancelQuestionBox}>
              <strong>¿Desea reagendar su cita?</strong>
              <div style={styles.cancelOptions}>
                <button
                  type="button"
                  style={{
                    ...styles.cancelOptionBtn,
                    ...(cancelarDeseaReagendar === true ? styles.cancelOptionBtnActive : {}),
                  }}
                  onClick={() => setCancelarDeseaReagendar(true)}
                >
                  Sí, deseo reagendar
                </button>

                <button
                  type="button"
                  style={{
                    ...styles.cancelOptionBtn,
                    ...(cancelarDeseaReagendar === false ? styles.cancelOptionBtnActiveRed : {}),
                  }}
                  onClick={() => setCancelarDeseaReagendar(false)}
                >
                  No
                </button>
              </div>
            </div>

            <button
              type="button"
              style={styles.cancelBtnFull}
              onClick={cancelarCita}
              disabled={guardando}
            >
              Confirmar cancelación
            </button>
          </div>
        )}

        {accion === "reagendar" && puedeCambiarDecision && (
          <div style={styles.panel}>
            <div style={styles.reagendarHeader}>
              <div>
                <h3 style={styles.panelTitle}>Reagendar cita</h3>
                <p style={styles.panelText}>
                  Horarios disponibles: lunes a viernes 09:00 a.m. a 11:45 a.m. y 02:00 p.m. a 05:45 p.m. • sábados únicamente hasta las 11:45 a.m.
                  Máximo 4 pacientes por bloque de 15 minutos.
                </p>
              </div>
            </div>

            <input
              type="date"
              style={styles.input}
              value={fechaReagendar}
              onChange={async (e) => {
                const nuevaFecha = e.target.value;
                setFechaReagendar(nuevaFecha);
                await cargarCitasPorFecha(nuevaFecha, cita.empresa_id, cita.id);
              }}
            />

            {esDomingoSeleccionado ? (
              <div style={styles.closedDayWarning}>
                <strong>Domingo cerrado</strong>
                <span>
                  Los domingos no se brindan consultas ni se habilitan reagendas.
                </span>
                <span>
                  Por favor seleccione un día de atención disponible.
                </span>
              </div>
            ) : esLunesSeleccionado && !PERMITIR_REAGENDAR_LUNES ? (
              <div style={styles.mondayWarning}>
                <strong>Para reagendar días lunes, contáctenos.</strong>
                <span>
                  Los lunes se atiende de forma selectiva.
                </span>
                <span>
                  WhatsApp: {formatearTelefonoClinica(NUMERO_WHATSAPP_CLINICA)}
                </span>
                <button
                  type="button"
                  style={styles.mondayWhatsBtn}
                  onClick={contactarClinicaPorLunes}
                >
                  Abrir WhatsApp
                </button>
              </div>
            ) : (
              <>
                <div style={styles.slotsGrid}>
                  {horasDisponibles.map((horaItem) => {
                const cantidad = contarCitasEnBloque(horaItem);
                const lleno = cantidad >= 4;
                const bloqueadoPorLunes = esLunesSeleccionado && !PERMITIR_REAGENDAR_LUNES;
                const activo = horaReagendar === horaItem;

                return (
                  <button
                    key={horaItem}
                    type="button"
                    style={{
                      ...styles.slotBtn,
                      ...(activo ? styles.slotBtnActive : {}),
                      ...(lleno || bloqueadoPorLunes ? styles.slotBtnFull : {}),
                    }}
                    disabled={lleno || bloqueadoPorLunes}
                    onClick={() => setHoraReagendar(horaItem)}
                  >
                    <strong>{horaItem}</strong>
                    <span>{cantidad}/4</span>
                  </button>
                );
                  })}
                </div>

                <button
                  type="button"
                  style={styles.reagendarBtnFull}
                  onClick={reagendarCita}
                  disabled={guardando}
                >
                  Guardar nueva fecha y hora
                </button>
              </>
            )}
          </div>
        )}

        <p style={styles.footerText}>
          Si tiene dudas, por favor comuníquese directamente con la clínica.
        </p>
      </div>
    </div>
  );
}

function obtenerFechaSV() {
  const ahora = new Date();
  const fechaSV = new Date(
    ahora.toLocaleString("en-US", { timeZone: "America/El_Salvador" })
  );

  const yyyy = fechaSV.getFullYear();
  const mm = String(fechaSV.getMonth() + 1).padStart(2, "0");
  const dd = String(fechaSV.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function construirHorariosReagenda(fechaSeleccionada = null) {
  const bloques = [];

  // Si es sábado, solo se atiende hasta las 11:45 a.m.
  const esSabadoSeleccionado = (() => {
    if (!fechaSeleccionada) return false;

    const [y, m, d] = String(fechaSeleccionada)
      .slice(0, 10)
      .split("-")
      .map(Number);

    const fecha = new Date(y, m - 1, d);

    return fecha.getDay() === 6;
  })();

  const horarios =
    esSabadoSeleccionado
      ? [{ desde: "09:00", hasta: "11:45" }]
      : HORARIOS_REAGENDA;

  horarios.forEach((rango) => {
    let actual = convertirHoraAMinutos(rango.desde);
    const fin = convertirHoraAMinutos(rango.hasta);

    while (actual <= fin) {
      bloques.push(convertirMinutosAHora(actual));
      actual += 15;
    }
  });

  return bloques;
}

function convertirHoraAMinutos(hora) {
  const [hh, mm] = String(hora).split(":").map(Number);
  return hh * 60 + mm;
}

function convertirMinutosAHora(total) {
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function esLunes(fecha) {
  if (!fecha) return false;
  const [y, m, d] = String(fecha).slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getDay() === 1;
}

function esDomingo(fecha) {
  if (!fecha) return false;
  const [y, m, d] = String(fecha).slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getDay() === 0;
}

function formatearTelefonoClinica(numero) {
  const limpio = String(numero || "").replace(/\D/g, "");
  if (limpio.startsWith("503") && limpio.length === 11) {
    return `+503 ${limpio.slice(3, 7)}-${limpio.slice(7)}`;
  }
  return limpio ? `+${limpio}` : "";
}

function normalizarHora(hora) {
  if (!hora) return "";
  const partes = String(hora).split(":");
  const hh = String(partes[0] || "00").padStart(2, "0");
  const mm = String(partes[1] || "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatearFechaPantalla(fecha) {
  if (!fecha) return "";
  const [y, m, d] = String(fecha).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function leerServicio(servicio) {
  if (!servicio) return { tipo: "normal", comentario: "" };

  try {
    const parsed = JSON.parse(servicio);
    return {
      tipo: parsed.tipo || "normal",
      comentario: parsed.comentario || "",
    };
  } catch {
    return {
      tipo: "normal",
      comentario: servicio || "",
    };
  }
}

function labelTipo(tipo) {
  if (tipo === "importante") return "Importante";
  if (tipo === "emergencia") return "Emergencia";
  return "Normal";
}

function prioridadStyle(tipo) {
  if (tipo === "emergencia") {
    return {
      background: "#fff1f2",
      color: "#be123c",
      border: "1px solid #fecdd3",
    };
  }

  if (tipo === "importante") {
    return {
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid #fed7aa",
    };
  }

  return {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
  };
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
    padding: "16px",
    boxSizing: "border-box",
  },

  card: {
    width: "min(520px, 100%)",
    background: "#fff",
    borderRadius: "26px",
    border: "1px solid #e2e8f0",
    padding: "22px",
    boxSizing: "border-box",
    boxShadow: "0 24px 80px rgba(15,23,42,0.14)",
    display: "grid",
    gap: "16px",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },

  logo: {
    width: "54px",
    height: "54px",
    borderRadius: "18px",
    display: "grid",
    placeItems: "center",
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    fontSize: "28px",
    marginBottom: "8px",
  },

  title: {
    margin: 0,
    color: "#574866",
    fontSize: "30px",
    fontWeight: "950",
    letterSpacing: "-0.04em",
    lineHeight: 1,
  },

  subtitle: {
    margin: "6px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  loading: {
    textAlign: "center",
    color: "#64748b",
    padding: "30px",
    fontWeight: "800",
  },

  appointmentBox: {
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    background: "#fbfbfc",
    padding: "16px",
    display: "grid",
    gap: "10px",
  },

  label: {
    display: "block",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: "850",
  },

  patientName: {
    color: "#0f172a",
    fontSize: "22px",
    lineHeight: 1.15,
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },

  badgesRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "7px",
  },

  badge: {
    display: "inline-flex",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "12px",
    fontWeight: "900",
  },

  badgeOk: {
    display: "inline-flex",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "12px",
    fontWeight: "900",
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
  },

  badgePending: {
    display: "inline-flex",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "12px",
    fontWeight: "900",
    background: "#fff7ed",
    color: "#b45309",
    border: "1px solid #fed7aa",
  },

  badgeCancelada: {
    display: "inline-flex",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "12px",
    fontWeight: "900",
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
  },

  comment: {
    margin: 0,
    color: "#475569",
    fontSize: "13px",
    lineHeight: 1.45,
  },

  actionsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "10px",
  },

  confirmBtn: {
    background: "#0f7a4d",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "14px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "15px",
  },

  cancelBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "16px",
    padding: "14px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "15px",
  },

  reagendarBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "16px",
    padding: "14px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "15px",
  },

  panel: {
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    background: "#fbfbfc",
    padding: "14px",
    display: "grid",
    gap: "12px",
  },

  panelTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "18px",
    fontWeight: "950",
  },

  panelText: {
    margin: "3px 0 0 0",
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.35,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cfd9e5",
    borderRadius: "14px",
    padding: "12px",
    outline: "none",
    fontSize: "14px",
    background: "#fff",
    color: "#0f172a",
  },

  textarea: {
    width: "100%",
    minHeight: "90px",
    boxSizing: "border-box",
    border: "1px solid #cfd9e5",
    borderRadius: "14px",
    padding: "12px",
    outline: "none",
    fontSize: "14px",
    background: "#fff",
    color: "#0f172a",
    resize: "vertical",
  },

  cancelBtnFull: {
    background: "#be123c",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "13px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "14px",
  },

  reagendarHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
  },

  slotsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
    gap: "8px",
    maxHeight: "330px",
    overflowY: "auto",
    paddingRight: "2px",
  },

  slotBtn: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "10px",
    display: "grid",
    gap: "4px",
    cursor: "pointer",
    color: "#334155",
    textAlign: "left",
  },

  slotBtnActive: {
    border: "1px solid #7c3aed",
    background: "#f4f0f7",
    color: "#574866",
  },

  slotBtnFull: {
    opacity: 0.45,
    cursor: "not-allowed",
    background: "#f1f5f9",
  },

  reagendarBtnFull: {
    background: "#574866",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "13px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "14px",
  },

  successBox: {
    background: "#eefcf3",
    border: "1px solid #c7eed5",
    color: "#0f7a4d",
    borderRadius: "14px",
    padding: "12px",
    fontWeight: "900",
  },

  errorBox: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#be123c",
    borderRadius: "14px",
    padding: "12px",
    fontWeight: "900",
  },

  footerText: {
    margin: 0,
    color: "#64748b",
    fontSize: "12px",
    textAlign: "center",
    lineHeight: 1.35,
  },

  notifyBtn: {
    marginTop: "10px",
    width: "100%",
    background: "#0f7a4d",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    padding: "12px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "14px",
  },

  mondayWarning: {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#b45309",
    borderRadius: "14px",
    padding: "12px",
    fontWeight: "850",
    fontSize: "13px",
    lineHeight: 1.35,
    display: "grid",
    gap: "7px",
  },

  mondayWhatsBtn: {
    marginTop: "4px",
    width: "100%",
    background: "#0f7a4d",
    color: "#fff",
    border: "none",
    borderRadius: "13px",
    padding: "11px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "13px",
  },

  closedDayWarning: {
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    color: "#334155",
    borderRadius: "14px",
    padding: "12px",
    fontWeight: "850",
    fontSize: "13px",
    lineHeight: 1.35,
    display: "grid",
    gap: "7px",
  },

  cancelQuestionBox: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "12px",
    display: "grid",
    gap: "10px",
    color: "#334155",
  },

  cancelOptions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
  },

  cancelOptionBtn: {
    border: "1px solid #cfd9e5",
    background: "#fff",
    color: "#334155",
    borderRadius: "13px",
    padding: "11px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "13px",
  },

  cancelOptionBtnActive: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #86efac",
  },

  cancelOptionBtnActiveRed: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
  },

  changeDecisionBox: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1d4ed8",
    borderRadius: "14px",
    padding: "12px",
    fontWeight: "850",
    fontSize: "13px",
    lineHeight: 1.4,
  },
  resultCard: {
  width: "min(500px, 100%)",
  background: "#fff",
  borderRadius: "30px",
  padding: "32px",
  boxSizing: "border-box",
  border: "1px solid #e2e8f0",
  boxShadow: "0 24px 80px rgba(15,23,42,0.14)",
  display: "grid",
  gap: "18px",
  textAlign: "center",
},

resultIcon: {
  width: "90px",
  height: "90px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  fontSize: "42px",
  margin: "0 auto",
  fontWeight: "900",
},

resultTitle: {
  margin: 0,
  fontSize: "34px",
  fontWeight: "950",
  color: "#0f172a",
  lineHeight: 1,
},

resultText: {
  margin: 0,
  color: "#475569",
  fontSize: "16px",
  lineHeight: 1.5,
},

resultDetailBox: {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "18px",
  padding: "16px",
  color: "#334155",
  fontSize: "14px",
  lineHeight: 1.5,
  textAlign: "left",
},

resultButtons: {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  marginTop: "10px",
},

resultPrimaryBtn: {
  background: "#15803d",
  color: "#fff",
  border: "none",
  borderRadius: "16px",
  padding: "15px",
  cursor: "pointer",
  fontWeight: "950",
  fontSize: "15px",
},

resultSecondaryBtn: {
  background: "#f1f5f9",
  color: "#334155",
  border: "1px solid #cbd5e1",
  borderRadius: "16px",
  padding: "15px",
  cursor: "pointer",
  fontWeight: "950",
  fontSize: "15px",
},

};


export default ConfirmarCitaPublica;
