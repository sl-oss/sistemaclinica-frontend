import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const [mostrarModalKardex, setMostrarModalKardex] = useState(false);
  const [loadingKardex, setLoadingKardex] = useState(false);

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
    setItems([]);
    cerrarModalKardex();
  };

  useEffect(() => {
    if (empresa?.id) {
      obtenerItems();
    } else {
      setItems([]);
    }
  }, [empresa?.id]);

  const obtenerItems = async () => {
    if (!empresa?.id) return;

    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setItems(data || []);
  };

  const getFechaLocal = () => {
    return new Date()
      .toLocaleString("sv-SE", {
        timeZone: "America/El_Salvador",
      })
      .replace(" ", "T");
  };

  const formatearFechaHora = (fecha) => {
    if (!fecha) return "";
    return new Date(fecha).toLocaleString("es-SV", {
      timeZone: "America/El_Salvador",
    });
  };

  const guardarItem = async () => {
    if (!empresa?.id) return alert("No hay empresa seleccionada");
    if (!nombre || !precio) return alert("Faltan datos");

    const { data, error } = await supabase
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

    if (error) {
      console.error(error);
      return alert("Error al guardar item");
    }

    if (tipo === "producto" && Number(stock) > 0) {
      const { error: errorKardex } = await supabase.from("kardex").insert([
        {
          empresa_id: empresa.id,
          item_id: data.id,
          tipo: "entrada",
          cantidad: Number(stock),
          motivo: "Stock inicial",
          fecha_local: getFechaLocal(),
        },
      ]);

      if (errorKardex) {
        console.error(errorKardex);
        return alert("Se guardó el item, pero hubo error al crear kardex");
      }
    }

    setNombre("");
    setPrecio("");
    setStock("");
    setTipo("producto");

    obtenerItems();
  };

  const eliminarItem = async (id) => {
    if (!empresa?.id) return;

    const confirmar = window.confirm("¿Eliminar este item?");
    if (!confirmar) return;

    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresa.id);

    if (error) {
      console.error(error);
      return alert("No se pudo eliminar el item");
    }

    if (itemKardex?.id === id) {
      cerrarModalKardex();
    }

    obtenerItems();
  };

  const agregarStock = async (item) => {
    if (!empresa?.id) return;

    const cantidad = prompt("Cantidad a agregar:");

    if (!cantidad || Number(cantidad) <= 0) return;

    const { error: errorKardex } = await supabase.from("kardex").insert([
      {
        empresa_id: empresa.id,
        item_id: item.id,
        tipo: "entrada",
        cantidad: Number(cantidad),
        motivo: "Reposición de stock",
        fecha_local: getFechaLocal(),
      },
    ]);

    if (errorKardex) {
      console.error(errorKardex);
      return alert("Error al registrar movimiento en kardex");
    }

    const { error: errorUpdate } = await supabase
      .from("items")
      .update({ stock: Number(item.stock || 0) + Number(cantidad) })
      .eq("id", item.id)
      .eq("empresa_id", empresa.id);

    if (errorUpdate) {
      console.error(errorUpdate);
      return alert("Error al actualizar stock");
    }

    await obtenerItems();

    if (itemKardex?.id === item.id) {
      verKardex(item);
    }
  };

  const verKardex = async (item) => {
    if (!empresa?.id) return;

    setLoadingKardex(true);

    const { data, error } = await supabase
      .from("kardex")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("item_id", item.id)
      .order("fecha_local", { ascending: false });

    setLoadingKardex(false);

    if (error) {
      console.error(error);
      return alert("Error al cargar kardex");
    }

    setItemKardex(item);
    setKardex(data || []);
    setMostrarModalKardex(true);
  };

  const cerrarModalKardex = () => {
    setMostrarModalKardex(false);
    setItemKardex(null);
    setKardex([]);
  };

  const movimientosOrdenados = useMemo(() => {
    return [...kardex].reverse();
  }, [kardex]);

  const kardexConSaldo = useMemo(() => {
    let saldo = 0;

    return movimientosOrdenados.map((k) => {
      const cantidad = Number(k.cantidad || 0);
      let entrada = 0;
      let salida = 0;

      if (k.tipo === "entrada") {
        entrada = cantidad;
        saldo += cantidad;
      } else {
        salida = cantidad;
        saldo -= cantidad;
      }

      return {
        ...k,
        entrada,
        salida,
        saldo,
      };
    });
  }, [movimientosOrdenados]);

  const exportarExcel = async () => {
    if (!itemKardex) return alert("Seleccioná un item");
    if (kardexConSaldo.length === 0) return alert("No hay movimientos para exportar");

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

    kardexConSaldo.forEach((k) => {
      sheet.addRow({
        fecha: formatearFechaHora(k.fecha_local || k.created_at),
        tipo: k.tipo,
        entrada: k.entrada,
        salida: k.salida,
        saldo: k.saldo,
        motivo: k.motivo,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `kardex_${itemKardex.nombre}.xlsx`);
  };

  const exportarPDF = () => {
    if (!itemKardex) return alert("Seleccioná un item");
    if (kardexConSaldo.length === 0) return alert("No hay movimientos para exportar");

    const doc = new jsPDF("landscape", "mm", "a4");

    const colorPrincipal = [107, 90, 122];
    const colorSecundario = [236, 236, 239];
    const colorTexto = [31, 41, 55];

    doc.setFillColor(...colorSecundario);
    doc.circle(275, 12, 34, "F");
    doc.circle(8, 198, 26, "F");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colorPrincipal);
    doc.setFontSize(20);
    doc.text("Kardex de Inventario", 14, 18);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colorTexto);
    doc.setFontSize(10);
    doc.text(`Producto: ${itemKardex.nombre}`, 14, 25);
    doc.text(`Empresa: ${empresa?.nombre || "Empresa activa"}`, 14, 31);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colorPrincipal);
    doc.setFontSize(16);
    doc.text("KARDEX", 283, 18, { align: "right" });

    autoTable(doc, {
      startY: 40,
      head: [["Fecha", "Tipo", "Entrada", "Salida", "Saldo", "Motivo"]],
      body: kardexConSaldo.map((k) => [
        formatearFechaHora(k.fecha_local || k.created_at),
        k.tipo,
        k.entrada ? Number(k.entrada).toFixed(2) : "",
        k.salida ? Number(k.salida).toFixed(2) : "",
        Number(k.saldo || 0).toFixed(2),
        k.motivo || "",
      ]),
      theme: "grid",
      styles: {
        fontSize: 9,
        textColor: colorTexto,
        lineColor: [210, 214, 220],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: colorPrincipal,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      margin: { left: 10, right: 10 },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 22, halign: "center" },
        2: { cellWidth: 22, halign: "right" },
        3: { cellWidth: 22, halign: "right" },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 120 },
      },
    });

    doc.save(`kardex_${itemKardex.nombre}.pdf`);
  };

  const itemsFiltrados = items.filter((item) => {
    const coincideBusqueda = item.nombre
      .toLowerCase()
      .includes(busqueda.toLowerCase());

    const coincideTipo = filtroTipo === "todos" || item.tipo === filtroTipo;

    return coincideBusqueda && coincideTipo;
  });

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Inventario</h1>
            <p style={styles.subtitle}>
              Administrá productos, servicios, stock y kardex.
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
            <div>Módulo de inventario</div>
            <div>Registros: <strong>{items.length}</strong></div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Nuevo item</h3>
              <p style={styles.sectionSubtitle}>
                Creá productos o servicios y registrá stock inicial si aplica.
              </p>
            </div>
          </div>

          <div style={styles.formRow}>
            <input
              style={styles.input}
              placeholder="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Precio"
              type="number"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />

            <select
              style={styles.input}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="producto">Producto</option>
              <option value="servicio">Servicio</option>
            </select>

            {tipo === "producto" && (
              <input
                style={styles.input}
                placeholder="Stock"
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            )}

            <button style={styles.saveBtn} onClick={guardarItem}>
              Guardar
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Listado</h3>
              <p style={styles.sectionSubtitle}>
                Filtrá y gestioná productos o servicios registrados.
              </p>
            </div>
          </div>

          <div style={styles.filterRow}>
            <input
              style={styles.input}
              placeholder="🔍 Buscar..."
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
        </div>

        <div style={styles.itemsGrid}>
          {itemsFiltrados.map((item) => (
            <div
              key={item.id}
              style={{
                ...styles.itemCard,
                background:
                  item.tipo === "producto"
                    ? Number(item.stock || 0) <= 3
                      ? "#fff7f7"
                      : "#ffffff"
                    : "#faf8fc",
              }}
            >
              <div style={styles.itemTop}>
                <div style={styles.itemTypeBadge}>
                  {item.tipo === "producto" ? "📦 Producto" : "🧾 Servicio"}
                </div>
              </div>

              <div>
                <strong style={styles.itemName}>{item.nombre}</strong>
                <div style={styles.itemPrice}>${Number(item.precio || 0).toFixed(2)}</div>
              </div>

              {item.tipo === "producto" && (
                <div style={styles.stockBox}>
                  <span>Stock:</span>
                  <strong>{item.stock}</strong>

                  {Number(item.stock || 0) <= 3 && (
                    <div style={styles.lowStock}>⚠️ Stock bajo</div>
                  )}
                </div>
              )}

              <div style={styles.actions}>
                {item.tipo === "producto" && (
                  <>
                    <button style={styles.actionBtn} onClick={() => agregarStock(item)}>
                      ➕ Stock
                    </button>
                    <button style={styles.actionBtnBlue} onClick={() => verKardex(item)}>
                      📊 Kardex
                    </button>
                  </>
                )}

                <button style={styles.deleteBtn} onClick={() => eliminarItem(item.id)}>
                  ❌ Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {mostrarModalKardex && (
        <div style={styles.modalOverlay} onClick={cerrarModalKardex}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>
                  Kardex - {itemKardex?.nombre}
                </h3>
                <p style={styles.modalSubtitle}>
                  Movimientos de inventario del producto seleccionado
                </p>
              </div>

              <button style={styles.closeBtn} onClick={cerrarModalKardex}>
                ✕
              </button>
            </div>

            <div style={styles.modalActions}>
              <button style={styles.excelBtn} onClick={exportarExcel}>
                📥 Exportar Excel
              </button>

              <button style={styles.pdfBtn} onClick={exportarPDF}>
                📄 Exportar PDF
              </button>
            </div>

            <div style={styles.kardexTableWrap}>
              {loadingKardex ? (
                <div style={styles.emptyState}>Cargando kardex...</div>
              ) : kardexConSaldo.length === 0 ? (
                <div style={styles.emptyState}>No hay movimientos en el kardex</div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Fecha</th>
                      <th style={styles.th}>Tipo</th>
                      <th style={styles.th}>Entrada</th>
                      <th style={styles.th}>Salida</th>
                      <th style={styles.th}>Saldo</th>
                      <th style={styles.th}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kardexConSaldo.map((k) => (
                      <tr key={k.id}>
                        <td style={styles.td}>
                          {formatearFechaHora(k.fecha_local || k.created_at)}
                        </td>
                        <td style={styles.td}>{k.tipo}</td>
                        <td style={styles.td}>
                          {k.entrada ? Number(k.entrada).toFixed(2) : ""}
                        </td>
                        <td style={styles.td}>
                          {k.salida ? Number(k.salida).toFixed(2) : ""}
                        </td>
                        <td style={styles.td}>
                          <strong>{Number(k.saldo || 0).toFixed(2)}</strong>
                        </td>
                        <td style={styles.tdMotivo}>{k.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
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

  headerInfo: {
    textAlign: "right",
    color: "#1f2937",
    fontSize: 14,
    lineHeight: 1.6,
  },

  empresaSelect: {
    width: "100%",
    minWidth: 240,
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #d7dbe2",
    background: "#fff",
    color: "#1f2937",
    fontWeight: "700",
    outline: "none",
    marginBottom: "4px",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "18px",
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

  formRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "12px",
    alignItems: "center",
  },

  filterRow: {
    display: "grid",
    gridTemplateColumns: "1fr 220px",
    gap: "12px",
    alignItems: "center",
  },

  input: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "14px",
  },

  saveBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: "700",
  },

  itemsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "14px",
  },

  itemCard: {
    border: "1px solid #d7dbe2",
    borderRadius: "20px",
    padding: "16px",
    display: "grid",
    gap: "12px",
    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
  },

  itemTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  itemTypeBadge: {
    display: "inline-block",
    background: "#f4f0f7",
    color: "#574866",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid #d3c7dd",
  },

  itemName: {
    fontSize: "19px",
    color: "#1f2937",
    lineHeight: 1.25,
  },

  itemPrice: {
    marginTop: "6px",
    color: "#574866",
    fontWeight: "700",
    fontSize: "18px",
  },

  stockBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    color: "#334155",
    fontSize: "14px",
  },

  lowStock: {
    color: "#dc2626",
    fontSize: "12px",
    fontWeight: "700",
    background: "#fee2e2",
    border: "1px solid #fecaca",
    padding: "4px 8px",
    borderRadius: 999,
  },

  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  actionBtn: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  actionBtnBlue: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
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
    cursor: "pointer",
    fontWeight: "700",
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
    maxWidth: "1100px",
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

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
  },

  modalTitle: {
    margin: 0,
    fontSize: "28px",
    color: "#574866",
  },

  modalSubtitle: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  closeBtn: {
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
    flexWrap: "wrap",
  },

  excelBtn: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  pdfBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  kardexTableWrap: {
    overflow: "auto",
    border: "1px solid #d7dbe2",
    borderRadius: "16px",
    maxHeight: "58vh",
    background: "#fff",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "900px",
  },

  th: {
    position: "sticky",
    top: 0,
    background: "#f4f0f7",
    padding: "14px 12px",
    textAlign: "left",
    color: "#574866",
    fontWeight: "700",
    fontSize: "14px",
    borderBottom: "1px solid #d7dbe2",
    zIndex: 1,
  },

  td: {
    padding: "12px",
    borderBottom: "1px solid #edf2f7",
    verticalAlign: "top",
    fontSize: "14px",
    color: "#334155",
  },

  tdMotivo: {
    padding: "12px",
    borderBottom: "1px solid #edf2f7",
    verticalAlign: "top",
    fontSize: "14px",
    color: "#334155",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },

  emptyState: {
    padding: "30px",
    textAlign: "center",
    color: "#64748b",
  },
};

export default Items;