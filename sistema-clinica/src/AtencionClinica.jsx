import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function AtencionClinica({ onNavigate }) {
  const empresaInicial = leerJSON("empresa");
  const atencionInicial = leerJSON("atencionActiva");
  const citaInicial = leerJSON("citaActiva");

  const [empresa, setEmpresa] = useState(
    atencionInicial?.empresas || citaInicial?.empresas || empresaInicial
  );
  const [atencion, setAtencion] = useState(atencionInicial || null);
  const [cita, setCita] = useState(atencionInicial?.cita || citaInicial || null);

  const [productos, setProductos] = useState([]);
  const [atencionesPendientes, setAtencionesPendientes] = useState([]);
  const [itemsAtencion, setItemsAtencion] = useState([]);

  const [busqueda, setBusqueda] = useState("");
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [observacion, setObservacion] = useState(atencionInicial?.observacion || "");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [esMovil, setEsMovil] = useState(window.innerWidth < 920);
  const [vistaListado, setVistaListado] = useState(false);
  const [filtroListadoTexto, setFiltroListadoTexto] = useState("");
  const [filtroListadoEstado, setFiltroListadoEstado] = useState("abiertas");

  const [mostrarReporteCobros, setMostrarReporteCobros] = useState(false);
  const [reporteCobros, setReporteCobros] = useState([]);
  const [cargandoReporteCobros, setCargandoReporteCobros] = useState(false);
  const [filtroReporteDesde, setFiltroReporteDesde] = useState("");
  const [filtroReporteHasta, setFiltroReporteHasta] = useState("");
  const [filtroReporteTexto, setFiltroReporteTexto] = useState("");

  const pacienteNombre =
    atencion?.clientes?.nombre ||
    cita?.clientes?.nombre ||
    "Paciente";

  const pacienteTelefono =
    atencion?.clientes?.telefono ||
    cita?.clientes?.telefono ||
    "";

  const empresaId = atencion?.empresa_id || cita?.empresa_id || empresa?.id;

  const usuarioLocal = leerJSON("usuario") || leerJSON("user") || {};
  const permisosLocalStorage = leerJSON("permisos") || {};
  const rolLocalStorage = String(localStorage.getItem("rol") || "").toLowerCase();

  const permisosUsuario = {
    ...(usuarioLocal?.permisos || {}),
    ...permisosLocalStorage,
  };

  const rolUsuario = String(
    usuarioLocal?.rol ||
      usuarioLocal?.role ||
      rolLocalStorage ||
      ""
  ).toLowerCase();

  const puedeVerReporteCobros =
    rolUsuario === "admin" ||
    rolUsuario === "administrador" ||
    rolUsuario === "propietario" ||
    rolUsuario === "owner" ||
    rolUsuario === "jefa" ||
    permisosUsuario.reporte_atenciones_cobro_ver === true ||
    permisosUsuario.atencion_clinica_reporte_cobros === true;

  const puedeExportarReporteCobros =
    rolUsuario === "admin" ||
    rolUsuario === "administrador" ||
    rolUsuario === "propietario" ||
    rolUsuario === "owner" ||
    rolUsuario === "jefa" ||
    permisosUsuario.reporte_atenciones_cobro_exportar === true;

  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return productos
      .filter((p) => {
        const nombre = String(p.nombre || "").toLowerCase();
        const tipo = String(p.tipo || "").toLowerCase();
        return !texto || nombre.includes(texto) || tipo.includes(texto);
      })
      .slice(0, 80);
  }, [productos, busqueda]);

  const totalAtencion = useMemo(() => {
    return itemsAtencion.reduce((acc, item) => acc + numero(item.total), 0);
  }, [itemsAtencion]);

  const bloqueado =
    atencion?.estado === "pendiente_cobro" || atencion?.estado === "cobrada";

  const atencionesListadoFiltradas = useMemo(() => {
    const texto = filtroListadoTexto.trim().toLowerCase();

    return atencionesPendientes.filter((item) => {
      const nombre = String(item.clientes?.nombre || "").toLowerCase();
      const telefono = String(item.clientes?.telefono || "").toLowerCase();
      const estado = String(item.estado || "").toLowerCase();

      const coincideTexto =
        !texto ||
        nombre.includes(texto) ||
        telefono.includes(texto) ||
        estado.includes(texto);

      const coincideEstado =
        filtroListadoEstado === "todas" ||
        (filtroListadoEstado === "abiertas" &&
          ["en_proceso"].includes(item.estado)) ||
        item.estado === filtroListadoEstado;

      return coincideTexto && coincideEstado;
    });
  }, [atencionesPendientes, filtroListadoTexto, filtroListadoEstado]);

  const reporteCobrosFiltrado = useMemo(() => {
    const texto = filtroReporteTexto.trim().toLowerCase();

    return reporteCobros.filter((row) => {
      const paciente = String(row.clientes?.nombre || "").toLowerCase();
      const telefono = String(row.clientes?.telefono || "").toLowerCase();
      const detalleTexto = (row.items || [])
        .map((item) => `${item.nombre || ""} ${item.comentario || ""}`)
        .join(" ")
        .toLowerCase();

      return (
        !texto ||
        paciente.includes(texto) ||
        telefono.includes(texto) ||
        detalleTexto.includes(texto)
      );
    });
  }, [reporteCobros, filtroReporteTexto]);

  const totalReporteCobros = useMemo(() => {
    return reporteCobrosFiltrado.reduce((acc, row) => acc + Number(row.total || 0), 0);
  }, [reporteCobrosFiltrado]);

  useEffect(() => {
    inicializar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => setEsMovil(window.innerWidth < 920);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const inicializar = async () => {
    if (!empresaId) return;

    setCargando(true);
    await cargarProductos();
    await cargarAtencionesPendientes();

    if (atencionInicial?.id) {
      await cargarItemsAtencion(atencionInicial.id);
    } else if (citaInicial?.id) {
      await crearAtencionDesdeCita(citaInicial);
    }

    setCargando(false);
  };

  const cargarProductos = async () => {
    if (!empresaId) return;

    const { data, error } = await supabase
      .from("items")
      .select("id, empresa_id, nombre, precio, stock, tipo, precio_editable")
      .eq("empresa_id", empresaId)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("Error cargando items:", error);
      setProductos([]);
      return;
    }

    setProductos(data || []);
  };

  const cargarAtencionesPendientes = async () => {
    if (!empresaId) return;

    const { data, error } = await supabase
      .from("atenciones_clinicas")
      .select(`
        *,
        clientes(nombre, telefono),
        empresas(id, nombre),
        citas(id, fecha, hora, servicio, estado, confirmada)
      `)
      .eq("empresa_id", empresaId)
      .eq("estado", "en_proceso")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error cargando atenciones pendientes:", error);
      setAtencionesPendientes([]);
      return;
    }

    setAtencionesPendientes(data || []);
  };

  const seleccionarAtencionPendiente = async (item) => {
    const completa = {
      ...item,
      clientes: item.clientes,
      empresas: item.empresas,
      cita: item.citas || null,
    };

    setAtencion(completa);
    setCita(item.citas || null);
    setEmpresa(item.empresas || empresa);
    setObservacion(item.observacion || "");
    setItemsAtencion([]);
    localStorage.setItem("atencionActiva", JSON.stringify(completa));

    await cargarItemsAtencion(item.id);
    mostrarMensaje(`Atención cargada: ${item.clientes?.nombre || "Paciente"}`);
  };

  const cargarItemsAtencion = async (atencionId) => {
    const { data, error } = await supabase
      .from("atencion_clinica_items")
      .select("*")
      .eq("atencion_id", atencionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      return alert("Error al cargar lo realizado al paciente");
    }

    setItemsAtencion(data || []);
  };

  const crearAtencionDesdeCita = async (citaBase) => {
    const { data: existente, error: errorBuscar } = await supabase
      .from("atenciones_clinicas")
      .select("*")
      .eq("cita_id", citaBase.id)
      .eq("empresa_id", citaBase.empresa_id)
      .maybeSingle();

    if (errorBuscar) {
      console.error(errorBuscar);
      return alert("Error al revisar la atención");
    }

    if (existente) {
      const completa = {
        ...existente,
        clientes: citaBase.clientes,
        empresas: citaBase.empresas,
        cita: citaBase,
      };

      setAtencion(completa);
      setObservacion(existente.observacion || "");
      localStorage.setItem("atencionActiva", JSON.stringify(completa));
      await cargarItemsAtencion(existente.id);
      return;
    }

    const { data, error } = await supabase
      .from("atenciones_clinicas")
      .insert([
        {
          empresa_id: citaBase.empresa_id,
          cita_id: citaBase.id,
          cliente_id: citaBase.cliente_id,
          fecha_atencion: obtenerFechaSV(),
          hora_inicio: normalizarHora(citaBase.hora),
          estado: "en_proceso",
          origen: "cita",
          observacion: "",
          total: 0,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(error);
      return alert("Error al crear la atención clínica");
    }

    const completa = {
      ...data,
      clientes: citaBase.clientes,
      empresas: citaBase.empresas,
      cita: citaBase,
    };

    setAtencion(completa);
    localStorage.setItem("atencionActiva", JSON.stringify(completa));
    await cargarAtencionesPendientes();
  };

  const agregarProducto = async (producto) => {
    if (!atencion?.id) return alert("No hay atención activa");

    const nombre = producto.nombre || "Producto / servicio";
    const precio = obtenerPrecioProducto(producto);

    const nuevo = {
      atencion_id: atencion.id,
      empresa_id: atencion.empresa_id,
      item_id: producto.id || null,
      nombre,
      descripcion: producto.tipo || "",
      cantidad: 1,
      precio_unitario: precio,
      total: precio,
      comentario: "",
    };

    const { data, error } = await supabase
      .from("atencion_clinica_items")
      .insert([nuevo])
      .select()
      .single();

    if (error) {
      console.error(error);
      return alert("Error al agregar item");
    }

    const nuevaLista = [...itemsAtencion, data];
    setItemsAtencion(nuevaLista);
    setBusqueda("");
    setMostrarDropdown(false);
    await guardarTotalAtencion(nuevaLista);
    mostrarMensaje("Agregado correctamente");
  };

  const actualizarItem = async (id, campo, valor) => {
    const itemBase = itemsAtencion.find((item) => item.id === id);
    const productoBase = productos.find((producto) => String(producto.id) === String(itemBase?.item_id));
    const permiteEditarPrecio = Boolean(productoBase?.precio_editable || itemBase?.precio_editable);

    if (campo === "precio_unitario" && !permiteEditarPrecio) {
      mostrarMensaje("Este producto tiene precio fijo");
      return;
    }

    const lista = itemsAtencion.map((item) => {
      if (item.id !== id) return item;

      const actualizado = {
        ...item,
        [campo]:
          campo === "cantidad" || campo === "precio_unitario"
            ? limpiarDecimalInput(valor)
            : valor,
      };

      const cantidad = numero(actualizado.cantidad);
      const precio = numero(actualizado.precio_unitario);
      actualizado.total = Number((cantidad * precio).toFixed(2));

      return actualizado;
    });

    setItemsAtencion(lista);

    const itemActualizado = lista.find((item) => item.id === id);
    if (!itemActualizado) return;

    const { error } = await supabase
      .from("atencion_clinica_items")
      .update({
        cantidad: numero(itemActualizado.cantidad),
        precio_unitario: numero(itemActualizado.precio_unitario),
        total: numero(itemActualizado.total),
        comentario: itemActualizado.comentario || "",
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      return alert("Error al actualizar item");
    }

    await guardarTotalAtencion(lista);
  };

  const eliminarItem = async (id) => {
    const confirmar = window.confirm("¿Eliminar este item de la atención?");
    if (!confirmar) return;

    const { error } = await supabase
      .from("atencion_clinica_items")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      return alert("Error al eliminar item");
    }

    const nuevaLista = itemsAtencion.filter((item) => item.id !== id);
    setItemsAtencion(nuevaLista);
    await guardarTotalAtencion(nuevaLista);
    mostrarMensaje("Item eliminado");
  };

  const guardarObservacion = async () => {
    if (!atencion?.id) return;

    const { error } = await supabase
      .from("atenciones_clinicas")
      .update({
        observacion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", atencion.id);

    if (error) {
      console.error(error);
      return alert("Error al guardar observación");
    }

    mostrarMensaje("Nota guardada");
  };

  const guardarTotalAtencion = async (lista = itemsAtencion) => {
    if (!atencion?.id) return;

    const total = lista.reduce((acc, item) => acc + numero(item.total), 0);

    const { error } = await supabase
      .from("atenciones_clinicas")
      .update({
        total,
        updated_at: new Date().toISOString(),
      })
      .eq("id", atencion.id);

    if (error) {
      console.error(error);
      return;
    }

    setAtencion((prev) => (prev ? { ...prev, total } : prev));
    await cargarAtencionesPendientes();
  };


  const abrirReporteCobros = async () => {
    if (!puedeVerReporteCobros) {
      return alert("No tenés permiso para ver este reporte.");
    }

    setMostrarReporteCobros(true);
    await cargarReporteCobros();
  };

  const cerrarReporteCobros = () => {
    setMostrarReporteCobros(false);
  };

  const cargarReporteCobros = async () => {
    if (!empresaId) return;

    setCargandoReporteCobros(true);

    let query = supabase
      .from("atenciones_clinicas")
      .select(`
        *,
        clientes(nombre, telefono),
        citas(id, fecha, hora, servicio),
        atencion_clinica_items(*)
      `)
      .eq("empresa_id", empresaId)
      .in("estado", ["pendiente_cobro", "cobrada"])
      .order("updated_at", { ascending: false });

    if (filtroReporteDesde) {
      query = query.gte("updated_at", `${filtroReporteDesde}T00:00:00`);
    }

    if (filtroReporteHasta) {
      query = query.lte("updated_at", `${filtroReporteHasta}T23:59:59`);
    }

    const { data, error } = await query;

    setCargandoReporteCobros(false);

    if (error) {
      console.error("Error cargando reporte de atenciones a cobro:", error);
      return alert("No se pudo cargar el reporte de atenciones enviadas a cobro");
    }

    const normalizado = (data || []).map((row) => ({
      ...row,
      items: row.atencion_clinica_items || [],
    }));

    setReporteCobros(normalizado);
  };

  const exportarReporteCobrosPDF = () => {
    if (!puedeExportarReporteCobros) {
      return alert("No tenés permiso para exportar este reporte.");
    }

    if (reporteCobrosFiltrado.length === 0) {
      return alert("No hay datos para exportar.");
    }

    const doc = new jsPDF("landscape", "pt", "letter");
    const empresaNombre = empresa?.nombre || "Empresa";
    const fechaGeneracion = new Date().toLocaleString("es-SV", {
      timeZone: "America/El_Salvador",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    doc.setFontSize(15);
    doc.setTextColor(87, 72, 102);
    doc.text("Reporte de pacientes enviados a cobro", 40, 42);

    doc.setFontSize(9);
    doc.setTextColor(90, 104, 125);
    doc.text(`Empresa: ${empresaNombre}`, 40, 60);
    doc.text(`Generado: ${fechaGeneracion}`, 40, 74);
    doc.text(`Pacientes: ${reporteCobrosFiltrado.length}   Total enviado a cobro: $${money(totalReporteCobros)}`, 40, 88);

    const filas = [];

    reporteCobrosFiltrado.forEach((row) => {
      const paciente = row.clientes?.nombre || "Paciente";
      const telefono = row.clientes?.telefono || "";
      const fechaEnviada = formatearFechaHora(row.updated_at || row.fecha_atencion);
      const cita = row.citas?.fecha
        ? `${formatearFecha(row.citas.fecha)} ${normalizarHora(row.citas.hora)}`
        : "";
      const estado = labelEstado(row.estado);
      const total = `$${money(row.total)}`;
      const items = row.items || [];

      if (items.length === 0) {
        filas.push([
          paciente,
          telefono,
          fechaEnviada,
          cita,
          "Sin detalle de procedimientos",
          "",
          "",
          total,
          estado,
          row.observacion || "",
        ]);
        return;
      }

      items.forEach((item, index) => {
        filas.push([
          index === 0 ? paciente : "",
          index === 0 ? telefono : "",
          index === 0 ? fechaEnviada : "",
          index === 0 ? cita : "",
          item.nombre || "Producto / servicio",
          Number(item.cantidad || 0),
          `$${money(item.total)}`,
          index === 0 ? total : "",
          index === 0 ? estado : "",
          index === 0 ? row.observacion || "" : item.comentario || "",
        ]);
      });
    });

    autoTable(doc, {
      startY: 106,
      head: [[
        "Paciente",
        "Teléfono",
        "Fecha enviada",
        "Cita",
        "Procedimiento / producto",
        "Cant.",
        "Total item",
        "Total atención",
        "Estado",
        "Nota",
      ]],
      body: filas,
      styles: {
        fontSize: 7.5,
        cellPadding: 4,
        overflow: "linebreak",
        valign: "top",
      },
      headStyles: {
        fillColor: [244, 240, 247],
        textColor: [87, 72, 102],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 95 },
        1: { cellWidth: 65 },
        2: { cellWidth: 80 },
        3: { cellWidth: 75 },
        4: { cellWidth: 150 },
        5: { cellWidth: 35, halign: "right" },
        6: { cellWidth: 55, halign: "right" },
        7: { cellWidth: 65, halign: "right" },
        8: { cellWidth: 70 },
        9: { cellWidth: 120 },
      },
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        const pageCount = doc.internal.getNumberOfPages();
        const pageSize = doc.internal.pageSize;
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Página ${doc.internal.getCurrentPageInfo().pageNumber} de ${pageCount}`,
          pageSize.width - 85,
          pageSize.height - 20
        );
      },
    });

    const fechaArchivo = obtenerFechaSV();
    doc.save(`Reporte_Pacientes_Enviados_Cobro_${fechaArchivo}.pdf`);
  };

  const crearVentaPendienteDesdeAtencion = async () => {
    if (!atencion?.id || !atencion?.empresa_id) {
      throw new Error("No hay atención activa para enviar a CXC");
    }

    if (itemsAtencion.length === 0) {
      throw new Error("Agregá al menos un item antes de enviar a cobro.");
    }

    const fechaLocal = obtenerFechaHoraSVISO();
    const clienteId = atencion.cliente_id || cita?.cliente_id || null;

    const { data: venta, error: errorVenta } = await supabase
      .from("ventas")
      .insert([
        {
          empresa_id: atencion.empresa_id,
          cliente_id: clienteId,
          total: Number(totalAtencion || 0),
          estado: "pendiente",
          fecha_local: fechaLocal,
          fecha: fechaLocal,
        },
      ])
      .select()
      .single();

    if (errorVenta) {
      console.error(errorVenta);
      throw new Error("No se pudo crear la cuenta por cobrar");
    }

    const detalles = itemsAtencion.map((item) => {
      const productoBase = productos.find(
        (producto) => String(producto.id) === String(item.item_id)
      );
      const precioBase = Number(productoBase?.precio || item.precio_unitario || 0);
      const precioEditable = Boolean(productoBase?.precio_editable || item.precio_editable);

      return {
        venta_id: venta.id,
        item_id: item.item_id || null,
        cantidad: Number(item.cantidad || 0),
        precio: Number(item.precio_unitario || 0),
        precio_base: precioBase,
        precio_editable: precioEditable,
        origen_precio: "atencion_clinica",
      };
    });

    const { error: errorDetalle } = await supabase
      .from("detalle_venta")
      .insert(detalles);

    if (errorDetalle) {
      console.warn("No se pudo guardar detalle_venta, pero la CXC fue creada:", errorDetalle);
    }

    return venta;
  };


  const crearNotificacionEnviadaACobro = async ({ ventaId }) => {
    if (!atencion?.empresa_id) return;

    const datos = {
      paciente: pacienteNombre,
      telefono: pacienteTelefono,
      total: Number(totalAtencion || 0),
      venta_id: ventaId || null,
      atencion_id: atencion.id,
      cita_id: cita?.id || atencion.cita_id || null,
      fecha: obtenerFechaSV(),
      hora: obtenerHoraActualSV(),
    };

    const { error } = await supabase
      .from("bandeja_mensajes")
      .insert([
        {
          empresa_id: atencion.empresa_id,
          cita_id: cita?.id || atencion.cita_id || null,
          cliente_id: atencion.cliente_id || cita?.cliente_id || null,
          tipo: "cita_enviada_cobro",
          titulo: "Nueva cita enviada a cobro",
          mensaje: `${pacienteNombre} fue enviado a CXC por $${money(totalAtencion)}.`,
          estado: "pendiente",
          leida: false,
          datos,
        },
      ]);

    if (error) {
      console.warn("No se pudo crear notificación para caja:", error);
    }
  };

  const enviarACobro = async () => {
    if (!atencion?.id) return;

    if (itemsAtencion.length === 0) {
      return alert("Agregá al menos un item antes de enviar a cobro.");
    }

    const confirmar = window.confirm(
      "¿Enviar esta atención a CXC? La cajera podrá verla en Deudas / Cuentas por cobrar."
    );

    if (!confirmar) return;

    setGuardando(true);

    try {
      const venta = await crearVentaPendienteDesdeAtencion();

      await crearNotificacionEnviadaACobro({ ventaId: venta?.id });
      window.dispatchEvent(new Event("bandejaMensajesActualizada"));

      const { data, error } = await supabase
        .from("atenciones_clinicas")
        .update({
          estado: "pendiente_cobro",
          observacion,
          total: totalAtencion,
          hora_fin: obtenerHoraActualSV(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", atencion.id)
        .select()
        .single();

      if (error) {
        console.error(error);
        throw new Error("La CXC se creó, pero falló actualizar la atención clínica");
      }

      const completa = {
        ...data,
        clientes: atencion.clientes,
        empresas: atencion.empresas,
        cita,
        venta_id: venta?.id,
      };

      setAtencion(completa);

      localStorage.setItem("atencionActiva", JSON.stringify(completa));
      localStorage.setItem(
        "atencionPendienteCobro",
        JSON.stringify({
          ...completa,
          venta_id: venta?.id,
          items: itemsAtencion,
          total: totalAtencion,
        })
      );

      mostrarMensaje("Atención enviada a CXC");
      await cargarAtencionesPendientes();

      setGuardando(false);

      // No redirigimos a CXC porque las chicas no tendrán acceso.
      // Solo dejamos la atención enviada y abrimos el listado de pendientes en proceso.
      setVistaListado(true);
      return;
    } catch (error) {
      setGuardando(false);
      console.error(error);
      alert(error.message || "Error al enviar a CXC");
    }
  };


  const abrirListadoAtenciones = async () => {
    await cargarAtencionesPendientes();
    setVistaListado(true);
  };

  const volverACitas = () => {
    if (typeof onNavigate === "function") {
      onNavigate("citas");
      return;
    }

    window.dispatchEvent(new Event("irACitas"));
  };

  const volverModuloCitas = volverACitas;

  const abrirAtencionDesdeListado = async (item) => {
    await seleccionarAtencionPendiente(item);
    setVistaListado(false);
  };

  const mostrarMensaje = (texto) => {
    setMensaje(texto);
    setTimeout(() => setMensaje(""), 2600);
  };

  if (!atencion && !cita) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyCard}>
          <div style={styles.emptyIcon}>🦷</div>
          <h2>No hay atención activa</h2>
          <p>Ingresá desde el botón “Atender” en el módulo de citas.</p>
          <button style={styles.primaryBtn} onClick={volverACitas}>
            Volver a citas
          </button>
        </div>
      </div>
    );
  }

  if (vistaListado) {
    return (
      <div style={styles.page}>
        {mensaje && <div style={styles.toast}>{mensaje}</div>}

        <div style={styles.listHero}>
          <div>
            <button type="button" style={styles.backBtnDark} onClick={volverModuloCitas}>
              ← Volver a Citas
            </button>
            <h1 style={styles.listTitle}>Atenciones clínicas</h1>
            <p style={styles.listSubtitle}>
              Revisá pacientes en proceso o pendientes de cobro sin perder el control.
            </p>
          </div>

          <div style={styles.listCounter}>
            <span>Mostrando</span>
            <strong>{atencionesListadoFiltradas.length}</strong>
          </div>

          {puedeVerReporteCobros && (
            <button type="button" style={styles.reportBtnHero} onClick={abrirReporteCobros}>
              📋 Reporte enviados a cobro
            </button>
          )}
        </div>

        <div style={esMovil ? styles.listFiltersMobile : styles.listFilters}>
          <input
            style={styles.filterInput}
            value={filtroListadoTexto}
            onChange={(e) => setFiltroListadoTexto(e.target.value)}
            placeholder="Buscar paciente, teléfono o estado..."
          />

          <select
            style={styles.filterInput}
            value={filtroListadoEstado}
            onChange={(e) => setFiltroListadoEstado(e.target.value)}
          >
            <option value="abiertas">Por terminar</option>
            <option value="en_proceso">En proceso</option>
            <option value="todas">Todas</option>
          </select>

          <button type="button" style={styles.secondaryBtn} onClick={cargarAtencionesPendientes}>
            Actualizar
          </button>
        </div>

        {atencionesListadoFiltradas.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>🦷</div>
            <strong>No hay atenciones con esos filtros</strong>
            <span>Probá cambiando el estado o limpiando la búsqueda.</span>
          </div>
        ) : (
          <div style={styles.listGrid}>
            {atencionesListadoFiltradas.map((item) => (
              <button
                key={item.id}
                type="button"
                style={styles.attentionCard}
                onClick={() => abrirAtencionDesdeListado(item)}
              >
                <div style={styles.attentionCardTop}>
                  <div style={styles.attentionAvatar}>
                    {obtenerIniciales(item.clientes?.nombre || "P")}
                  </div>

                  <div>
                    <strong>{item.clientes?.nombre || "Paciente"}</strong>
                    <span>{item.clientes?.telefono || "Sin teléfono"}</span>
                  </div>
                </div>

                <div style={styles.attentionMeta}>
                  <span>{labelEstado(item.estado)}</span>
                  <strong>$ {money(item.total)}</strong>
                </div>

                <div style={styles.attentionFoot}>
                  <span>{item.citas?.fecha ? formatearFecha(item.citas.fecha) : "Sin fecha"}</span>
                  <span>{item.citas?.hora ? normalizarHora(item.citas.hora) : ""}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {mostrarReporteCobros && (
          <div style={styles.modalOverlayReporte} onClick={cerrarReporteCobros}>
            <div style={styles.reporteModal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.reporteHeader}>
                <div>
                  <h2 style={styles.reporteTitle}>Reporte de pacientes enviados a cobro</h2>
                  <p style={styles.reporteSubtitle}>
                    Detalle clínico de lo realizado antes de pasar a CXC. Visible solo para jefatura/permisos autorizados.
                  </p>
                </div>

                <button type="button" style={styles.closeReporteBtn} onClick={cerrarReporteCobros}>
                  ✕
                </button>
              </div>

              <div style={styles.reporteFiltros}>
                <input
                  type="date"
                  style={styles.filterInput}
                  value={filtroReporteDesde}
                  onChange={(e) => setFiltroReporteDesde(e.target.value)}
                />

                <input
                  type="date"
                  style={styles.filterInput}
                  value={filtroReporteHasta}
                  onChange={(e) => setFiltroReporteHasta(e.target.value)}
                />

                <input
                  style={styles.filterInput}
                  value={filtroReporteTexto}
                  onChange={(e) => setFiltroReporteTexto(e.target.value)}
                  placeholder="Buscar paciente, teléfono o tratamiento..."
                />

                <button type="button" style={styles.secondaryBtn} onClick={cargarReporteCobros}>
                  Filtrar
                </button>

                {puedeExportarReporteCobros && (
                  <button type="button" style={styles.pdfBtn} onClick={exportarReporteCobrosPDF}>
                    📄 Exportar PDF
                  </button>
                )}
              </div>

              <div style={styles.reporteResumen}>
                <div>
                  <span>Pacientes</span>
                  <strong>{reporteCobrosFiltrado.length}</strong>
                </div>

                <div>
                  <span>Total enviado a cobro</span>
                  <strong>$ {money(totalReporteCobros)}</strong>
                </div>
              </div>

              <div style={styles.reporteLista}>
                {cargandoReporteCobros ? (
                  <div style={styles.emptyState}>Cargando reporte...</div>
                ) : reporteCobrosFiltrado.length === 0 ? (
                  <div style={styles.emptyState}>
                    No hay atenciones enviadas a cobro con esos filtros.
                  </div>
                ) : (
                  reporteCobrosFiltrado.map((row) => (
                    <div key={row.id} style={styles.reporteCard}>
                      <div style={styles.reporteCardTop}>
                        <div>
                          <strong>{row.clientes?.nombre || "Paciente"}</strong>
                          <span>{row.clientes?.telefono || "Sin teléfono"}</span>
                        </div>

                        <div style={styles.reporteCardRight}>
                          <strong>$ {money(row.total)}</strong>
                          <span>{labelEstado(row.estado)}</span>
                        </div>
                      </div>

                      <div style={styles.reporteMeta}>
                        <span>Fecha enviada: {formatearFechaHora(row.updated_at || row.fecha_atencion)}</span>
                        {row.citas?.fecha && (
                          <span>Cita: {formatearFecha(row.citas.fecha)} {normalizarHora(row.citas.hora)}</span>
                        )}
                        {row.observacion && <span>Nota: {row.observacion}</span>}
                      </div>

                      <div style={styles.reporteDetalleItems}>
                        {(row.items || []).length === 0 ? (
                          <div style={styles.reporteItemVacio}>Sin detalle de procedimientos.</div>
                        ) : (
                          row.items.map((item) => (
                            <div key={item.id} style={styles.reporteItem}>
                              <div>
                                <strong>{item.nombre || "Producto / servicio"}</strong>
                                {item.comentario && <span>{item.comentario}</span>}
                              </div>

                              <div style={styles.reporteItemRight}>
                                <span>Cant. {Number(item.cantidad || 0)}</span>
                                <strong>$ {money(item.total)}</strong>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const tituloEstado = labelEstado(atencion?.estado);

  return (
    <div style={styles.page}>
      {mensaje && <div style={styles.toast}>{mensaje}</div>}

      <div style={styles.hero}>
        <div style={styles.heroTop}>
          <button type="button" style={styles.backBtn} onClick={abrirListadoAtenciones}>
            ← Listado
          </button>

          <div style={styles.statusPill}>{tituloEstado}</div>

          {puedeVerReporteCobros && (
            <button type="button" style={styles.backBtn} onClick={abrirReporteCobros}>
              📋 Reporte cobros
            </button>
          )}
        </div>

        <div style={esMovil ? styles.patientHeroMobile : styles.patientHero}>
          <div style={styles.avatar}>
            {obtenerIniciales(pacienteNombre)}
          </div>

          <div style={styles.patientInfo}>
            <h1 style={styles.title}>{pacienteNombre}</h1>
            <div style={styles.patientMeta}>
              {pacienteTelefono && <span>📞 {pacienteTelefono}</span>}
              <span>🏢 {empresa?.nombre || atencion?.empresas?.nombre || "Empresa"}</span>
              {cita?.fecha && <span>📅 {formatearFecha(cita.fecha)} · {normalizarHora(cita.hora)}</span>}
            </div>
          </div>

          <div style={esMovil ? styles.heroTotalMobile : styles.heroTotal}>
            <span>Total</span>
            <strong>$ {money(totalAtencion)}</strong>
          </div>
        </div>
      </div>

      <div style={styles.pendingRail}>
        <div style={styles.railHeader}>
          <strong>Atenciones abiertas</strong>
          <button type="button" onClick={cargarAtencionesPendientes} style={styles.tinyBtn}>
            Actualizar
          </button>
        </div>

        {atencionesPendientes.length === 0 ? (
          <div style={styles.railEmpty}>No hay pendientes.</div>
        ) : (
          <div style={styles.pendingScroller}>
            {atencionesPendientes.map((item) => {
              const activo = String(atencion?.id) === String(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  style={{
                    ...styles.pendingChip,
                    ...(activo ? styles.pendingChipActive : {}),
                  }}
                  onClick={() => seleccionarAtencionPendiente(item)}
                >
                  <span>{item.clientes?.nombre || "Paciente"}</span>
                  <small>{labelEstado(item.estado)} · $ {money(item.total)}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={esMovil ? styles.workspaceMobile : styles.workspace}>
        <section style={styles.workCard}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Agregar lo realizado</h2>
              <p style={styles.sectionSubtitle}>
                Buscá en Inventario/Productos y tocá el servicio o producto.
              </p>
            </div>

            <div style={styles.counterPill}>{productos.length} items</div>
          </div>

          {!bloqueado && (
            <div style={styles.searchBox}>
              <span style={styles.searchIcon}>🔎</span>
              <input
                style={styles.searchInput}
                value={busqueda}
                onFocus={() => setMostrarDropdown(true)}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setMostrarDropdown(true);
                }}
                placeholder="Buscar: limpieza, sello, aparato, consulta..."
              />

              {busqueda && (
                <button
                  type="button"
                  style={styles.clearSearch}
                  onClick={() => {
                    setBusqueda("");
                    setMostrarDropdown(false);
                  }}
                >
                  ✕
                </button>
              )}

              {mostrarDropdown && (
                <div style={styles.dropdown}>
                  <div style={styles.dropdownHeader}>
                    <strong>{productosFiltrados.length} resultado(s)</strong>
                    <button type="button" style={styles.tinyBtn} onClick={() => setMostrarDropdown(false)}>
                      Cerrar
                    </button>
                  </div>

                  {productosFiltrados.length === 0 ? (
                    <div style={styles.emptyDropdown}>
                      No encontré items para esta empresa.
                    </div>
                  ) : (
                    productosFiltrados.map((producto) => (
                      <button
                        key={producto.id}
                        type="button"
                        style={styles.productOption}
                        onClick={() => agregarProducto(producto)}
                      >
                        <div>
                          <strong>{producto.nombre}</strong>
                          <small>{producto.tipo === "producto" ? "Producto" : "Servicio"}</small>
                        </div>

                        <span>$ {money(obtenerPrecioProducto(producto))}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div style={styles.itemsHeader}>
            <h2 style={styles.sectionTitle}>Detalle de atención</h2>
            <span>{itemsAtencion.length} registro(s)</span>
          </div>

          {cargando ? (
            <div style={styles.emptyState}>Cargando atención...</div>
          ) : itemsAtencion.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>➕</div>
              <strong>Aún no se ha agregado nada</strong>
              <span>Buscá un producto o servicio arriba para comenzar.</span>
            </div>
          ) : (
            <div style={styles.itemCards}>
              {itemsAtencion.map((item) => {
                const productoBase = productos.find(
                  (producto) => String(producto.id) === String(item.item_id)
                );
                const permiteEditarPrecio = Boolean(
                  productoBase?.precio_editable || item.precio_editable
                );

                return (
                <div key={item.id} style={styles.detailCard}>
                  <div style={styles.detailTop}>
  <div>
    <strong style={styles.detailName}>{item.nombre}</strong>

    {item.descripcion && (
      <span style={styles.detailType}>
        {item.descripcion} · {permiteEditarPrecio ? "Precio editable" : "Precio fijo"}
      </span>
    )}
  </div>

  <div style={styles.inlineField}>
    <span>Cant.</span>

    <input
      style={styles.inlineInput}
      value={item.cantidad}
      onChange={(e) =>
        actualizarItem(item.id, "cantidad", e.target.value)
      }
      inputMode="decimal"
    />
  </div>

  <div style={styles.inlineField}>
    <span>Precio</span>

    <input
      style={{
        ...styles.inlineInput,
        ...(permiteEditarPrecio ? {} : styles.inputBloqueado),
      }}
      value={item.precio_unitario}
      onChange={(e) =>
        actualizarItem(item.id, "precio_unitario", e.target.value)
      }
      inputMode="decimal"
      disabled={!permiteEditarPrecio || bloqueado}
      title={permiteEditarPrecio ? "Precio editable" : "Precio fijo"}
    />
  </div>

  <strong style={styles.detailTotal}>
    $ {money(item.total)}
  </strong>
</div>

                  

                  <div style={esMovil ? styles.commentRowMobile : styles.commentRow}>
                    {bloqueado ? (
                      <span>{item.comentario || "Sin comentario"}</span>
                    ) : (
                      <input
                        style={styles.commentInput}
                        value={item.comentario || ""}
                        onChange={(e) => actualizarItem(item.id, "comentario", e.target.value)}
                        placeholder="Comentario opcional..."
                      />
                    )}

                    {!bloqueado && (
                      <button type="button" style={styles.deleteBtn} onClick={() => eliminarItem(item.id)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>

        <aside style={styles.summaryCard}>
          <h2 style={styles.sectionTitle}>Resumen</h2>

          <div style={styles.bigTotal}>
            <span>Total a cobrar</span>
            <strong>$ {money(totalAtencion)}</strong>
          </div>

          <div style={styles.summaryGrid}>
            <div>
              <span>Estado</span>
              <strong>{tituloEstado}</strong>
            </div>
            <div>
              <span>Items</span>
              <strong>{itemsAtencion.length}</strong>
            </div>
          </div>

          <label style={styles.noteLabel}>Nota general</label>
          <textarea
            style={styles.noteBox}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            onBlur={guardarObservacion}
            disabled={bloqueado}
            placeholder="Ej: paciente queda pendiente de ajuste, observación de doctora..."
          />

          <div style={styles.summaryActions}>
            {!bloqueado && (
              <button
                style={styles.primaryBtn}
                onClick={enviarACobro}
                disabled={guardando}
              >
                {guardando ? "Enviando..." : "Enviar a cobro"}
              </button>
            )}

            <button style={styles.secondaryBtn} onClick={volverACitas}>
              Volver a citas
            </button>
          </div>

          {bloqueado && (
            <div style={styles.infoBox}>
              Esta atención ya fue enviada a cobro.
            </div>
          )}
        </aside>
      </div>

      {mostrarReporteCobros && (
        <div style={styles.modalOverlayReporte} onClick={cerrarReporteCobros}>
          <div style={styles.reporteModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.reporteHeader}>
              <div>
                <h2 style={styles.reporteTitle}>Reporte de pacientes enviados a cobro</h2>
                <p style={styles.reporteSubtitle}>
                  Detalle clínico de lo realizado antes de pasar a CXC. Visible solo para jefatura/permisos autorizados.
                </p>
              </div>

              <button type="button" style={styles.closeReporteBtn} onClick={cerrarReporteCobros}>
                ✕
              </button>
            </div>

            <div style={styles.reporteFiltros}>
              <input
                type="date"
                style={styles.filterInput}
                value={filtroReporteDesde}
                onChange={(e) => setFiltroReporteDesde(e.target.value)}
              />

              <input
                type="date"
                style={styles.filterInput}
                value={filtroReporteHasta}
                onChange={(e) => setFiltroReporteHasta(e.target.value)}
              />

              <input
                style={styles.filterInput}
                value={filtroReporteTexto}
                onChange={(e) => setFiltroReporteTexto(e.target.value)}
                placeholder="Buscar paciente, teléfono o tratamiento..."
              />

              <button type="button" style={styles.secondaryBtn} onClick={cargarReporteCobros}>
                Filtrar
              </button>
            </div>

            <div style={styles.reporteResumen}>
              <div>
                <span>Pacientes</span>
                <strong>{reporteCobrosFiltrado.length}</strong>
              </div>

              <div>
                <span>Total enviado a cobro</span>
                <strong>$ {money(totalReporteCobros)}</strong>
              </div>
            </div>

            <div style={styles.reporteLista}>
              {cargandoReporteCobros ? (
                <div style={styles.emptyState}>Cargando reporte...</div>
              ) : reporteCobrosFiltrado.length === 0 ? (
                <div style={styles.emptyState}>
                  No hay atenciones enviadas a cobro con esos filtros.
                </div>
              ) : (
                reporteCobrosFiltrado.map((row) => (
                  <div key={row.id} style={styles.reporteCard}>
                    <div style={styles.reporteCardTop}>
                      <div>
                        <strong>{row.clientes?.nombre || "Paciente"}</strong>
                        <span>{row.clientes?.telefono || "Sin teléfono"}</span>
                      </div>

                      <div style={styles.reporteCardRight}>
                        <strong>$ {money(row.total)}</strong>
                        <span>{labelEstado(row.estado)}</span>
                      </div>
                    </div>

                    <div style={styles.reporteMeta}>
                      <span>Fecha enviada: {formatearFechaHora(row.updated_at || row.fecha_atencion)}</span>
                      {row.citas?.fecha && (
                        <span>Cita: {formatearFecha(row.citas.fecha)} {normalizarHora(row.citas.hora)}</span>
                      )}
                      {row.observacion && <span>Nota: {row.observacion}</span>}
                    </div>

                    <div style={styles.reporteDetalleItems}>
                      {(row.items || []).length === 0 ? (
                        <div style={styles.reporteItemVacio}>Sin detalle de procedimientos.</div>
                      ) : (
                        row.items.map((item) => (
                          <div key={item.id} style={styles.reporteItem}>
                            <div>
                              <strong>{item.nombre || "Producto / servicio"}</strong>
                              {item.comentario && <span>{item.comentario}</span>}
                            </div>

                            <div style={styles.reporteItemRight}>
                              <span>Cant. {Number(item.cantidad || 0)}</span>
                              <strong>$ {money(item.total)}</strong>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function leerJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function numero(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function limpiarDecimalInput(value) {
  if (value === "") return "";
  let limpio = String(value).replace(/[^0-9.]/g, "");
  const partes = limpio.split(".");
  if (partes.length > 2) {
    limpio = partes[0] + "." + partes.slice(1).join("");
  }
  return limpio;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function obtenerPrecioProducto(producto) {
  const candidatos = [
    producto.precio,
    producto.precio_venta,
    producto.precio_unitario,
    producto.valor,
    producto.monto,
  ];

  const encontrado = candidatos.find((x) => Number(x) > 0);
  return Number(encontrado || 0);
}

function obtenerFechaSV() {
  const ahora = new Date();
  const sv = new Date(ahora.toLocaleString("en-US", { timeZone: "America/El_Salvador" }));
  const y = sv.getFullYear();
  const m = String(sv.getMonth() + 1).padStart(2, "0");
  const d = String(sv.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function obtenerFechaHoraSVISO() {
  const ahoraSV = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/El_Salvador",
    })
  );

  const yyyy = ahoraSV.getFullYear();
  const mm = String(ahoraSV.getMonth() + 1).padStart(2, "0");
  const dd = String(ahoraSV.getDate()).padStart(2, "0");
  const hh = String(ahoraSV.getHours()).padStart(2, "0");
  const mi = String(ahoraSV.getMinutes()).padStart(2, "0");
  const ss = String(ahoraSV.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

function obtenerHoraActualSV() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/El_Salvador",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
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

function obtenerIniciales(nombre) {
  const partes = String(nombre || "P")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return partes
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "P";
}

function labelEstado(estado) {
  if (estado === "en_proceso") return "En proceso";
  if (estado === "pendiente_cobro") return "Pendiente de cobro";
  if (estado === "cobrada") return "Cobrada";
  if (estado === "anulada") return "Anulada";
  return estado || "En proceso";
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(107,90,122,0.16), transparent 30%), linear-gradient(180deg, #f6f3f8 0%, #ece8ef 100%)",
    padding: "14px",
    paddingBottom: "92px",
    boxSizing: "border-box",
  },

  toast: {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: 50,
    background: "#0f7a4d",
    color: "#fff",
    padding: "12px 14px",
    borderRadius: "16px",
    boxShadow: "0 16px 40px rgba(15,122,77,0.25)",
    fontWeight: "900",
    fontSize: "13px",
  },

  hero: {
    background: "linear-gradient(135deg, #5e4c6c 0%, #8a79a0 100%)",
    color: "#fff",
    borderRadius: "26px",
    padding: "16px",
    boxShadow: "0 22px 55px rgba(94,76,108,0.24)",
    display: "grid",
    gap: "14px",
  },

  heroTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
  },

  backBtn: {
    background: "rgba(255,255,255,0.16)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: "999px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: "900",
  },

  statusPill: {
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: "999px",
    padding: "8px 12px",
    fontWeight: "900",
    fontSize: "12px",
  },

  patientHero: {
    display: "grid",
    gridTemplateColumns: "62px minmax(0, 1fr) auto",
    gap: "13px",
    alignItems: "center",
  },

  avatar: {
    width: "62px",
    height: "62px",
    borderRadius: "23px",
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.24)",
    display: "grid",
    placeItems: "center",
    fontWeight: "950",
    fontSize: "21px",
  },

  patientInfo: {
    minWidth: 0,
  },

  title: {
    margin: 0,
    fontSize: "clamp(22px, 4vw, 34px)",
    fontWeight: "950",
    letterSpacing: "-0.04em",
  },

  patientMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "7px",
    marginTop: "8px",
    color: "rgba(255,255,255,0.86)",
    fontSize: "12px",
  },

  inlineField: {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "12px",
  color: "#64748b",
  fontWeight: "700",
},

inlineInput: {
  width: "70px",
  height: "32px",
  border: "1px solid #cfd9e5",
  borderRadius: "10px",
  padding: "4px 8px",
  outline: "none",
  fontSize: "13px",
},

  heroTotal: {
    minWidth: "150px",
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.20)",
    borderRadius: "20px",
    padding: "12px",
    display: "grid",
    gap: "2px",
    textAlign: "right",
  },

  pendingRail: {
    marginTop: "14px",
    background: "rgba(255,255,255,0.78)",
    border: "1px solid rgba(215,219,226,0.9)",
    borderRadius: "22px",
    padding: "12px",
    backdropFilter: "blur(10px)",
    boxShadow: "0 10px 26px rgba(15,23,42,0.05)",
  },

  railHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
    color: "#3d2f4f",
    marginBottom: "10px",
  },

  railEmpty: {
    color: "#64748b",
    fontSize: "13px",
    fontWeight: "850",
  },

  pendingScroller: {
    display: "flex",
    gap: "10px",
    overflowX: "auto",
    paddingBottom: "3px",
  },

  pendingChip: {
    minWidth: "210px",
    border: "1px solid #e2e8f0",
    background: "#fff",
    borderRadius: "18px",
    padding: "11px",
    textAlign: "left",
    cursor: "pointer",
    display: "grid",
    gap: "4px",
    color: "#334155",
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  },

  pendingChipActive: {
    border: "1px solid #8a79a0",
    background: "#f4f0f7",
    color: "#574866",
  },

  workspace: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 340px",
    gap: "14px",
    marginTop: "14px",
  },

  workCard: {
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "26px",
    padding: "16px",
    boxShadow: "0 12px 34px rgba(15,23,42,0.06)",
    minWidth: 0,
  },

  summaryCard: {
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "26px",
    padding: "16px",
    boxShadow: "0 12px 34px rgba(15,23,42,0.06)",
    alignSelf: "start",
    display: "grid",
    gap: "13px",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  sectionTitle: {
    margin: 0,
    color: "#1f2937",
    fontSize: "18px",
    fontWeight: "950",
  },

  sectionSubtitle: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: "13px",
  },

  counterPill: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "999px",
    padding: "8px 11px",
    fontWeight: "900",
    fontSize: "12px",
  },

  searchBox: {
    position: "relative",
    marginTop: "14px",
  },

  searchIcon: {
    position: "absolute",
    left: "13px",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 1,
  },

  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cfd9e5",
    borderRadius: "18px",
    padding: "14px 44px",
    outline: "none",
    fontSize: "15px",
    background: "#fff",
    color: "#0f172a",
    boxShadow: "inset 0 1px 0 rgba(15,23,42,0.02)",
  },

  clearSearch: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "#f1f5f9",
    borderRadius: "999px",
    width: "30px",
    height: "30px",
    cursor: "pointer",
    color: "#64748b",
    fontWeight: "900",
  },

  dropdown: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    right: 0,
    zIndex: 20,
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "20px",
    padding: "10px",
    boxShadow: "0 24px 60px rgba(15,23,42,0.18)",
    display: "grid",
    gap: "8px",
    maxHeight: "340px",
    overflowY: "auto",
  },

  dropdownHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#64748b",
    fontSize: "12px",
    padding: "2px 3px 6px",
  },

  productOption: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #fff 0%, #fbfbfc 100%)",
    borderRadius: "16px",
    padding: "12px",
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    cursor: "pointer",
    color: "#334155",
    textAlign: "left",
  },

  emptyDropdown: {
    padding: "14px",
    textAlign: "center",
    color: "#64748b",
    fontWeight: "850",
    border: "1px dashed #cbd5e1",
    borderRadius: "15px",
  },

  itemsHeader: {
    marginTop: "18px",
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    color: "#64748b",
    alignItems: "center",
  },

  itemCards: {
    marginTop: "10px",
    display: "grid",
    gap: "11px",
  },

  detailCard: {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
},

  detailTop: {
  display: "grid",
  gridTemplateColumns: "1fr auto auto auto",
  gap: "10px",
  alignItems: "center",
},

  detailName: {
    color: "#1f2937",
    fontSize: "16px",
  },

  detailType: {
    display: "block",
    marginTop: "4px",
    color: "#64748b",
    fontSize: "12px",
    textTransform: "capitalize",
  },

  detailTotal: {
    color: "#574866",
    fontSize: "16px",
    whiteSpace: "nowrap",
  },

  detailControls: {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
},

  miniInput: {
  width: "40px",
  height: "25px",
  boxSizing: "border-box",
  border: "1px solid #cfd9e5",
  borderRadius: "20px",
  padding: "1px 3px",
  outline: "none",
  fontSize: "13px",
},

  commentRow: {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "7px",
  alignItems: "center",
},

  commentInput: {
  width: "100%",
  height: "34px",
  boxSizing: "border-box",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  borderRadius: "10px",
  padding: "6px 10px",
  outline: "none",
  fontSize: "13px",
},

  deleteBtn: {
  background: "#fff1f2",
  color: "#be123c",
  border: "1px solid #fecdd3",
  borderRadius: "10px",
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: "900",
  fontSize: "12px",
},

  bigTotal: {
    background: "linear-gradient(135deg, #f4f0f7 0%, #ffffff 100%)",
    border: "1px solid #d3c7dd",
    borderRadius: "22px",
    padding: "16px",
    display: "grid",
    gap: "4px",
    color: "#574866",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },

  noteLabel: {
    color: "#334155",
    fontSize: "13px",
    fontWeight: "950",
  },

  noteBox: {
    width: "100%",
    minHeight: "120px",
    boxSizing: "border-box",
    border: "1px solid #cfd9e5",
    borderRadius: "16px",
    padding: "12px",
    outline: "none",
    fontSize: "13px",
    resize: "vertical",
  },

  summaryActions: {
    display: "grid",
    gap: "9px",
  },

  primaryBtn: {
    background: "linear-gradient(135deg, #6b5a7a 0%, #8a79a0 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "13px 15px",
    cursor: "pointer",
    fontWeight: "950",
    boxShadow: "0 12px 24px rgba(107,90,122,0.20)",
  },

  secondaryBtn: {
    background: "#fff",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "16px",
    padding: "13px 15px",
    cursor: "pointer",
    fontWeight: "900",
  },

  tinyBtn: {
    background: "#fff",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "11px",
    padding: "7px 10px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "12px",
  },

  emptyState: {
    marginTop: "12px",
    background: "#f8fafc",
    border: "1px dashed #cbd5e1",
    borderRadius: "20px",
    padding: "28px",
    textAlign: "center",
    color: "#64748b",
    display: "grid",
    gap: "6px",
  },

  emptyIcon: {
    fontSize: "28px",
  },

  emptyCard: {
    maxWidth: "520px",
    margin: "80px auto",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "26px",
    padding: "24px",
    textAlign: "center",
    display: "grid",
    gap: "12px",
  },

  infoBox: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#64748b",
    borderRadius: "16px",
    padding: "12px",
    fontSize: "13px",
    fontWeight: "800",
    lineHeight: 1.4,
  },

  bottomBar: {
    position: "fixed",
    left: "12px",
    right: "12px",
    bottom: "12px",
    zIndex: 30,
    background: "rgba(255,255,255,0.94)",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    boxShadow: "0 18px 50px rgba(15,23,42,0.20)",
    backdropFilter: "blur(12px)",
  },

  bottomBtn: {
    background: "#0f7a4d",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "12px 15px",
    cursor: "pointer",
    fontWeight: "950",
  },

  patientHeroMobile: {
    display: "grid",
    gridTemplateColumns: "54px minmax(0, 1fr)",
    gap: "11px",
    alignItems: "center",
  },

  heroTotalMobile: {
    gridColumn: "1 / -1",
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.20)",
    borderRadius: "18px",
    padding: "12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  workspaceMobile: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "12px",
    marginTop: "12px",
  },

  commentRowMobile: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "8px",
  },

  listHero: {
    background: "linear-gradient(135deg, #5e4c6c 0%, #8a79a0 100%)",
    color: "#fff",
    borderRadius: "26px",
    padding: "18px",
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    alignItems: "flex-start",
    flexWrap: "wrap",
    boxShadow: "0 22px 55px rgba(94,76,108,0.24)",
  },

  listTitle: {
    margin: "14px 0 0",
    fontSize: "clamp(24px, 4vw, 36px)",
    fontWeight: "950",
    letterSpacing: "-0.04em",
  },

  listSubtitle: {
    margin: "6px 0 0",
    color: "rgba(255,255,255,0.82)",
    fontSize: "13px",
  },

  backBtnDark: {
    background: "rgba(255,255,255,0.16)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: "999px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: "900",
  },

  listCounter: {
    minWidth: "110px",
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.20)",
    borderRadius: "20px",
    padding: "12px",
    display: "grid",
    gap: "2px",
    textAlign: "center",
  },

  listFilters: {
    marginTop: "14px",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "12px",
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) 220px auto",
    gap: "10px",
    alignItems: "center",
  },

  filterInput: {
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

  listGrid: {
    marginTop: "14px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "12px",
  },

  attentionCard: {
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "14px",
    cursor: "pointer",
    display: "grid",
    gap: "13px",
    textAlign: "left",
    color: "#334155",
    boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
  },

  attentionCardTop: {
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr)",
    gap: "10px",
    alignItems: "center",
  },

  attentionAvatar: {
    width: "46px",
    height: "46px",
    borderRadius: "16px",
    background: "#f4f0f7",
    color: "#574866",
    display: "grid",
    placeItems: "center",
    fontWeight: "950",
    border: "1px solid #d3c7dd",
  },

  attentionMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "10px",
    fontSize: "13px",
  },

  attentionFoot: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: "850",
  },

  listFiltersMobile: {
    marginTop: "14px",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "12px",
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "10px",
    alignItems: "center",
  },

  inputBloqueado: {
    background: "#f8fafc",
    color: "#64748b",
    cursor: "not-allowed",
  },


  reportBtnHero: {
    background: "rgba(255,255,255,0.16)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: "999px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: "900",
  },

  modalOverlayReporte: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.48)",
    zIndex: 9800,
    display: "grid",
    placeItems: "center",
    padding: "18px",
  },

  reporteModal: {
    width: "min(1120px, calc(100vw - 30px))",
    maxHeight: "calc(100vh - 36px)",
    background: "#fff",
    borderRadius: "24px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 24px 80px rgba(15,23,42,0.28)",
    padding: "18px",
    display: "grid",
    gridTemplateRows: "auto auto auto minmax(0, 1fr)",
    gap: "13px",
    boxSizing: "border-box",
  },

  reporteHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
  },

  reporteTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "24px",
    fontWeight: "950",
  },

  reporteSubtitle: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: "13px",
  },

  closeReporteBtn: {
    border: "none",
    background: "#f1f5f9",
    color: "#334155",
    borderRadius: "11px",
    width: "36px",
    height: "36px",
    cursor: "pointer",
    fontWeight: "950",
  },

  reporteFiltros: {
    display: "grid",
    gridTemplateColumns: "160px 160px minmax(240px, 1fr) auto",
    gap: "10px",
    alignItems: "center",
  },

  reporteResumen: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "10px",
  },

  reporteLista: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "10px",
    paddingRight: "4px",
  },

  reporteCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "14px",
    display: "grid",
    gap: "10px",
    boxShadow: "0 8px 22px rgba(15,23,42,0.05)",
  },

  reporteCardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  reporteCardRight: {
    display: "grid",
    gap: "3px",
    textAlign: "right",
    color: "#574866",
  },

  reporteMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "7px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: "800",
  },

  reporteDetalleItems: {
    display: "grid",
    gap: "7px",
  },

  reporteItem: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "13px",
    padding: "10px",
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
  },

  reporteItemRight: {
    display: "grid",
    gap: "3px",
    textAlign: "right",
    color: "#334155",
    whiteSpace: "nowrap",
  },

  reporteItemVacio: {
    background: "#f8fafc",
    border: "1px dashed #cbd5e1",
    borderRadius: "13px",
    padding: "12px",
    color: "#64748b",
    textAlign: "center",
    fontWeight: "850",
  },


  pdfBtn: {
    background: "#be123c",
    color: "#fff",
    border: "none",
    borderRadius: "16px",
    padding: "13px 15px",
    cursor: "pointer",
    fontWeight: "900",
    boxShadow: "0 10px 22px rgba(190,18,60,0.18)",
  },

};

export default AtencionClinica;
