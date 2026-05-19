import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function generarTokenSeguro() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replaceAll("-", "");
  }

  return `${Date.now()}${Math.random().toString(16).slice(2)}${Math.random()
    .toString(16)
    .slice(2)}`;
}

function obtenerBaseUrlPublica() {
  const envUrl = import.meta.env?.VITE_PUBLIC_APP_URL;
  const base = envUrl || window.location.origin;
  return String(base).replace(/\/$/, "");
}


function Citas({ onNavigate }) {
  const empresaInicial = JSON.parse(localStorage.getItem("empresa") || "null");

  const [empresa, setEmpresa] = useState(empresaInicial);
  const [empresasUsuario, setEmpresasUsuario] = useState([]);
  const [empresasReporteIds, setEmpresasReporteIds] = useState(() => {
    const guardadas = JSON.parse(localStorage.getItem("empresas_citas_ids") || "[]");
    if (Array.isArray(guardadas) && guardadas.length > 0) return guardadas;
    return empresaInicial?.id ? [empresaInicial.id] : [];
  });

  const [mostrarSelectorEmpresas, setMostrarSelectorEmpresas] = useState(false);
  const [vista, setVista] = useState("mes");

  const [citas, setCitas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(false);

  const [fechaSeleccionada, setFechaSeleccionada] = useState(obtenerFechaSV());
  const [mesVisible, setMesVisible] = useState(obtenerMesActual());
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  const [clienteSeleccionado, setClienteSeleccionado] = useState("");
  const [busquedaPacienteCita, setBusquedaPacienteCita] = useState("");
  const [mostrarDropdownPacientes, setMostrarDropdownPacientes] = useState(false);
  const [fecha, setFecha] = useState(obtenerFechaSV());
  const [hora, setHora] = useState("08:00");
  const [minuto, setMinuto] = useState("00");
  const [tipoCita, setTipoCita] = useState("normal");
  const [comentario, setComentario] = useState("");
  const [citaEditando, setCitaEditando] = useState(null);
  const [mostrarModalCita, setMostrarModalCita] = useState(false);

  const [mostrarModalReporte, setMostrarModalReporte] = useState(false);
  const [columnasReporte, setColumnasReporte] = useState({
    empresa: true,
    fecha: true,
    hora: true,
    paciente: true,
    telefono: true,
    prioridad: true,
    comentario: true,
    estado: true,
    confirmada: true,
    columnaLibre1: false,
  });

  const [reporteDesde, setReporteDesde] = useState("");
  const [reporteHasta, setReporteHasta] = useState("");
  const [reporteEstado, setReporteEstado] = useState("todos");
  const [reportePrioridad, setReportePrioridad] = useState("todos");
  const [reporteTexto, setReporteTexto] = useState("");

  const [mostrarModalConfirmar, setMostrarModalConfirmar] = useState(false);
  const [fechaConfirmacion, setFechaConfirmacion] = useState(obtenerFechaSV());
  const [citasConfirmacion, setCitasConfirmacion] = useState([]);
  const [cargandoConfirmacion, setCargandoConfirmacion] = useState(false);
  const [confirmacionTexto, setConfirmacionTexto] = useState("");
  const [confirmacionPrioridad, setConfirmacionPrioridad] = useState("todos");
  const [confirmacionEstado, setConfirmacionEstado] = useState("pendientes");
  const [confirmacionEmpresaId, setConfirmacionEmpresaId] = useState("todas");

  const [mostrarModalReagendar, setMostrarModalReagendar] = useState(false);
  const [citaParaReagendar, setCitaParaReagendar] = useState(null);
  const [fechaReagendar, setFechaReagendar] = useState(obtenerFechaSV());
  const [horaReagendar, setHoraReagendar] = useState("08:00");
  const [minutoReagendar, setMinutoReagendar] = useState("00");
  const [citasNuevaFecha, setCitasNuevaFecha] = useState([]);

  const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState("");
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  const [filtroEstado, setFiltroEstado] = useState("pendientes");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [horaSeleccionadaLista, setHoraSeleccionadaLista] = useState("");

  const empresasConsultaIds = useMemo(() => {
    if (empresasReporteIds.length > 0) return empresasReporteIds;
    return empresa?.id ? [empresa.id] : [];
  }, [empresasReporteIds, empresa?.id]);

  const tituloEmpresasReporte = useMemo(() => {
    const seleccionadas = empresasUsuario.filter((emp) =>
      empresasConsultaIds.some((id) => String(id) === String(emp.id))
    );

    if (seleccionadas.length === 0) return empresa?.nombre || "Empresa activa";
    if (seleccionadas.length === 1) return seleccionadas[0].nombre;
    return `${seleccionadas.length} empresas combinadas`;
  }, [empresasUsuario, empresasConsultaIds, empresa?.nombre]);

  const horasDelDia = useMemo(() => {
    const horas = [];
    for (let h = 0; h < 24; h += 1) {
      horas.push(`${String(h).padStart(2, "0")}:00`);
    }
    return horas;
  }, []);

  const minutosDisponibles = useMemo(() => ["00", "15", "30", "45"], []);

  const clientesFiltradosCita = useMemo(() => {
    const texto = busquedaPacienteCita.trim().toLowerCase();

    if (!texto) return clientes;

    return clientes.filter((cliente) => {
      const nombre = String(cliente.nombre || "").toLowerCase();
      const telefono = String(cliente.telefono || "").toLowerCase();
      return nombre.includes(texto) || telefono.includes(texto);
    });
  }, [clientes, busquedaPacienteCita]);


  const rangoMes = useMemo(() => {
    if (filtroDesde && filtroHasta) return { desde: filtroDesde, hasta: filtroHasta };

    const [yyyy, mm] = mesVisible.split("-").map(Number);
    const inicio = new Date(yyyy, mm - 1, 1);
    const fin = new Date(yyyy, mm, 0);
    const desde = formatoFechaLocal(inicio);
    const hasta = formatoFechaLocal(fin);
    return { desde, hasta };
  }, [mesVisible, filtroDesde, filtroHasta]);

  const diasSemana = useMemo(() => {
    return obtenerSemana(fechaSeleccionada);
  }, [fechaSeleccionada]);

  const citasFiltradasVista = useMemo(() => {
    const texto = filtroTexto.trim().toLowerCase();

    return citas.filter((cita) => {
      const info = leerServicio(cita.servicio);
      const nombre = cita.clientes?.nombre || "";
      const telefono = cita.clientes?.telefono || "";
      const empresaNombre = cita.empresas?.nombre || obtenerNombreEmpresa(cita.empresa_id, cita.empresas);

      const coincideTexto =
        !texto ||
        nombre.toLowerCase().includes(texto) ||
        telefono.toLowerCase().includes(texto) ||
        empresaNombre.toLowerCase().includes(texto) ||
        info.comentario.toLowerCase().includes(texto);

      const fechaCita = String(cita.fecha).slice(0, 10);
      const coincideTipo = filtroTipo === "todos" || info.tipo === filtroTipo;

      const coincideLlegada =
        filtroEstado !== "llegaron" || Boolean(cita.paciente_llego);

      const coincideRango =
        (!filtroDesde || fechaCita >= filtroDesde) &&
        (!filtroHasta || fechaCita <= filtroHasta);

      const coincideHora =
        !horaSeleccionadaLista ||
        (obtenerHoraBase(cita.hora) === horaSeleccionadaLista &&
          fechaCita === fechaSeleccionada);

      return coincideTexto && coincideTipo && coincideLlegada && coincideRango && coincideHora;
    });
  }, [citas, filtroTexto, filtroTipo, filtroDesde, filtroHasta, horaSeleccionadaLista, fechaSeleccionada, empresasUsuario]);


  const citasDelDia = useMemo(() => {
    return citasFiltradasVista
      .filter((c) => String(c.fecha).slice(0, 10) === fechaSeleccionada)
      .sort((a, b) => normalizarHora(a.hora).localeCompare(normalizarHora(b.hora)));
  }, [citasFiltradasVista, fechaSeleccionada]);

  const citasReporteFiltradas = useMemo(() => {
    const texto = reporteTexto.trim().toLowerCase();

    return citas.filter((cita) => {
      const info = leerServicio(cita.servicio);
      const fechaCita = String(cita.fecha).slice(0, 10);
      const nombre = cita.clientes?.nombre || "";
      const telefono = cita.clientes?.telefono || "";
      const empresaNombre = cita.empresas?.nombre || obtenerNombreEmpresa(cita.empresa_id, cita.empresas);

      const coincideTexto =
        !texto ||
        nombre.toLowerCase().includes(texto) ||
        telefono.toLowerCase().includes(texto) ||
        empresaNombre.toLowerCase().includes(texto) ||
        info.comentario.toLowerCase().includes(texto);

      const coincideRango =
        (!reporteDesde || fechaCita >= reporteDesde) &&
        (!reporteHasta || fechaCita <= reporteHasta);

      const coincideEstado =
        reporteEstado === "todos" ||
        cita.estado === reporteEstado ||
        (reporteEstado === "confirmadas" && cita.confirmada) ||
        (reporteEstado === "sin_confirmar" && !cita.confirmada);

      const coincidePrioridad =
        reportePrioridad === "todos" || info.tipo === reportePrioridad;

      return coincideTexto && coincideRango && coincideEstado && coincidePrioridad;
    });
  }, [citas, reporteTexto, reporteDesde, reporteHasta, reporteEstado, reportePrioridad, empresasUsuario]);

  const citasConfirmacionFiltradas = useMemo(() => {
    const texto = confirmacionTexto.trim().toLowerCase();

    return citasConfirmacion.filter((cita) => {
      const info = leerServicio(cita.servicio);
      const nombre = cita.clientes?.nombre || "";
      const telefono = cita.clientes?.telefono || "";
      const empresaNombre = cita.empresas?.nombre || obtenerNombreEmpresa(cita.empresa_id, cita.empresas);

      const coincideTexto =
        !texto ||
        nombre.toLowerCase().includes(texto) ||
        telefono.toLowerCase().includes(texto) ||
        empresaNombre.toLowerCase().includes(texto) ||
        info.comentario.toLowerCase().includes(texto);

      const coincidePrioridad =
        confirmacionPrioridad === "todos" || info.tipo === confirmacionPrioridad;

      const coincideEstado =
        confirmacionEstado === "todos" ||
        (confirmacionEstado === "pendientes" && cita.estado === "pendiente") ||
        (confirmacionEstado === "sin_confirmar" && !cita.confirmada) ||
        (confirmacionEstado === "confirmadas" && cita.confirmada);

      const coincideEmpresa =
        confirmacionEmpresaId === "todas" ||
        String(cita.empresa_id) === String(confirmacionEmpresaId);

      return coincideTexto && coincidePrioridad && coincideEstado && coincideEmpresa;
    });
  }, [
    citasConfirmacion,
    confirmacionTexto,
    confirmacionPrioridad,
    confirmacionEstado,
    confirmacionEmpresaId,
    empresasUsuario,
  ]);

  const citasPorFecha = useMemo(() => {
    const mapa = {};
    citasFiltradasVista.forEach((c) => {
      const f = String(c.fecha).slice(0, 10);
      if (!mapa[f]) mapa[f] = [];
      mapa[f].push(c);
    });
    return mapa;
  }, [citasFiltradasVista]);

  useEffect(() => {
    cargarEmpresasUsuario();
  }, []);

  useEffect(() => {
    if (empresa?.id) {
      obtenerClientes();
    } else {
      setClientes([]);
    }
  }, [empresa?.id]);

  useEffect(() => {
    if (empresasConsultaIds.length > 0) {
      localStorage.setItem("empresas_citas_ids", JSON.stringify(empresasConsultaIds));
      obtenerCitas();
    } else {
      setCitas([]);
    }
  }, [empresasConsultaIds.join("|"), mesVisible, filtroEstado, filtroDesde, filtroHasta]);

  const cargarEmpresasUsuario = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (!userId) {
      if (empresaInicial?.id) {
        setEmpresasUsuario([empresaInicial]);
        setEmpresasReporteIds([empresaInicial.id]);
      }
      return;
    }

    const { data, error } = await supabase
      .from("empresa_usuarios")
      .select("empresa_id, activo, empresas(id, nombre)")
      .eq("user_id", userId)
      .eq("activo", true);

    if (error) {
      console.error(error);
      if (empresaInicial?.id) setEmpresasUsuario([empresaInicial]);
      return;
    }

    const empresas = (data || [])
      .map((row) => row.empresas)
      .filter(Boolean)
      .filter((emp, index, arr) => arr.findIndex((x) => String(x.id) === String(emp.id)) === index)
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));

    setEmpresasUsuario(empresas);

    if (empresas.length === 0) return;

    const empresaGuardada = JSON.parse(localStorage.getItem("empresa") || "null");
    const empresaValida = empresas.find((emp) => String(emp.id) === String(empresaGuardada?.id));
    const activa = empresaValida || empresas[0];

    setEmpresa(activa);
    localStorage.setItem("empresa", JSON.stringify(activa));

    const idsValidos = empresasReporteIds.filter((id) =>
      empresas.some((emp) => String(emp.id) === String(id))
    );

    const idsIniciales = idsValidos.length ? idsValidos : [activa.id];
    setEmpresasReporteIds(idsIniciales);
    localStorage.setItem("empresas_citas_ids", JSON.stringify(idsIniciales));
  };

  const obtenerClientes = async () => {
    if (!empresa?.id) return;

    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      return alert("Error al cargar pacientes");
    }

    setClientes(data || []);
  };


  const obtenerCitasPorFechaParaEmpresa = async (fechaConsulta, empresaId = empresa?.id) => {
    if (!fechaConsulta || !empresaId) return [];

    const { data, error } = await supabase
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
        paciente_llego,
        hora_llegada,
        llegada_at,
        clientes(nombre, telefono),
        empresas(id, nombre)
      `)
      .eq("empresa_id", empresaId)
      .eq("fecha", fechaConsulta)
      .neq("estado", "cancelada")
      .order("hora", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al consultar agenda de la fecha");
      return [];
    }

    return data || [];
  };

  const cargarAgendaReagendar = async (fechaConsulta = fechaReagendar, empresaId = citaParaReagendar?.empresa_id || empresa?.id) => {
    const data = await obtenerCitasPorFechaParaEmpresa(fechaConsulta, empresaId);
    setCitasNuevaFecha(data);
  };

  const contarCitasEnHora = (horaBase, minutoBase = "00") => {
    const horaCompleta = `${String(horaBase).slice(0, 2)}:${minutoBase}`;
    return citasNuevaFecha.filter((c) => normalizarHora(c.hora) === horaCompleta).length;
  };

  const abrirModalReagendar = async (cita) => {
    setCitaParaReagendar(cita);
    setFechaReagendar(cita.fecha || obtenerFechaSV());
    setHoraReagendar(obtenerHoraBase(cita.hora) || "08:00");
    setMinutoReagendar(obtenerMinuto(cita.hora) || "00");
    setMostrarModalReagendar(true);

    const data = await obtenerCitasPorFechaParaEmpresa(cita.fecha || obtenerFechaSV(), cita.empresa_id || empresa?.id);
    setCitasNuevaFecha(data);
  };

  const confirmarReagendar = async () => {
    if (!citaParaReagendar) return;
    if (!fechaReagendar || !horaReagendar || !minutoReagendar) {
      return alert("Selecciona fecha y hora");
    }

    const nuevaHora = `${String(horaReagendar).slice(0, 2)}:${minutoReagendar}`;
    const cantidad = contarCitasEnHora(horaReagendar, minutoReagendar);

    if (cantidad >= 4) {
      const continuar = window.confirm(
        `Ya hay ${cantidad} paciente(s) a las ${nuevaHora}. ¿Aún deseas agendar ahí?`
      );
      if (!continuar) return;
    }

    const { error } = await supabase
      .from("citas")
      .update({
        fecha: fechaReagendar,
        hora: nuevaHora,
        estado: "pendiente",
        confirmada: false,
      })
      .eq("id", citaParaReagendar.id)
      .eq("empresa_id", citaParaReagendar.empresa_id || empresa?.id);

    if (error) {
      console.error(error);
      return alert("Error al reagendar cita");
    }

    setMostrarModalReagendar(false);
    setCitaParaReagendar(null);
    setFechaSeleccionada(fechaReagendar);
    setMesVisible(fechaReagendar.slice(0, 7));
    await obtenerCitas();
    await cargarCitasConfirmacion(fechaConfirmacion);
    alert("Cita reagendada correctamente");
  };

  const cargarCitasConfirmacion = async (fechaObjetivo = fechaConfirmacion) => {
    if (!fechaObjetivo || empresasConsultaIds.length === 0) return;

    setCargandoConfirmacion(true);

    const { data, error } = await supabase
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
        paciente_llego,
        hora_llegada,
        llegada_at,
        clientes(nombre, telefono),
        empresas(id, nombre)
      `)
      .in("empresa_id", empresasConsultaIds)
      .eq("fecha", fechaObjetivo)
      .eq("estado", "pendiente")
      .order("hora", { ascending: true });

    setCargandoConfirmacion(false);

    if (error) {
      console.error(error);
      return alert("Error al cargar citas para confirmar");
    }

    setCitasConfirmacion(data || []);
  };

  const abrirConfirmaciones = async () => {
    setMostrarModalConfirmar(true);
    setConfirmacionTexto("");
    setConfirmacionPrioridad("todos");
    setConfirmacionEstado("pendientes");
    setConfirmacionEmpresaId("todas");
    await cargarCitasConfirmacion(fechaConfirmacion);
  };

  const marcarConfirmada = async (cita) => {
    const { error } = await supabase
      .from("citas")
      .update({ confirmada: true })
      .eq("id", cita.id);

    if (error) {
      console.error(error);
      return alert("Error al confirmar cita");
    }

    await cargarCitasConfirmacion(fechaConfirmacion);
    await obtenerCitas();
  };

  const marcarSinConfirmar = async (cita) => {
    const { error } = await supabase
      .from("citas")
      .update({ confirmada: false })
      .eq("id", cita.id);

    if (error) {
      console.error(error);
      return alert("Error al marcar sin confirmar");
    }

    await cargarCitasConfirmacion(fechaConfirmacion);
    await obtenerCitas();
  };

  const obtenerTokenPublicoCita = async (cita) => {
    if (!cita?.id || !cita?.empresa_id) {
      throw new Error("Cita inválida para generar enlace");
    }

    const { data: existente, error: errorBuscar } = await supabase
      .from("citas_tokens_publicos")
      .select("token, expira_en")
      .eq("cita_id", cita.id)
      .eq("empresa_id", cita.empresa_id)
      .maybeSingle();

    if (errorBuscar) {
      console.error(errorBuscar);
      throw new Error("No se pudo revisar el token de la cita");
    }

    if (existente?.token) {
      return existente.token;
    }

    const token = generarTokenSeguro();
    const expira = new Date();
    expira.setDate(expira.getDate() + 15);

    const { error: errorInsertar } = await supabase
      .from("citas_tokens_publicos")
      .insert([
        {
          cita_id: cita.id,
          empresa_id: cita.empresa_id,
          token,
          expira_en: expira.toISOString(),
          usado: false,
        },
      ]);

    if (errorInsertar) {
      console.error(errorInsertar);
      throw new Error("No se pudo crear el enlace público de la cita");
    }

    return token;
  };

  const construirLinkConfirmacion = async (cita) => {
    const token = await obtenerTokenPublicoCita(cita);
    return `${obtenerBaseUrlPublica()}/confirmar-cita/${token}`;
  };

  const abrirWhatsapp = async (cita) => {
    const telefono = limpiarTelefono(cita.clientes?.telefono || "");
    if (!telefono) return alert("Este paciente no tiene teléfono registrado");

    try {
      const empresaNombre = obtenerNombreEmpresa(cita.empresa_id, cita.empresas);
      const linkConfirmacion = await construirLinkConfirmacion(cita);

      const mensaje = `Hola ${cita.clientes?.nombre || ""}, le saludamos de ${empresaNombre}.

Le recordamos su cita para el ${formatearFechaPantalla(cita.fecha)} a las ${normalizarHora(cita.hora)}.

Para confirmar, cancelar o reagendar su cita, toque aquí:
${linkConfirmacion}`;

      const texto = encodeURIComponent(mensaje);

const esApple =
  /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent);

const urlWhatsapp = esApple
  ? `https://api.whatsapp.com/send?phone=${telefono}&text=${texto}`
  : `https://wa.me/${telefono}?text=${texto}`;

window.location.href = urlWhatsapp;

    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo generar el enlace de confirmación");
    }
  };

  const toggleColumnaReporte = (key) => {
    setColumnasReporte((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const columnasReporteDef = [
    { key: "empresa", label: "Empresa" },
    { key: "fecha", label: "Fecha" },
    { key: "hora", label: "Hora" },
    { key: "paciente", label: "Paciente" },
    { key: "telefono", label: "Teléfono" },
    { key: "prioridad", label: "Prioridad" },
    { key: "comentario", label: "Comentario" },
    { key: "estado", label: "Estado" },
    { key: "confirmada", label: "Confirmada" },
    { key: "columnaLibre1", label: "Observación manual" },
  ];

  const construirFilasReporte = (listaCitas = citasReporteFiltradas) => {
    return listaCitas.map((cita) => {
      const info = leerServicio(cita.servicio);
      const fila = {};

      columnasReporteDef.forEach((col) => {
        if (!columnasReporte[col.key]) return;

        if (col.key === "empresa") fila[col.label] = obtenerNombreEmpresa(cita.empresa_id, cita.empresas);
        if (col.key === "fecha") fila[col.label] = formatearFechaPantalla(cita.fecha);
        if (col.key === "hora") fila[col.label] = normalizarHora(cita.hora);
        if (col.key === "paciente") fila[col.label] = cita.clientes?.nombre || "";
        if (col.key === "telefono") fila[col.label] = cita.clientes?.telefono || "";
        if (col.key === "prioridad") fila[col.label] = labelTipo(info.tipo);
        if (col.key === "comentario") fila[col.label] = info.comentario || "";
        if (col.key === "estado") fila[col.label] = cita.estado || "";
        if (col.key === "confirmada") fila[col.label] = cita.confirmada ? "Sí" : "No";
        if (col.key === "columnaLibre1") fila[col.label] = "";
      });

      return fila;
    });
  };

  const exportarReporteExcel = async () => {
    if (reporteDesde && reporteHasta && reporteDesde > reporteHasta) {
      return alert("La fecha desde no puede ser mayor que la fecha hasta");
    }
    const citasParaExportar = await obtenerCitasReporteBase();
    if (citasParaExportar.length === 0) return alert("No hay citas para exportar con esos filtros");

    const XLSX = await import("xlsx");
    const filas = construirFilasReporte(citasParaExportar);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);
    const columnas = Object.keys(filas[0] || {});
    ws["!cols"] = columnas.map((col) => ({
      wch: col === "Observación manual" ? 36 : Math.max(14, Math.min(26, col.length + 6)),
    }));
    XLSX.utils.book_append_sheet(wb, ws, "Citas");
    XLSX.writeFile(wb, `Reporte_Citas_${obtenerFechaSV()}.xlsx`);
  };

  const exportarReportePDF = async () => {
    if (reporteDesde && reporteHasta && reporteDesde > reporteHasta) {
      return alert("La fecha desde no puede ser mayor que la fecha hasta");
    }
    const citasParaExportar = await obtenerCitasReporteBase();
    if (citasParaExportar.length === 0) return alert("No hay citas para exportar con esos filtros");

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const filas = construirFilasReporte(citasParaExportar);
    const columnas = Object.keys(filas[0] || {});

    const doc = new jsPDF("landscape", "mm", "a4");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Reporte de Citas", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Empresas: ${tituloEmpresasReporte}`, 14, 23);
    doc.text(`Período: ${reporteDesde ? formatearFechaPantalla(reporteDesde) : "Inicio"} al ${reporteHasta ? formatearFechaPantalla(reporteHasta) : "Fin"}`, 14, 29);
    doc.text(`Generado: ${formatearFechaPantalla(obtenerFechaSV())}`, 14, 35);

    const indiceColumnaLibre = columnas.findIndex((c) => c === "Observación manual");
    const columnStyles = {};

columnas.forEach((col, index) => {
  if (col === "Observación manual") {
    columnStyles[index] = { cellWidth: 'auto' }; // 👈 se expande todo lo posible
  } else {
    columnStyles[index] = { cellWidth: 28 }; // 👈 columnas pequeñas y fijas
  }
});

autoTable(doc, {
  startY: 36,
  head: [columnas],
  body: filas.map((f) => columnas.map((c) => f[c] ?? "")),
  theme: "grid",
  styles: { fontSize: 8, cellPadding: 3 },
  headStyles: { fillColor: [107, 90, 122] },
  columnStyles,
  tableWidth: 'auto'
});

    doc.save(`Reporte_Citas_${obtenerFechaSV()}.pdf`);
  };


  const abrirModalReporte = () => {
    setReporteDesde((prev) => prev || filtroDesde || rangoMes.desde);
    setReporteHasta((prev) => prev || filtroHasta || rangoMes.hasta);
    setReporteEstado("todos");
    setReportePrioridad("todos");
    setReporteTexto("");
    setMostrarModalReporte(true);
  };

  const obtenerCitasReporteBase = async () => {
    if (empresasConsultaIds.length === 0) return [];

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
        paciente_llego,
        hora_llegada,
        llegada_at,
        motivo_cancelacion,
        desea_reprogramar,
        fecha_reprogramada,
        hora_reprogramada,
        clientes(nombre, telefono),
        empresas(id, nombre)
      `)
      .in("empresa_id", empresasConsultaIds)
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true });

    if (reporteDesde) query = query.gte("fecha", reporteDesde);
    if (reporteHasta) query = query.lte("fecha", reporteHasta);

    if (reporteEstado === "pendiente" || reporteEstado === "atendida" || reporteEstado === "cancelada") {
      query = query.eq("estado", reporteEstado);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      alert("Error al cargar citas del reporte");
      return [];
    }

    const texto = reporteTexto.trim().toLowerCase();

    return (data || []).filter((cita) => {
      const info = leerServicio(cita.servicio);
      const nombre = cita.clientes?.nombre || "";
      const telefono = cita.clientes?.telefono || "";
      const empresaNombre = cita.empresas?.nombre || obtenerNombreEmpresa(cita.empresa_id, cita.empresas);

      const coincideTexto =
        !texto ||
        nombre.toLowerCase().includes(texto) ||
        telefono.toLowerCase().includes(texto) ||
        empresaNombre.toLowerCase().includes(texto) ||
        info.comentario.toLowerCase().includes(texto);

      const coincideEstado =
        reporteEstado === "todos" ||
        reporteEstado === "pendiente" ||
        reporteEstado === "atendida" ||
        reporteEstado === "cancelada" ||
        (reporteEstado === "confirmadas" && cita.confirmada) ||
        (reporteEstado === "sin_confirmar" && !cita.confirmada);

      const coincidePrioridad =
        reportePrioridad === "todos" || info.tipo === reportePrioridad;

      return coincideTexto && coincideEstado && coincidePrioridad;
    });
  };

  const obtenerCitas = async () => {
    if (empresasConsultaIds.length === 0) return;

    setCargando(true);

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
        paciente_llego,
        hora_llegada,
        llegada_at,
        motivo_cancelacion,
        desea_reprogramar,
        fecha_reprogramada,
        hora_reprogramada,
        clientes(nombre, telefono),
        empresas(id, nombre)
      `)
      .in("empresa_id", empresasConsultaIds)
      .gte("fecha", rangoMes.desde)
      .lte("fecha", rangoMes.hasta)
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true });

    if (filtroEstado === "pendientes" || filtroEstado === "llegaron") {
      query = query.eq("estado", "pendiente");
    }
    if (filtroEstado === "atendidas") query = query.eq("estado", "atendida");
    if (filtroEstado === "canceladas") query = query.eq("estado", "cancelada");

    const { data, error } = await query;
    setCargando(false);

    if (error) {
      console.error(error);
      return alert("Error al cargar citas");
    }

    setCitas(data || []);
  };

  const cambiarEmpresaActiva = (empresaId) => {
    const nueva = empresasUsuario.find((emp) => String(emp.id) === String(empresaId));
    if (!nueva) return;

    setEmpresa(nueva);
    localStorage.setItem("empresa", JSON.stringify(nueva));
    setEmpresasReporteIds([nueva.id]);
    localStorage.setItem("empresas_citas_ids", JSON.stringify([nueva.id]));
    limpiarFormulario();
  };

  const toggleEmpresaReporte = (empresaId) => {
    setEmpresasReporteIds((prev) => {
      const existe = prev.some((id) => String(id) === String(empresaId));
      const nuevos = existe
        ? prev.filter((id) => String(id) !== String(empresaId))
        : [...prev, empresaId];

      const resultado = nuevos.length ? nuevos : prev;
      localStorage.setItem("empresas_citas_ids", JSON.stringify(resultado));
      return resultado;
    });
  };

  const seleccionarSoloEmpresaActiva = () => {
    if (!empresa?.id) return;
    setEmpresasReporteIds([empresa.id]);
    localStorage.setItem("empresas_citas_ids", JSON.stringify([empresa.id]));
  };

  const seleccionarTodasEmpresas = () => {
    const ids = empresasUsuario.map((emp) => emp.id).filter(Boolean);
    if (!ids.length) return;
    setEmpresasReporteIds(ids);
    localStorage.setItem("empresas_citas_ids", JSON.stringify(ids));
  };

  const obtenerNombreEmpresa = (empresaId, empresaRelacionada) => {
    if (empresaRelacionada?.nombre) return empresaRelacionada.nombre;
    return empresasUsuario.find((emp) => String(emp.id) === String(empresaId))?.nombre || "Empresa";
  };

  const seleccionarFecha = (fechaTexto) => {
    setFechaSeleccionada(fechaTexto);
    setFecha(fechaTexto);
    setVista("dia");
  };

  const seleccionarHoraNueva = (fechaTexto, horaTexto) => {
    setFecha(fechaTexto);
    setHora(obtenerHoraBase(horaTexto));
    setMinuto(obtenerMinuto(horaTexto));
    setClienteSeleccionado("");
    setBusquedaPacienteCita("");
    setMostrarDropdownPacientes(false);
    setTipoCita("normal");
    setComentario("");
    setCitaEditando(null);
    setMostrarModalCita(true);
  };

  const verCitasDeHora = (fechaTexto, horaTexto) => {
    setFechaSeleccionada(fechaTexto);
    setHoraSeleccionadaLista(obtenerHoraBase(horaTexto));
    setVista("lista");
  };

  const limpiarFiltrosVista = () => {
    setFiltroTexto("");
    setFiltroTipo("todos");
    setFiltroDesde("");
    setFiltroHasta("");
    setHoraSeleccionadaLista("");
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
    if (!empresa?.id) return alert("No hay empresa activa");
    if (!nuevoClienteNombre.trim()) return alert("Debes ingresar el nombre del paciente");

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
      return alert("Error al guardar paciente");
    }

    await obtenerClientes();
    setClienteSeleccionado(data.id);
    setBusquedaPacienteCita(data.nombre || nuevoClienteNombre.trim());
    cerrarModalCliente();
  };

  const guardarCita = async () => {
    if (!empresa?.id) return alert("No hay empresa activa");
    if (!clienteSeleccionado || !fecha || !hora) {
      return alert("Selecciona paciente, fecha y hora");
    }

    const horaCompleta = `${String(hora).slice(0, 2).padStart(2, "0")}:${minuto}`;
    const servicioGuardado = construirServicio(tipoCita, comentario);

    if (citaEditando) {
      const { error } = await supabase
        .from("citas")
        .update({
          cliente_id: clienteSeleccionado,
          fecha,
          hora: horaCompleta,
          servicio: servicioGuardado,
        })
        .eq("id", citaEditando.id)
        .eq("empresa_id", citaEditando.empresa_id || empresa.id);

      if (error) {
        console.error(error);
        return alert("Error al actualizar cita");
      }
    } else {
      const { error } = await supabase.from("citas").insert([
        {
          empresa_id: empresa.id,
          cliente_id: clienteSeleccionado,
          fecha,
          hora: horaCompleta,
          servicio: servicioGuardado,
          estado: "pendiente",
          confirmada: false,
        },
      ]);

      if (error) {
        console.error(error);
        return alert("Error al guardar cita");
      }
    }

    const fechaNueva = fecha;
    limpiarFormulario();
    setMostrarModalCita(false);
    setFechaSeleccionada(fechaNueva);
    await obtenerCitas();
  };

  const editarCita = (cita) => {
    if (String(cita.empresa_id) !== String(empresa?.id)) {
      const emp = empresasUsuario.find((e) => String(e.id) === String(cita.empresa_id));
      if (emp) {
        setEmpresa(emp);
        localStorage.setItem("empresa", JSON.stringify(emp));
      }
    }

    const info = leerServicio(cita.servicio);
    setCitaEditando(cita);
    setClienteSeleccionado(cita.cliente_id || "");
    setBusquedaPacienteCita(cita.clientes?.nombre || "");
    setFecha(cita.fecha || obtenerFechaSV());
    setHora(obtenerHoraBase(cita.hora) || "08:00");
    setMinuto(obtenerMinuto(cita.hora) || "00");
    setTipoCita(info.tipo);
    setComentario(info.comentario);
    setVista("dia");
    setFechaSeleccionada(cita.fecha || fechaSeleccionada);
    setMostrarModalCita(true);
  };

  const cancelarCita = async (cita) => {
    const motivo = prompt("Motivo de cancelación:");
    if (!motivo || !motivo.trim()) return alert("Debes escribir el motivo");

    const quiereReprogramar = window.confirm("¿Deseas volver a agendar esta cita?");

    let nuevaFecha = null;
    let nuevaHora = null;

    if (quiereReprogramar) {
      nuevaFecha = prompt("Nueva fecha (YYYY-MM-DD):", cita.fecha || obtenerFechaSV());
      if (!nuevaFecha) return alert("Debes ingresar la nueva fecha");

      nuevaHora = prompt("Nueva hora (HH:MM):", normalizarHora(cita.hora) || "08:00");
      if (!nuevaHora) return alert("Debes ingresar la nueva hora");

      nuevaHora = normalizarHora(nuevaHora);
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
        return alert("Se canceló, pero no se pudo crear la nueva cita");
      }
    }

    await obtenerCitas();
    alert(quiereReprogramar ? "Cita cancelada y reagendada" : "Cita cancelada");
  };

  const eliminarCita = async (cita) => {
    const reagendar = window.confirm(
      "¿Deseas volver a agendar esta cita antes de eliminarla?\nAceptar = Sí / Cancelar = No"
    );

    let nuevaFecha = null;
    let nuevaHora = null;

    if (reagendar) {
      nuevaFecha = prompt("Nueva fecha (YYYY-MM-DD):", cita.fecha || obtenerFechaSV());
      if (!nuevaFecha) return alert("Debes ingresar la nueva fecha");

      nuevaHora = prompt("Nueva hora (HH:MM):", normalizarHora(cita.hora) || "08:00");
      if (!nuevaHora) return alert("Debes ingresar la nueva hora");

      nuevaHora = normalizarHora(nuevaHora);

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
        return alert("No se pudo crear la nueva cita");
      }
    }

    const confirmar = window.confirm("¿Eliminar la cita actual?");
    if (!confirmar) return;

    const { error } = await supabase.from("citas").delete().eq("id", cita.id);

    if (error) {
      console.error(error);
      return alert("Error al eliminar cita");
    }

    await obtenerCitas();
    alert(reagendar ? "Cita reagendada y anterior eliminada" : "Cita eliminada");
  };

  const confirmarCita = async (cita) => {
    const { error } = await supabase
      .from("citas")
      .update({ confirmada: !cita.confirmada })
      .eq("id", cita.id);

    if (error) {
      console.error(error);
      return alert("Error al confirmar cita");
    }

    await obtenerCitas();
  };

  const guardarNotificacionPacienteLlego = async (cita, horaLocal) => {
    if (!cita?.id || !cita?.empresa_id) return;

    const paciente = cita.clientes?.nombre || "Paciente";
    const empresaNombre = obtenerNombreEmpresa(cita.empresa_id, cita.empresas);
    const fechaCita = formatearFechaPantalla(cita.fecha);
    const horaCita = normalizarHora(cita.hora);

    // Dejamos cualquier aviso anterior de la misma cita como historial.
    const { error: errorHistorial } = await supabase
      .from("bandeja_mensajes")
      .update({ es_ultima_accion: false })
      .eq("cita_id", cita.id)
      .eq("tipo", "paciente_llego");

    if (errorHistorial) {
      console.error("Error marcando historial de llegada:", errorHistorial);
    }

    const { error } = await supabase.from("bandeja_mensajes").insert([
      {
        empresa_id: cita.empresa_id,
        cita_id: cita.id,
        cliente_id: cita.cliente_id,
        tipo: "paciente_llego",
        titulo: "Paciente llegó",
        mensaje: `${paciente} ya llegó a ${empresaNombre}. Cita del ${fechaCita} a las ${horaCita}. Llegó a las ${horaLocal}.`,
        estado: "pendiente",
        leida: false,
        es_ultima_accion: true,
        datos: {
          paciente,
          telefono: cita.clientes?.telefono || "",
          fecha_original: cita.fecha || null,
          hora_original: cita.hora || null,
          hora_llegada: horaLocal,
          empresa: empresaNombre,
        },
      },
    ]);

    if (error) {
      console.error("Error creando notificación de llegada:", error);
    } else {
      window.dispatchEvent(new Event("bandejaMensajesActualizada"));
      // PUSH REAL FIREBASE
try {
  const { data: tokensData, error: tokensError } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("empresa_id", cita.empresa_id);

  if (tokensError) {
    console.error("Error obteniendo tokens:", tokensError);
  } else {
    const tokens = (tokensData || [])
      .map((t) => t.token)
      .filter(Boolean);

    if (tokens.length > 0) {
      const { data: pushData, error: pushError } = await supabase.functions.invoke("enviar-push", {
          body: {
            tokens,
            title: "Paciente llegó",
            message: `${paciente} ya llegó a clínica`,
            data: {
              tipo: "paciente_llego",
              cita_id: String(cita.id),
            },
          },
        }
      );

      if (pushError) {
        console.error("Error enviando push:", pushError);
      }
    }
  }
} catch (err) {
  console.error("Error push firebase:", err);
}
    }
  };

  const marcarPacienteLlego = async (cita) => {
    if (!cita?.id) return;

    if (cita.estado === "cancelada") {
      return alert("No se puede marcar llegada en una cita cancelada");
    }

    const yaLlego = Boolean(cita.paciente_llego);

    const confirmar = window.confirm(
      yaLlego
        ? "¿Deseás quitar la marca de llegada de este paciente?"
        : "¿Confirmás que el paciente ya llegó a la clínica?"
    );

    if (!confirmar) return;

    const ahora = new Date();

    const horaLocal = ahora.toLocaleTimeString("es-SV", {
      timeZone: "America/El_Salvador",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const { error } = await supabase
      .from("citas")
      .update({
        paciente_llego: !yaLlego,
        hora_llegada: yaLlego ? null : horaLocal,
        llegada_at: yaLlego ? null : ahora.toISOString(),
      })
      .eq("id", cita.id)
      .eq("empresa_id", cita.empresa_id || empresa?.id);

    if (error) {
      console.error(error);
      return alert(
        "No se pudo actualizar la llegada. Verificá que la tabla citas tenga las columnas paciente_llego, hora_llegada y llegada_at."
      );
    }

    if (!yaLlego) {
      await guardarNotificacionPacienteLlego(cita, horaLocal);
    }

    await obtenerCitas();
  };

  const atender = async (cita) => {
    if (!cita?.id || !cita?.empresa_id) return;

    localStorage.setItem("citaActiva", JSON.stringify(cita));

    const { data: atencionExistente, error: errorBuscar } = await supabase
      .from("atenciones_clinicas")
      .select("*")
      .eq("cita_id", cita.id)
      .eq("empresa_id", cita.empresa_id)
      .maybeSingle();

    if (errorBuscar) {
      console.error(errorBuscar);
      return alert("Error al revisar la atención clínica");
    }

    let atencion = atencionExistente;

    if (!atencionExistente) {
      const { data: nuevaAtencion, error: errorCrear } = await supabase
        .from("atenciones_clinicas")
        .insert([
          {
            empresa_id: cita.empresa_id,
            cita_id: cita.id,
            cliente_id: cita.cliente_id,
            fecha_atencion: obtenerFechaSV(),
            hora_inicio: normalizarHora(cita.hora),
            estado: "en_proceso",
            origen: "cita",
            observacion: "",
          },
        ])
        .select()
        .single();

      if (errorCrear) {
        console.error(errorCrear);
        return alert("Error al crear la atención clínica");
      }

      atencion = nuevaAtencion;
    }

    const { error } = await supabase
      .from("citas")
      .update({ estado: "atendida" })
      .eq("id", cita.id);

    if (error) {
      console.error(error);
      return alert("Error al marcar como atendida");
    }

    localStorage.setItem(
      "atencionActiva",
      JSON.stringify({
        ...atencion,
        clientes: cita.clientes,
        empresas: cita.empresas,
        cita,
      })
    );

    await obtenerCitas();

    if (typeof onNavigate === "function") {
      onNavigate("atencionClinica");
    } else {
      window.dispatchEvent(new Event("irAAtencionClinica"));
    }
  };

  const limpiarFormulario = () => {
    setClienteSeleccionado("");
    setBusquedaPacienteCita("");
    setMostrarDropdownPacientes(false);
    setFecha(fechaSeleccionada || obtenerFechaSV());
    setHora("08:00");
    setMinuto("00");
    setTipoCita("normal");
    setComentario("");
    setCitaEditando(null);
  };

  const cerrarModalCita = () => {
    limpiarFormulario();
    setMostrarModalCita(false);
  };

  const abrirNuevaCitaManual = () => {
    setFecha(fechaSeleccionada || obtenerFechaSV());
    setHora("08:00");
    setMinuto("00");
    setClienteSeleccionado("");
    setTipoCita("normal");
    setComentario("");
    setCitaEditando(null);
    setMostrarModalCita(true);
  };

  const moverMes = (delta) => {
    const [y, m] = mesVisible.split("-").map(Number);
    const nuevo = new Date(y, m - 1 + delta, 1);
    const nuevoMes = `${nuevo.getFullYear()}-${String(nuevo.getMonth() + 1).padStart(2, "0")}`;
    setMesVisible(nuevoMes);
  };

  const moverFecha = (dias) => {
    const [y, m, d] = fechaSeleccionada.split("-").map(Number);
    const nueva = new Date(y, m - 1, d);
    nueva.setDate(nueva.getDate() + dias);
    const nuevaTexto = formatoFechaLocal(nueva);
    setFechaSeleccionada(nuevaTexto);
    setFecha(nuevaTexto);
    setMesVisible(nuevaTexto.slice(0, 7));
  };

  const moverAnterior = () => {
    if (vista === "mes") {
      moverMes(-1);
      return;
    }

    const base = new Date(`${fechaSeleccionada}T00:00:00`);
    base.setDate(base.getDate() - (vista === "semana" ? 7 : 1));

    const nuevaFecha = formatoFechaLocal(base);

    setFechaSeleccionada(nuevaFecha);
    setFecha(nuevaFecha);
    setMesVisible(nuevaFecha.slice(0, 7));

    // Mantener sincronizado el filtro de HOY/lista
    if (vista !== "mes") {
      setFiltroDesde(nuevaFecha);
      setFiltroHasta(nuevaFecha);
    }
  };

  const moverSiguiente = () => {
    if (vista === "mes") {
      moverMes(1);
      return;
    }

    const base = new Date(`${fechaSeleccionada}T00:00:00`);
    base.setDate(base.getDate() + (vista === "semana" ? 7 : 1));

    const nuevaFecha = formatoFechaLocal(base);

    setFechaSeleccionada(nuevaFecha);
    setFecha(nuevaFecha);
    setMesVisible(nuevaFecha.slice(0, 7));

    // Mantener sincronizado el filtro de HOY/lista
    if (vista !== "mes") {
      setFiltroDesde(nuevaFecha);
      setFiltroHasta(nuevaFecha);
    }
  };

  const irHoy = () => {
    const hoy = obtenerFechaSV();

    setFechaSeleccionada(hoy);
    setFecha(hoy);
    setMesVisible(hoy.slice(0, 7));

    // Cuando estamos en lista, el botón HOY debe filtrar realmente solo las citas de hoy.
    setFiltroDesde(hoy);
    setFiltroHasta(hoy);
    setHoraSeleccionadaLista("");

    if (vista !== "mes") {
      setVista("lista");
    }
  };

  if (!empresa) {
    return <div style={styles.emptyState}>No hay empresa seleccionada</div>;
  }

  return (
    <>
      <div style={styles.page}>
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Citas</h1>
            <p style={styles.subtitle}>
              Agenda mensual, semanal y diaria con pacientes, teléfono y prioridad.
            </p>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.activeCompanyBox}>
              <label style={styles.labelMini}>Empresa activa para guardar</label>
              {empresasUsuario.length > 1 ? (
                <select
                  style={styles.empresaSelect}
                  value={empresa?.id || ""}
                  onChange={(e) => cambiarEmpresaActiva(e.target.value)}
                >
                  {empresasUsuario.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{empresa?.nombre || "Empresa"}</strong>
              )}
            </div>

            <div style={styles.headerEmpresaSelect}>
              <div style={styles.headerEmpresaTop}>
                <span style={styles.headerEmpresaLabel}>Empresas a combinar</span>
                <div style={styles.headerEmpresaActions}>
                  <button type="button" style={styles.miniBtn} onClick={seleccionarSoloEmpresaActiva}>
                    Solo activa
                  </button>
                  <button type="button" style={styles.miniBtn} onClick={seleccionarTodasEmpresas}>
                    Todas
                  </button>
                </div>
              </div>

              <div style={styles.multiSelectWrap}>
                <button
                  type="button"
                  style={styles.multiSelectButton}
                  onClick={() => setMostrarSelectorEmpresas((prev) => !prev)}
                >
                  <span>{tituloEmpresasReporte}</span>
                  <span style={styles.multiSelectArrow}>{mostrarSelectorEmpresas ? "▴" : "▾"}</span>
                </button>

                {mostrarSelectorEmpresas && (
                  <div style={styles.multiSelectMenu}>
                    {empresasUsuario.map((emp) => {
                      const checked = empresasConsultaIds.some((id) => String(id) === String(emp.id));

                      return (
                        <label
                          key={emp.id}
                          style={{
                            ...styles.multiSelectOption,
                            ...(checked ? styles.multiSelectOptionActive : {}),
                          }}
                        >
                          <span style={styles.fakeCheckbox}>{checked ? "✓" : ""}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEmpresaReporte(emp.id)}
                            style={styles.hiddenCheckbox}
                          />
                          <span style={styles.empresaListName}>{emp.nombre}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={styles.toolbar}>
          <div style={styles.viewButtons}>
            <button
              style={vista === "mes" ? styles.viewBtnActive : styles.viewBtn}
              onClick={() => setVista("mes")}
            >
              Mes
            </button>
            <button
              style={vista === "semana" ? styles.viewBtnActive : styles.viewBtn}
              onClick={() => setVista("semana")}
            >
              Semana
            </button>
            <button
              style={vista === "dia" ? styles.viewBtnActive : styles.viewBtn}
              onClick={() => setVista("dia")}
            >
              Día
            </button>
            {vista === "lista" && (
              <button
                style={styles.viewBtnActive}
                onClick={() => setVista("dia")}
              >
                Lista
              </button>
            )}
          </div>

          <div style={styles.navButtons}>
            <button style={styles.btnGuardar} onClick={abrirModalReporte}>
              Reporte
            </button>
            <button style={styles.btnGuardar} onClick={abrirConfirmaciones}>
              Confirmar Citas
            </button>
            <button style={styles.btnSecundario} onClick={moverAnterior}>←</button>
            <button style={styles.btnSecundario} onClick={irHoy}>Hoy</button>
            <button style={styles.btnSecundario} onClick={moverSiguiente}>→</button>
            <select
              style={styles.estadoSelect}
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="pendientes">Por Atender</option>
              <option value="llegaron">Ya llegaron</option>
              <option value="atendidas">Atendidas</option>
              <option value="canceladas">Canceladas</option>
              <option value="todas">Todas</option>
            </select>
          </div>
        </div>

        <div style={styles.filtersCard}>
          <input
            style={styles.input}
            placeholder="🔎 Buscar paciente, teléfono, empresa o comentario..."
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />

          <input
            style={styles.input}
            type="date"
            value={filtroDesde}
            onChange={(e) => setFiltroDesde(e.target.value)}
            title="Desde"
          />

          <input
            style={styles.input}
            type="date"
            value={filtroHasta}
            onChange={(e) => setFiltroHasta(e.target.value)}
            title="Hasta"
          />

          <select style={styles.input} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="todos">Todas las prioridades</option>
            <option value="normal">Normal</option>
            <option value="importante">Importante</option>
            <option value="emergencia">Emergencia</option>
          </select>

          {horaSeleccionadaLista && (
            <div style={styles.hourFilterBadge}>
              Hora: <strong>{horaSeleccionadaLista}</strong>
              <button type="button" style={styles.clearHourBtn} onClick={() => setHoraSeleccionadaLista("")}>
                ✕
              </button>
            </div>
          )}

          <button type="button" style={styles.btnSecundario} onClick={limpiarFiltrosVista}>
            Limpiar filtros
          </button>
        </div>

        <div style={styles.topSections}>
          <div style={styles.cardTop}>
            <div style={styles.cardHeader}>
              <h3 style={styles.sectionTitle}>Nueva cita</h3>
              <p style={styles.sectionSubtitle}>
                Haz clic en una hora de la agenda o creala manualmente desde el botón.
              </p>
            </div>

            <div style={styles.quickCreateBox}>
              <div>
                <strong style={styles.quickCreateTitle}>
                  {formatearFechaPantalla(fechaSeleccionada)}
                </strong>
                <div style={styles.quickCreateText}>
                  Día seleccionado para agendar.
                </div>
              </div>

              <button style={styles.btnGuardar} onClick={abrirNuevaCitaManual}>
                + Crear cita
              </button>
            </div>
          </div>

          <div style={styles.cardTop}>
            <div style={styles.cardHeader}>
              <h3 style={styles.sectionTitle}>Día seleccionado</h3>
              <p style={styles.sectionSubtitle}>
                {formatearFechaPantalla(fechaSeleccionada)}
              </p>
            </div>

            <div style={styles.selectedDaySummary}>
              <div>
                <span style={styles.summaryLabel}>Citas del día</span>
                <strong style={styles.summaryNumber}>{citasDelDia.length}</strong>
              </div>
              <div style={styles.summaryText}>
                Las citas se muestran abajo dentro de cada hora. Dale clic a una hora para ver todos los pacientes de esa hora en lista.
              </div>
            </div>
          </div>
        </div>

        {cargando ? (
          <div style={styles.cardMain}>Cargando citas...</div>
        ) : (
          <>
            {vista === "mes" && (
              <CalendarioMes
                mesVisible={mesVisible}
                citasPorFecha={citasPorFecha}
                fechaSeleccionada={fechaSeleccionada}
                onSelectFecha={seleccionarFecha}
                leerServicio={leerServicio}
              />
            )}

            {vista === "semana" && (
              <AgendaSemana
                diasSemana={diasSemana}
                horasDelDia={horasDelDia}
                citas={citasFiltradasVista}
                fechaSeleccionada={fechaSeleccionada}
                setFechaSeleccionada={setFechaSeleccionada}
                onNuevo={seleccionarHoraNueva}
                onVerHora={verCitasDeHora}
                onEditar={editarCita}
                onCancelar={cancelarCita}
                onEliminar={eliminarCita}
                onConfirmar={confirmarCita}
                onReagendar={abrirModalReagendar}
                onAtender={atender}
                onLlegada={marcarPacienteLlego}
                obtenerNombreEmpresa={obtenerNombreEmpresa}
                leerServicio={leerServicio}
              />
            )}

            {vista === "dia" && (
              <AgendaDia
                fechaSeleccionada={fechaSeleccionada}
                horasDelDia={horasDelDia}
                citas={citasDelDia}
                onNuevo={seleccionarHoraNueva}
                onVerHora={verCitasDeHora}
                onEditar={editarCita}
                onCancelar={cancelarCita}
                onEliminar={eliminarCita}
                onConfirmar={confirmarCita}
                onReagendar={abrirModalReagendar}
                onAtender={atender}
                onLlegada={marcarPacienteLlego}
                obtenerNombreEmpresa={obtenerNombreEmpresa}
                leerServicio={leerServicio}
              />
            )}

            {vista === "lista" && (
              <ListaCitas
                citas={citasFiltradasVista}
                horaSeleccionadaLista={horaSeleccionadaLista}
                fechaSeleccionada={fechaSeleccionada}
                onEditar={editarCita}
                onCancelar={cancelarCita}
                onEliminar={eliminarCita}
                onConfirmar={confirmarCita}
                onReagendar={abrirModalReagendar}
                onAtender={atender}
                onLlegada={marcarPacienteLlego}
                obtenerNombreEmpresa={obtenerNombreEmpresa}
                leerServicio={leerServicio}
              />
            )}
          </>
        )}
      </div>

      {mostrarModalReporte && (
        <div style={styles.modalOverlay} onClick={() => setMostrarModalReporte(false)}>
          <div style={styles.modalReporte} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, color: "#574866" }}>Reporte editable de citas</h3>
                <p style={styles.modalSubText}>
                  Marcá columnas y exportá el reporte.
                </p>
              </div>
              <button type="button" style={styles.btnCerrarModal} onClick={() => setMostrarModalReporte(false)}>
                ✖
              </button>
            </div>

            <div style={styles.reportFiltersGrid}>
              <input
                style={styles.input}
                type="date"
                value={reporteDesde}
                onChange={(e) => setReporteDesde(e.target.value)}
                title="Desde"
              />

              <input
                style={styles.input}
                type="date"
                value={reporteHasta}
                onChange={(e) => setReporteHasta(e.target.value)}
                title="Hasta"
              />

              <select
                style={styles.input}
                value={reporteEstado}
                onChange={(e) => setReporteEstado(e.target.value)}
              >
                <option value="todos">Todos los estados</option>
                <option value="pendiente">Por Atender</option>
                <option value="atendida">Atendidas</option>
                <option value="cancelada">Canceladas</option>
                <option value="confirmadas">Confirmadas</option>
                <option value="sin_confirmar">Sin confirmar</option>
              </select>

              <select
                style={styles.input}
                value={reportePrioridad}
                onChange={(e) => setReportePrioridad(e.target.value)}
              >
                <option value="todos">Todas las prioridades</option>
                <option value="normal">Normal</option>
                <option value="importante">Importante</option>
                <option value="emergencia">Emergencia</option>
              </select>

              <input
                style={styles.input}
                placeholder="Buscar paciente, teléfono, empresa o comentario..."
                value={reporteTexto}
                onChange={(e) => setReporteTexto(e.target.value)}
              />

              <div style={styles.reportCounter}>
                {citasReporteFiltradas.length} cita(s)
              </div>
            </div>

            <div style={styles.columnGrid}>
              {columnasReporteDef.map((col) => (
                <label key={col.key} style={styles.columnCheck}>
                  <input
                    type="checkbox"
                    checked={Boolean(columnasReporte[col.key])}
                    onChange={() => toggleColumnaReporte(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>

            <div style={styles.modalActions}>
              <button style={styles.btnGuardarModal} onClick={exportarReporteExcel}>
                Exportar Excel
              </button>
              <button style={styles.btnGuardarModal} onClick={exportarReportePDF}>
                Exportar PDF
              </button>
              <button style={styles.btnCancelarModal} onClick={() => setMostrarModalReporte(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalConfirmar && (
        <div style={styles.modalOverlay} onClick={() => setMostrarModalConfirmar(false)}>
          <div style={styles.modalConfirmar} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, color: "#574866" }}>Confirmar citas</h3>
                <p style={styles.modalSubText}>
                  Elegí la fecha, filtrá pacientes y enviá el enlace por WhatsApp.
                </p>
              </div>
              <button type="button" style={styles.btnCerrarModal} onClick={() => setMostrarModalConfirmar(false)}>
                ✖
              </button>
            </div>

            <div style={styles.confirmToolbarPro}>
              <input
                type="date"
                style={styles.input}
                value={fechaConfirmacion}
                onChange={(e) => setFechaConfirmacion(e.target.value)}
              />

              <input
                style={styles.input}
                placeholder="Buscar paciente, teléfono, empresa o comentario..."
                value={confirmacionTexto}
                onChange={(e) => setConfirmacionTexto(e.target.value)}
              />

              <select
                style={styles.input}
                value={confirmacionPrioridad}
                onChange={(e) => setConfirmacionPrioridad(e.target.value)}
              >
                <option value="todos">Todas las prioridades</option>
                <option value="normal">Normal</option>
                <option value="importante">Importante</option>
                <option value="emergencia">Emergencia</option>
              </select>

              <select
                style={styles.input}
                value={confirmacionEstado}
                onChange={(e) => setConfirmacionEstado(e.target.value)}
              >
                <option value="pendientes">Por Atender</option>
                <option value="sin_confirmar">Sin confirmar</option>
                <option value="confirmadas">Confirmadas</option>
                <option value="todos">Todas</option>
              </select>

              <select
                style={styles.input}
                value={confirmacionEmpresaId}
                onChange={(e) => setConfirmacionEmpresaId(e.target.value)}
              >
                <option value="todas">Todas las empresas</option>
                {empresasUsuario.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                ))}
              </select>

              <button style={styles.btnGuardar} onClick={() => cargarCitasConfirmacion(fechaConfirmacion)}>
                Cargar
              </button>
            </div>

            <div style={styles.confirmCounter}>
              Mostrando {citasConfirmacionFiltradas.length} de {citasConfirmacion.length} cita(s)
            </div>

            {cargandoConfirmacion ? (
              <div style={styles.emptyState}>Cargando citas...</div>
            ) : citasConfirmacionFiltradas.length === 0 ? (
              <div style={styles.emptyState}>No hay citas por atender para esa fecha.</div>
            ) : (
              <div style={styles.confirmList}>
                {citasConfirmacionFiltradas.map((cita) => {
                  const info = leerServicio(cita.servicio);
                  return (
                    <div key={cita.id} style={{ ...styles.confirmItem, ...prioridadBorderStyle(info.tipo) }}>
                      <div>
                        <strong>{normalizarHora(cita.hora)} · {cita.clientes?.nombre || "Paciente"}</strong>
                        <div style={styles.citaMiniText}>📞 {cita.clientes?.telefono || "Sin teléfono"}</div>
                        <div style={styles.empresaTag}>{obtenerNombreEmpresa(cita.empresa_id, cita.empresas)}</div>
      {cita.paciente_llego && (
        <div style={styles.llegadaTag}>
          {cita.hora_llegada ? normalizarHora(cita.hora_llegada) : "Llegó"}
        </div>
      )}
                        {info.comentario && <div style={styles.citaMiniText}>{info.comentario}</div>}
                      </div>

                      <div style={styles.confirmActions}>
                        <button style={styles.btnMiniOk} onClick={() => marcarConfirmada(cita)}>Confirmada</button>
                        <button style={styles.btnMiniWarn} onClick={() => marcarSinConfirmar(cita)}>No respondió</button>
                        <button style={styles.btnMiniSoft} onClick={() => abrirModalReagendar(cita)}>Reagendar</button>
                        <button
                          style={styles.btnMiniWhats}
                          onClick={() => abrirWhatsapp(cita)}
                          title="Abrir WhatsApp con mensaje personalizado"
                        >
                          WhatsApp
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {mostrarModalReagendar && citaParaReagendar && (
        <div style={styles.modalOverlay} onClick={() => setMostrarModalReagendar(false)}>
          <div style={styles.modalCita} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, color: "#574866" }}>Reagendar cita</h3>
                <p style={styles.modalSubText}>
                  {citaParaReagendar.clientes?.nombre || "Paciente"} · cupos visibles por bloque de 15 minutos.
                </p>
              </div>
              <button type="button" style={styles.btnCerrarModal} onClick={() => setMostrarModalReagendar(false)}>
                ✖
              </button>
            </div>

            <div style={styles.grid}>
              <input
                style={styles.input}
                type="date"
                value={fechaReagendar}
                onChange={async (e) => {
                  const nuevaFecha = e.target.value;
                  setFechaReagendar(nuevaFecha);
                  const data = await obtenerCitasPorFechaParaEmpresa(nuevaFecha, citaParaReagendar.empresa_id || empresa?.id);
                  setCitasNuevaFecha(data);
                }}
              />

              <div style={styles.timeGrid}>
                <select style={styles.input} value={horaReagendar} onChange={(e) => setHoraReagendar(e.target.value)}>
                  {horasDelDia.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>

                <select style={styles.input} value={minutoReagendar} onChange={(e) => setMinutoReagendar(e.target.value)}>
                  {minutosDisponibles.map((m) => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={styles.cuposBox}>
              {horasDelDia.map((h) => (
                <button
                  key={h}
                  type="button"
                  style={{
                    ...styles.cupoHora,
                    ...(horaReagendar === h ? styles.cupoHoraActiva : {}),
                    ...(contarCitasEnHora(h, minutoReagendar) >= 4 ? styles.cupoHoraLlena : {}),
                  }}
                  onClick={() => setHoraReagendar(h)}
                >
                  <strong>{h.slice(0, 2)}:{minutoReagendar}</strong>
                  <span>{contarCitasEnHora(h, minutoReagendar)} paciente(s)</span>
                </button>
              ))}
            </div>

            <div style={styles.modalActions}>
              <button style={styles.btnGuardarModal} onClick={confirmarReagendar}>
                Guardar reagenda
              </button>
              <button style={styles.btnCancelarModal} onClick={() => setMostrarModalReagendar(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalCita && (
        <div style={styles.modalOverlay} onClick={cerrarModalCita}>
          <div style={styles.modalCita} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, color: "#574866" }}>
                  {citaEditando ? "Editar cita" : "Nueva cita"}
                </h3>
                <p style={styles.modalSubText}>
                  {formatearFechaPantalla(fecha)} · {String(hora).slice(0, 2)}:{minuto}
                </p>
              </div>

              <button type="button" style={styles.btnCerrarModal} onClick={cerrarModalCita}>
                ✖
              </button>
            </div>

            <div style={styles.grid}>
              <div style={styles.patientPickerBox}>
                <div style={styles.patientSearchRow}>
                  <div style={styles.patientDropdownWrap}>
                    <input
                      style={{ ...styles.input, marginBottom: 0 }}
                      value={busquedaPacienteCita}
                      onFocus={() => setMostrarDropdownPacientes(true)}
                      onChange={(e) => {
                        setBusquedaPacienteCita(e.target.value);
                        setClienteSeleccionado("");
                        setMostrarDropdownPacientes(true);
                      }}
                      placeholder="Buscar paciente por nombre o teléfono..."
                    />

                    {mostrarDropdownPacientes && (
                      <div style={styles.patientDropdown}>
                        <div style={styles.patientDropdownHeader}>
                          <span>
                            {clientesFiltradosCita.length} resultado(s)
                          </span>
                          <button
                            type="button"
                            style={styles.patientDropdownClose}
                            onClick={() => setMostrarDropdownPacientes(false)}
                          >
                            Cerrar
                          </button>
                        </div>

                        {clientesFiltradosCita.length === 0 ? (
                          <div style={styles.patientEmpty}>
                            No aparece el paciente. Podés crearlo con “+ Paciente”.
                          </div>
                        ) : (
                          clientesFiltradosCita.map((c) => {
                            const activo = String(clienteSeleccionado) === String(c.id);

                            return (
                              <button
                                key={c.id}
                                type="button"
                                style={{
                                  ...styles.patientOption,
                                  ...(activo ? styles.patientOptionActive : {}),
                                }}
                                onClick={() => {
                                  setClienteSeleccionado(c.id);
                                  setBusquedaPacienteCita(c.nombre || "");
                                  setMostrarDropdownPacientes(false);
                                }}
                              >
                                <strong>{c.nombre}</strong>
                                {c.telefono && <span>{c.telefono}</span>}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  <button type="button" style={styles.btnNuevoCliente} onClick={abrirModalCliente}>
                    + Paciente
                  </button>
                </div>

                {clienteSeleccionado && (
                  <div style={styles.patientSelectedBadge}>
                    Paciente seleccionado: <strong>{busquedaPacienteCita}</strong>
                  </div>
                )}
              </div>

              <input
                style={styles.input}
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  setFechaSeleccionada(e.target.value || fechaSeleccionada);
                }}
              />

              <div style={styles.timeGrid}>
                <select style={styles.input} value={hora} onChange={(e) => setHora(e.target.value)}>
                  {horasDelDia.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>

                <select style={styles.input} value={minuto} onChange={(e) => setMinuto(e.target.value)}>
                  {minutosDisponibles.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </div>

              <select style={styles.input} value={tipoCita} onChange={(e) => setTipoCita(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="importante">Importante</option>
                <option value="emergencia">Emergencia</option>
              </select>

              <textarea
                style={styles.textarea}
                placeholder="Observación o comentario opcional"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
            </div>

            <div style={styles.modalActions}>
              <button style={styles.btnGuardarModal} onClick={guardarCita}>
                {citaEditando ? "Actualizar cita" : "Guardar cita"}
              </button>

              <button style={styles.btnCancelarModal} onClick={cerrarModalCita}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalCliente && (
        <div style={styles.modalOverlay} onClick={cerrarModalCliente}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: "#574866" }}>👤 Nuevo paciente</h3>
              <button type="button" style={styles.btnCerrarModal} onClick={cerrarModalCliente}>
                ✖
              </button>
            </div>

            <input
              style={styles.input}
              placeholder="Nombre del paciente"
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
                {guardandoCliente ? "Guardando..." : "Guardar paciente"}
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

function CalendarioMes({ mesVisible, citasPorFecha, fechaSeleccionada, onSelectFecha, leerServicio }) {
  const dias = construirDiasMes(mesVisible);

  return (
    <div style={styles.cardMain}>
      <div style={styles.cardHeader}>
        <h3 style={styles.sectionTitle}>Calendario mensual</h3>
        <p style={styles.sectionSubtitle}>
          <span style={styles.monthTiny}>{nombreMes(mesVisible)}</span> · Click en un día para ver sus horas y citas.
        </p>
      </div>

      <div style={styles.monthGridHeader}>
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div key={d} style={styles.monthHeaderDay}>{d}</div>
        ))}
      </div>

      <div style={styles.monthGrid}>
        {dias.map((dia, index) => {
          const citasDia = citasPorFecha[dia.fecha] || [];
          const activo = dia.fecha === fechaSeleccionada;

          return (
            <button
              key={`${dia.fecha}-${index}`}
              style={{
                ...styles.monthCell,
                opacity: dia.esMesActual ? 1 : 0.45,
                ...(activo ? styles.monthCellActive : {}),
              }}
              onClick={() => onSelectFecha(dia.fecha)}
            >
              <div style={styles.monthCellDay}>{dia.dia}</div>

              <div style={styles.monthCitasWrap}>
                {citasDia.slice(0, 3).map((cita) => {
                  const info = leerServicio(cita.servicio);
                  return (
                    <span
                      key={cita.id}
                      style={{
                        ...styles.monthCitaDot,
                        ...prioridadStyle(info.tipo),
                      }}
                    >
                      {normalizarHora(cita.hora)} {cita.clientes?.nombre || "Paciente"}
                    </span>
                  );
                })}
                {citasDia.length > 3 && (
                  <span style={styles.moreCitas}>+{citasDia.length - 3} más</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AgendaSemana({
  diasSemana,
  horasDelDia,
  citas,
  fechaSeleccionada,
  setFechaSeleccionada,
  onNuevo,
  onVerHora,
  onEditar,
  onCancelar,
  onEliminar,
  onConfirmar,
  onReagendar,
  onAtender,
  onLlegada,
  obtenerNombreEmpresa,
  leerServicio,
}) {
  return (
    <div style={styles.cardMain}>
      <div style={styles.cardHeader}>
        <h3 style={styles.sectionTitle}>Agenda semanal</h3>
        <p style={styles.sectionSubtitle}>Días como encabezado y horas a la izquierda.</p>
      </div>

      <div style={styles.weekTable}>
        <div style={styles.weekCorner}>Hora</div>
        {diasSemana.map((dia) => (
          <button
            key={dia.fecha}
            style={{
              ...styles.weekDayHeader,
              ...(dia.fecha === fechaSeleccionada ? styles.weekDayHeaderActive : {}),
            }}
            onClick={() => setFechaSeleccionada(dia.fecha)}
          >
            <span>{dia.nombre}</span>
            <strong>{dia.dia}</strong>
          </button>
        ))}

        {horasDelDia.map((hora) => (
          <FragmentWeekRow
            key={hora}
            hora={hora}
            diasSemana={diasSemana}
            citas={citas}
            onNuevo={onNuevo}
            onVerHora={onVerHora}
            onEditar={onEditar}
            onCancelar={onCancelar}
            onEliminar={onEliminar}
            onConfirmar={onConfirmar}
            onReagendar={onReagendar}
            onAtender={onAtender}
            onLlegada={onLlegada}
            obtenerNombreEmpresa={obtenerNombreEmpresa}
            leerServicio={leerServicio}
          />
        ))}
      </div>
    </div>
  );
}

function FragmentWeekRow({
  hora,
  diasSemana,
  citas,
  onNuevo,
  onVerHora,
  onEditar,
  onCancelar,
  onEliminar,
  onConfirmar,
  onReagendar,
  onAtender,
  onLlegada,
  obtenerNombreEmpresa,
  leerServicio,
}) {
  return (
    <>
      <div style={styles.weekHour}>{hora}</div>
      {diasSemana.map((dia) => {
        const citasCelda = citas.filter(
          (c) => String(c.fecha).slice(0, 10) === dia.fecha && obtenerHoraBase(c.hora) === hora
        );

        return (
          <div
            key={`${dia.fecha}-${hora}`}
            style={styles.weekCell}
            onClick={() => (citasCelda.length > 0 ? onVerHora(dia.fecha, hora) : onNuevo(dia.fecha, hora))}
          >
            {citasCelda.map((cita) => (
              <div key={cita.id} onClick={(e) => e.stopPropagation()}>
                <CitaMini
                  cita={cita}
                  onEditar={onEditar}
                  onCancelar={onCancelar}
                  onEliminar={onEliminar}
                  onConfirmar={onConfirmar}
                  onReagendar={onReagendar}
                  onAtender={onAtender}
                  onLlegada={onLlegada}
                  obtenerNombreEmpresa={obtenerNombreEmpresa}
                  leerServicio={leerServicio}
                />
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function AgendaDia({
  fechaSeleccionada,
  horasDelDia,
  citas,
  onNuevo,
  onVerHora,
  onEditar,
  onCancelar,
  onEliminar,
  onConfirmar,
  onReagendar,
  onAtender,
  onLlegada,
  obtenerNombreEmpresa,
  leerServicio,
}) {
  return (
    <div style={styles.cardMain}>
      <div style={styles.cardHeader}>
        <h3 style={styles.sectionTitle}>Agenda del día</h3>
        <p style={styles.sectionSubtitle}>{formatearFechaPantalla(fechaSeleccionada)}</p>
      </div>

      <div style={styles.dayAgenda}>
        {horasDelDia.map((h) => {
          const citasHora = citas.filter((c) => obtenerHoraBase(c.hora) === h);

          return (
            <div key={h} style={styles.daySlot}>
              <div style={styles.dayHour}>{h}</div>

              <div
                style={styles.daySlotContent}
                onClick={() => citasHora.length > 0 && onVerHora(fechaSeleccionada, h)}
              >
                {citasHora.length === 0 ? (
                  <span style={styles.emptyHour}>Sin citas registradas</span>
                ) : (
                  <div style={styles.hourPatientsWrap}>
                    {citasHora.map((cita) => {
                      const info = leerServicio(cita.servicio);

                      return (
                        <div
                          key={cita.id}
                          style={{
                            ...styles.hourPatientChip,
                            ...prioridadBorderStyle(info.tipo),
                          }}
                        >
                          <strong>{normalizarHora(cita.hora)} · {cita.clientes?.nombre || "Paciente"}</strong>
                          <span>{cita.clientes?.telefono || "Sin teléfono"}</span>
                          <span style={{ ...styles.tipoBadgeMini, ...prioridadStyle(info.tipo) }}>
                            {labelTipo(info.tipo)}
                          </span>
                          {cita.paciente_llego && (
                            <span style={styles.llegadaTagMini}>
                              {cita.hora_llegada ? normalizarHora(cita.hora_llegada) : "Llegó"}
                            </span>
                          )}
                          {cita.estado !== "cancelada" && (
                            <button
                              type="button"
                              style={cita.paciente_llego ? styles.btnMiniLlegadaActiva : styles.btnMiniLlegada}
                              onClick={(e) => {
                                e.stopPropagation();
                                onLlegada?.(cita);
                              }}
                            >
                              {cita.paciente_llego ? "✓" : "Llegó"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                style={styles.addHourBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onNuevo(fechaSeleccionada, h);
                }}
                title={`Agregar cita a las ${h}`}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListaCitas({
  citas,
  horaSeleccionadaLista,
  fechaSeleccionada,
  onEditar,
  onCancelar,
  onEliminar,
  onConfirmar,
  onReagendar,
  onAtender,
  onLlegada,
  obtenerNombreEmpresa,
  leerServicio,
}) {
  return (
    <div style={styles.cardMain}>
      <div style={styles.cardHeader}>
        <h3 style={styles.sectionTitle}>Listado de citas</h3>
        <p style={styles.sectionSubtitle}>
          {horaSeleccionadaLista
            ? `Pacientes agendados el ${formatearFechaPantalla(fechaSeleccionada)} a las ${horaSeleccionadaLista}`
            : "Vista completa para editar, confirmar, atender o eliminar."}
        </p>
      </div>

      {citas.length === 0 ? (
        <div style={styles.emptyState}>No hay citas en el rango actual.</div>
      ) : (
        <div style={styles.citasGrid}>
          {citas.map((cita) => (
            <CitaCard
              key={cita.id}
              cita={cita}
              onEditar={onEditar}
              onCancelar={onCancelar}
              onEliminar={onEliminar}
              onConfirmar={onConfirmar}
              onReagendar={onReagendar}
              onAtender={onAtender}
              onLlegada={onLlegada}
              obtenerNombreEmpresa={obtenerNombreEmpresa}
              leerServicio={leerServicio}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CitaCompacta({ cita }) {
  const info = leerServicio(cita.servicio);

  return (
    <div style={{ ...styles.compactRow, ...prioridadBorderStyle(info.tipo) }}>
      <div>
        <strong>{normalizarHora(cita.hora)} · {cita.clientes?.nombre || "Paciente"}</strong>
        <div style={styles.compactText}>📞 {cita.clientes?.telefono || "Sin teléfono"}</div>
      </div>
      <span style={{ ...styles.tipoBadge, ...prioridadStyle(info.tipo) }}>{labelTipo(info.tipo)}</span>
    </div>
  );
}

function CitaMini({
  cita,
  onEditar,
  onCancelar,
  onEliminar,
  onConfirmar,
  onReagendar,
  onAtender,
  onLlegada,
  obtenerNombreEmpresa,
  leerServicio,
}) {
  const info = leerServicio(cita.servicio);

  return (
    <div style={{ ...styles.citaMini, ...prioridadBorderStyle(info.tipo) }}>
      <div style={styles.citaMiniTop}>
        <strong>{cita.clientes?.nombre || "Paciente"}</strong>
        <span style={{ ...styles.tipoBadge, ...prioridadStyle(info.tipo) }}>{labelTipo(info.tipo)}</span>
      </div>

      <div style={styles.citaMiniText}>📞 {cita.clientes?.telefono || "Sin teléfono"}</div>
      <div style={styles.empresaTag}>{obtenerNombreEmpresa(cita.empresa_id, cita.empresas)}</div>
      {cita.paciente_llego && (
        <div style={styles.llegadaTag}>
          {cita.hora_llegada ? normalizarHora(cita.hora_llegada) : "Llegó"}
        </div>
      )}
      {info.comentario && <div style={styles.citaMiniText}>{info.comentario}</div>}

      <div style={styles.actions}>
        <button style={styles.iconBtn} onClick={() => onEditar(cita)}>✏️</button>
        <button style={styles.iconBtn} onClick={() => onCancelar(cita)}>❌</button>
        <button style={styles.iconBtn} onClick={() => onEliminar(cita)}>🗑</button>
        <button style={styles.iconBtn} onClick={() => onReagendar(cita)}>📅</button>
        <button
          style={cita.paciente_llego ? styles.iconBtnLlegadaActiva : styles.iconBtnLlegada}
          onClick={() => onLlegada?.(cita)}
          title={cita.paciente_llego ? "Paciente ya llegó" : "Marcar paciente llegó"}
        >
          {cita.paciente_llego ? "✅" : "🚶"}
        </button>
        <button style={styles.iconBtn} onClick={() => onAtender(cita)}>🦷</button>
        <button style={styles.iconBtn} onClick={() => onConfirmar(cita)}>
          {cita.confirmada ? "✅" : "✔"}
        </button>
      </div>
    </div>
  );
}

function CitaCard(props) {
  const { cita, obtenerNombreEmpresa, leerServicio } = props;
  const info = leerServicio(cita.servicio);

  return (
    <div style={{ ...styles.citaCard, ...prioridadBorderStyle(info.tipo) }}>
      <div style={styles.badgeTopRow}>
        <span style={{ ...styles.tipoBadge, ...prioridadStyle(info.tipo) }}>{labelTipo(info.tipo)}</span>
        <span
          style={{
            ...styles.estadoBadge,
            background: cita.estado === "pendiente" ? "#fef3c7" : cita.estado === "atendida" ? "#ecfdf5" : "#fef2f2",
            color: cita.estado === "pendiente" ? "#92400e" : cita.estado === "atendida" ? "#166534" : "#991b1b",
            borderColor: cita.estado === "pendiente" ? "#fde68a" : cita.estado === "atendida" ? "#bbf7d0" : "#fecaca",
          }}
        >
          {cita.estado}
        </span>
        <span
          style={{
            ...styles.estadoBadge,
            background: cita.confirmada ? "#eefcf3" : "#f8f8fa",
            color: cita.confirmada ? "#0f7a4d" : "#475569",
            borderColor: cita.confirmada ? "#c7eed5" : "#d7dbe2",
          }}
        >
          {cita.confirmada ? "Confirmada" : "Sin confirmar"}
        </span>
      </div>

      <strong style={styles.citaNombre}>{cita.clientes?.nombre || "Sin nombre"}</strong>
      <div style={styles.empresaTag}>{obtenerNombreEmpresa(cita.empresa_id, cita.empresas)}</div>
      {cita.paciente_llego && (
        <div style={styles.llegadaTag}>
          {cita.hora_llegada ? normalizarHora(cita.hora_llegada) : "Llegó"}
        </div>
      )}
      <div style={styles.citaText}>📞 {cita.clientes?.telefono || "Sin teléfono"}</div>
      <div style={styles.citaText}>📅 {formatearFechaPantalla(cita.fecha)} · ⏰ {normalizarHora(cita.hora)}</div>
      {info.comentario && <div style={styles.citaServicio}>{info.comentario}</div>}

      {cita.estado === "cancelada" && (
        <div style={styles.canceladaInfo}>
          <div><strong>Motivo:</strong> {cita.motivo_cancelacion || "Sin motivo"}</div>
          {cita.desea_reprogramar && cita.fecha_reprogramada && cita.hora_reprogramada && (
            <div>
              <strong>Reagendada:</strong> {formatearFechaPantalla(cita.fecha_reprogramada)} · {normalizarHora(cita.hora_reprogramada)}
            </div>
          )}
        </div>
      )}

      <div style={styles.actions}>
        {cita.estado !== "cancelada" && (
          <>
            <button style={styles.iconBtn} onClick={() => props.onEditar(cita)}>✏️</button>
            <button style={styles.iconBtn} onClick={() => props.onCancelar(cita)}>❌</button>
            <button style={styles.iconBtn} onClick={() => props.onEliminar(cita)}>🗑</button>
            <button style={styles.iconBtn} onClick={() => props.onReagendar(cita)}>📅</button>
            <button
              style={cita.paciente_llego ? styles.iconBtnLlegadaActiva : styles.iconBtnLlegada}
              onClick={() => props.onLlegada?.(cita)}
              title={cita.paciente_llego ? "Paciente ya llegó" : "Marcar paciente llegó"}
            >
              {cita.paciente_llego ? "✅" : "🚶"}
            </button>
            <button style={styles.iconBtn} onClick={() => props.onAtender(cita)}>🦷</button>
            <button style={styles.iconBtn} onClick={() => props.onConfirmar(cita)}>
              {cita.confirmada ? "✅" : "✔"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function obtenerFechaSV(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function obtenerMesActual() {
  return obtenerFechaSV().slice(0, 7);
}

function formatoFechaLocal(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizarHora(horaTexto) {
  if (!horaTexto) return "";
  return String(horaTexto).slice(0, 5);
}

function formatearFechaPantalla(fechaTexto) {
  if (!fechaTexto) return "";
  const [yyyy, mm, dd] = String(fechaTexto).slice(0, 10).split("-");
  if (!yyyy || !mm || !dd) return fechaTexto;
  return `${dd}/${mm}/${yyyy}`;
}

function construirDiasMes(mesVisible) {
  const [yyyy, mm] = mesVisible.split("-").map(Number);
  const primero = new Date(yyyy, mm - 1, 1);
  const inicio = new Date(primero);
  const diaSemana = (primero.getDay() + 6) % 7;
  inicio.setDate(primero.getDate() - diaSemana);

  const dias = [];
  for (let i = 0; i < 42; i += 1) {
    const actual = new Date(inicio);
    actual.setDate(inicio.getDate() + i);
    dias.push({
      fecha: formatoFechaLocal(actual),
      dia: actual.getDate(),
      esMesActual: actual.getMonth() === mm - 1,
    });
  }

  return dias;
}

function obtenerSemana(fechaTexto) {
  const [y, m, d] = fechaTexto.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const inicio = new Date(base);
  const diaSemana = (base.getDay() + 6) % 7;
  inicio.setDate(base.getDate() - diaSemana);

  const nombres = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return Array.from({ length: 7 }, (_, i) => {
    const actual = new Date(inicio);
    actual.setDate(inicio.getDate() + i);
    return {
      fecha: formatoFechaLocal(actual),
      nombre: nombres[i],
      dia: actual.getDate(),
    };
  });
}

function limpiarTelefono(telefono) {
  const limpio = String(telefono || "").replace(/\D/g, "");
  if (!limpio) return "";
  if (limpio.length === 8) return `503${limpio}`;
  return limpio;
}

function obtenerHoraBase(horaTexto) {
  const hora = normalizarHora(horaTexto);
  if (!hora) return "";
  return `${hora.slice(0, 2)}:00`;
}

function obtenerMinuto(horaTexto) {
  const hora = normalizarHora(horaTexto);
  if (!hora || !hora.includes(":")) return "00";
  return hora.slice(3, 5) || "00";
}

function nombreMes(mesVisible) {
  if (!mesVisible) return "";
  const [yyyy, mm] = mesVisible.split("-").map(Number);
  const fecha = new Date(yyyy, mm - 1, 1);
  const nombre = fecha.toLocaleDateString("es-SV", {
    month: "long",
    year: "numeric",
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

function construirServicio(tipo, comentario) {
  const t = tipo || "normal";
  const texto = (comentario || "").trim();
  return `[${t.toUpperCase()}]${texto ? ` ${texto}` : ""}`;
}

function leerServicio(servicio) {
  const texto = servicio || "";
  const match = texto.match(/^\[(NORMAL|IMPORTANTE|EMERGENCIA)\]\s*/i);

  if (!match) {
    return {
      tipo: "normal",
      comentario: texto,
    };
  }

  return {
    tipo: match[1].toLowerCase(),
    comentario: texto.replace(match[0], ""),
  };
}

function labelTipo(tipo) {
  if (tipo === "emergencia") return "Emergencia";
  if (tipo === "importante") return "Importante";
  return "Normal";
}

console.log("RESPUESTA PUSH:", pushData);

if (pushError) {
  console.error("Error enviando push:", pushError);
}

function prioridadStyle(tipo) {
  if (tipo === "emergencia") {
    return {
      background: "#fff1f2",
      color: "#be123c",
      borderColor: "#fecdd3",
    };
  }

  if (tipo === "importante") {
    return {
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  return {
    background: "#eefcf3",
    color: "#0f7a4d",
    borderColor: "#c7eed5",
  };
}

function prioridadBorderStyle(tipo) {
  if (tipo === "emergencia") return { borderColor: "#fb7185", boxShadow: "0 0 0 2px rgba(251, 113, 133, 0.14)" };
  if (tipo === "importante") return { borderColor: "#fdba74", boxShadow: "0 0 0 2px rgba(253, 186, 116, 0.14)" };
  return {};
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
    position: "relative",
    zIndex: 20,
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

  headerRight: {
    display: "flex",
    alignItems: "flex-start",
    gap: "14px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  activeCompanyBox: {
    minWidth: 240,
  },

  labelMini: {
    display: "block",
    fontSize: "12px",
    color: "#64748b",
    fontWeight: "700",
    marginBottom: 4,
  },

  empresaSelect: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #d7dbe2",
    background: "#fff",
    color: "#1f2937",
    fontWeight: "700",
    outline: "none",
  },

  headerEmpresaSelect: {
    width: "420px",
    maxWidth: "100%",
    alignSelf: "center",
    position: "relative",
    zIndex: 30,
  },

  headerEmpresaTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    marginBottom: "6px",
  },

  headerEmpresaLabel: {
    color: "#574866",
    fontSize: "12px",
    fontWeight: "800",
  },

  headerEmpresaActions: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },

  miniBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "10px",
    padding: "7px 10px",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "12px",
  },

  multiSelectWrap: {
    position: "relative",
    width: "100%",
  },

  multiSelectButton: {
    width: "100%",
    minHeight: "48px",
    borderRadius: "14px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    color: "#1f2937",
    fontWeight: "800",
    padding: "12px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    cursor: "pointer",
    textAlign: "left",
    boxSizing: "border-box",
  },

  multiSelectArrow: {
    fontSize: "18px",
    color: "#574866",
    flexShrink: 0,
  },

  multiSelectMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    right: 0,
    zIndex: 50,
    maxHeight: "280px",
    overflowY: "auto",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.14)",
    padding: "8px",
    display: "grid",
    gap: "6px",
  },

  multiSelectOption: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid transparent",
    background: "#fff",
    cursor: "pointer",
    color: "#1f2937",
    boxSizing: "border-box",
  },

  multiSelectOptionActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  fakeCheckbox: {
    width: "22px",
    height: "22px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    display: "grid",
    placeItems: "center",
    color: "#2563eb",
    fontWeight: "900",
    flexShrink: 0,
  },

  hiddenCheckbox: {
    display: "none",
  },

  empresaListName: {
    fontWeight: "800",
    lineHeight: 1.2,
    wordBreak: "break-word",
  },

  toolbar: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "20px",
    padding: "14px",
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
  },

  viewButtons: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  viewBtn: {
    padding: "10px 14px",
    background: "#f8f8fa",
    color: "#574866",
    border: "1px solid #d7dbe2",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  viewBtnActive: {
    padding: "10px 14px",
    background: "#6b5a7a",
    color: "#fff",
    border: "1px solid #6b5a7a",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  navButtons: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  estadoSelect: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #d7dbe2",
    background: "#fff",
    color: "#1f2937",
    fontWeight: "700",
  },

  filtersCard: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "20px",
    padding: "14px",
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) 170px 170px minmax(190px, 240px) auto auto",
    gap: "10px",
    alignItems: "center",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
  },

  hourFilterBadge: {
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "12px",
    padding: "10px 12px",
    fontWeight: "800",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },

  clearHourBtn: {
    border: "none",
    background: "transparent",
    color: "#1d4ed8",
    cursor: "pointer",
    fontWeight: "900",
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

  timeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 120px",
    gap: "10px",
  },

  textarea: {
    width: "100%",
    minHeight: 82,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cfd9e5",
    boxSizing: "border-box",
    background: "#fff",
    outline: "none",
    fontSize: 14,
    resize: "vertical",
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

  selectedDaySummary: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "center",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    padding: "16px",
    background: "#f8f8fa",
    flexWrap: "wrap",
  },

  summaryLabel: {
    display: "block",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: "700",
  },

  summaryNumber: {
    display: "block",
    color: "#574866",
    fontSize: "32px",
    lineHeight: 1,
    marginTop: "4px",
  },

  summaryText: {
    color: "#64748b",
    fontSize: "13px",
    maxWidth: "520px",
    lineHeight: 1.4,
  },

  dayList: {
    display: "grid",
    gap: 8,
    maxHeight: 330,
    overflow: "auto",
  },

  compactRow: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },

  compactText: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 13,
  },

  monthTiny: {
    fontSize: "12px",
    fontWeight: "800",
    color: "#574866",
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    borderRadius: "999px",
    padding: "3px 8px",
  },

  monthGridHeader: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 6,
    marginBottom: 6,
  },

  monthHeaderDay: {
    color: "#574866",
    fontWeight: "800",
    textAlign: "center",
    padding: 8,
  },

  monthGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 6,
  },

  monthCell: {
    minHeight: 118,
    border: "1px solid #d7dbe2",
    borderRadius: 14,
    background: "#fff",
    padding: 10,
    textAlign: "left",
    cursor: "pointer",
    display: "grid",
    alignContent: "start",
    gap: 8,
  },

  monthCellActive: {
    border: "2px solid #6b5a7a",
    background: "#faf7fc",
  },

  monthCellDay: {
    color: "#1f2937",
    fontWeight: "800",
  },

  monthCitasWrap: {
    display: "grid",
    gap: 4,
  },

  monthCitaDot: {
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "3px 6px",
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  moreCitas: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
  },

  weekTable: {
    display: "grid",
    gridTemplateColumns: "80px repeat(7, minmax(145px, 1fr))",
    overflowX: "auto",
    border: "1px solid #d7dbe2",
    borderRadius: 16,
  },

  weekCorner: {
    position: "sticky",
    left: 0,
    top: 0,
    zIndex: 3,
    background: "#f4f0f7",
    color: "#574866",
    fontWeight: "800",
    padding: 12,
    borderRight: "1px solid #d7dbe2",
    borderBottom: "1px solid #d7dbe2",
  },

  weekDayHeader: {
    background: "#f4f0f7",
    color: "#574866",
    fontWeight: "800",
    padding: 10,
    border: "none",
    borderRight: "1px solid #d7dbe2",
    borderBottom: "1px solid #d7dbe2",
    display: "grid",
    gap: 4,
    cursor: "pointer",
  },

  weekDayHeaderActive: {
    background: "#e9ddf0",
  },

  weekHour: {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "#fff",
    color: "#64748b",
    fontWeight: "800",
    padding: 12,
    borderRight: "1px solid #e2e8f0",
    borderBottom: "1px solid #e2e8f0",
  },

  weekCell: {
    minHeight: 84,
    padding: 8,
    borderRight: "1px solid #e2e8f0",
    borderBottom: "1px solid #e2e8f0",
    cursor: "pointer",
    display: "grid",
    gap: 6,
    alignContent: "start",
  },

  dayAgenda: {
    display: "grid",
    border: "1px solid #d7dbe2",
    borderRadius: 16,
    overflow: "hidden",
  },

  daySlot: {
    display: "grid",
    gridTemplateColumns: "90px 1fr 48px",
    minHeight: 58,
    borderBottom: "1px solid #e2e8f0",
  },

  dayHour: {
    background: "#f8f8fa",
    color: "#64748b",
    fontWeight: "800",
    padding: 14,
    borderRight: "1px solid #e2e8f0",
  },

  daySlotContent: {
    padding: 8,
    display: "grid",
    gap: 8,
    cursor: "pointer",
    alignContent: "center",
  },

  emptyHour: {
    color: "#94a3b8",
    fontSize: 13,
  },

  hourPatientsWrap: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    alignItems: "center",
  },

  hourPatientChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #d7dbe2",
    borderRadius: "999px",
    padding: "6px 9px",
    background: "#ffffff",
    color: "#1f2937",
    fontSize: "12px",
    maxWidth: "260px",
  },

  tipoBadgeMini: {
    display: "inline-block",
    padding: "3px 7px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: "800",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  },

  addHourBtn: {
    margin: "8px",
    width: "32px",
    height: "32px",
    borderRadius: "10px",
    border: "1px solid #d3c7dd",
    background: "#f4f0f7",
    color: "#574866",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "18px",
    alignSelf: "center",
    justifySelf: "center",
  },

  citaMini: {
    overflow: "hidden",
    maxWidth: "100%",
    minWidth: 0,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 10,
    display: "grid",
    gap: 5,
  },

  citaMiniTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    color: "#1f2937",
  },

  citaMiniText: {
    color: "#64748b",
    fontSize: 13,
  },

  citasGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
    gap: 14,
    width: "100%",
  },

  citaCard: {
    maxWidth: "100%",
    overflow: "hidden",
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

  tipoBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "800",
    border: "1px solid transparent",
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

  empresaTag: {
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    marginTop: "6px",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    fontWeight: "800",
    fontSize: "10px",
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
    marginTop: 10,
    flexWrap: "wrap",
  },

  iconBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d7dbe2",
    background: "#fff",
    cursor: "pointer",
  },

  emptyState: {
    color: "#64748b",
    padding: 14,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
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

  modalReporte: {
    width: "min(96vw, 1120px)",
    maxWidth: "1120px",
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: "18px",
    padding: "18px",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
    border: "1px solid #d7dbe2",
  },

  modalConfirmar: {
    width: "100%",
    maxWidth: "980px",
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: "18px",
    padding: "18px",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
    border: "1px solid #d7dbe2",
  },

  reportFiltersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "10px",
    alignItems: "center",
    marginBottom: "14px",
    padding: "12px",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    background: "#f8f8fa",
  },

  reportCounter: {
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "12px",
    padding: "10px 12px",
    fontWeight: "800",
    textAlign: "center",
    whiteSpace: "nowrap",
  },

  columnGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "8px",
    marginBottom: "16px",
  },

  columnCheck: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #d7dbe2",
    borderRadius: "12px",
    padding: "9px 10px",
    color: "#334155",
    fontWeight: "700",
    background: "#f8f8fa",
    minHeight: "38px",
  },

  confirmToolbar: {
    display: "grid",
    gridTemplateColumns: "220px auto",
    gap: "10px",
    alignItems: "center",
    marginBottom: "14px",
  },

  confirmList: {
    display: "grid",
    gap: "10px",
  },

  confirmItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "12px",
    flexWrap: "wrap",
  },

  confirmActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    alignItems: "center",
  },

  btnMiniOk: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "10px",
    padding: "6px 8px",
    cursor: "pointer",
    fontWeight: "850",
    fontSize: "11px",
    whiteSpace: "nowrap",
  },

  btnMiniWarn: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: "10px",
    padding: "6px 8px",
    cursor: "pointer",
    fontWeight: "850",
    fontSize: "11px",
    whiteSpace: "nowrap",
  },

  btnMiniSoft: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "10px",
    padding: "6px 8px",
    cursor: "pointer",
    fontWeight: "850",
    fontSize: "11px",
    whiteSpace: "nowrap",
  },

  btnMiniWhats: {
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
    borderRadius: "10px",
    padding: "6px 8px",
    cursor: "pointer",
    fontWeight: "850",
    fontSize: "11px",
    whiteSpace: "nowrap",
  },

  cuposBox: {
    maxHeight: "330px",
    overflowY: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: "8px",
    marginTop: "12px",
    padding: "10px",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    background: "#f8f8fa",
  },

  cupoHora: {
    display: "grid",
    gap: "4px",
    textAlign: "left",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "12px",
    padding: "10px",
    cursor: "pointer",
    color: "#334155",
  },

  cupoHoraActiva: {
    border: "2px solid #6b5a7a",
    background: "#faf7fc",
  },

  cupoHoraLlena: {
    border: "2px solid #fb7185",
    background: "#fff1f2",
  },

  modalCita: {
    width: "100%",
    maxWidth: "680px",
    background: "#fff",
    borderRadius: "18px",
    padding: "18px",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
    border: "1px solid #d7dbe2",
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

  modalSubText: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: "700",
  },

  quickCreateBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "14px",
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #d7dbe2",
    background: "#f8f8fa",
    flexWrap: "wrap",
  },

  quickCreateTitle: {
    color: "#1f2937",
    fontSize: "18px",
  },

  quickCreateText: {
    color: "#64748b",
    fontSize: "13px",
    marginTop: "4px",
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
    flexWrap: "wrap",
    position: "sticky",
    bottom: 0,
    background: "#fff",
    paddingTop: "10px",
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

  // ===== CONFIRMAR CITAS CON FILTROS =====
  confirmToolbarPro: {
    display: "grid",
    gridTemplateColumns: "150px minmax(230px, 1fr) 160px 145px 170px auto",
    gap: "10px",
    alignItems: "center",
    marginBottom: "10px",
  },

  confirmCounter: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#64748b",
    borderRadius: "12px",
    padding: "8px 10px",
    fontSize: "12px",
    fontWeight: "850",
    marginBottom: "10px",
  },
  // ===== FIX RESPONSIVE MODAL REPORTE CITAS TABLET / IPAD =====
  modalReporte: {
    width: "min(980px, calc(100vw - 28px))",
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto",
    background: "#fff",
    borderRadius: "22px",
    padding: "18px",
    border: "1px solid #d7dbe2",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.22)",
    boxSizing: "border-box",
  },

  reportFiltersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "10px",
    alignItems: "center",
    background: "#fbfbfc",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "12px",
    marginBottom: "12px",
    overflow: "hidden",
  },

  columnGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
    gap: "9px",
    marginTop: "10px",
    marginBottom: "14px",
  },

  columnCheck: {
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr)",
    gap: "8px",
    alignItems: "center",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "10px 11px",
    color: "#334155",
    fontSize: "13px",
    fontWeight: "850",
    minWidth: 0,
    boxSizing: "border-box",
  },

  reportCounter: {
    minHeight: "42px",
    borderRadius: "14px",
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#1d4ed8",
    display: "grid",
    placeItems: "center",
    padding: "0 12px",
    fontWeight: "950",
    fontSize: "14px",
    whiteSpace: "nowrap",
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "9px",
    flexWrap: "wrap",
    marginTop: "10px",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "12px",
  },

  modalSubText: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.35,
  },

  btnCerrarModal: {
    border: "none",
    background: "#f1f5f9",
    color: "#334155",
    borderRadius: "12px",
    width: "38px",
    height: "38px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "16px",
    flexShrink: 0,
  },

  btnGuardarModal: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "13px",
    padding: "11px 15px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "13px",
  },

  btnCancelarModal: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "13px",
    padding: "11px 15px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "13px",
  },

  patientPickerBox: {
    gridColumn: "1 / -1",
    display: "grid",
    gap: "10px",
  },

  patientSearchRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "10px",
    alignItems: "start",
  },

  patientList: {
    maxHeight: "230px",
    overflowY: "auto",
    display: "grid",
    gap: "8px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "10px",
  },

  patientOption: {
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#334155",
    borderRadius: "14px",
    padding: "11px 12px",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
    fontSize: "13px",
  },

  patientOptionActive: {
    background: "#f4f0f7",
    border: "1px solid #8a79a0",
    color: "#574866",
  },

  patientEmpty: {
    padding: "12px",
    borderRadius: "13px",
    background: "#fff",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: "850",
    textAlign: "center",
  },

  patientDropdownWrap: {
    position: "relative",
    minWidth: 0,
  },

  patientDropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    zIndex: 30,
    maxHeight: "320px",
    overflowY: "auto",
    display: "grid",
    gap: "7px",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    padding: "10px",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
  },

  patientDropdownHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: "850",
    padding: "0 2px 4px",
  },

  patientDropdownClose: {
    border: "none",
    background: "#f1f5f9",
    color: "#475569",
    borderRadius: "9px",
    padding: "5px 8px",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: "900",
  },

  patientSelectedBadge: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "8px 10px",
    fontSize: "12px",
    fontWeight: "850",
  },




  iconBtnLlegada: {
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: "10px",
    padding: "7px 9px",
    cursor: "pointer",
    fontWeight: "950",
  },

  iconBtnLlegadaActiva: {
    border: "1px solid #86efac",
    background: "#dcfce7",
    color: "#15803d",
    borderRadius: "10px",
    padding: "7px 9px",
    cursor: "pointer",
    fontWeight: "950",
  },

  llegadaTagMini: {
    display: "inline-flex",
    width: "fit-content",
    alignItems: "center",
    background: "#dcfce7",
    color: "#15803d",
    border: "1px solid #86efac",
    borderRadius: "999px",
    padding: "3px 7px",
    fontSize: "10px",
    fontWeight: "950",
    marginTop: "4px",
  },

  btnMiniLlegada: {
    background: "#f8fafc",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: "999px",
    padding: "5px 8px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "10px",
    lineHeight: 1,
    minHeight: "24px",
    whiteSpace: "nowrap",
  },

  btnMiniLlegadaActiva: {
    background: "#dcfce7",
    color: "#15803d",
    border: "1px solid #86efac",
    borderRadius: "999px",
    padding: "5px 8px",
    cursor: "pointer",
    fontWeight: "950",
    fontSize: "11px",
    lineHeight: 1,
    minWidth: "26px",
    minHeight: "24px",
    whiteSpace: "nowrap",
  },

  llegadaTag: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#dcfce7",
    color: "#15803d",
    border: "1px solid #86efac",
    borderRadius: "999px",
    padding: "3px 7px",
    fontSize: "9px",
    fontWeight: "950",
    lineHeight: 1,
    whiteSpace: "nowrap",
    maxWidth: "54px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

};



export default Citas;

  