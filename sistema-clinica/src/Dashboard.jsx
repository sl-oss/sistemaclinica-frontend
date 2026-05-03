import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function Dashboard({ onNavigate }) {
  const empresaGuardada = JSON.parse(localStorage.getItem("empresa") || "null");

  const [empresasUsuario, setEmpresasUsuario] = useState([]);
  const [empresasSeleccionadasIds, setEmpresasSeleccionadasIds] = useState(() => {
    const guardadas = JSON.parse(localStorage.getItem("empresas_dashboard_ids") || "null");
    if (Array.isArray(guardadas) && guardadas.length > 0) return guardadas;
    return empresaGuardada?.id ? [empresaGuardada.id] : [];
  });
  const [mostrarSelectorEmpresas, setMostrarSelectorEmpresas] = useState(false);
  const [loading, setLoading] = useState(true);

  const [citasPendientesConfirmar, setCitasPendientesConfirmar] = useState([]);
  const [citasPendientesAtender, setCitasPendientesAtender] = useState([]);
  const [citasHoy, setCitasHoy] = useState([]);

  const [ventasPendientes, setVentasPendientes] = useState([]);
  const [itemsStockBajo, setItemsStockBajo] = useState([]);
  const [ventasHoy, setVentasHoy] = useState([]);

  const hoySV = obtenerFechaSV();
  const mananaSV = sumarDias(hoySV, 1);

  const empresaIdsReporte = useMemo(() => {
    if (empresasSeleccionadasIds.length > 0) return empresasSeleccionadasIds;
    return empresaGuardada?.id ? [empresaGuardada.id] : [];
  }, [empresasSeleccionadasIds, empresaGuardada?.id]);

  const empresasSeleccionadas = useMemo(() => {
    return empresasUsuario.filter((empresa) =>
      empresaIdsReporte.some((id) => String(id) === String(empresa.id))
    );
  }, [empresasUsuario, empresaIdsReporte]);

  const nombreEmpresasReporte = useMemo(() => {
    if (empresasSeleccionadas.length === 0) {
      return empresaGuardada?.nombre || "tu empresa";
    }

    if (empresasSeleccionadas.length === 1) {
      return empresasSeleccionadas[0].nombre;
    }

    return empresasSeleccionadas.length + " empresas combinadas";
  }, [empresasSeleccionadas, empresaGuardada?.nombre]);

  useEffect(() => {
    cargarEmpresasUsuario();
  }, []);

  useEffect(() => {
    if (empresaIdsReporte.length === 0) return;
    cargarDashboard();
  }, [empresaIdsReporte.join("|")]);

  const cargarEmpresasUsuario = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (!userId) {
        const fallback = empresaGuardada?.id ? [empresaGuardada] : [];
        setEmpresasUsuario(fallback);
        return;
      }

      const { data, error } = await supabase
        .from("empresa_usuarios")
        .select("empresa_id, activo, empresas(id, nombre)")
        .eq("user_id", userId)
        .eq("activo", true);

      if (error) throw error;

      const empresas = (data || [])
        .map((fila) => fila.empresas)
        .filter(Boolean);

      setEmpresasUsuario(empresas);

      if (empresas.length === 0) return;

      const idsDisponibles = empresas.map((emp) => String(emp.id));
      const guardadasValidas = empresasSeleccionadasIds.filter((id) =>
        idsDisponibles.includes(String(id))
      );

      const idsIniciales = guardadasValidas.length
        ? guardadasValidas
        : empresaGuardada?.id && idsDisponibles.includes(String(empresaGuardada.id))
        ? [empresaGuardada.id]
        : [empresas[0].id];

      setEmpresasSeleccionadasIds(idsIniciales);
      localStorage.setItem("empresas_dashboard_ids", JSON.stringify(idsIniciales));

      const empresaActiva = empresas.find(
        (emp) => String(emp.id) === String(idsIniciales[0])
      );
      if (empresaActiva) {
        localStorage.setItem("empresa", JSON.stringify(empresaActiva));
      }
    } catch (error) {
      console.error(error);
      if (empresaGuardada?.id) setEmpresasUsuario([empresaGuardada]);
    }
  };

  const alternarEmpresaReporte = (empresaId) => {
    setEmpresasSeleccionadasIds((prev) => {
      const existe = prev.some((id) => String(id) === String(empresaId));
      let nuevosIds = existe
        ? prev.filter((id) => String(id) !== String(empresaId))
        : [...prev, empresaId];

      if (nuevosIds.length === 0) nuevosIds = [empresaId];

      localStorage.setItem("empresas_dashboard_ids", JSON.stringify(nuevosIds));
      return nuevosIds;
    });
  };

  const seleccionarSoloEmpresaActiva = () => {
    if (!empresaGuardada?.id) return;

    setEmpresasSeleccionadasIds([empresaGuardada.id]);
    localStorage.setItem("empresas_dashboard_ids", JSON.stringify([empresaGuardada.id]));
  };

  const seleccionarTodasLasEmpresas = () => {
    const ids = empresasUsuario.map((empresa) => empresa.id).filter(Boolean);
    if (ids.length === 0) return;

    setEmpresasSeleccionadasIds(ids);
    localStorage.setItem("empresas_dashboard_ids", JSON.stringify(ids));
  };

  const obtenerNombreEmpresa = (empresaId, filaEmpresa) => {
    if (filaEmpresa?.nombre) return filaEmpresa.nombre;

    return (
      empresasUsuario.find((empresa) => String(empresa.id) === String(empresaId))?.nombre ||
      "Empresa"
    );
  };

  const cargarDashboard = async () => {
    if (empresaIdsReporte.length === 0) return;

    setLoading(true);

    try {
      const [
        citasPendientesResp,
        citasHoyResp,
        ventasResp,
        itemsResp,
        ventasHoyResp,
      ] = await Promise.all([
        supabase
          .from("citas")
          .select(`
            id,
            empresa_id,
            fecha,
            hora,
            servicio,
            estado,
            confirmada,
            empresas(nombre),
            clientes(nombre, telefono)
          `)
          .in("empresa_id", empresaIdsReporte)
          .eq("estado", "pendiente")
          .order("fecha", { ascending: true })
          .order("hora", { ascending: true }),

        supabase
          .from("citas")
          .select(`
            id,
            empresa_id,
            fecha,
            hora,
            servicio,
            estado,
            confirmada,
            empresas(nombre),
            clientes(nombre, telefono)
          `)
          .in("empresa_id", empresaIdsReporte)
          .eq("fecha", hoySV)
          .neq("estado", "cancelada")
          .order("hora", { ascending: true }),

        supabase
          .from("ventas")
          .select(`
            id,
            empresa_id,
            fecha_local,
            total,
            estado,
            empresas(nombre),
            clientes(nombre),
            venta_pagos(monto)
          `)
          .in("empresa_id", empresaIdsReporte)
          .neq("estado", "pagado")
          .order("fecha_local", { ascending: false }),

        supabase
          .from("items")
          .select("id, empresa_id, nombre, stock, tipo, precio, empresas(nombre)")
          .in("empresa_id", empresaIdsReporte)
          .eq("tipo", "producto")
          .order("stock", { ascending: true }),

        supabase
          .from("ventas")
          .select(`
            id,
            empresa_id,
            fecha_local,
            total,
            estado,
            empresas(nombre),
            clientes(nombre)
          `)
          .in("empresa_id", empresaIdsReporte)
          .gte("fecha_local", `${hoySV}T00:00:00`)
          .lte("fecha_local", `${hoySV}T23:59:59`)
          .order("fecha_local", { ascending: false }),
      ]);

      if (citasPendientesResp.error) throw citasPendientesResp.error;
      if (citasHoyResp.error) throw citasHoyResp.error;
      if (ventasResp.error) throw ventasResp.error;
      if (itemsResp.error) throw itemsResp.error;
      if (ventasHoyResp.error) throw ventasHoyResp.error;

      const citasPendientes = citasPendientesResp.data || [];
      const citasHoyData = citasHoyResp.data || [];
      const ventasData = ventasResp.data || [];
      const itemsData = itemsResp.data || [];
      const ventasHoyData = ventasHoyResp.data || [];

      setCitasPendientesConfirmar(
        citasPendientes.filter((c) => !c.confirmada)
      );

      setCitasPendientesAtender(citasPendientes);

      setCitasHoy(citasHoyData);

      const ventasConSaldo = ventasData
        .map((venta) => {
          const abonado = (venta.venta_pagos || []).reduce(
            (sum, pago) => sum + Number(pago.monto || 0),
            0
          );

          const saldo = Number(venta.total || 0) - abonado;
          const dias = calcularDiasMora(venta.fecha_local);

          return {
            ...venta,
            abonado,
            saldo,
            dias_mora: dias,
          };
        })
        .filter((v) => v.saldo > 0);

      setVentasPendientes(ventasConSaldo);
      setItemsStockBajo(itemsData.filter((i) => Number(i.stock || 0) <= 3));
      setVentasHoy(ventasHoyData);
    } catch (error) {
      console.error(error);
      alert("Error al cargar dashboard");
    } finally {
      setLoading(false);
    }
  };

  const citasPorConfirmarCount = citasPendientesConfirmar.length;
  const citasPendientesAtenderCount = citasPendientesAtender.length;
  const citasHoyCount = citasHoy.length;

  const deudasMas30 = useMemo(() => {
    return ventasPendientes.filter((v) => Number(v.dias_mora || 0) > 30);
  }, [ventasPendientes]);

  const totalDeudaPendiente = useMemo(() => {
    return ventasPendientes.reduce(
      (acc, item) => acc + Number(item.saldo || 0),
      0
    );
  }, [ventasPendientes]);

  const totalVentasHoy = useMemo(() => {
    return ventasHoy.reduce((acc, item) => acc + Number(item.total || 0), 0);
  }, [ventasHoy]);

  const proximasCitas = useMemo(() => {
    return citasPendientesAtender.slice(0, 6);
  }, [citasPendientesAtender]);

  const topDeudas = useMemo(() => {
    return [...deudasMas30]
      .sort((a, b) => Number(b.saldo || 0) - Number(a.saldo || 0))
      .slice(0, 5);
  }, [deudasMas30]);

  const topStockBajo = useMemo(() => {
    return [...itemsStockBajo].slice(0, 6);
  }, [itemsStockBajo]);

  if (empresaIdsReporte.length === 0) {
    return <div style={styles.empty}>No hay empresa seleccionada</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <h1 style={styles.title}>Inicio</h1>
          <p style={styles.subtitle}>
            Resumen general de {nombreEmpresasReporte}
          </p>
        </div>

        <div style={styles.heroRight}>
          <div style={styles.headerEmpresaSelect}>
            <div style={styles.headerEmpresaTop}>
              <span style={styles.headerEmpresaLabel}>Empresas a combinar</span>

              <div style={styles.headerEmpresaActions}>
                <button type="button" style={styles.miniBtn} onClick={seleccionarSoloEmpresaActiva}>
                  Solo activa
                </button>

                <button type="button" style={styles.miniBtn} onClick={seleccionarTodasLasEmpresas}>
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
                <span>{nombreEmpresasReporte}</span>
                <span style={styles.multiSelectArrow}>{mostrarSelectorEmpresas ? "▴" : "▾"}</span>
              </button>

              {mostrarSelectorEmpresas && (
                <div style={styles.multiSelectMenu}>
                  {empresasUsuario.map((empresa) => {
                    const checked = empresaIdsReporte.some(
                      (id) => String(id) === String(empresa.id)
                    );

                    return (
                      <label
                        key={empresa.id}
                        style={{
                          ...styles.multiSelectOption,
                          ...(checked ? styles.multiSelectOptionActive : {}),
                        }}
                      >
                        <span style={styles.fakeCheckbox}>{checked ? "✓" : ""}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => alternarEmpresaReporte(empresa.id)}
                          style={styles.hiddenCheckbox}
                        />
                        <span style={styles.empresaListName}>{empresa.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={styles.heroBadge}>
            <span style={styles.heroBadgeLabel}>Fecha</span>
            <strong style={styles.heroBadgeValue}>{formatearFecha(hoySV)}</strong>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={styles.loadingBox}>Cargando dashboard...</div>
      ) : (
        <>
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}>
              <div style={styles.kpiLabel}>Pendientes de confirmar</div>
              <div style={styles.kpiValue}>{citasPorConfirmarCount}</div>
              <button
                style={styles.kpiBtn}
                onClick={() => onNavigate?.("citas")}
              >
                Ver citas
              </button>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiLabel}>Pendientes de atender</div>
              <div style={styles.kpiValue}>{citasPendientesAtenderCount}</div>
              <button
                style={styles.kpiBtn}
                onClick={() => onNavigate?.("citas")}
              >
                Ir a agenda
              </button>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiLabel}>Citas de hoy</div>
              <div style={styles.kpiValue}>{citasHoyCount}</div>
              <button
                style={styles.kpiBtn}
                onClick={() => onNavigate?.("citas")}
              >
                Ver hoy
              </button>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiLabel}>Ventas de hoy</div>
              <div style={styles.kpiValue}>${money(totalVentasHoy)}</div>
              <button
                style={styles.kpiBtn}
                onClick={() => onNavigate?.("reporte")}
              >
                Ver ventas
              </button>
            </div>

            <div style={styles.kpiCardWarn}>
              <div style={styles.kpiLabel}>Deudas +30 días</div>
              <div style={styles.kpiValue}>{deudasMas30.length}</div>
              <button
                style={styles.kpiBtnWarn}
                onClick={() => onNavigate?.("deudas")}
              >
                Ver deudas
              </button>
            </div>

            <div style={styles.kpiCardDanger}>
              <div style={styles.kpiLabel}>Stock bajo</div>
              <div style={styles.kpiValue}>{itemsStockBajo.length}</div>
              <button
                style={styles.kpiBtnDanger}
                onClick={() => onNavigate?.("items")}
              >
                Ver productos
              </button>
            </div>
          </div>

          <div style={styles.mainGrid}>
            <div style={styles.cardLarge}>
              <div style={styles.cardHeader}>
                <div>
                  <h3 style={styles.cardTitle}>Próximas citas pendientes</h3>
                  <p style={styles.cardSub}>Las siguientes por atender</p>
                </div>
                <button
                  style={styles.softBtn}
                  onClick={() => onNavigate?.("citas")}
                >
                  Abrir citas
                </button>
              </div>

              {proximasCitas.length === 0 ? (
                <div style={styles.emptyMini}>No hay citas pendientes.</div>
              ) : (
                <div style={styles.listWrap}>
                  {proximasCitas.map((cita) => (
                    <div key={cita.id} style={styles.listItem}>
                      <div>
                        <strong style={styles.itemTitle}>
                          {cita.clientes?.nombre || "Sin nombre"}
                        </strong>
                        <div style={styles.empresaTag}>
                          {obtenerNombreEmpresa(cita.empresa_id, cita.empresas)}
                        </div>
                        <div style={styles.itemText}>
                          📅 {formatearFecha(cita.fecha)} · ⏰{" "}
                          {normalizarHora(cita.hora)}
                        </div>
                        <div style={styles.itemText}>
                          {cita.servicio || "Sin servicio"}
                        </div>
                      </div>

                      <div style={styles.badgesCol}>
                        <span
                          style={{
                            ...styles.badge,
                            background: cita.confirmada
                              ? "#eefcf3"
                              : "#fff7ed",
                            color: cita.confirmada ? "#0f7a4d" : "#9a3412",
                            borderColor: cita.confirmada
                              ? "#c7eed5"
                              : "#fed7aa",
                          }}
                        >
                          {cita.confirmada ? "Confirmada" : "Sin confirmar"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.cardSide}>
              <div style={styles.cardHeader}>
                <div>
                  <h3 style={styles.cardTitle}>Total pendiente por cobrar</h3>
                  <p style={styles.cardSub}>Todas las deudas activas</p>
                </div>
              </div>

              <div style={styles.bigMoney}>${money(totalDeudaPendiente)}</div>

              <div style={styles.miniStats}>
                <div style={styles.miniStat}>
                  <span>Deudas activas</span>
                  <strong>{ventasPendientes.length}</strong>
                </div>
                <div style={styles.miniStat}>
                  <span>Más de 30 días</span>
                  <strong>{deudasMas30.length}</strong>
                </div>
              </div>

              <button
                style={styles.primaryBtn}
                onClick={() => onNavigate?.("deudas")}
              >
                Ir a deudas
              </button>
            </div>
          </div>

          <div style={styles.bottomGrid}>
            <div style={styles.cardHalf}>
              <div style={styles.cardHeader}>
                <div>
                  <h3 style={styles.cardTitle}>Deudas críticas</h3>
                  <p style={styles.cardSub}>Mayores de 30 días</p>
                </div>
              </div>

              {topDeudas.length === 0 ? (
                <div style={styles.emptyMini}>
                  No hay deudas mayores a 30 días.
                </div>
              ) : (
                <div style={styles.listWrap}>
                  {topDeudas.map((venta) => (
                    <div key={venta.id} style={styles.listItemCompact}>
                      <div>
                        <strong style={styles.itemTitle}>
                          {venta.clientes?.nombre || "Consumidor final"}
                        </strong>
                        <div style={styles.empresaTag}>
                          {obtenerNombreEmpresa(venta.empresa_id, venta.empresas)}
                        </div>
                        <div style={styles.itemText}>
                          {venta.dias_mora} días de mora
                        </div>
                      </div>

                      <div style={styles.rightInfo}>
                        <strong style={styles.moneyWarn}>
                          ${money(venta.saldo)}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.cardHalf}>
              <div style={styles.cardHeader}>
                <div>
                  <h3 style={styles.cardTitle}>Productos por acabarse</h3>
                  <p style={styles.cardSub}>Stock de 3 o menos</p>
                </div>
              </div>

              {topStockBajo.length === 0 ? (
                <div style={styles.emptyMini}>Todo bien con inventario.</div>
              ) : (
                <div style={styles.listWrap}>
                  {topStockBajo.map((item) => (
                    <div key={item.id} style={styles.listItemCompact}>
                      <div>
                        <strong style={styles.itemTitle}>{item.nombre}</strong>
                        <div style={styles.empresaTag}>
                          {obtenerNombreEmpresa(item.empresa_id, item.empresas)}
                        </div>
                        <div style={styles.itemText}>
                          Precio: ${money(item.precio || 0)}
                        </div>
                      </div>

                      <div style={styles.rightInfo}>
                        <span
                          style={{
                            ...styles.badge,
                            background:
                              Number(item.stock || 0) <= 1
                                ? "#fff1f2"
                                : "#fff7ed",
                            color:
                              Number(item.stock || 0) <= 1
                                ? "#be123c"
                                : "#9a3412",
                            borderColor:
                              Number(item.stock || 0) <= 1
                                ? "#fecdd3"
                                : "#fed7aa",
                          }}
                        >
                          Stock: {item.stock}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={styles.cardQuick}>
            <div style={styles.cardHeader}>
              <div>
                <h3 style={styles.cardTitle}>Accesos rápidos</h3>
                <p style={styles.cardSub}>Lo que más vas a usar</p>
              </div>
            </div>

            <div style={styles.quickGrid}>
              <button
                style={styles.quickBtn}
                onClick={() => onNavigate?.("venta")}
              >
                🛒 Nueva venta
              </button>
              <button
                style={styles.quickBtn}
                onClick={() => onNavigate?.("citas")}
              >
                📅 Ver citas
              </button>
              <button
                style={styles.quickBtn}
                onClick={() => onNavigate?.("deudas")}
              >
                📋 Revisar deudas
              </button>
              <button
                style={styles.quickBtn}
                onClick={() => onNavigate?.("items")}
              >
                📦 Inventario
              </button>
              <button
                style={styles.quickBtn}
                onClick={() => onNavigate?.("reporte")}
              >
                📊 Reporte ventas
              </button>
              <button
                style={styles.quickBtn}
                onClick={() => onNavigate?.("Caja Diaria")}
              >
                💲 Caja diaria
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function obtenerFechaSV() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sumarDias(fechaTexto, dias) {
  const [y, m, d] = fechaTexto.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  fecha.setDate(fecha.getDate() + dias);

  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function normalizarHora(horaTexto) {
  if (!horaTexto) return "";
  return String(horaTexto).slice(0, 5);
}

function formatearFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = String(fecha).slice(0, 10).split("-");
  if (!yyyy || !mm || !dd) return fecha;
  return `${dd}/${mm}/${yyyy}`;
}

function calcularDiasMora(fechaVenta) {
  if (!fechaVenta) return 0;

  const hoy = obtenerFechaSV();
  const fecha1 = new Date(`${String(fechaVenta).slice(0, 10)}T00:00:00`);
  const fecha2 = new Date(`${hoy}T00:00:00`);

  const diffMs = fecha2 - fecha1;
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDias >= 0 ? diffDias : 0;
}

function money(valor) {
  return Number(valor || 0).toFixed(2);
}

const styles = {
  page: {
    width: "100%",
    display: "grid",
    gap: 18,
  },

  hero: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 24,
    padding: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  heroRight: {
    display: "flex",
    alignItems: "stretch",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    position: "relative",
    zIndex: 20,
  },

  empresaSelectorBox: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 18,
    padding: "12px 14px",
    minWidth: 240,
    maxWidth: 420,
  },

  empresaSelectorLabel: {
    display: "block",
    fontSize: 12,
    color: "#7c6f8a",
    marginBottom: 8,
    fontWeight: "700",
  },

  empresaListBox: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  empresaListItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#f8f8fa",
    border: "1px solid #d7dbe2",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    color: "#334155",
    fontWeight: "700",
    cursor: "pointer",
  },

  headerEmpresaSelect: {
    width: "420px",
    maxWidth: "100%",
    alignSelf: "center",
    position: "relative",
  },

  headerEmpresaTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    marginBottom: "6px",
  },

  headerEmpresaLabel: {
    color: "#574866",
    fontSize: "12px",
    fontWeight: "800",
  },

  headerEmpresaActions: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },

  miniBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "10px",
    padding: "7px 10px",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "12px",
  },

  multiSelectWrap: {
    position: "relative",
    width: "100%",
  },

  multiSelectButton: {
    width: "100%",
    minHeight: "48px",
    borderRadius: "14px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    color: "#1f2937",
    fontWeight: "800",
    padding: "12px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    cursor: "pointer",
    textAlign: "left",
    boxSizing: "border-box",
  },

  multiSelectArrow: {
    fontSize: "18px",
    color: "#574866",
    flexShrink: 0,
  },

  multiSelectMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    right: 0,
    zIndex: 50,
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
    gap: "12px",
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid transparent",
    background: "#fff",
    cursor: "pointer",
    color: "#1f2937",
    boxSizing: "border-box",
  },

  multiSelectOptionActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  fakeCheckbox: {
    width: "22px",
    height: "22px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    background: "#fff",
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

  empresaTag: {
    display: "inline-flex",
    alignItems: "center",
    marginTop: "6px",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    fontWeight: "800",
    fontSize: "11px",
  },

  title: {
    margin: 0,
    fontSize: 32,
    color: "#574866",
    fontWeight: "800",
  },

  subtitle: {
    margin: "6px 0 0 0",
    fontSize: 14,
    color: "#64748b",
  },

  heroBadge: {
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    borderRadius: 18,
    padding: "14px 18px",
    minWidth: 170,
  },

  heroBadgeLabel: {
    display: "block",
    fontSize: 12,
    color: "#7c6f8a",
    marginBottom: 4,
  },

  heroBadgeValue: {
    fontSize: 22,
    color: "#574866",
  },

  loadingBox: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 20,
    padding: 24,
    textAlign: "center",
    color: "#64748b",
  },

  empty: {
    padding: 20,
  },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },

  kpiCard: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
    display: "grid",
    gap: 10,
  },

  kpiCardWarn: {
    background: "#ffffff",
    border: "1px solid #fed7aa",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
    display: "grid",
    gap: 10,
  },

  kpiCardDanger: {
    background: "#ffffff",
    border: "1px solid #fecdd3",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
    display: "grid",
    gap: 10,
  },

  kpiLabel: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
  },

  kpiValue: {
    fontSize: 30,
    color: "#1f2937",
    fontWeight: "800",
  },

  kpiBtn: {
    padding: "10px 14px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  kpiBtnWarn: {
    padding: "10px 14px",
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  kpiBtnDanger: {
    padding: "10px 14px",
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 18,
  },

  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  },

  cardLarge: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  cardSide: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    display: "grid",
    gap: 16,
    alignContent: "start",
  },

  cardHalf: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  cardQuick: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },

  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  },

  cardTitle: {
    margin: 0,
    fontSize: 20,
    color: "#1f2937",
  },

  cardSub: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: 14,
  },

  softBtn: {
    padding: "10px 14px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  primaryBtn: {
    padding: "12px 16px",
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "700",
  },

  bigMoney: {
    fontSize: 34,
    fontWeight: "800",
    color: "#574866",
  },

  miniStats: {
    display: "grid",
    gap: 10,
  },

  miniStat: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    color: "#334155",
  },

  listWrap: {
    display: "grid",
    gap: 10,
  },

  listItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px",
    background: "#faf9fc",
    border: "1px solid #ebe5f0",
    borderRadius: 16,
    flexWrap: "wrap",
  },

  listItemCompact: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "14px",
    background: "#faf9fc",
    border: "1px solid #ebe5f0",
    borderRadius: 16,
    flexWrap: "wrap",
  },

  itemTitle: {
    color: "#1f2937",
    fontSize: 15,
  },

  itemText: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
  },

  badgesCol: {
    display: "flex",
    alignItems: "center",
  },

  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid transparent",
    fontSize: 12,
    fontWeight: "700",
  },

  rightInfo: {
    display: "flex",
    alignItems: "center",
  },

  moneyWarn: {
    color: "#b45309",
    fontSize: 16,
  },

  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },

  quickBtn: {
    padding: "14px 16px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: "700",
    textAlign: "left",
  },

  emptyMini: {
    color: "#64748b",
    padding: "10px 0",
  },
};

export default Dashboard;