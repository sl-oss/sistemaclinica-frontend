import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function obtenerFechaLocalSV() {
  const fechaSV = new Date().toLocaleString("en-CA", {
    timeZone: "America/El_Salvador",
  });
  return fechaSV.slice(0, 10);
}

function obtenerFechaHoraSVISO() {
  const ahoraSV = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/El_Salvador",
    })
  );

  const yyyy = ahoraSV.getFullYear();
  const mm = String(ahoraSV.getMonth() + 1).padStart(2, "0");
  const dd = String(ahoraSV.getDate()).padStart(2, "0");
  const hh = String(ahoraSV.getHours()).padStart(2, "0");
  const mi = String(ahoraSV.getMinutes()).padStart(2, "0");
  const ss = String(ahoraSV.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

function formatearFecha(fecha) {
  if (!fecha) return "";
  const fechaSolo = String(fecha).slice(0, 10);
  const [yyyy, mm, dd] = fechaSolo.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatearMonto(valor) {
  return Number(valor || 0).toFixed(2);
}

export default function CajaDiaria() {
  const empresaGlobal = JSON.parse(localStorage.getItem("empresa") || "null");

  // IMPORTANTE:
  // No usamos "caja_diaria_empresa" porque queda guardada en el navegador
  // aunque cierre sesión y entre otro usuario. Eso mezclaba empresas.
  const empresaInicial = empresaGlobal;

  const [empresa, setEmpresa] = useState(empresaInicial);
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [empresaUsuarioActiva, setEmpresaUsuarioActiva] = useState(null);
  const [empresasDisponibles, setEmpresasDisponibles] = useState(
    empresaInicial?.id ? [empresaInicial] : []
  );
  const [empresasReporteIds, setEmpresasReporteIds] = useState(() => {
    const guardadas = JSON.parse(localStorage.getItem("empresas_caja_reporte_ids") || "null");
    if (Array.isArray(guardadas) && guardadas.length > 0) return guardadas;
    return empresaInicial?.id ? [empresaInicial.id] : [];
  });
  const [mostrarSelectorEmpresas, setMostrarSelectorEmpresas] = useState(false);
  const hoy = obtenerFechaLocalSV();
  const autosaveTimerRef = useRef(null);
  const primeraCargaCajaRef = useRef(true);
  const cargandoCajaRef = useRef(false);
  const userIdActivoRef = useRef(null);

  const cancelarAutosavePendiente = () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  };

  const empresaIdsReporte = useMemo(() => {
    if (empresasReporteIds.length > 0) return empresasReporteIds;
    return empresa?.id ? [empresa.id] : [];
  }, [empresasReporteIds, empresa?.id]);

  const modoSoloLecturaMultiempresa = empresaIdsReporte.length > 1;

  const nombreEmpresasReporte = useMemo(() => {
    const seleccionadas = empresasDisponibles.filter((emp) =>
      empresaIdsReporte.some((id) => String(id) === String(emp.id))
    );

    if (seleccionadas.length === 0) return empresa?.nombre || "Empresa activa";
    if (seleccionadas.length === 1) return seleccionadas[0].nombre;
    return `${seleccionadas.length} empresas combinadas`;
  }, [empresasDisponibles, empresaIdsReporte, empresa?.nombre]);

  const obtenerNombreEmpresa = (empresaId) => {
    return (
      empresasDisponibles.find((emp) => String(emp.id) === String(empresaId))?.nombre ||
      empresa?.nombre ||
      "Empresa"
    );
  };

  const [fechaLocal, setFechaLocal] = useState(hoy);
  const [metodos, setMetodos] = useState([]);
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState("");
  const [accionesAbiertasUid, setAccionesAbiertasUid] = useState(null);

  const [filtroDesde, setFiltroDesde] = useState(hoy);
  const [filtroHasta, setFiltroHasta] = useState(hoy);

  const [cierreRealizado, setCierreRealizado] = useState(false);
  const [remesaEfectivo, setRemesaEfectivo] = useState(false);
  const [cuentaDestinoEfectivo, setCuentaDestinoEfectivo] = useState("");
  const [numeroRemesaEfectivo, setNumeroRemesaEfectivo] = useState("");
  const [comentarioCierre, setComentarioCierre] = useState("");

  const [responsableCaja, setResponsableCaja] = useState("");
  const [elaboradoPor, setElaboradoPor] = useState("");
  const [revisadoPor, setRevisadoPor] = useState("");

  const [historialCajas, setHistorialCajas] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const [modalFacturacion, setModalFacturacion] = useState({
    open: false,
    filaUid: null,
  });

  const [modalManual, setModalManual] = useState({
    open: false,
    editando: false,
    filaOriginalUid: null,
    fila: null,
  });
  const [manualClasificacionesIds, setManualClasificacionesIds] = useState([]);
  const [guardandoManual, setGuardandoManual] = useState(false);
  const [busquedaMetodoManual, setBusquedaMetodoManual] = useState("");
  const [busquedaClasificacionManual, setBusquedaClasificacionManual] = useState("");
  const [mostrarTodosMetodosManual, setMostrarTodosMetodosManual] = useState(false);
  const [modalMetodosManual, setModalMetodosManual] = useState(false);
  const [metodosManualIds, setMetodosManualIds] = useState([]);

  const [clasificaciones, setClasificaciones] = useState([]);
  const [clasificacionesAsignadas, setClasificacionesAsignadas] = useState({});
  const [modalClasificacion, setModalClasificacion] = useState({
    open: false,
    filaUid: null,
  });

  const [modalNuevaClasificacion, setModalNuevaClasificacion] = useState(false);
  const [nuevoNombreClasificacion, setNuevoNombreClasificacion] = useState("");
  const [nuevoMontoClasificacion, setNuevoMontoClasificacion] = useState("");
  const [guardandoNuevaClasificacion, setGuardandoNuevaClasificacion] = useState(false);

  const [empleadosComision, setEmpleadosComision] = useState([]);
  const [mostrarSelectorEmpleadosComision, setMostrarSelectorEmpleadosComision] = useState(false);
  const [empresasEmpleadosComisionIds, setEmpresasEmpleadosComisionIds] = useState(() => {
    const guardadas = JSON.parse(localStorage.getItem("empresas_empleados_comision_ids") || "null");
    if (Array.isArray(guardadas) && guardadas.length > 0) return guardadas;
    return empresaInicial?.id ? [empresaInicial.id] : [];
  });
  const [fechaComisionDesde, setFechaComisionDesde] = useState(hoy);
  const [fechaComisionHasta, setFechaComisionHasta] = useState(hoy);
  const [loadingComision, setLoadingComision] = useState(false);

  const cargarEmpresasDisponibles = async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error(userError);
        return;
      }

      const userId = userData?.user?.id;
      setUsuarioActual(userData?.user || null);
      userIdActivoRef.current = userId || null;

      if (!userId) {
        cancelarAutosavePendiente();
        setEmpresa(null);
        setEmpresaUsuarioActiva(null);
        setEmpresasDisponibles([]);
        setEmpresasReporteIds([]);
        setFilas([]);
        setHistorialCajas([]);
        localStorage.removeItem("caja_diaria_empresa");
        return;
      }

      const { data, error } = await supabase
        .from("empresa_usuarios")
        .select(`
          id,
          empresa_id,
          user_id,
          rol,
          permisos,
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
        return;
      }

      const empresas = (data || [])
        .filter((item) => item.empresas)
        .map((item) => ({
          ...item.empresas,
          empresa_usuario_id: item.id,
          rol_usuario: item.rol,
          permisos_usuario: item.permisos || {},
        }));

      const mapa = new Map();
      empresas.forEach((emp) => mapa.set(emp.id, emp));
      if (empresa?.id) mapa.set(empresa.id, empresa);

      const lista = Array.from(mapa.values());
      setEmpresasDisponibles(lista);
      if (lista.length > 0) {
        const idsLista = lista.map((emp) => String(emp.id));
        const idsEmpleadosValidos = empresasEmpleadosComisionIds.filter((id) =>
          idsLista.includes(String(id))
        );

        if (idsEmpleadosValidos.length > 0) {
          setEmpresasEmpleadosComisionIds(idsEmpleadosValidos);
          localStorage.setItem("empresas_empleados_comision_ids", JSON.stringify(idsEmpleadosValidos));
        } else {
          const baseId = empresa?.id && idsLista.includes(String(empresa.id)) ? empresa.id : lista[0].id;
          setEmpresasEmpleadosComisionIds([baseId]);
          localStorage.setItem("empresas_empleados_comision_ids", JSON.stringify([baseId]));
        }
      }

      const idsDisponibles = lista.map((emp) => String(emp.id));
      const idsReporteValidos = empresasReporteIds.filter((id) =>
        idsDisponibles.includes(String(id))
      );

      if (idsReporteValidos.length > 0) {
        setEmpresasReporteIds(idsReporteValidos);
        localStorage.setItem("empresas_caja_reporte_ids", JSON.stringify(idsReporteValidos));
      } else if (empresa?.id && idsDisponibles.includes(String(empresa.id))) {
        setEmpresasReporteIds([empresa.id]);
        localStorage.setItem("empresas_caja_reporte_ids", JSON.stringify([empresa.id]));
      } else if (lista.length > 0) {
        setEmpresasReporteIds([lista[0].id]);
        localStorage.setItem("empresas_caja_reporte_ids", JSON.stringify([lista[0].id]));
      }

      // La empresa activa de Caja Diaria SIEMPRE debe ser una empresa permitida
      // para el usuario autenticado. Si venía una empresa vieja de otro usuario,
      // se reemplaza por la primera permitida.
      if (lista.length > 0) {
        const empresaPermitidaActual = lista.find(
          (emp) => String(emp.id) === String(empresa?.id)
        );

        if (!empresaPermitidaActual) {
          setEmpresa(lista[0]);
          setEmpresaUsuarioActiva({
            id: lista[0].empresa_usuario_id,
            rol: lista[0].rol_usuario,
            permisos: lista[0].permisos_usuario || {},
          });
          localStorage.setItem("empresa", JSON.stringify(lista[0]));
          window.dispatchEvent(new Event("empresaActualizada"));
        } else {
          setEmpresa(empresaPermitidaActual);
          setEmpresaUsuarioActiva({
            id: empresaPermitidaActual.empresa_usuario_id,
            rol: empresaPermitidaActual.rol_usuario,
            permisos: empresaPermitidaActual.permisos_usuario || {},
          });
        }
      } else {
        setEmpresa(null);
        setEmpresaUsuarioActiva(null);
      }

      localStorage.removeItem("caja_diaria_empresa");
    } catch (error) {
      console.error("Error cargando empresas disponibles:", error);
    }
  };

  const cambiarEmpresaActiva = (empresaId) => {
    const seleccionada = empresasDisponibles.find((emp) => String(emp.id) === String(empresaId));
    if (!seleccionada) return;

    cancelarAutosavePendiente();
    primeraCargaCajaRef.current = true;
    setFilas([]);
    setHistorialCajas([]);
    limpiarFormularioCierre();

    setEmpresa(seleccionada);
    setEmpresaUsuarioActiva({
      id: seleccionada.empresa_usuario_id,
      rol: seleccionada.rol_usuario,
      permisos: seleccionada.permisos_usuario || {},
    });
    localStorage.setItem("empresa", JSON.stringify(seleccionada));
    localStorage.removeItem("caja_diaria_empresa");
    window.dispatchEvent(new Event("empresaActualizada"));
    window.dispatchEvent(new Event("cajaDiariaEmpresaActualizada"));
  };

  const alternarEmpresaReporte = (empresaId) => {
    setEmpresasReporteIds((prev) => {
      const existe = prev.some((id) => String(id) === String(empresaId));
      let nuevosIds = existe
        ? prev.filter((id) => String(id) !== String(empresaId))
        : [...prev, empresaId];

      if (nuevosIds.length === 0) nuevosIds = [empresaId];

      localStorage.setItem("empresas_caja_reporte_ids", JSON.stringify(nuevosIds));
      return nuevosIds;
    });
  };

  const seleccionarSoloEmpresaActiva = () => {
    if (!empresa?.id) return;
    setEmpresasReporteIds([empresa.id]);
    localStorage.setItem("empresas_caja_reporte_ids", JSON.stringify([empresa.id]));
  };

  const alternarEmpresaEmpleadosComision = (empresaId) => {
    setEmpresasEmpleadosComisionIds((prev) => {
      const existe = prev.some((id) => String(id) === String(empresaId));
      let nuevosIds = existe
        ? prev.filter((id) => String(id) !== String(empresaId))
        : [...prev, empresaId];

      if (nuevosIds.length === 0) nuevosIds = [empresaId];

      localStorage.setItem("empresas_empleados_comision_ids", JSON.stringify(nuevosIds));
      return nuevosIds;
    });
  };

  const seleccionarSoloActivaEmpleadosComision = () => {
    if (!empresa?.id) return;
    setEmpresasEmpleadosComisionIds([empresa.id]);
    localStorage.setItem("empresas_empleados_comision_ids", JSON.stringify([empresa.id]));
  };

  const seleccionarTodasEmpleadosComision = () => {
    const ids = empresasDisponibles.map((emp) => emp.id).filter(Boolean);
    if (!ids.length) return;
    setEmpresasEmpleadosComisionIds(ids);
    localStorage.setItem("empresas_empleados_comision_ids", JSON.stringify(ids));
  };

  const nombreEmpresasEmpleadosComision = () => {
    const seleccionadas = empresasDisponibles.filter((emp) =>
      empresasEmpleadosComisionIds.some((id) => String(id) === String(emp.id))
    );

    if (seleccionadas.length === 0) return "Sin empresas";
    if (seleccionadas.length === 1) return seleccionadas[0].nombre;
    return `${seleccionadas.length} empresas con empleados`;
  };

  const seleccionarTodasEmpresasReporte = () => {
    const ids = empresasDisponibles.map((emp) => emp.id).filter(Boolean);
    if (!ids.length) return;
    setEmpresasReporteIds(ids);
    localStorage.setItem("empresas_caja_reporte_ids", JSON.stringify(ids));
  };



  useEffect(() => {
    // Limpia la empresa de caja vieja que podía venir de otro usuario/sesión.
    localStorage.removeItem("caja_diaria_empresa");
    cargarEmpresasDisponibles();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nuevoUserId = session?.user?.id || null;

      if (userIdActivoRef.current && userIdActivoRef.current !== nuevoUserId) {
        cancelarAutosavePendiente();
        localStorage.removeItem("caja_diaria_empresa");
        setFilas([]);
        setHistorialCajas([]);
        limpiarFormularioCierre();
      }

      userIdActivoRef.current = nuevoUserId;
      cargarEmpresasDisponibles();
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!empresa?.id) {
      setMetodos([]);
      setFilas([]);
      limpiarFormularioCierre();
      setHistorialCajas([]);
      return;
    }

    cargarMetodos();
    cargarClasificaciones();
    cargarEmpleadosComision();
  }, [
    empresa?.id,
    empresaIdsReporte.join("|"),
    empresasEmpleadosComisionIds.join("|"),
  ]);

  useEffect(() => {
    if (empresa?.id && metodos.length > 0 && fechaLocal) {
      cargarCajaDelDia(fechaLocal);
    }
  }, [empresa?.id, metodos, fechaLocal, empresaIdsReporte.join("|")]);

  useEffect(() => {
    if (empresaIdsReporte.length > 0) {
      cargarHistorialCajas();
    }
  }, [empresaIdsReporte.join("|"), filtroDesde, filtroHasta]);

  useEffect(() => {
    if (!empresa?.id || modoSoloLecturaMultiempresa) return;
    if (primeraCargaCajaRef.current || cargandoCajaRef.current) return;
    if (guardandoManual || modalManual.open || modalClasificacion.open || modalFacturacion.open || modalNuevaClasificacion) return;

    programarAutosaveCaja("edicion_caja");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filas,
    cierreRealizado,
    remesaEfectivo,
    cuentaDestinoEfectivo,
    numeroRemesaEfectivo,
    comentarioCierre,
    responsableCaja,
    elaboradoPor,
    revisadoPor,
  ]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);



  const crearFilaVacia = (metodosActuales = metodos, nombrePaciente = "") => {
    const pagos = {};
    const referencias = {};

    metodosActuales.forEach((m) => {
      pagos[m.id] = "";
      referencias[m.id] = "";
    });

    return {
      uid: crypto.randomUUID(),
      paciente: nombrePaciente,
      pagos,
      referencias,
      venta_id: null,
      origen: "manual",
      grupoFacturacion: "",
      empresaId: empresa?.id || null,
      empresaNombre: empresa?.nombre || "Empresa",
    };
  };

  const limpiarFormularioCierre = () => {
    setCierreRealizado(false);
    setRemesaEfectivo(false);
    setCuentaDestinoEfectivo("");
    setNumeroRemesaEfectivo("");
    setComentarioCierre("");
    setResponsableCaja("");
    setElaboradoPor("");
    setRevisadoPor("");
  };

  const limpiarCajaActual = () => {
    if (modoSoloLecturaMultiempresa) {
      return alert("Seleccioná solo una empresa para modificar la caja.");
    }

    const clave = window.prompt(
      "⚠️ Esta acción limpiará TODO el formulario de la caja actual.\n\nIngrese la contraseña para continuar:"
    );

    if (clave === null) return;

    if (clave !== "EdAdmon26") {
      return alert("Contraseña incorrecta. No se limpió el formulario.");
    }

    const confirmar = window.confirm(
      "¿Seguro que deseas limpiar completamente el formulario de esta caja?"
    );

    if (!confirmar) return;

    setFilas([]);
    limpiarFormularioCierre();
    alert("Formulario limpiado correctamente.");
  };

  const validarEmpresaUsuarioActual = async (empresaId = empresa?.id) => {
    const { data: userData, error: errorUser } = await supabase.auth.getUser();

    if (errorUser) {
      console.error(errorUser);
      return {
        ok: false,
        mensaje: "No se pudo validar el usuario autenticado.",
      };
    }

    const user = userData?.user;

    if (!user?.id) {
      return {
        ok: false,
        mensaje: "No hay usuario autenticado.",
      };
    }

    const { data, error } = await supabase
      .from("empresa_usuarios")
      .select("id, empresa_id, user_id, rol, permisos, activo")
      .eq("empresa_id", empresaId)
      .eq("user_id", user.id)
      .eq("activo", true)
      .maybeSingle();

    if (error) {
      console.error(error);
      return {
        ok: false,
        mensaje: "No se pudo validar el acceso del usuario a esta empresa.",
      };
    }

    if (!data?.id) {
      return {
        ok: false,
        mensaje: "Este usuario no tiene acceso activo a esta empresa.",
      };
    }

    return {
      ok: true,
      user,
      empresaUsuario: data,
    };
  };

  const validarEdicionUnaEmpresa = () => {
    if (modoSoloLecturaMultiempresa) {
      alert("Modo combinado: solo podés consultar/exportar. Para modificar, seleccioná solo una empresa.");
      return false;
    }

    return true;
  };

  const programarAutosaveCaja = (motivo = "cambio") => {
    if (!empresa?.id || modoSoloLecturaMultiempresa) return;

    cancelarAutosavePendiente();

    const empresaCapturada = empresa;
    const fechaCapturada = fechaLocal;
    const filasCapturadas = filas;

    setAutosaveStatus("Guardando cambios...");

    autosaveTimerRef.current = setTimeout(async () => {
      // Si el usuario cambió de empresa/fecha antes de que corra el autosave,
      // no guardamos para evitar cruzar cajas.
      if (
        String(empresaCapturada?.id || "") !== String(empresa?.id || "") ||
        String(fechaCapturada || "") !== String(fechaLocal || "")
      ) {
        setAutosaveStatus("");
        return;
      }

      await guardarCajaSilencioso(motivo, {
        empresaOverride: empresaCapturada,
        fechaOverride: fechaCapturada,
        filasOverride: filasCapturadas,
      });
    }, 900);
  };

  const guardarCajaSilencioso = async (motivo = "autosave", opcionesExtra = {}) => {
    const empresaGuardado = opcionesExtra.empresaOverride || empresa;
    const fechaAutosave = opcionesExtra.fechaOverride || fechaLocal;

    if (!empresaGuardado?.id || modoSoloLecturaMultiempresa || !fechaAutosave) return;

    try {
      const resultado = await guardarCaja({
        silencioso: true,
        origen: motivo,
        empresaOverride: empresaGuardado,
        fechaOverride: fechaAutosave,
        ...opcionesExtra,
      });

      if (resultado === false) {
        setAutosaveStatus("Cambios pendientes");
        return;
      }

      setAutosaveStatus("Guardado automático");
      setTimeout(() => setAutosaveStatus(""), 2400);
    } catch (error) {
      console.error("Error en guardado automático:", error);
      setAutosaveStatus("No se pudo guardar automáticamente");
    }
  };

  const cargarMetodos = async () => {
    const idsConsulta = empresaIdsReporte.length > 0 ? empresaIdsReporte : empresa?.id ? [empresa.id] : [];
    if (idsConsulta.length === 0) return;

    const { data, error } = await supabase
      .from("metodos_pago")
      .select("*")
      .in("empresa_id", idsConsulta)
      .eq("activo", true)
      .order("orden", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al cargar métodos de pago");
      return;
    }

    const mapa = new Map();

    (data || []).forEach((m) => {
      const nombreNormalizado = String(m.nombre || "").trim().toLowerCase();

      if (!mapa.has(nombreNormalizado)) {
        mapa.set(nombreNormalizado, {
          ...m,
          id: nombreNormalizado,
          metodoIds: [m.id],
          empresasOrigen: [m.empresa_id],
        });
      } else {
        const existente = mapa.get(nombreNormalizado);
        existente.metodoIds.push(m.id);
        existente.empresasOrigen.push(m.empresa_id);
      }
    });

    setMetodos(Array.from(mapa.values()));
  };

  const cargarClasificaciones = async (empresaIdConsulta = empresa?.id) => {
    if (!empresaIdConsulta) return;

    const { data, error } = await supabase
      .from("clasificaciones_pacientes")
      .select("*")
      .eq("empresa_id", empresaIdConsulta)
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al cargar clasificaciones de pacientes");
      return;
    }

    setClasificaciones(data || []);
  };

  const cargarEmpleadosComision = async () => {
    const ids = empresasEmpleadosComisionIds.length > 0 ? empresasEmpleadosComisionIds : empresa?.id ? [empresa.id] : [];
    if (ids.length === 0) return;

    const { data, error } = await supabase
      .from("empleados_comision")
      .select("*")
      .in("empresa_id", ids)
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      alert("Error al cargar empleados de comisión");
      return;
    }

    setEmpleadosComision(data || []);
  };

  const normalizarTextoLlave = (valor) => {
    return String(valor || "").trim().toLowerCase();
  };

  const construirLlaveClasificacion = ({
    empresaId,
    fecha,
    paciente,
    ventaId = "",
    grupoFacturacion = "",
  }) => {
    return [
      String(empresaId || ""),
      String(fecha || ""),
      normalizarTextoLlave(paciente),
      String(ventaId || ""),
      String(grupoFacturacion || ""),
    ].join("__");
  };

  const obtenerLlavesPosiblesClasificacion = (fila, fecha = fechaLocal) => {
    if (!fila) return [];

    const empresaId = fila.empresaId || empresa?.id;
    const paciente = fila.paciente || "";

    const llaves = [
      construirLlaveClasificacion({
        empresaId,
        fecha,
        paciente,
        ventaId: fila.venta_id || "",
        grupoFacturacion: fila.grupoFacturacion || "",
      }),
      construirLlaveClasificacion({
        empresaId,
        fecha,
        paciente,
        ventaId: fila.venta_id || "",
        grupoFacturacion: "",
      }),
      construirLlaveClasificacion({
        empresaId,
        fecha,
        paciente,
        ventaId: "",
        grupoFacturacion: fila.grupoFacturacion || "",
      }),
      construirLlaveClasificacion({
        empresaId,
        fecha,
        paciente,
        ventaId: "",
        grupoFacturacion: "",
      }),
    ];

    return Array.from(new Set(llaves));
  };

  const llaveClasificacionFila = (fila, fecha = fechaLocal, empresaId = empresa?.id) => {
    return construirLlaveClasificacion({
      empresaId: fila?.empresaId || empresaId,
      fecha,
      paciente: fila?.paciente || "",
      ventaId: fila?.venta_id || "",
      grupoFacturacion: fila?.grupoFacturacion || "",
    });
  };

  const cargarClasificacionesAsignadas = async (fechaBuscada = fechaLocal, empresaId = empresa?.id) => {
    if (!empresaId || !fechaBuscada) {
      setClasificacionesAsignadas({});
      return;
    }

    const { data, error } = await supabase
      .from("caja_paciente_clasificaciones")
      .select(`
        id,
        empresa_id,
        fecha_local,
        paciente,
        venta_id,
        grupo_facturacion,
        clasificacion_id,
        clasificaciones_pacientes (
          id,
          nombre,
          monto
        )
      `)
      .eq("empresa_id", empresaId)
      .eq("fecha_local", fechaBuscada);

    if (error) {
      console.error(error);
      alert("Error al cargar clasificaciones asignadas");
      cargandoCajaRef.current = false;
      return;
    }

    const mapa = {};
    (data || []).forEach((item) => {
      const keys = [
        construirLlaveClasificacion({
          empresaId: item.empresa_id,
          fecha: item.fecha_local,
          paciente: item.paciente,
          ventaId: item.venta_id || "",
          grupoFacturacion: item.grupo_facturacion || "",
        }),
        construirLlaveClasificacion({
          empresaId: item.empresa_id,
          fecha: item.fecha_local,
          paciente: item.paciente,
          ventaId: item.venta_id || "",
          grupoFacturacion: "",
        }),
        construirLlaveClasificacion({
          empresaId: item.empresa_id,
          fecha: item.fecha_local,
          paciente: item.paciente,
          ventaId: "",
          grupoFacturacion: item.grupo_facturacion || "",
        }),
        construirLlaveClasificacion({
          empresaId: item.empresa_id,
          fecha: item.fecha_local,
          paciente: item.paciente,
          ventaId: "",
          grupoFacturacion: "",
        }),
      ];

      keys.forEach((key) => {
        if (!mapa[key]) mapa[key] = [];
        if (!mapa[key].some((x) => String(x.id) === String(item.id))) {
          mapa[key].push(item);
        }
      });
    });

    setClasificacionesAsignadas(mapa);
  };

  const abrirModalClasificacion = async (filaUid) => {
    const fila = filas.find((f) => f.uid === filaUid);
    if (!fila) return;

    await cargarClasificaciones(fila.empresaId || empresa?.id);

    setModalClasificacion({
      open: true,
      filaUid,
    });
  };

  const cerrarModalClasificacion = () => {
    setModalClasificacion({
      open: false,
      filaUid: null,
    });
  };

  const abrirNuevaClasificacionRapida = () => {
    setNuevoNombreClasificacion("");
    setNuevoMontoClasificacion("");
    setModalNuevaClasificacion(true);
  };

  const cerrarNuevaClasificacionRapida = () => {
    if (guardandoNuevaClasificacion) return;
    setModalNuevaClasificacion(false);
    setNuevoNombreClasificacion("");
    setNuevoMontoClasificacion("");
  };

  const guardarNuevaClasificacionRapida = async () => {
    const empresaBaseId = filaModalClasificacion?.empresaId || empresa?.id;
    if (!empresaBaseId) return alert("No hay empresa para crear la clasificación");
    if (!nuevoNombreClasificacion.trim()) {
      return alert("Escribe el nombre de la clasificación");
    }

    setGuardandoNuevaClasificacion(true);

    const { error } = await supabase
      .from("clasificaciones_pacientes")
      .insert([
        {
          empresa_id: empresaBaseId,
          nombre: nuevoNombreClasificacion.trim(),
          monto: Number(nuevoMontoClasificacion || 0),
          activo: true,
        },
      ]);

    setGuardandoNuevaClasificacion(false);

    if (error) {
      console.error(error);
      return alert("Error al crear clasificación");
    }

    await cargarClasificaciones(empresaBaseId);
    cerrarNuevaClasificacionRapida();
  };

  const filaModalClasificacion = filas.find((f) => f.uid === modalClasificacion.filaUid);

  const obtenerClasificacionesFila = (fila) => {
    if (!fila) return [];

    const llaves = obtenerLlavesPosiblesClasificacion(fila);
    const encontrados = [];

    llaves.forEach((key) => {
      (clasificacionesAsignadas[key] || []).forEach((item) => {
        if (!encontrados.some((x) => String(x.id) === String(item.id))) {
          encontrados.push(item);
        }
      });
    });

    return encontrados;
  };

  const obtenerReferenciasFila = (fila) => {
    if (!fila?.referencias) return [];

    return metodos
      .map((metodo) => {
        const valor = fila.referencias?.[metodo.id];
        if (!valor || !String(valor).trim()) return null;

        return {
          metodo: metodo.nombre,
          valor: String(valor).trim(),
        };
      })
      .filter(Boolean);
  };

  const obtenerTextoClasificacionesParaReporte = (item) => {
    if (!item) return "";

    const filaTemporal = {
      paciente: item.paciente || "",
      venta_id: item.venta_id || "",
      grupoFacturacion: item.grupoFacturacion || item.grupo_facturacion || "",
      empresaId: item.empresaId || item.empresa_id || empresa?.id,
    };

    const encontradas = obtenerClasificacionesFila(filaTemporal);

    return encontradas
      .map((asig) => asig.clasificaciones_pacientes?.nombre)
      .filter(Boolean)
      .join(", ");
  };

  const asignarClasificacionAFila = async (clasificacionId) => {
    const fila = filaModalClasificacion;
    if (!fila) return;
    const empresaFilaId = fila.empresaId || empresa?.id;
    if (!empresaFilaId) return alert("No hay empresa para esta fila");
    if (!fechaLocal) return alert("No hay fecha seleccionada");
    if (!fila.paciente?.trim()) return alert("Primero escribe el nombre del paciente");

    const { error } = await supabase
      .from("caja_paciente_clasificaciones")
      .insert([
        {
          empresa_id: empresaFilaId,
          fecha_local: fechaLocal,
          paciente: fila.paciente.trim(),
          venta_id: fila.venta_id ? String(fila.venta_id) : null,
          grupo_facturacion: fila.grupoFacturacion || null,
          clasificacion_id: clasificacionId,
        },
      ]);

    if (error) {
      if (error.code === "23505") {
        return alert("Esa clasificación ya está asignada a este paciente");
      }
      console.error(error);
      return alert("Error al asignar clasificación");
    }

    await cargarCajaDelDia(fechaLocal);
  };

  const quitarClasificacionAsignada = async (registroId) => {
    const { error } = await supabase
      .from("caja_paciente_clasificaciones")
      .delete()
      .eq("id", registroId);

    if (error) {
      console.error(error);
      return alert("Error al quitar clasificación");
    }

    await cargarCajaDelDia(fechaLocal);
  };

  const obtenerDatosComisiones = async () => {
    const idsEmpresasCaja = empresaIdsReporte.length > 0 ? empresaIdsReporte : empresa?.id ? [empresa.id] : [];
    const idsEmpresasEmpleados = empresasEmpleadosComisionIds.length > 0
      ? empresasEmpleadosComisionIds
      : empresa?.id
      ? [empresa.id]
      : [];

    if (idsEmpresasCaja.length === 0) {
      alert("Seleccioná al menos una empresa para calcular comisiones");
      return null;
    }

    if (idsEmpresasEmpleados.length === 0) {
      alert("Seleccioná al menos una empresa para tomar empleados");
      return null;
    }

    if (!fechaComisionDesde || !fechaComisionHasta) {
      alert("Seleccioná desde y hasta");
      return null;
    }

    if (fechaComisionDesde > fechaComisionHasta) {
      alert("La fecha desde no puede ser mayor que la fecha hasta");
      return null;
    }

    setLoadingComision(true);

    const [{ data: asignaciones, error: errorAsignaciones }, { data: empleados, error: errorEmpleados }] =
      await Promise.all([
        supabase
          .from("caja_paciente_clasificaciones")
          .select(`
            id,
            empresa_id,
            fecha_local,
            paciente,
            clasificacion_id,
            clasificaciones_pacientes (
              id,
              empresa_id,
              nombre,
              monto
            )
          `)
          .in("empresa_id", idsEmpresasCaja)
          .gte("fecha_local", fechaComisionDesde)
          .lte("fecha_local", fechaComisionHasta),
        supabase
          .from("empleados_comision")
          .select("*")
          .in("empresa_id", idsEmpresasEmpleados)
          .eq("activo", true)
          .order("nombre", { ascending: true }),
      ]);

    setLoadingComision(false);

    if (errorAsignaciones || errorEmpleados) {
      console.error(errorAsignaciones || errorEmpleados);
      alert("Error al obtener datos de comisión");
      return null;
    }

    const resumenMap = new Map();

    (asignaciones || []).forEach((asig) => {
      const c = asig.clasificaciones_pacientes;
      if (!c) return;

      const nombreClasificacion = String(c.nombre || "").trim();
      const montoClasificacion = Number(c.monto || 0);

      // Une columnas cuando la clasificación tiene el mismo nombre y el mismo monto,
      // aunque venga de empresas diferentes.
      const key = `${nombreClasificacion.toLowerCase()}__${montoClasificacion.toFixed(2)}`;

      if (!resumenMap.has(key)) {
        resumenMap.set(key, {
          id: key,
          empresasIds: new Set(),
          empresasNombres: new Set(),
          nombre: nombreClasificacion,
          monto: montoClasificacion,
          cantidad: 0,
          total: 0,
        });
      }

      const item = resumenMap.get(key);
      item.empresasIds.add(asig.empresa_id);
      item.empresasNombres.add(obtenerNombreEmpresa(asig.empresa_id));
      item.cantidad += 1;
      item.total = item.cantidad * item.monto;
    });

    const resumenClasificaciones = Array.from(resumenMap.values())
      .map((item) => ({
        ...item,
        empresasIds: Array.from(item.empresasIds),
        empresasNombres: Array.from(item.empresasNombres),
      }))
      .sort((a, b) => {
        const nombreCompare = String(a.nombre).localeCompare(String(b.nombre));
        if (nombreCompare !== 0) return nombreCompare;
        return Number(a.monto || 0) - Number(b.monto || 0);
      });

    const totalDevengado = resumenClasificaciones.reduce((acc, c) => acc + Number(c.total || 0), 0);

    const filasEmpleados = (empleados || []).map((emp) => ({
      empleado: emp.nombre,
      empresaEmpleado: obtenerNombreEmpresa(emp.empresa_id),
      clasificaciones: resumenClasificaciones,
      totalDevengado,
    }));

    return {
      empleados: filasEmpleados,
      clasificaciones: resumenClasificaciones,
      totalDevengado,
      cantidadPacientes: resumenClasificaciones.reduce((acc, c) => acc + Number(c.cantidad || 0), 0),
    };
  };

  const exportarComisionesExcel = async () => {
    const datos = await obtenerDatosComisiones();
    if (!datos) return;

    if (datos.empleados.length === 0) {
      return alert("No hay empleados activos para el reporte");
    }

    const rows = [
      { Empleado: `Empresas calculadas: ${nombreEmpresasReporte}`, Total: "" },
      { Empleado: `Empleados tomados de: ${nombreEmpresasEmpleadosComision()}`, Total: "" },
      { Empleado: "Clasificaciones: según empresa donde fue clasificado cada paciente", Total: "" },
      { Empleado: `COMISIONES DEL ${formatearFecha(fechaComisionDesde)} AL ${formatearFecha(fechaComisionHasta)}`, Total: "" },
      {},
    ];

    datos.empleados.forEach((emp, index) => {
      const fila = {
        No: index + 1,
        Empleado: emp.empleado,
      };

      emp.clasificaciones.forEach((c) => {
        fila[`${c.nombre} (${formatearMonto(c.monto)})`] = c.cantidad;
      });

      fila["Total devengado"] = formatearMonto(emp.totalDevengado);
      rows.push(fila);
    });

    const totalFila = {
      No: "",
      Empleado: "TOTAL COMISIONES DEL PERIODO",
    };

    datos.clasificaciones.forEach((c) => {
      totalFila[`${c.nombre} (${formatearMonto(c.monto)})`] = c.cantidad;
    });

    totalFila["Total devengado"] = formatearMonto(datos.totalDevengado * datos.empleados.length);
    rows.push(totalFila);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows.find((r) => Object.keys(r).length > 2) || { Empleado: "" }).map((k) => ({
      wch: k === "Empleado" ? 34 : 18,
    }));
    XLSX.utils.book_append_sheet(wb, ws, "Comisiones");
    XLSX.writeFile(wb, `Comisiones_${nombreEmpresasReporte || "Empresas"}_${fechaComisionDesde}_a_${fechaComisionHasta}.xlsx`);
  };

  const exportarComisionesPDF = async () => {
    const datos = await obtenerDatosComisiones();
    if (!datos) return;

    if (datos.empleados.length === 0) {
      return alert("No hay empleados activos para el reporte");
    }

    const doc = new jsPDF("landscape", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    const totalGeneralComisiones = datos.totalDevengado * datos.empleados.length;
    const totalPacientes = datos.cantidadPacientes || 0;

    // Encabezado profesional
    doc.setFillColor(87, 72, 102);
    doc.rect(0, 0, pageWidth, 30, "F");

    doc.setFillColor(244, 240, 247);
    doc.roundedRect(12, 8, 16, 16, 4, 4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text((empresa?.nombre || "EMPRESA").toUpperCase(), pageWidth / 2, 12, {
      align: "center",
    });

    doc.setFontSize(11);
    doc.text(
      `CÁLCULO DE COMISIONES DEL ${formatearFecha(fechaComisionDesde)} AL ${formatearFecha(fechaComisionHasta)}`,
      pageWidth / 2,
      20,
      { align: "center" }
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(226, 232, 240);
    doc.text(
      `Empresas calculadas: ${nombreEmpresasReporte}  ·  Empleados: ${nombreEmpresasEmpleadosComision()}`,
      pageWidth / 2,
      26,
      { align: "center" }
    );

    // Tarjetas resumen
    const cardY = 36;
    const cardW = 62;
    const cardH = 18;
    const cardGap = 6;
    const cardStartX = 14;

    const summaryCards = [
      { title: "Pacientes clasificados", value: String(totalPacientes) },
      { title: "Clasificaciones usadas", value: String(datos.clasificaciones.length) },
      { title: "Empleados en reporte", value: String(datos.empleados.length) },
      { title: "Total general", value: `$${formatearMonto(totalGeneralComisiones)}` },
    ];

    summaryCards.forEach((card, index) => {
      const x = cardStartX + index * (cardW + cardGap);

      doc.setFillColor(250, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, cardY, cardW, cardH, 3, 3, "FD");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(card.title, x + 4, cardY + 6);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(87, 72, 102);
      doc.text(card.value, x + 4, cardY + 14);
    });

    const head = [[
      "No.",
      "Empleado",
      ...datos.clasificaciones.map((c) => `${c.nombre}\n$${formatearMonto(c.monto)}`),
      "Total devengado",
    ]];

    const body = datos.empleados.map((emp, index) => [
      index + 1,
      emp.empleado,
      ...emp.clasificaciones.map((c) => String(c.cantidad)),
      `$${formatearMonto(emp.totalDevengado)}`,
    ]);

    const foot = [[
      "",
      "TOTAL COMISIONES DEL PERIODO",
      ...datos.clasificaciones.map((c) => String(c.cantidad)),
      `$${formatearMonto(totalGeneralComisiones)}`,
    ]];

    autoTable(doc, {
      startY: 62,
      head,
      body,
      foot,
      theme: "grid",
      tableLineColor: [203, 213, 225],
      tableLineWidth: 0.1,
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        textColor: [31, 41, 55],
        halign: "center",
        valign: "middle",
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 66, halign: "left", fontStyle: "bold" },
      },
      headStyles: {
        fillColor: [107, 90, 122],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252],
      },
      footStyles: {
        fillColor: [244, 240, 247],
        textColor: [87, 72, 102],
        fontStyle: "bold",
      },
      didParseCell: (data) => {
        const lastColumnIndex = data.table.columns.length - 1;

        if (data.section === "body" && data.column.index === lastColumnIndex) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [87, 72, 102];
          data.cell.styles.fillColor = [248, 245, 250];
        }

        if (data.section === "foot") {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const finalY = doc.lastAutoTable?.finalY || 72;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Nota: las clasificaciones con el mismo nombre y el mismo monto se consolidan en una sola columna, aunque pertenezcan a empresas distintas.",
      14,
      Math.min(finalY + 8, 195)
    );

    doc.setDrawColor(226, 232, 240);
    doc.line(14, 202, pageWidth - 14, 202);

    doc.setFontSize(7);
    doc.text(`Generado: ${formatearFecha(obtenerFechaLocalSV())}`, 14, 207);
    doc.text("Reporte de comisiones", pageWidth - 14, 207, { align: "right" });

    doc.save(`Comisiones_${nombreEmpresasReporte || "Empresas"}_${fechaComisionDesde}_a_${fechaComisionHasta}.pdf`);
  };

  const cargarCajaDelDia = async (fechaBuscada) => {
    cancelarAutosavePendiente();
    primeraCargaCajaRef.current = true;
    cargandoCajaRef.current = true;

    const idsConsulta = empresaIdsReporte.length > 0 ? empresaIdsReporte : empresa?.id ? [empresa.id] : [];
    if (idsConsulta.length === 0) {
      cargandoCajaRef.current = false;
      return;
    }

    const { data: cajas, error: errorCaja } = await supabase
      .from("cajas_diarias")
      .select("*")
      .in("empresa_id", idsConsulta)
      .eq("fecha_local", fechaBuscada);

    if (errorCaja) {
      console.error(errorCaja);
      alert("Error al cargar la caja del día");
      cargandoCajaRef.current = false;
      return;
    }

    const cajaActiva = (cajas || []).find((c) => String(c.empresa_id) === String(empresa?.id));

    if (cajaActiva) {
      setCierreRealizado(Boolean(cajaActiva.cierre_realizado));
      setRemesaEfectivo(Boolean(cajaActiva.remesa_efectivo));
      setCuentaDestinoEfectivo(cajaActiva.cuenta_destino_efectivo || "");
      setNumeroRemesaEfectivo(cajaActiva.numero_remesa_efectivo || "");
      setComentarioCierre(cajaActiva.comentario_cierre || "");
      setResponsableCaja(cajaActiva.responsable_caja || "");
      setElaboradoPor(cajaActiva.elaborado_por || "");
      setRevisadoPor(cajaActiva.revisado_por || "");
    } else {
      limpiarFormularioCierre();
    }

    if (!cajas || cajas.length === 0) {
      setFilas([]);
      setClasificacionesAsignadas({});
      primeraCargaCajaRef.current = false;
      cargandoCajaRef.current = false;
      return;
    }

    const idsCajas = cajas.map((c) => c.id);
    const empresaPorCajaId = {};
    cajas.forEach((caja) => {
      empresaPorCajaId[caja.id] = {
        id: caja.empresa_id,
        nombre: obtenerNombreEmpresa(caja.empresa_id),
      };
    });

    const { data: detalle, error: errorDetalle } = await supabase
      .from("caja_diaria_detalle")
      .select(`
        id,
        caja_diaria_id,
        paciente,
        metodo_pago_id,
        monto,
        referencia,
        venta_id,
        grupo_facturacion
      `)
      .in("caja_diaria_id", idsCajas);

    if (errorDetalle) {
      console.error(errorDetalle);
      alert("Error al cargar el detalle");
      cargandoCajaRef.current = false;
      return;
    }

    const metodoColumnaPorId = {};
    metodos.forEach((m) => {
      (m.metodoIds || [m.id]).forEach((realId) => {
        metodoColumnaPorId[String(realId)] = m.id;
      });
    });

    const mapa = {};

    (detalle || []).forEach((item) => {
      const nombrePaciente = item.paciente?.trim() || "Sin nombre";
      const empresaFila = empresaPorCajaId[item.caja_diaria_id] || {
        id: empresa?.id,
        nombre: empresa?.nombre || "Empresa",
      };

      const llave = item.venta_id
        ? `${empresaFila.id}__${nombrePaciente}__venta__${item.venta_id}`
        : `${empresaFila.id}__${nombrePaciente}__manual__${item.grupo_facturacion || item.id}`;

      if (!mapa[llave]) {
        mapa[llave] = {
          ...crearFilaVacia(metodos, nombrePaciente),
          venta_id: item.venta_id || null,
          origen: item.venta_id ? "venta" : "manual",
          grupoFacturacion: item.grupo_facturacion || "",
          empresaId: empresaFila.id,
          empresaNombre: empresaFila.nombre,
        };
      }

      const metodoColumnaId = metodoColumnaPorId[String(item.metodo_pago_id)] || String(item.metodo_pago_id);
      const montoActual = Number(mapa[llave].pagos[metodoColumnaId] || 0);

      mapa[llave].pagos[metodoColumnaId] =
        montoActual + Number(item.monto || 0);

      const refActual = mapa[llave].referencias[metodoColumnaId] || "";
      const nuevaRef = item.referencia || "";

      if (nuevaRef) {
        const refs = refActual
          ? refActual.split(" | ").map((x) => x.trim()).filter(Boolean)
          : [];

        if (!refs.includes(nuevaRef)) {
          refs.push(nuevaRef);
        }

        mapa[llave].referencias[metodoColumnaId] = refs.join(" | ");
      }
    });

    setFilas(Object.values(mapa));
    primeraCargaCajaRef.current = false;

    // Carga clasificaciones asignadas de todas las empresas seleccionadas para esa fecha.
    const { data: asignadas, error: errorAsignadas } = await supabase
      .from("caja_paciente_clasificaciones")
      .select(`
        id,
        empresa_id,
        fecha_local,
        paciente,
        venta_id,
        grupo_facturacion,
        clasificacion_id,
        clasificaciones_pacientes (
          id,
          nombre,
          monto
        )
      `)
      .in("empresa_id", idsConsulta)
      .eq("fecha_local", fechaBuscada);

    if (errorAsignadas) {
      console.error(errorAsignadas);
      alert("Error al cargar clasificaciones asignadas");
      return;
    }

    const mapaAsignadas = {};
    (asignadas || []).forEach((item) => {
      const keys = [
        construirLlaveClasificacion({
          empresaId: item.empresa_id,
          fecha: item.fecha_local,
          paciente: item.paciente,
          ventaId: item.venta_id || "",
          grupoFacturacion: item.grupo_facturacion || "",
        }),
        construirLlaveClasificacion({
          empresaId: item.empresa_id,
          fecha: item.fecha_local,
          paciente: item.paciente,
          ventaId: item.venta_id || "",
          grupoFacturacion: "",
        }),
        construirLlaveClasificacion({
          empresaId: item.empresa_id,
          fecha: item.fecha_local,
          paciente: item.paciente,
          ventaId: "",
          grupoFacturacion: item.grupo_facturacion || "",
        }),
        construirLlaveClasificacion({
          empresaId: item.empresa_id,
          fecha: item.fecha_local,
          paciente: item.paciente,
          ventaId: "",
          grupoFacturacion: "",
        }),
      ];

      keys.forEach((key) => {
        if (!mapaAsignadas[key]) mapaAsignadas[key] = [];
        if (!mapaAsignadas[key].some((x) => String(x.id) === String(item.id))) {
          mapaAsignadas[key].push(item);
        }
      });
    });

    setClasificacionesAsignadas(mapaAsignadas);
    cargandoCajaRef.current = false;
  };

  const cargarHistorialCajas = async () => {
    if (empresaIdsReporte.length === 0 || !filtroDesde || !filtroHasta) return;

    setLoadingHistorial(true);

    const { data, error } = await supabase
      .from("cajas_diarias")
      .select(`
        id,
        empresa_id,
        fecha_local,
        cierre_realizado,
        remesa_efectivo,
        responsable_caja,
        elaborado_por,
        revisado_por,
        comentario_cierre,
        cuenta_destino_efectivo,
        numero_remesa_efectivo,
        creado_por_user_id,
        actualizado_por_user_id,
        creado_por_empresa_usuario_id,
        actualizado_por_empresa_usuario_id,
        caja_diaria_detalle (
          monto
        )
      `)
      .in("empresa_id", empresaIdsReporte)
      .gte("fecha_local", filtroDesde)
      .lte("fecha_local", filtroHasta)
      .order("fecha_local", { ascending: false });

    setLoadingHistorial(false);

    if (error) {
      console.error(error);
      alert("Error al cargar historial de cajas");
      return;
    }

    const cajas = (data || []).map((caja) => ({
      ...caja,
      empresas: {
        id: caja.empresa_id,
        nombre: obtenerNombreEmpresa(caja.empresa_id),
      },
      total: (caja.caja_diaria_detalle || []).reduce(
        (acc, d) => acc + Number(d.monto || 0),
        0
      ),
    }));

    setHistorialCajas(cajas);
  };

  const abrirCajaHistorial = async (cajaHistorial) => {
    const fecha = typeof cajaHistorial === "string" ? cajaHistorial : cajaHistorial?.fecha_local;
    const empresaCaja = cajaHistorial?.empresas || null;

    if (empresaCaja?.id && String(empresaCaja.id) !== String(empresa?.id)) {
      setEmpresa(empresaCaja);
      localStorage.setItem("empresa", JSON.stringify(empresaCaja));
      localStorage.removeItem("caja_diaria_empresa");
      window.dispatchEvent(new Event("cajaDiariaEmpresaActualizada"));
      setFechaLocal(fecha);
    } else {
      setFechaLocal(fecha);
      await cargarCajaDelDia(fecha);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const irAEditarVenta = (fila) => {
    if (!fila?.venta_id) return;
    setAccionesAbiertasUid(null);

    localStorage.setItem("ventaEditarRapidoId", String(fila.venta_id));
    localStorage.setItem("ventaEditarRapidoOrigen", "caja_diaria");
    localStorage.setItem("ventaEditarRapidoFechaCaja", fechaLocal);

    window.dispatchEvent(new Event("irAReporte"));
  };

  const obtenerMetodosRapidosDefault = () => {
    const prioridad = ["efectivo", "reserva", "tarjeta", "credito", "crédito", "transferencia", "cheque"];

    const ordenados = [...metodos].sort((a, b) => {
      const aNombre = String(a.nombre || "").toLowerCase();
      const bNombre = String(b.nombre || "").toLowerCase();

      const aIndex = prioridad.findIndex((p) => aNombre.includes(p));
      const bIndex = prioridad.findIndex((p) => bNombre.includes(p));

      const aPeso = aIndex === -1 ? 999 : aIndex;
      const bPeso = bIndex === -1 ? 999 : bIndex;

      if (aPeso !== bPeso) return aPeso - bPeso;
      return aNombre.localeCompare(bNombre);
    });

    const principales = ordenados.filter((metodo) =>
      prioridad.some((p) => String(metodo.nombre || "").toLowerCase().includes(p))
    );

    return (principales.length > 0 ? principales : ordenados).slice(0, 2).map((m) => m.id);
  };

  const obtenerKeyMetodosManual = () => {
    return `caja_metodos_manual_ids_${empresa?.id || "sin_empresa"}`;
  };

  const obtenerMetodosManualGuardados = () => {
    try {
      const guardados = JSON.parse(localStorage.getItem(obtenerKeyMetodosManual()) || "null");
      if (Array.isArray(guardados) && guardados.length > 0) {
        const idsValidos = guardados.filter((id) =>
          metodos.some((metodo) => String(metodo.id) === String(id))
        );

        if (idsValidos.length > 0) return idsValidos;
      }
    } catch (error) {
      console.error("Error leyendo métodos manuales guardados:", error);
    }

    return obtenerMetodosRapidosDefault();
  };

  const guardarMetodosManualSeleccionados = (ids) => {
    const idsUnicos = Array.from(new Set((ids || []).map((id) => String(id))));
    localStorage.setItem(obtenerKeyMetodosManual(), JSON.stringify(idsUnicos));
  };

  const abrirModalManualNuevo = async () => {
    if (!validarEdicionUnaEmpresa()) return;

    const filaNueva = crearFilaVacia(metodos);
    filaNueva.grupoFacturacion = "";

    await cargarClasificaciones(empresa?.id);

    setManualClasificacionesIds([]);
    setBusquedaMetodoManual("");
    setBusquedaClasificacionManual("");
    setMostrarTodosMetodosManual(false);
    setModalMetodosManual(false);
    setMetodosManualIds(obtenerMetodosManualGuardados());
    setModalManual({
      open: true,
      editando: false,
      filaOriginalUid: null,
      fila: filaNueva,
    });
  };

  const abrirModalManualEditar = async (filaUid) => {
    if (!validarEdicionUnaEmpresa()) return;
    setAccionesAbiertasUid(null);

    const fila = filas.find((f) => f.uid === filaUid);
    if (!fila) return;

    if (fila.origen === "venta") {
      return alert("Este registro viene de una venta. Editalo desde ventas.");
    }

    if (String(fila.empresaId || empresa?.id) !== String(empresa?.id)) {
      return alert("Este registro pertenece a otra empresa. Cambiá la empresa activa para editarlo.");
    }

    await cargarClasificaciones(fila.empresaId || empresa?.id);

    setManualClasificacionesIds(
      obtenerClasificacionesFila(fila)
        .map((asig) => asig.clasificacion_id)
        .filter(Boolean)
    );
    setBusquedaMetodoManual("");
    setBusquedaClasificacionManual("");
    setMostrarTodosMetodosManual(false);
    setModalMetodosManual(false);

    const metodosConMonto = Object.entries(fila.pagos || {})
      .filter(([, valor]) => Number(valor || 0) > 0)
      .map(([metodoId]) => metodoId);

    setMetodosManualIds(
      Array.from(new Set([...obtenerMetodosManualGuardados(), ...metodosConMonto]))
    );

    setModalManual({
      open: true,
      editando: true,
      filaOriginalUid: fila.uid,
      fila: {
        ...fila,
        pagos: { ...(fila.pagos || {}) },
        referencias: { ...(fila.referencias || {}) },
        grupoFacturacion: fila.grupoFacturacion || "",
      },
    });
  };

  const cerrarModalManual = () => {
    if (guardandoManual) return;

    setModalManual({
      open: false,
      editando: false,
      filaOriginalUid: null,
      fila: null,
    });
    setManualClasificacionesIds([]);
    setBusquedaMetodoManual("");
    setBusquedaClasificacionManual("");
    setMostrarTodosMetodosManual(false);
    setModalMetodosManual(false);
    setMetodosManualIds([]);
  };

  const actualizarModalManualCampo = (campo, valor) => {
    setModalManual((prev) => ({
      ...prev,
      fila: {
        ...(prev.fila || {}),
        [campo]: valor,
      },
    }));
  };

  const actualizarModalManualMonto = (metodoId, valor) => {
    setModalManual((prev) => ({
      ...prev,
      fila: {
        ...(prev.fila || {}),
        pagos: {
          ...((prev.fila && prev.fila.pagos) || {}),
          [metodoId]: valor,
        },
      },
    }));
  };

  const actualizarModalManualReferencia = (metodoId, valor) => {
    setModalManual((prev) => ({
      ...prev,
      fila: {
        ...(prev.fila || {}),
        referencias: {
          ...((prev.fila && prev.fila.referencias) || {}),
          [metodoId]: valor,
        },
      },
    }));
  };

  const alternarClasificacionManual = (clasificacionId) => {
    setManualClasificacionesIds((prev) => {
      const existe = prev.some((id) => String(id) === String(clasificacionId));
      return existe
        ? prev.filter((id) => String(id) !== String(clasificacionId))
        : [...prev, clasificacionId];
    });
  };

  const sincronizarClasificacionesManual = async (filaFinal, filaOriginal = null) => {
    const empresaFilaId = filaFinal.empresaId || empresa?.id;
    if (!empresaFilaId || !fechaLocal || !filaFinal.paciente?.trim()) return;

    const asignadasOriginales = filaOriginal ? obtenerClasificacionesFila(filaOriginal) : [];

    if (asignadasOriginales.length > 0) {
      const idsParaEliminar = asignadasOriginales.map((asig) => asig.id).filter(Boolean);

      if (idsParaEliminar.length > 0) {
        const { error: errorDelete } = await supabase
          .from("caja_paciente_clasificaciones")
          .delete()
          .in("id", idsParaEliminar);

        if (errorDelete) {
          console.error(errorDelete);
          alert("La línea se guardó, pero hubo error al actualizar clasificaciones anteriores.");
        }
      }
    }

    if (manualClasificacionesIds.length === 0) {
      await cargarClasificacionesAsignadas(fechaLocal, empresaFilaId);
      return;
    }

    const payload = manualClasificacionesIds.map((clasificacionId) => ({
      empresa_id: empresaFilaId,
      fecha_local: fechaLocal,
      paciente: filaFinal.paciente.trim(),
      venta_id: null,
      grupo_facturacion: filaFinal.grupoFacturacion || null,
      clasificacion_id: clasificacionId,
    }));

    const { error } = await supabase
      .from("caja_paciente_clasificaciones")
      .insert(payload);

    if (error && error.code !== "23505") {
      console.error(error);
      alert("La línea se guardó, pero hubo error al guardar las clasificaciones.");
    }

    await cargarClasificacionesAsignadas(fechaLocal, empresaFilaId);
  };

  const metodosManualFiltrados = useMemo(() => {
    const texto = busquedaMetodoManual.trim().toLowerCase();

    if (!texto) return metodos;

    return metodos.filter((metodo) =>
      String(metodo.nombre || "").toLowerCase().includes(texto)
    );
  }, [metodos, busquedaMetodoManual]);

  const clasificacionesManualFiltradas = useMemo(() => {
    const texto = busquedaClasificacionManual.trim().toLowerCase();

    if (!texto) return clasificaciones;

    return clasificaciones.filter((clasificacion) =>
      String(clasificacion.nombre || "").toLowerCase().includes(texto)
    );
  }, [clasificaciones, busquedaClasificacionManual]);

  const totalManualModal = useMemo(() => {
    if (!modalManual.fila?.pagos) return 0;

    return metodos.reduce(
      (acc, metodo) => acc + Number(modalManual.fila?.pagos?.[metodo.id] || 0),
      0
    );
  }, [modalManual.fila, metodos]);

  const clasificacionesSeleccionadasManual = useMemo(() => {
    return clasificaciones.filter((clasificacion) =>
      manualClasificacionesIds.some((id) => String(id) === String(clasificacion.id))
    );
  }, [clasificaciones, manualClasificacionesIds]);

  const metodosConMontoManual = useMemo(() => {
    if (!modalManual.fila?.pagos) return [];

    return metodos
      .map((metodo) => ({
        ...metodo,
        monto: Number(modalManual.fila?.pagos?.[metodo.id] || 0),
        referencia: modalManual.fila?.referencias?.[metodo.id] || "",
      }))
      .filter((metodo) => Number(metodo.monto || 0) > 0);
  }, [modalManual.fila, metodos]);

  const metodosPrincipalesManual = useMemo(() => {
    const prioridad = ["efectivo", "reserva", "tarjeta", "credito", "crédito", "transferencia", "cheque"];
    const texto = busquedaMetodoManual.trim().toLowerCase();

    const ordenados = [...metodos].sort((a, b) => {
      const aNombre = String(a.nombre || "").toLowerCase();
      const bNombre = String(b.nombre || "").toLowerCase();

      const aIndex = prioridad.findIndex((p) => aNombre.includes(p));
      const bIndex = prioridad.findIndex((p) => bNombre.includes(p));

      const aPeso = aIndex === -1 ? 999 : aIndex;
      const bPeso = bIndex === -1 ? 999 : bIndex;

      if (aPeso !== bPeso) return aPeso - bPeso;
      return aNombre.localeCompare(bNombre);
    });

    if (texto) {
      return ordenados.filter((metodo) =>
        String(metodo.nombre || "").toLowerCase().includes(texto)
      );
    }

    if (mostrarTodosMetodosManual) return ordenados;

    const principales = ordenados.filter((metodo) =>
      prioridad.some((p) => String(metodo.nombre || "").toLowerCase().includes(p))
    );

    return principales.length > 0 ? principales.slice(0, 6) : ordenados.slice(0, 6);
  }, [metodos, busquedaMetodoManual, mostrarTodosMetodosManual]);

  const metodosOcultosManual = Math.max(0, metodos.length - metodosPrincipalesManual.length);

  const metodosVisiblesManual = useMemo(() => {
    const ids = new Set([
      ...metodosManualIds.map((id) => String(id)),
      ...metodos
        .filter((metodo) => Number(modalManual.fila?.pagos?.[metodo.id] || 0) > 0)
        .map((metodo) => String(metodo.id)),
    ]);

    return metodos.filter((metodo) => ids.has(String(metodo.id)));
  }, [metodos, metodosManualIds, modalManual.fila]);

  const metodosDisponiblesSelector = useMemo(() => {
    const texto = busquedaMetodoManual.trim().toLowerCase();

    return metodos.filter((metodo) => {
      if (!texto) return true;
      return String(metodo.nombre || "").toLowerCase().includes(texto);
    });
  }, [metodos, busquedaMetodoManual]);

  const alternarMetodoManual = (metodoId) => {
    setMetodosManualIds((prev) => {
      const id = String(metodoId);
      const existe = prev.some((item) => String(item) === id);
      let nuevosIds = [];

      if (existe) {
        const tieneMonto = Number(modalManual.fila?.pagos?.[metodoId] || 0) > 0;

        if (tieneMonto) {
          alert("Este método tiene monto. Primero dejá el monto vacío para quitarlo.");
          return prev;
        }

        nuevosIds = prev.filter((item) => String(item) !== id);
      } else {
        nuevosIds = [...prev, metodoId];
      }

      guardarMetodosManualSeleccionados(nuevosIds);
      return nuevosIds;
    });
  };

  const guardarModalManual = async () => {
    const fila = modalManual.fila;
    if (!fila) return;

    if (!fila.paciente?.trim()) {
      return alert("Escribí el nombre del paciente.");
    }

    const tieneMonto = metodos.some((metodo) => Number(fila.pagos?.[metodo.id] || 0) > 0);

    if (!tieneMonto) {
      return alert("Ingresá al menos un monto de cobro.");
    }

    if (manualClasificacionesIds.length === 0) {
      const continuar = window.confirm("¿Quieres guardar sin clasificar?");
      if (!continuar) return;
    }

    setGuardandoManual(true);

    const filaFinal = {
      ...fila,
      paciente: fila.paciente.trim(),
      origen: "manual",
      venta_id: null,
      empresaId: empresa?.id || fila.empresaId || null,
      empresaNombre: empresa?.nombre || fila.empresaNombre || "Empresa",
      grupoFacturacion: fila.grupoFacturacion || "",
      pagos: { ...(fila.pagos || {}) },
      referencias: { ...(fila.referencias || {}) },
    };

    const filaOriginal = modalManual.editando
      ? filas.find((f) => f.uid === modalManual.filaOriginalUid)
      : null;

    const filasActualizadas = modalManual.editando
      ? filas.map((item) =>
          item.uid === modalManual.filaOriginalUid ? filaFinal : item
        )
      : [...filas, filaFinal];

    setFilas(filasActualizadas);

    await sincronizarClasificacionesManual(filaFinal, filaOriginal);

    await guardarCaja({
      silencioso: true,
      origen: "modal_manual_guardado",
      filasOverride: filasActualizadas,
    });

    setAutosaveStatus("Guardado automático");
    setTimeout(() => setAutosaveStatus(""), 2400);

    setGuardandoManual(false);
    cerrarModalManual();
  };

  const agregarFila = () => {
    abrirModalManualNuevo();
  };

  const eliminarFila = (index) => {
    if (!validarEdicionUnaEmpresa()) return;
    setAccionesAbiertasUid(null);

    const fila = filas[index];

    if (String(fila?.empresaId || empresa?.id) !== String(empresa?.id)) {
      return alert("Esta fila pertenece a otra empresa. Cambiá la empresa activa para eliminarla.");
    }

    if (fila?.origen === "venta") {
      return alert("Esa fila viene de una venta. Editala desde el historial de ventas.");
    }

    const nuevas = [...filas];
    nuevas.splice(index, 1);
    setFilas(nuevas);
  };

  const actualizarPaciente = (index, valor) => {
    if (!validarEdicionUnaEmpresa()) return;

    const nuevas = [...filas];

    if (String(nuevas[index]?.empresaId || empresa?.id) !== String(empresa?.id)) {
      return alert("Este registro pertenece a otra empresa. Cambiá la empresa activa para editarlo.");
    }

    if (nuevas[index]?.origen === "venta") {
      return alert("Ese registro viene de una venta. Editalo desde ventas.");
    }

    nuevas[index].paciente = valor;
    setFilas(nuevas);
  };

  const actualizarMonto = (filaIndex, metodoId, valor) => {
    if (!validarEdicionUnaEmpresa()) return;

    const nuevas = [...filas];

    if (String(nuevas[filaIndex]?.empresaId || empresa?.id) !== String(empresa?.id)) {
      return alert("Este registro pertenece a otra empresa. Cambiá la empresa activa para editarlo.");
    }

    if (String(nuevas[filaIndex]?.empresaId || empresa?.id) !== String(empresa?.id)) {
      return alert("Este registro pertenece a otra empresa. Cambiá la empresa activa para editarlo.");
    }

    if (nuevas[filaIndex]?.origen === "venta") {
      return alert("Ese registro viene de una venta. Editalo desde ventas.");
    }

    nuevas[filaIndex].pagos[metodoId] = valor;
    setFilas(nuevas);
  };

  const actualizarReferencia = (filaIndex, metodoId, valor) => {
    if (!validarEdicionUnaEmpresa()) return;

    const nuevas = [...filas];

    if (nuevas[filaIndex]?.origen === "venta") {
      return alert("Ese registro viene de una venta. Editalo desde ventas.");
    }

    nuevas[filaIndex].referencias[metodoId] = valor;
    setFilas(nuevas);
  };

  const abrirModalFacturacion = (filaUid) => {
    if (!validarEdicionUnaEmpresa()) return;

    setAccionesAbiertasUid(null);
    setModalFacturacion({
      open: true,
      filaUid,
    });
  };

  const cerrarModalFacturacion = () => {
    setModalFacturacion({
      open: false,
      filaUid: null,
    });
  };

  const asignarFacturacionJunta = (filaUidOrigen, filaUidDestino) => {
    if (!validarEdicionUnaEmpresa()) return;
    if (!filaUidOrigen || !filaUidDestino || filaUidOrigen === filaUidDestino) return;

    const filaOrigen = filas.find((f) => f.uid === filaUidOrigen);
    const filaDestino = filas.find((f) => f.uid === filaUidDestino);

    const grupoExistente =
      filaOrigen?.grupoFacturacion ||
      filaDestino?.grupoFacturacion ||
      crypto.randomUUID();

    setFilas((prev) =>
      prev.map((fila) =>
        fila.uid === filaUidOrigen || fila.uid === filaUidDestino
          ? { ...fila, grupoFacturacion: grupoExistente }
          : fila
      )
    );

    cerrarModalFacturacion();
  };

  const quitarFacturacionJunta = (filaUid) => {
    if (!validarEdicionUnaEmpresa()) return;
    setAccionesAbiertasUid(null);

    setFilas((prev) =>
      prev.map((fila) =>
        fila.uid === filaUid ? { ...fila, grupoFacturacion: "" } : fila
      )
    );
  };

  const obtenerNombreRelacionFacturacion = (fila) => {
    if (!fila?.grupoFacturacion) return "";

    const relacionadas = filas.filter(
      (f) => f.uid !== fila.uid && f.grupoFacturacion === fila.grupoFacturacion
    );

    if (relacionadas.length === 0) return "";

    return relacionadas.map((r) => r.paciente || "Sin nombre").join(" + ");
  };

  const agruparDetallePorGrupo = (detalleBase, metodosReporteParam = []) => {
    const grupos = {};
    const metodosParaAgrupar =
      Array.isArray(metodosReporteParam) && metodosReporteParam.length > 0
        ? metodosReporteParam
        : metodos;

    detalleBase.forEach((item, index) => {
      const empresaKey = String(item.empresa_id || "");
      const fechaKey = String(item.fecha || "");
      const grupoKey = String(item.grupoFacturacion || "");

      // IMPORTANTE:
      // Antes se agrupaba solo por fecha + grupo. En reportes combinados o intervalos
      // eso puede mezclar empresas o días. Ahora separamos por empresa + fecha.
      const key = grupoKey
        ? `${empresaKey}__${fechaKey}__grupo__${grupoKey}`
        : `${empresaKey}__${fechaKey}__solo__${index}`;

      if (!grupos[key]) {
        const metodosIniciales = {};
        const refsIniciales = {};

        metodosParaAgrupar.forEach((m) => {
          metodosIniciales[m.nombre] = 0;
          refsIniciales[m.nombre] = "";
        });

        grupos[key] = {
          fecha: item.fecha,
          empresa: [],
          paciente: [],
          origen: [],
          metodos: metodosIniciales,
          referencias: refsIniciales,
          grupoFacturacion: item.grupoFacturacion || "",
          empresa_id: item.empresa_id || "",
          venta_id: item.venta_id || "",
        };
      }

      if (item.empresa && !grupos[key].empresa.includes(item.empresa)) {
        grupos[key].empresa.push(item.empresa);
      }

      if (item.paciente && !grupos[key].paciente.includes(item.paciente)) {
        grupos[key].paciente.push(item.paciente);
      }

      if (item.origen && !grupos[key].origen.includes(item.origen)) {
        grupos[key].origen.push(item.origen);
      }

      metodosParaAgrupar.forEach((m) => {
        grupos[key].metodos[m.nombre] =
          Number(grupos[key].metodos[m.nombre] || 0) +
          Number(item.metodos?.[m.nombre] || 0);

        const ref = item.referencias?.[m.nombre] || "";

        if (ref) {
          const refs = grupos[key].referencias[m.nombre]
            ? grupos[key].referencias[m.nombre]
                .split(" | ")
                .map((x) => x.trim())
                .filter(Boolean)
            : [];

          ref
            .split(" | ")
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((r) => {
              if (!refs.includes(r)) refs.push(r);
            });

          grupos[key].referencias[m.nombre] = refs.join(" | ");
        }
      });
    });

    return Object.values(grupos).map((g) => ({
      fecha: g.fecha,
      empresa: g.empresa.join(" + "),
      paciente: g.paciente.join(" + "),
      origen:
        g.origen.length > 1
          ? "Mixto"
          : g.origen[0] === "venta"
          ? "Venta / CxC"
          : "Manual",
      metodos: g.metodos,
      referencias: g.referencias,
      grupoFacturacion: g.grupoFacturacion,
      empresa_id: g.empresa_id,
      venta_id: g.venta_id,
    }));
  };

  const guardarCaja = async (opciones = {}) => {
    const silencioso = Boolean(opciones?.silencioso);
    const empresaGuardado = opciones?.empresaOverride || empresa;
    const fechaCaja = opciones?.fechaOverride || fechaLocal;
    const filasTrabajo = Array.isArray(opciones?.filasOverride) ? opciones.filasOverride : filas;

    if (!validarEdicionUnaEmpresa()) return false;

    if (!empresaGuardado?.id || !fechaCaja) {
      return silencioso ? false : alert("No hay empresa o fecha seleccionada");
    }

    const empresaPermitida = empresasDisponibles.some(
      (emp) => String(emp.id) === String(empresaGuardado.id)
    );

    if (!empresaPermitida) {
      console.error("Intento de guardar caja en empresa no permitida:", empresaGuardado);
      return silencioso ? false : alert("Esta empresa no pertenece al usuario actual. Recargá la página.");
    }

    const validacionUsuario = await validarEmpresaUsuarioActual(empresaGuardado.id);

    if (!validacionUsuario.ok) {
      console.error("Validación empresa_usuario falló:", validacionUsuario);
      return silencioso ? false : alert(validacionUsuario.mensaje);
    }

    const userGuardado = validacionUsuario.user;
    const empresaUsuarioGuardado = validacionUsuario.empresaUsuario;

    const filasValidas = filasTrabajo.filter(
      (fila) =>
        String(fila.paciente || "").trim() !== "" &&
        String(fila.empresaId || empresaGuardado.id) === String(empresaGuardado.id)
    );
    const filasManual = filasValidas.filter((fila) => !fila.venta_id);
    const filasVenta = filasValidas.filter((fila) => fila.venta_id);

    if (!silencioso) setLoading(true);

    let cajaId = null;

    const { data: cajaExistente, error: errorBuscarCaja } = await supabase
      .from("cajas_diarias")
      .select("*")
      .eq("empresa_id", empresaGuardado.id)
      .eq("fecha_local", fechaCaja)
      .maybeSingle();

    if (errorBuscarCaja) {
      if (!silencioso) setLoading(false);
      console.error(errorBuscarCaja);
      if (!silencioso) alert("Error al buscar la caja");
      return false;
    }

    const payloadCaja = {
      empresa_id: empresaGuardado.id,
      cierre_realizado: cierreRealizado,
      remesa_efectivo: remesaEfectivo,
      cuenta_destino_efectivo: cuentaDestinoEfectivo || null,
      numero_remesa_efectivo: numeroRemesaEfectivo || null,
      comentario_cierre: comentarioCierre || null,
      fecha_cierre: cierreRealizado ? obtenerFechaHoraSVISO() : null,
      responsable_caja: responsableCaja || null,
      elaborado_por: elaboradoPor || null,
      revisado_por: revisadoPor || null,
      actualizado_por_user_id: userGuardado.id,
      actualizado_por_empresa_usuario_id: empresaUsuarioGuardado.id,
    };

    if (cajaExistente) {
      cajaId = cajaExistente.id;

      const { error: errorActualizarCaja } = await supabase
        .from("cajas_diarias")
        .update(payloadCaja)
        .eq("id", cajaId);

      if (errorActualizarCaja) {
        if (!silencioso) setLoading(false);
        console.error(errorActualizarCaja);
        if (!silencioso) alert("Error al actualizar la caja");
        return false;
      }

      const { error: errorEliminarDetalleManual } = await supabase
        .from("caja_diaria_detalle")
        .delete()
        .eq("caja_diaria_id", cajaId)
        .is("venta_id", null);

      if (errorEliminarDetalleManual) {
        if (!silencioso) setLoading(false);
        console.error(errorEliminarDetalleManual);
        if (!silencioso) alert("Error al reemplazar el detalle manual");
        return false;
      }
    } else {
      const { data: nuevaCaja, error: errorCrearCaja } = await supabase
        .from("cajas_diarias")
        .insert([
          {
            fecha: obtenerFechaHoraSVISO(),
            fecha_local: fechaCaja,
            ...payloadCaja,
          },
        ])
        .select()
        .single();

      if (errorCrearCaja) {
        if (!silencioso) setLoading(false);
        console.error(errorCrearCaja);
        if (!silencioso) alert("Error al crear la caja");
        return false;
      }

      cajaId = nuevaCaja.id;
    }

    const { error: errorResetGrupo } = await supabase
      .from("caja_diaria_detalle")
      .update({ grupo_facturacion: null })
      .eq("caja_diaria_id", cajaId);

    if (errorResetGrupo) {
      if (!silencioso) setLoading(false);
      console.error(errorResetGrupo);
      if (!silencioso) alert("Error al actualizar agrupaciones de facturación");
      return false;
    }

    const detalleParaGuardar = [];

    filasManual.forEach((fila) => {
      metodos.forEach((metodo) => {
        const valor = fila.pagos[metodo.id];
        const referencia = fila.referencias[metodo.id];

        if (
          valor !== "" &&
          valor !== null &&
          valor !== undefined &&
          Number(valor) !== 0
        ) {
          const metodoRealId =
            (metodo.empresasOrigen || []).some((empId) => String(empId) === String(empresaGuardado.id))
              ? metodo.metodoIds[(metodo.empresasOrigen || []).findIndex((empId) => String(empId) === String(empresaGuardado.id))]
              : metodo.id;

          detalleParaGuardar.push({
            caja_diaria_id: cajaId,
            paciente: fila.paciente.trim(),
            metodo_pago_id: metodoRealId,
            monto: Number(valor),
            referencia: referencia?.trim() || null,
            venta_id: null,
            grupo_facturacion: fila.grupoFacturacion || null,
            creado_por_user_id: userGuardado.id,
            creado_por_empresa_usuario_id: empresaUsuarioGuardado.id,
          });
        }
      });
    });

    if (detalleParaGuardar.length > 0) {
      const { error: errorInsertarDetalle } = await supabase
        .from("caja_diaria_detalle")
        .insert(detalleParaGuardar);

      if (errorInsertarDetalle) {
        if (!silencioso) setLoading(false);
        console.error(errorInsertarDetalle);
        if (!silencioso) alert("Error al guardar el detalle");
        return false;
      }
    }

    for (const fila of filasVenta) {
      const { error: errorUpdateVentaGrupo } = await supabase
        .from("caja_diaria_detalle")
        .update({
          grupo_facturacion: fila.grupoFacturacion || null,
          actualizado_por_user_id: userGuardado.id,
          actualizado_por_empresa_usuario_id: empresaUsuarioGuardado.id,
        })
        .eq("caja_diaria_id", cajaId)
        .eq("venta_id", fila.venta_id)
        .eq("paciente", fila.paciente.trim());

      if (errorUpdateVentaGrupo) {
        if (!silencioso) setLoading(false);
        console.error(errorUpdateVentaGrupo);
        if (!silencioso) alert("Error al guardar agrupación de una venta");
        return false;
      }
    }

    if (!silencioso) setLoading(false);
    if (!silencioso) {
      alert("Caja diaria guardada correctamente");
      await cargarCajaDelDia(fechaLocal);
    }

    await cargarHistorialCajas();
    return true;
  };

  const obtenerDatosReporteDesdeTablaWeb = () => {
    const metodosReporte = (metodos || []).map((m) => ({
      id: m.id,
      nombre: m.nombre,
    }));

    const detalle = (filas || [])
      .filter((fila) => String(fila.paciente || "").trim() !== "")
      .map((fila) => {
        const metodosFila = {};
        const referenciasFila = {};

        metodosReporte.forEach((m) => {
          metodosFila[m.nombre] = Number(fila.pagos?.[m.id] || 0);
          referenciasFila[m.nombre] = fila.referencias?.[m.id] || "";
        });

        return {
          fecha: fechaLocal,
          empresa: fila.empresaNombre || obtenerNombreEmpresa(fila.empresaId),
          empresa_id: fila.empresaId || empresa?.id,
          paciente: fila.paciente || "Sin nombre",
          origen: fila.origen === "venta" || fila.venta_id ? "Venta / CxC" : "Manual",
          venta_id: fila.venta_id || null,
          grupoFacturacion: fila.grupoFacturacion || "",
          metodos: metodosFila,
          referencias: referenciasFila,
          clasificaciones: obtenerTextoClasificacionesParaReporte(fila),
        };
      });

    const resumen = metodosReporte.map((m) => ({
      metodo: m.nombre,
      total: (filas || []).reduce(
        (acc, fila) => acc + Number(fila.pagos?.[m.id] || 0),
        0
      ),
    }));

    const totalGeneralResumen = resumen.reduce(
      (acc, item) => acc + Number(item.total || 0),
      0
    );

    return {
      detalle,
      resumen,
      cierres: [],
      metodosReporte,
      totalGeneralResumen,
      fuente: "tabla_web",
    };
  };

  const obtenerDatosReporte = async () => {
    if (empresaIdsReporte.length === 0) {
      alert("Seleccioná al menos una empresa para el reporte");
      return null;
    }

    if (!filtroDesde || !filtroHasta) {
      alert("Seleccioná desde y hasta");
      return null;
    }

    if (filtroDesde > filtroHasta) {
      alert("La fecha desde no puede ser mayor que la fecha hasta");
      return null;
    }

    const [{ data, error }, { data: metodosDB, error: errorMetodos }] =
      await Promise.all([
        supabase
          .from("cajas_diarias")
          .select(`
            id,
            empresa_id,
            fecha_local,
            cierre_realizado,
            remesa_efectivo,
            cuenta_destino_efectivo,
            numero_remesa_efectivo,
            comentario_cierre,
            responsable_caja,
            elaborado_por,
            revisado_por,
            caja_diaria_detalle (
              id,
              paciente,
              monto,
              referencia,
              metodo_pago_id,
              venta_id,
              grupo_facturacion,
              metodos_pago (
                id,
                nombre,
                empresa_id
              )
            )
          `)
          .in("empresa_id", empresaIdsReporte)
          .gte("fecha_local", filtroDesde)
          .lte("fecha_local", filtroHasta)
          .order("fecha_local", { ascending: true }),
        supabase
          .from("metodos_pago")
          .select("id, empresa_id, nombre, orden, activo")
          .in("empresa_id", empresaIdsReporte)
          .order("orden", { ascending: true }),
      ]);

    if (error) {
      console.error(error);
      alert("Error al obtener datos del reporte");
      return null;
    }

    if (errorMetodos) {
      console.error(errorMetodos);
      alert("Error al cargar métodos para el reporte");
      return null;
    }

    const normalizarNombreMetodo = (nombre = "") => {
      return String(nombre || "Sin método")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .replace(/davivien.*/g, "davivienda")
        .replace(/hipotec.*/g, "hipotecario")
        .replace(/transfer.*/g, "transferencia")
        .replace(/transf.*/g, "transferencia")
        .replace(/efect.*/g, "efectivo")
        .replace(/reserv.*/g, "reserva")
        .replace(/cheq.*/g, "cheque")
        .replace(/pos\s+/g, "pos ")
        .trim();
    };

    const etiquetaMetodo = (nombre = "") => {
      const key = normalizarNombreMetodo(nombre);

      if (key.includes("reserva")) return "RESERVA";
      if (key.includes("efectivo")) return "EFECTIVO";
      if (key.includes("transferencia")) return "Transferencia";
      if (key.includes("cheque")) return "CHEQUE";
      if (key.includes("davivienda")) return "POS DAVIVIENDA";
      if (key.includes("bac")) return "Pos BAC";
      if (key.includes("hipotecario")) return "POS Hipotecario";

      return String(nombre || "Sin método").trim() || "Sin método";
    };

    const prioridadMetodo = (nombre = "") => {
      const key = normalizarNombreMetodo(nombre);
      if (key.includes("reserva")) return 1;
      if (key.includes("efectivo")) return 2;
      if (key.includes("transferencia")) return 3;
      if (key.includes("cheque")) return 4;
      if (key.includes("davivienda")) return 5;
      if (key.includes("bac")) return 6;
      if (key.includes("hipotecario")) return 7;
      return 99;
    };

    const columnasMap = new Map();
    const metodoRealAColumna = {};

    (metodosDB || []).forEach((m) => {
      const label = etiquetaMetodo(m.nombre);
      const key = normalizarNombreMetodo(label);

      if (!columnasMap.has(key)) {
        columnasMap.set(key, {
          id: key,
          nombre: label,
          metodoIds: [],
          orden: prioridadMetodo(label),
        });
      }

      columnasMap.get(key).metodoIds.push(Number(m.id));
      metodoRealAColumna[String(m.id)] = columnasMap.get(key).nombre;
    });

    // Si hay detalles con métodos borrados/inactivos que no vinieron en metodos_pago,
    // también los agregamos para no perder dinero.
    (data || []).forEach((caja) => {
      (caja.caja_diaria_detalle || []).forEach((d) => {
        const realId = String(d.metodo_pago_id || "");
        if (metodoRealAColumna[realId]) return;

        const nombre = d.metodos_pago?.nombre || "Sin método";
        const label = etiquetaMetodo(nombre);
        const key = normalizarNombreMetodo(label);

        if (!columnasMap.has(key)) {
          columnasMap.set(key, {
            id: key,
            nombre: label,
            metodoIds: [],
            orden: prioridadMetodo(label),
          });
        }

        columnasMap.get(key).metodoIds.push(Number(d.metodo_pago_id));
        metodoRealAColumna[realId] = columnasMap.get(key).nombre;
      });
    });

    const metodosReporte = Array.from(columnasMap.values())
      .sort((a, b) => {
        if (Number(a.orden || 99) !== Number(b.orden || 99)) {
          return Number(a.orden || 99) - Number(b.orden || 99);
        }
        return String(a.nombre).localeCompare(String(b.nombre));
      })
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        metodoIds: Array.from(new Set(m.metodoIds || [])),
      }));

    const inicializarMetodosReporte = () => {
      const valores = {};
      const refs = {};

      metodosReporte.forEach((m) => {
        valores[m.nombre] = 0;
        refs[m.nombre] = "";
      });

      return { valores, refs };
    };

    const detalleBase = [];
    const cierres = [];
    let totalGeneralReal = 0;

    (data || []).forEach((caja) => {
      const mapaPacientes = {};

      (caja.caja_diaria_detalle || []).forEach((d) => {
        const paciente = d.paciente || "Sin nombre";
        const metodoNombre =
          metodoRealAColumna[String(d.metodo_pago_id)] ||
          etiquetaMetodo(d.metodos_pago?.nombre || "Sin método");
        const monto = Number(d.monto || 0);
        const referencia = d.referencia || "";
        const origen = d.venta_id ? "Venta / CxC" : "Manual";
        const grupoFacturacion = d.grupo_facturacion || "";

        totalGeneralReal += monto;

        const llave = d.venta_id
          ? `${caja.empresa_id}__${caja.fecha_local}__${paciente}__venta__${d.venta_id}__${grupoFacturacion || "sin_grupo"}`
          : `${caja.empresa_id}__${caja.fecha_local}__${paciente}__manual__${grupoFacturacion || d.id}`;

        if (!mapaPacientes[llave]) {
          const inicial = inicializarMetodosReporte();

          mapaPacientes[llave] = {
            fecha: caja.fecha_local,
            empresa: obtenerNombreEmpresa(caja.empresa_id),
            empresa_id: caja.empresa_id,
            paciente,
            origen,
            venta_id: d.venta_id || null,
            grupoFacturacion,
            metodos: inicial.valores,
            referencias: inicial.refs,
          };
        }

        mapaPacientes[llave].metodos[metodoNombre] =
          Number(mapaPacientes[llave].metodos[metodoNombre] || 0) + monto;

        if (referencia) {
          const actual = mapaPacientes[llave].referencias[metodoNombre] || "";
          const refs = actual
            ? actual.split(" | ").map((x) => x.trim()).filter(Boolean)
            : [];

          if (!refs.includes(referencia)) refs.push(referencia);

          mapaPacientes[llave].referencias[metodoNombre] = refs.join(" | ");
        }
      });

      const totalCaja = (caja.caja_diaria_detalle || []).reduce(
        (acc, d) => acc + Number(d.monto || 0),
        0
      );

      cierres.push({
        fecha: caja.fecha_local,
        empresa: obtenerNombreEmpresa(caja.empresa_id),
        responsableCaja: caja.responsable_caja || "",
        elaboradoPor: caja.elaborado_por || "",
        revisadoPor: caja.revisado_por || "",
        remesaEfectivo: Boolean(caja.remesa_efectivo),
        cuentaDestinoEfectivo: caja.cuenta_destino_efectivo || "",
        numeroRemesaEfectivo: caja.numero_remesa_efectivo || "",
        comentarioCierre: caja.comentario_cierre || "",
        totalCaja,
      });

      detalleBase.push(...Object.values(mapaPacientes));
    });

    const detalleAgrupado = agruparDetallePorGrupo(detalleBase, metodosReporte).map((item) => {
      const inicial = inicializarMetodosReporte();

      return {
        ...item,
        metodos: { ...inicial.valores, ...(item.metodos || {}) },
        referencias: { ...inicial.refs, ...(item.referencias || {}) },
        clasificaciones: obtenerTextoClasificacionesParaReporte(item),
      };
    });

    const resumen = {};
    metodosReporte.forEach((m) => {
      resumen[m.nombre] = 0;
    });

    detalleAgrupado.forEach((item) => {
      metodosReporte.forEach((m) => {
        resumen[m.nombre] += Number(item.metodos[m.nombre] || 0);
      });
    });

    const resumenArray = metodosReporte.map((m) => ({
      metodo: m.nombre,
      total: Number(resumen[m.nombre] || 0),
    }));

    const totalDesdeResumen = resumenArray.reduce(
      (acc, item) => acc + Number(item.total || 0),
      0
    );

    return {
      detalle: detalleAgrupado,
      resumen: resumenArray,
      cierres,
      metodosReporte,
      totalGeneralResumen: Number(totalDesdeResumen || totalGeneralReal || 0),
    };
  };

  const exportarDetalleExcel = async () => {
    const datos = await obtenerDatosReporte();

    if (!datos || datos.detalle.length === 0) {
      return alert("No hay datos para exportar");
    }

    const metodosReporte = datos.metodosReporte || metodos;

    const rows = [
      { Fecha: "", Paciente: nombreEmpresasReporte },
      {
        Fecha: "",
        Paciente: `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(
          filtroHasta
        )}`,
      },
      {},
    ];

    datos.detalle.forEach((item) => {
      const fila = {
        Fecha: formatearFecha(item.fecha),
        Empresa: item.empresa || "",
        Paciente: item.paciente,
        Origen: item.origen || "",
      };

      metodosReporte.forEach((m) => {
        fila[m.nombre] = formatearMonto(item.metodos[m.nombre] || 0);
      });

      fila["Referencias"] = metodosReporte
        .map((m) =>
          item.referencias[m.nombre]
            ? `${m.nombre}: ${item.referencias[m.nombre]}`
            : ""
        )
        .filter(Boolean)
        .join(" | ");

      fila["Total Paciente"] = formatearMonto(
        metodosReporte.reduce((acc, m) => acc + Number(item.metodos[m.nombre] || 0), 0)
      );

      rows.push(fila);
    });

    const filaTotales = {
      Fecha: "",
      Empresa: "",
      Paciente: "TOTALES",
      Origen: "",
    };

    metodosReporte.forEach((m) => {
      filaTotales[m.nombre] = formatearMonto(
        datos.resumen.find((r) => r.metodo === m.nombre)?.total || 0
      );
    });

    filaTotales["Referencias"] = "";
    filaTotales["Total Paciente"] = formatearMonto(datos.totalGeneralResumen);

    rows.push(filaTotales);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Detalle Caja");

    XLSX.writeFile(
      wb,
      `Caja_Detalle_${empresa?.nombre || "Empresa"}_${filtroDesde}_a_${filtroHasta}.xlsx`
    );
  };

  const exportarResumenExcel = async () => {
    const datos = await obtenerDatosReporte();

    if (!datos || datos.resumen.length === 0) {
      return alert("No hay datos para exportar");
    }

    const rows = [
      { "Método de Pago": nombreEmpresasReporte, Total: "" },
      {
        "Método de Pago": `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(
          filtroHasta
        )}`,
        Total: "",
      },
      { "Método de Pago": "", Total: "" },
      ...datos.resumen.map((item) => ({
        "Método de Pago": item.metodo,
        Total: formatearMonto(item.total),
      })),
      {
        "Método de Pago": "TOTAL GENERAL",
        Total: formatearMonto(datos.totalGeneralResumen),
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Resumen Caja");

    XLSX.writeFile(
      wb,
      `Caja_Resumen_${empresa?.nombre || "Empresa"}_${filtroDesde}_a_${filtroHasta}.xlsx`
    );
  };

  const exportarDetallePDF = async () => {
    const datos = await obtenerDatosReporte();

    if (!datos || datos.detalle.length === 0) {
      return alert("No hay datos para exportar");
    }

    const abreviarMetodoPDF = (nombre = "") => {
      return String(nombre || "")
        .replace(/TRANSFERENCIA/gi, "TRANSF.")
        .replace(/DAVIVIENDA/gi, "DAVIV.")
        .replace(/HIPOTECARIO/gi, "HIPOT.")
        .replace(/RESERVA/gi, "RES.")
        .replace(/EFECTIVO/gi, "EFECT.")
        .replace(/CHEQUE/gi, "CHEQ.");
    };

    const abreviarTextoPDF = (texto, max = 18) => {
      const limpio = String(texto || "").trim();
      if (limpio.length <= max) return limpio;
      return `${limpio.slice(0, max - 1)}…`;
    };

    // IMPORTANTE:
    // El PDF usa EXACTAMENTE los mismos métodos del resumen del reporte.
    // Así los totales de columnas cuadran con la tabla web.
    const metodosReporte = (datos.resumen || [])
      .filter((r) => Number(r.total || 0) !== 0)
      .map((r) => ({
        nombre: r.metodo,
        label: abreviarMetodoPDF(r.metodo),
        total: Number(r.total || 0),
      }));

    if (metodosReporte.length === 0) {
      return alert("No hay métodos de pago con movimiento para exportar");
    }

    const totalGeneralPDF = metodosReporte.reduce(
      (acc, m) => acc + Number(m.total || 0),
      0
    );

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "letter",
    });

    doc.setFillColor(244, 240, 247);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 28, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(87, 72, 102);
    doc.text("INFORME DETALLADO DE CAJA DIARIA", 8, 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Empresa(s): ${nombreEmpresasReporte}`, 8, 22);
    doc.text(
      `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(filtroHasta)}`,
      160,
      22
    );

    const head = [[
      "Clasif.",
      "Fecha",
      "Empresa",
      "Paciente",
      "Origen",
      ...metodosReporte.map((m) => m.label || m.nombre),
      "Ref.",
      "Total",
    ]];

    const body = datos.detalle.map((item) => {
      const montosMetodo = metodosReporte.map((m) =>
        `$${formatearMonto(Number(item.metodos?.[m.nombre] || 0))}`
      );

      const totalPaciente = metodosReporte.reduce(
        (acc, m) => acc + Number(item.metodos?.[m.nombre] || 0),
        0
      );

      const referenciasTexto = metodosReporte
        .map((m) =>
          item.referencias?.[m.nombre]
            ? `${m.label || m.nombre}: ${item.referencias[m.nombre]}`
            : ""
        )
        .filter(Boolean)
        .join(" | ");

      return [
        abreviarTextoPDF(item.clasificaciones || "", 11),
        formatearFecha(item.fecha),
        abreviarTextoPDF(item.empresa || "", 14),
        abreviarTextoPDF(item.paciente || "", 19),
        abreviarTextoPDF(item.origen || "", 7),
        ...montosMetodo,
        abreviarTextoPDF(referenciasTexto, 18),
        `$${formatearMonto(totalPaciente)}`,
      ];
    });

    const foot = [[
      "",
      "",
      "",
      "TOTALES",
      "",
      ...metodosReporte.map((m) => `$${formatearMonto(m.total || 0)}`),
      "",
      `$${formatearMonto(totalGeneralPDF)}`,
    ]];

    const cantidadMetodos = metodosReporte.length;
    const anchoDisponible = doc.internal.pageSize.getWidth() - 8 - 8;
    const anchoFijo = 16 + 16 + 22 + 28 + 12 + 18 + 18;
    const anchoMetodo = Math.max(
      14,
      Math.min(35, (anchoDisponible - anchoFijo) / cantidadMetodos)
    );

    const columnStyles = {
      0: { cellWidth: 16 },
      1: { cellWidth: 16 },
      2: { cellWidth: 22 },
      3: { cellWidth: 28 },
      4: { cellWidth: 12 },
      [5 + cantidadMetodos]: { cellWidth: 18 },
      [6 + cantidadMetodos]: { cellWidth: 18, halign: "right" },
    };

    metodosReporte.forEach((_, index) => {
      columnStyles[5 + index] = {
        cellWidth: anchoMetodo,
        halign: "right",
      };
    });

    autoTable(doc, {
      startY: 32,
      head,
      body,
      foot,
      margin: { left: 4, right: 4 },
      tableWidth: "auto",
      styles: {
        fontSize: cantidadMetodos > 8 ? 4.8 : 5.8,
        cellPadding: 1,
        textColor: [31, 41, 55],
        overflow: "linebreak",
        minCellHeight: 4.5,
      },
      headStyles: {
        fillColor: [107, 90, 122],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        valign: "middle",
      },
      footStyles: {
        fillColor: [244, 240, 247],
        textColor: [87, 72, 102],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252],
      },
      bodyStyles: {
        lineColor: [226, 232, 240],
      },
      columnStyles,
      didParseCell: (data) => {
        if (data.section === "foot") {
          data.cell.styles.fontStyle = "bold";
        }

        if (data.column.index >= 5 && data.column.index < 5 + cantidadMetodos) {
          data.cell.styles.halign = "right";
        }
      },
    });

    doc.save(
      `Caja_Detalle_${empresa?.nombre || "Empresa"}_${filtroDesde}_a_${filtroHasta}.pdf`
    );
  };

  const exportarResumenPDF = async () => {
    const datos = await obtenerDatosReporte();

    if (!datos || datos.resumen.length === 0) {
      return alert("No hay datos para exportar");
    }

    const doc = new jsPDF();

    doc.setFillColor(244, 240, 247);
    doc.rect(0, 0, 210, 28, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(87, 72, 102);
    doc.text("INFORME RESUMEN DE CAJA DIARIA", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Empresa(s): ${nombreEmpresasReporte}`, 14, 24);
    doc.text(
      `Período: ${formatearFecha(filtroDesde)} al ${formatearFecha(filtroHasta)}`,
      110,
      24
    );

    autoTable(doc, {
      startY: 34,
      head: [["Método de Pago", "Total"]],
      body: datos.resumen.map((item) => [
        item.metodo,
        `$${formatearMonto(item.total)}`,
      ]),
      foot: [["TOTAL GENERAL", `$${formatearMonto(datos.totalGeneralResumen)}`]],
      styles: {
        fontSize: 10,
        cellPadding: 4,
        textColor: [31, 41, 55],
      },
      headStyles: {
        fillColor: [107, 90, 122],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [244, 240, 247],
        textColor: [87, 72, 102],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252],
      },
    });

    doc.save(
      `Caja_Resumen_${empresa?.nombre || "Empresa"}_${filtroDesde}_a_${filtroHasta}.pdf`
    );
  };

  const exportarInformeProfesionalPDF = async () => {
    const datos = await obtenerDatosReporte();
    if (!datos || datos.resumen.length === 0) {
      return alert("No hay datos para exportar");
    }

    const doc = new jsPDF("p", "mm", "a4");
    const cajaActual =
      datos.cierres.find((c) => c.fecha === fechaLocal) || {
        fecha: fechaLocal,
        responsableCaja,
        elaboradoPor,
        revisadoPor,
        remesaEfectivo,
        cuentaDestinoEfectivo,
        numeroRemesaEfectivo,
        comentarioCierre,
        totalCaja: totalGeneral,
      };

    doc.setFillColor(244, 240, 247);
    doc.rect(0, 0, 210, 30, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(87, 72, 102);
    doc.text("INFORME DE CIERRE DE CAJA DIARIA", 105, 14, { align: "center" });

    doc.setFontSize(12);
    doc.text(nombreEmpresasReporte || "EMPRESA ACTIVA", 105, 22, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Fecha de caja: ${formatearFecha(cajaActual.fecha)}`, 14, 38);
    doc.text(`Responsable de caja: ${cajaActual.responsableCaja || "-"}`, 14, 44);

    autoTable(doc, {
      startY: 50,
      head: [["Resumen por método de pago", "Monto"]],
      body: datos.resumen.map((item) => [
        item.metodo,
        `$${formatearMonto(item.total)}`,
      ]),
      foot: [["TOTAL GENERAL DEL EFECTIVO", `$${formatearMonto(datos.totalGeneralResumen)}`]],
      theme: "grid",
      styles: {
        fontSize: 10,
        cellPadding: 4,
        textColor: [31, 41, 55],
      },
      headStyles: {
        fillColor: [107, 90, 122],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [244, 240, 247],
        textColor: [87, 72, 102],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252],
      },
    });

    const yInfo = doc.lastAutoTable.finalY + 8;

    const remesaTexto = cajaActual.remesaEfectivo ? "Sí" : "No";
    const remesaDetalle = cajaActual.remesaEfectivo
      ? `Cuenta destino: ${cajaActual.cuentaDestinoEfectivo || "-"} | No. remesa: ${cajaActual.numeroRemesaEfectivo || "-"}`
      : "No aplica";

    autoTable(doc, {
      startY: yInfo,
      body: [
        ["Habrá remesa a depositar", remesaTexto],
        ["Detalle de remesa", remesaDetalle],
        ["Comentario de cierre", cajaActual.comentarioCierre || "-"],
      ],
      theme: "grid",
      styles: {
        fontSize: 9,
        cellPadding: 4,
        textColor: [31, 41, 55],
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 60 },
        1: { cellWidth: 120 },
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252],
      },
    });

    let yFirmas = doc.lastAutoTable.finalY + 28;
    if (yFirmas > 250) {
      doc.addPage();
      yFirmas = 40;
    }

    doc.setDrawColor(156, 163, 175);
    doc.line(25, yFirmas, 85, yFirmas);
    doc.line(125, yFirmas, 185, yFirmas);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);

    doc.text(cajaActual.elaboradoPor || "", 55, yFirmas + 6, { align: "center" });
    doc.text("Elaboró", 55, yFirmas + 12, { align: "center" });

    doc.text(cajaActual.revisadoPor || "", 155, yFirmas + 6, { align: "center" });
    doc.text("Revisó", 155, yFirmas + 12, { align: "center" });

    doc.save(
      `Caja_Profesional_${empresa?.nombre || "Empresa"}_${cajaActual.fecha}.pdf`
    );

    return true;
  };

  const totalesPorMetodo = useMemo(() => {
    const totales = {};

    metodos.forEach((m) => {
      totales[m.id] = 0;
    });

    filas.forEach((fila) => {
      metodos.forEach((m) => {
        const valor = Number(fila.pagos[m.id] || 0);
        totales[m.id] += valor;
      });
    });

    return totales;
  }, [filas, metodos]);

  const totalGeneral = useMemo(() => {
    return Object.values(totalesPorMetodo).reduce(
      (acum, valor) => acum + Number(valor || 0),
      0
    );
  }, [totalesPorMetodo]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Caja Diaria</h1>
            <p style={styles.subtitle}>Registro del día, cierre e informes</p>
            <p style={styles.companyPill}>
              Empresa activa: <strong>{empresa?.nombre || "No seleccionada"}</strong>
            </p>
            <p style={styles.companyPill}>
              Reportes: <strong>{nombreEmpresasReporte}</strong>
            </p>
          </div>

          <div style={styles.totalBadge}>
            <span style={styles.totalBadgeLabel}>Total del día</span>
            <strong style={styles.totalBadgeValue}>${totalGeneral.toFixed(2)}</strong>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Control del día</h3>
            <p style={styles.sectionSubtitle}>
              Seleccioná la fecha y administrá los registros manuales.
            </p>
          </div>

          <div style={styles.topGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Fecha</label>
              <input
                type="date"
                value={fechaLocal}
                onChange={(e) => setFechaLocal(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Empresa activa para operar</label>
              <select
                value={empresa?.id || ""}
                onChange={(e) => cambiarEmpresaActiva(e.target.value)}
                style={styles.input}
              >
                {empresasDisponibles.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formGroupWide}>
              <div style={styles.empresaSelectorHeader}>
                <div>
                  <label style={styles.label}>Empresas para reportes combinados</label>
                  <p style={styles.selectorHelp}>Seleccioná una o varias empresas para historial e informes.</p>
                </div>

                <div style={styles.empresaDropdownActions}>
                  <button type="button" style={styles.miniBtn} onClick={seleccionarSoloEmpresaActiva}>
                    Solo activa
                  </button>

                  <button type="button" style={styles.miniBtn} onClick={seleccionarTodasEmpresasReporte}>
                    Todas
                  </button>
                </div>
              </div>

              {modoSoloLecturaMultiempresa && (
                <div style={styles.readOnlyMiniNote}>
                  Modo combinado: solo lectura.
                </div>
              )}

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
                    {empresasDisponibles.map((emp) => {
                      const checked = empresaIdsReporte.some((id) => String(id) === String(emp.id));

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
                            onChange={() => alternarEmpresaReporte(emp.id)}
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

          <div style={styles.actionGridSimple}>
            <button
              type="button"
              onClick={agregarFila}
              style={{
                ...styles.primarySoftBtn,
                ...(modoSoloLecturaMultiempresa ? styles.disabledBtn : {}),
              }}
              disabled={modoSoloLecturaMultiempresa}
              title={modoSoloLecturaMultiempresa ? "Seleccioná solo una empresa para agregar registros" : ""}
            >
              + Manual
            </button>

            <button
              type="button"
              onClick={limpiarCajaActual}
              style={{
                ...styles.clearBtn,
                ...(modoSoloLecturaMultiempresa ? styles.disabledBtn : {}),
              }}
              disabled={modoSoloLecturaMultiempresa}
              title={modoSoloLecturaMultiempresa ? "Seleccioná solo una empresa para limpiar o modificar" : ""}
            >
              Limpiar formulario
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Detalle de caja</h3>
            <p style={styles.sectionSubtitle}>
              Registrá cobros, referencias y agrupaciones para facturación.
            </p>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={{ ...styles.th, minWidth: 155 }}>Paciente</th>
                  <th style={{ ...styles.th, minWidth: 230 }}>Origen</th>
                  {metodos.map((metodo) => (
                    <th key={metodo.id} style={{ ...styles.th, minWidth: 145 }}>
                      {metodo.nombre}
                    </th>
                  ))}
                  <th style={{ ...styles.th, minWidth: 130 }}>Acción</th>
                </tr>
              </thead>

              <tbody>
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={metodos.length + 3} style={styles.emptyTd}>
                      No hay registros para esta fecha
                    </td>
                  </tr>
                )}

                {filas.map((fila, index) => (
                  <tr key={fila.uid || index}>
                    <td style={styles.tdTop}>
                      <div style={styles.patientCellCompact}>
                        <input
                          type="text"
                          value={fila.paciente}
                          onChange={(e) => actualizarPaciente(index, e.target.value)}
                          placeholder="Nombre del paciente"
                          style={styles.input}
                          disabled={
                            modoSoloLecturaMultiempresa ||
                            fila.origen === "venta" ||
                            String(fila.empresaId || empresa?.id) !== String(empresa?.id)
                          }
                        />

                        <div style={styles.clasificacionChipsCompact}>
                          {obtenerClasificacionesFila(fila).length === 0 ? (
                            <span style={styles.clasificacionEmpty}>Sin clasificación</span>
                          ) : (
                            obtenerClasificacionesFila(fila).map((asig) => (
                              <span key={asig.id} style={styles.clasificacionChip}>
                                {asig.clasificaciones_pacientes?.nombre || "Clasificación"}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </td>

                    <td style={styles.tdCenter}>
                      <div style={styles.originInlineWrap}>
                        <span style={styles.empresaChipCompact}>
                          {fila.empresaNombre || obtenerNombreEmpresa(fila.empresaId || empresa?.id)}
                        </span>

                        <span style={fila.origen === "venta" ? styles.ventaChipCompact : styles.manualChipCompact}>
                          {fila.origen === "venta" ? "Venta / CxC" : "Manual"}
                        </span>
                      </div>
                    </td>

                    {metodos.map((metodo) => (
                      <td key={metodo.id} style={styles.tdTop}>
                        <div style={styles.methodCellCompact}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={fila.pagos[metodo.id]}
                            onChange={(e) =>
                              actualizarMonto(index, metodo.id, e.target.value)
                            }
                            style={{ ...styles.input, textAlign: "right" }}
                            placeholder={metodo.nombre}
                            disabled={
                              modoSoloLecturaMultiempresa ||
                              fila.origen === "venta" ||
                              String(fila.empresaId || empresa?.id) !== String(empresa?.id) ||
                              !(metodo.empresasOrigen || [empresa?.id]).some((empId) => String(empId) === String(empresa?.id))
                            }
                          />

                          {fila.referencias[metodo.id]?.trim() && (
                            <span style={styles.referenceTag}>
                              {metodo.nombre}: {fila.referencias[metodo.id]}
                            </span>
                          )}
                        </div>
                      </td>
                    ))}

                    <td style={styles.tdTop}>
                      <div style={styles.actionsDropdownWrap}>
                        <button
                          type="button"
                          style={styles.actionsMainBtn}
                          onClick={() =>
                            setAccionesAbiertasUid((prev) =>
                              prev === fila.uid ? null : fila.uid
                            )
                          }
                        >
                          Acciones ▾
                        </button>

                        {accionesAbiertasUid === fila.uid && (
                          <div style={styles.actionsMenu}>
                            {fila.origen === "venta" ? (
                              <button
                                type="button"
                                onClick={() => irAEditarVenta(fila)}
                                style={styles.actionsMenuItem}
                              >
                                Ir a editar venta
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => abrirModalManualEditar(fila.uid)}
                                style={styles.actionsMenuItem}
                              >
                                Abrir / Editar
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => abrirModalFacturacion(fila.uid)}
                              style={styles.actionsMenuItem}
                              disabled={modoSoloLecturaMultiempresa}
                            >
                              {fila.grupoFacturacion ? "Cambiar agrupación" : "Facturar junto"}
                            </button>

                            {fila.grupoFacturacion && (
                              <button
                                type="button"
                                onClick={() => quitarFacturacionJunta(fila.uid)}
                                style={styles.actionsMenuItem}
                                disabled={modoSoloLecturaMultiempresa}
                              >
                                Quitar vínculo
                              </button>
                            )}

                            {fila.origen !== "venta" && (
                              <button
                                type="button"
                                onClick={() => eliminarFila(index)}
                                style={{ ...styles.actionsMenuItem, ...styles.actionsMenuItemDanger }}
                                disabled={modoSoloLecturaMultiempresa}
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        )}

                        {fila.grupoFacturacion && (
                          <div style={styles.groupMiniText}>Grupo asignado</div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr style={styles.tfootRow}>
                  <td style={styles.totalTdLabel}>Totales</td>
                  <td style={styles.totalTdCenter}>—</td>
                  {metodos.map((metodo) => (
                    <td key={metodo.id} style={styles.totalTd}>
                      ${Number(totalesPorMetodo[metodo.id] || 0).toFixed(2)}
                    </td>
                  ))}
                  <td style={styles.totalTdCenter}>—</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={guardarCaja}
              disabled={loading}
              style={styles.saveBtn}
            >
              {loading ? "Guardando..." : "Guardar caja"}
            </button>
          </div>
        </div>

        <div
          style={{
            ...styles.card,
            ...(modoSoloLecturaMultiempresa ? styles.readOnlySection : {}),
          }}
        >
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Cierre de caja</h3>
            <p style={styles.sectionSubtitle}>
              Completá la información final del cierre diario.
            </p>
          </div>

          <div style={styles.checkboxRow}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={cierreRealizado}
                onChange={(e) => setCierreRealizado(e.target.checked)}
              />
              Cierre realizado
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={remesaEfectivo}
                onChange={(e) => setRemesaEfectivo(e.target.checked)}
              />
              Habrá remesa de efectivo
            </label>
          </div>

          <div style={styles.topGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Cuenta destino del efectivo</label>
              <input
                type="text"
                value={cuentaDestinoEfectivo}
                onChange={(e) => setCuentaDestinoEfectivo(e.target.value)}
                placeholder="Cuenta bancaria"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Número de remesa</label>
              <input
                type="text"
                value={numeroRemesaEfectivo}
                onChange={(e) => setNumeroRemesaEfectivo(e.target.value)}
                placeholder="Número de remesa"
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.topGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Responsable de caja</label>
              <input
                type="text"
                value={responsableCaja}
                onChange={(e) => setResponsableCaja(e.target.value)}
                placeholder="Nombre del responsable de caja"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Elaboró</label>
              <input
                type="text"
                value={elaboradoPor}
                onChange={(e) => setElaboradoPor(e.target.value)}
                placeholder="Nombre de quien elabora"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Revisó</label>
              <input
                type="text"
                value={revisadoPor}
                onChange={(e) => setRevisadoPor(e.target.value)}
                placeholder="Nombre de quien revisa"
                style={styles.input}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={styles.label}>Comentario de cierre</label>
            <textarea
              value={comentarioCierre}
              onChange={(e) => setComentarioCierre(e.target.value)}
              placeholder="Comentario de cierre"
              rows={3}
              style={styles.textarea}
            />
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Historial de cajas</h3>
            <p style={styles.sectionSubtitle}>
              Consultá y reabrí cajas anteriores.
            </p>
          </div>

          <div style={styles.reportTopGrid}>
            <input
              type="date"
              value={filtroDesde}
              onChange={(e) => setFiltroDesde(e.target.value)}
              style={styles.input}
            />

            <input
              type="date"
              value={filtroHasta}
              onChange={(e) => setFiltroHasta(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.historialWrap}>
            <table style={styles.historialTable}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={styles.th}>Fecha</th>
                  <th style={styles.th}>Empresa</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Cierre</th>
                  <th style={styles.th}>Responsable</th>
                  <th style={styles.th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistorial ? (
                  <tr>
                    <td colSpan="6" style={styles.emptyTd}>Cargando historial...</td>
                  </tr>
                ) : historialCajas.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={styles.emptyTd}>No hay cajas en ese rango</td>
                  </tr>
                ) : (
                  historialCajas.map((caja) => (
                    <tr key={caja.id}>
                      <td style={styles.tdCenter}>{formatearFecha(caja.fecha_local)}</td>
                      <td style={styles.tdCenter}>
                        <span style={styles.empresaBadge}>{caja.empresas?.nombre || "Empresa"}</span>
                      </td>
                      <td style={styles.tdCenter}>${formatearMonto(caja.total)}</td>
                      <td style={styles.tdCenter}>
                        <span
                          style={{
                            ...styles.badge,
                            background: caja.cierre_realizado ? "#eefcf3" : "#f8f8fa",
                            color: caja.cierre_realizado ? "#0f7a4d" : "#475569",
                            borderColor: caja.cierre_realizado ? "#c7eed5" : "#d7dbe2",
                          }}
                        >
                          {caja.cierre_realizado ? "Sí" : "No"}
                        </span>
                      </td>
                      <td style={styles.tdCenter}>
                        {caja.responsable_caja || "-"}
                      </td>
                      <td style={styles.tdCenter}>
                        <button
                          type="button"
                          onClick={() => abrirCajaHistorial(caja)}
                          style={styles.openBtn}
                        >
                          Abrir / Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Reporte de comisiones</h3>
            <p style={styles.sectionSubtitle}>
              Calcula comisiones según las clasificaciones asignadas a pacientes.
            </p>
          </div>

          <div style={styles.reportTopGrid}>
            <div style={styles.comisionSelectorBox}>
              <div style={styles.comisionSelectorHeader}>
                <strong>Empleados para comisión</strong>
                <div style={styles.empresaDropdownActions}>
                  <button type="button" style={styles.miniBtn} onClick={seleccionarSoloActivaEmpleadosComision}>
                    Solo activa
                  </button>
                  <button type="button" style={styles.miniBtn} onClick={seleccionarTodasEmpleadosComision}>
                    Todas
                  </button>
                </div>
              </div>

              <div style={styles.multiSelectWrap}>
                <button
                  type="button"
                  style={styles.multiSelectButton}
                  onClick={() => setMostrarSelectorEmpleadosComision((prev) => !prev)}
                >
                  <span>{nombreEmpresasEmpleadosComision()}</span>
                  <span style={styles.multiSelectArrow}>
                    {mostrarSelectorEmpleadosComision ? "▴" : "▾"}
                  </span>
                </button>

                {mostrarSelectorEmpleadosComision && (
                  <div style={styles.multiSelectMenu}>
                    {empresasDisponibles.map((emp) => {
                      const checked = empresasEmpleadosComisionIds.some(
                        (id) => String(id) === String(emp.id)
                      );

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
                            onChange={() => alternarEmpresaEmpleadosComision(emp.id)}
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

            <input
              type="date"
              value={fechaComisionDesde}
              onChange={(e) => setFechaComisionDesde(e.target.value)}
              style={styles.input}
            />

            <input
              type="date"
              value={fechaComisionHasta}
              onChange={(e) => setFechaComisionHasta(e.target.value)}
              style={styles.input}
            />

            <button
              type="button"
              onClick={exportarComisionesPDF}
              style={styles.reportBtnPdf}
              disabled={loadingComision}
            >
              PDF Comisiones
            </button>

            <button
              type="button"
              onClick={exportarComisionesExcel}
              style={styles.reportBtnExcel}
              disabled={loadingComision}
            >
              Excel Comisiones
            </button>
          </div>

          <p style={styles.infoText}>
            El reporte calcula las empresas seleccionadas y toma empleados de las empresas marcadas en el desplegable.
          </p>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.sectionTitleSmall}>Informes</h3>
            <p style={styles.sectionSubtitle}>
              Exportá detalle, resumen o cierre profesional.
            </p>
          </div>

          <div style={styles.reportButtons}>
            <button type="button" onClick={exportarDetallePDF} style={styles.reportBtnPdf}>
              PDF Detalle
            </button>

            <button type="button" onClick={exportarDetalleExcel} style={styles.reportBtnExcel}>
              Excel Detalle
            </button>

            <button type="button" onClick={exportarResumenPDF} style={styles.reportBtnPdf2}>
              PDF Resumen
            </button>

            <button type="button" onClick={exportarResumenExcel} style={styles.reportBtnExcel2}>
              Excel Resumen
            </button>

            <button
              type="button"
              onClick={exportarInformeProfesionalPDF}
              style={styles.reportBtnPro}
            >
              PDF Profesional
            </button>
          </div>

          <p style={styles.infoText}>
            El detalle incluye referencias de voucher o transferencia.
          </p>
        </div>
      </div>

      {modalManual.open && modalManual.fila && (
        <div style={styles.modalOverlay} onClick={cerrarModalManual}>
          <div style={styles.quickModalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.quickModalHeader}>
              <div>
                <h3 style={styles.modalTitle}>
                  {modalManual.editando ? "Editar cobro manual" : "Creación manual"}
                </h3>
                <p style={styles.modalText}>
                  {formatearFecha(fechaLocal)} · {empresa?.nombre || "Empresa"}
                </p>
              </div>

              <div style={styles.quickTotalHeader}>
                <span>Total</span>
                <strong>${formatearMonto(totalManualModal)}</strong>
              </div>

              <button type="button" onClick={cerrarModalManual} style={styles.modalCloseBtn}>
                ✕
              </button>
            </div>

            <div style={styles.quickModalBody}>
              <div style={styles.quickMainColumn}>
                <div style={styles.quickPatientCard}>
                  <label style={styles.label}>Paciente</label>
                  <input
                    type="text"
                    value={modalManual.fila.paciente || ""}
                    onChange={(e) => actualizarModalManualCampo("paciente", e.target.value)}
                    placeholder="Nombre del paciente"
                    style={styles.input}
                    autoFocus
                  />
                </div>

                <div style={styles.quickMethodsCard}>
                  <div style={styles.quickSectionHeader}>
                    <div>
                      <h4 style={styles.quickSectionTitle}>Métodos de cobro</h4>
                      <p style={styles.quickSectionText}>
                        Mostrando los métodos más usados. Usa buscar o “ver todos” si hace falta.
                      </p>
                    </div>

                    <button
                      type="button"
                      style={styles.quickSmallBtn}
                      onClick={() => {
                        setBusquedaMetodoManual("");
                        setModalMetodosManual(true);
                      }}
                    >
                      + Métodos
                    </button>
                  </div>

                  <div style={styles.quickSelectedMethodsInfo}>
                    Métodos visibles: {metodosVisiblesManual.length}. Usa “+ Métodos” para agregar otros.
                  </div>

                  <div style={styles.quickMethodListTable}>
                    {metodosVisiblesManual.length === 0 ? (
                      <div style={styles.emptyMiniBox}>No hay métodos que coincidan.</div>
                    ) : (
                      metodosVisiblesManual.map((metodo) => {
                        const habilitadoMetodo = (metodo.empresasOrigen || [empresa?.id]).some(
                          (empId) => String(empId) === String(empresa?.id)
                        );
                        const tieneMonto = Number(modalManual.fila.pagos?.[metodo.id] || 0) > 0;

                        return (
                          <div
                            key={metodo.id}
                            style={{
                              ...styles.quickMethodListRow,
                              ...(tieneMonto ? styles.quickMethodListRowActive : {}),
                            }}
                          >
                            <button
                              type="button"
                              style={styles.methodSelectBtn}
                              onClick={() => {
                                if (!habilitadoMetodo) return;
                                const actual = modalManual.fila.pagos?.[metodo.id] || "";
                                if (!actual) actualizarModalManualMonto(metodo.id, "");
                              }}
                              disabled={!habilitadoMetodo}
                              title="Seleccionar método"
                            >
                              <span style={tieneMonto ? styles.methodDotActive : styles.methodDot} />
                              <span style={styles.methodNameList}>
                                <strong>{metodo.nombre}</strong>
                                {!habilitadoMetodo && <small>No aplica</small>}
                              </span>
                            </button>

                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={modalManual.fila.pagos?.[metodo.id] || ""}
                              onChange={(e) => actualizarModalManualMonto(metodo.id, e.target.value)}
                              style={styles.quickAmountListInput}
                              placeholder="0.00"
                              disabled={!habilitadoMetodo}
                            />

                            {tieneMonto && (
                              <input
                                type="text"
                                value={modalManual.fila.referencias?.[metodo.id] || ""}
                                onChange={(e) => actualizarModalManualReferencia(metodo.id, e.target.value)}
                                style={styles.quickReferenceListInput}
                                placeholder="Referencia / voucher"
                                disabled={!habilitadoMetodo}
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <aside style={styles.quickSideColumn}>
                <div style={styles.quickClassificationCard}>
                  <div style={styles.quickSectionHeader}>
                    <div>
                      <h4 style={styles.quickSectionTitle}>Clasificación</h4>
                      <p style={styles.quickSectionText}>
                        Siempre visible para que el cobro sea rápido.
                      </p>
                    </div>

                    <button
                      type="button"
                      style={styles.quickSmallBtnGreen}
                      onClick={abrirNuevaClasificacionRapida}
                    >
                      + Nueva
                    </button>
                  </div>

                  <input
                    type="text"
                    value={busquedaClasificacionManual}
                    onChange={(e) => setBusquedaClasificacionManual(e.target.value)}
                    placeholder="Buscar clasificación..."
                    style={styles.quickSearch}
                  />

                  <div style={styles.quickClassificationListCompact}>
                    {clasificacionesManualFiltradas.length === 0 ? (
                      <div style={styles.emptyMiniBox}>No hay clasificaciones.</div>
                    ) : (
                      clasificacionesManualFiltradas.map((clasificacion) => {
                        const checked = manualClasificacionesIds.some(
                          (id) => String(id) === String(clasificacion.id)
                        );

                        return (
                          <button
                            key={clasificacion.id}
                            type="button"
                            onClick={() => alternarClasificacionManual(clasificacion.id)}
                            style={{
                              ...styles.classificationListRow,
                              ...(checked ? styles.classificationListRowActive : {}),
                            }}
                          >
                            <span style={styles.fakeCheckbox}>{checked ? "✓" : ""}</span>

                            <span style={styles.classificationListName}>
                              <strong>{clasificacion.nombre}</strong>
                              <small>${formatearMonto(clasificacion.monto)}</small>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div style={styles.quickSummaryCard}>
                  <h4 style={styles.quickSectionTitle}>Resumen</h4>

                  <div style={styles.quickSummaryLine}>
                    <span>Paciente</span>
                    <strong>{modalManual.fila.paciente || "Sin nombre"}</strong>
                  </div>

                  <div style={styles.quickSummaryLine}>
                    <span>Total cobrado</span>
                    <strong>${formatearMonto(totalManualModal)}</strong>
                  </div>

                  <div style={styles.quickSummaryLine}>
                    <span>Métodos usados</span>
                    <strong>{metodosConMontoManual.length}</strong>
                  </div>

                  <div style={styles.quickSummaryTags}>
                    {clasificacionesSeleccionadasManual.length === 0 ? (
                      <span style={styles.emptyChip}>Sin clasificación</span>
                    ) : (
                      clasificacionesSeleccionadasManual.map((c) => (
                        <span key={c.id} style={styles.classificationChip}>
                          {c.nombre}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </aside>
            </div>

            <div style={styles.quickModalFooter}>
              <button
                type="button"
                style={styles.saveBtn}
                onClick={guardarModalManual}
                disabled={guardandoManual}
              >
                {guardandoManual
                  ? "Guardando..."
                  : modalManual.editando
                  ? "Guardar cambios"
                  : "Guardar cobro"}
              </button>

              <button
                type="button"
                style={styles.clearBtn}
                onClick={cerrarModalManual}
                disabled={guardandoManual}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMetodosManual && modalManual.open && (
        <div style={styles.innerModalOverlay} onClick={() => setModalMetodosManual(false)}>
          <div style={styles.metodosSelectorBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.metodosSelectorHeader}>
              <div>
                <h3 style={styles.modalTitle}>Seleccionar métodos</h3>
                <p style={styles.modalText}>
                  Marcá los métodos que querés usar en este cobro.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalMetodosManual(false)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <input
              type="text"
              value={busquedaMetodoManual}
              onChange={(e) => setBusquedaMetodoManual(e.target.value)}
              placeholder="Buscar método de cobro..."
              style={styles.quickSearch}
              autoFocus
            />

            <div style={styles.metodosSelectorList}>
              {metodosDisponiblesSelector.length === 0 ? (
                <div style={styles.emptyMiniBox}>No hay métodos que coincidan.</div>
              ) : (
                metodosDisponiblesSelector.map((metodo) => {
                  const checked = metodosManualIds.some(
                    (id) => String(id) === String(metodo.id)
                  );
                  const monto = Number(modalManual.fila?.pagos?.[metodo.id] || 0);

                  return (
                    <button
                      key={metodo.id}
                      type="button"
                      onClick={() => alternarMetodoManual(metodo.id)}
                      style={{
                        ...styles.metodoSelectorItem,
                        ...(checked ? styles.metodoSelectorItemActive : {}),
                      }}
                    >
                      <span style={styles.fakeCheckbox}>{checked ? "✓" : ""}</span>

                      <span style={styles.metodoSelectorName}>
                        <strong>{metodo.nombre}</strong>
                        {monto > 0 && <small>Monto actual: ${formatearMonto(monto)}</small>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div style={styles.metodosSelectorFooter}>
              <button
                type="button"
                style={styles.saveBtn}
                onClick={() => {
                  guardarMetodosManualSeleccionados(metodosManualIds);
                  setModalMetodosManual(false);
                }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {modalClasificacion.open && filaModalClasificacion && (
        <div style={styles.modalOverlay} onClick={cerrarModalClasificacion}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeaderSimple}>
              <div>
                <h3 style={styles.modalTitle}>Clasificar paciente</h3>
                <p style={styles.modalText}>
                  {filaModalClasificacion.paciente || "Sin nombre"} · {formatearFecha(fechaLocal)}
                  <br />
                  Clasificaciones tomadas de: {obtenerNombreEmpresa(filaModalClasificacion.empresaId || empresa?.id)}
                </p>
              </div>

              <button type="button" onClick={cerrarModalClasificacion} style={styles.modalCloseBtn}>
                ✕
              </button>
            </div>

            <div style={styles.quickModalActions}>
              <button type="button" style={styles.primarySoftBtn} onClick={abrirNuevaClasificacionRapida}>
                + Crear clasificación
              </button>
            </div>

            <div style={styles.modalList}>
              {clasificaciones.length === 0 ? (
                <div style={styles.emptyTd}>
                  No hay clasificaciones activas. Crealas en el módulo “Clasificación de pacientes”.
                </div>
              ) : (
                clasificaciones.map((clasificacion) => (
                  <button
                    key={clasificacion.id}
                    type="button"
                    onClick={() => asignarClasificacionAFila(clasificacion.id)}
                    style={styles.modalOptionBtn}
                  >
                    <strong>{clasificacion.nombre}</strong>
                    <span style={styles.modalOptionSub}>
                      Comisión: ${formatearMonto(clasificacion.monto)}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: "0 0 8px 0", color: "#574866" }}>Asignadas</h4>
              <div style={styles.clasificacionChips}>
                {obtenerClasificacionesFila(filaModalClasificacion).length === 0 ? (
                  <span style={styles.clasificacionEmpty}>Sin clasificación</span>
                ) : (
                  obtenerClasificacionesFila(filaModalClasificacion).map((asig) => (
                    <button
                      key={asig.id}
                      type="button"
                      style={styles.clasificacionChipRemove}
                      onClick={() => quitarClasificacionAsignada(asig.id)}
                    >
                      {asig.clasificaciones_pacientes?.nombre || "Clasificación"} ✕
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {modalNuevaClasificacion && (
        <div style={styles.modalOverlay} onClick={cerrarNuevaClasificacionRapida}>
          <div style={styles.modalBoxSmall} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeaderSimple}>
              <div>
                <h3 style={styles.modalTitle}>Nueva clasificación</h3>
                <p style={styles.modalText}>
                  Se creará en la empresa de este paciente: {obtenerNombreEmpresa(filaModalClasificacion?.empresaId || empresa?.id)}.
                </p>
              </div>

              <button
                type="button"
                onClick={cerrarNuevaClasificacionRapida}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalFormGrid}>
              <div>
                <label style={styles.label}>Nombre</label>
                <input
                  style={styles.input}
                  value={nuevoNombreClasificacion}
                  onChange={(e) => setNuevoNombreClasificacion(e.target.value)}
                  placeholder="Ej: Paciente terminado"
                />
              </div>

              <div>
                <label style={styles.label}>Monto comisión</label>
                <input
                  style={styles.input}
                  type="number"
                  step="0.01"
                  min="0"
                  value={nuevoMontoClasificacion}
                  onChange={(e) => setNuevoMontoClasificacion(e.target.value)}
                  placeholder="Ej: 2.00"
                />
              </div>
            </div>

            <div style={styles.modalActionsInline}>
              <button
                type="button"
                style={styles.saveBtn}
                onClick={guardarNuevaClasificacionRapida}
                disabled={guardandoNuevaClasificacion}
              >
                {guardandoNuevaClasificacion ? "Guardando..." : "Guardar clasificación"}
              </button>

              <button
                type="button"
                style={styles.clearBtn}
                onClick={cerrarNuevaClasificacionRapida}
                disabled={guardandoNuevaClasificacion}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFacturacion.open && (
        <div style={styles.modalOverlay} onClick={cerrarModalFacturacion}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeaderSimple}>
              <div>
                <h3 style={styles.modalTitle}>Facturar junto</h3>
                <p style={styles.modalText}>
                  Elegí con cuál otra fila querés agrupar este pago para la exportación.
                </p>
              </div>

              <button type="button" onClick={cerrarModalFacturacion} style={styles.modalCloseBtn}>
                ✕
              </button>
            </div>

            <div style={styles.modalList}>
              {filas
                .filter((f) => f.uid !== modalFacturacion.filaUid)
                .map((f) => (
                  <button
                    key={f.uid}
                    type="button"
                    onClick={() => asignarFacturacionJunta(modalFacturacion.filaUid, f.uid)}
                    style={styles.modalOptionBtn}
                  >
                    <strong>{f.paciente || "Sin nombre"}</strong>
                    <span style={styles.modalOptionSub}>
                      {f.origen === "venta" ? "Venta / CxC" : "Manual"}
                    </span>
                  </button>
                ))}

              {filas.filter((f) => f.uid !== modalFacturacion.filaUid).length === 0 && (
                <div style={styles.emptyTd}>No hay otra fila disponible para agrupar.</div>
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
    boxSizing: "border-box",
  },

  container: {
    width: "min(100%, 1380px)",
    margin: "0 auto",
    display: "grid",
    gap: "18px",
  },

  modalBoxManualPro: {
    width: "min(1120px, calc(100vw - 28px))",
    maxHeight: "92vh",
    overflow: "hidden",
    background: "#fff",
    borderRadius: "24px",
    border: "1px solid #d7dbe2",
    boxShadow: "0 24px 90px rgba(15, 23, 42, 0.25)",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr) auto",
  },

  modalManualHero: {
    padding: "20px 22px",
    borderBottom: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #ffffff 0%, #fbf8fd 100%)",
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: "14px",
  },

  manualPatientBlock: {
    padding: "16px 22px",
    borderBottom: "1px solid #e2e8f0",
    display: "grid",
    gap: "7px",
    background: "#fff",
  },

  manualTwoPanelGrid: {
    minHeight: 0,
    padding: "18px 22px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "16px",
    overflow: "hidden",
  },

  manualPanel: {
    minHeight: 0,
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    background: "#fbfbfc",
    padding: "14px",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr)",
    gap: "12px",
  },

  manualPanelHeader: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: "12px",
  },

  manualPanelTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "17px",
    fontWeight: "900",
  },

  manualPanelText: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.35,
  },

  manualCounterBadge: {
    minWidth: "34px",
    height: "28px",
    borderRadius: "999px",
    display: "grid",
    placeItems: "center",
    background: "#f4f0f7",
    color: "#574866",
    fontWeight: "900",
    border: "1px solid #d3c7dd",
  },

  searchInputSoft: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    borderRadius: "13px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "13px",
  },

  manualScrollableList: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "9px",
    paddingRight: "4px",
  },

  clasificacionScrollableList: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "8px",
    paddingRight: "4px",
  },

  metodoRowPro: {
    display: "grid",
    gridTemplateColumns: "minmax(140px, 1fr) minmax(110px, 140px) minmax(150px, 0.9fr)",
    gap: "9px",
    alignItems: "center",
    padding: "11px",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    background: "#fff",
  },

  metodoNamePro: {
    display: "grid",
    gap: "2px",
    color: "#1f2937",
    fontSize: "13px",
  },

  amountInputPro: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    textAlign: "right",
    fontSize: "13px",
  },

  referenceInputPro: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "13px",
  },

  clasificacionRowPro: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "#fff",
    borderRadius: "15px",
    padding: "11px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    textAlign: "left",
  },

  clasificacionRowProActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  modalActionsSticky: {
    padding: "14px 22px",
    borderTop: "1px solid #e2e8f0",
    background: "#fff",
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
  },

  modalBoxManual: {
    width: "min(940px, calc(100vw - 28px))",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: "22px",
    padding: "20px",
    border: "1px solid #d7dbe2",
    boxShadow: "0 20px 80px rgba(15, 23, 42, 0.22)",
  },

  manualModalGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 1fr) minmax(250px, 330px)",
    gap: "16px",
    alignItems: "start",
  },

  manualMainArea: {
    display: "grid",
    gap: "14px",
  },

  manualPaymentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px",
  },

  manualMetodoCard: {
    display: "grid",
    gap: "8px",
    padding: "12px",
    borderRadius: "16px",
    border: "1px solid #e2e8f0",
    background: "#fbfbfc",
  },

  manualSideArea: {
    display: "grid",
    gap: "12px",
    padding: "12px",
    borderRadius: "18px",
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
  },

  manualSideHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "start",
  },

  manualSideTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "16px",
    fontWeight: "900",
  },

  manualSideText: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.35,
  },

  manualClasificacionList: {
    display: "grid",
    gap: "8px",
    maxHeight: "340px",
    overflowY: "auto",
    paddingRight: "2px",
  },

  manualClasificacionOption: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "#fff",
    borderRadius: "14px",
    padding: "10px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    textAlign: "left",
  },

  manualClasificacionOptionActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  manualClasificacionText: {
    display: "grid",
    gap: "2px",
    color: "#1f2937",
  },

  primarySoftBtnSmall: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "900",
    whiteSpace: "nowrap",
  },

  emptyMiniBox: {
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#64748b",
    fontSize: "13px",
  },

  modalBoxManualClean: {
    width: "min(860px, calc(100vw - 28px))",
    maxHeight: "92vh",
    overflow: "hidden",
    background: "#fff",
    borderRadius: "24px",
    border: "1px solid #d7dbe2",
    boxShadow: "0 24px 90px rgba(15, 23, 42, 0.25)",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto",
  },

  modalManualHeroClean: {
    padding: "20px 22px",
    borderBottom: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #ffffff 0%, #fbf8fd 100%)",
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: "14px",
  },

  cleanModalBody: {
    overflowY: "auto",
    padding: "18px 22px",
    display: "grid",
    gap: "14px",
    background: "#f8fafc",
  },

  cleanSection: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "14px",
    display: "grid",
    gap: "12px",
  },

  cleanSectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  cleanSectionHeaderBetween: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "start",
    flexWrap: "wrap",
  },

  cleanStep: {
    width: "30px",
    height: "30px",
    borderRadius: "11px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    display: "grid",
    placeItems: "center",
    fontWeight: "900",
    flexShrink: 0,
  },

  cleanSectionTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "16px",
    fontWeight: "900",
  },

  cleanSectionText: {
    margin: "3px 0 0 0",
    color: "#64748b",
    fontSize: "12px",
  },

  cleanMethodsList: {
    display: "grid",
    gap: "9px",
    maxHeight: "280px",
    overflowY: "auto",
    paddingRight: "2px",
  },

  cleanMethodRow: {
    display: "grid",
    gridTemplateColumns: "minmax(120px, 1fr) minmax(90px, 120px) minmax(120px, 0.9fr)",
    gap: "8px",
    alignItems: "center",
    padding: "10px",
    borderRadius: "14px",
    border: "1px solid #e2e8f0",
    background: "#fbfbfc",
  },

  cleanMethodName: {
    display: "grid",
    gap: "2px",
    color: "#1f2937",
    fontSize: "13px",
  },

  cleanAmountInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 11px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    textAlign: "right",
    fontSize: "13px",
  },

  cleanReferenceInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 11px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "13px",
  },

  cleanClassificationGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "8px",
    maxHeight: "230px",
    overflowY: "auto",
    paddingRight: "2px",
  },

  cleanClassificationChip: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "#fbfbfc",
    borderRadius: "14px",
    padding: "10px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
    cursor: "pointer",
    textAlign: "left",
  },

  cleanClassificationChipActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  actionsDropdownWrap: {
    position: "relative",
    display: "grid",
    gap: "6px",
  },

  actionsMainBtn: {
    width: "100%",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "14px",
    padding: "11px 12px",
    cursor: "pointer",
    fontWeight: "900",
  },

  actionsMenu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    zIndex: 20,
    minWidth: "190px",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "14px",
    padding: "6px",
    boxShadow: "0 14px 35px rgba(15, 23, 42, 0.16)",
    display: "grid",
    gap: "4px",
  },

  actionsMenuItem: {
    width: "100%",
    textAlign: "left",
    background: "#fff",
    color: "#334155",
    border: "none",
    borderRadius: "10px",
    padding: "9px 10px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "12px",
  },

  actionsMenuItemDanger: {
    color: "#be123c",
    background: "#fff1f2",
  },

  groupMiniText: {
    color: "#b45309",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "11px",
    textAlign: "center",
    fontWeight: "800",
  },

  patientCellCompact: {
    display: "grid",
    gap: "7px",
  },

  originInlineWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    flexWrap: "wrap",
  },

  empresaChipCompact: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "210px",
    padding: "6px 9px",
    borderRadius: "999px",
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    fontSize: "11px",
    fontWeight: "900",
    lineHeight: 1.1,
    textAlign: "center",
  },

  manualChipCompact: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 9px",
    borderRadius: "999px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    fontSize: "11px",
    fontWeight: "900",
  },

  ventaChipCompact: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 9px",
    borderRadius: "999px",
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    fontSize: "11px",
    fontWeight: "900",
  },

  methodCellCompact: {
    display: "grid",
    gap: "6px",
  },

  referenceTag: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    maxWidth: "100%",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#f8fafc",
    color: "#64748b",
    border: "1px solid #e2e8f0",
    fontSize: "11px",
    fontWeight: "800",
    whiteSpace: "normal",
    lineHeight: 1.2,
  },

  actionsDropdownWrap: {
    position: "relative",
    display: "grid",
    gap: "6px",
  },

  actionsMainBtn: {
    width: "100%",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "14px",
    padding: "11px 12px",
    cursor: "pointer",
    fontWeight: "900",
  },

  actionsMenu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    zIndex: 80,
    minWidth: "190px",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "14px",
    padding: "6px",
    boxShadow: "0 14px 35px rgba(15, 23, 42, 0.16)",
    display: "grid",
    gap: "4px",
  },

  actionsMenuItem: {
    width: "100%",
    textAlign: "left",
    background: "#fff",
    color: "#334155",
    border: "none",
    borderRadius: "10px",
    padding: "9px 10px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "12px",
  },

  actionsMenuItemDanger: {
    color: "#be123c",
    background: "#fff1f2",
  },

  groupMiniText: {
    color: "#b45309",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "11px",
    textAlign: "center",
    fontWeight: "800",
  },

  patientCellCompact: {
    display: "grid",
    gap: "7px",
  },

  clasificacionChipsCompact: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },

  originInlineWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    flexWrap: "wrap",
  },

  empresaChipCompact: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "220px",
    padding: "6px 9px",
    borderRadius: "999px",
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    fontSize: "11px",
    fontWeight: "900",
    lineHeight: 1.1,
    textAlign: "center",
  },

  manualChipCompact: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 9px",
    borderRadius: "999px",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    fontSize: "11px",
    fontWeight: "900",
  },

  ventaChipCompact: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 9px",
    borderRadius: "999px",
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    fontSize: "11px",
    fontWeight: "900",
  },

  methodCellCompact: {
    display: "grid",
    gap: "6px",
  },

  referenceTag: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    maxWidth: "100%",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#f8fafc",
    color: "#64748b",
    border: "1px solid #e2e8f0",
    fontSize: "11px",
    fontWeight: "800",
    whiteSpace: "normal",
    lineHeight: 1.2,
  },

  actionsDropdownWrap: {
    position: "relative",
    display: "grid",
    gap: "6px",
  },

  actionsMainBtn: {
    width: "100%",
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "14px",
    padding: "11px 12px",
    cursor: "pointer",
    fontWeight: "900",
  },

  actionsMenu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    zIndex: 80,
    minWidth: "190px",
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "14px",
    padding: "6px",
    boxShadow: "0 14px 35px rgba(15, 23, 42, 0.16)",
    display: "grid",
    gap: "4px",
  },

  actionsMenuItem: {
    width: "100%",
    textAlign: "left",
    background: "#fff",
    color: "#334155",
    border: "none",
    borderRadius: "10px",
    padding: "9px 10px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "12px",
  },

  actionsMenuItemDanger: {
    color: "#be123c",
    background: "#fff1f2",
  },

  groupMiniText: {
    color: "#b45309",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "11px",
    textAlign: "center",
    fontWeight: "800",
  },

  headerCard: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "22px",
    padding: "22px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
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

  companyPill: {
    margin: "10px 0 0 0",
    color: "#574866",
    fontSize: "14px",
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    padding: "8px 12px",
    borderRadius: "12px",
    display: "inline-block",
  },

  empresaSelect: {
    marginTop: 8,
    maxWidth: 360,
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #d7dbe2",
    background: "#fff",
    color: "#1f2937",
    fontSize: 14,
    outline: "none",
  },

  totalBadge: {
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    borderRadius: "18px",
    padding: "14px 18px",
    minWidth: "180px",
  },

  totalBadgeLabel: {
    display: "block",
    fontSize: "12px",
    color: "#6b7280",
    marginBottom: "4px",
  },

  totalBadgeValue: {
    fontSize: "26px",
    color: "#574866",
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

  sectionTitleSmall: {
    margin: 0,
    fontSize: "20px",
    color: "#1f2937",
  },

  sectionSubtitle: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },




  comisionSelectorBox: {
    gridColumn: "span 2",
    border: "1px solid #d7dbe2",
    borderRadius: "14px",
    padding: "12px",
    background: "#f8f8fa",
    display: "grid",
    gap: "8px",
    position: "relative",
    zIndex: 30,
  },

  comisionSelectorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    color: "#574866",
  },

  comisionSelectorTitle: {
    padding: "8px 10px",
    borderRadius: "10px",
    background: "#fff",
    border: "1px solid #d7dbe2",
    color: "#1f2937",
    fontWeight: "800",
  },

  comisionEmpresaChecks: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "6px",
  },

  comisionEmpresaItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    borderRadius: "10px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    color: "#334155",
    fontWeight: "700",
  },


  readOnlyMiniNote: {
    color: "#9a3412",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "10px",
    padding: "7px 10px",
    fontSize: "12px",
    fontWeight: "800",
    marginBottom: "8px",
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
    zIndex: 80,
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


  empresaChecks: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
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

  empresaCheckLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#f8f8fa",
    border: "1px solid #d7dbe2",
    borderRadius: 999,
    padding: "8px 11px",
    fontSize: 12,
    color: "#334155",
    fontWeight: "700",
    cursor: "pointer",
  },

  topGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "14px",
    marginTop: "14px",
  },

  actionGridSimple: {
    marginTop: "14px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "12px",
    alignItems: "end",
  },

  formGroup: {
    display: "grid",
    gap: "6px",
  },

  formGroupWide: {
    display: "grid",
    gap: "8px",
    position: "relative",
    zIndex: 20,
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

  subInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #e1e8f0",
    background: "#fbfdff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "12px",
    color: "#42556d",
  },

  textarea: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "14px",
    resize: "vertical",
  },

  primarySoftBtn: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  clearBtn: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "1300px",
  },

  historialWrap: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
  },

  historialTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "700px",
  },

  theadRow: {
    background: "#f4f0f7",
  },

  th: {
    padding: "14px 12px",
    textAlign: "center",
    color: "#574866",
    fontWeight: "700",
    fontSize: "14px",
    borderBottom: "1px solid #e2e8f0",
  },

  tdTop: {
    padding: "12px",
    borderBottom: "1px solid #edf2f7",
    verticalAlign: "top",
    background: "#fff",
  },

  tdCenter: {
    padding: "12px",
    borderBottom: "1px solid #edf2f7",
    textAlign: "center",
    verticalAlign: "middle",
    background: "#fff",
  },

  cellStack: {
    display: "grid",
    gap: "8px",
  },

  actionCell: {
    display: "grid",
    gap: "8px",
  },

  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid transparent",
  },

  editSourceBtn: {
    background: "#e0f2fe",
    color: "#075985",
    border: "1px solid #bae6fd",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  linkBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  unlinkBtn: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  linkInfo: {
    fontSize: "12px",
    color: "#574866",
    background: "#f8f4fb",
    border: "1px solid #e4d9ee",
    borderRadius: "10px",
    padding: "8px 10px",
  },

  linkInfoMuted: {
    fontSize: "12px",
    color: "#64748b",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "8px 10px",
  },

  emptyTd: {
    textAlign: "center",
    padding: "24px",
    color: "#64748b",
  },

  tfootRow: {
    background: "#fafcff",
  },

  totalTdLabel: {
    padding: "14px 12px",
    fontWeight: "700",
    color: "#574866",
    borderTop: "1px solid #e2e8f0",
    background: "#f9fafb",
  },

  totalTd: {
    padding: "14px 12px",
    fontWeight: "700",
    color: "#574866",
    textAlign: "right",
    borderTop: "1px solid #e2e8f0",
    background: "#f9fafb",
  },

  totalTdCenter: {
    padding: "14px 12px",
    fontWeight: "700",
    color: "#574866",
    textAlign: "center",
    borderTop: "1px solid #e2e8f0",
    background: "#f9fafb",
  },

  deleteBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  openBtn: {
    background: "#e0f2fe",
    color: "#075985",
    border: "1px solid #bae6fd",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
  },

  saveBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "12px 18px",
    cursor: "pointer",
    fontWeight: "700",
  },

  checkboxRow: {
    display: "flex",
    gap: "20px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },

  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#334155",
    fontWeight: "600",
  },

  reportTopGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    marginBottom: "14px",
  },

  reportButtons: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px",
    marginBottom: "10px",
  },

  reportBtnPdf: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  reportBtnExcel: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  reportBtnPdf2: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  reportBtnExcel2: {
    background: "#e0f2fe",
    color: "#0369a1",
    border: "1px solid #bae6fd",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  reportBtnPro: {
    background: "#fef3c7",
    color: "#92400e",
    border: "1px solid #fde68a",
    borderRadius: "12px",
    padding: "11px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },

  infoText: {
    margin: 0,
    color: "#64748b",
    fontSize: "13px",
  },




  disabledBtn: {
    opacity: 0.55,
    cursor: "not-allowed",
    filter: "grayscale(0.2)",
  },

  readOnlyBanner: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: "14px",
    padding: "12px 14px",
    fontWeight: "800",
    marginBottom: "14px",
  },

  readOnlySection: {
    opacity: 0.72,
    pointerEvents: "none",
    userSelect: "none",
  },


  empresaTagCaja: {
    display: "flex",
    width: "fit-content",
    maxWidth: "100%",
    margin: "0 auto 8px auto",
    padding: "5px 9px",
    borderRadius: "999px",
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    fontWeight: "800",
    fontSize: "11px",
    wordBreak: "break-word",
    justifyContent: "center",
  },

  quickModalActions: {
    display: "flex",
    justifyContent: "flex-end",
    margin: "8px 0 12px 0",
  },

  modalBoxSmall: {
    background: "#fff",
    borderRadius: "18px",
    padding: "18px",
    width: "min(94vw, 520px)",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
    border: "1px solid #d7dbe2",
  },

  modalFormGrid: {
    display: "grid",
    gap: "12px",
    marginTop: "12px",
  },

  modalActionsInline: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "16px",
  },


  clasificacionBox: {
    marginTop: "8px",
    display: "grid",
    gap: "6px",
  },

  classifyBtn: {
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "10px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "12px",
  },

  clasificacionChips: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },

  clasificacionChip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    fontWeight: "800",
    fontSize: "11px",
  },

  clasificacionChipRemove: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 9px",
    borderRadius: "999px",
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    fontWeight: "800",
    fontSize: "12px",
    cursor: "pointer",
  },

  clasificacionEmpty: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#f8f8fa",
    color: "#64748b",
    border: "1px solid #d7dbe2",
    fontWeight: "700",
    fontSize: "11px",
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

  modalBox: {
    width: "100%",
    maxWidth: "560px",
    background: "#fff",
    borderRadius: "20px",
    border: "1px solid #d7dbe2",
    boxShadow: "0 20px 45px rgba(0,0,0,0.22)",
    padding: "18px",
  },

  modalHeaderSimple: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "14px",
  },

  modalTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "24px",
    fontWeight: "700",
  },

  modalText: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  modalCloseBtn: {
    background: "#e2e8f0",
    border: "none",
    borderRadius: "10px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "700",
  },

  modalList: {
    display: "grid",
    gap: "10px",
    maxHeight: "380px",
    overflowY: "auto",
  },

  modalOptionBtn: {
    width: "100%",
    textAlign: "left",
    display: "grid",
    gap: "4px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "12px 14px",
    cursor: "pointer",
  },

  modalOptionSub: {
    fontSize: "12px",
      color: "#64748b",
    },

  // ===== MODAL RÁPIDO TIPO RECEPCIÓN =====
  quickModalBox: {
    width: "min(1080px, calc(100vw - 28px))",
    height: "min(720px, calc(100vh - 28px))",
    background: "#fff",
    borderRadius: "24px",
    border: "1px solid #d7dbe2",
    boxShadow: "0 24px 90px rgba(15, 23, 42, 0.25)",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    overflow: "hidden",
  },

  quickModalHeader: {
    padding: "16px 18px",
    borderBottom: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #ffffff 0%, #fbf8fd 100%)",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 150px auto",
    gap: "12px",
    alignItems: "center",
  },

  quickTotalHeader: {
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    borderRadius: "16px",
    padding: "9px 12px",
    display: "grid",
    gap: "2px",
    color: "#574866",
  },

  quickModalBody: {
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "minmax(420px, 1fr) minmax(300px, 360px)",
    gap: "14px",
    padding: "14px",
    background: "#f8fafc",
    overflow: "hidden",
  },

  quickMainColumn: {
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    gap: "12px",
  },

  quickSideColumn: {
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr) auto",
    gap: "12px",
  },

  quickPatientCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "12px",
    display: "grid",
    gap: "7px",
  },

  quickMethodsCard: {
    minHeight: 0,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "12px",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr) auto",
    gap: "10px",
  },

  quickClassificationCard: {
    minHeight: 0,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "12px",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr)",
    gap: "10px",
  },

  quickSummaryCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "12px",
    display: "grid",
    gap: "8px",
  },

  quickSectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "start",
  },

  quickSectionTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "15px",
    fontWeight: "950",
  },

  quickSectionText: {
    margin: "3px 0 0 0",
    color: "#64748b",
    fontSize: "11.5px",
    lineHeight: 1.3,
  },

  quickSmallBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "11px",
    padding: "7px 9px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "11px",
    whiteSpace: "nowrap",
  },

  quickSmallBtnGreen: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "11px",
    padding: "7px 9px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "11px",
    whiteSpace: "nowrap",
  },

  quickSearch: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 10px",
    borderRadius: "12px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "12.5px",
  },

  quickMethodList: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "8px",
    paddingRight: "3px",
  },

  quickMethodRow: {
    display: "grid",
    gridTemplateColumns: "minmax(130px, 1fr) 112px",
    gap: "8px",
    alignItems: "center",
    background: "#fbfbfc",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "9px",
  },

  quickMethodRowActive: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
  },

  quickMethodName: {
    display: "grid",
    gap: "2px",
    color: "#1f2937",
    fontSize: "12.5px",
  },

  quickAmountInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 10px",
    borderRadius: "11px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    textAlign: "right",
    fontSize: "12.5px",
  },

  quickReferenceInput: {
    gridColumn: "1 / -1",
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    borderRadius: "11px",
    border: "1px solid #d7dbe2",
    background: "#fff",
    outline: "none",
    fontSize: "12px",
  },

  quickHint: {
    color: "#64748b",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "8px 10px",
    fontSize: "11px",
  },

  quickClassificationList: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "8px",
    paddingRight: "3px",
  },

  quickClassificationItem: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "#fbfbfc",
    borderRadius: "14px",
    padding: "9px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
    cursor: "pointer",
    textAlign: "left",
  },

  quickClassificationItemActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  quickSummaryLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
    padding: "7px 0",
    borderBottom: "1px solid #edf2f7",
    color: "#64748b",
    fontSize: "12px",
  },

  quickSummaryTags: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },

  quickModalFooter: {
    padding: "12px 14px",
    borderTop: "1px solid #e2e8f0",
    background: "#fff",
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    flexWrap: "wrap",
  },

  // ===== LISTAS RÁPIDAS PARA COBRO MANUAL =====
  quickMethodListTable: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "6px",
    paddingRight: "3px",
  },

  quickMethodListRow: {
    display: "grid",
    gridTemplateColumns: "minmax(160px, 1fr) 105px minmax(110px, 0.8fr)",
    gap: "7px",
    alignItems: "center",
    background: "#fbfbfc",
    border: "1px solid #e2e8f0",
    borderRadius: "13px",
    padding: "7px",
  },

  quickMethodListRowActive: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
  },

  methodSelectBtn: {
    border: "none",
    background: "transparent",
    padding: 0,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    textAlign: "left",
    minWidth: 0,
  },

  methodDot: {
    width: "13px",
    height: "13px",
    borderRadius: "999px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    flexShrink: 0,
  },

  methodDotActive: {
    width: "13px",
    height: "13px",
    borderRadius: "999px",
    border: "1px solid #22c55e",
    background: "#22c55e",
    flexShrink: 0,
  },

  methodNameList: {
    display: "grid",
    gap: "1px",
    color: "#1f2937",
    fontSize: "12.5px",
    minWidth: 0,
    lineHeight: 1.15,
  },

  quickAmountListInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 9px",
    borderRadius: "10px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    textAlign: "right",
    fontSize: "12.5px",
  },

  quickReferenceListInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 9px",
    borderRadius: "10px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "12px",
  },

  referenceMuted: {
    color: "#94a3b8",
    fontSize: "11px",
    textAlign: "center",
  },

  quickClassificationListCompact: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "6px",
    paddingRight: "3px",
  },

  classificationListRow: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "#fbfbfc",
    borderRadius: "13px",
    padding: "8px 9px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    textAlign: "left",
  },

  classificationListRowActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  classificationListName: {
    display: "grid",
    gap: "1px",
    color: "#1f2937",
    fontSize: "12.5px",
    lineHeight: 1.15,
  },

  // ===== MODAL RÁPIDO SIN ESPACIOS MUERTOS =====
  quickModalBox: {
    width: "min(900px, calc(100vw - 24px))",
    height: "min(650px, calc(100vh - 24px))",
    background: "#fff",
    borderRadius: "22px",
    border: "1px solid #d7dbe2",
    boxShadow: "0 24px 90px rgba(15, 23, 42, 0.25)",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    overflow: "hidden",
  },

  quickModalHeader: {
    padding: "14px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #ffffff 0%, #fbf8fd 100%)",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 120px auto",
    gap: "10px",
    alignItems: "center",
  },

  quickTotalHeader: {
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    borderRadius: "14px",
    padding: "8px 10px",
    display: "grid",
    gap: "1px",
    color: "#574866",
  },

  quickModalBody: {
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "minmax(430px, 1fr) minmax(260px, 300px)",
    gap: "10px",
    padding: "10px",
    background: "#f8fafc",
    overflow: "hidden",
  },

  quickMainColumn: {
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    gap: "9px",
  },

  quickSideColumn: {
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr) auto",
    gap: "9px",
  },

  quickPatientCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "10px",
    display: "grid",
    gap: "6px",
  },

  quickMethodsCard: {
    minHeight: 0,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "10px",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr) auto",
    gap: "8px",
  },

  quickClassificationCard: {
    minHeight: 0,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "10px",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr)",
    gap: "8px",
  },

  quickSummaryCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "10px",
    display: "grid",
    gap: "6px",
  },

  quickSectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    alignItems: "start",
  },

  quickSectionTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "14px",
    fontWeight: "950",
  },

  quickSectionText: {
    margin: "2px 0 0 0",
    color: "#64748b",
    fontSize: "10.5px",
    lineHeight: 1.25,
  },

  quickSmallBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "10px",
    padding: "6px 8px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "10.5px",
    whiteSpace: "nowrap",
  },

  quickSmallBtnGreen: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "10px",
    padding: "6px 8px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "10.5px",
    whiteSpace: "nowrap",
  },

  quickSearch: {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 9px",
    borderRadius: "11px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "12px",
    minHeight: "34px",
  },

  quickMethodListTable: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "5px",
    paddingRight: "2px",
  },

  quickMethodListRow: {
    display: "grid",
    gridTemplateColumns: "minmax(160px, 1fr) 96px",
    gap: "7px",
    alignItems: "center",
    background: "#fbfbfc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "7px",
  },

  quickMethodListRowActive: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
  },

  methodSelectBtn: {
    border: "none",
    background: "transparent",
    padding: 0,
    display: "flex",
    alignItems: "center",
    gap: "7px",
    cursor: "pointer",
    textAlign: "left",
    minWidth: 0,
  },

  methodDot: {
    width: "11px",
    height: "11px",
    borderRadius: "999px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    flexShrink: 0,
  },

  methodDotActive: {
    width: "11px",
    height: "11px",
    borderRadius: "999px",
    border: "1px solid #22c55e",
    background: "#22c55e",
    flexShrink: 0,
  },

  methodNameList: {
    display: "block",
    color: "#1f2937",
    fontSize: "12px",
    minWidth: 0,
    lineHeight: 1.15,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  quickAmountListInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 8px",
    borderRadius: "10px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    textAlign: "right",
    fontSize: "12px",
    minHeight: "32px",
  },

  quickReferenceListInput: {
    gridColumn: "1 / -1",
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 8px",
    borderRadius: "10px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "11.5px",
    minHeight: "31px",
  },

  quickHint: {
    color: "#64748b",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "6px 8px",
    fontSize: "10.5px",
  },

  quickClassificationListCompact: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "5px",
    paddingRight: "2px",
  },

  classificationListRow: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "#fbfbfc",
    borderRadius: "12px",
    padding: "7px 8px",
    display: "grid",
    gridTemplateColumns: "22px minmax(0, 1fr)",
    alignItems: "center",
    gap: "7px",
    cursor: "pointer",
    textAlign: "left",
  },

  classificationListRowActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  classificationListName: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    color: "#1f2937",
    fontSize: "12px",
    lineHeight: 1.15,
    minWidth: 0,
  },

  quickSummaryLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    alignItems: "center",
    padding: "5px 0",
    borderBottom: "1px solid #edf2f7",
    color: "#64748b",
    fontSize: "11px",
  },

  quickSummaryTags: {
    display: "flex",
    gap: "5px",
    flexWrap: "wrap",
  },

  quickModalFooter: {
    padding: "10px",
    borderTop: "1px solid #e2e8f0",
    background: "#fff",
    display: "flex",
    justifyContent: "flex-end",
    gap: "7px",
    flexWrap: "wrap",
  },

  // ===== SELECTOR SECUNDARIO DE MÉTODOS =====
  quickSelectedMethodsInfo: {
    color: "#64748b",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "6px 8px",
    fontSize: "10.5px",
  },

  innerModalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    zIndex: 9999,
    display: "grid",
    placeItems: "center",
    padding: "16px",
  },

  metodosSelectorBox: {
    width: "min(520px, calc(100vw - 28px))",
    maxHeight: "min(640px, calc(100vh - 28px))",
    background: "#fff",
    borderRadius: "20px",
    border: "1px solid #d7dbe2",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
    padding: "14px",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr) auto",
    gap: "10px",
  },

  metodosSelectorHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "start",
  },

  metodosSelectorList: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "7px",
    paddingRight: "2px",
  },

  metodoSelectorItem: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "#fbfbfc",
    borderRadius: "13px",
    padding: "9px 10px",
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr)",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    textAlign: "left",
  },

  metodoSelectorItemActive: {
    background: "#eef6ff",
    border: "1px solid #93c5fd",
  },

  metodoSelectorName: {
    display: "grid",
    gap: "2px",
    color: "#1f2937",
    fontSize: "12.5px",
    lineHeight: 1.15,
  },

  metodosSelectorFooter: {
    display: "flex",
    justifyContent: "flex-end",
    paddingTop: "4px",
  },
  // ===== AJUSTE FINAL: ALINEACIÓN Y MÉTODOS PERSISTENTES =====
  page: {
    width: "100%",
    minHeight: "100%",
    boxSizing: "border-box",
    background: "#f3f1f6",
    padding: "8px 10px",
  },

  container: {
    width: "100%",
    maxWidth: "none",
    margin: "0",
    display: "grid",
    gap: "12px",
  },

  headerCard: {
    background: "linear-gradient(135deg, #ffffff 0%, #fbf8fd 100%)",
    border: "1px solid #ddd6e6",
    borderRadius: "18px",
    padding: "14px 16px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "12px",
    alignItems: "center",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #dddfe7",
    borderRadius: "18px",
    padding: "14px 16px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.045)",
  },

  quickSelectedMethodsInfo: {
    color: "#64748b",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "6px 8px",
    fontSize: "10.5px",
  },

  quickMethodListTable: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: "5px",
    paddingRight: "2px",
  },

  quickMethodListRow: {
    display: "grid",
    gridTemplateColumns: "minmax(160px, 1fr) 96px",
    gap: "7px",
    alignItems: "center",
    background: "#fbfbfc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "7px",
  },

  quickMethodListRowActive: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
  },

  quickReferenceListInput: {
    gridColumn: "1 / -1",
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 8px",
    borderRadius: "10px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    outline: "none",
    fontSize: "11.5px",
    minHeight: "31px",
  },
  autosaveBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    padding: "6px 10px",
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    fontSize: "12px",
    fontWeight: "900",
    marginLeft: "8px",
  },

};
