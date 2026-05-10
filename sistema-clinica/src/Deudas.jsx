import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

function obtenerFechaLocalSV() {
  return new Date()
    .toLocaleString("en-CA", {
      timeZone: "America/El_Salvador",
    })
    .slice(0, 10);
}

function formatearFecha(fecha) {
  if (!fecha) return "";
  const soloFecha = String(fecha).slice(0, 10);
  const [yyyy, mm, dd] = soloFecha.split("-");
  if (!yyyy || !mm || !dd) return fecha;
  return `${dd}/${mm}/${yyyy}`;
}

function calcularDiasMora(fechaVenta) {
  if (!fechaVenta) return 0;

  const hoy = obtenerFechaLocalSV();
  const fecha1 = new Date(`${String(fechaVenta).slice(0, 10)}T00:00:00`);
  const fecha2 = new Date(`${hoy}T00:00:00`);

  const diffMs = fecha2 - fecha1;
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDias >= 0 ? diffDias : 0;
}

function obtenerRangoAntiguedad(dias) {
  if (dias <= 30) return "0-30 días";
  if (dias <= 60) return "31-60 días";
  if (dias <= 90) return "61-90 días";
  return "Más de 90 días";
}

async function registrarPagosEnCajaDiaria({
  empresaId,
  ventaId,
  nombrePaciente,
  pagosValidos,
  fechaLocal,
}) {
  if (!empresaId || !ventaId || !nombrePaciente || pagosValidos.length === 0) return;

  const fechaSolo = fechaLocal.slice(0, 10);
  let cajaId = null;

  const { data: cajaExistente, error: errorBuscarCaja } = await supabase
    .from("cajas_diarias")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("fecha_local", fechaSolo)
    .maybeSingle();

  if (errorBuscarCaja) {
    console.error(errorBuscarCaja);
    throw new Error("Error al buscar caja diaria");
  }

  if (cajaExistente) {
    cajaId = cajaExistente.id;
  } else {
    const { data: nuevaCaja, error: errorCrearCaja } = await supabase
      .from("cajas_diarias")
      .insert([
        {
          empresa_id: empresaId,
          fecha: fechaLocal,
          fecha_local: fechaSolo,
        },
      ])
      .select("id")
      .single();

    if (errorCrearCaja) {
      console.error(errorCrearCaja);
      throw new Error("Error al crear caja diaria");
    }

    cajaId = nuevaCaja.id;
  }

  const detalleCaja = pagosValidos.map((p) => ({
    caja_diaria_id: cajaId,
    venta_id: ventaId,
    paciente: nombrePaciente,
    metodo_pago_id: Number(p.metodo_pago_id),
    monto: Number(p.monto),
    referencia: p.referencia?.trim() || null,
  }));

  const { error: errorInsertarDetalle } = await supabase
    .from("caja_diaria_detalle")
    .insert(detalleCaja);

  if (errorInsertarDetalle) {
    console.error(errorInsertarDetalle);
    throw new Error("Error al pasar pagos a caja diaria");
  }
}


function obtenerOrigenVenta(venta) {
  const texto = [
    venta.origen,
    venta.tipo_origen,
    venta.modulo_origen,
    venta.referencia,
    venta.observacion,
    venta.descripcion,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  try {
    const atencionPendiente = JSON.parse(localStorage.getItem("atencionPendienteCobro") || "null");
    if (atencionPendiente?.venta_id && String(atencionPendiente.venta_id) === String(venta.id)) {
      return "atencion";
    }
  } catch {}

  if (
    texto.includes("atencion") ||
    texto.includes("atención") ||
    texto.includes("clinica") ||
    texto.includes("clínica") ||
    texto.includes("cita")
  ) {
    return "atencion";
  }

  return "venta";
}

function Deudas() {
  const empresaGuardada = JSON.parse(localStorage.getItem("empresa") || "null");

  const [empresa, setEmpresa] = useState(empresaGuardada);
  const [empresasUsuario, setEmpresasUsuario] = useState([]);
  const [empresasReporteIds, setEmpresasReporteIds] = useState(() => {
    const guardadas = JSON.parse(localStorage.getItem("empresas_deudas_ids") || "[]");
    if (Array.isArray(guardadas) && guardadas.length > 0) return guardadas;
    return empresaGuardada?.id ? [empresaGuardada.id] : [];
  });
  const [mostrarSelectorEmpresas, setMostrarSelectorEmpresas] = useState(false);
  const [ventas, setVentas] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);
  const [clasificaciones, setClasificaciones] = useState([]);
  const [detalleVentaAbierta, setDetalleVentaAbierta] = useState([]);
  const [clasificacionPacienteId, setClasificacionPacienteId] = useState("");
  const [filtroDesdeCxC, setFiltroDesdeCxC] = useState("");
  const [filtroHastaCxC, setFiltroHastaCxC] = useState("");
  const [filtroOrigenCxC, setFiltroOrigenCxC] = useState("todos");
  const [ventaAbierta, setVentaAbierta] = useState(null);
  const [pagos, setPagos] = useState([
    { metodo_pago_id: "", monto: "", referencia: "" },
  ]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarEmpresasUsuario();
  }, []);

  useEffect(() => {
    if (empresa?.id) {
      obtenerMetodosPago(empresa.id);
      obtenerClasificaciones(empresa.id);
    } else {
      setMetodosPago([]);
      setClasificaciones([]);
    }
  }, [empresa?.id]);

  useEffect(() => {
    if (empresa?.id || empresasReporteIds.length > 0) {
      localStorage.setItem("empresas_deudas_ids", JSON.stringify(empresasReporteIds));
      obtenerCuentasPorCobrar();
    } else {
      setVentas([]);
    }
  }, [empresa?.id, empresasReporteIds.join("|"), filtroDesdeCxC, filtroHastaCxC, filtroOrigenCxC]);

  const cargarEmpresasUsuario = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (!userId) {
        if (empresaGuardada?.id) setEmpresasUsuario([empresaGuardada]);
        return;
      }

      const { data, error } = await supabase
        .from("empresa_usuarios")
        .select("empresa_id, activo, empresas(id, nombre)")
        .eq("user_id", userId)
        .eq("activo", true);

      if (error) throw error;

      const empresas = (data || [])
        .map((fila) => fila.empresas)
        .filter(Boolean);

      setEmpresasUsuario(empresas);

      if (empresas.length > 0) {
        const sigueDisponible = empresas.some(
          (e) => String(e.id) === String(empresaGuardada?.id)
        );

        const empresaInicial = sigueDisponible ? empresaGuardada : empresas[0];
        setEmpresa(empresaInicial);
        localStorage.setItem("empresa", JSON.stringify(empresaInicial));

        const idsDisponibles = empresas.map((e) => String(e.id));
        const idsGuardadosValidos = empresasReporteIds.filter((id) =>
          idsDisponibles.includes(String(id))
        );
        const idsIniciales = idsGuardadosValidos.length
          ? idsGuardadosValidos
          : empresaInicial?.id
          ? [empresaInicial.id]
          : [empresas[0].id];

        setEmpresasReporteIds(idsIniciales);
        localStorage.setItem("empresas_deudas_ids", JSON.stringify(idsIniciales));
      }
    } catch (error) {
      console.error(error);
      if (empresaGuardada?.id) setEmpresasUsuario([empresaGuardada]);
    }
  };

  const cambiarEmpresaActiva = (empresaId) => {
    const nuevaEmpresa = empresasUsuario.find(
      (e) => String(e.id) === String(empresaId)
    );

    if (!nuevaEmpresa) return;

    setEmpresa(nuevaEmpresa);
    localStorage.setItem("empresa", JSON.stringify(nuevaEmpresa));
    cerrarCobro();
  };

  const toggleEmpresaReporte = (empresaId) => {
    setEmpresasReporteIds((prev) => {
      const existe = prev.some((id) => String(id) === String(empresaId));
      const nuevos = existe
        ? prev.filter((id) => String(id) !== String(empresaId))
        : [...prev, empresaId];

      const resultado = nuevos.length ? nuevos : prev;
      localStorage.setItem("empresas_deudas_ids", JSON.stringify(resultado));
      return resultado;
    });
  };

  const seleccionarTodasEmpresasReporte = () => {
    const ids = empresasUsuario.map((e) => e.id).filter(Boolean);
    if (ids.length > 0) {
      setEmpresasReporteIds(ids);
      localStorage.setItem("empresas_deudas_ids", JSON.stringify(ids));
    }
  };

  const seleccionarSoloEmpresaActiva = () => {
    if (empresa?.id) {
      setEmpresasReporteIds([empresa.id]);
      localStorage.setItem("empresas_deudas_ids", JSON.stringify([empresa.id]));
    }
  };

  const obtenerNombreEmpresa = (empresaId) => {
    return empresasUsuario.find((e) => String(e.id) === String(empresaId))?.nombre || "Empresa";
  };

  const tituloEmpresasReporte = useMemo(() => {
    const seleccionadas = empresasUsuario.filter((e) =>
      empresasReporteIds.some((id) => String(id) === String(e.id))
    );

    if (seleccionadas.length === 0) return empresa?.nombre || "Empresa activa";
    if (seleccionadas.length === 1) return seleccionadas[0].nombre;
    return `${seleccionadas.length} empresas combinadas`;
  }, [empresasUsuario, empresasReporteIds, empresa?.nombre]);

  const obtenerMetodosPago = async (empresaId = empresa?.id) => {
    if (!empresaId) return;

    const { data, error } = await supabase
      .from("metodos_pago")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("orden", { ascending: true });

    if (error) {
      console.error(error);
      return alert("Error al cargar métodos de pago");
    }

    setMetodosPago(data || []);
  };

  const obtenerClasificaciones = async (empresaId = empresa?.id) => {
    if (!empresaId) return;

    const { data, error } = await supabase
      .from("clasificaciones_pacientes")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("nombre", { ascending: true });

    if (error) {
      console.warn("No se pudieron cargar clasificaciones_pacientes:", error);
      setClasificaciones([]);
      return;
    }

    setClasificaciones(data || []);
  };

  const obtenerCuentasPorCobrar = async () => {
    const idsConsulta = empresasReporteIds.length > 0
      ? empresasReporteIds
      : empresa?.id
      ? [empresa.id]
      : [];

    if (idsConsulta.length === 0) return;

    let query = supabase
      .from("ventas")
      .select("*, clientes(id, nombre), venta_pagos(monto)")
      .in("empresa_id", idsConsulta)
      .neq("estado", "pagado");

    if (filtroDesdeCxC) query = query.gte("fecha_local", `${filtroDesdeCxC}T00:00:00`);
    if (filtroHastaCxC) query = query.lte("fecha_local", `${filtroHastaCxC}T23:59:59`);

    const { data, error } = await query.order("fecha_local", { ascending: false });

    if (error) {
      console.error(error);
      return alert("Error al cargar cuentas por cobrar");
    }

    const ventasConSaldo = (data || []).map((venta) => {
      const abonado = (venta.venta_pagos || []).reduce(
        (sum, pago) => sum + Number(pago.monto || 0),
        0
      );

      const saldo = Number(venta.total || 0) - abonado;
      const diasMora = calcularDiasMora(venta.fecha_local);
      const antiguedad = obtenerRangoAntiguedad(diasMora);

      const origen = obtenerOrigenVenta(venta);

      return {
        ...venta,
        origen_cxc: origen,
        empresa_nombre: obtenerNombreEmpresa(venta.empresa_id),
        abonado,
        saldo,
        ha_abonado: abonado > 0 ? "Sí" : "No",
        dias_mora: diasMora,
        antiguedad,
      };
    });

    const filtradasPorOrigen = ventasConSaldo.filter((v) => {
      if (filtroOrigenCxC === "todos") return true;
      return v.origen_cxc === filtroOrigenCxC;
    });

    setVentas(filtradasPorOrigen.filter((v) => v.saldo > 0));
  };

  const cargarDetalleVenta = async (venta) => {
    if (!venta?.id) {
      setDetalleVentaAbierta([]);
      return;
    }

    const { data, error } = await supabase
      .from("detalle_venta")
      .select(`
        *,
        items(nombre, tipo)
      `)
      .eq("venta_id", venta.id);

    if (error) {
      console.warn("No se pudo cargar detalle_venta:", error);
      setDetalleVentaAbierta([]);
      return;
    }

    setDetalleVentaAbierta(data || []);
  };

  const abrirCobro = async (venta) => {
    await obtenerMetodosPago(venta.empresa_id || empresa?.id);
    await obtenerClasificaciones(venta.empresa_id || empresa?.id);
    await cargarDetalleVenta(venta);
    setVentaAbierta(venta);
    setClasificacionPacienteId(venta.clasificacion_paciente_id || venta.cliente_clasificacion_id || "");
    setPagos([{ metodo_pago_id: "", monto: "", referencia: "" }]);
  };

  const cerrarCobro = () => {
    setVentaAbierta(null);
    setDetalleVentaAbierta([]);
    setClasificacionPacienteId("");
    setPagos([{ metodo_pago_id: "", monto: "", referencia: "" }]);
  };

  const agregarFilaPago = () => {
    setPagos([...pagos, { metodo_pago_id: "", monto: "", referencia: "" }]);
  };

  const eliminarFilaPago = (index) => {
    const nuevos = pagos.filter((_, i) => i !== index);
    setPagos(
      nuevos.length
        ? nuevos
        : [{ metodo_pago_id: "", monto: "", referencia: "" }]
    );
  };

  const actualizarPago = (index, campo, valor) => {
    const nuevos = [...pagos];
    nuevos[index][campo] = valor;
    setPagos(nuevos);
  };

  const totalPagoActual = useMemo(() => {
    return pagos.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
  }, [pagos]);

  const saldoRestante = useMemo(() => {
    if (!ventaAbierta) return 0;
    const saldo =
      Number(ventaAbierta.saldo || 0) - Number(totalPagoActual || 0);
    return saldo > 0 ? saldo : 0;
  }, [ventaAbierta, totalPagoActual]);

  const totalCxC = useMemo(() => {
    return ventas.reduce((acc, venta) => acc + Number(venta.saldo || 0), 0);
  }, [ventas]);

  const totalCxCOriginal = useMemo(() => {
    return ventas.reduce((acc, venta) => acc + Number(venta.total || 0), 0);
  }, [ventas]);

  const totalCxCAbonado = useMemo(() => {
    return ventas.reduce((acc, venta) => acc + Number(venta.abonado || 0), 0);
  }, [ventas]);


  const exportarCxcExcel = () => {
    if (ventas.length === 0) {
      return alert("No hay cuentas por cobrar para exportar");
    }

    const rows = [
      {
        Empresa: tituloEmpresasReporte || empresa?.nombre || "Empresa activa",
        Empresa: "",
        Cliente: "",
        "Fecha venta": "",
        "Días de antigüedad": "",
        "Rango antigüedad": "",
        Total: "",
        Abonado: "",
        Saldo: "",
        "Ha abonado": "",
        Estado: "",
      },
      {
        Empresa: `Fecha de emisión: ${formatearFecha(obtenerFechaLocalSV())}`,
        Empresa: "",
        Cliente: "",
        "Fecha venta": "",
        "Días de antigüedad": "",
        "Rango antigüedad": "",
        Total: "",
        Abonado: "",
        Saldo: "",
        "Ha abonado": "",
        Estado: "",
      },
      {
        Empresa: "",
        Cliente: "",
        "Fecha venta": "",
        "Días de antigüedad": "",
        "Rango antigüedad": "",
        Total: "",
        Abonado: "",
        Saldo: "",
        "Ha abonado": "",
        Estado: "",
      },
      ...ventas.map((v) => ({
        Empresa: v.empresa_nombre || obtenerNombreEmpresa(v.empresa_id),
        Cliente: v.clientes?.nombre || "Sin nombre",
        "Fecha venta": formatearFecha(v.fecha_local),
        "Días de antigüedad": v.dias_mora,
        "Rango antigüedad": v.antiguedad,
        Total: Number(v.total || 0).toFixed(2),
        Abonado: Number(v.abonado || 0).toFixed(2),
        Saldo: Number(v.saldo || 0).toFixed(2),
        "Ha abonado": v.ha_abonado,
        Estado: v.estado,
      })),
    ];

    const totalSaldo = ventas.reduce(
      (acc, item) => acc + Number(item.saldo || 0),
      0
    );

    rows.push({
      Empresa: "",
      Cliente: "TOTAL GENERAL",
      "Fecha venta": "",
      "Días de antigüedad": "",
      "Rango antigüedad": "",
      Total: "",
      Abonado: "",
      Saldo: totalSaldo.toFixed(2),
      "Ha abonado": "",
      Estado: "",
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Reporte CxC");

    XLSX.writeFile(wb, `Reporte_CxC_${obtenerFechaLocalSV()}.xlsx`);
  };

  const exportarCxcPDF = () => {
    if (ventas.length === 0) {
      return alert("No hay cuentas por cobrar para exportar");
    }

    const totalSaldo = ventas.reduce(
      (acc, item) => acc + Number(item.saldo || 0),
      0
    );

    const doc = new jsPDF("landscape", "mm", "a4");

    const colorPrincipal = [107, 90, 122];
    const colorSecundario = [236, 236, 239];
    const colorTexto = [31, 41, 55];

    doc.setFillColor(...colorSecundario);
    doc.circle(275, 12, 34, "F");
    doc.circle(8, 198, 26, "F");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colorPrincipal);
    doc.setFontSize(20);
    doc.text("Reporte de Cuentas por Cobrar", 14, 18);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colorTexto);
    doc.setFontSize(10);
    doc.text(tituloEmpresasReporte || empresa?.nombre || "Empresa activa", 14, 25);
    doc.text(`Fecha de emisión: ${formatearFecha(obtenerFechaLocalSV())}`, 14, 31);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colorPrincipal);
    doc.setFontSize(16);
    doc.text("CxC", 283, 18, { align: "right" });

    autoTable(doc, {
      startY: 40,
      head: [[
        "Empresa",
        "Cliente",
        "Fecha venta",
        "Días",
        "Antigüedad",
        "Total",
        "Abonado",
        "Saldo",
        "Ha abonado",
        "Estado",
      ]],
      body: ventas.map((v) => [
        v.empresa_nombre || obtenerNombreEmpresa(v.empresa_id),
        v.clientes?.nombre || "Sin nombre",
        formatearFecha(v.fecha_local),
        String(v.dias_mora || 0),
        v.antiguedad || "",
        `$${Number(v.total || 0).toFixed(2)}`,
        `$${Number(v.abonado || 0).toFixed(2)}`,
        `$${Number(v.saldo || 0).toFixed(2)}`,
        v.ha_abonado || "No",
        v.estado || "",
      ]),
      foot: [[
        "",
        "",
        "",
        "",
        "",
        "",
        "TOTAL",
        `$${totalSaldo.toFixed(2)}`,
        "",
        "",
      ]],
      theme: "grid",
      styles: {
        fontSize: 8.8,
        textColor: colorTexto,
        lineColor: [210, 214, 220],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: colorPrincipal,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [244, 240, 247],
        textColor: colorTexto,
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      margin: { left: 10, right: 10 },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 48 },
        2: { cellWidth: 24, halign: "center" },
        3: { cellWidth: 15, halign: "center" },
        4: { cellWidth: 28, halign: "center" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 22, halign: "right" },
        8: { cellWidth: 20, halign: "center" },
        9: { cellWidth: 20, halign: "center" },
      },
    });

    doc.save(`Reporte_CxC_${obtenerFechaLocalSV()}.pdf`);
  };

  const guardarClasificacionPaciente = async ({
    empresaId,
    clienteId,
    clasificacionId,
    fechaLocal,
    paciente,
    ventaId,
  }) => {
    if (!empresaId || !clasificacionId || !fechaLocal || !paciente) return;

    const fechaSolo = String(fechaLocal).slice(0, 10);

    const payload = {
      empresa_id: empresaId,
      fecha_local: fechaSolo,
      paciente: String(paciente || "").trim(),
      venta_id: ventaId ? String(ventaId) : null,
      grupo_facturacion: null,
      clasificacion_id: clasificacionId,
    };

    const { data: existente, error: errorBuscar } = await supabase
      .from("caja_paciente_clasificaciones")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("fecha_local", fechaSolo)
      .eq("paciente", payload.paciente)
      .eq("venta_id", payload.venta_id)
      .eq("clasificacion_id", clasificacionId)
      .maybeSingle();

    if (errorBuscar) {
      console.warn("No se pudo verificar clasificación existente:", errorBuscar);
    }

    if (existente?.id) return;

    const { error } = await supabase
      .from("caja_paciente_clasificaciones")
      .insert([payload]);

    if (error) {
      console.error("Error guardando clasificación para Caja Diaria:", error);
      throw new Error("El pago se registró, pero no se pudo guardar la clasificación para Caja Diaria");
    }
  };


  const registrarPago = async () => {
    if (!ventaAbierta || !empresa?.id) return;

    const pagosValidos = pagos.filter(
      (p) =>
        p.metodo_pago_id &&
        p.monto !== "" &&
        p.monto !== null &&
        Number(p.monto) > 0
    );

    if (pagosValidos.length === 0) {
      return alert("Agregá al menos un pago válido");
    }

    const totalIngresado = pagosValidos.reduce(
      (sum, p) => sum + Number(p.monto || 0),
      0
    );

    if (totalIngresado <= 0) {
      return alert("Ingresá un monto válido");
    }

    if (totalIngresado > Number(ventaAbierta.saldo || 0)) {
      return alert(
        `El pago no puede ser mayor al saldo pendiente de $${Number(
          ventaAbierta.saldo || 0
        ).toFixed(2)}`
      );
    }

    setGuardando(true);

    const fechaLocal = obtenerFechaHoraSVISO();

    const empresaPagoId = ventaAbierta.empresa_id || empresa?.id;

    if (clasificacionPacienteId) {
      await guardarClasificacionPaciente({
        empresaId: empresaPagoId,
        clienteId: ventaAbierta.cliente_id,
        clasificacionId: clasificacionPacienteId,
        fechaLocal,
        paciente: ventaAbierta.clientes?.nombre || "Cliente",
        ventaId: ventaAbierta.id,
      });
    }

    const pagosParaGuardar = pagosValidos.map((p) => ({
      venta_id: ventaAbierta.id,
      empresa_id: empresaPagoId,
      metodo_pago_id: Number(p.metodo_pago_id),
      monto: Number(p.monto),
      referencia: p.referencia?.trim() || null,
      fecha_local: fechaLocal,
    }));

    const { error: errorPago } = await supabase
      .from("venta_pagos")
      .insert(pagosParaGuardar);

    if (errorPago) {
      setGuardando(false);
      console.error(errorPago);
      return alert("Error al registrar el pago");
    }

    try {
      await registrarPagosEnCajaDiaria({
        empresaId: empresaPagoId,
        ventaId: ventaAbierta.id,
        nombrePaciente: ventaAbierta.clientes?.nombre || "Cliente",
        pagosValidos,
        fechaLocal,
      });
    } catch (error) {
      setGuardando(false);
      console.error(error);
      return alert("El pago se registró, pero hubo error al pasarlo a caja diaria");
    }

    const nuevoSaldo = Number(ventaAbierta.saldo || 0) - totalIngresado;

    let nuevoEstado = "parcial";
    if (nuevoSaldo <= 0) {
      nuevoEstado = "pagado";
    } else if (nuevoSaldo === Number(ventaAbierta.total || 0)) {
      nuevoEstado = "pendiente";
    }

    const { error: errorVenta } = await supabase
      .from("ventas")
      .update({ estado: nuevoEstado })
      .eq("id", ventaAbierta.id)
      .eq("empresa_id", empresaPagoId);

    setGuardando(false);

    if (errorVenta) {
      console.error(errorVenta);
      return alert("Pago registrado, pero hubo error actualizando el estado");
    }

    alert("Pago registrado correctamente");
    cerrarCobro();
    obtenerCuentasPorCobrar();
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Deudas</h1>
            <p style={styles.subtitle}>
              Control de saldos pendientes, abonos y antigüedad de cuentas por cobrar.
            </p>
          </div>

          <div style={styles.headerInfo}>
            <div>
              {empresasUsuario.length > 1 ? (
                <select
                  value={empresa?.id || ""}
                  onChange={(e) => cambiarEmpresaActiva(e.target.value)}
                  style={styles.empresaSelect}
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
            <div>Módulo de cuentas por cobrar</div>
            <div>Registros pendientes: <strong>{ventas.length}</strong></div>
          </div>
        </div>

        <div style={styles.reportCard}>
          <div>
            <h2 style={styles.reportTitle}>Reporte CxC</h2>
            <p style={styles.reportText}>
              Exportá el listado completo de clientes que deben, con antigüedad, abonos y saldo.
            </p>
            <p style={styles.reportText}>
              Vista actual: <strong>{tituloEmpresasReporte}</strong>
            </p>
          </div>

          {empresasUsuario.length > 1 && (
            <div style={styles.headerEmpresaSelect}>
              <div style={styles.headerEmpresaTop}>
                <span style={styles.headerEmpresaLabel}>Empresas a combinar</span>

                <div style={styles.headerEmpresaActions}>
                  <button type="button" style={styles.miniBtn} onClick={seleccionarSoloEmpresaActiva}>
                    Solo activa
                  </button>
                  <button type="button" style={styles.miniBtn} onClick={seleccionarTodasEmpresasReporte}>
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
                      const checked = empresasReporteIds.some((id) => String(id) === String(emp.id));

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
          )}

          <div style={styles.reportButtons}>
            <button type="button" style={styles.pdfBtn} onClick={exportarCxcPDF}>
              PDF CxC
            </button>

            <button type="button" style={styles.excelBtn} onClick={exportarCxcExcel}>
              Excel CxC
            </button>
          </div>
        </div>

        <div style={styles.kpiGrid}>
          <div style={styles.kpiCard}>
            <span>Total pendiente</span>
            <strong>${Number(totalCxC || 0).toFixed(2)}</strong>
          </div>

          <div style={styles.kpiCard}>
            <span>Total original</span>
            <strong>${Number(totalCxCOriginal || 0).toFixed(2)}</strong>
          </div>

          <div style={styles.kpiCard}>
            <span>Total abonado</span>
            <strong>${Number(totalCxCAbonado || 0).toFixed(2)}</strong>
          </div>

          <div style={styles.kpiCard}>
            <span>Registros</span>
            <strong>{ventas.length}</strong>
          </div>
        </div>

        <div style={styles.filtrosCard}>
          <div>
            <label style={styles.label}>Desde</label>
            <input
              type="date"
              style={styles.input}
              value={filtroDesdeCxC}
              onChange={(e) => setFiltroDesdeCxC(e.target.value)}
            />
          </div>

          <div>
            <label style={styles.label}>Hasta</label>
            <input
              type="date"
              style={styles.input}
              value={filtroHastaCxC}
              onChange={(e) => setFiltroHastaCxC(e.target.value)}
            />
          </div>

          <div>
            <label style={styles.label}>Origen</label>
            <select
              style={styles.select}
              value={filtroOrigenCxC}
              onChange={(e) => setFiltroOrigenCxC(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="venta">Ventas</option>
              <option value="atencion">Atención de cita</option>
            </select>
          </div>

          <button
            type="button"
            style={styles.btnAgregar}
            onClick={() => {
              setFiltroDesdeCxC("");
              setFiltroHastaCxC("");
              setFiltroOrigenCxC("todos");
            }}
          >
            Limpiar filtros
          </button>
        </div>

        {ventas.length === 0 && (
          <div style={styles.emptyBox}>No hay cuentas pendientes</div>
        )}

        <div style={styles.listaVentas}>
          {ventas.map((v) => (
            <div key={v.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <h3 style={styles.nombreCliente}>
                    {v.clientes?.nombre || "Sin nombre"}
                  </h3>
                  <div style={styles.estadoBadge}>
                    Estado: {v.estado}
                  </div>
                  <div style={styles.empresaTag}>
                    {v.empresa_nombre || obtenerNombreEmpresa(v.empresa_id)}
                  </div>
                  <div style={v.origen_cxc === "atencion" ? styles.origenAtencionTag : styles.origenVentaTag}>
                    {v.origen_cxc === "atencion" ? "Atención de cita" : "Venta"}
                  </div>
                </div>

                <button style={styles.btnCobrar} onClick={() => abrirCobro(v)}>
                  Registrar pago
                </button>
              </div>

              <div style={styles.cardResumen}>
                <div style={styles.resumenItem}>
                  <span style={styles.resumenLabel}>Desde</span>
                  <strong>{formatearFecha(v.fecha_local)}</strong>
                </div>

                <div style={styles.resumenItem}>
                  <span style={styles.resumenLabel}>Antigüedad</span>
                  <strong>{v.dias_mora} días</strong>
                </div>

                <div style={styles.resumenItem}>
                  <span style={styles.resumenLabel}>Rango</span>
                  <strong>{v.antiguedad}</strong>
                </div>

                <div style={styles.resumenItem}>
                  <span style={styles.resumenLabel}>Total</span>
                  <strong>${Number(v.total || 0).toFixed(2)}</strong>
                </div>

                <div style={styles.resumenItem}>
                  <span style={styles.resumenLabel}>Abonado</span>
                  <strong>${Number(v.abonado || 0).toFixed(2)}</strong>
                </div>

                <div style={styles.resumenItem}>
                  <span style={styles.resumenLabel}>Saldo pendiente</span>
                  <strong style={styles.saldoTexto}>
                    ${Number(v.saldo || 0).toFixed(2)}
                  </strong>
                </div>

                <div style={styles.resumenItem}>
                  <span style={styles.resumenLabel}>Ha abonado</span>
                  <strong>{v.ha_abonado}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>

        {ventaAbierta && (
          <div style={styles.modalOverlay}>
            <div style={styles.modal}>
              <div style={styles.modalHeader}>
                <div>
                  <h3 style={styles.modalTitle}>Registrar pago</h3>
                  <p style={styles.modalSubtitle}>
                    Cliente: {ventaAbierta.clientes?.nombre || "Sin nombre"}
                  </p>
                  <div style={styles.empresaTag}>
                    {ventaAbierta.empresa_nombre || obtenerNombreEmpresa(ventaAbierta.empresa_id)}
                  </div>
                  <div style={ventaAbierta.origen_cxc === "atencion" ? styles.origenAtencionTag : styles.origenVentaTag}>
                    {ventaAbierta.origen_cxc === "atencion" ? "Atención de cita" : "Venta"}
                  </div>
                </div>

                <button type="button" style={styles.btnCerrar} onClick={cerrarCobro}>
                  ✕
                </button>
              </div>

              <div style={styles.resumenBox}>
                <div style={styles.resumenCard}>
                  <span style={styles.resumenMiniLabel}>Total</span>
                  <strong>${Number(ventaAbierta.total || 0).toFixed(2)}</strong>
                </div>

                <div style={styles.resumenCard}>
                  <span style={styles.resumenMiniLabel}>Abonado</span>
                  <strong>${Number(ventaAbierta.abonado || 0).toFixed(2)}</strong>
                </div>

                <div style={styles.resumenCard}>
                  <span style={styles.resumenMiniLabel}>Saldo pendiente</span>
                  <strong style={styles.saldoTexto}>
                    ${Number(ventaAbierta.saldo || 0).toFixed(2)}
                  </strong>
                </div>
              </div>

              <div style={styles.detalleCobroBox}>
                <div style={styles.detalleCobroHeader}>
                  <h4 style={styles.sectionTitle}>Productos / servicios cobrados</h4>
                  <strong>${Number(ventaAbierta.total || 0).toFixed(2)}</strong>
                </div>

                {detalleVentaAbierta.length === 0 ? (
                  <div style={styles.detalleEmpty}>
                    No se encontró detalle de productos para esta cuenta.
                  </div>
                ) : (
                  <div style={styles.detalleLista}>
                    {detalleVentaAbierta.map((detalle) => (
                      <div key={detalle.id} style={styles.detalleItem}>
                        <div>
                          <strong>
                            {detalle.items?.nombre ||
                              detalle.nombre ||
                              detalle.descripcion ||
                              "Producto / servicio"}
                          </strong>
                          <span>
                            Cant. {Number(detalle.cantidad || 0)} × $
                            {Number(detalle.precio || detalle.precio_unitario || 0).toFixed(2)}
                          </span>
                        </div>

                        <strong>
                          $
                          {(
                            Number(detalle.cantidad || 0) *
                            Number(detalle.precio || detalle.precio_unitario || 0)
                          ).toFixed(2)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.clasificacionBox}>
                <div>
                  <h4 style={styles.sectionTitle}>Clasificación del paciente</h4>
                  <p style={styles.modalSubtitle}>
                    Podés clasificarlo antes de registrar el pago.
                  </p>
                </div>

                <select
                  style={styles.select}
                  value={clasificacionPacienteId}
                  onChange={(e) => setClasificacionPacienteId(e.target.value)}
                >
                  <option value="">Sin clasificación</option>
                  {clasificaciones.map((clasificacion) => (
                    <option key={clasificacion.id} value={clasificacion.id}>
                      {clasificacion.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.pagosHeader}>
                <h4 style={styles.sectionTitle}>Métodos de pago</h4>
                <button type="button" style={styles.btnAgregar} onClick={agregarFilaPago}>
                  + Agregar pago
                </button>
              </div>

              <div style={styles.pagosLista}>
                {pagos.map((pago, index) => (
                  <div key={index} style={styles.pagoCard}>
                    <div style={styles.pagoGrid}>
                      <div>
                        <label style={styles.label}>Método</label>
                        <select
                          style={styles.select}
                          value={pago.metodo_pago_id}
                          onChange={(e) =>
                            actualizarPago(index, "metodo_pago_id", e.target.value)
                          }
                        >
                          <option value="">Seleccionar método</option>
                          {metodosPago.map((metodo) => (
                            <option key={metodo.id} value={metodo.id}>
                              {metodo.nombre}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={styles.label}>Monto</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          style={styles.input}
                          value={pago.monto}
                          onChange={(e) =>
                            actualizarPago(index, "monto", e.target.value)
                          }
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Voucher / referencia</label>
                        <input
                          type="text"
                          placeholder="Ej: 458721 o TRX-9988"
                          style={styles.input}
                          value={pago.referencia}
                          onChange={(e) =>
                            actualizarPago(index, "referencia", e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div style={styles.pagoAcciones}>
                      <button
                        type="button"
                        style={styles.btnEliminar}
                        onClick={() => eliminarFilaPago(index)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={styles.totalesBox}>
                <div style={styles.totalRow}>
                  <span>Total a registrar</span>
                  <strong>${Number(totalPagoActual || 0).toFixed(2)}</strong>
                </div>

                <div style={styles.totalRow}>
                  <span>Saldo restante</span>
                  <strong style={styles.saldoTexto}>
                    ${Number(saldoRestante || 0).toFixed(2)}
                  </strong>
                </div>
              </div>

              <div style={styles.botones}>
                <button
                  type="button"
                  style={styles.btnCancelar}
                  onClick={cerrarCobro}
                  disabled={guardando}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  style={styles.btnGuardar}
                  onClick={registrarPago}
                  disabled={guardando}
                >
                  {guardando ? "Guardando..." : "Guardar pago"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    width: "100%",
    minHeight: "100%",
  },

  container: {
    width: "100%",
    display: "grid",
    gap: "18px",
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

  empresaSelect: {
    width: "100%",
    minWidth: 220,
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #d7dbe2",
    background: "#fff",
    color: "#1f2937",
    fontWeight: "700",
    outline: "none",
  },

  empresasReporteBox: {
    minWidth: "260px",
    maxWidth: "440px",
    background: "#f8f8fa",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    padding: "12px",
  },

  empresasReporteTitulo: {
    fontSize: "13px",
    color: "#574866",
    fontWeight: "800",
    marginBottom: "8px",
  },

  empresasReporteAcciones: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "8px",
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

  empresaListBox: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  empresaListItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "999px",
    padding: "6px 10px",
    color: "#334155",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },

  empresaTexto: {
    marginTop: "6px",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: "600",
  },

  headerEmpresaSelect: {
    flex: "1 1 360px",
    maxWidth: "520px",
    minWidth: "300px",
    alignSelf: "center",
    position: "relative",
    zIndex: 20,
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

  empresaTag: {
    display: "inline-flex",
    alignItems: "center",
    marginTop: "6px",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    fontWeight: "800",
    fontSize: "11px",
  },

  reportCard: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    position: "relative",
    zIndex: 20,
  },

  reportTitle: {
    margin: 0,
    fontSize: "24px",
    color: "#574866",
    fontWeight: "700",
  },

  reportText: {
    margin: "6px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  reportButtons: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },

  pdfBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  excelBtn: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  emptyBox: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "18px",
    padding: "24px",
    color: "#64748b",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
  },

  listaVentas: {
    display: "grid",
    gap: "14px",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "20px",
    padding: "16px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  },

  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },

  nombreCliente: {
    margin: 0,
    fontSize: "18px",
    color: "#1f2937",
  },

  estadoBadge: {
    marginTop: "6px",
    display: "inline-block",
    background: "#f4f0f7",
    color: "#574866",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid #d3c7dd",
  },

  btnCobrar: {
    padding: "10px 14px",
    borderRadius: "12px",
    border: "none",
    background: "#6b5a7a",
    color: "white",
    cursor: "pointer",
    fontWeight: "700",
  },

  cardResumen: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "10px",
  },

  resumenItem: {
    background: "#f8f8fa",
    border: "1px solid #d7dbe2",
    borderRadius: "14px",
    padding: "12px",
    display: "grid",
    gap: "4px",
  },

  resumenLabel: {
    fontSize: "12px",
    color: "#64748b",
  },

  saldoTexto: {
    color: "#b45309",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    zIndex: 999,
  },

  modal: {
    width: "100%",
    maxWidth: "860px",
    background: "white",
    borderRadius: "22px",
    padding: "22px",
    boxShadow: "0 20px 60px rgba(15, 23, 42, 0.18)",
    maxHeight: "90vh",
    overflowY: "auto",
    border: "1px solid #d7dbe2",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "18px",
  },

  modalTitle: {
    margin: 0,
    fontSize: "24px",
    color: "#574866",
  },

  modalSubtitle: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  btnCerrar: {
    border: "none",
    background: "#ececef",
    color: "#334155",
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "18px",
  },

  resumenBox: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "12px",
    marginBottom: "20px",
  },

  resumenCard: {
    background: "#f8f8fa",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    padding: "14px",
    display: "grid",
    gap: "4px",
  },

  resumenMiniLabel: {
    fontSize: "12px",
    color: "#64748b",
  },

  pagosHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "12px",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "17px",
    color: "#1f2937",
  },

  btnAgregar: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  pagosLista: {
    display: "grid",
    gap: "12px",
  },

  pagoCard: {
    border: "1px solid #d7dbe2",
    background: "#fcfdff",
    borderRadius: "16px",
    padding: "14px",
  },

  pagoGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 2fr",
    gap: "12px",
  },

  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "12px",
    color: "#64748b",
    fontWeight: "600",
  },

  select: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    background: "white",
    boxSizing: "border-box",
  },

  input: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    background: "white",
    boxSizing: "border-box",
  },

  pagoAcciones: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "10px",
  },

  btnEliminar: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  totalesBox: {
    marginTop: "18px",
    background: "#f8f8fa",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    padding: "14px",
    display: "grid",
    gap: "8px",
  },

  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    color: "#1f2937",
  },

  botones: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "18px",
    flexWrap: "wrap",
  },

  btnCancelar: {
    padding: "11px 16px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    background: "white",
    cursor: "pointer",
    color: "#334155",
    fontWeight: "700",
  },

  btnGuardar: {
    padding: "11px 16px",
    borderRadius: "12px",
    border: "none",
    background: "#6b5a7a",
    color: "white",
    cursor: "pointer",
    fontWeight: "700",
  },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "12px",
  },

  kpiCard: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "18px",
    padding: "16px",
    display: "grid",
    gap: "6px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  },

  filtrosCard: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "20px",
    padding: "14px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    alignItems: "end",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  },

  origenAtencionTag: {
    display: "inline-flex",
    alignItems: "center",
    marginTop: "6px",
    marginLeft: "6px",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    fontWeight: "800",
    fontSize: "11px",
  },

  origenVentaTag: {
    display: "inline-flex",
    alignItems: "center",
    marginTop: "6px",
    marginLeft: "6px",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    fontWeight: "800",
    fontSize: "11px",
  },

  detalleCobroBox: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "14px",
    marginBottom: "14px",
    display: "grid",
    gap: "10px",
  },

  detalleCobroHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },

  detalleLista: {
    display: "grid",
    gap: "8px",
  },

  detalleItem: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "13px",
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
  },

  detalleEmpty: {
    background: "#ffffff",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
    borderRadius: "13px",
    padding: "12px",
    textAlign: "center",
    fontWeight: "700",
  },

  clasificacionBox: {
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    padding: "14px",
    marginBottom: "14px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 320px)",
    gap: "12px",
    alignItems: "center",
  },

};

export default Deudas;