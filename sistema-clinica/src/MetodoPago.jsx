import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function MetodoPago() {
  const [metodos, setMetodos] = useState([]);
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cargarMetodos();
  }, []);

  const cargarMetodos = async () => {
    const { data, error } = await supabase
      .from("metodos_pago")
      .select("*")
      .order("orden", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al cargar métodos de pago");
      return;
    }

    setMetodos(data || []);
  };

  const agregarMetodo = async (e) => {
    e.preventDefault();

    if (!nombre.trim()) {
      alert("Escribí el nombre del método de pago");
      return;
    }

    setLoading(true);

    const siguienteOrden =
      metodos.length > 0
        ? Math.max(...metodos.map((m) => Number(m.orden) || 0)) + 1
        : 1;

    const { error } = await supabase.from("metodos_pago").insert([
      {
        nombre: nombre.trim(),
        activo: true,
        orden: siguienteOrden,
        es_fijo: false,
      },
    ]);

    setLoading(false);

    if (error) {
      console.error(error);
      alert("No se pudo guardar el método");
      return;
    }

    setNombre("");
    cargarMetodos();
  };

  const cambiarActivo = async (id, activo) => {
    const { error } = await supabase
      .from("metodos_pago")
      .update({ activo: !activo })
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("No se pudo actualizar el estado");
      return;
    }

    cargarMetodos();
  };

  const mover = async (index, direccion) => {
    const nuevoIndex = direccion === "up" ? index - 1 : index + 1;
    if (nuevoIndex < 0 || nuevoIndex >= metodos.length) return;

    const actual = metodos[index];
    const destino = metodos[nuevoIndex];

    const { error: error1 } = await supabase
      .from("metodos_pago")
      .update({ orden: destino.orden })
      .eq("id", actual.id);

    const { error: error2 } = await supabase
      .from("metodos_pago")
      .update({ orden: actual.orden })
      .eq("id", destino.id);

    if (error1 || error2) {
      console.error(error1 || error2);
      alert("No se pudo cambiar el orden");
      return;
    }

    cargarMetodos();
  };

  const eliminarMetodo = async (metodo) => {
    if (metodo.es_fijo) {
      alert("Este método no se puede eliminar");
      return;
    }

    const confirmar = window.confirm(
      `¿Eliminar el método "${metodo.nombre}"?`
    );
    if (!confirmar) return;

    const { error } = await supabase
      .from("metodos_pago")
      .delete()
      .eq("id", metodo.id);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar. Puede que esté siendo usado.");
      return;
    }

    cargarMetodos();
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Métodos de Cobro</h1>
            <p style={styles.subtitle}>
              Administrá los métodos que usarás en ventas, deudas y caja diaria.
            </p>
          </div>
        </div>

        <div style={styles.card}>
          <form onSubmit={agregarMetodo} style={styles.form}>
            <div style={styles.inputWrap}>
              <label style={styles.label}>Nuevo método</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Banco Agrícola, POS BAC, Caja Chica..."
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.addBtn,
                opacity: loading ? 0.8 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Guardando..." : "Agregar"}
            </button>
          </form>
        </div>

        <div style={styles.card}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={{ ...styles.th, width: 90 }}>Orden</th>
                  <th style={styles.th}>Nombre</th>
                  <th style={{ ...styles.th, width: 110 }}>Activo</th>
                  <th style={{ ...styles.th, width: 90 }}>Fijo</th>
                  <th style={{ ...styles.th, width: 320 }}>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {metodos.map((metodo, index) => (
                  <tr key={metodo.id} style={styles.tr}>
                    <td style={styles.tdCenter}>
                      <span style={styles.orderBadge}>{metodo.orden}</span>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.nombreMetodo}>{metodo.nombre}</div>
                    </td>

                    <td style={styles.tdCenter}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          background: metodo.activo ? "#e7f8ee" : "#f1f5f9",
                          color: metodo.activo ? "#15803d" : "#475569",
                          borderColor: metodo.activo ? "#bbf7d0" : "#cbd5e1",
                        }}
                      >
                        {metodo.activo ? "Sí" : "No"}
                      </span>
                    </td>

                    <td style={styles.tdCenter}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          background: metodo.es_fijo ? "#eef2ff" : "#fff7ed",
                          color: metodo.es_fijo ? "#4338ca" : "#9a3412",
                          borderColor: metodo.es_fijo ? "#c7d2fe" : "#fed7aa",
                        }}
                      >
                        {metodo.es_fijo ? "Sí" : "No"}
                      </span>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.actions}>
                        <button
                          type="button"
                          onClick={() => mover(index, "up")}
                          style={styles.moveBtn}
                          title="Subir"
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          onClick={() => mover(index, "down")}
                          style={styles.moveBtn}
                          title="Bajar"
                        >
                          ↓
                        </button>

                        <button
                          type="button"
                          onClick={() => cambiarActivo(metodo.id, metodo.activo)}
                          style={
                            metodo.activo ? styles.disableBtn : styles.enableBtn
                          }
                        >
                          {metodo.activo ? "Desactivar" : "Activar"}
                        </button>

                        <button
                          type="button"
                          onClick={() => eliminarMetodo(metodo)}
                          style={{
                            ...styles.deleteBtn,
                            opacity: metodo.es_fijo ? 0.55 : 1,
                            cursor: metodo.es_fijo ? "not-allowed" : "pointer",
                          }}
                          disabled={metodo.es_fijo}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {metodos.length === 0 && (
                  <tr>
                    <td colSpan="5" style={styles.emptyTd}>
                      No hay métodos registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
    maxWidth: "1080px",
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
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.04)",
  },
  form: {
    display: "grid",
    gridTemplateColumns: "1fr 170px",
    gap: "14px",
    alignItems: "end",
  },
  inputWrap: {
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
  addBtn: {
    background: "#255dcf",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "12px 16px",
    fontWeight: "700",
    fontSize: "14px",
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "820px",
  },
  theadRow: {
    background: "#f3f7fb",
  },
  th: {
    padding: "14px 12px",
    textAlign: "left",
    color: "#20364f",
    fontWeight: "700",
    fontSize: "14px",
    borderBottom: "1px solid #e2e8f0",
  },
  tr: {
    borderBottom: "1px solid #edf2f7",
  },
  td: {
    padding: "14px 12px",
    verticalAlign: "middle",
  },
  tdCenter: {
    padding: "14px 12px",
    textAlign: "center",
    verticalAlign: "middle",
  },
  orderBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "34px",
    height: "34px",
    borderRadius: "999px",
    background: "#eef6ff",
    color: "#1d4ed8",
    fontWeight: "700",
    border: "1px solid #cfe0ff",
  },
  nombreMetodo: {
    fontWeight: "700",
    color: "#10243e",
    fontSize: "15px",
  },
  statusBadge: {
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid transparent",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "center",
  },
  moveBtn: {
    background: "#eef2f7",
    color: "#334155",
    border: "1px solid #d6dde6",
    borderRadius: "10px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "700",
    minWidth: "42px",
  },
  enableBtn: {
    background: "#e7f8ee",
    color: "#15803d",
    border: "1px solid #bbf7d0",
    borderRadius: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },
  disableBtn: {
    background: "#fff7d6",
    color: "#a16207",
    border: "1px solid #fde68a",
    borderRadius: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },
  deleteBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "10px",
    padding: "8px 12px",
    fontWeight: "700",
  },
  emptyTd: {
    textAlign: "center",
    padding: "24px",
    color: "#64748b",
    fontSize: "14px",
  },
};