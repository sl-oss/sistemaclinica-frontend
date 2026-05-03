import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function ClasificacionesPacientes() {
  const empresaInicial = JSON.parse(localStorage.getItem("empresa") || "null");

  const [empresaGuardar, setEmpresaGuardar] = useState(empresaInicial);
  const [empresasDisponibles, setEmpresasDisponibles] = useState(
    empresaInicial?.id ? [empresaInicial] : []
  );
  const [empresasVistaIds, setEmpresasVistaIds] = useState(() => {
    const guardadas = JSON.parse(localStorage.getItem("empresas_clasificaciones_vista_ids") || "null");
    if (Array.isArray(guardadas) && guardadas.length > 0) return guardadas;
    return empresaInicial?.id ? [empresaInicial.id] : [];
  });
  const [mostrarSelectorEmpresas, setMostrarSelectorEmpresas] = useState(false);

  const [clasificaciones, setClasificaciones] = useState([]);
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [loading, setLoading] = useState(false);

  const idsVista = useMemo(() => {
    if (empresasVistaIds.length > 0) return empresasVistaIds;
    return empresaGuardar?.id ? [empresaGuardar.id] : [];
  }, [empresasVistaIds, empresaGuardar?.id]);

  const modoMultiempresa = idsVista.length > 1;

  const nombreEmpresasVista = useMemo(() => {
    const seleccionadas = empresasDisponibles.filter((emp) =>
      idsVista.some((id) => String(id) === String(emp.id))
    );

    if (seleccionadas.length === 0) return empresaGuardar?.nombre || "Empresa activa";
    if (seleccionadas.length === 1) return seleccionadas[0].nombre;
    return `${seleccionadas.length} empresas seleccionadas`;
  }, [empresasDisponibles, idsVista, empresaGuardar?.nombre]);

  useEffect(() => {
    cargarEmpresasDisponibles();
  }, []);

  useEffect(() => {
    if (idsVista.length > 0) {
      cargarClasificaciones();
    }
  }, [idsVista.join("|")]);

  const cargarEmpresasDisponibles = async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        console.error(userError);
        return;
      }

      const userId = userData?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from("empresa_usuarios")
        .select(`
          empresa_id,
          activo,
          empresas (
            id,
            nombre
          )
        `)
        .eq("user_id", userId)
        .eq("activo", true);

      if (error) {
        console.error(error);
        alert("Error al cargar empresas disponibles");
        return;
      }

      const mapa = new Map();

      (data || [])
        .map((item) => item.empresas)
        .filter(Boolean)
        .forEach((emp) => mapa.set(emp.id, emp));

      if (empresaInicial?.id) mapa.set(empresaInicial.id, empresaInicial);

      const lista = Array.from(mapa.values());
      setEmpresasDisponibles(lista);

      if (lista.length > 0) {
        const idsDisponibles = lista.map((emp) => String(emp.id));

        if (!empresaGuardar?.id || !idsDisponibles.includes(String(empresaGuardar.id))) {
          setEmpresaGuardar(lista[0]);
        }

        const idsValidos = empresasVistaIds.filter((id) =>
          idsDisponibles.includes(String(id))
        );

        if (idsValidos.length > 0) {
          setEmpresasVistaIds(idsValidos);
          localStorage.setItem("empresas_clasificaciones_vista_ids", JSON.stringify(idsValidos));
        } else if (empresaInicial?.id && idsDisponibles.includes(String(empresaInicial.id))) {
          setEmpresasVistaIds([empresaInicial.id]);
          localStorage.setItem("empresas_clasificaciones_vista_ids", JSON.stringify([empresaInicial.id]));
        } else {
          setEmpresasVistaIds([lista[0].id]);
          localStorage.setItem("empresas_clasificaciones_vista_ids", JSON.stringify([lista[0].id]));
        }
      }
    } catch (error) {
      console.error("Error cargando empresas:", error);
    }
  };

  const obtenerNombreEmpresa = (empresaId) => {
    return (
      empresasDisponibles.find((emp) => String(emp.id) === String(empresaId))?.nombre ||
      empresaGuardar?.nombre ||
      "Empresa"
    );
  };

  const seleccionarSoloActiva = () => {
    if (!empresaGuardar?.id) return;

    setEmpresasVistaIds([empresaGuardar.id]);
    localStorage.setItem("empresas_clasificaciones_vista_ids", JSON.stringify([empresaGuardar.id]));
  };

  const seleccionarTodas = () => {
    const ids = empresasDisponibles.map((emp) => emp.id).filter(Boolean);
    if (!ids.length) return;

    setEmpresasVistaIds(ids);
    localStorage.setItem("empresas_clasificaciones_vista_ids", JSON.stringify(ids));
  };

  const alternarEmpresaVista = (empresaId) => {
    setEmpresasVistaIds((prev) => {
      const existe = prev.some((id) => String(id) === String(empresaId));
      let nuevos = existe
        ? prev.filter((id) => String(id) !== String(empresaId))
        : [...prev, empresaId];

      if (nuevos.length === 0) nuevos = [empresaId];

      localStorage.setItem("empresas_clasificaciones_vista_ids", JSON.stringify(nuevos));
      return nuevos;
    });
  };

  const cambiarEmpresaGuardar = (empresaId) => {
    const seleccionada = empresasDisponibles.find((emp) => String(emp.id) === String(empresaId));
    if (!seleccionada) return;

    setEmpresaGuardar(seleccionada);

    if (editandoId) {
      limpiarFormulario();
    }
  };

  const cargarClasificaciones = async () => {
    if (idsVista.length === 0) return;

    const { data, error } = await supabase
      .from("clasificaciones_pacientes")
      .select("*")
      .in("empresa_id", idsVista)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al cargar clasificaciones");
      return;
    }

    setClasificaciones(data || []);
  };

  const limpiarFormulario = () => {
    setNombre("");
    setMonto("");
    setEditandoId(null);
  };

  const guardar = async () => {
    if (!empresaGuardar?.id) return alert("No hay empresa seleccionada para guardar");
    if (!nombre.trim()) return alert("Escribe el nombre de la clasificación");

    setLoading(true);

    const payload = {
      nombre: nombre.trim(),
      monto: Number(monto || 0),
      activo: true,
    };

    let error = null;

    if (editandoId) {
      const actual = clasificaciones.find((c) => c.id === editandoId);

      if (!actual) {
        setLoading(false);
        return alert("No se encontró la clasificación a editar");
      }

      const respuesta = await supabase
        .from("clasificaciones_pacientes")
        .update({
          nombre: payload.nombre,
          monto: payload.monto,
        })
        .eq("id", editandoId);

      error = respuesta.error;
    } else {
      const respuesta = await supabase.from("clasificaciones_pacientes").insert([
        {
          empresa_id: empresaGuardar.id,
          ...payload,
        },
      ]);

      error = respuesta.error;
    }

    setLoading(false);

    if (error) {
      console.error(error);
      alert("Error al guardar clasificación");
      return;
    }

    limpiarFormulario();

    if (!idsVista.some((id) => String(id) === String(empresaGuardar.id))) {
      const nuevos = [...idsVista, empresaGuardar.id];
      setEmpresasVistaIds(nuevos);
      localStorage.setItem("empresas_clasificaciones_vista_ids", JSON.stringify(nuevos));
    } else {
      await cargarClasificaciones();
    }
  };

  const editar = (clasificacion) => {
    setEditandoId(clasificacion.id);
    setNombre(clasificacion.nombre || "");
    setMonto(String(clasificacion.monto ?? ""));

    const emp = empresasDisponibles.find((e) => String(e.id) === String(clasificacion.empresa_id));
    if (emp) setEmpresaGuardar(emp);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cambiarActivo = async (clasificacion) => {
    const { error } = await supabase
      .from("clasificaciones_pacientes")
      .update({ activo: !clasificacion.activo })
      .eq("id", clasificacion.id);

    if (error) {
      console.error(error);
      alert("Error al cambiar estado");
      return;
    }

    await cargarClasificaciones();
  };

  const eliminar = async (clasificacion) => {
    const confirmar = window.confirm(
      `¿Eliminar la clasificación "${clasificacion.nombre}" de ${obtenerNombreEmpresa(clasificacion.empresa_id)}?`
    );

    if (!confirmar) return;

    const { error } = await supabase
      .from("clasificaciones_pacientes")
      .delete()
      .eq("id", clasificacion.id);

    if (error) {
      console.error(error);
      alert("Error al eliminar clasificación");
      return;
    }

    if (editandoId === clasificacion.id) {
      limpiarFormulario();
    }

    await cargarClasificaciones();
  };

  const totalActivas = clasificaciones.filter((c) => c.activo).length;
  const totalInactivas = clasificaciones.filter((c) => !c.activo).length;

  if (!empresaGuardar?.id) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>No hay empresa activa.</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerCard}>
        <div>
          <h1 style={styles.title}>Clasificación de pacientes</h1>
          <p style={styles.subtitle}>
            Configurá clasificaciones y comisiones por empresa, o revisalas combinadas.
          </p>
        </div>

        <div style={styles.headerControls}>
          <div>
            <label style={styles.label}>Empresa para guardar</label>
            <select
              style={styles.select}
              value={empresaGuardar?.id || ""}
              onChange={(e) => cambiarEmpresaGuardar(e.target.value)}
            >
              {empresasDisponibles.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.viewSelector}>
            <div style={styles.selectorHeader}>
              <div>
                <label style={styles.label}>Empresas visibles</label>
                <p style={styles.helperText}>Seleccioná una o varias empresas.</p>
              </div>

              <div style={styles.quickActions}>
                <button type="button" style={styles.miniBtn} onClick={seleccionarSoloActiva}>
                  Solo guardar
                </button>
                <button type="button" style={styles.miniBtn} onClick={seleccionarTodas}>
                  Todas
                </button>
              </div>
            </div>

            <div style={styles.multiSelectWrap}>
              <button
                type="button"
                style={styles.multiSelectButton}
                onClick={() => setMostrarSelectorEmpresas((prev) => !prev)}
              >
                <span>{nombreEmpresasVista}</span>
                <span>{mostrarSelectorEmpresas ? "▴" : "▾"}</span>
              </button>

              {mostrarSelectorEmpresas && (
                <div style={styles.multiSelectMenu}>
                  {empresasDisponibles.map((emp) => {
                    const checked = idsVista.some((id) => String(id) === String(emp.id));

                    return (
                      <label
                        key={emp.id}
                        style={{
                          ...styles.multiSelectOption,
                          ...(checked ? styles.multiSelectOptionActive : {}),
                        }}
                      >
                        <span style={styles.fakeCheckbox}>{checked ? "✓" : ""}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => alternarEmpresaVista(emp.id)}
                          style={styles.hiddenCheckbox}
                        />
                        <span style={styles.empresaListName}>{emp.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span>Clasificaciones visibles</span>
          <strong>{clasificaciones.length}</strong>
        </div>
        <div style={styles.statCard}>
          <span>Activas</span>
          <strong>{totalActivas}</strong>
        </div>
        <div style={styles.statCard}>
          <span>Inactivas</span>
          <strong>{totalInactivas}</strong>
        </div>
        <div style={styles.statCard}>
          <span>Vista</span>
          <strong>{modoMultiempresa ? "Multiempresa" : "Individual"}</strong>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>
          {editandoId ? "Editar clasificación" : "Nueva clasificación"}
        </h3>

        <p style={styles.sectionSubtitle}>
          Se guardará en: <strong>{empresaGuardar.nombre}</strong>
        </p>

        <div style={styles.formGrid}>
          <div>
            <label style={styles.label}>Nombre</label>
            <input
              style={styles.input}
              placeholder="Ej: Terminado, Recuperado, Diario..."
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div>
            <label style={styles.label}>Monto de comisión</label>
            <input
              style={styles.input}
              type="number"
              step="0.01"
              min="0"
              placeholder="Ej: 2.00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>

          <button style={styles.primaryBtn} onClick={guardar} disabled={loading}>
            {loading ? "Guardando..." : editandoId ? "Guardar cambios" : "Agregar"}
          </button>

          <button style={styles.secondaryBtn} onClick={limpiarFormulario}>
            Limpiar
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Clasificaciones registradas</h3>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Empresa</th>
                <th style={styles.th}>Clasificación</th>
                <th style={styles.th}>Comisión</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {clasificaciones.length === 0 ? (
                <tr>
                  <td style={styles.emptyTd} colSpan="5">
                    No hay clasificaciones registradas para las empresas seleccionadas.
                  </td>
                </tr>
              ) : (
                clasificaciones.map((clasificacion) => (
                  <tr key={clasificacion.id}>
                    <td style={styles.td}>
                      <span style={styles.empresaBadge}>
                        {obtenerNombreEmpresa(clasificacion.empresa_id)}
                      </span>
                    </td>

                    <td style={styles.td}>{clasificacion.nombre}</td>

                    <td style={styles.td}>
                      ${Number(clasificacion.monto || 0).toFixed(2)}
                    </td>

                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.estadoBadge,
                          ...(clasificacion.activo
                            ? styles.estadoActivo
                            : styles.estadoInactivo),
                        }}
                      >
                        {clasificacion.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.actions}>
                        <button
                          style={styles.secondaryBtnSmall}
                          onClick={() => editar(clasificacion)}
                        >
                          Editar
                        </button>

                        <button
                          style={styles.secondaryBtnSmall}
                          onClick={() => cambiarActivo(clasificacion)}
                        >
                          {clasificacion.activo ? "Desactivar" : "Activar"}
                        </button>

                        <button
                          style={styles.dangerBtn}
                          onClick={() => eliminar(clasificacion)}
                        >
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

  headerControls: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) minmax(280px, 1.2fr)",
    gap: "12px",
    minWidth: "min(620px, 100%)",
  },

  select: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "14px",
    fontWeight: "800",
    color: "#1f2937",
  },

  viewSelector: {
    position: "relative",
    zIndex: 30,
  },

  selectorHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "start",
    marginBottom: "6px",
  },

  helperText: {
    margin: "3px 0 0 0",
    color: "#64748b",
    fontSize: "12px",
  },

  quickActions: {
    display: "flex",
    gap: "6px",
    flexShrink: 0,
  },

  miniBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "10px",
    padding: "7px 9px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "12px",
  },

  multiSelectWrap: {
    position: "relative",
  },

  multiSelectButton: {
    width: "100%",
    minHeight: "46px",
    borderRadius: "14px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    color: "#1f2937",
    fontWeight: "850",
    padding: "11px 13px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    cursor: "pointer",
    textAlign: "left",
    boxSizing: "border-box",
  },

  multiSelectMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    right: 0,
    zIndex: 100,
    maxHeight: "280px",
    overflowY: "auto",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.14)",
    padding: "8px",
    display: "grid",
    gap: "6px",
  },

  multiSelectOption: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "11px 12px",
    borderRadius: "12px",
    border: "1px solid transparent",
    cursor: "pointer",
    fontWeight: "800",
    color: "#334155",
  },

  multiSelectOptionActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  fakeCheckbox: {
    width: "22px",
    height: "22px",
    borderRadius: "7px",
    border: "1px solid #cbd5e1",
    display: "grid",
    placeItems: "center",
    color: "#2563eb",
    fontWeight: "900",
    flexShrink: 0,
  },

  hiddenCheckbox: {
    display: "none",
  },

  empresaListName: {
    fontWeight: "800",
    lineHeight: 1.2,
    wordBreak: "break-word",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "12px",
  },

  statCard: {
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "18px",
    padding: "16px",
    display: "grid",
    gap: "5px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
    color: "#64748b",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  sectionTitle: {
    margin: "0 0 8px 0",
    fontSize: "20px",
    color: "#1f2937",
  },

  sectionSubtitle: {
    margin: "0 0 14px 0",
    color: "#64748b",
    fontSize: "13px",
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

  secondaryBtnSmall: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "10px",
    padding: "9px 11px",
    cursor: "pointer",
    fontWeight: "800",
  },

  dangerBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "10px",
    padding: "9px 11px",
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
    minWidth: "860px",
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

  emptyTd: {
    textAlign: "center",
    padding: "24px",
    color: "#64748b",
  },

  estadoBadge: {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: "999px",
    fontWeight: "800",
    fontSize: "12px",
    border: "1px solid transparent",
  },

  estadoActivo: {
    background: "#eefcf3",
    color: "#0f7a4d",
    borderColor: "#c7eed5",
  },

  estadoInactivo: {
    background: "#f8f8fa",
    color: "#64748b",
    borderColor: "#d7dbe2",
  },

  empresaBadge: {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: "999px",
    fontWeight: "850",
    fontSize: "12px",
    border: "1px solid #bfdbfe",
    background: "#eef6ff",
    color: "#1d4ed8",
    maxWidth: "260px",
    whiteSpace: "normal",
    lineHeight: 1.2,
  },

  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
};

export default ClasificacionesPacientes;
