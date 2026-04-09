import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function obtenerFechaLocalSV() {
  const fechaSV = new Date().toLocaleString("en-CA", {
    timeZone: "America/El_Salvador",
  });
  return fechaSV.slice(0, 10);
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

function formatearFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatearMonto(valor) {
  return Number(valor || 0).toFixed(2);
}

export default function CajaDiaria() {
  const empresa = JSON.parse(localStorage.getItem("empresa") || "null");
  const hoy = obtenerFechaLocalSV();

  const [fechaLocal, setFechaLocal] = useState(hoy);
  const [observacion, setObservacion] = useState("");
  const [metodos, setMetodos] = useState([]);
  const [filas, setFilas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState("");
  const [loading, setLoading] = useState(false);

  const [filtroDesde, setFiltroDesde] = useState(hoy);
  const [filtroHasta, setFiltroHasta] = useState(hoy);

  const [cierreRealizado, setCierreRealizado] = useState(false);
  const [remesaEfectivo, setRemesaEfectivo] = useState(false);
  const [cuentaDestinoEfectivo, setCuentaDestinoEfectivo] = useState("");
  const [numeroRemesaEfectivo, setNumeroRemesaEfectivo] = useState("");
  const [comentarioCierre, setComentarioCierre] = useState("");

  const [responsableCaja, setResponsableCaja] = useState("");
  const [elaboradoPor, setElaboradoPor] = useState("");
  const [revisadoPor, setRevisadoPor] = useState("");

  useEffect(() => {
    if (!empresa?.id) {
      setMetodos([]);
      setClientes([]);
      setFilas([]);
      setObservacion("");
      limpiarFormularioCierre();
      return;
    }

    cargarMetodos();
    cargarClientes();
  }, [empresa?.id]);

  useEffect(() => {
    if (empresa?.id && metodos.length > 0 && fechaLocal) {
      cargarCajaDelDia(fechaLocal);
    }
  }, [empresa?.id, metodos, fechaLocal]);

  const crearFilaVacia = (metodosActuales = metodos, nombrePaciente = "") => {
    const pagos = {};
    const referencias = {};

    metodosActuales.forEach((m) => {
      pagos[m.id] = "";
      referencias[m.id] = "";
    });

    return {
      paciente: nombrePaciente,
      pagos,
      referencias,
    };
  };

  const limpiarFormularioCierre = () => {
    setCierreRealizado(false);
    setRemesaEfectivo(false);
    setCuentaDestinoEfectivo("");
    setNumeroRemesaEfectivo("");
    setComentarioCierre("");
    setResponsableCaja("");
    setElaboradoPor("");
    setRevisadoPor("");
  };

  const cargarMetodos = async () => {
    if (!empresa?.id) return;

    const { data, error } = await supabase
      .from("metodos_pago")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("activo", true)
      .order("orden", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al cargar métodos de pago");
      return;
    }

    setMetodos(data || []);
  };

  const cargarClientes = async () => {
    if (!empresa?.id) return;

    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre")
      .eq("empresa_id", empresa.id)
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setClientes(data || []);
  };

  const cargarCajaDelDia = async (fechaBuscada) => {
    if (!empresa?.id) return;

    const { data: caja, error: errorCaja } = await supabase
      .from("cajas_diarias")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("fecha_local", fechaBuscada)
      .maybeSingle();

    if (errorCaja) {
      console.error(errorCaja);
      alert("Error al cargar la caja del día");
      return;
    }

    if (!caja) {
      setObservacion("");
      setFilas([]);
      limpiarFormularioCierre();
      return;
    }

    setObservacion(caja.observacion || "");
    setCierreRealizado(Boolean(caja.cierre_realizado));
    setRemesaEfectivo(Boolean(caja.remesa_efectivo));
    setCuentaDestinoEfectivo(caja.cuenta_destino_efectivo || "");
    setNumeroRemesaEfectivo(caja.numero_remesa_efectivo || "");
    setComentarioCierre(caja.comentario_cierre || "");
    setResponsableCaja(caja.responsable_caja || "");
    setElaboradoPor(caja.elaborado_por || "");
    setRevisadoPor(caja.revisado_por || "");

    const { data: detalle, error: errorDetalle } = await supabase
      .from("caja_diaria_detalle")
      .select("id, paciente, metodo_pago_id, monto, referencia")
      .eq("caja_diaria_id", caja.id);

    if (errorDetalle) {
      console.error(errorDetalle);
      alert("Error al cargar el detalle");
      return;
    }

    const mapa = {};

    (detalle || []).forEach((item) => {
      const nombrePaciente = item.paciente?.trim() || "Sin nombre";

      if (!mapa[nombrePaciente]) {
        mapa[nombrePaciente] = crearFilaVacia(metodos, nombrePaciente);
      }

      const montoActual = Number(
        mapa[nombrePaciente].pagos[item.metodo_pago_id] || 0
      );

      mapa[nombrePaciente].pagos[item.metodo_pago_id] =
        montoActual + Number(item.monto || 0);

      const refActual = mapa[nombrePaciente].referencias[item.metodo_pago_id] || "";
      const nuevaRef = item.referencia || "";

      if (nuevaRef) {
        const refs = refActual
          ? refActual.split(" | ").map((x) => x.trim()).filter(Boolean)
          : [];

        if (!refs.includes(nuevaRef)) {
          refs.push(nuevaRef);
        }

        mapa[nombrePaciente].referencias[item.metodo_pago_id] = refs.join(" | ");
      }
    });

    setFilas(Object.values(mapa));
  };

  const agregarFila = () => {
    setFilas((prev) => [...prev, crearFilaVacia()]);
  };

  const agregarClienteSeleccionado = () => {
    if (!clienteSeleccionado) {
      return alert("Seleccioná un cliente");
    }

    const cliente = clientes.find(
      (c) => String(c.id) === String(clienteSeleccionado)
    );

    if (!cliente) return;

    const yaExiste = filas.some(
      (fila) =>
        fila.paciente.trim().toLowerCase() ===
        cliente.nombre.trim().toLowerCase()
    );

    if (yaExiste) {
      return alert("Ese cliente ya está agregado");
    }

    setFilas((prev) => [...prev, crearFilaVacia(metodos, cliente.nombre)]);
    setClienteSeleccionado("");
  };

  const eliminarFila = (index) => {
    const nuevas = [...filas];
    nuevas.splice(index, 1);
    setFilas(nuevas);
  };

  const actualizarPaciente = (index, valor) => {
    const nuevas = [...filas];
    nuevas[index].paciente = valor;
    setFilas(nuevas);
  };

  const actualizarMonto = (filaIndex, metodoId, valor) => {
    const nuevas = [...filas];
    nuevas[filaIndex].pagos[metodoId] = valor;
    setFilas(nuevas);
  };

  const actualizarReferencia = (filaIndex, metodoId, valor) => {
    const nuevas = [...filas];
    nuevas[filaIndex].referencias[metodoId] = valor;
    setFilas(nuevas);
  };

  const guardarCaja = async () => {
    if (!empresa?.id) {
      return alert("No hay empresa seleccionada");
    }

    const filasValidas = filas.filter((fila) => fila.paciente.trim() !== "");

    setLoading(true);

    let cajaId = null;

    const { data: cajaExistente, error: errorBuscarCaja } = await supabase
      .from("cajas_diarias")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("fecha_local", fechaLocal)
      .maybeSingle();

    if (errorBuscarCaja) {
      setLoading(false);
      console.error(errorBuscarCaja);
      alert("Error al buscar la caja");
      return;
    }

    const payloadCaja = {
      empresa_id: empresa.id,
      observacion,
      cierre_realizado: cierreRealizado,
      remesa_efectivo: remesaEfectivo,
      cuenta_destino_efectivo: cuentaDestinoEfectivo || null,
      numero_remesa_efectivo: numeroRemesaEfectivo || null,
      comentario_cierre: comentarioCierre || null,
      fecha_cierre: cierreRealizado ? obtenerFechaHoraSVISO() : null,
      responsable_caja: responsableCaja || null,
      elaborado_por: elaboradoPor || null,
      revisado_por: revisadoPor || null,
    };

    if (cajaExistente) {
      cajaId = cajaExistente.id;

      const { error: errorActualizarCaja } = await supabase
        .from("cajas_diarias")
        .update(payloadCaja)
        .eq("id", cajaId);

      if (errorActualizarCaja) {
        setLoading(false);
        console.error(errorActualizarCaja);
        alert("Error al actualizar la caja");
        return;
      }

      const { error: errorEliminarDetalle } = await supabase
        .from("caja_diaria_detalle")
        .delete()
        .eq("caja_diaria_id", cajaId);

      if (errorEliminarDetalle) {
        setLoading(false);
        console.error(errorEliminarDetalle);
        alert("Error al reemplazar el detalle");
        return;
      }
    } else {
      const { data: nuevaCaja, error: errorCrearCaja } = await supabase
        .from("cajas_diarias")
        .insert([
          {
            fecha: obtenerFechaHoraSVISO(),
            fecha_local: fechaLocal,
            ...payloadCaja,
          },
        ])
        .select()
        .single();

      if (errorCrearCaja) {
        setLoading(false);
        console.error(errorCrearCaja);
        alert("Error al crear la caja");
        return;
      }

      cajaId = nuevaCaja.id;
    }

    const detalleParaGuardar = [];

    filasValidas.forEach((fila) => {
      metodos.forEach((metodo) => {
        const valor = fila.pagos[metodo.id];
        const referencia = fila.referencias[metodo.id];

        if (
          valor !== "" &&
          valor !== null &&
          valor !== undefined &&
          Number(valor) !== 0
        ) {
          detalleParaGuardar.push({
            caja_diaria_id: cajaId,
            paciente: fila.paciente.trim(),
            metodo_pago_id: metodo.id,
            monto: Number(valor),
            referencia: referencia?.trim() || null,
          });
        }
      });
    });

    if (detalleParaGuardar.length > 0) {
      const { error: errorInsertarDetalle } = await supabase
        .from("caja_diaria_detalle")
        .insert(detalleParaGuardar);

      if (errorInsertarDetalle) {
        setLoading(false);
        console.error(errorInsertarDetalle);
        alert("Error al guardar el detalle");
        return;
      }
    }

    setLoading(false);
    alert("Caja diaria guardada correctamente");
    cargarCajaDelDia(fechaLocal);
  };

  const obtenerDatosReporte = async () => {
    if (!empresa?.id) {
      alert("No hay empresa seleccionada");
      return null;
    }

    if (!filtroDesde || !filtroHasta) {
      alert("Seleccioná desde y hasta");
      return null;
    }

    if (filtroDesde > filtroHasta) {
      alert("La fecha desde no puede ser mayor que la fecha hasta");
      return null;
    }

    const { data, error } = await supabase
      .from("cajas_diarias")
      .select(`
        id,
        fecha_local,
        observacion,
        cierre_realizado,
        remesa_efectivo,
        cuenta_destino_efectivo,
        numero_remesa_efectivo,
        comentario_cierre,
        responsable_caja,
        elaborado_por,
        revisado_por,
        caja_diaria_detalle (
          paciente,
          monto,
          referencia,
          metodo_pago_id,
          metodos_pago (
            nombre
          )
        )
      `)
      .eq("empresa_id", empresa.id)
      .gte("fecha_local", filtroDesde)
      .lte("fecha_local", filtroHasta)
      .order("fecha_local", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al obtener datos del reporte");
      return null;
    }

    const detalleAgrupado = [];
    const resumen = {};
    const cierres = [];

    (data || []).forEach((caja) => {
      const mapaPacientes = {};

      (caja.caja_diaria_detalle || []).forEach((d) => {
        const paciente = d.paciente || "Sin nombre";
        const metodoNombre = d.metodos_pago?.nombre || "Sin método";
        const monto = Number(d.monto || 0);
        const referencia = d.referencia || "";

        if (!mapaPacientes[paciente]) {
          mapaPacientes[paciente] = {
            fecha: caja.fecha_local,
            paciente,
            observacion: caja.observacion || "",
            metodos: {},
            referencias: {},
          };

          metodos.forEach((m) => {
            mapaPacientes[paciente].metodos[m.nombre] = 0;
            mapaPacientes[paciente].referencias[m.nombre] = "";
          });
        }

        mapaPacientes[paciente].metodos[metodoNombre] =
          (mapaPacientes[paciente].metodos[metodoNombre] || 0) + monto;

        if (referencia) {
          const actual = mapaPacientes[paciente].referencias[metodoNombre] || "";
          const refs = actual
            ? actual.split(" | ").map((x) => x.trim()).filter(Boolean)
            : [];

          if (!refs.includes(referencia)) {
            refs.push(referencia);
          }

          mapaPacientes[paciente].referencias[metodoNombre] = refs.join(" | ");
        }

        resumen[metodoNombre] = (resumen[metodoNombre] || 0) + monto;
      });

      const totalCaja = (caja.caja_diaria_detalle || []).reduce(
        (acc, d) => acc + Number(d.monto || 0),
        0
      );

      cierres.push({
        fecha: caja.fecha_local,
        responsableCaja: caja.responsable_caja || "",
        elaboradoPor: caja.elaborado_por || "",
        revisadoPor: caja.revisado_por || "",
        remesaEfectivo: Boolean(caja.remesa_efectivo),
        cuentaDestinoEfectivo: caja.cuenta_destino_efectivo || "",
        numeroRemesaEfectivo: caja.numero_remesa_efectivo || "",
        comentarioCierre: caja.comentario_cierre || "",
        observacion: caja.observacion || "",
        totalCaja,
      });

      detalleAgrupado.push(...Object.values(mapaPacientes));
    });

    const resumenArray = metodos.map((m) => ({
      metodo: m.nombre,
      total: Number(resumen[m.nombre] || 0),
    }));

    return {
      detalle: detalleAgrupado,
      resumen: resumenArray,
      cierres,
      totalGeneralResumen: resumenArray.reduce(
        (acc, item) => acc + Number(item.total || 0),
        0
      ),
    };
  };

  const exportarDetalleExcel = async () => {
    const datos = await obtenerDatosReporte();
    if (!datos || datos.detalle.length === 0) {
      return alert("No hay datos para exportar");
    }

    const rows = [
      { Fecha: "", Paciente: empresa?.nombre || "Empresa activa" },
      {
        Fecha: "",
        Paciente: `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(
          filtroHasta
        )}`,
      },
      {},
    ];

    datos.detalle.forEach((item) => {
      const fila = {
        Fecha: formatearFecha(item.fecha),
        Paciente: item.paciente,
      };

      metodos.forEach((m) => {
        fila[m.nombre] = formatearMonto(item.metodos[m.nombre] || 0);
      });

      fila["Referencias"] = metodos
        .map((m) =>
          item.referencias[m.nombre]
            ? `${m.nombre}: ${item.referencias[m.nombre]}`
            : ""
        )
        .filter(Boolean)
        .join(" | ");

      fila["Total Paciente"] = formatearMonto(
        metodos.reduce((acc, m) => acc + Number(item.metodos[m.nombre] || 0), 0)
      );

      fila["Observación"] = item.observacion || "";

      rows.push(fila);
    });

    const filaTotales = {
      Fecha: "",
      Paciente: "TOTALES",
    };

    metodos.forEach((m) => {
      filaTotales[m.nombre] = formatearMonto(
        datos.resumen.find((r) => r.metodo === m.nombre)?.total || 0
      );
    });

    filaTotales["Referencias"] = "";
    filaTotales["Total Paciente"] = formatearMonto(datos.totalGeneralResumen);
    filaTotales["Observación"] = "";

    rows.push(filaTotales);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Detalle Caja");

    XLSX.writeFile(
      wb,
      `Caja_Detalle_${empresa?.nombre || "Empresa"}_${filtroDesde}_a_${filtroHasta}.xlsx`
    );
  };

  const exportarResumenExcel = async () => {
    const datos = await obtenerDatosReporte();
    if (!datos || datos.resumen.length === 0) {
      return alert("No hay datos para exportar");
    }

    const rows = [
      { "Método de Pago": empresa?.nombre || "Empresa activa", Total: "" },
      {
        "Método de Pago": `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(
          filtroHasta
        )}`,
        Total: "",
      },
      { "Método de Pago": "", Total: "" },
      ...datos.resumen.map((item) => ({
        "Método de Pago": item.metodo,
        Total: formatearMonto(item.total),
      })),
      {
        "Método de Pago": "TOTAL GENERAL",
        Total: formatearMonto(datos.totalGeneralResumen),
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Resumen Caja");

    XLSX.writeFile(
      wb,
      `Caja_Resumen_${empresa?.nombre || "Empresa"}_${filtroDesde}_a_${filtroHasta}.xlsx`
    );
  };

  const exportarDetallePDF = async () => {
    const datos = await obtenerDatosReporte();
    if (!datos || datos.detalle.length === 0) {
      return alert("No hay datos para exportar");
    }

    const doc = new jsPDF("landscape");

    doc.setFontSize(16);
    doc.text("Informe Detallado de Caja Diaria", 14, 14);

    doc.setFontSize(11);
    doc.text(`Empresa: ${empresa?.nombre || "Empresa activa"}`, 14, 21);
    doc.text(
      `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(filtroHasta)}`,
      14,
      27
    );

    const head = [[
      "Fecha",
      "Paciente",
      ...metodos.map((m) => m.nombre),
      "Referencias",
      "Total Paciente",
      "Observación",
    ]];

    const body = datos.detalle.map((item) => {
      const totalPaciente = metodos.reduce(
        (acc, m) => acc + Number(item.metodos[m.nombre] || 0),
        0
      );

      const referenciasTexto = metodos
        .map((m) =>
          item.referencias[m.nombre]
            ? `${m.nombre}: ${item.referencias[m.nombre]}`
            : ""
        )
        .filter(Boolean)
        .join(" | ");

      return [
        formatearFecha(item.fecha),
        item.paciente,
        ...metodos.map((m) => `$${formatearMonto(item.metodos[m.nombre] || 0)}`),
        referenciasTexto,
        `$${formatearMonto(totalPaciente)}`,
        item.observacion || "",
      ];
    });

    const foot = [[
      "",
      "TOTALES",
      ...metodos.map((m) => {
        const total = datos.resumen.find((r) => r.metodo === m.nombre)?.total || 0;
        return `$${formatearMonto(total)}`;
      }),
      "",
      `$${formatearMonto(datos.totalGeneralResumen)}`,
      "",
    ]];

    autoTable(doc, {
      startY: 33,
      head,
      body,
      foot,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [39, 67, 98] },
      footStyles: { fillColor: [232, 240, 248], textColor: 20 },
    });

    doc.save(
      `Caja_Detalle_${empresa?.nombre || "Empresa"}_${filtroDesde}_a_${filtroHasta}.pdf`
    );
  };

  const exportarResumenPDF = async () => {
    const datos = await obtenerDatosReporte();
    if (!datos || datos.resumen.length === 0) {
      return alert("No hay datos para exportar");
    }

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Informe Resumen de Caja Diaria", 14, 15);

    doc.setFontSize(11);
    doc.text(`Empresa: ${empresa?.nombre || "Empresa activa"}`, 14, 22);
    doc.text(
      `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(filtroHasta)}`,
      14,
      28
    );

    autoTable(doc, {
      startY: 34,
      head: [["Método de Pago", "Total"]],
      body: datos.resumen.map((item) => [
        item.metodo,
        `$${formatearMonto(item.total)}`,
      ]),
      foot: [["TOTAL GENERAL", `$${formatearMonto(datos.totalGeneralResumen)}`]],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [39, 67, 98] },
      footStyles: { fillColor: [232, 240, 248], textColor: 20 },
    });

    doc.save(
      `Caja_Resumen_${empresa?.nombre || "Empresa"}_${filtroDesde}_a_${filtroHasta}.pdf`
    );
  };

  const exportarInformeProfesionalPDF = async () => {
    const datos = await obtenerDatosReporte();
    if (!datos || datos.resumen.length === 0) {
      return alert("No hay datos para exportar");
    }

    const doc = new jsPDF("p", "mm", "a4");
    const cajaActual =
      datos.cierres.find((c) => c.fecha === fechaLocal) || {
        fecha: fechaLocal,
        responsableCaja,
        elaboradoPor,
        revisadoPor,
        remesaEfectivo,
        cuentaDestinoEfectivo,
        numeroRemesaEfectivo,
        comentarioCierre,
        observacion,
        totalCaja: totalGeneral,
      };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("INFORME DE CIERRE DE CAJA DIARIA", 105, 15, { align: "center" });

    doc.setFontSize(12);
    doc.text(empresa?.nombre || "EMPRESA ACTIVA", 105, 22, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Fecha de caja: ${formatearFecha(cajaActual.fecha)}`, 14, 32);
    doc.text(`Responsable de caja: ${cajaActual.responsableCaja || "-"}`, 14, 38);

    autoTable(doc, {
      startY: 45,
      head: [["Resumen por método de pago", "Monto"]],
      body: datos.resumen.map((item) => [
        item.metodo,
        `$${formatearMonto(item.total)}`,
      ]),
      foot: [["TOTAL GENERAL DEL EFECTIVO", `$${formatearMonto(datos.totalGeneralResumen)}`]],
      theme: "grid",
      styles: { fontSize: 10 },
      headStyles: { fillColor: [28, 63, 95] },
      footStyles: { fillColor: [232, 240, 248], textColor: 20 },
    });

    const yInfo = doc.lastAutoTable.finalY + 8;

    const remesaTexto = cajaActual.remesaEfectivo ? "Sí" : "No";
    const remesaDetalle = cajaActual.remesaEfectivo
      ? `Cuenta destino: ${cajaActual.cuentaDestinoEfectivo || "-"} | No. remesa: ${cajaActual.numeroRemesaEfectivo || "-"}`
      : "No aplica";

    autoTable(doc, {
      startY: yInfo,
      body: [
        ["Habrá remesa a depositar", remesaTexto],
        ["Detalle de remesa", remesaDetalle],
        ["Observación del día", cajaActual.observacion || "-"],
        ["Comentario de cierre", cajaActual.comentarioCierre || "-"],
      ],
      theme: "grid",
      styles: { fontSize: 9 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 60 },
        1: { cellWidth: 120 },
      },
    });

    let yFirmas = doc.lastAutoTable.finalY + 28;
    if (yFirmas > 250) {
      doc.addPage();
      yFirmas = 40;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    doc.line(25, yFirmas, 85, yFirmas);
    doc.line(125, yFirmas, 185, yFirmas);

    doc.text(cajaActual.elaboradoPor || "", 55, yFirmas + 6, { align: "center" });
    doc.text("Elaboró", 55, yFirmas + 12, { align: "center" });

    doc.text(cajaActual.revisadoPor || "", 155, yFirmas + 6, { align: "center" });
    doc.text("Revisó", 155, yFirmas + 12, { align: "center" });

    doc.save(
      `Caja_Profesional_${empresa?.nombre || "Empresa"}_${cajaActual.fecha}.pdf`
    );
  };

  const totalesPorMetodo = useMemo(() => {
    const totales = {};

    metodos.forEach((m) => {
      totales[m.id] = 0;
    });

    filas.forEach((fila) => {
      metodos.forEach((m) => {
        const valor = Number(fila.pagos[m.id] || 0);
        totales[m.id] += valor;
      });
    });

    return totales;
  }, [filas, metodos]);

  const totalGeneral = useMemo(() => {
    return Object.values(totalesPorMetodo).reduce(
      (acum, valor) => acum + Number(valor || 0),
      0
    );
  }, [totalesPorMetodo]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Caja Diaria</h1>
            <p style={styles.subtitle}>Registro del día, cierre e informes</p>
            <p style={styles.companyPill}>
              Empresa activa: <strong>{empresa?.nombre || "No seleccionada"}</strong>
            </p>
          </div>

          <div style={styles.totalBadge}>
            <span style={styles.totalBadgeLabel}>Total del día</span>
            <strong style={styles.totalBadgeValue}>${totalGeneral.toFixed(2)}</strong>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.topGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Fecha</label>
              <input
                type="date"
                value={fechaLocal}
                onChange={(e) => setFechaLocal(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Observación</label>
              <input
                type="text"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Opcional"
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.actionGrid}>
            <button type="button" onClick={agregarFila} style={styles.primarySoftBtn}>
              + Manual
            </button>

            <select
              value={clienteSeleccionado}
              onChange={(e) => setClienteSeleccionado(e.target.value)}
              style={styles.input}
            >
              <option value="">Seleccionar cliente</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={agregarClienteSeleccionado}
              style={styles.secondarySoftBtn}
            >
              + Cliente
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={{ ...styles.th, minWidth: 190 }}>Paciente</th>
                  {metodos.map((metodo) => (
                    <th key={metodo.id} style={{ ...styles.th, minWidth: 190 }}>
                      {metodo.nombre}
                    </th>
                  ))}
                  <th style={{ ...styles.th, minWidth: 90 }}>Acción</th>
                </tr>
              </thead>

              <tbody>
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={metodos.length + 2} style={styles.emptyTd}>
                      No hay registros para esta fecha
                    </td>
                  </tr>
                )}

                {filas.map((fila, index) => (
                  <tr key={index}>
                    <td style={styles.tdTop}>
                      <input
                        type="text"
                        value={fila.paciente}
                        onChange={(e) => actualizarPaciente(index, e.target.value)}
                        placeholder="Nombre del paciente"
                        style={styles.input}
                      />
                    </td>

                    {metodos.map((metodo) => (
                      <td key={metodo.id} style={styles.tdTop}>
                        <div style={styles.cellStack}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={fila.pagos[metodo.id]}
                            onChange={(e) =>
                              actualizarMonto(index, metodo.id, e.target.value)
                            }
                            style={{ ...styles.input, textAlign: "right" }}
                            placeholder="0.00"
                          />
                          <input
                            type="text"
                            value={fila.referencias[metodo.id]}
                            onChange={(e) =>
                              actualizarReferencia(index, metodo.id, e.target.value)
                            }
                            style={styles.subInput}
                            placeholder="Voucher / referencia"
                          />
                        </div>
                      </td>
                    ))}

                    <td style={styles.tdTop}>
                      <button
                        type="button"
                        onClick={() => eliminarFila(index)}
                        style={styles.deleteBtn}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr style={styles.tfootRow}>
                  <td style={styles.totalTdLabel}>Totales</td>
                  {metodos.map((metodo) => (
                    <td key={metodo.id} style={styles.totalTd}>
                      {Number(totalesPorMetodo[metodo.id] || 0).toFixed(2)}
                    </td>
                  ))}
                  <td style={styles.totalTd}>—</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={guardarCaja}
              disabled={loading}
              style={styles.saveBtn}
            >
              {loading ? "Guardando..." : "Guardar caja"}
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Cierre de caja</h2>

          <div style={styles.checkboxRow}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={cierreRealizado}
                onChange={(e) => setCierreRealizado(e.target.checked)}
              />
              Cierre realizado
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={remesaEfectivo}
                onChange={(e) => setRemesaEfectivo(e.target.checked)}
              />
              Habrá remesa de efectivo
            </label>
          </div>

          <div style={styles.topGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Cuenta destino del efectivo</label>
              <input
                type="text"
                value={cuentaDestinoEfectivo}
                onChange={(e) => setCuentaDestinoEfectivo(e.target.value)}
                placeholder="Cuenta bancaria"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Número de remesa</label>
              <input
                type="text"
                value={numeroRemesaEfectivo}
                onChange={(e) => setNumeroRemesaEfectivo(e.target.value)}
                placeholder="Número de remesa"
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.topGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Responsable de caja</label>
              <input
                type="text"
                value={responsableCaja}
                onChange={(e) => setResponsableCaja(e.target.value)}
                placeholder="Nombre del responsable de caja"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Elaboró</label>
              <input
                type="text"
                value={elaboradoPor}
                onChange={(e) => setElaboradoPor(e.target.value)}
                placeholder="Nombre de quien elabora"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Revisó</label>
              <input
                type="text"
                value={revisadoPor}
                onChange={(e) => setRevisadoPor(e.target.value)}
                placeholder="Nombre de quien revisa"
                style={styles.input}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={styles.label}>Comentario de cierre</label>
            <textarea
              value={comentarioCierre}
              onChange={(e) => setComentarioCierre(e.target.value)}
              placeholder="Comentario de cierre"
              rows={3}
              style={styles.textarea}
            />
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Informes</h2>

          <div style={styles.reportTopGrid}>
            <input
              type="date"
              value={filtroDesde}
              onChange={(e) => setFiltroDesde(e.target.value)}
              style={styles.input}
            />

            <input
              type="date"
              value={filtroHasta}
              onChange={(e) => setFiltroHasta(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.reportButtons}>
            <button type="button" onClick={exportarDetallePDF} style={styles.reportBtnPdf}>
              PDF Detalle
            </button>

            <button type="button" onClick={exportarDetalleExcel} style={styles.reportBtnExcel}>
              Excel Detalle
            </button>

            <button type="button" onClick={exportarResumenPDF} style={styles.reportBtnPdf2}>
              PDF Resumen
            </button>

            <button type="button" onClick={exportarResumenExcel} style={styles.reportBtnExcel2}>
              Excel Resumen
            </button>

            <button
              type="button"
              onClick={exportarInformeProfesionalPDF}
              style={styles.reportBtnPro}
            >
              PDF Profesional
            </button>
          </div>

          <p style={styles.infoText}>
            El detalle incluye referencias de voucher o transferencia.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    background: "#f4f7fb",
    minHeight: "100vh",
    padding: "18px",
  },
  container: {
    maxWidth: "1220px",
    margin: "0 auto",
    display: "grid",
    gap: "18px",
  },
  headerCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "20px 22px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.04)",
  },
  title: {
    margin: 0,
    color: "#10243e",
    fontSize: "36px",
    fontWeight: "700",
  },
  subtitle: {
    margin: "6px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },
  companyPill: {
    margin: "10px 0 0 0",
    color: "#1e3a5f",
    fontSize: "14px",
    background: "#eef6ff",
    border: "1px solid #d7e8fb",
    padding: "8px 12px",
    borderRadius: "12px",
    display: "inline-block",
  },
  totalBadge: {
    background: "#eef6ff",
    border: "1px solid #d7e8fb",
    borderRadius: "18px",
    padding: "14px 18px",
    minWidth: "180px",
  },
  totalBadgeLabel: {
    display: "block",
    fontSize: "12px",
    color: "#5b708b",
    marginBottom: "4px",
  },
  totalBadgeValue: {
    fontSize: "26px",
    color: "#16324f",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.04)",
  },
  topGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "14px",
    marginTop: "14px",
  },
  actionGrid: {
    marginTop: "14px",
    display: "grid",
    gridTemplateColumns: "170px minmax(220px, 1fr) 170px",
    gap: "12px",
    alignItems: "end",
  },
  formGroup: {
    display: "grid",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    color: "#4b5f78",
    fontWeight: "600",
  },
  input: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "14px",
  },
  subInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #e1e8f0",
    background: "#fbfdff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "12px",
    color: "#42556d",
  },
  textarea: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "14px",
    resize: "vertical",
  },
  primarySoftBtn: {
    background: "#dff4ea",
    color: "#0f7a4d",
    border: "1px solid #bce7d3",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
  secondarySoftBtn: {
    background: "#e6f1ff",
    color: "#1f66c2",
    border: "1px solid #cbdffb",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "1100px",
  },
  theadRow: {
    background: "#f3f7fb",
  },
  th: {
    padding: "14px 12px",
    textAlign: "center",
    color: "#20364f",
    fontWeight: "700",
    fontSize: "14px",
    borderBottom: "1px solid #e2e8f0",
  },
  tdTop: {
    padding: "12px",
    borderBottom: "1px solid #edf2f7",
    verticalAlign: "top",
  },
  cellStack: {
    display: "grid",
    gap: "8px",
  },
  emptyTd: {
    textAlign: "center",
    padding: "24px",
    color: "#64748b",
  },
  tfootRow: {
    background: "#fafcff",
  },
  totalTdLabel: {
    padding: "14px 12px",
    fontWeight: "700",
    color: "#20364f",
    borderTop: "1px solid #e2e8f0",
  },
  totalTd: {
    padding: "14px 12px",
    fontWeight: "700",
    color: "#20364f",
    textAlign: "right",
    borderTop: "1px solid #e2e8f0",
  },
  deleteBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "600",
  },
  saveBtn: {
    background: "#255dcf",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "12px 18px",
    cursor: "pointer",
    fontWeight: "700",
  },
  sectionTitle: {
    margin: "0 0 14px 0",
    color: "#10243e",
    fontSize: "28px",
    fontWeight: "700",
  },
  checkboxRow: {
    display: "flex",
    gap: "20px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#334155",
    fontWeight: "600",
  },
  reportTopGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    marginBottom: "14px",
  },
  reportButtons: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px",
    marginBottom: "10px",
  },
  reportBtnPdf: {
    background: "#ffe2e2",
    color: "#b42318",
    border: "1px solid #ffc7c7",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
  reportBtnExcel: {
    background: "#e3f8eb",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
  reportBtnPdf2: {
    background: "#ede9fe",
    color: "#5b21b6",
    border: "1px solid #ddd6fe",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
  reportBtnExcel2: {
    background: "#e0f2fe",
    color: "#0369a1",
    border: "1px solid #bae6fd",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
  reportBtnPro: {
    background: "#fef3c7",
    color: "#92400e",
    border: "1px solid #fde68a",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },
  infoText: {
    margin: 0,
    color: "#64748b",
    fontSize: "13px",
  },
};