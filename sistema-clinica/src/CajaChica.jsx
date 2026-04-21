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

  const normalizarPrefijo = (texto) => {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  };

  const obtenerPrefijoEmpresa = (empresaActual) => {
    const directos = [
      empresaActual?.siglas_caja_chica,
      empresaActual?.siglas,
      empresaActual?.codigo,
      empresaActual?.alias,
    ];

    const directo = directos.find((x) => x && String(x).trim());
    if (directo) {
      return normalizarPrefijo(directo).replace(/\s+/g, "").slice(0, 12) || "EMPRESA";
    }

    const nombre = normalizarPrefijo(empresaActual?.nombre || "EMPRESA");
    if (!nombre) return "EMPRESA";

    const nombreSinEspacios = nombre.replace(/\s+/g, "");
    if (nombreSinEspacios.length <= 10) {
      return nombreSinEspacios;
    }

    const palabras = nombre.split(" ").filter(Boolean);

    if (palabras.length >= 2) {
      const primera = palabras[0].slice(0, 6);
      const segunda = palabras[1].slice(0, 4);
      const combinado = `${primera}${segunda}`.replace(/\s+/g, "");
      return combinado.slice(0, 10) || "EMPRESA";
    }

    return palabras[0].slice(0, 10).replace(/\s+/g, "") || "EMPRESA";
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
    const colorPrincipal = [107, 90, 122];
    const colorSecundario = [236, 236, 239];
    const colorTexto = [31, 41, 55];

    const doc = new jsPDF("p", "mm", "a4");

    doc.setFillColor(...colorSecundario);
    doc.circle(185, 10, 35, "F");
    doc.circle(10, 287, 28, "F");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colorPrincipal);
    doc.setFontSize(18);
    doc.text("LIQUIDACIÓN DE CAJA CHICA", 14, 18);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colorTexto);
    doc.setFontSize(10);
    doc.text(empresa?.nombre || "", 14, 25);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colorPrincipal);
    doc.setFontSize(16);
    doc.text(correlativo || "", 196, 18, { align: "right" });

    doc.setTextColor(...colorTexto);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Del: ${fechaDesde || ""}`, 14, 37);
    doc.text(`Al: ${fechaHasta || ""}`, 60, 37);

    doc.setDrawColor(31, 41, 55);
    doc.roundedRect(14, 42, 182, 16, 3, 3);

    doc.setFont("helvetica", "bold");
    doc.text("Saldo inicial", 18, 48);
    doc.text("Fondo caja chica", 106, 48);

    doc.setFont("helvetica", "normal");
    doc.text(`$ ${money(numero(saldoInicial))}`, 18, 54);
    doc.text(`$ ${money(numero(fondoCajaChica))}`, 106, 54);

    autoTable(doc, {
      startY: 66,
      head: [["Billetes", "Cant.", "Total", "Monedas", "Cant.", "Total"]],
      body: Array.from(
        { length: Math.max(billetes.length, monedas.length) },
        (_, i) => {
          const b = billetes[i];
          const m = monedas[i];
          return [
            b ? b.denom : "",
            b ? numero(b.cantidad) : "",
            b ? `$ ${money(numero(b.denom) * numero(b.cantidad))}` : "",
            m ? m.denom : "",
            m ? numero(m.cantidad) : "",
            m ? `$ ${money(numero(m.denom) * numero(m.cantidad))}` : "",
          ];
        }
      ),
      theme: "grid",
      styles: { fontSize: 8.5, textColor: [31, 41, 55] },
      headStyles: { fillColor: colorPrincipal, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 14, right: 14 },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY,
      body: [
        ["TOTAL BILLETES", `$ ${money(totalBilletes)}`],
        ["TOTAL MONEDAS", `$ ${money(totalMonedas)}`],
        ["TOTAL EFECTIVO DISPONIBLE", `$ ${money(totalEfectivoDisponible)}`],
      ],
      theme: "grid",
      styles: { fontSize: 9, textColor: [31, 41, 55] },
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { halign: "right" },
      },
      margin: { left: 106, right: 14 },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [[
        "#",
        "Tipo",
        "Fecha",
        "Concepto",
        "Proveedor",
        "Comp.",
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
        `$ ${money(g.ingresoNum)}`,
        `$ ${money(g.egresoNum)}`,
        `$ ${money(g.balance)}`,
      ]),
      theme: "grid",
      styles: { fontSize: 7.8, cellPadding: 2, textColor: [31, 41, 55] },
      headStyles: { fillColor: colorPrincipal, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 8, right: 8 },
    });

    let y3 = doc.lastAutoTable.finalY + 8;

    if (y3 > 240) {
      doc.addPage();
      y3 = 20;
    }

    autoTable(doc, {
      startY: y3,
      body: [
        ["Saldo inicial del periodo", `$ ${money(numero(saldoInicial))}`],
        ["(+) Ingresos / reintegros (reposiciones)", `$ ${money(totalIngresos)}`],
        ["(=) Monto total disponible para gastos", `$ ${money(montoTotalDisponible)}`],
        ["(-) Total comprobado (gastos válidos)", `$ ${money(totalEgresos)}`],
        ["(=) Monto que debería quedar de efectivo", `$ ${money(montoDeberiaQuedar)}`],
        ["Efectivo contado al cierre", `$ ${money(efectivoContadoCierre)}`],
        ["Diferencia (faltante / sobrante)", `$ ${money(diferencia)}`],
      ],
      theme: "grid",
      styles: { fontSize: 9, textColor: [31, 41, 55] },
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { halign: "right" },
      },
      margin: { left: 100, right: 14 },
    });

    const yObs = doc.lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colorTexto);
    doc.text("Observaciones / explicación de la diferencia:", 14, yObs);

    doc.setFont("helvetica", "normal");
    doc.text(observaciones || "-", 14, yObs + 6, {
      maxWidth: 180,
    });

    let yFirmas = yObs + 28;

    if (yFirmas > 260) {
      doc.addPage();
      yFirmas = 34;
    }

    const anchoPagina = 210;
    const margen = 18;
    const espacio = (anchoPagina - margen * 2) / 3;

    const firmas = [
      {
        nombre: elaboradoPor || "",
        cargo: "Elabora caja chica",
      },
      {
        nombre: revisadoPor || "",
        cargo: "Revisa",
      },
      {
        nombre: autorizadoPor || "",
        cargo: "Autoriza",
      },
    ];

    doc.setFontSize(10);

    firmas.forEach((firma, i) => {
      const x = margen + espacio * i + espacio / 2;
      doc.line(x - 28, yFirmas, x + 28, yFirmas);
      doc.setFont("helvetica", "normal");
      doc.text(firma.nombre || " ", x, yFirmas + 6, {
        align: "center",
        maxWidth: 52,
      });
      doc.setFont("helvetica", "bold");
      doc.text(firma.cargo, x, yFirmas + 12, { align: "center" });
    });

    doc.save(`CajaChica_${correlativo}.pdf`);
  };

  if (!empresa) {
    return <div style={{ padding: 20 }}>No hay empresa seleccionada</div>;
  }

  const colorDiferencia =
    Math.abs(diferencia) < 0.009
      ? "#ecfdf5"
      : diferencia > 0
      ? "#fef2f2"
      : "#fef9c3";

  const borderDiferencia =
    Math.abs(diferencia) < 0.009
      ? "#bbf7d0"
      : diferencia > 0
      ? "#fecaca"
      : "#fde68a";

  return (
    <>
      <div className="invoice-page">
        <div className="invoice-sheet">
          <div className="invoice-content">
            <div className="invoice-header">
              <div className="invoice-brand">
                <h1>Caja Chica</h1>
                <p>Control y liquidación de efectivo</p>
              </div>

              <div className="invoice-company">
                <div><strong>{empresa?.nombre || ""}</strong></div>
                <div>Liquidación de caja chica</div>
                <div>Período administrativo</div>
              </div>
            </div>

            <div className="invoice-client-row">
              <div className="invoice-client">
                <div><strong>Empresa:</strong> {empresa?.nombre || ""}</div>
                <div><strong>Período:</strong> {fechaDesde || ""} al {fechaHasta || ""}</div>
                <div><strong>Prefijo:</strong> {prefijoEmpresa || ""}</div>
              </div>

              <div className="invoice-number">{correlativo || "Caja Chica"}</div>
            </div>

            <div className="invoice-info-box">
              <div className="invoice-info-item">
                <strong>Del</strong>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                />
              </div>

              <div className="invoice-info-item">
                <strong>Al</strong>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                />
              </div>

              <div className="invoice-info-item">
                <strong>Correlativo No.</strong>
                <input
                  value={correlativoNum}
                  onChange={(e) => setCorrelativoNum(soloEntero(e.target.value))}
                />
              </div>

              <div className="invoice-info-item">
                <strong>Correlativo</strong>
                <input value={correlativo} readOnly style={{ background: "#f8f8fa" }} />
              </div>
            </div>

            <div style={ui.sectionHeader}>ARQUEO DE CAJA CHICA</div>

            <div style={ui.twoCols}>
              <div className="card" style={ui.cardPad}>
                <h3 style={ui.subtitulo}>Detalle de efectivo / billetes</h3>

                <div className="invoice-table-wrap">
                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th>Denom.</th>
                        <th>Cant.</th>
                        <th className="invoice-text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billetes.map((b, i) => (
                        <tr key={b.denom}>
                          <td>{b.denom}</td>
                          <td>
                            <input
                              value={b.cantidad}
                              onChange={(e) => setCantidadBillete(i, e.target.value)}
                            />
                          </td>
                          <td className="invoice-text-right">
                            $ {money(numero(b.denom) * numero(b.cantidad))}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2} className="invoice-text-right"><strong>TOTAL BILLETES</strong></td>
                        <td className="invoice-text-right"><strong>$ {money(totalBilletes)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card" style={ui.cardPad}>
                <h3 style={ui.subtitulo}>Detalle de efectivo / monedas</h3>

                <div className="invoice-table-wrap">
                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th>Denom.</th>
                        <th>Cant.</th>
                        <th className="invoice-text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monedas.map((m, i) => (
                        <tr key={m.denom}>
                          <td>{m.denom}</td>
                          <td>
                            <input
                              value={m.cantidad}
                              onChange={(e) => setCantidadMoneda(i, e.target.value)}
                            />
                          </td>
                          <td className="invoice-text-right">
                            $ {money(numero(m.denom) * numero(m.cantidad))}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2} className="invoice-text-right"><strong>TOTAL MONEDAS</strong></td>
                        <td className="invoice-text-right"><strong>$ {money(totalMonedas)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={ui.summaryMini}>
                  <div style={ui.summaryMiniRow}>
                    <span>Total efectivo disponible</span>
                    <strong>$ {money(totalEfectivoDisponible)}</strong>
                  </div>

                  <div style={ui.summaryMiniRow}>
                    <span>Fondo de caja chica</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fondoCajaChica}
                      onChange={(e) =>
                        setFondoCajaChica(limpiarDecimalInput(e.target.value))
                      }
                      style={{ width: 140, textAlign: "right" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={ui.sectionHeader}>LISTADO DE GASTOS</div>

            <div className="card" style={ui.cardPad}>
              <div style={{ marginBottom: 14, maxWidth: 300 }}>
                <label style={ui.label}>Saldo inicial</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(limpiarDecimalInput(e.target.value))}
                  placeholder="0.00"
                />
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="invoice-table" style={{ minWidth: 1150 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>TIPO DE DOC.</th>
                      <th>FECHA</th>
                      <th>CONCEPTO</th>
                      <th>PROVEEDOR</th>
                      <th>No. COMPROBANTE</th>
                      <th>INGRESO</th>
                      <th>EGRESO</th>
                      <th>BALANCE</th>
                      <th>ACC.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={8}><strong>SALDO INICIAL</strong></td>
                      <td className="invoice-text-right">
                        <strong>$ {money(numero(saldoInicial))}</strong>
                      </td>
                      <td></td>
                    </tr>

                    {gastosConBalance.map((g) => (
                      <tr key={g.id}>
                        <td className="invoice-text-center">{g.index}</td>
                        <td>
                          <input
                            value={g.tipoDoc}
                            onChange={(e) =>
                              actualizarGasto(g.id, "tipoDoc", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={g.fecha}
                            onChange={(e) =>
                              actualizarGasto(g.id, "fecha", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={g.concepto}
                            onChange={(e) =>
                              actualizarGasto(g.id, "concepto", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={g.proveedor}
                            onChange={(e) =>
                              actualizarGasto(g.id, "proveedor", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={g.comprobante}
                            onChange={(e) =>
                              actualizarGasto(g.id, "comprobante", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={g.ingreso}
                            onChange={(e) =>
                              actualizarGasto(g.id, "ingreso", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={g.egreso}
                            onChange={(e) =>
                              actualizarGasto(g.id, "egreso", e.target.value)
                            }
                          />
                        </td>
                        <td className="invoice-text-right">$ {money(g.balance)}</td>
                        <td className="invoice-text-center">
                          <button
                            onClick={() => eliminarFila(g.id)}
                            style={ui.btnDelete}
                            title="Eliminar fila"
                          >
                            ✖
                          </button>
                        </td>
                      </tr>
                    ))}

                    <tr>
                      <td colSpan={6}><strong>Total</strong></td>
                      <td className="invoice-text-right"><strong>$ {money(totalIngresos)}</strong></td>
                      <td className="invoice-text-right"><strong>$ {money(totalEgresos)}</strong></td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 14 }}>
                <button onClick={agregarFila} style={ui.btnOutlinePrimary}>
                  + Agregar fila
                </button>
              </div>
            </div>

            <div style={ui.sectionHeader}>LIQUIDACIÓN</div>

            <div className="card" style={ui.cardPad}>
              <div className="invoice-summary" style={{ justifyContent: "flex-end" }}>
                <table>
                  <tbody>
                    <tr>
                      <td>Saldo inicial del periodo</td>
                      <td className="invoice-text-right">$ {money(numero(saldoInicial))}</td>
                    </tr>
                    <tr>
                      <td>(+) Ingresos / reintegros (reposiciones)</td>
                      <td className="invoice-text-right">$ {money(totalIngresos)}</td>
                    </tr>
                    <tr>
                      <td>(=) Monto total disponible para gastos</td>
                      <td className="invoice-text-right">$ {money(montoTotalDisponible)}</td>
                    </tr>
                    <tr>
                      <td>(-) Total comprobado (gastos válidos)</td>
                      <td className="invoice-text-right">$ {money(totalEgresos)}</td>
                    </tr>
                    <tr>
                      <td>(=) Monto que debería quedar de efectivo</td>
                      <td className="invoice-text-right">$ {money(montoDeberiaQuedar)}</td>
                    </tr>
                    <tr>
                      <td>Efectivo contado al cierre</td>
                      <td className="invoice-text-right">$ {money(efectivoContadoCierre)}</td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          background: colorDiferencia,
                          borderColor: borderDiferencia,
                          fontWeight: 700,
                          color: "#1f2937",
                        }}
                      >
                        Diferencia (faltante / sobrante)
                      </td>
                      <td
                        className="invoice-text-right"
                        style={{
                          background: colorDiferencia,
                          borderColor: borderDiferencia,
                          fontWeight: 700,
                          color: "#1f2937",
                        }}
                      >
                        $ {money(diferencia)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={ui.cardPad}>
              <label style={ui.label}>Observaciones / explicación de la diferencia</label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={4}
              />
            </div>

            <div className="card" style={ui.cardPad}>
              <div style={ui.firmasGrid}>
                <div>
                  <label style={ui.label}>Elabora caja chica</label>
                  <input
                    value={elaboradoPor}
                    onChange={(e) => setElaboradoPor(e.target.value)}
                    placeholder="Nombre de quien elabora"
                  />
                </div>

                <div>
                  <label style={ui.label}>Revisa</label>
                  <input
                    value={revisadoPor}
                    onChange={(e) => setRevisadoPor(e.target.value)}
                    placeholder="Nombre de quien revisa"
                  />
                </div>

                <div>
                  <label style={ui.label}>Autoriza</label>
                  <input
                    value={autorizadoPor}
                    onChange={(e) => setAutorizadoPor(e.target.value)}
                    placeholder="Nombre de quien autoriza"
                  />
                </div>
              </div>
            </div>

            <div style={ui.actions} className="no-print">
              <button style={ui.btnPrimary} onClick={guardarLiquidacion}>
                {idActual ? "Actualizar" : "Guardar"}
              </button>

              <button style={ui.btnSecondary} onClick={exportarPDF}>
                Exportar PDF
              </button>

              <button style={ui.btnSecondary} onClick={exportarExcel}>
                Exportar Excel
              </button>

              <button
                style={ui.btnSecondary}
                onClick={() => prepararNuevaLiquidacion()}
              >
                Nuevo
              </button>

              <button style={ui.btnBlue} onClick={abrirHistorial}>
                📚 Ver historial
              </button>
            </div>

            <div className="invoice-footer">
              <div>
                {elaboradoPor || "Elabora caja chica"} &nbsp;&nbsp;|&nbsp;&nbsp;
                {revisadoPor || "Revisa"} &nbsp;&nbsp;|&nbsp;&nbsp;
                {autorizadoPor || "Autoriza"}
              </div>
              <small>Liquidación interna de caja chica</small>
            </div>
          </div>
        </div>
      </div>

      {mostrarHistorial && (
        <div style={ui.modalOverlay} onClick={cerrarHistorial}>
          <div style={ui.modal} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <h3 style={{ margin: 0, color: "#574866" }}>📚 Historial de Caja Chica</h3>
              <button style={ui.btnClose} onClick={cerrarHistorial}>
                ✖
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <button style={ui.btnSecondary} onClick={cargarHistorial}>
                Actualizar historial
              </button>
            </div>

            {cargandoHistorial && <p>Cargando...</p>}

            {!cargandoHistorial && historial.length === 0 && (
              <p>No hay liquidaciones guardadas.</p>
            )}

            <div style={ui.historialGrid}>
              {historial.map((liq) => (
                <div key={liq.id} style={ui.historialCard}>
                  <div style={ui.historialTitle}>{liq.correlativo}</div>
                  <div style={ui.historialText}>
                    {liq.fecha_desde || liq.fecha} al {liq.fecha_hasta || liq.fecha}
                  </div>
                  <div style={ui.historialText}>
                    Cierre: $ {money(liq.efectivo_contado_cierre)}
                  </div>

                  <div style={ui.historialActions}>
                    <button
                      style={ui.btnOutlinePrimary}
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

const ui = {
  cardPad: {
    padding: 18,
    marginBottom: 18,
  },
  sectionHeader: {
    fontWeight: 700,
    color: "#574866",
    fontSize: 16,
    margin: "18px 0 12px",
    letterSpacing: "0.5px",
  },
  subtitulo: {
    marginTop: 0,
    marginBottom: 14,
    color: "#1f2937",
    fontSize: 16,
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 18,
  },
  summaryMini: {
    marginTop: 14,
    border: "1px solid #d7dbe2",
    borderRadius: 12,
    overflow: "hidden",
    background: "#f8f8fa",
  },
  summaryMiniRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderBottom: "1px solid #d7dbe2",
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
  btnPrimary: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  btnSecondary: {
    background: "#fff",
    color: "#1f2937",
    border: "1px solid #d7dbe2",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
  },
  btnBlue: {
    background: "#574866",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  btnOutlinePrimary: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #cfc5d7",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  btnDelete: {
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
    maxWidth: 920,
    maxHeight: "85vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  btnClose: {
    border: "none",
    background: "#ececef",
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
    border: "1px solid #d7dbe2",
    borderRadius: 14,
    padding: 14,
    background: "#f8f8fa",
  },
  historialTitle: {
    fontWeight: 700,
    color: "#574866",
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
};

export default CajaChica;