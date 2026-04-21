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
  const fechaSolo = String(fecha).slice(0, 10);
  const [yyyy, mm, dd] = fechaSolo.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatearMonto(valor) {
  return Number(valor || 0).toFixed(2);
}

export default function CajaDiaria() {
  const empresa = JSON.parse(localStorage.getItem("empresa") || "null");
  const hoy = obtenerFechaLocalSV();

  const [fechaLocal, setFechaLocal] = useState(hoy);
  const [metodos, setMetodos] = useState([]);
  const [filas, setFilas] = useState([]);
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

  const [historialCajas, setHistorialCajas] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const [modalFacturacion, setModalFacturacion] = useState({
    open: false,
    filaUid: null,
  });

  useEffect(() => {
    if (!empresa?.id) {
      setMetodos([]);
      setFilas([]);
      limpiarFormularioCierre();
      setHistorialCajas([]);
      return;
    }

    cargarMetodos();
  }, [empresa?.id]);

  useEffect(() => {
    if (empresa?.id && metodos.length > 0 && fechaLocal) {
      cargarCajaDelDia(fechaLocal);
    }
  }, [empresa?.id, metodos, fechaLocal]);

  useEffect(() => {
    if (empresa?.id) {
      cargarHistorialCajas();
    }
  }, [empresa?.id, filtroDesde, filtroHasta]);

  const crearFilaVacia = (metodosActuales = metodos, nombrePaciente = "") => {
    const pagos = {};
    const referencias = {};

    metodosActuales.forEach((m) => {
      pagos[m.id] = "";
      referencias[m.id] = "";
    });

    return {
      uid: crypto.randomUUID(),
      paciente: nombrePaciente,
      pagos,
      referencias,
      venta_id: null,
      origen: "manual",
      grupoFacturacion: "",
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

  const limpiarCajaActual = () => {
    setFilas([]);
    limpiarFormularioCierre();
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
      setFilas([]);
      limpiarFormularioCierre();
      return;
    }

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
      .select(`
        id,
        paciente,
        metodo_pago_id,
        monto,
        referencia,
        venta_id,
        grupo_facturacion
      `)
      .eq("caja_diaria_id", caja.id);

    if (errorDetalle) {
      console.error(errorDetalle);
      alert("Error al cargar el detalle");
      return;
    }

    const mapa = {};

    (detalle || []).forEach((item) => {
      const nombrePaciente = item.paciente?.trim() || "Sin nombre";
      const llave = item.venta_id
        ? `${nombrePaciente}__venta__${item.venta_id}`
        : `${nombrePaciente}__manual__${item.grupo_facturacion || item.id}`;

      if (!mapa[llave]) {
        mapa[llave] = {
          ...crearFilaVacia(metodos, nombrePaciente),
          venta_id: item.venta_id || null,
          origen: item.venta_id ? "venta" : "manual",
          grupoFacturacion: item.grupo_facturacion || "",
        };
      }

      const montoActual = Number(
        mapa[llave].pagos[item.metodo_pago_id] || 0
      );

      mapa[llave].pagos[item.metodo_pago_id] =
        montoActual + Number(item.monto || 0);

      const refActual = mapa[llave].referencias[item.metodo_pago_id] || "";
      const nuevaRef = item.referencia || "";

      if (nuevaRef) {
        const refs = refActual
          ? refActual.split(" | ").map((x) => x.trim()).filter(Boolean)
          : [];

        if (!refs.includes(nuevaRef)) {
          refs.push(nuevaRef);
        }

        mapa[llave].referencias[item.metodo_pago_id] = refs.join(" | ");
      }
    });

    setFilas(Object.values(mapa));
  };

  const cargarHistorialCajas = async () => {
    if (!empresa?.id || !filtroDesde || !filtroHasta) return;

    setLoadingHistorial(true);

    const { data, error } = await supabase
      .from("cajas_diarias")
      .select(`
        id,
        fecha_local,
        cierre_realizado,
        remesa_efectivo,
        responsable_caja,
        elaborado_por,
        revisado_por,
        comentario_cierre,
        cuenta_destino_efectivo,
        numero_remesa_efectivo,
        caja_diaria_detalle (
          monto
        )
      `)
      .eq("empresa_id", empresa.id)
      .gte("fecha_local", filtroDesde)
      .lte("fecha_local", filtroHasta)
      .order("fecha_local", { ascending: false });

    setLoadingHistorial(false);

    if (error) {
      console.error(error);
      alert("Error al cargar historial de cajas");
      return;
    }

    const cajas = (data || []).map((caja) => ({
      ...caja,
      total: (caja.caja_diaria_detalle || []).reduce(
        (acc, d) => acc + Number(d.monto || 0),
        0
      ),
    }));

    setHistorialCajas(cajas);
  };

  const abrirCajaHistorial = async (fecha) => {
    setFechaLocal(fecha);
    await cargarCajaDelDia(fecha);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const irAEditarVenta = (fila) => {
    if (!fila?.venta_id) return;

    localStorage.setItem("ventaEditarRapidoId", String(fila.venta_id));
    localStorage.setItem("ventaEditarRapidoOrigen", "caja_diaria");
    localStorage.setItem("ventaEditarRapidoFechaCaja", fechaLocal);

    window.dispatchEvent(new Event("irAReporte"));
  };

  const agregarFila = () => {
    setFilas((prev) => [...prev, crearFilaVacia()]);
  };

  const eliminarFila = (index) => {
    const fila = filas[index];

    if (fila?.origen === "venta") {
      return alert("Esa fila viene de una venta. Editala desde el historial de ventas.");
    }

    const nuevas = [...filas];
    nuevas.splice(index, 1);
    setFilas(nuevas);
  };

  const actualizarPaciente = (index, valor) => {
    const nuevas = [...filas];

    if (nuevas[index]?.origen === "venta") {
      return alert("Ese registro viene de una venta. Editalo desde ventas.");
    }

    nuevas[index].paciente = valor;
    setFilas(nuevas);
  };

  const actualizarMonto = (filaIndex, metodoId, valor) => {
    const nuevas = [...filas];

    if (nuevas[filaIndex]?.origen === "venta") {
      return alert("Ese registro viene de una venta. Editalo desde ventas.");
    }

    nuevas[filaIndex].pagos[metodoId] = valor;
    setFilas(nuevas);
  };

  const actualizarReferencia = (filaIndex, metodoId, valor) => {
    const nuevas = [...filas];

    if (nuevas[filaIndex]?.origen === "venta") {
      return alert("Ese registro viene de una venta. Editalo desde ventas.");
    }

    nuevas[filaIndex].referencias[metodoId] = valor;
    setFilas(nuevas);
  };

  const abrirModalFacturacion = (filaUid) => {
    setModalFacturacion({
      open: true,
      filaUid,
    });
  };

  const cerrarModalFacturacion = () => {
    setModalFacturacion({
      open: false,
      filaUid: null,
    });
  };

  const asignarFacturacionJunta = (filaUidOrigen, filaUidDestino) => {
    if (!filaUidOrigen || !filaUidDestino || filaUidOrigen === filaUidDestino) return;

    const filaOrigen = filas.find((f) => f.uid === filaUidOrigen);
    const filaDestino = filas.find((f) => f.uid === filaUidDestino);

    const grupoExistente =
      filaOrigen?.grupoFacturacion ||
      filaDestino?.grupoFacturacion ||
      crypto.randomUUID();

    setFilas((prev) =>
      prev.map((fila) =>
        fila.uid === filaUidOrigen || fila.uid === filaUidDestino
          ? { ...fila, grupoFacturacion: grupoExistente }
          : fila
      )
    );

    cerrarModalFacturacion();
  };

  const quitarFacturacionJunta = (filaUid) => {
    setFilas((prev) =>
      prev.map((fila) =>
        fila.uid === filaUid ? { ...fila, grupoFacturacion: "" } : fila
      )
    );
  };

  const obtenerNombreRelacionFacturacion = (fila) => {
    if (!fila?.grupoFacturacion) return "";

    const relacionadas = filas.filter(
      (f) => f.uid !== fila.uid && f.grupoFacturacion === fila.grupoFacturacion
    );

    if (relacionadas.length === 0) return "";

    return relacionadas.map((r) => r.paciente || "Sin nombre").join(" + ");
  };

  const agruparDetallePorGrupo = (detalleBase) => {
    const grupos = {};

    detalleBase.forEach((item, index) => {
      const key = item.grupoFacturacion
        ? `${item.fecha}__${item.grupoFacturacion}`
        : `${item.fecha}__solo__${index}`;

      if (!grupos[key]) {
        const metodosIniciales = {};
        const refsIniciales = {};

        metodos.forEach((m) => {
          metodosIniciales[m.nombre] = 0;
          refsIniciales[m.nombre] = "";
        });

        grupos[key] = {
          fecha: item.fecha,
          paciente: [],
          origen: [],
          metodos: metodosIniciales,
          referencias: refsIniciales,
          grupoFacturacion: item.grupoFacturacion || "",
        };
      }

      if (item.paciente && !grupos[key].paciente.includes(item.paciente)) {
        grupos[key].paciente.push(item.paciente);
      }

      if (item.origen && !grupos[key].origen.includes(item.origen)) {
        grupos[key].origen.push(item.origen);
      }

      metodos.forEach((m) => {
        grupos[key].metodos[m.nombre] += Number(item.metodos?.[m.nombre] || 0);

        const ref = item.referencias?.[m.nombre] || "";
        if (ref) {
          const refs = grupos[key].referencias[m.nombre]
            ? grupos[key].referencias[m.nombre]
                .split(" | ")
                .map((x) => x.trim())
                .filter(Boolean)
            : [];

          ref
            .split(" | ")
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((r) => {
              if (!refs.includes(r)) refs.push(r);
            });

          grupos[key].referencias[m.nombre] = refs.join(" | ");
        }
      });
    });

    return Object.values(grupos).map((g) => ({
      fecha: g.fecha,
      paciente: g.paciente.join(" + "),
      origen:
        g.origen.length > 1
          ? "Mixto"
          : g.origen[0] === "venta"
          ? "Venta / CxC"
          : "Manual",
      metodos: g.metodos,
      referencias: g.referencias,
      grupoFacturacion: g.grupoFacturacion,
    }));
  };

  const guardarCaja = async () => {
    if (!empresa?.id) {
      return alert("No hay empresa seleccionada");
    }

    const filasValidas = filas.filter((fila) => fila.paciente.trim() !== "");
    const filasManual = filasValidas.filter((fila) => !fila.venta_id);
    const filasVenta = filasValidas.filter((fila) => fila.venta_id);

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

      const { error: errorEliminarDetalleManual } = await supabase
        .from("caja_diaria_detalle")
        .delete()
        .eq("caja_diaria_id", cajaId)
        .is("venta_id", null);

      if (errorEliminarDetalleManual) {
        setLoading(false);
        console.error(errorEliminarDetalleManual);
        alert("Error al reemplazar el detalle manual");
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

    const { error: errorResetGrupo } = await supabase
      .from("caja_diaria_detalle")
      .update({ grupo_facturacion: null })
      .eq("caja_diaria_id", cajaId);

    if (errorResetGrupo) {
      setLoading(false);
      console.error(errorResetGrupo);
      alert("Error al actualizar agrupaciones de facturación");
      return;
    }

    const detalleParaGuardar = [];

    filasManual.forEach((fila) => {
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
            venta_id: null,
            grupo_facturacion: fila.grupoFacturacion || null,
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

    for (const fila of filasVenta) {
      const { error: errorUpdateVentaGrupo } = await supabase
        .from("caja_diaria_detalle")
        .update({
          grupo_facturacion: fila.grupoFacturacion || null,
        })
        .eq("caja_diaria_id", cajaId)
        .eq("venta_id", fila.venta_id)
        .eq("paciente", fila.paciente.trim());

      if (errorUpdateVentaGrupo) {
        setLoading(false);
        console.error(errorUpdateVentaGrupo);
        alert("Error al guardar agrupación de una venta");
        return;
      }
    }

    setLoading(false);
    alert("Caja diaria guardada correctamente");
    await cargarCajaDelDia(fechaLocal);
    await cargarHistorialCajas();
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
          venta_id,
          grupo_facturacion,
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

    const detalleBase = [];
    const cierres = [];

    (data || []).forEach((caja) => {
      const mapaPacientes = {};

      (caja.caja_diaria_detalle || []).forEach((d) => {
        const paciente = d.paciente || "Sin nombre";
        const metodoNombre = d.metodos_pago?.nombre || "Sin método";
        const monto = Number(d.monto || 0);
        const referencia = d.referencia || "";
        const origen = d.venta_id ? "Venta / CxC" : "Manual";
        const grupoFacturacion = d.grupo_facturacion || "";

        const llave = d.venta_id
          ? `${paciente}__${d.venta_id}__${grupoFacturacion || "sin_grupo"}`
          : `${paciente}__manual__${grupoFacturacion || crypto.randomUUID()}`;

        if (!mapaPacientes[llave]) {
          mapaPacientes[llave] = {
            fecha: caja.fecha_local,
            paciente,
            origen,
            grupoFacturacion,
            metodos: {},
            referencias: {},
          };

          metodos.forEach((m) => {
            mapaPacientes[llave].metodos[m.nombre] = 0;
            mapaPacientes[llave].referencias[m.nombre] = "";
          });
        }

        mapaPacientes[llave].metodos[metodoNombre] =
          (mapaPacientes[llave].metodos[metodoNombre] || 0) + monto;

        if (referencia) {
          const actual = mapaPacientes[llave].referencias[metodoNombre] || "";
          const refs = actual
            ? actual.split(" | ").map((x) => x.trim()).filter(Boolean)
            : [];

          if (!refs.includes(referencia)) {
            refs.push(referencia);
          }

          mapaPacientes[llave].referencias[metodoNombre] = refs.join(" | ");
        }
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
        totalCaja,
      });

      detalleBase.push(...Object.values(mapaPacientes));
    });

    const detalleAgrupado = agruparDetallePorGrupo(detalleBase);

    const resumen = {};
    metodos.forEach((m) => {
      resumen[m.nombre] = 0;
    });

    detalleAgrupado.forEach((item) => {
      metodos.forEach((m) => {
        resumen[m.nombre] += Number(item.metodos[m.nombre] || 0);
      });
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
        Origen: item.origen || "",
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

      rows.push(fila);
    });

    const filaTotales = {
      Fecha: "",
      Paciente: "TOTALES",
      Origen: "",
    };

    metodos.forEach((m) => {
      filaTotales[m.nombre] = formatearMonto(
        datos.resumen.find((r) => r.metodo === m.nombre)?.total || 0
      );
    });

    filaTotales["Referencias"] = "";
    filaTotales["Total Paciente"] = formatearMonto(datos.totalGeneralResumen);

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

    doc.setFillColor(244, 240, 247);
    doc.rect(0, 0, 297, 28, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(87, 72, 102);
    doc.text("INFORME DETALLADO DE CAJA DIARIA", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Empresa: ${empresa?.nombre || "Empresa activa"}`, 14, 24);
    doc.text(
      `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(filtroHasta)}`,
      120,
      24
    );

    const head = [[
      "Fecha",
      "Paciente",
      "Origen",
      ...metodos.map((m) => m.nombre),
      "Referencias",
      "Total Paciente",
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
        item.origen || "",
        ...metodos.map((m) => `$${formatearMonto(item.metodos[m.nombre] || 0)}`),
        referenciasTexto,
        `$${formatearMonto(totalPaciente)}`,
      ];
    });

    const foot = [[
      "",
      "TOTALES",
      "",
      ...metodos.map((m) => {
        const total = datos.resumen.find((r) => r.metodo === m.nombre)?.total || 0;
        return `$${formatearMonto(total)}`;
      }),
      "",
      `$${formatearMonto(datos.totalGeneralResumen)}`,
    ]];

    autoTable(doc, {
      startY: 34,
      head,
      body,
      foot,
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: [31, 41, 55],
      },
      headStyles: {
        fillColor: [107, 90, 122],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [244, 240, 247],
        textColor: [87, 72, 102],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252],
      },
      bodyStyles: {
        lineColor: [226, 232, 240],
      },
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

    doc.setFillColor(244, 240, 247);
    doc.rect(0, 0, 210, 28, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(87, 72, 102);
    doc.text("INFORME RESUMEN DE CAJA DIARIA", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Empresa: ${empresa?.nombre || "Empresa activa"}`, 14, 24);
    doc.text(
      `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(filtroHasta)}`,
      110,
      24
    );

    autoTable(doc, {
      startY: 34,
      head: [["Método de Pago", "Total"]],
      body: datos.resumen.map((item) => [
        item.metodo,
        `$${formatearMonto(item.total)}`,
      ]),
      foot: [["TOTAL GENERAL", `$${formatearMonto(datos.totalGeneralResumen)}`]],
      styles: {
        fontSize: 10,
        cellPadding: 4,
        textColor: [31, 41, 55],
      },
      headStyles: {
        fillColor: [107, 90, 122],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [244, 240, 247],
        textColor: [87, 72, 102],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252],
      },
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
        totalCaja: totalGeneral,
      };

    doc.setFillColor(244, 240, 247);
    doc.rect(0, 0, 210, 30, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(87, 72, 102);
    doc.text("INFORME DE CIERRE DE CAJA DIARIA", 105, 14, { align: "center" });

    doc.setFontSize(12);
    doc.text(empresa?.nombre || "EMPRESA ACTIVA", 105, 22, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Fecha de caja: ${formatearFecha(cajaActual.fecha)}`, 14, 38);
    doc.text(`Responsable de caja: ${cajaActual.responsableCaja || "-"}`, 14, 44);

    autoTable(doc, {
      startY: 50,
      head: [["Resumen por método de pago", "Monto"]],
      body: datos.resumen.map((item) => [
        item.metodo,
        `$${formatearMonto(item.total)}`,
      ]),
      foot: [["TOTAL GENERAL DEL EFECTIVO", `$${formatearMonto(datos.totalGeneralResumen)}`]],
      theme: "grid",
      styles: {
        fontSize: 10,
        cellPadding: 4,
        textColor: [31, 41, 55],
      },
      headStyles: {
        fillColor: [107, 90, 122],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [244, 240, 247],
        textColor: [87, 72, 102],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252],
      },
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
        ["Comentario de cierre", cajaActual.comentarioCierre || "-"],
      ],
      theme: "grid",
      styles: {
        fontSize: 9,
        cellPadding: 4,
        textColor: [31, 41, 55],
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 60 },
        1: { cellWidth: 120 },
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252],
      },
    });

    let yFirmas = doc.lastAutoTable.finalY + 28;
    if (yFirmas > 250) {
      doc.addPage();
      yFirmas = 40;
    }

    doc.setDrawColor(156, 163, 175);
    doc.line(25, yFirmas, 85, yFirmas);
    doc.line(125, yFirmas, 185, yFirmas);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);

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
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Control del día</h3>
            <p style={styles.sectionSubtitle}>
              Seleccioná la fecha y administrá los registros manuales.
            </p>
          </div>

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
          </div>

          <div style={styles.actionGridSimple}>
            <button type="button" onClick={agregarFila} style={styles.primarySoftBtn}>
              + Manual
            </button>

            <button
              type="button"
              onClick={limpiarCajaActual}
              style={styles.clearBtn}
            >
              Limpiar formulario
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Detalle de caja</h3>
            <p style={styles.sectionSubtitle}>
              Registrá cobros, referencias y agrupaciones para facturación.
            </p>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={{ ...styles.th, minWidth: 190 }}>Paciente</th>
                  <th style={{ ...styles.th, minWidth: 120 }}>Origen</th>
                  {metodos.map((metodo) => (
                    <th key={metodo.id} style={{ ...styles.th, minWidth: 190 }}>
                      {metodo.nombre}
                    </th>
                  ))}
                  <th style={{ ...styles.th, minWidth: 260 }}>Acción</th>
                </tr>
              </thead>

              <tbody>
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={metodos.length + 3} style={styles.emptyTd}>
                      No hay registros para esta fecha
                    </td>
                  </tr>
                )}

                {filas.map((fila, index) => (
                  <tr key={fila.uid || index}>
                    <td style={styles.tdTop}>
                      <input
                        type="text"
                        value={fila.paciente}
                        onChange={(e) => actualizarPaciente(index, e.target.value)}
                        placeholder="Nombre del paciente"
                        style={styles.input}
                        disabled={fila.origen === "venta"}
                      />
                    </td>

                    <td style={styles.tdCenter}>
                      <span
                        style={{
                          ...styles.badge,
                          background:
                            fila.origen === "venta" ? "#eefcf3" : "#f4f0f7",
                          color:
                            fila.origen === "venta" ? "#0f7a4d" : "#574866",
                          borderColor:
                            fila.origen === "venta" ? "#c7eed5" : "#d3c7dd",
                        }}
                      >
                        {fila.origen === "venta" ? "Venta / CxC" : "Manual"}
                      </span>
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
                            disabled={fila.origen === "venta"}
                          />
                          <input
                            type="text"
                            value={fila.referencias[metodo.id]}
                            onChange={(e) =>
                              actualizarReferencia(index, metodo.id, e.target.value)
                            }
                            style={styles.subInput}
                            placeholder="Voucher / referencia"
                            disabled={fila.origen === "venta"}
                          />
                        </div>
                      </td>
                    ))}

                    <td style={styles.tdTop}>
                      <div style={styles.actionCell}>
                        <button
                          type="button"
                          onClick={() => abrirModalFacturacion(fila.uid)}
                          style={styles.linkBtn}
                        >
                          {fila.grupoFacturacion ? "Cambiar agrupación" : "Facturar junto"}
                        </button>

                        {fila.grupoFacturacion ? (
                          <div style={styles.linkInfo}>
                            Con: {obtenerNombreRelacionFacturacion(fila) || "Grupo asignado"}
                          </div>
                        ) : (
                          <div style={styles.linkInfoMuted}>Sin agrupación</div>
                        )}

                        {fila.grupoFacturacion && (
                          <button
                            type="button"
                            onClick={() => quitarFacturacionJunta(fila.uid)}
                            style={styles.unlinkBtn}
                          >
                            Quitar vínculo
                          </button>
                        )}

                        {fila.origen === "venta" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => irAEditarVenta(fila)}
                              style={styles.editSourceBtn}
                            >
                              Ir a editar
                            </button>

                            <button
                              type="button"
                              onClick={() => eliminarFila(index)}
                              style={{
                                ...styles.deleteBtn,
                                opacity: 0.55,
                                cursor: "not-allowed",
                              }}
                            >
                              Eliminar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => eliminarFila(index)}
                            style={styles.deleteBtn}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr style={styles.tfootRow}>
                  <td style={styles.totalTdLabel}>Totales</td>
                  <td style={styles.totalTdCenter}>—</td>
                  {metodos.map((metodo) => (
                    <td key={metodo.id} style={styles.totalTd}>
                      ${Number(totalesPorMetodo[metodo.id] || 0).toFixed(2)}
                    </td>
                  ))}
                  <td style={styles.totalTdCenter}>—</td>
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
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Cierre de caja</h3>
            <p style={styles.sectionSubtitle}>
              Completá la información final del cierre diario.
            </p>
          </div>

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
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Historial de cajas</h3>
            <p style={styles.sectionSubtitle}>
              Consultá y reabrí cajas anteriores.
            </p>
          </div>

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

          <div style={styles.historialWrap}>
            <table style={styles.historialTable}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={styles.th}>Fecha</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Cierre</th>
                  <th style={styles.th}>Responsable</th>
                  <th style={styles.th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistorial ? (
                  <tr>
                    <td colSpan="5" style={styles.emptyTd}>Cargando historial...</td>
                  </tr>
                ) : historialCajas.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={styles.emptyTd}>No hay cajas en ese rango</td>
                  </tr>
                ) : (
                  historialCajas.map((caja) => (
                    <tr key={caja.id}>
                      <td style={styles.tdCenter}>{formatearFecha(caja.fecha_local)}</td>
                      <td style={styles.tdCenter}>${formatearMonto(caja.total)}</td>
                      <td style={styles.tdCenter}>
                        <span
                          style={{
                            ...styles.badge,
                            background: caja.cierre_realizado ? "#eefcf3" : "#f8f8fa",
                            color: caja.cierre_realizado ? "#0f7a4d" : "#475569",
                            borderColor: caja.cierre_realizado ? "#c7eed5" : "#d7dbe2",
                          }}
                        >
                          {caja.cierre_realizado ? "Sí" : "No"}
                        </span>
                      </td>
                      <td style={styles.tdCenter}>
                        {caja.responsable_caja || "-"}
                      </td>
                      <td style={styles.tdCenter}>
                        <button
                          type="button"
                          onClick={() => abrirCajaHistorial(caja.fecha_local)}
                          style={styles.openBtn}
                        >
                          Abrir / Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Informes</h3>
            <p style={styles.sectionSubtitle}>
              Exportá detalle, resumen o cierre profesional.
            </p>
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

      {modalFacturacion.open && (
        <div style={styles.modalOverlay} onClick={cerrarModalFacturacion}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeaderSimple}>
              <div>
                <h3 style={styles.modalTitle}>Facturar junto</h3>
                <p style={styles.modalText}>
                  Elegí con cuál otra fila querés agrupar este pago para la exportación.
                </p>
              </div>

              <button type="button" onClick={cerrarModalFacturacion} style={styles.modalCloseBtn}>
                ✕
              </button>
            </div>

            <div style={styles.modalList}>
              {filas
                .filter((f) => f.uid !== modalFacturacion.filaUid)
                .map((f) => (
                  <button
                    key={f.uid}
                    type="button"
                    onClick={() => asignarFacturacionJunta(modalFacturacion.filaUid, f.uid)}
                    style={styles.modalOptionBtn}
                  >
                    <strong>{f.paciente || "Sin nombre"}</strong>
                    <span style={styles.modalOptionSub}>
                      {f.origen === "venta" ? "Venta / CxC" : "Manual"}
                    </span>
                  </button>
                ))}

              {filas.filter((f) => f.uid !== modalFacturacion.filaUid).length === 0 && (
                <div style={styles.emptyTd}>No hay otra fila disponible para agrupar.</div>
              )}
            </div>
          </div>
        </div>
      )}
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
    alignItems: "center",
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

  companyPill: {
    margin: "10px 0 0 0",
    color: "#574866",
    fontSize: "14px",
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    padding: "8px 12px",
    borderRadius: "12px",
    display: "inline-block",
  },

  totalBadge: {
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    borderRadius: "18px",
    padding: "14px 18px",
    minWidth: "180px",
  },

  totalBadgeLabel: {
    display: "block",
    fontSize: "12px",
    color: "#6b7280",
    marginBottom: "4px",
  },

  totalBadgeValue: {
    fontSize: "26px",
    color: "#574866",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  cardHeader: {
    marginBottom: 14,
  },

  sectionTitleSmall: {
    margin: 0,
    fontSize: "20px",
    color: "#1f2937",
  },

  sectionSubtitle: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  topGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "14px",
    marginTop: "14px",
  },

  actionGridSimple: {
    marginTop: "14px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
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
    padding: "12px 14px",
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
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "14px",
    resize: "vertical",
  },

  primarySoftBtn: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  clearBtn: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "1300px",
  },

  historialWrap: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
  },

  historialTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "700px",
  },

  theadRow: {
    background: "#f4f0f7",
  },

  th: {
    padding: "14px 12px",
    textAlign: "center",
    color: "#574866",
    fontWeight: "700",
    fontSize: "14px",
    borderBottom: "1px solid #e2e8f0",
  },

  tdTop: {
    padding: "12px",
    borderBottom: "1px solid #edf2f7",
    verticalAlign: "top",
    background: "#fff",
  },

  tdCenter: {
    padding: "12px",
    borderBottom: "1px solid #edf2f7",
    textAlign: "center",
    verticalAlign: "middle",
    background: "#fff",
  },

  cellStack: {
    display: "grid",
    gap: "8px",
  },

  actionCell: {
    display: "grid",
    gap: "8px",
  },

  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid transparent",
  },

  editSourceBtn: {
    background: "#e0f2fe",
    color: "#075985",
    border: "1px solid #bae6fd",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  linkBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  unlinkBtn: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  linkInfo: {
    fontSize: "12px",
    color: "#574866",
    background: "#f8f4fb",
    border: "1px solid #e4d9ee",
    borderRadius: "10px",
    padding: "8px 10px",
  },

  linkInfoMuted: {
    fontSize: "12px",
    color: "#64748b",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "8px 10px",
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
    color: "#574866",
    borderTop: "1px solid #e2e8f0",
    background: "#f9fafb",
  },

  totalTd: {
    padding: "14px 12px",
    fontWeight: "700",
    color: "#574866",
    textAlign: "right",
    borderTop: "1px solid #e2e8f0",
    background: "#f9fafb",
  },

  totalTdCenter: {
    padding: "14px 12px",
    fontWeight: "700",
    color: "#574866",
    textAlign: "center",
    borderTop: "1px solid #e2e8f0",
    background: "#f9fafb",
  },

  deleteBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  openBtn: {
    background: "#e0f2fe",
    color: "#075985",
    border: "1px solid #bae6fd",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  saveBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "12px 18px",
    cursor: "pointer",
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
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  reportBtnExcel: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  reportBtnPdf2: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  reportBtnExcel2: {
    background: "#e0f2fe",
    color: "#0369a1",
    border: "1px solid #bae6fd",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
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

  modalBox: {
    width: "100%",
    maxWidth: "560px",
    background: "#fff",
    borderRadius: "20px",
    border: "1px solid #d7dbe2",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
    padding: "18px",
  },

  modalHeaderSimple: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "14px",
  },

  modalTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "24px",
    fontWeight: "700",
  },

  modalText: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  modalCloseBtn: {
    background: "#e2e8f0",
    border: "none",
    borderRadius: "10px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "700",
  },

  modalList: {
    display: "grid",
    gap: "10px",
    maxHeight: "380px",
    overflowY: "auto",
  },

  modalOptionBtn: {
    width: "100%",
    textAlign: "left",
    display: "grid",
    gap: "4px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "12px 14px",
    cursor: "pointer",
  },

  modalOptionSub: {
    fontSize: "12px",
    color: "#64748b",
  },
};