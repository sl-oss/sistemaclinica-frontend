import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function obtenerFechaLocalSV() {
  return new Date().toLocaleString("en-CA", {
    timeZone: "America/El_Salvador",
  }).slice(0, 10);
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
  const solo = String(fecha).slice(0, 10);
  const [yyyy, mm, dd] = solo.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatearFechaHora(fecha) {
  if (!fecha) return "";
  return new Date(fecha).toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
  });
}

async function obtenerOCrearCaja({ empresaId, fechaLocal }) {
  const fechaSolo = String(fechaLocal).slice(0, 10);

  const { data: cajaExistente, error: errorBuscar } = await supabase
    .from("cajas_diarias")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("fecha_local", fechaSolo)
    .maybeSingle();

  if (errorBuscar) throw errorBuscar;
  if (cajaExistente) return cajaExistente.id;

  const { data: nuevaCaja, error: errorCrear } = await supabase
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

  if (errorCrear) throw errorCrear;
  return nuevaCaja.id;
}

function Reporte() {
  const empresa = JSON.parse(localStorage.getItem("empresa") || "null");

  const [ventas, setVentas] = useState([]);
  const [items, setItems] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);

  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  const [ventaEditando, setVentaEditando] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [eliminandoVenta, setEliminandoVenta] = useState(false);

  const [editFecha, setEditFecha] = useState(obtenerFechaLocalSV());
  const [editClienteId, setEditClienteId] = useState("");
  const [editEstado, setEditEstado] = useState("pagado");
  const [editItems, setEditItems] = useState([]);
  const [editPagos, setEditPagos] = useState([
    { metodo_pago_id: "", monto: "", referencia: "" },
  ]);
  const [busquedaItem, setBusquedaItem] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  useEffect(() => {
    if (!empresa?.id) return;
    obtenerVentas();
    obtenerItems();
    obtenerClientes();
    obtenerMetodosPago();
  }, []);

  useEffect(() => {
    if (!ventas.length) return;

    const ventaRapidaId = localStorage.getItem("ventaEditarRapidoId");
    if (!ventaRapidaId) return;

    const ventaEncontrada = ventas.find(
      (v) => String(v.id) === String(ventaRapidaId)
    );

    if (ventaEncontrada) {
      abrirEdicion(ventaEncontrada);
      localStorage.removeItem("ventaEditarRapidoId");
      localStorage.removeItem("ventaEditarRapidoOrigen");
      localStorage.removeItem("ventaEditarRapidoFechaCaja");
    }
  }, [ventas]);

  const obtenerVentas = async () => {
    if (!empresa?.id) return;

    let query = supabase
      .from("ventas")
      .select(`
        *,
        clientes(id, nombre),
        detalle_venta(
          id,
          item_id,
          cantidad,
          precio,
          items(id, nombre, tipo)
        ),
        venta_pagos(
          id,
          metodo_pago_id,
          monto,
          referencia,
          fecha_local,
          metodos_pago(nombre)
        )
      `)
      .eq("empresa_id", empresa.id)
      .order("fecha_local", { ascending: false });

    if (fechaInicio) {
      query = query.gte("fecha_local", `${fechaInicio}T00:00:00`);
    }

    if (fechaFin) {
      query = query.lte("fecha_local", `${fechaFin}T23:59:59`);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return alert("Error al cargar ventas");
    }

    setVentas(data || []);
  };

  const obtenerItems = async () => {
    if (!empresa?.id) return;

    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setItems(data || []);
  };

  const obtenerClientes = async () => {
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

  const obtenerMetodosPago = async () => {
    if (!empresa?.id) return;

    const { data, error } = await supabase
      .from("metodos_pago")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("activo", true)
      .order("orden", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setMetodosPago(data || []);
  };

  const totalGeneral = useMemo(() => {
    return ventas.reduce((sum, v) => sum + Number(v.total || 0), 0);
  }, [ventas]);

  const abrirEdicion = (venta) => {
    setVentaEditando(venta);
    setEditFecha(String(venta.fecha_local || "").slice(0, 10));
    setEditClienteId(venta.cliente_id || "");
    setEditEstado(venta.estado || "pendiente");

    const detalle = (venta.detalle_venta || []).map((d) => ({
      item_id: d.item_id,
      nombre: d.items?.nombre || "",
      tipo: d.items?.tipo || "producto",
      cantidad: Number(d.cantidad || 0),
      precio: Number(d.precio || 0),
    }));

    const pagos = (venta.venta_pagos || []).length
      ? venta.venta_pagos.map((p) => ({
          metodo_pago_id: p.metodo_pago_id ? String(p.metodo_pago_id) : "",
          monto: Number(p.monto || 0),
          referencia: p.referencia || "",
        }))
      : [{ metodo_pago_id: "", monto: "", referencia: "" }];

    setEditItems(detalle);
    setEditPagos(pagos);
    setBusquedaItem("");
    setFiltroTipo("todos");
  };

  const cerrarEdicion = () => {
    if (guardandoEdicion || eliminandoVenta) return;
    setVentaEditando(null);
    setEditFecha(obtenerFechaLocalSV());
    setEditClienteId("");
    setEditEstado("pagado");
    setEditItems([]);
    setEditPagos([{ metodo_pago_id: "", monto: "", referencia: "" }]);
    setBusquedaItem("");
    setFiltroTipo("todos");
  };

  const agregarItemEdicion = (item) => {
    const existe = editItems.find((i) => i.item_id === item.id);

    if (existe) {
      setEditItems((prev) =>
        prev.map((i) =>
          i.item_id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i
        )
      );
    } else {
      setEditItems((prev) => [
        ...prev,
        {
          item_id: item.id,
          nombre: item.nombre,
          tipo: item.tipo,
          cantidad: 1,
          precio: Number(item.precio || 0),
        },
      ]);
    }
  };

  const cambiarCantidadEdit = (itemId, cantidad) => {
    if (cantidad <= 0) {
      setEditItems((prev) => prev.filter((i) => i.item_id !== itemId));
      return;
    }

    setEditItems((prev) =>
      prev.map((i) => (i.item_id === itemId ? { ...i, cantidad } : i))
    );
  };

  const cambiarPrecioEdit = (itemId, precio) => {
    setEditItems((prev) =>
      prev.map((i) => (i.item_id === itemId ? { ...i, precio } : i))
    );
  };

  const eliminarItemEdit = (itemId) => {
    setEditItems((prev) => prev.filter((i) => i.item_id !== itemId));
  };

  const agregarFilaPagoEdit = () => {
    setEditPagos((prev) => [
      ...prev,
      { metodo_pago_id: "", monto: "", referencia: "" },
    ]);
  };

  const eliminarFilaPagoEdit = (index) => {
    const nuevos = editPagos.filter((_, i) => i !== index);
    setEditPagos(
      nuevos.length
        ? nuevos
        : [{ metodo_pago_id: "", monto: "", referencia: "" }]
    );
  };

  const actualizarPagoEdit = (index, campo, valor) => {
    const nuevos = [...editPagos];
    nuevos[index][campo] = valor;
    setEditPagos(nuevos);
  };

  const totalEditado = useMemo(() => {
    return editItems.reduce(
      (sum, i) => sum + Number(i.precio || 0) * Number(i.cantidad || 0),
      0
    );
  }, [editItems]);

  const totalPagadoEdit = useMemo(() => {
    return editPagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
  }, [editPagos]);

  const saldoEditado = useMemo(() => {
    const saldo = totalEditado - totalPagadoEdit;
    return saldo > 0 ? saldo : 0;
  }, [totalEditado, totalPagadoEdit]);

  const itemsDisponibles = items.filter((item) => {
    const coincideBusqueda = item.nombre
      .toLowerCase()
      .includes(busquedaItem.toLowerCase());

    const coincideTipo = filtroTipo === "todos" || item.tipo === filtroTipo;

    return coincideBusqueda && coincideTipo;
  });

  const exportarPDF = () => {
    if (ventas.length === 0) return alert("No hay ventas para exportar");

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
    doc.text("Reporte de Ventas", 14, 18);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colorTexto);
    doc.setFontSize(10);
    doc.text(`Empresa: ${empresa?.nombre || "Empresa activa"}`, 14, 25);

    const periodoTexto =
      fechaInicio || fechaFin
        ? `Período: ${fechaInicio ? formatearFecha(fechaInicio) : "Inicio"} al ${
            fechaFin ? formatearFecha(fechaFin) : "Hoy"
          }`
        : "Período: Todas las ventas";

    doc.text(periodoTexto, 14, 31);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colorPrincipal);
    doc.setFontSize(16);
    doc.text("VENTAS", 283, 18, { align: "right" });

    const body = ventas.map((v) => {
      const detalle = (v.detalle_venta || [])
        .map((d) => `${d.items?.nombre || "Item"} x${d.cantidad}`)
        .join(", ");

      const pagos = (v.venta_pagos || [])
        .map(
          (p) =>
            `${p.metodos_pago?.nombre || "Método"}: $${Number(
              p.monto || 0
            ).toFixed(2)}`
        )
        .join(" | ");

      return [
        formatearFechaHora(v.fecha_local),
        v.clientes?.nombre || "Consumidor final",
        detalle || "-",
        pagos || "-",
        v.estado || "",
        `$${Number(v.total || 0).toFixed(2)}`,
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [[
        "Fecha",
        "Cliente",
        "Detalle",
        "Pagos",
        "Estado",
        "Total",
      ]],
      body,
      foot: [[
        "",
        "",
        "",
        "",
        "TOTAL",
        `$${Number(totalGeneral || 0).toFixed(2)}`,
      ]],
      theme: "grid",
      styles: {
        fontSize: 8,
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
        0: { cellWidth: 34 },
        1: { cellWidth: 42 },
        2: { cellWidth: 78 },
        3: { cellWidth: 78 },
        4: { cellWidth: 24, halign: "center" },
        5: { cellWidth: 24, halign: "right" },
      },
    });

    doc.save("reporte_ventas.pdf");
  };

  const guardarEdicion = async () => {
    if (!ventaEditando || !empresa?.id) return;
    if (editItems.length === 0) return alert("La venta debe tener al menos un item");

    const pagosValidos = editPagos.filter(
      (p) =>
        p.metodo_pago_id &&
        p.monto !== "" &&
        p.monto !== null &&
        Number(p.monto) > 0
    );

    if (totalPagadoEdit > totalEditado) {
      return alert("El total pagado no puede ser mayor al total");
    }

    if (editEstado === "pagado" && totalPagadoEdit < totalEditado) {
      return alert("Si la venta queda pagada, debés completar el total");
    }

    const estadoFinal =
      totalPagadoEdit >= totalEditado && totalEditado > 0
        ? "pagado"
        : totalPagadoEdit > 0
        ? "parcial"
        : "pendiente";

    setGuardandoEdicion(true);

    try {
      const detalleAnterior = (ventaEditando.detalle_venta || []).map((d) => ({
        item_id: d.item_id,
        cantidad: Number(d.cantidad || 0),
      }));

      const mapaAnterior = {};
      detalleAnterior.forEach((d) => {
        mapaAnterior[d.item_id] = (mapaAnterior[d.item_id] || 0) + d.cantidad;
      });

      const mapaNuevo = {};
      editItems.forEach((d) => {
        mapaNuevo[d.item_id] = (mapaNuevo[d.item_id] || 0) + Number(d.cantidad || 0);
      });

      const todosLosItemIds = Array.from(
        new Set([...Object.keys(mapaAnterior), ...Object.keys(mapaNuevo)])
      );

      const fechaNuevaCompleta = `${editFecha}T12:00:00`;

      const { error: errorVenta } = await supabase
        .from("ventas")
        .update({
          cliente_id: editClienteId || null,
          total: Number(totalEditado || 0),
          estado: estadoFinal,
          fecha_local: fechaNuevaCompleta,
          fecha: fechaNuevaCompleta,
        })
        .eq("id", ventaEditando.id)
        .eq("empresa_id", empresa.id);

      if (errorVenta) throw errorVenta;

      const { error: errorDeleteDetalle } = await supabase
        .from("detalle_venta")
        .delete()
        .eq("venta_id", ventaEditando.id);

      if (errorDeleteDetalle) throw errorDeleteDetalle;

      const nuevoDetalle = editItems.map((i) => ({
        venta_id: ventaEditando.id,
        item_id: i.item_id,
        cantidad: Number(i.cantidad || 0),
        precio: Number(i.precio || 0),
      }));

      const { error: errorInsertDetalle } = await supabase
        .from("detalle_venta")
        .insert(nuevoDetalle);

      if (errorInsertDetalle) throw errorInsertDetalle;

      const { error: errorDeletePagos } = await supabase
        .from("venta_pagos")
        .delete()
        .eq("venta_id", ventaEditando.id);

      if (errorDeletePagos) throw errorDeletePagos;

      if (pagosValidos.length > 0) {
        const pagosGuardar = pagosValidos.map((p) => ({
          venta_id: ventaEditando.id,
          empresa_id: empresa.id,
          metodo_pago_id: Number(p.metodo_pago_id),
          monto: Number(p.monto),
          referencia: p.referencia?.trim() || null,
          fecha_local: fechaNuevaCompleta,
        }));

        const { error: errorInsertPagos } = await supabase
          .from("venta_pagos")
          .insert(pagosGuardar);

        if (errorInsertPagos) throw errorInsertPagos;
      }

      const { error: errorDeleteCaja } = await supabase
        .from("caja_diaria_detalle")
        .delete()
        .eq("venta_id", ventaEditando.id);

      if (errorDeleteCaja) throw errorDeleteCaja;

      if (pagosValidos.length > 0) {
        const cajaId = await obtenerOCrearCaja({
          empresaId: empresa.id,
          fechaLocal: fechaNuevaCompleta,
        });

        const clienteObj = clientes.find(
          (c) => String(c.id) === String(editClienteId)
        );

        const nombrePaciente = clienteObj?.nombre || "Cliente de contado";

        const detalleCaja = pagosValidos.map((p) => ({
          caja_diaria_id: cajaId,
          venta_id: ventaEditando.id,
          paciente: nombrePaciente,
          metodo_pago_id: Number(p.metodo_pago_id),
          monto: Number(p.monto),
          referencia: p.referencia?.trim() || null,
        }));

        const { error: errorInsertCaja } = await supabase
          .from("caja_diaria_detalle")
          .insert(detalleCaja);

        if (errorInsertCaja) throw errorInsertCaja;
      }

      for (const itemId of todosLosItemIds) {
        const cantidadAnterior = Number(mapaAnterior[itemId] || 0);
        const cantidadNueva = Number(mapaNuevo[itemId] || 0);
        const diferencia = cantidadNueva - cantidadAnterior;

        const itemInfo = items.find((it) => String(it.id) === String(itemId));
        if (!itemInfo || itemInfo.tipo !== "producto" || diferencia === 0) continue;

        const ajusteStock = -diferencia;
        const nuevoStock = Number(itemInfo.stock || 0) + ajusteStock;

        if (nuevoStock < 0) {
          throw new Error(`Stock insuficiente al editar "${itemInfo.nombre}"`);
        }

        const { error: errorUpdateItem } = await supabase
          .from("items")
          .update({ stock: nuevoStock })
          .eq("id", itemId)
          .eq("empresa_id", empresa.id);

        if (errorUpdateItem) throw errorUpdateItem;

        if (diferencia > 0) {
          const { error: errorKardexSalida } = await supabase
            .from("kardex")
            .insert([
              {
                empresa_id: empresa.id,
                item_id: itemId,
                tipo: "salida",
                cantidad: diferencia,
                motivo: `ajuste edición venta ${ventaEditando.id}`,
                fecha_local: obtenerFechaHoraSVISO(),
              },
            ]);

          if (errorKardexSalida) throw errorKardexSalida;
        }

        if (diferencia < 0) {
          const { error: errorKardexEntrada } = await supabase
            .from("kardex")
            .insert([
              {
                empresa_id: empresa.id,
                item_id: itemId,
                tipo: "entrada",
                cantidad: Math.abs(diferencia),
                motivo: `ajuste edición venta ${ventaEditando.id}`,
                fecha_local: obtenerFechaHoraSVISO(),
              },
            ]);

          if (errorKardexEntrada) throw errorKardexEntrada;
        }
      }

      alert("Venta actualizada correctamente");
      cerrarEdicion();
      await obtenerVentas();
      await obtenerItems();
    } catch (error) {
      console.error(error);
      alert(error.message || "Error al actualizar la venta");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const eliminarVenta = async () => {
    if (!ventaEditando || !empresa?.id) return;

    const confirmar = window.confirm(
      `¿Seguro que deseas eliminar esta venta?\n\nEsta acción hará lo siguiente:\n- eliminará la venta\n- eliminará pagos\n- quitará movimiento de caja diaria\n- devolverá stock si aplica\n- registrará reversa en kardex`
    );

    if (!confirmar) return;

    setEliminandoVenta(true);

    try {
      const detalleAnterior = (ventaEditando.detalle_venta || []).map((d) => ({
        item_id: d.item_id,
        cantidad: Number(d.cantidad || 0),
      }));

      for (const det of detalleAnterior) {
        const itemInfo = items.find((it) => String(it.id) === String(det.item_id));
        if (!itemInfo || itemInfo.tipo !== "producto") continue;

        const nuevoStock = Number(itemInfo.stock || 0) + Number(det.cantidad || 0);

        const { error: errorUpdateItem } = await supabase
          .from("items")
          .update({ stock: nuevoStock })
          .eq("id", det.item_id)
          .eq("empresa_id", empresa.id);

        if (errorUpdateItem) throw errorUpdateItem;

        const { error: errorKardex } = await supabase
          .from("kardex")
          .insert([
            {
              empresa_id: empresa.id,
              item_id: det.item_id,
              tipo: "entrada",
              cantidad: Number(det.cantidad || 0),
              motivo: `eliminación venta ${ventaEditando.id}`,
              fecha_local: obtenerFechaHoraSVISO(),
            },
          ]);

        if (errorKardex) throw errorKardex;
      }

      const { error: errorDeleteCaja } = await supabase
        .from("caja_diaria_detalle")
        .delete()
        .eq("venta_id", ventaEditando.id);

      if (errorDeleteCaja) throw errorDeleteCaja;

      const { error: errorDeletePagos } = await supabase
        .from("venta_pagos")
        .delete()
        .eq("venta_id", ventaEditando.id);

      if (errorDeletePagos) throw errorDeletePagos;

      const { error: errorDeleteDetalle } = await supabase
        .from("detalle_venta")
        .delete()
        .eq("venta_id", ventaEditando.id);

      if (errorDeleteDetalle) throw errorDeleteDetalle;

      const { error: errorDeleteVenta } = await supabase
        .from("ventas")
        .delete()
        .eq("id", ventaEditando.id)
        .eq("empresa_id", empresa.id);

      if (errorDeleteVenta) throw errorDeleteVenta;

      alert("Venta eliminada correctamente");
      cerrarEdicion();
      await obtenerVentas();
      await obtenerItems();
    } catch (error) {
      console.error(error);
      alert(error.message || "Error al eliminar la venta");
    } finally {
      setEliminandoVenta(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Reporte de Ventas</h1>
            <p style={styles.subtitle}>
              Filtrá, revisá, editá y exportá ventas anteriores.
            </p>
          </div>

          <div style={styles.totalBadge}>
            <span style={styles.totalBadgeLabel}>Total período</span>
            <strong style={styles.totalBadgeValue}>${totalGeneral.toFixed(2)}</strong>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.filtros}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Desde</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Hasta</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                style={styles.input}
              />
            </div>

            <button style={styles.primaryBtn} onClick={obtenerVentas}>
              Filtrar
            </button>

            <button style={styles.pdfBtn} onClick={exportarPDF}>
              PDF Ventas
            </button>
          </div>
        </div>

        {ventas.length === 0 && (
          <div style={styles.emptyBox}>No hay ventas para mostrar</div>
        )}

        <div style={styles.listaVentas}>
          {ventas.map((v) => (
            <div key={v.id} style={styles.ventaCard}>
              <div style={styles.ventaHeader}>
                <div>
                  <h3 style={styles.ventaTotal}>${Number(v.total || 0).toFixed(2)}</h3>
                  <div style={styles.badge}>{v.estado}</div>
                </div>

                <button style={styles.editBtn} onClick={() => abrirEdicion(v)}>
                  Editar venta
                </button>
              </div>

              <div style={styles.ventaMeta}>
                <div><strong>Cliente:</strong> {v.clientes?.nombre || "Consumidor final"}</div>
                <div><strong>Fecha:</strong> {formatearFechaHora(v.fecha_local)}</div>
              </div>

              <div style={styles.detalleBox}>
                <strong>Detalle:</strong>
                <ul style={styles.ul}>
                  {(v.detalle_venta || []).map((d, i) => (
                    <li key={i}>
                      {d.items?.nombre || "Item"} x{d.cantidad} - ${Number(d.precio || 0).toFixed(2)}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={styles.detalleBox}>
                <strong>Pagos:</strong>
                <ul style={styles.ul}>
                  {(v.venta_pagos || []).length === 0 ? (
                    <li>Sin pagos</li>
                  ) : (
                    v.venta_pagos.map((p, i) => (
                      <li key={i}>
                        {p.metodos_pago?.nombre || "Método"} - ${Number(p.monto || 0).toFixed(2)}
                        {p.referencia ? ` - Ref: ${p.referencia}` : ""}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {ventaEditando && (
          <div style={styles.modalOverlay}>
            <div style={styles.modal}>
              <div style={styles.modalHeader}>
                <div>
                  <h2 style={styles.modalTitle}>Editar venta</h2>
                  <p style={styles.modalSub}>
                    ID: {ventaEditando.id}
                  </p>
                </div>

                <button style={styles.closeBtn} onClick={cerrarEdicion}>
                  ✕
                </button>
              </div>

              <div style={styles.editGridTop}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Fecha</label>
                  <input
                    type="date"
                    value={editFecha}
                    onChange={(e) => setEditFecha(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Cliente</label>
                  <select
                    value={editClienteId}
                    onChange={(e) => setEditClienteId(e.target.value)}
                    style={styles.input}
                  >
                    <option value="">Consumidor final</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Estado</label>
                  <select
                    value={editEstado}
                    onChange={(e) => setEditEstado(e.target.value)}
                    style={styles.input}
                  >
                    <option value="pagado">Pagado</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="parcial">Parcial</option>
                  </select>
                </div>
              </div>

              <div style={styles.editSection}>
                <h3 style={styles.sectionTitle}>Agregar items</h3>

                <div style={styles.filtrosItems}>
                  <input
                    placeholder="Buscar item..."
                    value={busquedaItem}
                    onChange={(e) => setBusquedaItem(e.target.value)}
                    style={styles.input}
                  />

                  <select
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                    style={styles.input}
                  >
                    <option value="todos">Todos</option>
                    <option value="producto">Productos</option>
                    <option value="servicio">Servicios</option>
                  </select>
                </div>

                <div style={styles.itemsGrid}>
                  {itemsDisponibles.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      style={styles.itemBtn}
                      onClick={() => agregarItemEdicion(item)}
                    >
                      {item.nombre}
                      <br />
                      <strong>${Number(item.precio || 0).toFixed(2)}</strong>
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.editSection}>
                <h3 style={styles.sectionTitle}>Detalle editado</h3>

                {editItems.length === 0 && (
                  <div style={styles.emptyMini}>No hay items agregados</div>
                )}

                {editItems.map((item) => (
                  <div key={item.item_id} style={styles.rowEdit}>
                    <div style={{ flex: 1 }}>
                      <strong>{item.nombre}</strong>
                    </div>

                    <div style={styles.qtyBox}>
                      <button
                        type="button"
                        style={styles.qtyBtn}
                        onClick={() => cambiarCantidadEdit(item.item_id, item.cantidad - 1)}
                      >
                        -
                      </button>
                      <span>{item.cantidad}</span>
                      <button
                        type="button"
                        style={styles.qtyBtn}
                        onClick={() => cambiarCantidadEdit(item.item_id, item.cantidad + 1)}
                      >
                        +
                      </button>
                    </div>

                    <input
                      type="number"
                      value={item.precio}
                      onChange={(e) =>
                        cambiarPrecioEdit(item.item_id, Number(e.target.value))
                      }
                      style={styles.priceInput}
                    />

                    <div style={{ minWidth: 100, textAlign: "right" }}>
                      ${(Number(item.precio || 0) * Number(item.cantidad || 0)).toFixed(2)}
                    </div>

                    <button
                      type="button"
                      style={styles.deleteBtn}
                      onClick={() => eliminarItemEdit(item.item_id)}
                    >
                      ❌
                    </button>
                  </div>
                ))}
              </div>

              <div style={styles.editSection}>
                <div style={styles.pagosHeader}>
                  <h3 style={styles.sectionTitle}>Pagos</h3>
                  <button type="button" style={styles.addBtn} onClick={agregarFilaPagoEdit}>
                    + Agregar pago
                  </button>
                </div>

                {editPagos.map((p, index) => (
                  <div key={index} style={styles.pagoRow}>
                    <select
                      value={p.metodo_pago_id}
                      onChange={(e) =>
                        actualizarPagoEdit(index, "metodo_pago_id", e.target.value)
                      }
                      style={styles.input}
                    >
                      <option value="">Método</option>
                      {metodosPago.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.monto}
                      onChange={(e) =>
                        actualizarPagoEdit(index, "monto", e.target.value)
                      }
                      placeholder="Monto"
                      style={styles.input}
                    />

                    <input
                      type="text"
                      value={p.referencia}
                      onChange={(e) =>
                        actualizarPagoEdit(index, "referencia", e.target.value)
                      }
                      placeholder="Referencia"
                      style={styles.input}
                    />

                    <button
                      type="button"
                      style={styles.deleteBtn}
                      onClick={() => eliminarFilaPagoEdit(index)}
                    >
                      ❌
                    </button>
                  </div>
                ))}
              </div>

              <div style={styles.summaryBox}>
                <div>Total venta: <strong>${totalEditado.toFixed(2)}</strong></div>
                <div>Total pagado: <strong>${totalPagadoEdit.toFixed(2)}</strong></div>
                <div>Saldo: <strong>${saldoEditado.toFixed(2)}</strong></div>
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.cancelBtn}
                  onClick={cerrarEdicion}
                  disabled={guardandoEdicion || eliminandoVenta}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  style={styles.deleteSaleBtn}
                  onClick={eliminarVenta}
                  disabled={guardandoEdicion || eliminandoVenta}
                >
                  {eliminandoVenta ? "Eliminando..." : "Eliminar venta"}
                </button>

                <button
                  type="button"
                  style={styles.saveBtn}
                  onClick={guardarEdicion}
                  disabled={guardandoEdicion || eliminandoVenta}
                >
                  {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
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
    alignItems: "center",
    gap: "16px",
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
    color: "#64748b",
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

  filtros: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

  primaryBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: "700",
  },

  pdfBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: "700",
  },

  emptyBox: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    padding: "20px",
    color: "#64748b",
    textAlign: "center",
  },

  listaVentas: {
    display: "grid",
    gap: "14px",
  },

  ventaCard: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "20px",
    padding: "16px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  },

  ventaHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "12px",
  },

  ventaTotal: {
    margin: 0,
    fontSize: "22px",
    color: "#1f2937",
  },

  badge: {
    marginTop: "6px",
    display: "inline-block",
    background: "#f4f0f7",
    color: "#574866",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    textTransform: "capitalize",
    border: "1px solid #d3c7dd",
  },

  editBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  ventaMeta: {
    display: "grid",
    gap: "6px",
    marginBottom: "10px",
    color: "#334155",
  },

  detalleBox: {
    marginTop: "10px",
    background: "#f8f8fa",
    border: "1px solid #d7dbe2",
    borderRadius: "14px",
    padding: "12px",
  },

  ul: {
    margin: "8px 0 0 18px",
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
    maxWidth: "1100px",
    maxHeight: "92vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
    border: "1px solid #d7dbe2",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "16px",
    gap: "12px",
  },

  modalTitle: {
    margin: 0,
    fontSize: "28px",
    color: "#574866",
  },

  modalSub: {
    margin: "4px 0 0 0",
    color: "#64748b",
  },

  closeBtn: {
    background: "#ececef",
    border: "none",
    borderRadius: "10px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "700",
  },

  editGridTop: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    marginBottom: "18px",
  },

  editSection: {
    marginTop: "18px",
    padding: "14px",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    background: "#fcfdff",
  },

  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: "18px",
    color: "#1f2937",
  },

  filtrosItems: {
    display: "grid",
    gridTemplateColumns: "1fr 220px",
    gap: "10px",
    marginBottom: "12px",
  },

  itemsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: "10px",
  },

  itemBtn: {
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #d3c7dd",
    background: "#f4f0f7",
    cursor: "pointer",
    fontWeight: "600",
    color: "#574866",
  },

  emptyMini: {
    color: "#64748b",
    padding: "10px 0",
  },

  rowEdit: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "10px",
    paddingBottom: "10px",
    borderBottom: "1px solid #edf2f7",
  },

  qtyBox: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },

  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "1px solid #d7dbe2",
    background: "#f8f8fa",
    cursor: "pointer",
    fontWeight: 700,
  },

  priceInput: {
    width: "90px",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid #cfd9e5",
  },

  deleteBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  pagosHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
    flexWrap: "wrap",
  },

  addBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  pagoRow: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr 1.2fr auto",
    gap: "10px",
    marginBottom: "10px",
    alignItems: "center",
  },

  summaryBox: {
    marginTop: "18px",
    display: "grid",
    gap: "8px",
    padding: "14px",
    background: "#f8f8fa",
    border: "1px solid #d7dbe2",
    borderRadius: "14px",
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "18px",
    flexWrap: "wrap",
  },

  cancelBtn: {
    background: "#fff",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  deleteSaleBtn: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  saveBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },
};

export default Reporte;