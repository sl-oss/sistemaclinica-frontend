import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

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

function formatearFechaVenta(fecha) {
  if (!fecha) return "";
  const soloFecha = String(fecha).slice(0, 10);
  const [yyyy, mm, dd] = soloFecha.split("-");
  if (!yyyy || !mm || !dd) return soloFecha;
  return `${dd}/${mm}/${yyyy}`;
}

async function registrarPagosEnCajaDiaria({
  empresaId,
  ventaId,
  nombrePaciente,
  pagosValidos,
  fechaLocal,
}) {
  if (!empresaId || !ventaId || pagosValidos.length === 0) return;

  const fechaSolo = fechaLocal.slice(0, 10);
  let cajaId = null;

  const { data: cajaExistente, error: errorBuscarCaja } = await supabase
    .from("cajas_diarias")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("fecha_local", fechaSolo)
    .maybeSingle();

  if (errorBuscarCaja) {
    console.error("Error buscando caja diaria:", errorBuscarCaja);
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
      console.error("Error creando caja diaria:", errorCrearCaja);
      throw new Error("Error al crear caja diaria");
    }

    cajaId = nuevaCaja.id;
  }

  const detalleCaja = pagosValidos.map((p) => ({
    caja_diaria_id: cajaId,
    venta_id: ventaId,
    paciente: (nombrePaciente || "Cliente de contado").trim(),
    metodo_pago_id: Number(p.metodo_pago_id),
    monto: Number(p.monto),
    referencia: p.referencia?.trim() || null,
  }));

  const { error: errorInsertarDetalle } = await supabase
    .from("caja_diaria_detalle")
    .insert(detalleCaja);

  if (errorInsertarDetalle) {
    console.error("Error insertando detalle en caja diaria:", errorInsertarDetalle);
    throw new Error("Error al pasar pagos a caja diaria");
  }
}

function Venta() {
  const [items, setItems] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState("");
  const [estado, setEstado] = useState("pagado");

  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const [citaActiva, setCitaActiva] = useState(null);

  const [metodosPago, setMetodosPago] = useState([]);
  const [pagos, setPagos] = useState([
    { metodo_pago_id: "", monto: "", referencia: "" },
  ]);

  const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState("");
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [guardandoVenta, setGuardandoVenta] = useState(false);

  const [mostrarReportePrecios, setMostrarReportePrecios] = useState(false);
  const [reportePrecios, setReportePrecios] = useState([]);
  const [cargandoReportePrecios, setCargandoReportePrecios] = useState(false);
  const [filtroReporteDesde, setFiltroReporteDesde] = useState("");
  const [filtroReporteHasta, setFiltroReporteHasta] = useState("");
  const [filtroReporteOrigen, setFiltroReporteOrigen] = useState("todos");

  // Multiusuario: el usuario puede tener acceso a una o varias empresas.
  // Este módulo de venta siempre opera con UNA empresa activa para no mezclar caja, stock ni kardex.
  const [empresaActiva, setEmpresaActiva] = useState(() =>
    JSON.parse(localStorage.getItem("empresa") || "null")
  );
  const [empresasDisponibles, setEmpresasDisponibles] = useState([]);

  const empresa = empresaActiva;

  useEffect(() => {
    cargarEmpresasDelUsuario();

    const cita = JSON.parse(localStorage.getItem("citaActiva") || "null");
    if (cita) {
      setClienteSeleccionado(cita.cliente_id || "");
      setCitaActiva(cita);
      localStorage.removeItem("citaActiva");
    }
  }, []);

  useEffect(() => {
    if (!empresa?.id) return;

    setItems([]);
    setClientes([]);
    setMetodosPago([]);

    obtenerItems();
    obtenerClientes();
    obtenerMetodosPago();
  }, [empresa?.id]);

  const cargarEmpresasDelUsuario = async () => {
    const empresaLocal = JSON.parse(localStorage.getItem("empresa") || "null");

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error("Error obteniendo usuario:", authError);
    }

    const user = authData?.user;

    if (!user?.id) {
      if (empresaLocal?.id) {
        setEmpresaActiva(empresaLocal);
        setEmpresasDisponibles([empresaLocal]);
      }
      return;
    }

    const { data, error } = await supabase
      .from("empresa_usuarios")
      .select(`
        empresa_id,
        rol,
        activo,
        empresas(id, nombre)
      `)
      .eq("user_id", user.id)
      .eq("activo", true);

    if (error) {
      console.error("Error cargando empresas del usuario:", error);

      if (empresaLocal?.id) {
        setEmpresaActiva(empresaLocal);
        setEmpresasDisponibles([empresaLocal]);
      }
      return;
    }

    const empresas = (data || [])
      .map((fila) => ({
        ...fila.empresas,
        rol_usuario: fila.rol,
      }))
      .filter((e) => e?.id);

    const empresasUnicas = Array.from(
      new Map(empresas.map((e) => [String(e.id), e])).values()
    );

    if (empresasUnicas.length === 0) {
      if (empresaLocal?.id) {
        setEmpresaActiva(empresaLocal);
        setEmpresasDisponibles([empresaLocal]);
      }
      return;
    }

    setEmpresasDisponibles(empresasUnicas);

    const empresaLocalPermitida = empresasUnicas.find(
      (e) => String(e.id) === String(empresaLocal?.id)
    );

    const siguienteEmpresa = empresaLocalPermitida || empresasUnicas[0];
    setEmpresaActiva(siguienteEmpresa);
    localStorage.setItem("empresa", JSON.stringify(siguienteEmpresa));
  };

  const cambiarEmpresaActiva = (empresaId) => {
    const nuevaEmpresa = empresasDisponibles.find(
      (e) => String(e.id) === String(empresaId)
    );

    if (!nuevaEmpresa) return;

    if (seleccionados.length > 0 || totalPagado > 0) {
      const confirmar = window.confirm(
        "Cambiar de empresa limpiará la venta actual para no mezclar caja, stock ni kardex. ¿Deseás continuar?"
      );

      if (!confirmar) return;
    }

    localStorage.setItem("empresa", JSON.stringify(nuevaEmpresa));
    setEmpresaActiva(nuevaEmpresa);
    setSeleccionados([]);
    setClienteSeleccionado("");
    setCitaActiva(null);
    setEstado("pagado");
    setPagos([{ metodo_pago_id: "", monto: "", referencia: "" }]);
  };

  const obtenerItems = async () => {
    if (!empresa?.id) return;

    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("empresa_id", empresa.id);

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
      .select("*")
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
      return alert("Error al cargar métodos de pago");
    }

    setMetodosPago(data || []);
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
    if (!empresa?.id) return alert("No hay empresa seleccionada");
    if (!nuevoClienteNombre.trim()) return alert("Ingresa el nombre del cliente");

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

  const itemsFiltrados = items.filter((item) => {
    const coincideBusqueda = item.nombre
      .toLowerCase()
      .includes(busqueda.toLowerCase());

    const coincideTipo = filtroTipo === "todos" || item.tipo === filtroTipo;

    return coincideBusqueda && coincideTipo;
  });

  const agregarItem = (item) => {
    const existe = seleccionados.find((i) => i.id === item.id);

    if (existe) {
      cambiarCantidad(item.id, existe.cantidad + 1);
    } else {
      setSeleccionados([
        ...seleccionados,
        {
          ...item,
          precio_base: Number(item.precio || 0),
          cantidad: 1,
        },
      ]);
    }
  };

  const cambiarCantidad = (id, cantidad) => {
    if (cantidad <= 0) {
      eliminarItem(id);
      return;
    }

    const itemActual = seleccionados.find((i) => i.id === id);

    if (
      itemActual?.tipo === "producto" &&
      cantidad > Number(itemActual.stock || 0)
    ) {
      return alert(`No hay suficiente stock para "${itemActual.nombre}"`);
    }

    setSeleccionados(
      seleccionados.map((i) => (i.id === id ? { ...i, cantidad } : i))
    );
  };

  const eliminarItem = (id) => {
    setSeleccionados(seleccionados.filter((i) => i.id !== id));
  };

  const cambiarPrecio = (id, precio) => {
    const item = seleccionados.find((i) => String(i.id) === String(id));

    if (!item?.precio_editable) {
      alert("Este producto tiene precio fijo y no se puede modificar.");
      return;
    }

    setSeleccionados(
      seleccionados.map((i) => (i.id === id ? { ...i, precio } : i))
    );
  };

  const agregarFilaPago = () => {
    setPagos([...pagos, { metodo_pago_id: "", monto: "", referencia: "" }]);
  };

  const eliminarFilaPago = (index) => {
    const nuevos = pagos.filter((_, i) => i !== index);
    setPagos(
      nuevos.length ? nuevos : [{ metodo_pago_id: "", monto: "", referencia: "" }]
    );
  };

  const actualizarPago = (index, campo, valor) => {
    const nuevos = [...pagos];
    nuevos[index][campo] = valor;
    setPagos(nuevos);
  };

  const total = seleccionados.reduce(
    (sum, i) => sum + Number(i.precio || 0) * Number(i.cantidad || 0),
    0
  );

  const totalPagado = useMemo(() => {
    return pagos.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
  }, [pagos]);

  const saldoPendiente = useMemo(() => {
    const saldo = total - totalPagado;
    return saldo > 0 ? saldo : 0;
  }, [total, totalPagado]);

  const guardarVenta = async () => {
    if (guardandoVenta) return;

    if (seleccionados.length === 0) return alert("Agrega items");
    if (!empresa?.id) return alert("No hay empresa seleccionada");

    const pagosValidos = pagos.filter(
      (p) =>
        p.metodo_pago_id &&
        p.monto !== "" &&
        p.monto !== null &&
        Number(p.monto) > 0
    );

    if (totalPagado > total) {
      return alert("El total pagado no puede ser mayor al total de la venta");
    }

    if (estado === "pagado" && totalPagado < total) {
      return alert(
        "Si la venta está pagada, debés completar el total con los métodos de pago"
      );
    }

    if (estado === "pendiente" && totalPagado > total) {
      return alert("El total pagado no puede ser mayor al total");
    }

    for (const i of seleccionados) {
      if (i.tipo === "producto" && Number(i.cantidad) > Number(i.stock || 0)) {
        return alert(`Stock insuficiente para "${i.nombre}"`);
      }
    }

    setGuardandoVenta(true);

    const fechaLocal = obtenerFechaHoraSVISO();
    const estadoFinal =
      totalPagado >= total && total > 0 ? "pagado" : "pendiente";

    const { data: venta, error: errorVenta } = await supabase
      .from("ventas")
      .insert([
        {
          empresa_id: empresa.id,
          cliente_id: clienteSeleccionado || null,
          total,
          estado: estadoFinal,
          fecha_local: fechaLocal,
          fecha: fechaLocal,
        },
      ])
      .select()
      .single();

    if (errorVenta) {
      setGuardandoVenta(false);
      console.error(errorVenta);
      return alert("Error al guardar venta");
    }

    const detalles = seleccionados.map((i) => ({
      venta_id: venta.id,
      item_id: i.id,
      cantidad: i.cantidad,
      precio: i.precio,
      precio_base: Number(i.precio_base ?? i.precio_original ?? i.precio_catalogo ?? i.precio ?? 0),
      precio_editable: Boolean(i.precio_editable),
      origen_precio: "venta",
    }));

    const { error: errorDetalle } = await supabase
      .from("detalle_venta")
      .insert(detalles);

    if (errorDetalle) {
      setGuardandoVenta(false);
      console.error(errorDetalle);
      return alert("Error al guardar detalle de venta");
    }

    if (pagosValidos.length > 0) {
      const pagosParaGuardar = pagosValidos.map((p) => ({
        venta_id: venta.id,
        empresa_id: empresa.id,
        metodo_pago_id: Number(p.metodo_pago_id),
        monto: Number(p.monto),
        referencia: p.referencia?.trim() || null,
        fecha_local: fechaLocal,
      }));

      const { error: errorPagos } = await supabase
        .from("venta_pagos")
        .insert(pagosParaGuardar);

      if (errorPagos) {
        setGuardandoVenta(false);
        console.error(errorPagos);
        return alert("Error al guardar pagos de la venta");
      }

      const clienteObj = clientes.find(
        (c) => String(c.id) === String(clienteSeleccionado)
      );

      const nombrePaciente =
        clienteObj?.nombre || citaActiva?.cliente_nombre || "Cliente de contado";

      try {
        await registrarPagosEnCajaDiaria({
          empresaId: empresa.id,
          ventaId: venta.id,
          nombrePaciente,
          pagosValidos,
          fechaLocal,
        });
      } catch (error) {
        setGuardandoVenta(false);
        console.error(error);
        return alert("La venta se guardó, pero hubo error al pasarla a caja diaria");
      }
    }

    for (const i of seleccionados) {
      if (i.tipo === "producto") {
        const { error: errorKardex } = await supabase.from("kardex").insert([
          {
            empresa_id: empresa.id,
            item_id: i.id,
            tipo: "salida",
            cantidad: i.cantidad,
            motivo: "venta",
            fecha_local: fechaLocal,
          },
        ]);

        if (errorKardex) {
          setGuardandoVenta(false);
          console.error(errorKardex);
          return alert(`Error al guardar kardex de "${i.nombre}"`);
        }

        const nuevoStock = Number(i.stock || 0) - Number(i.cantidad || 0);

        const { error: errorStock } = await supabase
          .from("items")
          .update({ stock: nuevoStock })
          .eq("id", i.id)
          .eq("empresa_id", empresa.id);

        if (errorStock) {
          setGuardandoVenta(false);
          console.error(errorStock);
          return alert(`Error al actualizar stock de "${i.nombre}"`);
        }
      }
    }

    if (citaActiva?.id) {
      const { error: errorCita } = await supabase
        .from("citas")
        .update({ estado: "atendida" })
        .eq("id", citaActiva.id)
        .eq("empresa_id", empresa.id);

      if (errorCita) {
        console.error(errorCita);
      }
    }

    setGuardandoVenta(false);
    alert("Venta guardada 💰");

    setSeleccionados([]);
    setClienteSeleccionado("");
    setCitaActiva(null);
    setEstado("pagado");
    setPagos([{ metodo_pago_id: "", monto: "", referencia: "" }]);

    obtenerItems();
  };


  const cargarReportePreciosEspeciales = async () => {
    const empresaId = empresa?.id;
    if (!empresaId) return alert("No hay empresa seleccionada");

    setCargandoReportePrecios(true);

    let query = supabase
      .from("detalle_venta")
      .select(`
        id,
        venta_id,
        item_id,
        cantidad,
        precio,
        precio_base,
        precio_editable,
        origen_precio,
        ventas (
          id,
          empresa_id,
          cliente_id,
          fecha_local,
          fecha,
          estado,
          total,
          clientes (
            id,
            nombre
          )
        ),
        items (
          id,
          nombre,
          tipo
        )
      `)
      .eq("precio_editable", true)
      .eq("ventas.empresa_id", empresaId)
      .order("id", { ascending: false });

    if (filtroReporteDesde) {
      query = query.gte("ventas.fecha_local", `${filtroReporteDesde}T00:00:00`);
    }

    if (filtroReporteHasta) {
      query = query.lte("ventas.fecha_local", `${filtroReporteHasta}T23:59:59`);
    }

    const { data, error } = await query;

    setCargandoReportePrecios(false);

    if (error) {
      console.error(error);
      return alert("Error al cargar reporte de precios especiales");
    }

    const filtrado = (data || []).filter((row) => {
      if (!row.ventas || String(row.ventas.empresa_id) !== String(empresaId)) return false;
      if (filtroReporteOrigen === "todos") return true;
      return String(row.origen_precio || "venta") === filtroReporteOrigen;
    });

    setReportePrecios(filtrado);
  };

  const abrirReportePreciosEspeciales = async () => {
    setMostrarReportePrecios(true);
    await cargarReportePreciosEspeciales();
  };

  const cerrarReportePreciosEspeciales = () => {
    setMostrarReportePrecios(false);
    setReportePrecios([]);
  };

  const totalDiferenciaReporte = useMemo(() => {
    return reportePrecios.reduce((acc, row) => {
      const cantidad = Number(row.cantidad || 0);
      const base = Number(row.precio_base || 0);
      const cobrado = Number(row.precio || 0);
      return acc + (cobrado - base) * cantidad;
    }, 0);
  }, [reportePrecios]);

  return (
    <>
      <div style={styles.page}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Venta</h1>
            <p style={styles.subtitle}>Registro de productos y servicios</p>
          </div>

          <div style={styles.headerInfo}>
            <label style={styles.empresaLabel}>Empresa activa</label>
            {empresasDisponibles.length > 1 ? (
              <select
                style={styles.empresaSelect}
                value={empresa?.id || ""}
                onChange={(e) => cambiarEmpresaActiva(e.target.value)}
                disabled={guardandoVenta}
              >
                {empresasDisponibles.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <div><strong>{empresa?.nombre || "Empresa"}</strong></div>
            )}
            <div>Módulo de ventas</div>
            <div>Total actual: <strong>${total.toFixed(2)}</strong></div>
            <button
              type="button"
              style={styles.btnReportePrecios}
              onClick={abrirReportePreciosEspeciales}
            >
              📊 Reporte precios especiales
            </button>
          </div>
        </div>

        <div style={styles.layout}>
          <section style={styles.left}>
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h3 style={styles.panelTitle}>🛒 Productos / Servicios</h3>
                  <p style={styles.panelSubtitle}>Buscá y agregá items a la venta</p>
                </div>
              </div>

              <div style={styles.filters}>
                <input
                  style={styles.input}
                  placeholder="Buscar..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />

                <select
                  style={styles.input}
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="producto">Productos</option>
                  <option value="servicio">Servicios</option>
                </select>
              </div>

              <div style={styles.grid}>
                {itemsFiltrados.map((item) => (
                  <button
                    key={item.id}
                    style={{
                      ...styles.itemBtn,
                      background:
                        item.tipo === "producto" && Number(item.stock || 0) <= 3
                          ? "#fef2f2"
                          : "#f8f8fa",
                      borderColor:
                        item.tipo === "producto" && Number(item.stock || 0) <= 3
                          ? "#fecaca"
                          : "#d7dbe2",
                    }}
                    onClick={() => agregarItem(item)}
                  >
                    <div style={styles.itemTipo}>
                      {item.tipo === "producto" ? "📦 Producto" : "🧾 Servicio"}
                    </div>

                    <div style={styles.itemNombre}>{item.nombre}</div>

                    <div style={styles.itemPrecio}>
                      ${Number(item.precio || 0).toFixed(2)}
                    </div>

                    <div style={item.precio_editable ? styles.precioEditableBadge : styles.precioFijoBadge}>
                      {item.precio_editable ? "✏️ Editable" : "🔒 Fijo"}
                    </div>

                    {item.tipo === "producto" && (
                      <div style={styles.stock}>Stock: {item.stock}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside style={styles.right}>
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h3 style={styles.panelTitle}>🧾 Venta</h3>
                  <p style={styles.panelSubtitle}>Detalle, cliente y cobro</p>
                </div>
              </div>

              <div style={styles.clienteRow}>
                <select
                  style={{ ...styles.input, marginBottom: 0 }}
                  value={clienteSeleccionado}
                  onChange={(e) => setClienteSeleccionado(e.target.value)}
                >
                  <option value="">Seleccionar cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  style={styles.btnSoftPrimary}
                  onClick={abrirModalCliente}
                >
                  + Cliente
                </button>
              </div>

              {citaActiva && (
                <div style={styles.citaBox}>🦷 Cita activa: {citaActiva.servicio}</div>
              )}

              <div style={styles.estadoBox}>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="estadoVenta"
                    value="pagado"
                    checked={estado === "pagado"}
                    onChange={(e) => setEstado(e.target.value)}
                  />
                  Pagado
                </label>

                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="estadoVenta"
                    value="pendiente"
                    checked={estado === "pendiente"}
                    onChange={(e) => setEstado(e.target.value)}
                  />
                  Pendiente
                </label>
              </div>

              <div style={styles.lista}>
                {seleccionados.length === 0 ? (
                  <div style={styles.emptyBox}>No has agregado items todavía.</div>
                ) : (
                  seleccionados.map((item) => (
                    <div key={item.id} style={styles.row}>
                      <div style={styles.rowMain}>
                        <strong style={{ color: "#1f2937" }}>{item.nombre}</strong>

                        <div style={styles.precioWrap}>
                          <input
                            type="number"
                            value={item.precio}
                            onChange={(e) =>
                              cambiarPrecio(item.id, Number(e.target.value))
                            }
                            style={{
                              ...styles.precio,
                              ...(!item.precio_editable ? styles.precioBloqueado : {}),
                            }}
                            disabled={!item.precio_editable}
                            title={item.precio_editable ? "Precio editable" : "Precio fijo"}
                          />

                          <span style={item.precio_editable ? styles.precioEditableMini : styles.precioFijoMini}>
                            {item.precio_editable ? "Editable" : "Fijo"}
                          </span>
                        </div>
                      </div>

                      <div style={styles.controls}>
                        <button
                          style={styles.btnQty}
                          onClick={() => cambiarCantidad(item.id, item.cantidad - 1)}
                        >
                          -
                        </button>
                        <span style={styles.qtyNumber}>{item.cantidad}</span>
                        <button
                          style={styles.btnQty}
                          onClick={() => cambiarCantidad(item.id, item.cantidad + 1)}
                        >
                          +
                        </button>
                      </div>

                      <div style={styles.rowAmount}>
                        ${(Number(item.precio || 0) * Number(item.cantidad || 0)).toFixed(2)}
                      </div>

                      <button style={styles.btnDelete} onClick={() => eliminarItem(item.id)}>
                        ✖
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div style={styles.totalBox}>
                <span>Total venta</span>
                <strong>${total.toFixed(2)}</strong>
              </div>

              <div style={styles.pagosBox}>
                <div style={styles.pagosHeader}>
                  <h3 style={{ margin: 0, color: "#574866" }}>💳 Métodos de pago</h3>
                  <button type="button" style={styles.btnSoftPrimary} onClick={agregarFilaPago}>
                    + Agregar pago
                  </button>
                </div>

                {pagos.map((pago, index) => (
                  <div key={index} style={styles.pagoRow}>
                    <select
                      style={styles.pagoSelect}
                      value={pago.metodo_pago_id}
                      onChange={(e) =>
                        actualizarPago(index, "metodo_pago_id", e.target.value)
                      }
                    >
                      <option value="">Método</option>
                      {metodosPago.map((metodo) => (
                        <option key={metodo.id} value={metodo.id}>
                          {metodo.nombre}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Monto"
                      style={styles.pagoInput}
                      value={pago.monto}
                      onChange={(e) => actualizarPago(index, "monto", e.target.value)}
                    />

                    <input
                      type="text"
                      placeholder="Voucher / referencia"
                      style={styles.referenciaInput}
                      value={pago.referencia}
                      onChange={(e) =>
                        actualizarPago(index, "referencia", e.target.value)
                      }
                    />

                    <button
                      type="button"
                      style={styles.btnEliminarPago}
                      onClick={() => eliminarFilaPago(index)}
                    >
                      ✖
                    </button>
                  </div>
                ))}

                <div style={styles.resumenPagos}>
                  <div style={styles.resumenPagoRow}>
                    <span>Total pagado</span>
                    <strong>${totalPagado.toFixed(2)}</strong>
                  </div>

                  <div style={styles.resumenPagoRow}>
                    <span>Saldo pendiente</span>
                    <strong>${saldoPendiente.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              <button
                style={{
                  ...styles.btnGuardar,
                  opacity: guardandoVenta ? 0.85 : 1,
                  cursor: guardandoVenta ? "not-allowed" : "pointer",
                }}
                onClick={guardarVenta}
                disabled={guardandoVenta}
              >
                {guardandoVenta ? "Guardando..." : "💾 Guardar Venta"}
              </button>
            </div>
          </aside>
        </div>
      </div>

      {mostrarReportePrecios && (
        <div style={styles.modalOverlay} onClick={cerrarReportePreciosEspeciales}>
          <div style={styles.modalReportePrecios} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, color: "#574866" }}>
                  📊 Reporte de precios especiales
                </h3>
                <p style={styles.modalSubtitle}>
                  Muestra únicamente ventas con productos/servicios de precio editable.
                </p>
              </div>

              <button
                type="button"
                style={styles.btnCerrarModal}
                onClick={cerrarReportePreciosEspeciales}
              >
                ✖
              </button>
            </div>

            <div style={styles.reporteFiltros}>
              <input
                type="date"
                style={styles.input}
                value={filtroReporteDesde}
                onChange={(e) => setFiltroReporteDesde(e.target.value)}
              />

              <input
                type="date"
                style={styles.input}
                value={filtroReporteHasta}
                onChange={(e) => setFiltroReporteHasta(e.target.value)}
              />

              <select
                style={styles.input}
                value={filtroReporteOrigen}
                onChange={(e) => setFiltroReporteOrigen(e.target.value)}
              >
                <option value="todos">Todos los orígenes</option>
                <option value="venta">Venta directa</option>
                <option value="atencion_clinica">Atención clínica</option>
              </select>

              <button
                type="button"
                style={styles.btnSoftPrimary}
                onClick={cargarReportePreciosEspeciales}
              >
                Filtrar
              </button>
            </div>

            <div style={styles.reporteResumen}>
              <div>
                <span>Registros</span>
                <strong>{reportePrecios.length}</strong>
              </div>

              <div>
                <span>Diferencia total</span>
                <strong>${totalDiferenciaReporte.toFixed(2)}</strong>
              </div>
            </div>

            <div style={styles.reporteTableWrap}>
              {cargandoReportePrecios ? (
                <div style={styles.emptyBox}>Cargando reporte...</div>
              ) : reportePrecios.length === 0 ? (
                <div style={styles.emptyBox}>
                  No hay precios especiales con los filtros seleccionados.
                </div>
              ) : (
                <table style={styles.reporteTable}>
                  <thead>
                    <tr>
                      <th style={styles.reporteTh}>Fecha</th>
                      <th style={styles.reporteTh}>Cliente</th>
                      <th style={styles.reporteTh}>Producto / servicio</th>
                      <th style={styles.reporteTh}>Origen</th>
                      <th style={styles.reporteTh}>Cantidad</th>
                      <th style={styles.reporteTh}>Precio base</th>
                      <th style={styles.reporteTh}>Precio cobrado</th>
                      <th style={styles.reporteTh}>Diferencia</th>
                      <th style={styles.reporteTh}>Estado</th>
                    </tr>
                  </thead>

                  <tbody>
                    {reportePrecios.map((row) => {
                      const cantidad = Number(row.cantidad || 0);
                      const precioBase = Number(row.precio_base || 0);
                      const precioCobrado = Number(row.precio || 0);
                      const diferencia = (precioCobrado - precioBase) * cantidad;

                      return (
                        <tr key={row.id}>
                          <td style={styles.reporteTd}>
                            {formatearFechaVenta(row.ventas?.fecha_local || row.ventas?.fecha)}
                          </td>
                          <td style={styles.reporteTd}>
                            {row.ventas?.clientes?.nombre || "Cliente de contado"}
                          </td>
                          <td style={styles.reporteTd}>
                            {row.items?.nombre || "Producto / servicio"}
                          </td>
                          <td style={styles.reporteTd}>
                            {row.origen_precio === "atencion_clinica"
                              ? "Atención clínica"
                              : "Venta directa"}
                          </td>
                          <td style={styles.reporteTd}>{cantidad}</td>
                          <td style={styles.reporteTd}>${precioBase.toFixed(2)}</td>
                          <td style={styles.reporteTd}>${precioCobrado.toFixed(2)}</td>
                          <td
                            style={{
                              ...styles.reporteTd,
                              fontWeight: 900,
                              color: diferencia < 0 ? "#be123c" : "#0f7a4d",
                            }}
                          >
                            ${diferencia.toFixed(2)}
                          </td>
                          <td style={styles.reporteTd}>{row.ventas?.estado || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {mostrarModalCliente && (
        <div style={styles.modalOverlay} onClick={cerrarModalCliente}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: "#574866" }}>👤 Nuevo cliente</h3>
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
  },

  header: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 22,
    padding: 22,
    marginBottom: 18,
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    flexWrap: "wrap",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  title: {
    margin: 0,
    fontSize: 26,
    color: "#574866",
  },

  subtitle: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: 15,
  },

  headerInfo: {
    textAlign: "right",
    color: "#1f2937",
    fontSize: 14,
    lineHeight: 1.6,
    minWidth: 240,
  },

  empresaLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4,
  },

  empresaSelect: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid #d7dbe2",
    background: "#fff",
    color: "#1f2937",
    fontWeight: 700,
    outline: "none",
    marginBottom: 4,
  },

  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.5fr) minmax(340px, 1fr)",
    gap: 18,
    alignItems: "start",
  },

  left: {
    minWidth: 0,
  },

  right: {
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
  },

  panel: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },

  panelTitle: {
    margin: 0,
    color: "#1f2937",
    fontSize: 20,
  },

  panelSubtitle: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: 14,
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "1.3fr 220px",
    gap: 12,
    marginBottom: 16,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 12,
  },

  itemBtn: {
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #d7dbe2",
    cursor: "pointer",
    textAlign: "left",
    transition: "0.2s ease",
    minHeight: 120,
  },

  itemTipo: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 10,
  },

  itemNombre: {
    fontWeight: 700,
    color: "#1f2937",
    marginBottom: 10,
    lineHeight: 1.3,
  },

  itemPrecio: {
    fontSize: 20,
    fontWeight: 700,
    color: "#574866",
  },

  stock: {
    fontSize: 12,
    marginTop: "8px",
    color: "#475569",
  },

  input: {
    width: "100%",
    padding: "12px 14px",
    marginBottom: "10px",
    borderRadius: "12px",
    border: "1px solid #d7dbe2",
    boxSizing: "border-box",
    background: "#fff",
    fontSize: 14,
    outline: "none",
  },

  clienteRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "10px",
    alignItems: "stretch",
    marginBottom: "12px",
  },

  btnSoftPrimary: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: "700",
    whiteSpace: "nowrap",
  },

  lista: {
    maxHeight: "340px",
    overflow: "auto",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 12,
    background: "#fafafa",
    marginBottom: 16,
  },

  emptyBox: {
    padding: 20,
    textAlign: "center",
    color: "#64748b",
  },

  row: {
    display: "grid",
    gridTemplateColumns: "minmax(160px, 1fr) auto auto auto",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
    padding: "10px",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
  },

  rowMain: {
    minWidth: 0,
  },

  controls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  btnQty: {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "1px solid #d7dbe2",
    background: "#f8f8fa",
    cursor: "pointer",
    fontWeight: 700,
  },

  qtyNumber: {
    minWidth: 18,
    textAlign: "center",
    fontWeight: 700,
    color: "#1f2937",
  },

  precio: {
    width: "110px",
    marginTop: "8px",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d7dbe2",
    background: "#fff",
  },

  rowAmount: {
    fontWeight: 700,
    color: "#1f2937",
    whiteSpace: "nowrap",
  },

  btnDelete: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "none",
    borderRadius: "10px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 700,
  },

  totalBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    borderRadius: 14,
    background: "#574866",
    color: "#fff",
    fontSize: 18,
    marginBottom: 16,
  },

  citaBox: {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    padding: "12px 14px",
    borderRadius: "12px",
    marginBottom: "12px",
    color: "#9a3412",
    fontWeight: 600,
  },

  estadoBox: {
    display: "flex",
    gap: "16px",
    marginBottom: "14px",
    padding: "12px 14px",
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    flexWrap: "wrap",
  },

  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontWeight: "600",
    color: "#574866",
  },

  pagosBox: {
    marginTop: "6px",
    padding: "14px",
    background: "#f8f8fa",
    borderRadius: "16px",
    border: "1px solid #d7dbe2",
    overflow: "hidden",
    boxSizing: "border-box",
  },

  pagosHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },

  pagoRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "8px",
    marginBottom: "8px",
    alignItems: "center",
    width: "100%",
    boxSizing: "border-box",
  },

  pagoSelect: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #d7dbe2",
    background: "#fff",
  },

  pagoInput: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #d7dbe2",
    background: "#fff",
  },

  referenciaInput: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #d7dbe2",
    background: "#fff",
  },

  btnEliminarPago: {
    width: "42px",
    minWidth: "42px",
    height: "42px",
    display: "grid",
    placeItems: "center",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "10px",
    padding: 0,
    cursor: "pointer",
    fontWeight: 700,
  },

  resumenPagos: {
    marginTop: "14px",
    display: "grid",
    gap: "8px",
    fontSize: "15px",
    color: "#0f172a",
  },

  resumenPagoRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "10px 12px",
  },

  btnGuardar: {
    width: "100%",
    padding: "15px",
    marginTop: "16px",
    background: "#6b5a7a",
    color: "white",
    border: "none",
    borderRadius: "14px",
    fontSize: "16px",
    fontWeight: 700,
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
    flexWrap: "wrap",
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
  precioWrap: {
    display: "grid",
    gap: 5,
  },

  precioBloqueado: {
    background: "#f8fafc",
    color: "#64748b",
    cursor: "not-allowed",
  },

  precioEditableMini: {
    display: "inline-flex",
    width: "fit-content",
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: 999,
    padding: "3px 7px",
    fontSize: 10,
    fontWeight: 800,
  },

  precioFijoMini: {
    display: "inline-flex",
    width: "fit-content",
    background: "#fff7ed",
    color: "#b45309",
    border: "1px solid #fed7aa",
    borderRadius: 999,
    padding: "3px 7px",
    fontSize: 10,
    fontWeight: 800,
  },

  precioEditableBadge: {
    marginTop: 8,
    display: "inline-flex",
    width: "fit-content",
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 800,
  },

  precioFijoBadge: {
    marginTop: 8,
    display: "inline-flex",
    width: "fit-content",
    background: "#fff7ed",
    color: "#b45309",
    border: "1px solid #fed7aa",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 800,
  },


  btnReportePrecios: {
    marginTop: 8,
    width: "100%",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: 12,
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 800,
  },

  modalReportePrecios: {
    width: "100%",
    maxWidth: "1180px",
    maxHeight: "88vh",
    overflow: "hidden",
    background: "#fff",
    borderRadius: "20px",
    padding: "18px",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
    display: "grid",
    gap: "14px",
    border: "1px solid #d7dbe2",
  },

  reporteFiltros: {
    display: "grid",
    gridTemplateColumns: "180px 180px 220px auto",
    gap: 10,
    alignItems: "center",
  },

  reporteResumen: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },

  reporteTableWrap: {
    overflow: "auto",
    border: "1px solid #d7dbe2",
    borderRadius: 14,
    maxHeight: "55vh",
  },

  reporteTable: {
    width: "100%",
    minWidth: "980px",
    borderCollapse: "collapse",
    background: "#fff",
  },

  reporteTh: {
    position: "sticky",
    top: 0,
    background: "#f4f0f7",
    color: "#574866",
    padding: "11px 10px",
    textAlign: "left",
    borderBottom: "1px solid #d7dbe2",
    fontSize: 13,
    zIndex: 1,
  },

  reporteTd: {
    padding: "10px",
    borderBottom: "1px solid #edf2f7",
    color: "#334155",
    fontSize: 13,
    verticalAlign: "top",
  },

};

export default Venta;