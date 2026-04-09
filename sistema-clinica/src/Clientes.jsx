import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const empresa = JSON.parse(localStorage.getItem("empresa"));

  useEffect(() => {
    obtenerClientes();
  }, []);

  const obtenerClientes = async () => {
    const { data } = await supabase
      .from("clientes")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("nombre", { ascending: true });

    setClientes(data || []);
  };

  const guardarCliente = async () => {
    if (!nombre) return alert("Nombre requerido");

    await supabase.from("clientes").insert([
      {
        nombre,
        telefono,
        empresa_id: empresa.id,
      },
    ]);

    setNombre("");
    setTelefono("");

    obtenerClientes();
  };

  const eliminarCliente = async (id) => {
    await supabase.from("clientes").delete().eq("id", id);
    obtenerClientes();
  };

  // 🔥 BUSCADOR INTELIGENTE
  const clientesFiltrados = clientes.filter((c) => {
    const texto = busqueda.toLowerCase();

    return (
      c.nombre?.toLowerCase().includes(texto) ||
      c.telefono?.toLowerCase().includes(texto)
    );
  });

  return (
    <div>
      <h2>👤 Pacientes</h2>

      {/* 🔥 FORM */}
      <div style={{ display: "flex", gap: 10 }}>
        <input
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />

        <input
          placeholder="Teléfono"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />

        <button onClick={guardarCliente}>Guardar</button>
      </div>

      <hr />

      {/* 🔥 BUSCADOR */}
      <input
        style={{ marginBottom: 10, width: "100%", padding: 8 }}
        placeholder="🔍 Buscar cliente por nombre o teléfono..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {/* 🔥 LISTA */}
      {clientesFiltrados.map((c) => (
        <div
          key={c.id}
          style={{
            marginBottom: 10,
            padding: 10,
            border: "1px solid #eee",
            borderRadius: 8,
          }}
        >
          <strong>{c.nombre}</strong>
          <br />
          📞 {c.telefono || "Sin teléfono"}

          <div>
            <button onClick={() => eliminarCliente(c.id)}>❌ Eliminar</button>
          </div>
        </div>
      ))}

      {clientesFiltrados.length === 0 && (
        <p>No se encontraron clientes</p>
      )}
    </div>
  );
}

export default Clientes;