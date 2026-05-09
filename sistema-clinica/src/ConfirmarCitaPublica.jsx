import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function ConfirmarCitaPublica({ token }) {

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [tokenData, setTokenData] = useState(null);
  const [cita, setCita] = useState(null);
  const [citasFecha, setCitasFecha] = useState([]);

  const [accion, setAccion] = useState("");
  const [motivoCancelacion, setMotivoCancelacion] = useState("");

  const [fechaReagendar, setFechaReagendar] = useState(obtenerFechaSV());
  const [horaReagendar, setHoraReagendar] = useState("08:00");

  const horasDisponibles = useMemo(() => {
    const lista = [];

    for (let h = 6; h <= 20; h += 1) {
      ["00", "15", "30", "45"].forEach((m) => {
        lista.push(`${String(h).padStart(2, "0")}:${m}`);
      });
    }

    return lista;
  }, []);

  useEffect(() => {
    cargarCitaPublica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const cargarCitaPublica = async () => {
    if (!token) {
      setError("Enlace inválido.");
      setCargando(false);
      return;
    }

    setCargando(true);
    setError("");
    setMensaje("");

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
    setHoraReagendar(normalizarHora(citaEncontrada.hora) || "08:00");

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

    setMensaje("¡Gracias! Su cita ha sido confirmada.");
    await cargarCitaPublica();
  };

  const cancelarCita = async () => {
    if (!cita || !tokenData) return;

    if (!motivoCancelacion.trim()) {
      alert("Por favor escriba el motivo de cancelación.");
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
        desea_reprogramar: false,
      })
      .eq("id", cita.id)
      .eq("empresa_id", cita.empresa_id);

    setGuardando(false);

    if (errorUpdate) {
      console.error(errorUpdate);
      setError("No pudimos cancelar la cita. Por favor contacte a la clínica.");
      return;
    }

    setMensaje("Su cita fue cancelada. Gracias por avisarnos.");
    await cargarCitaPublica();
  };

  const reagendarCita = async () => {
    if (!cita || !tokenData) return;

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

    setMensaje("Su cita fue reagendada correctamente.");
    await cargarCitaPublica();
  };

  const info = leerServicio(cita?.servicio);

  if (cargando) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.loading}>Cargando cita...</div>
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

        {mensaje && <div style={styles.successBox}>{mensaje}</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

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

        {cita?.estado !== "cancelada" && (
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
              onClick={() => setAccion((prev) => (prev === "cancelar" ? "" : "cancelar"))}
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

        {accion === "cancelar" && cita?.estado !== "cancelada" && (
          <div style={styles.panel}>
            <label style={styles.label}>Motivo de cancelación</label>
            <textarea
              style={styles.textarea}
              value={motivoCancelacion}
              onChange={(e) => setMotivoCancelacion(e.target.value)}
              placeholder="Escriba el motivo de cancelación..."
            />

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

        {accion === "reagendar" && cita?.estado !== "cancelada" && (
          <div style={styles.panel}>
            <div style={styles.reagendarHeader}>
              <div>
                <h3 style={styles.panelTitle}>Reagendar cita</h3>
                <p style={styles.panelText}>
                  Seleccione fecha y bloque de 15 minutos. Máximo 4 pacientes por bloque.
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

            <div style={styles.slotsGrid}>
              {horasDisponibles.map((horaItem) => {
                const cantidad = contarCitasEnBloque(horaItem);
                const lleno = cantidad >= 4;
                const activo = horaReagendar === horaItem;

                return (
                  <button
                    key={horaItem}
                    type="button"
                    style={{
                      ...styles.slotBtn,
                      ...(activo ? styles.slotBtnActive : {}),
                      ...(lleno ? styles.slotBtnFull : {}),
                    }}
                    disabled={lleno}
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
};

export default ConfirmarCitaPublica;
