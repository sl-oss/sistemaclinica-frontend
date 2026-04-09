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
  return new Date().toLocaleString("en-CA", {
    timeZone: "America/El_Salvador",
  }).slice(0, 10);
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
  nombrePaciente,
  pagosValidos,
  fechaLocal,
}) {
  if (!nombrePaciente || pagosValidos.length === 0) return;

  const fechaSolo = fechaLocal.slice(0, 10);

  let cajaId = null;

  const { data: cajaExistente, error: errorBuscarCaja } = await supabase
    .from("cajas_diarias")
    .select("*")
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
          fecha: fechaLocal,
          fecha_local: fechaSolo,
          observacion: "",
        },
      ])
      .select()
      .single();

    if (errorCrearCaja) {
      console.error(errorCrearCaja);
      throw new Error("Error al crear caja diaria");
    }

    cajaId = nuevaCaja.id;
  }

  const detalleCaja = pagosValidos.map((p) => ({
    caja_diaria_id: cajaId,
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

function Deudas() {
  const [ventas, setVentas] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);
  const [ventaAbierta, setVentaAbierta] = useState(null);
  const [pagos, setPagos] = useState([
    { metodo_pago_id: "", monto: "", referencia: "" },
  ]);
  const [guardando, setGuardando] = useState(false);

  const empresa = JSON.parse(localStorage.getItem("empresa") || "null");

  useEffect(() => {
    if (empresa) {
      obtenerMetodosPago();
      obtenerCuentasPorCobrar();
    }
  }, []);

  const obtenerMetodosPago = async () => {
    const { data, error } = await supabase
      .from("metodos_pago")
      .select("*")
      .eq("activo", true)
      .order("orden", { ascending: true });

    if (error) {
      console.error(error);
      return alert("Error al cargar métodos de pago");
    }

    setMetodosPago(data || []);
  };

  const obtenerCuentasPorCobrar = async () => {
    const { data, error } = await supabase
      .from("ventas")
      .select("*, clientes(nombre), venta_pagos(monto)")
      .eq("empresa_id", empresa.id)
      .neq("estado", "pagado")
      .order("fecha_local", { ascending: false });

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

      return {
        ...venta,
        abonado,
        saldo,
        ha_abonado: abonado > 0 ? "Sí" : "No",
        dias_mora: diasMora,
        antiguedad,
      };
    });

    setVentas(ventasConSaldo.filter((v) => v.saldo > 0));
  };

  const abrirCobro = (venta) => {
    setVentaAbierta(venta);
    setPagos([{ metodo_pago_id: "", monto: "", referencia: "" }]);
  };

  const cerrarCobro = () => {
    setVentaAbierta(null);
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

  const exportarCxcExcel = () => {
    if (ventas.length === 0) {
      return alert("No hay cuentas por cobrar para exportar");
    }

    const rows = [
      {
        Cliente: empresa?.nombre || "Empresa activa",
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
        Cliente: `Fecha de emisión: ${formatearFecha(obtenerFechaLocalSV())}`,
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

    XLSX.writeFile(
      wb,
      `Reporte_CxC_${obtenerFechaLocalSV()}.xlsx`
    );
  };

  const exportarCxcPDF = () => {
    if (ventas.length === 0) {
      return alert("No hay cuentas por cobrar para exportar");
    }

    const totalSaldo = ventas.reduce(
      (acc, item) => acc + Number(item.saldo || 0),
      0
    );

    const doc = new jsPDF("landscape");

    doc.setFontSize(16);
    doc.text("Reporte de Cuentas por Cobrar", 14, 15);

    doc.setFontSize(11);
    doc.text(`${empresa?.nombre || "Empresa activa"}`, 14, 22);

    doc.setFontSize(10);
    doc.text(`Fecha de emisión: ${formatearFecha(obtenerFechaLocalSV())}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [[
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
        `$${totalSaldo.toFixed(2)}`,
        "",
        "",
      ]],
      styles: {
        fontSize: 9,
      },
      headStyles: {
        fillColor: [39, 67, 98],
      },
      footStyles: {
        fillColor: [232, 240, 248],
        textColor: 20,
      },
    });

    doc.save(`Reporte_CxC_${obtenerFechaLocalSV()}.pdf`);
  };

  const registrarPago = async () => {
    if (!ventaAbierta) return;

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

    const pagosParaGuardar = pagosValidos.map((p) => ({
      venta_id: ventaAbierta.id,
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
      .eq("id", ventaAbierta.id);

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
            <h1 style={styles.title}>Cuentas por Cobrar</h1>
            <p style={styles.subtitle}>
              Control de saldos pendientes, abonos y reporte de antigüedad.
            </p>
          </div>
        </div>

        <div style={styles.reportCard}>
          <div>
            <h2 style={styles.reportTitle}>Reporte CxC</h2>
            <p style={styles.reportText}>
              Exportá el listado completo de clientes que deben, con antigüedad, abonos y saldo.
            </p>
          </div>

          <div style={styles.reportButtons}>
            <button type="button" style={styles.pdfBtn} onClick={exportarCxcPDF}>
              PDF CxC
            </button>

            <button type="button" style={styles.excelBtn} onClick={exportarCxcExcel}>
              Excel CxC
            </button>
          </div>
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
    padding: "22px",
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
  reportCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.04)",
  },
  reportTitle: {
    margin: 0,
    fontSize: "24px",
    color: "#10243e",
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
    background: "#ffe2e2",
    color: "#b42318",
    border: "1px solid #ffc7c7",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },
  excelBtn: {
    background: "#e3f8eb",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },
  emptyBox: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "20px",
    color: "#64748b",
    textAlign: "center",
  },
  listaVentas: {
    display: "grid",
    gap: "14px",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "16px",
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
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
    color: "#0f172a",
  },
  estadoBadge: {
    marginTop: "6px",
    display: "inline-block",
    background: "#eef2ff",
    color: "#4338ca",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "600",
  },
  btnCobrar: {
    padding: "10px 14px",
    borderRadius: "12px",
    border: "none",
    background: "#0ea5e9",
    color: "white",
    cursor: "pointer",
    fontWeight: "600",
  },
  cardResumen: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "10px",
  },
  resumenItem: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
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
    color: "#0f172a",
  },
  modalSubtitle: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },
  btnCerrar: {
    border: "none",
    background: "#f1f5f9",
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
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
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
    color: "#1e293b",
  },
  btnAgregar: {
    background: "#e0f2fe",
    color: "#0369a1",
    border: "1px solid #bae6fd",
    borderRadius: "12px",
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
  pagosLista: {
    display: "grid",
    gap: "12px",
  },
  pagoCard: {
    border: "1px solid #e2e8f0",
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
    fontWeight: "600",
  },
  totalesBox: {
    marginTop: "18px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
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
    color: "#0f172a",
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
    fontWeight: "600",
  },
  btnGuardar: {
    padding: "11px 16px",
    borderRadius: "12px",
    border: "none",
    background: "#16a34a",
    color: "white",
    cursor: "pointer",
    fontWeight: "600",
  },
};

export default Deudas;