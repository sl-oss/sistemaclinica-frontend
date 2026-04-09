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

async function registrarPagosEnCajaDiaria({ nombrePaciente, pagosValidos, fechaLocal }) {
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

  const empresa = JSON.parse(localStorage.getItem("empresa") || "null");

  useEffect(() => {
    obtenerItems();
    obtenerClientes();
    obtenerMetodosPago();

    const cita = JSON.parse(localStorage.getItem("citaActiva"));
    if (cita) {
      setClienteSeleccionado(cita.cliente_id || "");
      setCitaActiva(cita);
      localStorage.removeItem("citaActiva");
    }
  }, []);

  const obtenerItems = async () => {
    if (!empresa) return;

    const { data } = await supabase
      .from("items")
      .select("*")
      .eq("empresa_id", empresa.id);

    setItems(data || []);
  };

  const obtenerClientes = async () => {
    if (!empresa) return;

    const { data } = await supabase
      .from("clientes")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("nombre", { ascending: true });

    setClientes(data || []);
  };

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
    if (!empresa) return alert("No hay empresa seleccionada");
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

    const coincideTipo =
      filtroTipo === "todos" || item.tipo === filtroTipo;

    return coincideBusqueda && coincideTipo;
  });

  const agregarItem = (item) => {
    const existe = seleccionados.find((i) => i.id === item.id);

    if (existe) {
      cambiarCantidad(item.id, existe.cantidad + 1);
    } else {
      setSeleccionados([...seleccionados, { ...item, cantidad: 1 }]);
    }
  };

  const cambiarCantidad = (id, cantidad) => {
    if (cantidad <= 0) {
      eliminarItem(id);
      return;
    }

    setSeleccionados(
      seleccionados.map((i) =>
        i.id === id ? { ...i, cantidad } : i
      )
    );
  };

  const eliminarItem = (id) => {
    setSeleccionados(seleccionados.filter((i) => i.id !== id));
  };

  const cambiarPrecio = (id, precio) => {
    setSeleccionados(
      seleccionados.map((i) =>
        i.id === id ? { ...i, precio } : i
      )
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
    if (seleccionados.length === 0) return alert("Agrega items");
    if (!empresa) return alert("No hay empresa seleccionada");

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
      return alert("Si la venta está pagada, debés completar el total con los métodos de pago");
    }

    if (estado === "pendiente" && totalPagado > total) {
      return alert("El total pagado no puede ser mayor al total");
    }

    const fechaLocal = obtenerFechaHoraSVISO();
    const estadoFinal = totalPagado >= total && total > 0 ? "pagado" : "pendiente";

    const { data: venta, error: errorVenta } = await supabase
      .from("ventas")
      .insert([
        {
          empresa_id: empresa.id,
          cliente_id: clienteSeleccionado || null,
          total,
          estado: estadoFinal,
          fecha_local: fechaLocal,
        },
      ])
      .select()
      .single();

    if (errorVenta) {
      console.error(errorVenta);
      return alert("Error al guardar venta");
    }

    const detalles = seleccionados.map((i) => ({
      venta_id: venta.id,
      item_id: i.id,
      cantidad: i.cantidad,
      precio: i.precio,
    }));

    const { error: errorDetalle } = await supabase
      .from("detalle_venta")
      .insert(detalles);

    if (errorDetalle) {
      console.error(errorDetalle);
      return alert("Error al guardar detalle de venta");
    }

    if (pagosValidos.length > 0) {
      const pagosParaGuardar = pagosValidos.map((p) => ({
        venta_id: venta.id,
        metodo_pago_id: Number(p.metodo_pago_id),
        monto: Number(p.monto),
        referencia: p.referencia?.trim() || null,
        fecha_local: fechaLocal,
      }));

      const { error: errorPagos } = await supabase
        .from("venta_pagos")
        .insert(pagosParaGuardar);

      if (errorPagos) {
        console.error(errorPagos);
        return alert("Error al guardar pagos de la venta");
      }

      const clienteObj = clientes.find(
        (c) => String(c.id) === String(clienteSeleccionado)
      );

      const nombrePaciente =
        clienteObj?.nombre ||
        citaActiva?.cliente_nombre ||
        "Cliente de contado";

      try {
        await registrarPagosEnCajaDiaria({
          nombrePaciente,
          pagosValidos,
          fechaLocal,
        });
      } catch (error) {
        console.error(error);
        return alert("La venta se guardó, pero hubo error al pasarla a caja diaria");
      }
    }

    for (let i of seleccionados) {
      if (i.tipo === "producto") {
        await supabase.from("kardex").insert([
          {
            item_id: i.id,
            tipo: "salida",
            cantidad: i.cantidad,
            motivo: "venta",
            fecha_local: fechaLocal,
          },
        ]);

        await supabase
          .from("items")
          .update({ stock: (i.stock || 0) - i.cantidad })
          .eq("id", i.id);
      }
    }

    if (citaActiva) {
      await supabase
        .from("citas")
        .update({ estado: "atendida" })
        .eq("id", citaActiva.id);
    }

    alert("Venta guardada 💰");

    setSeleccionados([]);
    setClienteSeleccionado("");
    setCitaActiva(null);
    setEstado("pagado");
    setPagos([{ metodo_pago_id: "", monto: "", referencia: "" }]);

    obtenerItems();
  };

  return (
    <>
      <div style={styles.container}>
        <div style={styles.left}>
          <h3>🛒 Productos / Servicios</h3>

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

          <div style={styles.grid}>
            {itemsFiltrados.map((item) => (
              <button
                key={item.id}
                style={{
                  ...styles.itemBtn,
                  background:
                    item.tipo === "producto" && item.stock <= 3
                      ? "#fecaca"
                      : "#dbeafe",
                }}
                onClick={() => agregarItem(item)}
              >
                {item.nombre}
                <br />
                <strong>${Number(item.precio || 0).toFixed(2)}</strong>

                {item.tipo === "producto" && (
                  <div style={styles.stock}>Stock: {item.stock}</div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.right}>
          <h3>🧾 Venta</h3>

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

            <button type="button" style={styles.btnNuevoCliente} onClick={abrirModalCliente}>
              + Cliente
            </button>
          </div>

          {citaActiva && (
            <div style={styles.citaBox}>
              🦷 Cita activa: {citaActiva.servicio}
            </div>
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
            {seleccionados.map((item) => (
              <div key={item.id} style={styles.row}>
                <div>
                  <strong>{item.nombre}</strong>

                  <input
                    type="number"
                    value={item.precio}
                    onChange={(e) =>
                      cambiarPrecio(item.id, Number(e.target.value))
                    }
                    style={styles.precio}
                  />
                </div>

                <div style={styles.controls}>
                  <button onClick={() => cambiarCantidad(item.id, item.cantidad - 1)}>
                    -
                  </button>
                  <span>{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.id, item.cantidad + 1)}>
                    +
                  </button>
                </div>

                <div>
                  ${(Number(item.precio || 0) * Number(item.cantidad || 0)).toFixed(2)}
                </div>

                <button onClick={() => eliminarItem(item.id)}>❌</button>
              </div>
            ))}
          </div>

          <h2>Total: ${total.toFixed(2)}</h2>

          <div style={styles.pagosBox}>
            <div style={styles.pagosHeader}>
              <h3 style={{ margin: 0 }}>💳 Métodos de pago</h3>
              <button type="button" style={styles.btnPago} onClick={agregarFilaPago}>
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
                  onChange={(e) =>
                    actualizarPago(index, "monto", e.target.value)
                  }
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
                  ❌
                </button>
              </div>
            ))}

            <div style={styles.resumenPagos}>
              <div>Total pagado: <strong>${totalPagado.toFixed(2)}</strong></div>
              <div>Saldo pendiente: <strong>${saldoPendiente.toFixed(2)}</strong></div>
            </div>
          </div>

          <button style={styles.btnGuardar} onClick={guardarVenta}>
            💾 Guardar Venta
          </button>
        </div>
      </div>

      {mostrarModalCliente && (
        <div style={styles.modalOverlay} onClick={cerrarModalCliente}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>👤 Nuevo cliente</h3>
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
  container: {
    display: "flex",
    gap: "20px",
    flexWrap: "wrap",
  },
  left: {
    flex: 2,
    minWidth: "300px",
  },
  right: {
    flex: 1,
    minWidth: "320px",
    background: "#f8fafc",
    padding: "15px",
    borderRadius: "10px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: "10px",
  },
  itemBtn: {
    padding: "15px",
    borderRadius: "10px",
    border: "none",
    cursor: "pointer",
  },
  stock: {
    fontSize: "12px",
    marginTop: "5px",
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "10px",
    marginBottom: "10px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    boxSizing: "border-box",
  },
  clienteRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "8px",
    alignItems: "stretch",
    marginBottom: "10px",
  },
  btnNuevoCliente: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  lista: {
    maxHeight: "300px",
    overflow: "auto",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
    gap: "10px",
    flexWrap: "wrap",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },
  precio: {
    width: "70px",
    marginTop: "6px",
  },
  btnGuardar: {
    width: "100%",
    padding: "15px",
    marginTop: "10px",
    background: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    cursor: "pointer",
  },
  citaBox: {
    background: "#fef3c7",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "10px",
  },
  estadoBox: {
    display: "flex",
    gap: "16px",
    marginBottom: "14px",
    padding: "10px",
    background: "#eef2ff",
    borderRadius: "8px",
    flexWrap: "wrap",
  },
  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontWeight: "500",
  },
  pagosBox: {
    marginTop: "16px",
    padding: "12px",
    background: "#ecfeff",
    borderRadius: "10px",
    border: "1px solid #bae6fd",
  },
  pagosHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
    flexWrap: "wrap",
  },
  pagoRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  pagoSelect: {
    flex: 1,
    minWidth: "150px",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #ddd",
  },
  pagoInput: {
    width: "120px",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #ddd",
  },
  referenciaInput: {
    flex: 1,
    minWidth: "180px",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #ddd",
  },
  btnPago: {
    background: "#0284c7",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "8px 12px",
    cursor: "pointer",
  },
  btnEliminarPago: {
    background: "#dc2626",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "8px 10px",
    cursor: "pointer",
  },
  resumenPagos: {
    marginTop: "12px",
    display: "grid",
    gap: "6px",
    fontSize: "15px",
    color: "#0f172a",
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
    borderRadius: "14px",
    padding: "18px",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  btnCerrarModal: {
    background: "#e2e8f0",
    border: "none",
    borderRadius: "8px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "700",
  },
  modalActions: {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
    marginTop: "8px",
  },
  btnGuardarModal: {
    background: "#10b981",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
  btnCancelarModal: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "600",
  },
};

export default Venta;