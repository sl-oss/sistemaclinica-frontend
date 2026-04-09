import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

function Items() {
  const [items, setItems] = useState([]);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [stock, setStock] = useState("");
  const [tipo, setTipo] = useState("producto");

  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const [kardex, setKardex] = useState([]);
  const [itemKardex, setItemKardex] = useState(null);

  const empresa = JSON.parse(localStorage.getItem("empresa") || "null");

  useEffect(() => {
    if (empresa) obtenerItems();
  }, []);

  const obtenerItems = async () => {
    const { data } = await supabase
      .from("items")
      .select("*")
      .eq("empresa_id", empresa.id);

    setItems(data || []);
  };

  const getFechaLocal = () => {
    return new Date()
      .toLocaleString("sv-SE", {
        timeZone: "America/El_Salvador",
      })
      .replace(" ", "T");
  };

  const guardarItem = async () => {
    if (!nombre || !precio) return alert("Faltan datos");

    const { data } = await supabase
      .from("items")
      .insert([
        {
          nombre,
          precio: Number(precio),
          stock: tipo === "producto" ? Number(stock || 0) : null,
          tipo,
          empresa_id: empresa.id,
        },
      ])
      .select()
      .single();

    if (tipo === "producto" && Number(stock) > 0) {
      await supabase.from("kardex").insert([
        {
          item_id: data.id,
          tipo: "entrada",
          cantidad: Number(stock),
          motivo: "Stock inicial",
          fecha_local: getFechaLocal(),
        },
      ]);
    }

    setNombre("");
    setPrecio("");
    setStock("");

    obtenerItems();
  };

  const eliminarItem = async (id) => {
    await supabase.from("items").delete().eq("id", id);
    obtenerItems();
  };

  const agregarStock = async (item) => {
    const cantidad = prompt("Cantidad a agregar:");

    if (!cantidad || Number(cantidad) <= 0) return;

    await supabase.from("kardex").insert([
      {
        item_id: item.id,
        tipo: "entrada",
        cantidad: Number(cantidad),
        motivo: "Reposición de stock",
        fecha_local: getFechaLocal(),
      },
    ]);

    await supabase
      .from("items")
      .update({ stock: item.stock + Number(cantidad) })
      .eq("id", item.id);

    obtenerItems();
  };

  const verKardex = async (item) => {
    const { data } = await supabase
      .from("kardex")
      .select("*")
      .eq("item_id", item.id)
      .order("fecha_local", { ascending: false });

    setItemKardex(item);
    setKardex(data || []);
  };

  const exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kardex");

    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 25 },
      { header: "Tipo", key: "tipo", width: 15 },
      { header: "Entrada", key: "entrada", width: 15 },
      { header: "Salida", key: "salida", width: 15 },
      { header: "Saldo", key: "saldo", width: 15 },
      { header: "Motivo", key: "motivo", width: 40 },
    ];

    let saldo = 0;
    const movimientos = [...kardex].reverse();

    movimientos.forEach((k) => {
      let entrada = 0;
      let salida = 0;

      if (k.tipo === "entrada") {
        entrada = k.cantidad;
        saldo += k.cantidad;
      } else {
        salida = k.cantidad;
        saldo -= k.cantidad;
      }

      sheet.addRow({
        fecha: new Date(k.fecha_local || k.created_at).toLocaleString("es-SV"),
        tipo: k.tipo,
        entrada,
        salida,
        saldo,
        motivo: k.motivo,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), "kardex.xlsx");
  };

  const itemsFiltrados = items.filter((item) => {
    const coincideBusqueda = item.nombre
      .toLowerCase()
      .includes(busqueda.toLowerCase());

    const coincideTipo =
      filtroTipo === "todos" || item.tipo === filtroTipo;

    return coincideBusqueda && coincideTipo;
  });

  return (
    <div>
      <h2>📦 Inventario</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input placeholder="Precio" type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} />

        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="producto">Producto</option>
          <option value="servicio">Servicio</option>
        </select>

        {tipo === "producto" && (
          <input placeholder="Stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
        )}

        <button onClick={guardarItem}>Guardar</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          placeholder="🔍 Buscar..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="producto">Productos</option>
          <option value="servicio">Servicios</option>
        </select>
      </div>

      {itemsFiltrados.map((item) => (
        <div
          key={item.id}
          style={{
            marginBottom: 10,
            padding: 10,
            borderRadius: 8,
            background:
              item.tipo === "producto"
                ? item.stock <= 3
                  ? "#fee2e2"
                  : "#f1f5f9"
                : "#e0f2fe",
          }}
        >
          <strong>{item.nombre}</strong> - ${item.precio}
          <br />

          {item.tipo === "producto" && (
            <>
              Stock: <strong>{item.stock}</strong>

              {item.stock <= 3 && (
                <div style={{ color: "red", fontSize: 12 }}>
                  ⚠️ Stock bajo
                </div>
              )}

              <div style={{ marginTop: 5 }}>
                <button onClick={() => agregarStock(item)}>➕ Stock</button>
                <button onClick={() => verKardex(item)}>📊 Kardex</button>
              </div>
            </>
          )}

          <br />
          <button onClick={() => eliminarItem(item.id)}>❌</button>
        </div>
      ))}

      {itemKardex && (
  <div style={{ marginTop: 20 }}>
    <h3>📊 Kardex - {itemKardex.nombre}</h3>

    <button onClick={exportarExcel}>📥 Exportar Excel</button>

    <div
      style={{
        marginTop: 10,
        maxHeight: "200px", // 🔥 LIMITE DE ALTURA
        overflowY: "auto",  // 🔥 SCROLL VERTICAL
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "5px",
        background: "#fff",
      }}
    >
      {kardex.map((k) => (
        <div
          key={k.id}
          style={{
            borderBottom: "1px solid #eee",
            padding: 8,
          }}
        >
          <strong>{k.tipo}</strong> - {k.cantidad}

          <div
            style={{
              fontSize: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {k.motivo}
          </div>

          <div style={{ fontSize: 12 }}>
            {k.fecha_local
              ? new Date(k.fecha_local).toLocaleString("es-SV", {
                  timeZone: "America/El_Salvador",
                })
              : new Date(k.created_at).toLocaleString("es-SV", {
                  timeZone: "America/El_Salvador",
                })}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
    </div>
  );
}

export default Items;