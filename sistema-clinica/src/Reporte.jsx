import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function Reporte() {
  const [ventas, setVentas] = useState([]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  const empresa = JSON.parse(localStorage.getItem("empresa"));

  const obtenerVentas = async () => {
    if (!empresa) return;

    let query = supabase
      .from("ventas")
      .select(`
        *,
        clientes(nombre),
        detalle_venta(
          cantidad,
          precio,
          items(nombre)
        )
      `)
      .eq("empresa_id", empresa.id)
      .order("fecha_local", { ascending: false });

    if (fechaInicio) {
      query = query.gte("fecha_local", fechaInicio + "T00:00:00");
    }

    if (fechaFin) {
      query = query.lte("fecha_local", fechaFin + "T23:59:59");
    }

    const { data, error } = await query;

    if (error) {
      console.log("Error:", error);
      alert("Error al cargar ventas");
    } else {
      setVentas(data || []);
    }
  };

  useEffect(() => {
    obtenerVentas();
  }, []);

  const total = ventas.reduce((sum, v) => sum + v.total, 0);

  return (
    <div>
      <h2>📊 Reporte de Ventas</h2>

      {/* FILTRO */}
      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <input
          type="date"
          value={fechaInicio}
          onChange={(e) => setFechaInicio(e.target.value)}
        />

        <input
          type="date"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
        />

        <button onClick={obtenerVentas}>Filtrar</button>
      </div>

      <h3>Total: ${total.toFixed(2)}</h3>

      <hr />

      {ventas.length === 0 && <p>No hay ventas</p>}

      {ventas.map((v) => (
        <div
          key={v.id}
          style={{
            marginBottom: 15,
            padding: 10,
            borderRadius: 10,
            background: "#f8fafc",
          }}
        >
          <strong>${v.total}</strong> - {v.estado}

          <br />

          👤 Cliente: {v.clientes?.nombre || "Consumidor final"}

          <br />

          🧾 Detalle:
          <ul>
            {v.detalle_venta.map((d, i) => (
              <li key={i}>
                {d.items?.nombre} x{d.cantidad} - ${d.precio}
              </li>
            ))}
          </ul>

          🕒{" "}
          {new Date(v.fecha_local).toLocaleString("es-SV", {
            timeZone: "America/El_Salvador",
          })}
        </div>
      ))}
    </div>
  );
}

export default Reporte;