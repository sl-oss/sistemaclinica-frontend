import { useEffect, useMemo, useRef, useState } from "react";
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
  const [filtroEstado, setFiltroEstado] = useState("pendientes");

  const [bloqueoFecha, setBloqueoFecha] = useState("");
  const [bloqueoInicio, setBloqueoInicio] = useState("");
  const [bloqueoFin, setBloqueoFin] = useState("");

  const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState("");
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  const [cargandoCitas, setCargandoCitas] = useState(false);
  const [busquedaInicialAplicada, setBusquedaInicialAplicada] = useState(false);

  const ultimaConsultaRef = useRef("");

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

  const formatearFechaPantalla = (fechaTexto) => {
    if (!fechaTexto) return "";
    const [yyyy, mm, dd] = String(fechaTexto).slice(0, 10).split("-");
    if (!yyyy || !mm || !dd) return fechaTexto;
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatearFechaSV = (date = new Date()) => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/El_Salvador",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };

  const sumarDiasSV = (fechaBaseTexto, dias) => {
    const [y, m, d] = fechaBaseTexto.split("-").map(Number);
    const fecha = new Date(y, m - 1, d);
    fecha.setDate(fecha.getDate() + dias);
    return formatearFechaSV(fecha);
  };

  const manejarCambioFecha = (valor, setter) => {
    setter(valor || "");
  };

  useEffect(() => {
    const onResize = () => setEsMovil(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!empresa) return;

    const hoySV = formatearFechaSV(new Date());
    const finSV = sumarDiasSV(hoySV, 7);

    setFiltroDesde((prev) => prev || hoySV);
    setFiltroHasta((prev) => prev || finSV);

    obtenerClientes();
  }, [empresa]);

  useEffect(() => {
    if (!empresa) return;
    if (!filtroDesde || !filtroHasta) return;
    if (filtroDesde > filtroHasta) return;

    const timer = setTimeout(() => {
      obtenerCitas();
      setBusquedaInicialAplicada(true);
    }, busquedaInicialAplicada ? 250 : 0);

    return () => clearTimeout(timer);
  }, [empresa, filtroDesde, filtroHasta, filtroEstado]);

  useEffect(() => {
    if (!empresa || !fecha) return;
    refrescarDia(fecha);
  }, [empresa, fecha]);

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
    if (!empresa?.id || !filtroDesde || !filtroHasta) return;

    const firmaConsulta = `${empresa.id}|${filtroDesde}|${filtroHasta}|${filtroEstado}`;
    if (ultimaConsultaRef.current === firmaConsulta && cargandoCitas) return;

    ultimaConsultaRef.current = firmaConsulta;
    setCargandoCitas(true);

    let query = supabase
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
        clientes (
          nombre,
          telefono
        )
      `)
      .eq("empresa_id", empresa.id)
      .gte("fecha", filtroDesde)
      .lte("fecha", filtroHasta)
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true });

    if (filtroEstado === "pendientes") {
      query = query.eq("estado", "pendiente");
    } else if (filtroEstado === "atendidas") {
      query = query.eq("estado", "atendida");
    } else if (filtroEstado === "canceladas_sin_reprogramacion") {
      query = query.eq("estado", "cancelada").eq("desea_reprogramar", false);
    } else if (filtroEstado === "canceladas") {
      query = query.eq("estado", "cancelada");
    }

    const { data, error } = await query;

    setCargandoCitas(false);

    if (error) {
      console.error(error);
      return;
    }

    const filtradas = (data || []).filter((c) => {
      if (filtroEstado === "canceladas_sin_reprogramacion") {
        return !c.desea_reprogramar;
      }
      return true;
    });

    setCitas(filtradas);
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

  const horasBloqueadas = useMemo(() => {
    if (!fecha) return [];
    return [...new Set(bloqueos.map((b) => normalizarHora(b.hora)))];
  }, [fecha, bloqueos]);

  const horasDisponibles = useMemo(() => {
    if (!fecha) return [];
    return horarios.filter((h) => !horasBloqueadas.includes(h));
  }, [fecha, horasBloqueadas]);

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

    if (!horasDisponibles.includes(normalizarHora(hora))) {
      return alert("Esa hora está bloqueada");
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

      const bloqueosNuevaFecha = await obtenerBloqueosPorFecha(nuevaFecha);

      const horasDisponiblesReprogramacion = horarios.filter((h) => {
        const bloqueada = bloqueosNuevaFecha.some(
          (b) => normalizarHora(b.hora) === h
        );
        return !bloqueada;
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

    if (bloqueoFecha) {
      await obtenerBloqueos(bloqueoFecha);
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
    const hoySV = formatearFechaSV(new Date());

    if (tipo === "hoy") {
      setFiltroDesde(hoySV);
      setFiltroHasta(hoySV);
      return;
    }

    if (tipo === "mañana") {
      const mananaSV = sumarDiasSV(hoySV, 1);
      setFiltroDesde(mananaSV);
      setFiltroHasta(mananaSV);
      return;
    }

    if (tipo === "semana") {
      setFiltroDesde(hoySV);
      setFiltroHasta(sumarDiasSV(hoySV, 7));
      return;
    }

    if (tipo === "todo") {
      setFiltroDesde(sumarDiasSV(hoySV, -30));
      setFiltroHasta(sumarDiasSV(hoySV, 30));
    }
  };

  const obtenerTituloReporte = () => {
    if (filtroEstado === "pendientes") return "Citas Pendientes";
    if (filtroEstado === "atendidas") return "Citas Atendidas";
    if (filtroEstado === "canceladas_sin_reprogramacion") {
      return "Citas Canceladas sin Reprogramación";
    }
    if (filtroEstado === "canceladas") return "Citas Canceladas";
    return "Reporte General de Citas";
  };

  const obtenerNombreArchivoReporte = () => {
    if (filtroEstado === "pendientes") return "Citas_Pendientes";
    if (filtroEstado === "atendidas") return "Citas_Atendidas";
    if (filtroEstado === "canceladas_sin_reprogramacion") {
      return "Citas_Canceladas_Sin_Reprogramacion";
    }
    if (filtroEstado === "canceladas") return "Citas_Canceladas";
    return "Reporte_Citas";
  };

  const obtenerFilasReporte = () => {
    return citas.map((c) => ({
      Fecha: formatearFechaPantalla(c.fecha),
      Hora: normalizarHora(c.hora),
      Cliente: c.clientes?.nombre || "Sin nombre",
      Telefono: c.clientes?.telefono || "",
      Servicio: c.servicio || "",
      Estado: c.estado || "",
      Confirmada: c.confirmada ? "Sí" : "No",
      "Motivo cancelación": c.motivo_cancelacion || "",
      Reprogramada: c.desea_reprogramar ? "Sí" : "No",
      "Nueva fecha": c.fecha_reprogramada
        ? formatearFechaPantalla(c.fecha_reprogramada)
        : "",
      "Nueva hora": c.hora_reprogramada
        ? normalizarHora(c.hora_reprogramada)
        : "",
    }));
  };

  const exportarExcel = async () => {
    if (citas.length === 0) {
      return alert("No hay citas para exportar");
    }

    const XLSX = await import("xlsx");

    const titulo = obtenerTituloReporte();
    const nombreArchivo = obtenerNombreArchivoReporte();

    const encabezado = [
      {
        Fecha: empresa?.nombre || "Empresa activa",
        Hora: "",
        Cliente: "",
        Telefono: "",
        Servicio: "",
        Estado: "",
        Confirmada: "",
        "Motivo cancelación": "",
        Reprogramada: "",
        "Nueva fecha": "",
        "Nueva hora": "",
      },
      {
        Fecha: titulo,
        Hora: "",
        Cliente: "",
        Telefono: "",
        Servicio: "",
        Estado: "",
        Confirmada: "",
        "Motivo cancelación": "",
        Reprogramada: "",
        "Nueva fecha": "",
        "Nueva hora": "",
      },
      {
        Fecha: `Período: ${formatearFechaPantalla(filtroDesde)} al ${formatearFechaPantalla(filtroHasta)}`,
        Hora: "",
        Cliente: "",
        Telefono: "",
        Servicio: "",
        Estado: "",
        Confirmada: "",
        "Motivo cancelación": "",
        Reprogramada: "",
        "Nueva fecha": "",
        "Nueva hora": "",
      },
      {
        Fecha: "",
        Hora: "",
        Cliente: "",
        Telefono: "",
        Servicio: "",
        Estado: "",
        Confirmada: "",
        "Motivo cancelación": "",
        Reprogramada: "",
        "Nueva fecha": "",
        "Nueva hora": "",
      },
    ];

    const rows = [...encabezado, ...obtenerFilasReporte()];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Citas");

    XLSX.writeFile(
      wb,
      `${nombreArchivo}_${filtroDesde}_a_${filtroHasta}.xlsx`
    );
  };

  const exportarPDF = async () => {
    if (citas.length === 0) {
      return alert("No hay citas para exportar");
    }

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const titulo = obtenerTituloReporte();
    const nombreArchivo = obtenerNombreArchivoReporte();

    const doc = new jsPDF("landscape");

    doc.setFontSize(16);
    doc.text(titulo, 14, 15);

    doc.setFontSize(11);
    doc.text(`Empresa: ${empresa?.nombre || "Empresa activa"}`, 14, 22);
    doc.text(
      `Período: ${formatearFechaPantalla(filtroDesde)} al ${formatearFechaPantalla(filtroHasta)}`,
      14,
      28
    );

    autoTable(doc, {
      startY: 34,
      head: [[
        "Fecha",
        "Hora",
        "Cliente",
        "Teléfono",
        "Servicio",
        "Estado",
        "Confirmada",
        "Motivo cancelación",
        "Reprogramada",
        "Nueva fecha",
        "Nueva hora",
      ]],
      body: citas.map((c) => [
        formatearFechaPantalla(c.fecha),
        normalizarHora(c.hora),
        c.clientes?.nombre || "Sin nombre",
        c.clientes?.telefono || "",
        c.servicio || "",
        c.estado || "",
        c.confirmada ? "Sí" : "No",
        c.motivo_cancelacion || "",
        c.desea_reprogramar ? "Sí" : "No",
        c.fecha_reprogramada ? formatearFechaPantalla(c.fecha_reprogramada) : "",
        c.hora_reprogramada ? normalizarHora(c.hora_reprogramada) : "",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [39, 67, 98] },
    });

    doc.save(`${nombreArchivo}_${filtroDesde}_a_${filtroHasta}.pdf`);
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
                  <option value="pendientes">Citas pendientes</option>
                  <option value="atendidas">Citas atendidas</option>
                  <option value="canceladas_sin_reprogramacion">
                    Canceladas sin reprogramación
                  </option>
                  <option value="canceladas">Todas las canceladas</option>
                  <option value="todas">Todas</option>
                </select>

                {filtroDesde && filtroHasta && filtroDesde > filtroHasta && (
                  <div style={{ color: "#b91c1c", fontSize: 14, marginTop: -4 }}>
                    La fecha "desde" no puede ser mayor que la fecha "hasta".
                  </div>
                )}
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

              <div style={styles.reportRow}>
                <button style={styles.btnSecundario} onClick={obtenerCitas}>
                  Filtrar
                </button>
                <button style={styles.btnPdf} onClick={exportarPDF}>
                  PDF
                </button>
                <button style={styles.btnExcel} onClick={exportarExcel}>
                  Excel
                </button>
              </div>
            </div>
          </div>

          <div style={styles.rightColumn}>
            <div style={styles.card}>
              <h3 style={styles.subtitulo}>📌 Citas encontradas</h3>

              {cargandoCitas ? (
                <p>Cargando citas...</p>
              ) : citas.length === 0 ? (
                <p>No hay citas en ese rango.</p>
              ) : null}

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
  reportRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
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
  btnPdf: {
    padding: "10px 16px",
    background: "#fee2e2",
    color: "#991b1b",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: "600",
  },
  btnExcel: {
    padding: "10px 16px",
    background: "#dcfce7",
    color: "#166534",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: "600",
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