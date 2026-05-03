import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function EmpleadosComision() {
  const empresa = JSON.parse(localStorage.getItem("empresa") || "null");

  const [empleados, setEmpleados] = useState([]);
  const [nombre, setNombre] = useState("");
  const [editando, setEditando] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cargarEmpleados();
  }, [empresa?.id]);

  const cargarEmpleados = async () => {
    if (!empresa?.id) return;

    const { data, error } = await supabase
      .from("empleados_comision")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      return alert("Error al cargar empleados");
    }

    setEmpleados(data || []);
  };

  const limpiar = () => {
    setNombre("");
    setEditando(null);
  };

  const guardar = async () => {
    if (!empresa?.id) return alert("No hay empresa activa");
    if (!nombre.trim()) return alert("Escribe el nombre del empleado");

    setLoading(true);

    if (editando) {
      const { error } = await supabase
        .from("empleados_comision")
        .update({ nombre: nombre.trim() })
        .eq("id", editando.id);

      setLoading(false);

      if (error) {
        console.error(error);
        return alert("Error al actualizar empleado");
      }
    } else {
      const { error } = await supabase
        .from("empleados_comision")
        .insert([
          {
            empresa_id: empresa.id,
            nombre: nombre.trim(),
            activo: true,
          },
        ]);

      setLoading(false);

      if (error) {
        console.error(error);
        return alert("Error al guardar empleado");
      }
    }

    limpiar();
    await cargarEmpleados();
  };

  const editar = (empleado) => {
    setEditando(empleado);
    setNombre(empleado.nombre || "");
  };

  const cambiarActivo = async (empleado) => {
    const { error } = await supabase
      .from("empleados_comision")
      .update({ activo: !empleado.activo })
      .eq("id", empleado.id);

    if (error) {
      console.error(error);
      return alert("Error al cambiar estado");
    }

    await cargarEmpleados();
  };

  const eliminar = async (empleado) => {
    const confirmar = window.confirm(`¿Eliminar a ${empleado.nombre}?`);
    if (!confirmar) return;

    const { error } = await supabase
      .from("empleados_comision")
      .delete()
      .eq("id", empleado.id);

    if (error) {
      console.error(error);
      return alert("Error al eliminar empleado");
    }

    await cargarEmpleados();
  };

  if (!empresa?.id) {
    return <div style={styles.card}>No hay empresa activa.</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerCard}>
        <div>
          <h1 style={styles.title}>Empleados de comisión</h1>
          <p style={styles.subtitle}>
            Agregá los nombres que aparecerán en el reporte de comisiones.
          </p>
        </div>
        <span style={styles.badge}>{empresa.nombre}</span>
      </div>

      <div style={styles.card}>
        <div style={styles.formGrid}>
          <div>
            <label style={styles.label}>Nombre del empleado</label>
            <input
              style={styles.input}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Claudia Elena Urrutia"
            />
          </div>

          <button style={styles.primaryBtn} onClick={guardar} disabled={loading}>
            {loading ? "Guardando..." : editando ? "Actualizar" : "Guardar"}
          </button>

          <button style={styles.secondaryBtn} onClick={limpiar}>
            Limpiar
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Empleado</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {empleados.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan="3">
                    No hay empleados registrados.
                  </td>
                </tr>
              ) : (
                empleados.map((empleado) => (
                  <tr key={empleado.id}>
                    <td style={styles.td}>{empleado.nombre}</td>
                    <td style={styles.td}>
                      <span style={styles.badge}>
                        {empleado.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actions}>
                        <button style={styles.secondaryBtn} onClick={() => editar(empleado)}>
                          Editar
                        </button>
                        <button style={styles.secondaryBtn} onClick={() => cambiarActivo(empleado)}>
                          {empleado.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button style={styles.dangerBtn} onClick={() => eliminar(empleado)}>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


const styles = {
  page: {
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
  card: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    alignItems: "end",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    color: "#4b5f78",
    fontWeight: "700",
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
  primaryBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: "800",
  },
  secondaryBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: "800",
  },
  dangerBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "800",
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "720px",
  },
  th: {
    padding: "14px 12px",
    textAlign: "left",
    color: "#574866",
    fontWeight: "800",
    background: "#f4f0f7",
    borderBottom: "1px solid #e2e8f0",
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid #edf2f7",
    color: "#1f2937",
  },
  badge: {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: "999px",
    fontWeight: "800",
    fontSize: "12px",
    border: "1px solid #d7dbe2",
    background: "#f8f8fa",
    color: "#475569",
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
};


export default EmpleadosComision;
