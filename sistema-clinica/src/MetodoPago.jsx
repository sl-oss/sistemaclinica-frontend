import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function MetodoPago() {
  const [metodos, setMetodos] = useState([]);
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(false);

  const [empresa, setEmpresa] = useState(() =>
    JSON.parse(localStorage.getItem("empresa") || "null")
  );
  const [empresasUsuario, setEmpresasUsuario] = useState([]);
  const [cargandoEmpresas, setCargandoEmpresas] = useState(false);

  useEffect(() => {
    cargarEmpresasUsuario();
  }, []);

  const cargarEmpresasUsuario = async () => {
    setCargandoEmpresas(true);

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user?.id) {
      setCargandoEmpresas(false);
      return;
    }

    const { data, error } = await supabase
      .from("empresa_usuarios")
      .select("empresa_id, empresas(id, nombre)")
      .eq("user_id", authData.user.id)
      .eq("activo", true);

    setCargandoEmpresas(false);

    if (error) {
      console.error("Error cargando empresas del usuario:", error);
      return;
    }

    const empresas = (data || [])
      .map((row) => row.empresas)
      .filter(Boolean);

    setEmpresasUsuario(empresas);

    const empresaGuardada = JSON.parse(localStorage.getItem("empresa") || "null");
    const empresaValida = empresas.find((e) => String(e.id) === String(empresaGuardada?.id));

    if (!empresaValida && empresas.length > 0) {
      localStorage.setItem("empresa", JSON.stringify(empresas[0]));
      setEmpresa(empresas[0]);
    } else if (empresaValida) {
      localStorage.setItem("empresa", JSON.stringify(empresaValida));
      setEmpresa(empresaValida);
    }
  };

  const cambiarEmpresaActiva = (empresaId) => {
    const seleccionada = empresasUsuario.find((e) => String(e.id) === String(empresaId));
    if (!seleccionada) return;

    localStorage.setItem("empresa", JSON.stringify(seleccionada));
    setEmpresa(seleccionada);
  };

  useEffect(() => {
    if (!empresa?.id) {
      setMetodos([]);
      return;
    }

    cargarMetodos();
  }, [empresa?.id]);

  const cargarMetodos = async () => {
    if (!empresa?.id) return;

    const { data, error } = await supabase
      .from("metodos_pago")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("orden", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al cargar métodos de pago");
      return;
    }

    setMetodos(data || []);
  };

  const existeNombreEnEmpresa = (nombreEvaluar) => {
    return metodos.some(
      (m) => m.nombre.trim().toLowerCase() === nombreEvaluar.trim().toLowerCase()
    );
  };

  const agregarMetodo = async (e) => {
    e.preventDefault();

    if (!empresa?.id) {
      return alert("No hay empresa seleccionada");
    }

    if (!nombre.trim()) {
      return alert("Escribí el nombre del método de pago");
    }

    if (existeNombreEnEmpresa(nombre)) {
      return alert("Ya existe un método con ese nombre en esta empresa");
    }

    setLoading(true);

    const siguienteOrden =
      metodos.length > 0
        ? Math.max(...metodos.map((m) => Number(m.orden) || 0)) + 1
        : 1;

    const { error } = await supabase.from("metodos_pago").insert([
      {
        empresa_id: empresa.id,
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

  const duplicarMetodo = async (metodo) => {
    if (!empresa?.id) return;

    const baseNombre = `${metodo.nombre} (Copia)`;
    let nuevoNombre = baseNombre;
    let contador = 2;

    while (existeNombreEnEmpresa(nuevoNombre)) {
      nuevoNombre = `${metodo.nombre} (Copia ${contador})`;
      contador++;
    }

    const siguienteOrden =
      metodos.length > 0
        ? Math.max(...metodos.map((m) => Number(m.orden) || 0)) + 1
        : 1;

    const { error } = await supabase.from("metodos_pago").insert([
      {
        empresa_id: empresa.id,
        nombre: nuevoNombre,
        activo: metodo.activo,
        orden: siguienteOrden,
        es_fijo: false,
      },
    ]);

    if (error) {
      console.error(error);
      alert("No se pudo duplicar el método");
      return;
    }

    cargarMetodos();
  };

  const cambiarActivo = async (id, activo) => {
    if (!empresa?.id) return;

    const { error } = await supabase
      .from("metodos_pago")
      .update({ activo: !activo })
      .eq("id", id)
      .eq("empresa_id", empresa.id);

    if (error) {
      console.error(error);
      alert("No se pudo actualizar el estado");
      return;
    }

    cargarMetodos();
  };

  const mover = async (index, direccion) => {
    if (!empresa?.id) return;

    const nuevoIndex = direccion === "up" ? index - 1 : index + 1;
    if (nuevoIndex < 0 || nuevoIndex >= metodos.length) return;

    const actual = metodos[index];
    const destino = metodos[nuevoIndex];

    const { error: error1 } = await supabase
      .from("metodos_pago")
      .update({ orden: destino.orden })
      .eq("id", actual.id)
      .eq("empresa_id", empresa.id);

    const { error: error2 } = await supabase
      .from("metodos_pago")
      .update({ orden: actual.orden })
      .eq("id", destino.id)
      .eq("empresa_id", empresa.id);

    if (error1 || error2) {
      console.error(error1 || error2);
      alert("No se pudo cambiar el orden");
      return;
    }

    cargarMetodos();
  };

  const eliminarMetodo = async (metodo) => {
    if (!empresa?.id) return;

    if (metodo.es_fijo) {
      alert("Este método no se puede eliminar");
      return;
    }

    const confirmar = window.confirm(`¿Eliminar el método "${metodo.nombre}"?`);
    if (!confirmar) return;

    const { error } = await supabase
      .from("metodos_pago")
      .delete()
      .eq("id", metodo.id)
      .eq("empresa_id", empresa.id);

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

          <div style={styles.headerInfo}>
            {empresasUsuario.length > 1 ? (
              <select
                value={empresa?.id || ""}
                onChange={(e) => cambiarEmpresaActiva(e.target.value)}
                style={styles.empresaSelect}
                disabled={cargandoEmpresas}
              >
                {empresasUsuario.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <div><strong>{empresa?.nombre || "Empresa"}</strong></div>
            )}
            <div>Módulo de métodos de pago</div>
            <div>Registros: <strong>{metodos.length}</strong></div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Nuevo método</h3>
              <p style={styles.sectionSubtitle}>
                Agregá formas de cobro para usarlas en ventas, abonos y caja diaria.
              </p>
            </div>
          </div>

          <form onSubmit={agregarMetodo} style={styles.form}>
            <div style={styles.inputWrap}>
              <label style={styles.label}>Nombre del método</label>
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
                opacity: loading ? 0.85 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Guardando..." : "Agregar"}
            </button>
          </form>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Listado de métodos</h3>
              <p style={styles.sectionSubtitle}>
                Podés ordenar, duplicar, activar, desactivar o eliminar métodos.
              </p>
            </div>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={{ ...styles.th, width: 90 }}>Orden</th>
                  <th style={styles.th}>Nombre</th>
                  <th style={{ ...styles.th, width: 110 }}>Activo</th>
                  <th style={{ ...styles.th, width: 90 }}>Fijo</th>
                  <th style={{ ...styles.th, width: 420 }}>Acciones</th>
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
                          background: metodo.activo ? "#eefcf3" : "#f8f8fa",
                          color: metodo.activo ? "#0f7a4d" : "#475569",
                          borderColor: metodo.activo ? "#c7eed5" : "#d7dbe2",
                        }}
                      >
                        {metodo.activo ? "Sí" : "No"}
                      </span>
                    </td>

                    <td style={styles.tdCenter}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          background: metodo.es_fijo ? "#f4f0f7" : "#fff7ed",
                          color: metodo.es_fijo ? "#574866" : "#9a3412",
                          borderColor: metodo.es_fijo ? "#d3c7dd" : "#fed7aa",
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
                          onClick={() => duplicarMetodo(metodo)}
                          style={styles.duplicateBtn}
                        >
                          Duplicar
                        </button>

                        <button
                          type="button"
                          onClick={() => cambiarActivo(metodo.id, metodo.activo)}
                          style={metodo.activo ? styles.disableBtn : styles.enableBtn}
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
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
    alignItems: "center",
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
    color: "#1f2937",
    fontSize: 14,
    lineHeight: 1.6,
  },

  card: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  cardHeader: {
    marginBottom: 14,
  },

  sectionTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#1f2937",
  },

  sectionSubtitle: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
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
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "12px 16px",
    fontWeight: "700",
    fontSize: "14px",
  },

  tableWrap: {
    overflowX: "auto",
    border: "1px solid #d7dbe2",
    borderRadius: "18px",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "820px",
  },

  theadRow: {
    background: "#f4f0f7",
  },

  th: {
    padding: "14px 12px",
    textAlign: "left",
    color: "#574866",
    fontWeight: "700",
    fontSize: "14px",
    borderBottom: "1px solid #d7dbe2",
  },

  tr: {
    borderBottom: "1px solid #eef2f7",
  },

  td: {
    padding: "14px 12px",
    color: "#334155",
    fontSize: "14px",
    verticalAlign: "middle",
  },

  tdCenter: {
    padding: "14px 12px",
    color: "#334155",
    fontSize: "14px",
    textAlign: "center",
    verticalAlign: "middle",
  },

  orderBadge: {
    display: "inline-flex",
    minWidth: "34px",
    height: "34px",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    background: "#f4f0f7",
    color: "#574866",
    fontWeight: "700",
    border: "1px solid #d3c7dd",
  },

  nombreMetodo: {
    fontWeight: "700",
    color: "#1f2937",
  },

  statusBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid transparent",
  },

  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  moveBtn: {
    background: "#f8f8fa",
    color: "#1f2937",
    border: "1px solid #d7dbe2",
    borderRadius: "10px",
    padding: "8px 11px",
    cursor: "pointer",
    fontWeight: "700",
  },

  duplicateBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  disableBtn: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  enableBtn: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
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