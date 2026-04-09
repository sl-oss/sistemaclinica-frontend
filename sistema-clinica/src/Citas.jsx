import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function Citas() {
  const [citas, setCitas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [bloqueos, setBloqueos] = useState([]);
  const [citasDelDia, setCitasDelDia] = useState([]);

  const [clienteSeleccionado, setClienteSeleccionado] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [servicio, setServicio] = useState("");

  const [citaEditando, setCitaEditando] = useState(null);

  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activas");

  const [bloqueoFecha, setBloqueoFecha] = useState("");
  const [bloqueoInicio, setBloqueoInicio] = useState("");
  const [bloqueoFin, setBloqueoFin] = useState("");

  const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState("");
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  const empresa = JSON.parse(localStorage.getItem("empresa") || "null");
  const [esMovil, setEsMovil] = useState(window.innerWidth < 900);

  const horarios = [
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
    "17:30",
  ];

  const normalizarHora = (horaTexto) => {
    if (!horaTexto) return "";
    return String(horaTexto).slice(0, 5);
  };

  useEffect(() => {
    const onResize = () => setEsMovil(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!empresa) return;

    const hoy = new Date();
    const hoyTexto = formatearFechaLocal(hoy);

    const fin = new Date();
    fin.setDate(hoy.getDate() + 7);

    setFiltroDesde(hoyTexto);
    setFiltroHasta(formatearFechaLocal(fin));

    obtenerClientes();
  }, []);

  useEffect(() => {
    if (!empresa) return;
    if (!filtroDesde || !filtroHasta) return;
    obtenerCitas();
  }, [empresa, filtroDesde, filtroHasta, filtroEstado]);

  useEffect(() => {
    if (!empresa || !fecha) return;
    refrescarDia(fecha);
  }, [empresa, fecha]);

  const formatearFechaLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const esDiaValido = (fechaTexto) => {
    if (!fechaTexto) return false;
    const [y, m, d] = fechaTexto.split("-").map(Number);
    const fechaObj = new Date(y, m - 1, d);
    const dia = fechaObj.getDay();
    return dia !== 0 && dia !== 1;
  };

  const manejarCambioFecha = (valor, setter) => {
    if (!valor) {
      setter("");
      return;
    }

    if (!esDiaValido(valor)) {
      alert("No se atiende domingos ni lunes");
      setter("");
      return;
    }

    setter(valor);
  };

  const obtenerClientes = async () => {
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setClientes(data || []);
  };

  const abrirModalCliente = () => {
    setNuevoClienteNombre("");
    setNuevoClienteTelefono("");
    setMostrarModalCliente(true);
  };

  const cerrarModalCliente = () => {
    if (guardandoCliente) return;
    setMostrarModalCliente(false);
    setNuevoClienteNombre("");
    setNuevoClienteTelefono("");
  };

  const guardarNuevoCliente = async () => {
    if (!empresa) return alert("No hay empresa seleccionada");
    if (!nuevoClienteNombre.trim()) {
      return alert("Debes ingresar el nombre del cliente");
    }

    setGuardandoCliente(true);

    const { data, error } = await supabase
      .from("clientes")
      .insert([
        {
          empresa_id: empresa.id,
          nombre: nuevoClienteNombre.trim(),
          telefono: nuevoClienteTelefono.trim() || null,
        },
      ])
      .select()
      .single();

    setGuardandoCliente(false);

    if (error) {
      console.error(error);
      return alert("Error al guardar cliente");
    }

    await obtenerClientes();
    setClienteSeleccionado(data.id);
    cerrarModalCliente();
  };

  const obtenerCitas = async () => {
    let query = supabase
      .from("citas")
      .select("*, clientes(nombre, telefono)")
      .eq("empresa_id", empresa.id)
      .gte("fecha", filtroDesde)
      .lte("fecha", filtroHasta)
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true });

    if (filtroEstado === "activas") {
      query = query.neq("estado", "cancelada");
    } else if (filtroEstado === "canceladas") {
      query = query.eq("estado", "cancelada");
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return;
    }

    setCitas(data || []);
  };

  const obtenerCitasDelDia = async (fechaConsulta) => {
    const { data, error } = await supabase
      .from("citas")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("fecha", fechaConsulta)
      .neq("estado", "cancelada")
      .order("hora", { ascending: true });

    if (error) {
      console.error(error);
      return [];
    }

    setCitasDelDia(data || []);
    return data || [];
  };

  const obtenerBloqueos = async (fechaConsulta) => {
    const { data, error } = await supabase
      .from("bloqueos")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("fecha", fechaConsulta)
      .order("hora", { ascending: true });

    if (error) {
      console.error(error);
      return [];
    }

    setBloqueos(data || []);
    return data || [];
  };

  const obtenerCitasActivasPorFecha = async (fechaConsulta, citaExcluirId = null) => {
    const { data, error } = await supabase
      .from("citas")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("fecha", fechaConsulta)
      .neq("estado", "cancelada")
      .order("hora", { ascending: true });

    if (error) {
      console.error(error);
      return [];
    }

    return (data || []).filter((c) => {
      if (citaExcluirId && c.id === citaExcluirId) return false;
      return true;
    });
  };

  const obtenerBloqueosPorFecha = async (fechaConsulta) => {
    const { data, error } = await supabase
      .from("bloqueos")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("fecha", fechaConsulta)
      .order("hora", { ascending: true });

    if (error) {
      console.error(error);
      return [];
    }

    return data || [];
  };

  const refrescarDia = async (fechaConsulta) => {
    await Promise.all([
      obtenerBloqueos(fechaConsulta),
      obtenerCitasDelDia(fechaConsulta),
    ]);
  };

  const horasOcupadas = useMemo(() => {
    if (!fecha) return [];

    const desdeListadoGeneral = citas
      .filter((c) => {
        if (c.estado === "cancelada") return false;
        if (c.fecha !== fecha) return false;
        if (citaEditando && c.id === citaEditando) return false;
        return true;
      })
      .map((c) => normalizarHora(c.hora));

    const desdeCitasDelDia = citasDelDia
      .filter((c) => {
        if (c.estado === "cancelada") return false;
        if (citaEditando && c.id === citaEditando) return false;
        return true;
      })
      .map((c) => normalizarHora(c.hora));

    return [...new Set([...desdeListadoGeneral, ...desdeCitasDelDia])];
  }, [fecha, citas, citasDelDia, citaEditando]);

  const horasDisponibles = useMemo(() => {
    if (!fecha) return [];

    return horarios.filter((h) => {
      const bloqueada = bloqueos.some((b) => normalizarHora(b.hora) === h);
      const ocupada = horasOcupadas.includes(h);
      return !bloqueada && !ocupada;
    });
  }, [fecha, bloqueos, horasOcupadas]);

  useEffect(() => {
    if (!hora) return;
    if (!horasDisponibles.includes(normalizarHora(hora))) {
      setHora("");
    }
  }, [horasDisponibles, hora]);

  const guardarCita = async () => {
    if (!clienteSeleccionado || !fecha || !hora) {
      return alert("Completa los campos");
    }

    if (!esDiaValido(fecha)) {
      return alert("No se atiende domingos ni lunes");
    }

    if (horasOcupadas.includes(normalizarHora(hora))) {
      return alert("Esa hora ya está ocupada");
    }

    if (citaEditando) {
      const { error } = await supabase
        .from("citas")
        .update({
          cliente_id: clienteSeleccionado,
          fecha,
          hora: normalizarHora(hora),
          servicio,
        })
        .eq("id", citaEditando);

      if (error) {
        console.error(error);
        if (error.code === "23505") {
          return alert("Hora de cita ocupada, seleccione otra ⌚");
        }
        return alert("Error al actualizar cita");
      }

      setCitaEditando(null);
    } else {
      const { error } = await supabase.from("citas").insert([
        {
          empresa_id: empresa.id,
          cliente_id: clienteSeleccionado,
          fecha,
          hora: normalizarHora(hora),
          servicio,
          estado: "pendiente",
          confirmada: false,
        },
      ]);

      if (error) {
        console.error(error);
        if (error.code === "23505") {
          return alert("Hora de cita ocupada, seleccione otra ⌚");
        }
        return alert("Error al guardar cita");
      }
    }

    const fechaActual = fecha;
    limpiarFormulario();
    await obtenerCitas();
    await refrescarDia(fechaActual);
  };

  const limpiarFormulario = () => {
    setClienteSeleccionado("");
    setFecha("");
    setHora("");
    setServicio("");
    setCitaEditando(null);
  };

  const editarCita = async (c) => {
    setClienteSeleccionado(c.cliente_id || "");
    setFecha(c.fecha || "");
    setHora(normalizarHora(c.hora) || "");
    setServicio(c.servicio || "");
    setCitaEditando(c.id);

    if (c.fecha) {
      await refrescarDia(c.fecha);
    }
  };

  const cancelarCita = async (cita) => {
    const motivo = prompt("Motivo de cancelación:");
    if (!motivo || !motivo.trim()) {
      return alert("Debes escribir el motivo de cancelación");
    }

    const quiereReprogramar = window.confirm(
      "¿Desea reprogramar esta cita?\nAceptar = Sí / Cancelar = No"
    );

    let nuevaFecha = null;
    let nuevaHora = null;

    if (quiereReprogramar) {
      nuevaFecha = prompt("Ingrese la nueva fecha (YYYY-MM-DD):", cita.fecha || "");
      if (!nuevaFecha) {
        return alert("Debes ingresar la nueva fecha");
      }

      if (!esDiaValido(nuevaFecha)) {
        return alert("No se atiende domingos ni lunes");
      }

      const citasNuevaFecha = await obtenerCitasActivasPorFecha(nuevaFecha, cita.id);
      const bloqueosNuevaFecha = await obtenerBloqueosPorFecha(nuevaFecha);

      const horasOcupadasReprogramacion = [
        ...new Set(citasNuevaFecha.map((c) => normalizarHora(c.hora))),
      ];

      const horasDisponiblesReprogramacion = horarios.filter((h) => {
        const bloqueada = bloqueosNuevaFecha.some(
          (b) => normalizarHora(b.hora) === h
        );
        const ocupada = horasOcupadasReprogramacion.includes(h);
        return !bloqueada && !ocupada;
      });

      if (horasDisponiblesReprogramacion.length === 0) {
        return alert("No hay horas disponibles para esa fecha");
      }

      nuevaHora = prompt(
        `Ingrese la nueva hora disponible:\n${horasDisponiblesReprogramacion.join(", ")}`,
        horasDisponiblesReprogramacion[0]
      );

      if (!nuevaHora) {
        return alert("Debes ingresar la nueva hora");
      }

      nuevaHora = normalizarHora(nuevaHora);

      if (!horarios.includes(nuevaHora)) {
        return alert("La hora ingresada no es válida");
      }

      if (horasOcupadasReprogramacion.includes(nuevaHora)) {
        return alert("Esa hora ya está ocupada");
      }

      const bloqueada = bloqueosNuevaFecha.some(
        (b) => normalizarHora(b.hora) === nuevaHora
      );

      if (bloqueada) {
        return alert("Esa hora está bloqueada");
      }
    }

    const { error } = await supabase
      .from("citas")
      .update({
        estado: "cancelada",
        motivo_cancelacion: motivo.trim(),
        desea_reprogramar: quiereReprogramar,
        fecha_reprogramada: nuevaFecha,
        hora_reprogramada: nuevaHora,
      })
      .eq("id", cita.id);

    if (error) {
      console.error(error);
      return alert("Error al cancelar cita");
    }

    if (quiereReprogramar && nuevaFecha && nuevaHora) {
      const { error: errorNueva } = await supabase.from("citas").insert([
        {
          empresa_id: cita.empresa_id,
          cliente_id: cita.cliente_id,
          fecha: nuevaFecha,
          hora: nuevaHora,
          servicio: cita.servicio,
          estado: "pendiente",
          confirmada: false,
        },
      ]);

      if (errorNueva) {
        console.error(errorNueva);
        return alert("Se canceló la cita, pero hubo error al reprogramarla");
      }
    }

    await obtenerCitas();
    if (fecha) await refrescarDia(fecha);

    alert(
      quiereReprogramar
        ? "Cita cancelada y reprogramada correctamente"
        : "Cita cancelada correctamente"
    );
  };

  const confirmarCita = async (id, confirmadaActual) => {
    const { error } = await supabase
      .from("citas")
      .update({ confirmada: !confirmadaActual })
      .eq("id", id);

    if (error) {
      console.error(error);
      return alert("Error al confirmar cita");
    }

    await obtenerCitas();
  };

  const atender = async (cita) => {
    localStorage.setItem("citaActiva", JSON.stringify(cita));

    const { error } = await supabase
      .from("citas")
      .update({ estado: "atendida" })
      .eq("id", cita.id);

    if (error) {
      console.error(error);
      return alert("Error al atender cita");
    }

    await obtenerCitas();
    if (fecha) await refrescarDia(fecha);
    window.dispatchEvent(new Event("irAVenta"));
  };

  const bloquearIntervalo = async () => {
    if (!bloqueoFecha || !bloqueoInicio || !bloqueoFin) {
      return alert("Completa fecha, hora inicio y hora fin");
    }

    if (!esDiaValido(bloqueoFecha)) {
      return alert("No se atiende domingos ni lunes");
    }

    const motivo = prompt("Motivo del bloqueo:");
    if (!motivo) return;

    const idxInicio = horarios.indexOf(bloqueoInicio);
    const idxFin = horarios.indexOf(bloqueoFin);

    if (idxInicio === -1 || idxFin === -1 || idxFin < idxInicio) {
      return alert("Intervalo inválido");
    }

    const horasABloquear = horarios.slice(idxInicio, idxFin + 1);

    const registros = horasABloquear.map((h) => ({
      empresa_id: empresa.id,
      fecha: bloqueoFecha,
      hora: h,
      motivo,
    }));

    const { error } = await supabase.from("bloqueos").insert(registros);

    if (error) {
      console.error(error);
      return alert("Error al bloquear horas");
    }

    if (bloqueoFecha === fecha) {
      await refrescarDia(fecha);
    }

    setBloqueoInicio("");
    setBloqueoFin("");
    alert("Bloqueo guardado");
  };

  const eliminarBloqueo = async (id) => {
    const { error } = await supabase.from("bloqueos").delete().eq("id", id);

    if (error) {
      console.error(error);
      return alert("Error al eliminar bloqueo");
    }

    if (fecha) {
      await refrescarDia(fecha);
    }
    if (bloqueoFecha) {
      await obtenerBloqueos(bloqueoFecha);
    }
  };

  const aplicarFiltroRapido = (tipo) => {
    const hoy = new Date();

    if (tipo === "hoy") {
      const f = formatearFechaLocal(hoy);
      setFiltroDesde(f);
      setFiltroHasta(f);
      return;
    }

    if (tipo === "mañana") {
      const manana = new Date();
      manana.setDate(hoy.getDate() + 1);
      const f = formatearFechaLocal(manana);
      setFiltroDesde(f);
      setFiltroHasta(f);
      return;
    }

    if (tipo === "semana") {
      const desde = formatearFechaLocal(hoy);
      const hasta = new Date();
      hasta.setDate(hoy.getDate() + 7);
      setFiltroDesde(desde);
      setFiltroHasta(formatearFechaLocal(hasta));
      return;
    }

    if (tipo === "todo") {
      const desde = new Date();
      desde.setDate(hoy.getDate() - 30);
      const hasta = new Date();
      hasta.setDate(hoy.getDate() + 30);

      setFiltroDesde(formatearFechaLocal(desde));
      setFiltroHasta(formatearFechaLocal(hasta));
    }
  };

  if (!empresa) {
    return <div>No hay empresa seleccionada</div>;
  }

  return (
    <>
      <div style={styles.page}>
        <h2 style={styles.titulo}>📅 Citas</h2>

        <div
          style={{
            ...styles.layout,
            gridTemplateColumns: esMovil ? "1fr" : "380px minmax(0, 1fr)",
          }}
        >
          <div style={styles.leftColumn}>
            <div style={styles.card}>
              <h3 style={styles.subtitulo}>
                {citaEditando ? "✏️ Editar cita" : "➕ Nueva cita"}
              </h3>

              <div style={styles.grid}>
                <div style={styles.clienteRow}>
                  <select
                    style={{ ...styles.input, marginBottom: 0 }}
                    value={clienteSeleccionado}
                    onChange={(e) => setClienteSeleccionado(e.target.value)}
                  >
                    <option value="">Cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    style={styles.btnNuevoCliente}
                    onClick={abrirModalCliente}
                  >
                    + Cliente
                  </button>
                </div>

                <input
                  style={styles.input}
                  type="date"
                  value={fecha}
                  onChange={(e) => manejarCambioFecha(e.target.value, setFecha)}
                />

                <select
                  key={`${fecha}-${citaEditando || "nueva"}-${horasDisponibles.join("|")}`}
                  style={styles.input}
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  disabled={!fecha}
                >
                  <option value="">
                    {fecha ? "Hora" : "Primero selecciona fecha"}
                  </option>
                  {horasDisponibles.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>

                <input
                  style={styles.input}
                  placeholder="Servicio"
                  value={servicio}
                  onChange={(e) => setServicio(e.target.value)}
                />
              </div>

              <div style={styles.rowButtons}>
                <button style={styles.btnGuardar} onClick={guardarCita}>
                  {citaEditando ? "Actualizar" : "Guardar"}
                </button>

                <button style={styles.btnSecundario} onClick={limpiarFormulario}>
                  Limpiar
                </button>
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.subtitulo}>⛔ Bloquear horario</h3>

              <div style={styles.grid}>
                <input
                  style={styles.input}
                  type="date"
                  value={bloqueoFecha}
                  onChange={(e) =>
                    manejarCambioFecha(e.target.value, setBloqueoFecha)
                  }
                />

                <select
                  style={styles.input}
                  value={bloqueoInicio}
                  onChange={(e) => setBloqueoInicio(e.target.value)}
                >
                  <option value="">Desde</option>
                  {horarios.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>

                <select
                  style={styles.input}
                  value={bloqueoFin}
                  onChange={(e) => setBloqueoFin(e.target.value)}
                >
                  <option value="">Hasta</option>
                  {horarios.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <button style={styles.btnBloqueo} onClick={bloquearIntervalo}>
                ⛔ Bloquear intervalo
              </button>

              {bloqueoFecha && bloqueos.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <strong>Bloqueos de la fecha elegida:</strong>
                  {bloqueos.map((b) => (
                    <div key={b.id} style={styles.bloqueoRow}>
                      <span style={styles.bloqueoText}>
                        {normalizarHora(b.hora)} - {b.motivo}
                      </span>
                      <button
                        style={styles.deleteBloqueoBtn}
                        onClick={() => eliminarBloqueo(b.id)}
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.card}>
              <h3 style={styles.subtitulo}>🔎 Buscar citas por fecha</h3>

              <div style={styles.grid}>
                <input
                  style={styles.input}
                  type="date"
                  value={filtroDesde}
                  onChange={(e) =>
                    manejarCambioFecha(e.target.value, setFiltroDesde)
                  }
                />

                <input
                  style={styles.input}
                  type="date"
                  value={filtroHasta}
                  onChange={(e) =>
                    manejarCambioFecha(e.target.value, setFiltroHasta)
                  }
                />

                <select
                  style={styles.input}
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                >
                  <option value="activas">Solo activas</option>
                  <option value="canceladas">Solo canceladas</option>
                  <option value="todas">Todas</option>
                </select>
              </div>

              <div style={styles.quickFilters}>
                <button
                  style={styles.btnSecundario}
                  onClick={() => aplicarFiltroRapido("hoy")}
                >
                  Hoy
                </button>
                <button
                  style={styles.btnSecundario}
                  onClick={() => aplicarFiltroRapido("mañana")}
                >
                  Mañana
                </button>
                <button
                  style={styles.btnSecundario}
                  onClick={() => aplicarFiltroRapido("semana")}
                >
                  Semana
                </button>
                <button
                  style={styles.btnSecundario}
                  onClick={() => aplicarFiltroRapido("todo")}
                >
                  Todas
                </button>
              </div>

              <button style={styles.btnSecundario} onClick={obtenerCitas}>
                Filtrar
              </button>
            </div>
          </div>

          <div style={styles.rightColumn}>
            <div style={styles.card}>
              <h3 style={styles.subtitulo}>📌 Citas encontradas</h3>

              {citas.length === 0 && <p>No hay citas en ese rango.</p>}

              <div
                style={{
                  ...styles.citasGrid,
                  gridTemplateColumns: esMovil
                    ? "1fr"
                    : "repeat(auto-fill, minmax(280px, 1fr))",
                }}
              >
                {citas.map((c) => (
                  <div key={c.id} style={styles.citaCard}>
                    <strong style={{ fontSize: 18 }}>{c.clientes?.nombre}</strong>
                    <div>📞 {c.clientes?.telefono || "Sin teléfono"}</div>
                    <div>
                      📅 {c.fecha} - {normalizarHora(c.hora)}
                    </div>
                    <div style={{ wordBreak: "break-word" }}>{c.servicio}</div>
                    <div>
                      Estado: {c.estado}
                      {c.confirmada ? " | ✅ Confirmada" : " | ⏳ Sin confirmar"}
                    </div>

                    {c.estado === "cancelada" && (
                      <div style={styles.canceladaInfo}>
                        <div>
                          <strong>Motivo:</strong>{" "}
                          {c.motivo_cancelacion || "Sin motivo"}
                        </div>

                        {c.desea_reprogramar &&
                          c.fecha_reprogramada &&
                          c.hora_reprogramada && (
                            <div>
                              <strong>Reprogramada para:</strong>{" "}
                              {c.fecha_reprogramada} -{" "}
                              {normalizarHora(c.hora_reprogramada)}
                            </div>
                          )}
                      </div>
                    )}

                    <div style={styles.actions}>
                      {c.estado !== "cancelada" && (
                        <>
                          <button
                            style={styles.iconBtn}
                            onClick={() => editarCita(c)}
                          >
                            ✏️
                          </button>
                          <button
                            style={styles.iconBtn}
                            onClick={() => cancelarCita(c)}
                          >
                            ❌
                          </button>
                          <button
                            style={styles.iconBtn}
                            onClick={() => atender(c)}
                          >
                            🦷
                          </button>
                          <button
                            style={styles.iconBtn}
                            onClick={() => confirmarCita(c.id, c.confirmada)}
                          >
                            {c.confirmada ? "✅" : "✔"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {mostrarModalCliente && (
        <div style={styles.modalOverlay} onClick={cerrarModalCliente}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>👤 Nuevo cliente</h3>
              <button
                type="button"
                style={styles.btnCerrarModal}
                onClick={cerrarModalCliente}
              >
                ✖
              </button>
            </div>

            <input
              style={styles.input}
              placeholder="Nombre del cliente"
              value={nuevoClienteNombre}
              onChange={(e) => setNuevoClienteNombre(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Teléfono"
              value={nuevoClienteTelefono}
              onChange={(e) => setNuevoClienteTelefono(e.target.value)}
            />

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.btnGuardarModal}
                onClick={guardarNuevoCliente}
                disabled={guardandoCliente}
              >
                {guardandoCliente ? "Guardando..." : "Guardar cliente"}
              </button>

              <button
                type="button"
                style={styles.btnCancelarModal}
                onClick={cerrarModalCliente}
                disabled={guardandoCliente}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  page: {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
  },
  titulo: {
    marginBottom: 16,
  },
  layout: {
    display: "grid",
    gap: 20,
    alignItems: "start",
    width: "100%",
  },
  leftColumn: {
    minWidth: 0,
    width: "100%",
  },
  rightColumn: {
    minWidth: 0,
    width: "100%",
  },
  card: {
    background: "#f8fafc",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    border: "1px solid #e5e7eb",
    width: "100%",
    boxSizing: "border-box",
  },
  subtitulo: {
    marginBottom: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    marginBottom: 12,
    width: "100%",
  },
  clienteRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 8,
    alignItems: "stretch",
    width: "100%",
  },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    boxSizing: "border-box",
  },
  btnNuevoCliente: {
    padding: "10px 14px",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  rowButtons: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  quickFilters: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  btnGuardar: {
    padding: "10px 16px",
    background: "#10b981",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  btnSecundario: {
    padding: "10px 16px",
    background: "#e5e7eb",
    color: "#111827",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  btnBloqueo: {
    padding: "10px 16px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  bloqueoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    padding: "6px 8px",
    background: "white",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
  },
  bloqueoText: {
    fontSize: 13,
    wordBreak: "break-word",
  },
  deleteBloqueoBtn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
  },
  citasGrid: {
    display: "grid",
    gap: 12,
    width: "100%",
  },
  citaCard: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 12,
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
  },
  canceladaInfo: {
    marginTop: 8,
    fontSize: 14,
    color: "#991b1b",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: 8,
  },
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  iconBtn: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 9999,
  },
  modal: {
    width: "100%",
    maxWidth: "420px",
    background: "#fff",
    borderRadius: "14px",
    padding: "18px",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  btnCerrarModal: {
    background: "#e2e8f0",
    border: "none",
    borderRadius: "8px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "700",
  },
  modalActions: {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
    marginTop: "8px",
  },
  btnGuardarModal: {
    background: "#10b981",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
  btnCancelarModal: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
};

export default Citas;