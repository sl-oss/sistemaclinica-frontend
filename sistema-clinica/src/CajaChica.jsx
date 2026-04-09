import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function CajaChica() {
  const empresa = JSON.parse(localStorage.getItem("empresa") || "null");

  const [fechaDesde, setFechaDesde] = useState(hoyTexto());
  const [fechaHasta, setFechaHasta] = useState(hoyTexto());

  const [prefijoEmpresa, setPrefijoEmpresa] = useState("");
  const [correlativoNum, setCorrelativoNum] = useState("");
  const [correlativo, setCorrelativo] = useState("");

  const [saldoInicial, setSaldoInicial] = useState("");
  const [fondoCajaChica, setFondoCajaChica] = useState("500");
  const [observaciones, setObservaciones] = useState("");

  const [elaboradoPor, setElaboradoPor] = useState("");
  const [revisadoPor, setRevisadoPor] = useState("");
  const [autorizadoPor, setAutorizadoPor] = useState("");

  const [billetes, setBilletes] = useState([
    { denom: 100, cantidad: "0" },
    { denom: 50, cantidad: "0" },
    { denom: 20, cantidad: "0" },
    { denom: 10, cantidad: "0" },
    { denom: 5, cantidad: "0" },
    { denom: 1, cantidad: "0" },
  ]);

  const [monedas, setMonedas] = useState([
    { denom: 1, cantidad: "0" },
    { denom: 0.25, cantidad: "0" },
    { denom: 0.1, cantidad: "0" },
    { denom: 0.05, cantidad: "0" },
    { denom: 0.01, cantidad: "0" },
  ]);

  const [gastos, setGastos] = useState([
    {
      id: crypto.randomUUID(),
      tipoDoc: "",
      fecha: "",
      concepto: "",
      proveedor: "",
      comprobante: "",
      ingreso: "",
      egreso: "",
    },
  ]);

  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [idActual, setIdActual] = useState(null);

  useEffect(() => {
    if (!empresa?.id) return;
    inicializarModulo();
  }, [empresa?.id]);

  useEffect(() => {
    if (!prefijoEmpresa || !fechaHasta || correlativoNum === "") return;
    const yyyymm = fechaHasta.slice(0, 7).replace("-", "");
    const correlativoTexto = `${prefijoEmpresa}-${yyyymm}-${String(
      Number(correlativoNum || 0)
    ).padStart(3, "0")}`;
    setCorrelativo(correlativoTexto);
  }, [prefijoEmpresa, fechaHasta, correlativoNum]);

  function hoyTexto() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const obtenerPrefijoEmpresa = (empresaActual) => {
    const candidatos = [
      empresaActual?.siglas_caja_chica,
      empresaActual?.siglas,
      empresaActual?.codigo,
      empresaActual?.alias,
      empresaActual?.nombre,
    ];
    const base = candidatos.find((x) => x && String(x).trim()) || "EMPRESA";
    return String(base).split(",")[0].trim().toUpperCase();
  };

  const limpiarDecimalInput = (value) => {
    if (value === "") return "";
    let limpio = String(value).replace(/[^0-9.]/g, "");
    const partes = limpio.split(".");
    if (partes.length > 2) {
      limpio = partes[0] + "." + partes.slice(1).join("");
    }
    return limpio;
  };

  const soloEntero = (value) => {
    if (value === "") return "";
    return String(value).replace(/\D/g, "");
  };

  const numero = (value) => {
    if (value === "" || value === null || value === undefined) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const money = (value) =>
    Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const inicializarModulo = async () => {
    const prefijo = obtenerPrefijoEmpresa(empresa);
    setPrefijoEmpresa(prefijo);
    await cargarHistorial();
    await prepararNuevaLiquidacion(prefijo);
  };

  const cargarHistorial = async () => {
    setCargandoHistorial(true);

    const { data, error } = await supabase
      .from("liquidaciones_caja_chica")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("correlativo_num", { ascending: false })
      .limit(100);

    setCargandoHistorial(false);

    if (error) {
      console.error(error);
      return;
    }

    setHistorial(data || []);
  };

  const abrirHistorial = async () => {
    setMostrarHistorial(true);
    await cargarHistorial();
  };

  const cerrarHistorial = () => {
    setMostrarHistorial(false);
  };

  const prepararNuevaLiquidacion = async (prefijoManual = null) => {
    const prefijo = prefijoManual || obtenerPrefijoEmpresa(empresa);
    setPrefijoEmpresa(prefijo);

    const { data, error } = await supabase
      .from("liquidaciones_caja_chica")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("correlativo_num", { ascending: false })
      .limit(1);

    if (error) {
      console.error(error);
      alert("Error al consultar correlativo de caja chica");
      return;
    }

    const ultima = data?.[0];

    if (ultima) {
      setCorrelativoNum(String(Number(ultima.correlativo_num || 0) + 1));
      setSaldoInicial(String(Number(ultima.efectivo_contado_cierre || 0)));
      setFechaDesde(ultima.fecha_hasta || ultima.fecha || hoyTexto());
      setFechaHasta(hoyTexto());
      setElaboradoPor(ultima.elaborado_por || "");
      setRevisadoPor(ultima.revisado_por || "");
      setAutorizadoPor(ultima.autorizado_por || "");
    } else {
      setCorrelativoNum("1");
      setSaldoInicial("");
      setFechaDesde(hoyTexto());
      setFechaHasta(hoyTexto());
      setElaboradoPor("");
      setRevisadoPor("");
      setAutorizadoPor("");
    }

    setFondoCajaChica("500");
    setObservaciones("");
    setIdActual(null);

    setBilletes([
      { denom: 100, cantidad: "0" },
      { denom: 50, cantidad: "0" },
      { denom: 20, cantidad: "0" },
      { denom: 10, cantidad: "0" },
      { denom: 5, cantidad: "0" },
      { denom: 1, cantidad: "0" },
    ]);

    setMonedas([
      { denom: 1, cantidad: "0" },
      { denom: 0.25, cantidad: "0" },
      { denom: 0.1, cantidad: "0" },
      { denom: 0.05, cantidad: "0" },
      { denom: 0.01, cantidad: "0" },
    ]);

    setGastos([
      {
        id: crypto.randomUUID(),
        tipoDoc: "",
        fecha: "",
        concepto: "",
        proveedor: "",
        comprobante: "",
        ingreso: "",
        egreso: "",
      },
    ]);
  };

  const cargarLiquidacionEnPantalla = (liq) => {
    setIdActual(liq.id || null);
    setPrefijoEmpresa(liq.prefijo_empresa || obtenerPrefijoEmpresa(empresa));
    setCorrelativoNum(String(liq.correlativo_num || ""));
    setFechaDesde(liq.fecha_desde || "");
    setFechaHasta(liq.fecha_hasta || liq.fecha || "");
    setSaldoInicial(String(liq.saldo_inicial ?? ""));
    setFondoCajaChica(String(liq.fondo_caja_chica ?? "500"));
    setObservaciones(liq.observaciones || "");
    setCorrelativo(liq.correlativo || "");
    setElaboradoPor(liq.elaborado_por || "");
    setRevisadoPor(liq.revisado_por || "");
    setAutorizadoPor(liq.autorizado_por || "");

    const efectivo = liq.efectivo || {};
    const billetesGuardados = efectivo.billetes || [];
    const monedasGuardadas = efectivo.monedas || [];

    setBilletes([
      {
        denom: 100,
        cantidad: String(
          billetesGuardados.find((x) => Number(x.denom) === 100)?.cantidad ?? 0
        ),
      },
      {
        denom: 50,
        cantidad: String(
          billetesGuardados.find((x) => Number(x.denom) === 50)?.cantidad ?? 0
        ),
      },
      {
        denom: 20,
        cantidad: String(
          billetesGuardados.find((x) => Number(x.denom) === 20)?.cantidad ?? 0
        ),
      },
      {
        denom: 10,
        cantidad: String(
          billetesGuardados.find((x) => Number(x.denom) === 10)?.cantidad ?? 0
        ),
      },
      {
        denom: 5,
        cantidad: String(
          billetesGuardados.find((x) => Number(x.denom) === 5)?.cantidad ?? 0
        ),
      },
      {
        denom: 1,
        cantidad: String(
          billetesGuardados.find((x) => Number(x.denom) === 1)?.cantidad ?? 0
        ),
      },
    ]);

    setMonedas([
      {
        denom: 1,
        cantidad: String(
          monedasGuardadas.find((x) => Number(x.denom) === 1)?.cantidad ?? 0
        ),
      },
      {
        denom: 0.25,
        cantidad: String(
          monedasGuardadas.find((x) => Number(x.denom) === 0.25)?.cantidad ?? 0
        ),
      },
      {
        denom: 0.1,
        cantidad: String(
          monedasGuardadas.find((x) => Number(x.denom) === 0.1)?.cantidad ?? 0
        ),
      },
      {
        denom: 0.05,
        cantidad: String(
          monedasGuardadas.find((x) => Number(x.denom) === 0.05)?.cantidad ?? 0
        ),
      },
      {
        denom: 0.01,
        cantidad: String(
          monedasGuardadas.find((x) => Number(x.denom) === 0.01)?.cantidad ?? 0
        ),
      },
    ]);

    const gastosGuardados = Array.isArray(liq.gastos) ? liq.gastos : [];
    if (gastosGuardados.length > 0) {
      setGastos(
        gastosGuardados.map((g) => ({
          id: crypto.randomUUID(),
          tipoDoc: g.tipoDoc || "",
          fecha: g.fecha || "",
          concepto: g.concepto || "",
          proveedor: g.proveedor || "",
          comprobante: g.comprobante || "",
          ingreso:
            g.ingreso === null || g.ingreso === undefined ? "" : String(g.ingreso),
          egreso:
            g.egreso === null || g.egreso === undefined ? "" : String(g.egreso),
        }))
      );
    } else {
      setGastos([
        {
          id: crypto.randomUUID(),
          tipoDoc: "",
          fecha: "",
          concepto: "",
          proveedor: "",
          comprobante: "",
          ingreso: "",
          egreso: "",
        },
      ]);
    }

    setMostrarHistorial(false);
  };

  const setCantidadBillete = (index, value) => {
    const limpio = String(value).replace(/\D/g, "");
    const copia = [...billetes];
    copia[index].cantidad = limpio;
    setBilletes(copia);
  };

  const setCantidadMoneda = (index, value) => {
    const limpio = String(value).replace(/\D/g, "");
    const copia = [...monedas];
    copia[index].cantidad = limpio;
    setMonedas(copia);
  };

  const totalBilletes = useMemo(() => {
    return billetes.reduce(
      (acc, item) => acc + numero(item.denom) * numero(item.cantidad),
      0
    );
  }, [billetes]);

  const totalMonedas = useMemo(() => {
    return monedas.reduce(
      (acc, item) => acc + numero(item.denom) * numero(item.cantidad),
      0
    );
  }, [monedas]);

  const totalEfectivoDisponible = useMemo(() => {
    return totalBilletes + totalMonedas;
  }, [totalBilletes, totalMonedas]);

  const gastosConBalance = useMemo(() => {
    let balance = numero(saldoInicial);

    return gastos.map((g, index) => {
      const ingresoNum = numero(g.ingreso);
      const egresoNum = numero(g.egreso);
      balance = balance + ingresoNum - egresoNum;

      return {
        ...g,
        index: index + 1,
        ingresoNum,
        egresoNum,
        balance,
      };
    });
  }, [gastos, saldoInicial]);

  const totalIngresos = useMemo(() => {
    return gastos.reduce((acc, g) => acc + numero(g.ingreso), 0);
  }, [gastos]);

  const totalEgresos = useMemo(() => {
    return gastos.reduce((acc, g) => acc + numero(g.egreso), 0);
  }, [gastos]);

  const montoTotalDisponible = useMemo(() => {
    return numero(saldoInicial) + totalIngresos;
  }, [saldoInicial, totalIngresos]);

  const montoDeberiaQuedar = useMemo(() => {
    return montoTotalDisponible - totalEgresos;
  }, [montoTotalDisponible, totalEgresos]);

  const efectivoContadoCierre = useMemo(() => {
    return totalEfectivoDisponible;
  }, [totalEfectivoDisponible]);

  const diferencia = useMemo(() => {
    return montoDeberiaQuedar - efectivoContadoCierre;
  }, [montoDeberiaQuedar, efectivoContadoCierre]);

  const fechaRegistro = useMemo(() => {
    return fechaHasta || fechaDesde || hoyTexto();
  }, [fechaDesde, fechaHasta]);

  const agregarFila = () => {
    setGastos((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        tipoDoc: "",
        fecha: "",
        concepto: "",
        proveedor: "",
        comprobante: "",
        ingreso: "",
        egreso: "",
      },
    ]);
  };

  const eliminarFila = (id) => {
    setGastos((prev) => {
      if (prev.length === 1) {
        return [
          {
            id: crypto.randomUUID(),
            tipoDoc: "",
            fecha: "",
            concepto: "",
            proveedor: "",
            comprobante: "",
            ingreso: "",
            egreso: "",
          },
        ];
      }
      return prev.filter((g) => g.id !== id);
    });
  };

  const actualizarGasto = (id, campo, valor) => {
    setGastos((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
              ...g,
              [campo]:
                campo === "ingreso" || campo === "egreso"
                  ? limpiarDecimalInput(valor)
                  : valor,
            }
          : g
      )
    );
  };

  const validar = () => {
    if (!empresa?.id) {
      alert("No hay empresa seleccionada");
      return false;
    }
    if (!fechaDesde || !fechaHasta) {
      alert("Debes ingresar el rango del período");
      return false;
    }
    if (correlativoNum === "" || Number(correlativoNum) <= 0) {
      alert("Debes ingresar un correlativo válido");
      return false;
    }
    return true;
  };

  const guardarLiquidacion = async () => {
    if (!validar()) return;

    const correlativoNumeroFinal = Number(correlativoNum);

    if (!idActual) {
      const { data: repetidos, error: errorRepetidos } = await supabase
        .from("liquidaciones_caja_chica")
        .select("id")
        .eq("empresa_id", empresa.id)
        .eq("correlativo_num", correlativoNumeroFinal)
        .limit(1);

      if (errorRepetidos) {
        console.error(errorRepetidos);
        return alert("Error al validar correlativo");
      }

      if (repetidos && repetidos.length > 0) {
        return alert("Ese correlativo ya existe para esta empresa");
      }
    }

    const payload = {
      empresa_id: empresa.id,
      prefijo_empresa: prefijoEmpresa,
      correlativo_num: correlativoNumeroFinal,
      correlativo,
      fecha: fechaRegistro,
      fecha_desde: fechaDesde || null,
      fecha_hasta: fechaHasta || null,
      saldo_inicial: numero(saldoInicial),
      fondo_caja_chica: numero(fondoCajaChica),
      efectivo: {
        billetes: billetes.map((b) => ({
          denom: numero(b.denom),
          cantidad: numero(b.cantidad),
          total: numero(b.denom) * numero(b.cantidad),
        })),
        monedas: monedas.map((m) => ({
          denom: numero(m.denom),
          cantidad: numero(m.cantidad),
          total: numero(m.denom) * numero(m.cantidad),
        })),
      },
      gastos: gastosConBalance.map((g) => ({
        tipoDoc: g.tipoDoc || "",
        fecha: g.fecha || null,
        concepto: g.concepto || "",
        proveedor: g.proveedor || "",
        comprobante: g.comprobante || "",
        ingreso: g.ingresoNum || 0,
        egreso: g.egresoNum || 0,
        balance: g.balance || 0,
      })),
      total_billetes: totalBilletes,
      total_monedas: totalMonedas,
      total_efectivo_disponible: totalEfectivoDisponible,
      total_ingresos: totalIngresos,
      total_egresos: totalEgresos,
      monto_total_disponible: montoTotalDisponible,
      monto_deberia_quedar: montoDeberiaQuedar,
      efectivo_contado_cierre: efectivoContadoCierre,
      diferencia,
      observaciones,
      elaborado_por: elaboradoPor,
      revisado_por: revisadoPor,
      autorizado_por: autorizadoPor,
    };

    let error = null;

    if (idActual) {
      const res = await supabase
        .from("liquidaciones_caja_chica")
        .update(payload)
        .eq("id", idActual);
      error = res.error;
    } else {
      const res = await supabase
        .from("liquidaciones_caja_chica")
        .insert([payload]);
      error = res.error;
    }

    if (error) {
      console.error(error);
      if (error.code === "23505") {
        return alert("Ya existe ese correlativo para esta empresa");
      }
      return alert("Error al guardar la liquidación");
    }

    alert(
      idActual
        ? "Liquidación actualizada correctamente"
        : "Liquidación guardada correctamente"
    );
    await cargarHistorial();
    await prepararNuevaLiquidacion();
  };

  const exportarExcel = () => {
    const rowsArqueo = [
      ["LIQUIDACIÓN DE CAJA CHICA"],
      [empresa?.nombre || ""],
      [
        `DEL: ${fechaDesde || ""}`,
        `AL: ${fechaHasta || ""}`,
        "",
        "",
        "CORRELATIVO:",
        correlativo,
      ],
      [],
      ["ARQUEO DE CAJA CHICA"],
      [
        "DETALLE DE EFECTIVO / BILLETES",
        "",
        "",
        "",
        "DETALLE DE EFECTIVO / MONEDAS",
      ],
      ["DENOM.", "CANT.", "TOTAL", "", "DENOM.", "CANT.", "TOTAL"],
    ];

    const maxFilas = Math.max(billetes.length, monedas.length);
    for (let i = 0; i < maxFilas; i++) {
      const b = billetes[i];
      const m = monedas[i];
      rowsArqueo.push([
        b ? b.denom : "",
        b ? numero(b.cantidad) : "",
        b ? numero(b.denom) * numero(b.cantidad) : "",
        "",
        m ? m.denom : "",
        m ? numero(m.cantidad) : "",
        m ? numero(m.denom) * numero(m.cantidad) : "",
      ]);
    }

    rowsArqueo.push(["TOTAL BILLETES", "", totalBilletes]);
    rowsArqueo.push(["TOTAL MONEDAS", "", totalMonedas]);
    rowsArqueo.push(["TOTAL EFECTIVO DISPONIBLE", "", totalEfectivoDisponible]);
    rowsArqueo.push(["FONDO DE CAJA CHICA", "", numero(fondoCajaChica)]);
    rowsArqueo.push([]);
    rowsArqueo.push(["LISTADO DE GASTOS"]);
    rowsArqueo.push([
      "SALDO INICIAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      numero(saldoInicial),
    ]);
    rowsArqueo.push([
      "#",
      "TIPO DE DOC.",
      "FECHA",
      "CONCEPTO",
      "PROVEEDOR",
      "No. COMPROBANTE",
      "INGRESO",
      "EGRESO",
      "BALANCE",
    ]);

    gastosConBalance.forEach((g) => {
      rowsArqueo.push([
        g.index,
        g.tipoDoc,
        g.fecha,
        g.concepto,
        g.proveedor,
        g.comprobante,
        g.ingresoNum,
        g.egresoNum,
        g.balance,
      ]);
    });

    rowsArqueo.push([
      "Total",
      "",
      "",
      "",
      "",
      "",
      totalIngresos,
      totalEgresos,
      "",
    ]);
    rowsArqueo.push([]);
    rowsArqueo.push(["LIQUIDACIÓN"]);
    rowsArqueo.push(["Saldo inicial del periodo", "", numero(saldoInicial)]);
    rowsArqueo.push([
      "(+) Ingresos / reintegros (reposiciones)",
      "",
      totalIngresos,
    ]);
    rowsArqueo.push([
      "(=) Monto total disponible para gastos",
      "",
      montoTotalDisponible,
    ]);
    rowsArqueo.push([
      "(-) Total comprobado (gastos válidos)",
      "",
      totalEgresos,
    ]);
    rowsArqueo.push([
      "(=) Monto que debería quedar de efectivo",
      "",
      montoDeberiaQuedar,
    ]);
    rowsArqueo.push(["Efectivo contado al cierre", "", efectivoContadoCierre]);
    rowsArqueo.push(["Diferencia (faltante / sobrante)", "", diferencia]);
    rowsArqueo.push([]);
    rowsArqueo.push(["Observaciones / explicación de la diferencia:"]);
    rowsArqueo.push([observaciones || ""]);

    rowsArqueo.push([]);
    rowsArqueo.push([]);
    rowsArqueo.push([
      "________________________",
      "",
      "",
      "________________________",
      "",
      "",
      "________________________",
      "",
      "",
    ]);
    rowsArqueo.push([
      elaboradoPor || "Elaborado por",
      "",
      "",
      revisadoPor || "Revisado por",
      "",
      "",
      autorizadoPor || "Autorizado por",
      "",
      "",
    ]);
    rowsArqueo.push([
      "Elabora caja chica",
      "",
      "",
      "Revisa",
      "",
      "",
      "Autoriza",
      "",
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rowsArqueo);
    ws["!cols"] = [
      { wch: 10 },
      { wch: 16 },
      { wch: 14 },
      { wch: 28 },
      { wch: 24 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Caja Chica");
    XLSX.writeFile(wb, `CajaChica_${correlativo}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("LIQUIDACIÓN DE CAJA CHICA", 105, 12, { align: "center" });

    doc.setFontSize(11);
    doc.text(empresa?.nombre || "", 105, 19, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Del: ${fechaDesde || ""}`, 14, 28);
    doc.text(`Al: ${fechaHasta || ""}`, 60, 28);
    doc.text(`Correlativo: ${correlativo}`, 130, 28);

    autoTable(doc, {
      startY: 34,
      head: [["Billetes", "Cant.", "Total", "Monedas", "Cant.", "Total"]],
      body: Array.from(
        { length: Math.max(billetes.length, monedas.length) },
        (_, i) => {
          const b = billetes[i];
          const m = monedas[i];
          return [
            b ? b.denom : "",
            b ? numero(b.cantidad) : "",
            b ? money(numero(b.denom) * numero(b.cantidad)) : "",
            m ? m.denom : "",
            m ? numero(m.cantidad) : "",
            m ? money(numero(m.denom) * numero(m.cantidad)) : "",
          ];
        }
      ),
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [28, 63, 95] },
    });

    const y1 = doc.lastAutoTable.finalY + 6;

    autoTable(doc, {
      startY: y1,
      body: [
        ["Total billetes", money(totalBilletes)],
        ["Total monedas", money(totalMonedas)],
        ["Total efectivo disponible", money(totalEfectivoDisponible)],
        ["Fondo de caja chica", money(numero(fondoCajaChica))],
      ],
      theme: "grid",
      styles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: "bold" } },
    });

    let y2 = doc.lastAutoTable.finalY + 6;

    autoTable(doc, {
      startY: y2,
      head: [[
        "#",
        "Tipo",
        "Fecha",
        "Concepto",
        "Proveedor",
        "Comprobante",
        "Ingreso",
        "Egreso",
        "Balance",
      ]],
      body: gastosConBalance.map((g) => [
        g.index,
        g.tipoDoc,
        g.fecha,
        g.concepto,
        g.proveedor,
        g.comprobante,
        money(g.ingresoNum),
        money(g.egresoNum),
        money(g.balance),
      ]),
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [28, 63, 95] },
      margin: { left: 8, right: 8 },
    });

    let y3 = doc.lastAutoTable.finalY + 6;

    if (y3 > 245) {
      doc.addPage();
      y3 = 20;
    }

    autoTable(doc, {
      startY: y3,
      body: [
        ["Saldo inicial del periodo", money(numero(saldoInicial))],
        ["(+) Ingresos / reintegros (reposiciones)", money(totalIngresos)],
        ["(=) Monto total disponible para gastos", money(montoTotalDisponible)],
        ["(-) Total comprobado (gastos válidos)", money(totalEgresos)],
        ["(=) Monto que debería quedar de efectivo", money(montoDeberiaQuedar)],
        ["Efectivo contado al cierre", money(efectivoContadoCierre)],
        ["Diferencia (faltante / sobrante)", money(diferencia)],
      ],
      theme: "grid",
      styles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: "bold" } },
    });

    const yObs = doc.lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold");
    doc.text("Observaciones / explicación de la diferencia:", 14, yObs);
    doc.setFont("helvetica", "normal");
    doc.text(observaciones || "-", 14, yObs + 6, { maxWidth: 180 });

    let yFirmas = yObs + 25;
    if (yFirmas > 260) {
      doc.addPage();
      yFirmas = 30;
    }

    const anchoPagina = 210;
    const margen = 18;
    const espacio = (anchoPagina - margen * 2) / 3;

    const firmas = [
      {
        nombre: elaboradoPor || "________________________",
        cargo: "Elabora caja chica",
      },
      {
        nombre: revisadoPor || "________________________",
        cargo: "Revisa",
      },
      {
        nombre: autorizadoPor || "________________________",
        cargo: "Autoriza",
      },
    ];

    doc.setFontSize(10);

    firmas.forEach((firma, i) => {
      const x = margen + espacio * i + espacio / 2;

      doc.line(x - 28, yFirmas, x + 28, yFirmas);

      doc.setFont("helvetica", "normal");
      doc.text(firma.nombre, x, yFirmas + 6, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.text(firma.cargo, x, yFirmas + 12, { align: "center" });
    });

    doc.save(`CajaChica_${correlativo}.pdf`);
  };

  if (!empresa) {
    return <div>No hay empresa seleccionada</div>;
  }

  return (
    <>
      <div style={styles.page}>
        <h2 style={styles.titulo}>💵 Caja Chica</h2>

        <div>
          <div style={styles.card}>
            <div style={styles.headerBox}>
              <div style={styles.headerTitle}>LIQUIDACIÓN DE CAJA CHICA</div>
              <div style={styles.headerCompany}>{empresa?.nombre || ""}</div>
            </div>

            <div style={styles.headerGrid}>
              <div>
                <label style={styles.label}>Del</label>
                <input
                  style={styles.input}
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Al</label>
                <input
                  style={styles.input}
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Correlativo No.</label>
                <input
                  style={styles.input}
                  value={correlativoNum}
                  onChange={(e) => setCorrelativoNum(soloEntero(e.target.value))}
                />
              </div>

              <div>
                <label style={styles.label}>Correlativo</label>
                <input
                  style={styles.inputReadOnly}
                  value={correlativo}
                  readOnly
                />
              </div>
            </div>
          </div>

          <div style={styles.sectionTitle}>ARQUEO DE CAJA CHICA</div>

          <div style={styles.twoCols}>
            <div style={styles.card}>
              <h3 style={styles.subtitulo}>Detalle de efectivo / billetes</h3>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Denom.</th>
                    <th style={styles.th}>Cant.</th>
                    <th style={styles.th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {billetes.map((b, i) => (
                    <tr key={b.denom}>
                      <td style={styles.td}>{b.denom}</td>
                      <td style={styles.td}>
                        <input
                          style={styles.inputTable}
                          value={b.cantidad}
                          onChange={(e) => setCantidadBillete(i, e.target.value)}
                        />
                      </td>
                      <td style={styles.tdRight}>
                        ${money(numero(b.denom) * numero(b.cantidad))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={styles.totalLabel} colSpan={2}>
                      TOTAL BILLETES
                    </td>
                    <td style={styles.totalValue}>${money(totalBilletes)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={styles.card}>
              <h3 style={styles.subtitulo}>Detalle de efectivo / monedas</h3>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Denom.</th>
                    <th style={styles.th}>Cant.</th>
                    <th style={styles.th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monedas.map((m, i) => (
                    <tr key={m.denom}>
                      <td style={styles.td}>{m.denom}</td>
                      <td style={styles.td}>
                        <input
                          style={styles.inputTable}
                          value={m.cantidad}
                          onChange={(e) => setCantidadMoneda(i, e.target.value)}
                        />
                      </td>
                      <td style={styles.tdRight}>
                        ${money(numero(m.denom) * numero(m.cantidad))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={styles.totalLabel} colSpan={2}>
                      TOTAL MONEDAS
                    </td>
                    <td style={styles.totalValue}>${money(totalMonedas)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={styles.summaryMini}>
                <div style={styles.summaryMiniRow}>
                  <span>Total efectivo disponible</span>
                  <strong>${money(totalEfectivoDisponible)}</strong>
                </div>
                <div style={styles.summaryMiniRow}>
                  <span>Fondo de caja chica</span>
                  <input
                    style={styles.inputMini}
                    type="text"
                    inputMode="decimal"
                    value={fondoCajaChica}
                    onChange={(e) =>
                      setFondoCajaChica(limpiarDecimalInput(e.target.value))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={styles.sectionTitle}>LISTADO DE GASTOS</div>

          <div style={styles.card}>
            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>Saldo inicial</label>
              <input
                style={styles.input}
                type="text"
                inputMode="decimal"
                value={saldoInicial}
                onChange={(e) =>
                  setSaldoInicial(limpiarDecimalInput(e.target.value))
                }
                placeholder="0.00"
              />
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={styles.tableWide}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>TIPO DE DOC.</th>
                    <th style={styles.th}>FECHA</th>
                    <th style={styles.th}>CONCEPTO</th>
                    <th style={styles.th}>PROVEEDOR</th>
                    <th style={styles.th}>No. COMPROBANTE</th>
                    <th style={styles.th}>INGRESO</th>
                    <th style={styles.th}>EGRESO</th>
                    <th style={styles.th}>BALANCE</th>
                    <th style={styles.th}>ACC.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={styles.td} colSpan={8}>
                      <strong>SALDO INICIAL</strong>
                    </td>
                    <td style={styles.tdRight}>
                      <strong>${money(numero(saldoInicial))}</strong>
                    </td>
                    <td style={styles.td}></td>
                  </tr>

                  {gastosConBalance.map((g) => (
                    <tr key={g.id}>
                      <td style={styles.tdCenter}>{g.index}</td>
                      <td style={styles.td}>
                        <input
                          style={styles.inputTable}
                          value={g.tipoDoc}
                          onChange={(e) =>
                            actualizarGasto(g.id, "tipoDoc", e.target.value)
                          }
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          style={styles.inputTable}
                          type="date"
                          value={g.fecha}
                          onChange={(e) =>
                            actualizarGasto(g.id, "fecha", e.target.value)
                          }
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          style={styles.inputTable}
                          value={g.concepto}
                          onChange={(e) =>
                            actualizarGasto(g.id, "concepto", e.target.value)
                          }
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          style={styles.inputTable}
                          value={g.proveedor}
                          onChange={(e) =>
                            actualizarGasto(g.id, "proveedor", e.target.value)
                          }
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          style={styles.inputTable}
                          value={g.comprobante}
                          onChange={(e) =>
                            actualizarGasto(g.id, "comprobante", e.target.value)
                          }
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          style={styles.inputTable}
                          type="text"
                          inputMode="decimal"
                          value={g.ingreso}
                          onChange={(e) =>
                            actualizarGasto(g.id, "ingreso", e.target.value)
                          }
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          style={styles.inputTable}
                          type="text"
                          inputMode="decimal"
                          value={g.egreso}
                          onChange={(e) =>
                            actualizarGasto(g.id, "egreso", e.target.value)
                          }
                        />
                      </td>
                      <td style={styles.tdRight}>${money(g.balance)}</td>
                      <td style={styles.tdCenter}>
                        <button
                          style={styles.btnEliminarFila}
                          onClick={() => eliminarFila(g.id)}
                        >
                          ✖
                        </button>
                      </td>
                    </tr>
                  ))}

                  <tr>
                    <td style={styles.td} colSpan={6}>
                      <strong>Total</strong>
                    </td>
                    <td style={styles.tdRight}>
                      <strong>${money(totalIngresos)}</strong>
                    </td>
                    <td style={styles.tdRight}>
                      <strong>${money(totalEgresos)}</strong>
                    </td>
                    <td style={styles.td}></td>
                    <td style={styles.td}></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12 }}>
              <button style={styles.btnAgregar} onClick={agregarFila}>
                + Agregar fila
              </button>
            </div>
          </div>

          <div style={styles.sectionTitle}>LIQUIDACIÓN</div>

          <div style={styles.card}>
            <div style={styles.summaryBox}>
              <div style={styles.summaryRow}>
                <span>Saldo inicial del periodo</span>
                <strong>${money(numero(saldoInicial))}</strong>
              </div>

              <div style={styles.summaryRow}>
                <span>(+) Ingresos / reintegros (reposiciones)</span>
                <strong>${money(totalIngresos)}</strong>
              </div>

              <div style={styles.summaryRow}>
                <span>(=) Monto total disponible para gastos</span>
                <strong>${money(montoTotalDisponible)}</strong>
              </div>

              <div style={styles.summaryRow}>
                <span>(-) Total comprobado (gastos válidos)</span>
                <strong>${money(totalEgresos)}</strong>
              </div>

              <div style={styles.summaryRow}>
                <span>(=) Monto que debería quedar de efectivo</span>
                <strong>${money(montoDeberiaQuedar)}</strong>
              </div>

              <div style={styles.summaryRow}>
                <span>Efectivo contado al cierre</span>
                <strong>${money(efectivoContadoCierre)}</strong>
              </div>

              <div
                style={{
                  ...styles.summaryRow,
                  background:
                    Math.abs(diferencia) > 0.009 ? "#fef2f2" : "#ecfdf5",
                  borderColor:
                    Math.abs(diferencia) > 0.009 ? "#fecaca" : "#bbf7d0",
            background:
                      Math.abs(diferencia) < 0.009 ? "#fefdf2" : "#ecfdf5",
                  borderColor:
                    Math.abs(diferencia) < 0.009 ? "#fecaca" : "#bbf7d0",
                }}
              >
                <span>Diferencia (faltante (rojo) / sobrante (amarillo))</span>
                <strong>${money(diferencia)}</strong>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <label style={styles.label}>
              Observaciones / explicación de la diferencia
            </label>
            <textarea
              style={styles.textarea}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={4}
            />
          </div>

          <div style={styles.card}>
            <div style={styles.firmasGrid}>
              <div>
                <label style={styles.label}>Elabora caja chica</label>
                <input
                  style={styles.input}
                  value={elaboradoPor}
                  onChange={(e) => setElaboradoPor(e.target.value)}
                  placeholder="Nombre de quien elabora"
                />
              </div>

              <div>
                <label style={styles.label}>Revisa</label>
                <input
                  style={styles.input}
                  value={revisadoPor}
                  onChange={(e) => setRevisadoPor(e.target.value)}
                  placeholder="Nombre de quien revisa"
                />
              </div>

              <div>
                <label style={styles.label}>Autoriza</label>
                <input
                  style={styles.input}
                  value={autorizadoPor}
                  onChange={(e) => setAutorizadoPor(e.target.value)}
                  placeholder="Nombre de quien autoriza"
                />
              </div>
            </div>
          </div>

          <div style={styles.actions}>
            <button style={styles.btnGuardar} onClick={guardarLiquidacion}>
              {idActual ? "Actualizar" : "Guardar"}
            </button>
            <button style={styles.btnSecundario} onClick={exportarPDF}>
              Exportar PDF
            </button>
            <button style={styles.btnSecundario} onClick={exportarExcel}>
              Exportar Excel
            </button>
            <button
              style={styles.btnSecundario}
              onClick={() => prepararNuevaLiquidacion()}
            >
              Nuevo
            </button>
            <button style={styles.btnHistorial} onClick={abrirHistorial}>
              📚 Ver historial
            </button>
          </div>
        </div>
      </div>

      {mostrarHistorial && (
        <div style={styles.modalOverlay} onClick={cerrarHistorial}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>📚 Historial de Caja Chica</h3>
              <button style={styles.btnCerrarModal} onClick={cerrarHistorial}>
                ✖
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <button style={styles.btnSecundario} onClick={cargarHistorial}>
                Actualizar historial
              </button>
            </div>

            {cargandoHistorial && <p>Cargando...</p>}

            {!cargandoHistorial && historial.length === 0 && (
              <p>No hay liquidaciones guardadas.</p>
            )}

            <div style={styles.historialGrid}>
              {historial.map((liq) => (
                <div key={liq.id} style={styles.historialCard}>
                  <div style={styles.historialTitle}>{liq.correlativo}</div>
                  <div style={styles.historialText}>
                    {liq.fecha_desde || liq.fecha} al{" "}
                    {liq.fecha_hasta || liq.fecha}
                  </div>
                  <div style={styles.historialText}>
                    Cierre: ${money(liq.efectivo_contado_cierre)}
                  </div>

                  <div style={styles.historialActions}>
                    <button
                      style={styles.btnMini}
                      onClick={() => cargarLiquidacionEnPantalla(liq)}
                    >
                      Cargar
                    </button>
                  </div>
                </div>
              ))}
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
    padding: 20,
    boxSizing: "border-box",
    background: "#f1f5f9",
    minHeight: "100vh",
  },
  titulo: {
    marginBottom: 16,
    color: "#0f172a",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  headerBox: {
    textAlign: "center",
    marginBottom: 18,
  },
  headerTitle: {
    fontWeight: "700",
    fontSize: 22,
    color: "#0f172a",
  },
  headerCompany: {
    fontWeight: "600",
    fontSize: 17,
    color: "#334155",
    marginTop: 4,
  },
  headerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  sectionTitle: {
    fontWeight: "700",
    color: "#0f172a",
    margin: "14px 0 10px",
    fontSize: 16,
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },
  subtitulo: {
    marginTop: 0,
    marginBottom: 12,
    color: "#1e293b",
    fontSize: 16,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    background: "#fff",
  },
  inputReadOnly: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    background: "#f8fafc",
    color: "#334155",
  },
  inputTable: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "7px 8px",
    fontSize: 13,
    background: "#fff",
  },
  inputMini: {
    width: 120,
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "7px 8px",
    fontSize: 13,
    textAlign: "right",
    background: "#fff",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    resize: "vertical",
    outline: "none",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  tableWide: {
    width: "100%",
    minWidth: 1100,
    borderCollapse: "collapse",
  },
  th: {
    background: "#1e3a5f",
    color: "#fff",
    padding: 10,
    fontSize: 13,
    textAlign: "center",
    border: "1px solid #dbeafe",
  },
  td: {
    padding: 8,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    color: "#334155",
    background: "#fff",
    verticalAlign: "middle",
  },
  tdCenter: {
    padding: 8,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    color: "#334155",
    background: "#fff",
    textAlign: "center",
    verticalAlign: "middle",
  },
  tdRight: {
    padding: 8,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    color: "#334155",
    background: "#fff",
    textAlign: "right",
    verticalAlign: "middle",
  },
  totalLabel: {
    padding: 10,
    border: "1px solid #e2e8f0",
    fontWeight: "700",
    background: "#f8fafc",
    textAlign: "right",
  },
  totalValue: {
    padding: 10,
    border: "1px solid #e2e8f0",
    fontWeight: "700",
    background: "#f8fafc",
    textAlign: "right",
  },
  summaryMini: {
    marginTop: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    overflow: "hidden",
  },
  summaryMiniRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderBottom: "1px solid #e2e8f0",
    gap: 12,
    fontSize: 14,
  },
  summaryBox: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#f8fafc",
    color: "#1e293b",
  },
  firmasGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  btnGuardar: {
    background: "#0f766e",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: "700",
  },
  btnSecundario: {
    background: "#fff",
    color: "#0f172a",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: "600",
  },
  btnHistorial: {
    background: "#1d4ed8",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: "700",
  },
  btnAgregar: {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },
  btnEliminarFila: {
    border: "none",
    padding: "7px 10px",
    background: "#fee2e2",
    borderRadius: 8,
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 9999,
  },
  modal: {
    width: "100%",
    maxWidth: 900,
    maxHeight: "85vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  btnCerrarModal: {
    border: "none",
    background: "#e2e8f0",
    borderRadius: 8,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "700",
  },
  historialGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: 12,
  },
  historialCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 12,
    background: "#f8fafc",
  },
  historialTitle: {
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  historialText: {
    fontSize: 13,
    color: "#475569",
    marginBottom: 4,
  },
  historialActions: {
    marginTop: 8,
    display: "flex",
    gap: 8,
  },
  btnMini: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#fff",
    cursor: "pointer",
  },
};

export default CajaChica;