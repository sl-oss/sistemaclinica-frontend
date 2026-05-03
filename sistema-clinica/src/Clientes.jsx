import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [empresa, setEmpresa] = useState(
    JSON.parse(localStorage.getItem("empresa") || "null")
  );
  const [empresasUsuario, setEmpresasUsuario] = useState([]);

  useEffect(() => {
    cargarEmpresasUsuario();
  }, []);

  useEffect(() => {
    if (empresa?.id) obtenerClientes();
  }, [empresa?.id]);

  const cargarEmpresasUsuario = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (!userId) {
      setEmpresasUsuario(empresa ? [empresa] : []);
      return;
    }

    const { data, error } = await supabase
      .from("empresa_usuarios")
      .select("empresa_id, empresas(id, nombre)")
      .eq("user_id", userId)
      .eq("activo", true);

    if (error) {
      console.error(error);
      setEmpresasUsuario(empresa ? [empresa] : []);
      return;
    }

    const empresas = (data || [])
      .map((row) => row.empresas)
      .filter(Boolean);

    setEmpresasUsuario(empresas);

    if (empresas.length > 0) {
      const empresaActualExiste = empresas.some((e) => e.id === empresa?.id);
      if (!empresa?.id || !empresaActualExiste) {
        setEmpresa(empresas[0]);
        localStorage.setItem("empresa", JSON.stringify(empresas[0]));
      }
    }
  };

  const cambiarEmpresaActiva = (empresaId) => {
    const seleccionada = empresasUsuario.find((e) => e.id === empresaId);
    if (!seleccionada) return;

    setEmpresa(seleccionada);
    localStorage.setItem("empresa", JSON.stringify(seleccionada));
    setClientes([]);
    setNombre("");
    setTelefono("");
    setBusqueda("");
  };

  const obtenerClientes = async () => {
    if (!empresa?.id) return;

    const { data } = await supabase
      .from("clientes")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("nombre", { ascending: true });

    setClientes(data || []);
  };

  const guardarCliente = async () => {
    if (!empresa?.id) return;
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
    if (!empresa?.id) return;

    const confirmar = window.confirm("¿Eliminar este cliente?");
    if (!confirmar) return;

    await supabase
      .from("clientes")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresa.id);

    obtenerClientes();
  };

  const clientesFiltrados = clientes.filter((c) => {
    const texto = busqueda.toLowerCase();

    return (
      c.nombre?.toLowerCase().includes(texto) ||
      c.telefono?.toLowerCase().includes(texto)
    );
  });

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* HEADER */}
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Pacientes</h1>
            <p style={styles.subtitle}>
              Administrá tu base de clientes/pacientes.
            </p>
          </div>

          <div style={styles.headerInfo}>
            <div><strong>{empresa?.nombre || "Empresa"}</strong></div>
            {empresasUsuario.length > 1 && (
              <select
                style={styles.empresaSelect}
                value={empresa?.id || ""}
                onChange={(e) => cambiarEmpresaActiva(e.target.value)}
              >
                {empresasUsuario.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            )}
            <div>Total registros</div>
            <div><strong>{clientes.length}</strong></div>
          </div>
        </div>

        {/* FORM */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitle}>Nuevo paciente</h3>
            <p style={styles.sectionSubtitle}>
              Registrá un nuevo cliente en el sistema.
            </p>
          </div>

          <div style={styles.form}>
            <input
              style={styles.input}
              placeholder="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Teléfono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />

            <button style={styles.saveBtn} onClick={guardarCliente}>
              Guardar
            </button>
          </div>
        </div>

        {/* BUSCADOR */}
        <div style={styles.card}>
          <input
            style={styles.input}
            placeholder="🔍 Buscar cliente por nombre o teléfono..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {/* LISTA */}
        <div style={styles.grid}>
          {clientesFiltrados.map((c) => (
            <div key={c.id} style={styles.cardCliente}>
              <div>
                <strong style={styles.nombre}>{c.nombre}</strong>
                <div style={styles.telefono}>
                  📞 {c.telefono || "Sin teléfono"}
                </div>
              </div>

              <button
                style={styles.deleteBtn}
                onClick={() => eliminarCliente(c.id)}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>

        {clientesFiltrados.length === 0 && (
          <div style={styles.empty}>No se encontraron clientes</div>
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

  headerInfo: {
    textAlign: "right",
    fontSize: "14px",
    color: "#1f2937",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "18px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  cardHeader: {
    marginBottom: "10px",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "18px",
  },

  sectionSubtitle: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  form: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 150px",
    gap: "12px",
  },

  input: {
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
  },

  saveBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    fontWeight: "700",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "14px",
  },

  cardCliente: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  nombre: {
    fontSize: "16px",
    color: "#1f2937",
  },

  telefono: {
    marginTop: "4px",
    color: "#64748b",
    fontSize: "14px",
  },

  deleteBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "10px",
    padding: "8px 12px",
    fontWeight: "600",
  },


  empresaSelect: {
    width: "100%",
    margin: "6px 0",
    padding: "8px 10px",
    borderRadius: "10px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    color: "#1f2937",
    fontSize: "13px",
  },

  empty: {
    textAlign: "center",
    padding: "20px",
    color: "#64748b",
  },
};

export default Clientes;