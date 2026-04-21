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
    const fechaNueva = new Date(y, m - 1, d);
    fechaNueva.setDate(fechaNueva.getDate() + dias);
    return formatearFechaSV(fechaNueva);
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

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 12;
    const accent = [107, 90, 122];
    const lightBg = [245, 242, 247];
    const gridColor = [210, 204, 217];
    const textDark = [45, 39, 61];
    const textMuted = [95, 88, 109];

    doc.setFillColor(...lightBg);
    doc.rect(0, 0, pageWidth, 34, "F");

    doc.setDrawColor(...accent);
    doc.setLineWidth(0.8);
    doc.line(0, 34, pageWidth, 34);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...textDark);
    doc.text("LISTA DE CITAS", 18, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...textMuted);
    doc.text("Para registro manual", 18, 24);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...textDark);
    doc.text("Empresa:", 175, 14);
    doc.text("Período:", 175, 24);

    doc.setDrawColor(120, 112, 135);
    doc.line(198, 15, 286, 15);
    doc.line(198, 25, 286, 25);

    const empresaTexto = empresa?.nombre || "Empresa activa";
    const periodoTexto = `${formatearFechaPantalla(filtroDesde)} al ${formatearFechaPantalla(filtroHasta)}`;

    doc.setFontSize(10);
    doc.text(empresaTexto, 199, 13.5);
    doc.text(periodoTexto, 199, 23.5);

    autoTable(doc, {
      startY: 42,
      margin: { left: marginX, right: marginX },
      head: [[
        "Fecha",
        "Hora",
        "Cliente",
        "Teléfono",
        "Observaciones / Comentarios",
      ]],
      body: citas.map((c) => [
        formatearFechaPantalla(c.fecha),
        normalizarHora(c.hora),
        c.clientes?.nombre || "Sin nombre",
        c.clientes?.telefono || "",
        "",
      ]),
      theme: "grid",
      styles: {
        fontSize: 9,
        cellPadding: 4,
        lineColor: gridColor,
        lineWidth: 0.2,
        textColor: [40, 40, 40],
        minCellHeight: 14,
        valign: "middle",
      },
      headStyles: {
        fillColor: accent,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        valign: "middle",
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { cellWidth: 28, halign: "center" },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 60 },
        3: { cellWidth: 32 },
        4: { cellWidth: 123 },
      },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setDrawColor(...accent);
        doc.setLineWidth(0.5);
        doc.line(12, pageHeight - 10, pageWidth - 12, pageHeight - 10);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...textMuted);
        doc.text("Sistema Dental", 18, pageHeight - 6);

        const pageInfo = `Página ${doc.internal.getNumberOfPages()}`;
        doc.text(pageInfo, pageWidth - 28, pageHeight - 6);
      },
    });

    doc.save(`${nombreArchivo}_${filtroDesde}_a_${filtroHasta}.pdf`);
  };

  if (!empresa) {
    return <div>No hay empresa seleccionada</div>;
  }

  return (
    <>
      <div style={styles.page}>
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Citas</h1>
            <p style={styles.subtitle}>
              Gestioná agenda, bloqueos y reportes de citas.
            </p>
          </div>

          <div style={styles.headerInfo}>
            <div><strong>{empresa?.nombre || "Empresa"}</strong></div>
            <div>Citas encontradas</div>
            <div><strong>{citas.length}</strong></div>
          </div>
        </div>

        <div style={styles.topSections}>
          <div style={styles.cardTop}>
            <div style={styles.cardHeader}>
              <h3 style={styles.sectionTitle}>Nueva cita</h3>
              <p style={styles.sectionSubtitle}>
                Creá o editá citas fácilmente.
              </p>
            </div>

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

          <div style={styles.cardTop}>
            <div style={styles.cardHeader}>
              <h3 style={styles.sectionTitle}>Bloquear horario</h3>
              <p style={styles.sectionSubtitle}>
                Marcá horas no disponibles.
              </p>
            </div>

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

          <div style={styles.cardTop}>
            <div style={styles.cardHeader}>
              <h3 style={styles.sectionTitle}>Filtros y reportes</h3>
              <p style={styles.sectionSubtitle}>
                Buscá citas y exportá información.
              </p>
            </div>

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
                <div style={styles.errorText}>
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
              <button style={styles.btnFiltro} onClick={obtenerCitas}>
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

        <div style={styles.cardMain}>
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitle}>Citas encontradas</h3>
            <p style={styles.sectionSubtitle}>
              Revisá, confirmá, cancelá o atendé citas.
            </p>
          </div>

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
                <div style={styles.badgeTopRow}>
                  <span
                    style={{
                      ...styles.estadoBadge,
                      background:
                        c.estado === "pendiente"
                          ? "#fef3c7"
                          : c.estado === "atendida"
                          ? "#ecfdf5"
                          : "#fef2f2",
                      color:
                        c.estado === "pendiente"
                          ? "#92400e"
                          : c.estado === "atendida"
                          ? "#166534"
                          : "#991b1b",
                      borderColor:
                        c.estado === "pendiente"
                          ? "#fde68a"
                          : c.estado === "atendida"
                          ? "#bbf7d0"
                          : "#fecaca",
                    }}
                  >
                    {c.estado}
                  </span>

                  <span
                    style={{
                      ...styles.estadoBadge,
                      background: c.confirmada ? "#eefcf3" : "#f8f8fa",
                      color: c.confirmada ? "#0f7a4d" : "#475569",
                      borderColor: c.confirmada ? "#c7eed5" : "#d7dbe2",
                    }}
                  >
                    {c.confirmada ? "Confirmada" : "Sin confirmar"}
                  </span>
                </div>

                <strong style={styles.citaNombre}>{c.clientes?.nombre}</strong>
                <div style={styles.citaText}>📞 {c.clientes?.telefono || "Sin teléfono"}</div>
                <div style={styles.citaText}>
                  📅 {formatearFechaPantalla(c.fecha)} - {normalizarHora(c.hora)}
                </div>
                <div style={styles.citaServicio}>{c.servicio}</div>

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
                          {formatearFechaPantalla(c.fecha_reprogramada)} -{" "}
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
    minHeight: "100%",
    display: "grid",
    gap: 18,
  },

  headerCard: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "22px",
    display: "flex",
    justifyContent: "space-between",
    gap: "18px",
    flexWrap: "wrap",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  title: {
    margin: 0,
    color: "#574866",
    fontSize: "30px",
    fontWeight: "700",
  },

  subtitle: {
    margin: "6px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  headerInfo: {
    textAlign: "right",
    color: "#1f2937",
    fontSize: 14,
    lineHeight: 1.6,
  },

  topSections: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 18,
  },

  cardTop: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    padding: 18,
    borderRadius: 20,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    width: "100%",
    boxSizing: "border-box",
  },

  cardMain: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    padding: 18,
    borderRadius: 20,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    width: "100%",
    boxSizing: "border-box",
  },

  cardHeader: {
    marginBottom: 12,
  },

  sectionTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#1f2937",
  },

  sectionSubtitle: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
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
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cfd9e5",
    boxSizing: "border-box",
    background: "#fff",
    outline: "none",
    fontSize: 14,
  },

  btnNuevoCliente: {
    padding: "10px 14px",
    background: "#6b5a7a",
    color: "white",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontWeight: "700",
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
    background: "#6b5a7a",
    color: "white",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  btnSecundario: {
    padding: "10px 16px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  btnFiltro: {
    padding: "10px 16px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  btnPdf: {
    padding: "10px 16px",
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  btnExcel: {
    padding: "10px 16px",
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  btnBloqueo: {
    padding: "10px 16px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  bloqueoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    padding: "8px 10px",
    background: "#fff",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
  },

  bloqueoText: {
    fontSize: 13,
    wordBreak: "break-word",
  },

  deleteBloqueoBtn: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
  },

  citasGrid: {
    display: "grid",
    gap: 14,
    width: "100%",
  },

  citaCard: {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 14,
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
  },

  badgeTopRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },

  estadoBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid transparent",
    textTransform: "capitalize",
  },

  citaNombre: {
    fontSize: 18,
    color: "#1f2937",
  },

  citaText: {
    marginTop: 4,
    color: "#475569",
    fontSize: 14,
  },

  citaServicio: {
    marginTop: 8,
    color: "#334155",
    fontWeight: "600",
    wordBreak: "break-word",
  },

  canceladaInfo: {
    marginTop: 10,
    fontSize: 14,
    color: "#991b1b",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 10,
    padding: 10,
  },

  actions: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  },

  iconBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d7dbe2",
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
    borderRadius: "18px",
    padding: "18px",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
    border: "1px solid #d7dbe2",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },

  btnCerrarModal: {
    background: "#ececef",
    border: "none",
    borderRadius: "10px",
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
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  btnCancelarModal: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    marginTop: -4,
  },
};

export default Citas;