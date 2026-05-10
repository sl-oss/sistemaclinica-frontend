import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const modulosPermisos = [
  {
    id: "citas",
    icono: "📅",
    titulo: "Citas",
    descripcion: "Agenda, confirmaciones, reagendar y cancelar citas.",
    permisos: [
      { key: "citas_ver", label: "Ver citas" },
      { key: "citas_crear", label: "Crear citas" },
      { key: "citas_editar", label: "Editar / reagendar citas" },
      { key: "citas_cancelar", label: "Cancelar citas" },
    ],
  },
  {
    id: "ventas",
    icono: "🛒",
    titulo: "Venta",
    descripcion: "Crear ventas, editar registros y eliminar ventas.",
    permisos: [
      { key: "ventas_ver", label: "Ver ventas" },
      { key: "ventas_crear", label: "Crear ventas" },
      { key: "ventas_editar", label: "Editar ventas" },
      { key: "ventas_eliminar", label: "Eliminar ventas" },
    ],
  },
  {
    id: "deudas",
    icono: "📋",
    titulo: "Deudas",
    descripcion: "Ver cuentas por cobrar y registrar cobros.",
    permisos: [
      { key: "deudas_ver", label: "Ver deudas" },
      { key: "deudas_cobrar", label: "Cobrar deudas" },
    ],
  },
  {
    id: "atencion_clinica",
    icono: "🦷",
    titulo: "Atención Clínica",
    descripcion: "Atender pacientes, registrar procedimientos y enviar a CXC.",
    permisos: [
      { key: "atencion_clinica_ver", label: "Ver atención clínica" },
      { key: "atencion_clinica_crear", label: "Crear atención desde citas" },
      { key: "atencion_clinica_editar", label: "Editar detalle de atención" },
      { key: "atencion_clinica_enviar_cobro", label: "Enviar atención a CXC" },
      { key: "reporte_atenciones_cobro_ver", label: "Ver reporte de pacientes enviados a cobro" },
      { key: "reporte_atenciones_cobro_exportar", label: "Exportar / descargar reporte de cobros" },
    ],
  },
  {
    id: "bandeja_notificaciones",
    icono: "🔔",
    titulo: "Bandeja de Notificaciones",
    descripcion: "Controla qué mensajes puede ver cada usuario en la campanita.",
    permisos: [
      { key: "bandeja_notificaciones_ver", label: "Ver campanita / bandeja" },
      { key: "bandeja_notificaciones_leer", label: "Marcar mensajes como leídos" },
      { key: "notif_cita_confirmada_ver", label: "Ver citas confirmadas" },
      { key: "notif_cita_cancelada_ver", label: "Ver citas canceladas" },
      { key: "notif_cita_reagendada_ver", label: "Ver citas reagendadas" },
      { key: "notif_cita_lunes_contacto_ver", label: "Ver solicitudes de lunes" },
      { key: "notif_cita_enviada_cobro_ver", label: "Ver citas enviadas a cobro" },
    ],
  },
  {
    id: "pacientes",
    icono: "👤",
    titulo: "Pacientes",
    descripcion: "Administración de pacientes / clientes.",
    permisos: [
      { key: "pacientes_ver", label: "Ver pacientes" },
      { key: "pacientes_crear", label: "Crear pacientes" },
      { key: "pacientes_editar", label: "Editar pacientes" },
      { key: "pacientes_eliminar", label: "Eliminar pacientes" },
      // compatibilidad con el App actual si aún usa citas_ver para Pacientes
      { key: "citas_ver", label: "Permitir entrada al módulo pacientes" },
    ],
  },
  {
    id: "productos",
    icono: "📦",
    titulo: "Productos",
    descripcion: "Productos, servicios o ítems disponibles para venta.",
    permisos: [
      { key: "inventario_ver", label: "Ver productos" },
      { key: "inventario_editar", label: "Crear / editar productos" },
    ],
  },
  {
    id: "caja_diaria",
    icono: "💲",
    titulo: "Caja Diaria",
    descripcion: "Registro diario, cierres, clasificaciones y reportes de caja.",
    permisos: [
      { key: "caja_ver", label: "Ver caja diaria" },
      { key: "caja_editar", label: "Crear / editar registros de caja" },
      { key: "caja_cerrar", label: "Cerrar caja" },
      { key: "caja_exportar", label: "Exportar reportes de caja" },
    ],
  },
  {
    id: "caja_chica",
    icono: "💵",
    titulo: "Caja Chica",
    descripcion: "Gastos, salidas y control de caja chica.",
    permisos: [
      { key: "caja_chica_ver", label: "Ver caja chica" },
      { key: "caja_chica_crear", label: "Crear movimientos" },
      { key: "caja_chica_editar", label: "Editar movimientos" },
      { key: "caja_chica_eliminar", label: "Eliminar movimientos" },
    ],
  },
  {
    id: "metodos_cobro",
    icono: "💱",
    titulo: "Métodos de Cobro",
    descripcion: "Efectivo, reserva, tarjeta, transferencia y otros métodos.",
    permisos: [
      { key: "metodos_cobro_ver", label: "Ver métodos de cobro" },
      { key: "metodos_cobro_editar", label: "Crear / editar métodos de cobro" },
      // compatibilidad con App actual
      { key: "configuracion_ver", label: "Permitir entrada a configuración" },
      { key: "configuracion_editar", label: "Editar configuración" },
    ],
  },
  {
    id: "clasificaciones",
    icono: "🏷️",
    titulo: "Clasificación de Pacientes",
    descripcion: "Tipos de paciente y comisión por clasificación.",
    permisos: [
      { key: "clasificaciones_ver", label: "Ver clasificaciones" },
      { key: "clasificaciones_crear", label: "Crear clasificaciones" },
      { key: "clasificaciones_editar", label: "Editar clasificaciones" },
      { key: "clasificaciones_eliminar", label: "Eliminar clasificaciones" },
      // compatibilidad con App actual
      { key: "configuracion_ver", label: "Permitir entrada a configuración" },
      { key: "configuracion_editar", label: "Editar configuración" },
    ],
  },
  {
    id: "empleados_comision",
    icono: "👥",
    titulo: "Empleados Comisión",
    descripcion: "Empleados que aparecen en reportes de comisiones.",
    permisos: [
      { key: "empleados_comision_ver", label: "Ver empleados comisión" },
      { key: "empleados_comision_crear", label: "Crear empleados comisión" },
      { key: "empleados_comision_editar", label: "Editar empleados comisión" },
      { key: "empleados_comision_eliminar", label: "Eliminar empleados comisión" },
      // compatibilidad con App actual
      { key: "configuracion_ver", label: "Permitir entrada a configuración" },
      { key: "configuracion_editar", label: "Editar configuración" },
    ],
  },
  {
    id: "reportes",
    icono: "📊",
    titulo: "Reportes",
    descripcion: "Reportes generales, caja, ventas, citas y comisiones.",
    permisos: [
      { key: "reportes_ver", label: "Ver reportes" },
      { key: "reportes_exportar", label: "Exportar reportes" },
    ],
  },
  {
    id: "usuarios",
    icono: "🔐",
    titulo: "Usuarios / Accesos",
    descripcion: "Invitar usuarios, permisos y empresas asignadas.",
    permisos: [
      { key: "usuarios_ver", label: "Ver usuarios" },
      { key: "usuarios_invitar", label: "Invitar usuarios" },
      { key: "usuarios_editar", label: "Editar accesos" },
    ],
  },
];

const permisosBase = modulosPermisos.flatMap((modulo) =>
  modulo.permisos.map((permiso) => ({
    ...permiso,
    grupo: modulo.titulo,
    moduloId: modulo.id,
  }))
);

const permisosAdmin = permisosBase.reduce((acc, p) => {
  acc[p.key] = true;
  return acc;
}, {});

const permisosColaborador = {
  citas_ver: true,
  citas_crear: true,
  citas_editar: true,
  citas_cancelar: false,

  ventas_ver: true,
  ventas_crear: true,
  ventas_editar: false,
  ventas_eliminar: false,

  deudas_ver: true,
  deudas_cobrar: true,

  atencion_clinica_ver: true,
  atencion_clinica_crear: true,
  atencion_clinica_editar: true,
  atencion_clinica_enviar_cobro: true,
  reporte_atenciones_cobro_ver: false,
  reporte_atenciones_cobro_exportar: false,

  bandeja_notificaciones_ver: true,
  bandeja_notificaciones_leer: true,
  notif_cita_confirmada_ver: true,
  notif_cita_cancelada_ver: true,
  notif_cita_reagendada_ver: true,
  notif_cita_lunes_contacto_ver: true,
  notif_cita_enviada_cobro_ver: false,

  pacientes_ver: true,
  pacientes_crear: true,
  pacientes_editar: false,
  pacientes_eliminar: false,

  inventario_ver: true,
  inventario_editar: false,

  caja_ver: true,
  caja_editar: false,
  caja_cerrar: false,
  caja_exportar: false,

  caja_chica_ver: false,
  caja_chica_crear: false,
  caja_chica_editar: false,
  caja_chica_eliminar: false,

  metodos_cobro_ver: false,
  metodos_cobro_editar: false,

  clasificaciones_ver: false,
  clasificaciones_crear: false,
  clasificaciones_editar: false,
  clasificaciones_eliminar: false,

  empleados_comision_ver: false,
  empleados_comision_crear: false,
  empleados_comision_editar: false,
  empleados_comision_eliminar: false,

  reportes_ver: false,
  reportes_exportar: false,

  configuracion_ver: false,
  configuracion_editar: false,

  usuarios_ver: false,
  usuarios_invitar: false,
  usuarios_editar: false,
};

function generarToken() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function UsuariosAccesos() {
  const empresaActiva = JSON.parse(localStorage.getItem("empresa") || "null");
  const rolActivo = localStorage.getItem("rol") || "";
  const permisosActivos = JSON.parse(localStorage.getItem("permisos") || "{}");

  const [empresas, setEmpresas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);

  const [email, setEmail] = useState("");
  const [nombreMostrar, setNombreMostrar] = useState("");
  const [codigoUsuario, setCodigoUsuario] = useState("");
  const [rol, setRol] = useState("colaborador");
  const [empresasSeleccionadas, setEmpresasSeleccionadas] = useState([]);
  const [permisos, setPermisos] = useState(permisosColaborador);

  const [mostrarEmpresas, setMostrarEmpresas] = useState(false);
  const [busquedaUsuarios, setBusquedaUsuarios] = useState("");
  const [editandoInvitacionId, setEditandoInvitacionId] = useState(null);
  const [editandoUsuarioId, setEditandoUsuarioId] = useState(null);
  const [modulosAbiertos, setModulosAbiertos] = useState(() => ({
    citas: true,
    ventas: false,
    deudas: false,
    atencion_clinica: true,
    bandeja_notificaciones: true,
    pacientes: false,
    productos: false,
    caja_diaria: true,
    caja_chica: false,
    metodos_cobro: false,
    clasificaciones: true,
    empleados_comision: true,
    reportes: false,
    usuarios: false,
  }));

  const [loading, setLoading] = useState(false);
  const [cargando, setCargando] = useState(true);

  const puedeAdministrar =
    rolActivo === "owner" ||
    rolActivo === "propietario" ||
    rolActivo === "admin" ||
    permisosActivos?.usuarios_invitar ||
    permisosActivos?.usuarios_editar;

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    if (rol === "admin") {
      setPermisos(permisosAdmin);
    } else {
      setPermisos(permisosColaborador);
    }
  }, [rol]);

  const cargarDatos = async () => {
    setCargando(true);

    try {
      await Promise.all([cargarEmpresas(), cargarUsuarios(), cargarInvitaciones()]);
    } finally {
      setCargando(false);
    }
  };

  const cargarEmpresas = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    if (!userId) {
      setEmpresas([]);
      return;
    }

    const { data, error } = await supabase
      .from("empresa_usuarios")
      .select(`
        id,
        empresa_id,
        rol,
        activo,
        empresas (
          id,
          nombre,
          owner_user_id
        )
      `)
      .eq("user_id", userId)
      .eq("activo", true);

    if (error) {
      console.error(error);
      alert("Error al cargar empresas disponibles");
      return;
    }

    const empresasDisponibles = (data || [])
      .filter((m) => m.empresas)
      .map((m) => m.empresas);

    setEmpresas(empresasDisponibles);

    if (empresasDisponibles.length === 1) {
      setEmpresasSeleccionadas([empresasDisponibles[0].id]);
    } else if (empresaActiva?.id) {
      setEmpresasSeleccionadas([empresaActiva.id]);
    }
  };

  const cargarUsuarios = async () => {
    if (!empresaActiva?.id) return;

    const { data, error } = await supabase
      .from("empresa_usuarios")
      .select(`
        id,
        empresa_id,
        user_id,
        codigo_usuario,
        nombre_mostrar,
        rol,
        permisos,
        activo,
        created_at,
        empresas (
          id,
          nombre
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("Error al cargar usuarios");
      return;
    }

    setUsuarios(data || []);
  };

  const cargarInvitaciones = async () => {
    if (!empresaActiva?.id) return;

    const { data, error } = await supabase
      .from("empresa_invitaciones")
      .select(`
        id,
        empresa_id,
        email,
        codigo_usuario,
        nombre_mostrar,
        rol,
        permisos,
        token,
        estado,
        created_at,
        accepted_at,
        empresas (
          id,
          nombre
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("Error al cargar invitaciones");
      return;
    }

    setInvitaciones(data || []);
  };

  const toggleEmpresa = (empresaId) => {
    setEmpresasSeleccionadas((prev) => {
      if (prev.includes(empresaId)) {
        const nuevas = prev.filter((id) => id !== empresaId);
        return nuevas.length > 0 ? nuevas : prev;
      }
      return [...prev, empresaId];
    });
  };

  const seleccionarSoloActiva = () => {
    if (!empresaActiva?.id) return;
    setEmpresasSeleccionadas([empresaActiva.id]);
  };

  const seleccionarTodasEmpresas = () => {
    setEmpresasSeleccionadas(empresas.map((e) => e.id));
  };

  const toggleModulo = (moduloId) => {
    setModulosAbiertos((prev) => ({
      ...prev,
      [moduloId]: !prev[moduloId],
    }));
  };

  const togglePermiso = (key) => {
    setPermisos((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const marcarModulo = (modulo, valor) => {
    setPermisos((prev) => {
      const nuevo = { ...prev };
      modulo.permisos.forEach((p) => {
        nuevo[p.key] = valor;
      });
      return nuevo;
    });
  };

  const limpiarFormulario = () => {
    setEmail("");
    setNombreMostrar("");
    setCodigoUsuario("");
    setRol("colaborador");
    setPermisos(permisosColaborador);
    setEmpresasSeleccionadas(empresaActiva?.id ? [empresaActiva.id] : []);
    setMostrarEmpresas(false);
    setEditandoInvitacionId(null);
    setEditandoUsuarioId(null);
  };

  const guardarInvitacion = async () => {
    if (!puedeAdministrar) {
      return alert("No tienes permiso para invitar usuarios");
    }

    if (!email.trim()) {
      return alert("Ingresa el correo del usuario");
    }

    if (empresasSeleccionadas.length === 0) {
      return alert("Selecciona al menos una empresa");
    }

    setLoading(true);

    const invitacionesParaGuardar = empresasSeleccionadas.map((empresaId) => ({
      empresa_id: empresaId,
      email: email.trim().toLowerCase(),
      codigo_usuario: codigoUsuario.trim() || null,
      nombre_mostrar: nombreMostrar.trim() || email.trim().toLowerCase(),
      rol,
      permisos,
      token: generarToken(),
      estado: "pendiente",
    }));

    let error = null;

    for (const invitacion of invitacionesParaGuardar) {
      const { data: existente, error: errorBuscar } = await supabase
        .from("empresa_invitaciones")
        .select("id")
        .eq("empresa_id", invitacion.empresa_id)
        .ilike("email", invitacion.email)
        .maybeSingle();

      if (errorBuscar) {
        error = errorBuscar;
        break;
      }

      if (existente?.id) {
        const { error: errorUpdate } = await supabase
          .from("empresa_invitaciones")
          .update({
            codigo_usuario: invitacion.codigo_usuario,
            nombre_mostrar: invitacion.nombre_mostrar,
            rol: invitacion.rol,
            permisos: invitacion.permisos,
            token: invitacion.token,
            estado: "pendiente",
            accepted_at: null,
            accepted_by: null,
          })
          .eq("id", existente.id);

        if (errorUpdate) {
          error = errorUpdate;
          break;
        }
      } else {
        const { error: errorInsert } = await supabase
          .from("empresa_invitaciones")
          .insert([invitacion]);

        if (errorInsert) {
          error = errorInsert;
          break;
        }
      }
    }

    setLoading(false);

    if (error) {
      console.error(error);
      return alert("No se pudo guardar o actualizar la invitación");
    }

    alert("Invitación guardada correctamente. Si ya existía, se actualizó.");
    limpiarFormulario();
    await cargarInvitaciones();
  };

  const cargarInvitacionEnFormulario = (invitacion) => {
    if (!puedeAdministrar) return alert("No tienes permiso para editar invitaciones");

    setEditandoInvitacionId(invitacion.id);
    setEditandoUsuarioId(null);
    setEmail(invitacion.email || "");
    setNombreMostrar(invitacion.nombre_mostrar || "");
    setCodigoUsuario(invitacion.codigo_usuario || "");
    setRol(invitacion.rol || "colaborador");
    setPermisos(invitacion.permisos || permisosColaborador);
    setEmpresasSeleccionadas([invitacion.empresa_id]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cargarUsuarioEnFormulario = (usuario) => {
    if (!puedeAdministrar) return alert("No tienes permiso para editar usuarios");

    if (usuario.rol === "owner" && rolActivo !== "owner") {
      return alert("Solo el Owner puede editar otro Owner");
    }

    setEditandoUsuarioId(usuario.id);
    setEditandoInvitacionId(null);
    setEmail("");
    setNombreMostrar(usuario.nombre_mostrar || "");
    setCodigoUsuario(usuario.codigo_usuario || "");
    setRol(usuario.rol || "colaborador");
    setPermisos(usuario.permisos || permisosColaborador);
    setEmpresasSeleccionadas([usuario.empresa_id]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const guardarCambiosUsuario = async () => {
    if (!puedeAdministrar) return alert("No tienes permiso para editar usuarios");
    if (!editandoUsuarioId) return;

    const usuarioActual = usuarios.find((u) => u.id === editandoUsuarioId);

    if (usuarioActual?.rol === "owner" && rolActivo !== "owner") {
      return alert("Solo el Owner puede modificar otro Owner");
    }

    if (usuarioActual?.rol === "owner" && rol !== "owner") {
      const confirmar = window.confirm("Estás cambiando un Owner a otro rol. ¿Seguro?");
      if (!confirmar) return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("empresa_usuarios")
      .update({
        codigo_usuario: codigoUsuario.trim() || null,
        nombre_mostrar: nombreMostrar.trim() || usuarioActual?.nombre_mostrar || "Usuario",
        rol,
        permisos,
      })
      .eq("id", editandoUsuarioId);

    setLoading(false);

    if (error) {
      console.error(error);
      return alert("No se pudo actualizar el usuario");
    }

    alert("Usuario actualizado correctamente");
    limpiarFormulario();
    await cargarUsuarios();
  };

  const eliminarInvitacion = async (invitacion) => {
    if (!puedeAdministrar) return alert("No tienes permiso para eliminar invitaciones");

    const confirmar = window.confirm(`¿Eliminar la invitación de ${invitacion.email}?`);
    if (!confirmar) return;

    const { error } = await supabase
      .from("empresa_invitaciones")
      .delete()
      .eq("id", invitacion.id);

    if (error) {
      console.error(error);
      return alert("No se pudo eliminar la invitación");
    }

    if (editandoInvitacionId === invitacion.id) limpiarFormulario();
    await cargarInvitaciones();
  };

  const eliminarUsuarioAcceso = async (usuario) => {
    if (!puedeAdministrar) return alert("No tienes permiso para eliminar usuarios");

    if (usuario.rol === "owner") {
      return alert("No se puede eliminar un acceso Owner desde aquí");
    }

    const confirmar = window.confirm(
      `¿Eliminar el acceso de ${usuario.nombre_mostrar || usuario.codigo_usuario || usuario.user_id} a ${usuario.empresas?.nombre || "esta empresa"}?`
    );

    if (!confirmar) return;

    const { error } = await supabase
      .from("empresa_usuarios")
      .delete()
      .eq("id", usuario.id);

    if (error) {
      console.error(error);
      return alert("No se pudo eliminar el acceso");
    }

    if (editandoUsuarioId === usuario.id) limpiarFormulario();
    await cargarUsuarios();
  };

  const aplicarAccesoManual = async (invitacion) => {
    const userId = prompt(
      `Pega el user_id de Supabase Auth para:\n${invitacion.email}\n\nLo encuentras en Supabase > Authentication > Users`
    );

    if (!userId || !userId.trim()) return;

    const { error: errorInsert } = await supabase
      .from("empresa_usuarios")
      .insert([
        {
          empresa_id: invitacion.empresa_id,
          user_id: userId.trim(),
          codigo_usuario: invitacion.codigo_usuario || null,
          nombre_mostrar: invitacion.nombre_mostrar || invitacion.email,
          rol: invitacion.rol || "colaborador",
          permisos: invitacion.permisos || {},
          activo: true,
        },
      ]);

    if (errorInsert) {
      console.error(errorInsert);
      if (errorInsert.code === "23505") {
        return alert("Ese usuario ya tiene acceso a esa empresa");
      }
      return alert("No se pudo asignar el acceso");
    }

    const { error: errorUpdate } = await supabase
      .from("empresa_invitaciones")
      .update({
        estado: "aceptada",
        accepted_by: userId.trim(),
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitacion.id);

    if (errorUpdate) {
      console.error(errorUpdate);
      alert("El acceso se creó, pero no se pudo actualizar la invitación");
    }

    alert("Acceso asignado correctamente");
    await cargarDatos();
  };

  const cambiarActivoUsuario = async (usuario) => {
    if (!puedeAdministrar) {
      return alert("No tienes permiso para editar usuarios");
    }

    const { error } = await supabase
      .from("empresa_usuarios")
      .update({ activo: !usuario.activo })
      .eq("id", usuario.id);

    if (error) {
      console.error(error);
      return alert("No se pudo actualizar el usuario");
    }

    await cargarUsuarios();
  };

  const usuariosFiltrados = useMemo(() => {
    const ids = new Set(empresas.map((e) => e.id));
    const texto = busquedaUsuarios.trim().toLowerCase();

    return usuarios
      .filter((u) => ids.has(u.empresa_id))
      .filter((u) => {
        if (!texto) return true;
        return [
          u.nombre_mostrar,
          u.codigo_usuario,
          u.rol,
          u.empresas?.nombre,
          u.user_id,
        ]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(texto));
      });
  }, [usuarios, empresas, busquedaUsuarios]);

  const invitacionesFiltradas = useMemo(() => {
    const ids = new Set(empresas.map((e) => e.id));
    const texto = busquedaUsuarios.trim().toLowerCase();

    return invitaciones
      .filter((i) => ids.has(i.empresa_id))
      .filter((i) => {
        if (!texto) return true;
        return [i.email, i.nombre_mostrar, i.codigo_usuario, i.rol, i.empresas?.nombre, i.estado]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(texto));
      });
  }, [invitaciones, empresas, busquedaUsuarios]);

  const empresasSeleccionadasTexto = useMemo(() => {
    const seleccionadas = empresas.filter((e) => empresasSeleccionadas.includes(e.id));
    if (seleccionadas.length === 0) return "Seleccionar empresas";
    if (seleccionadas.length === 1) return seleccionadas[0].nombre;
    return `${seleccionadas.length} empresas seleccionadas`;
  }, [empresas, empresasSeleccionadas]);

  const totales = useMemo(() => {
    return {
      empresas: empresas.length,
      usuariosActivos: usuariosFiltrados.filter((u) => u.activo).length,
      usuariosInactivos: usuariosFiltrados.filter((u) => !u.activo).length,
      invitacionesPendientes: invitacionesFiltradas.filter((i) => i.estado === "pendiente").length,
    };
  }, [empresas.length, usuariosFiltrados, invitacionesFiltradas]);

  if (!empresaActiva) {
    return <div style={styles.empty}>No hay empresa seleccionada.</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <span style={styles.eyebrow}>Panel de seguridad</span>
          <h1 style={styles.title}>Usuarios / Accesos</h1>
          <p style={styles.subtitle}>
            Invitá usuarios, asigná empresas y controlá permisos por cada módulo del sistema.
          </p>
        </div>

        <div style={styles.heroInfo}>
          <div style={styles.heroCompany}>{empresaActiva?.nombre || "Empresa activa"}</div>
          <div style={styles.heroRole}>Rol actual: {rolActivo || "sin rol"}</div>
        </div>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span>Empresas</span>
          <strong>{totales.empresas}</strong>
        </div>
        <div style={styles.statCard}>
          <span>Usuarios activos</span>
          <strong>{totales.usuariosActivos}</strong>
        </div>
        <div style={styles.statCard}>
          <span>Inactivos</span>
          <strong>{totales.usuariosInactivos}</strong>
        </div>
        <div style={styles.statCard}>
          <span>Invitaciones pendientes</span>
          <strong>{totales.invitacionesPendientes}</strong>
        </div>
      </div>

      {!puedeAdministrar && (
        <div style={styles.warnBox}>
          Tu usuario no tiene permisos para administrar accesos. Puedes ver la información, pero no modificarla.
        </div>
      )}

      <div style={styles.mainGrid}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Preparar acceso</h3>
              <p style={styles.sectionSubtitle}>
                Definí correo, rol, empresas y permisos. También podés editar usuarios o invitaciones existentes.
              </p>
            </div>
          </div>

          <div style={styles.formGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Correo</label>
              <input
                style={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@correo.com"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Nombre a mostrar</label>
              <input
                style={styles.input}
                value={nombreMostrar}
                onChange={(e) => setNombreMostrar(e.target.value)}
                placeholder="Ej: Dra. Ana / Recepción"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Código usuario</label>
              <input
                style={styles.input}
                value={codigoUsuario}
                onChange={(e) => setCodigoUsuario(e.target.value)}
                placeholder="Ej: USER001"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Rol</label>
              <select
                style={styles.input}
                value={rol}
                onChange={(e) => setRol(e.target.value)}
              >
                {rolActivo === "owner" && <option value="owner">Owner</option>}
                {(rolActivo === "owner" || rolActivo === "propietario") && (
                  <option value="propietario">Propietario</option>
                )}
                <option value="admin">Admin</option>
                <option value="colaborador">Colaborador</option>
              </select>
            </div>
          </div>

          <div style={styles.subSection}>
            <div style={styles.sectionLine}>
              <div>
                <h4 style={styles.miniTitle}>Empresas con acceso</h4>
                <p style={styles.helperText}>Puede tener acceso a una o varias empresas.</p>
              </div>

              <div style={styles.smallActions}>
                <button type="button" style={styles.miniBtn} onClick={seleccionarSoloActiva}>
                  Solo activa
                </button>
                <button type="button" style={styles.miniBtn} onClick={seleccionarTodasEmpresas}>
                  Todas
                </button>
              </div>
            </div>

            <div style={styles.multiSelectWrap}>
              <button
                type="button"
                style={styles.multiSelectButton}
                onClick={() => setMostrarEmpresas((prev) => !prev)}
              >
                <span>{empresasSeleccionadasTexto}</span>
                <span>{mostrarEmpresas ? "▴" : "▾"}</span>
              </button>

              {mostrarEmpresas && (
                <div style={styles.multiSelectMenu}>
                  {empresas.map((empresa) => {
                    const checked = empresasSeleccionadas.includes(empresa.id);
                    return (
                      <label
                        key={empresa.id}
                        style={{
                          ...styles.multiSelectOption,
                          ...(checked ? styles.multiSelectOptionActive : {}),
                        }}
                      >
                        <span style={styles.fakeCheck}>{checked ? "✓" : ""}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEmpresa(empresa.id)}
                          style={{ display: "none" }}
                        />
                        <span>{empresa.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={styles.actions}>
            <button
              type="button"
              style={{
                ...styles.primaryBtn,
                ...(!puedeAdministrar || loading ? styles.disabledBtn : {}),
              }}
              onClick={editandoUsuarioId ? guardarCambiosUsuario : guardarInvitacion}
              disabled={loading || !puedeAdministrar}
            >
              {loading
                ? "Guardando..."
                : editandoUsuarioId
                ? "Guardar cambios de usuario"
                : editandoInvitacionId
                ? "Actualizar invitación"
                : "Guardar invitación"}
            </button>

            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={limpiarFormulario}
            >
              Limpiar
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Permisos por módulo</h3>
              <p style={styles.sectionSubtitle}>
                Abrí cada módulo y marcá exactamente qué podrá usar.
              </p>
            </div>
          </div>

          <div style={styles.modulesList}>
            {modulosPermisos.map((modulo) => {
              const totalModulo = modulo.permisos.length;
              const marcados = modulo.permisos.filter((p) => permisos[p.key]).length;
              const abierto = Boolean(modulosAbiertos[modulo.id]);

              return (
                <div key={modulo.id} style={styles.moduleCard}>
                  <button
                    type="button"
                    style={styles.moduleHeader}
                    onClick={() => toggleModulo(modulo.id)}
                  >
                    <div style={styles.moduleHeaderLeft}>
                      <span style={styles.moduleIcon}>{modulo.icono}</span>
                      <div>
                        <div style={styles.moduleTitle}>{modulo.titulo}</div>
                        <div style={styles.moduleDesc}>{modulo.descripcion}</div>
                      </div>
                    </div>

                    <div style={styles.moduleHeaderRight}>
                      <span style={styles.moduleCount}>{marcados}/{totalModulo}</span>
                      <span>{abierto ? "▴" : "▾"}</span>
                    </div>
                  </button>

                  {abierto && (
                    <div style={styles.moduleBody}>
                      <div style={styles.moduleActions}>
                        <button type="button" style={styles.tinyBtn} onClick={() => marcarModulo(modulo, true)}>
                          Marcar todo
                        </button>
                        <button type="button" style={styles.tinyBtn} onClick={() => marcarModulo(modulo, false)}>
                          Quitar todo
                        </button>
                      </div>

                      <div style={styles.permissionsList}>
                        {modulo.permisos.map((permiso) => (
                          <label key={permiso.key} style={styles.switchRow}>
                            <span>{permiso.label}</span>
                            <input
                              type="checkbox"
                              checked={Boolean(permisos[permiso.key])}
                              onChange={() => togglePermiso(permiso.key)}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={styles.searchCard}>
        <input
          style={styles.searchInput}
          value={busquedaUsuarios}
          onChange={(e) => setBusquedaUsuarios(e.target.value)}
          placeholder="Buscar usuario, empresa, rol, estado o código..."
        />
      </div>

      <div style={styles.twoCols}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Usuarios asignados</h3>
              <p style={styles.sectionSubtitle}>
                Accesos creados en empresa_usuarios.
              </p>
            </div>
          </div>

          {cargando ? (
            <div style={styles.emptyMini}>Cargando...</div>
          ) : usuariosFiltrados.length === 0 ? (
            <div style={styles.emptyMini}>No hay usuarios asignados.</div>
          ) : (
            <div style={styles.list}>
              {usuariosFiltrados.map((u) => (
                <div key={u.id} style={styles.userCard}>
                  <div style={styles.avatarCircle}>
                    {(u.nombre_mostrar || u.codigo_usuario || "U").slice(0, 1).toUpperCase()}
                  </div>

                  <div style={styles.userMain}>
                    <strong style={styles.userName}>
                      {u.nombre_mostrar || u.codigo_usuario || u.user_id}
                    </strong>
                    <div style={styles.userText}>
                      {u.empresas?.nombre || "Empresa"} · Rol: {u.rol}
                    </div>
                    <div style={styles.userText}>
                      Código: {u.codigo_usuario || "-"}
                    </div>
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      type="button"
                      style={styles.editBtn}
                      onClick={() => cargarUsuarioEnFormulario(u)}
                      disabled={!puedeAdministrar}
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      style={u.activo ? styles.disableBtn : styles.enableBtn}
                      onClick={() => cambiarActivoUsuario(u)}
                      disabled={!puedeAdministrar || u.rol === "owner"}
                      title={u.rol === "owner" ? "No se puede desactivar al Owner" : ""}
                    >
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>

                    <button
                      type="button"
                      style={styles.deleteSmallBtn}
                      onClick={() => eliminarUsuarioAcceso(u)}
                      disabled={!puedeAdministrar || u.rol === "owner"}
                      title={u.rol === "owner" ? "No se puede eliminar al Owner" : ""}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Invitaciones pendientes</h3>
              <p style={styles.sectionSubtitle}>
                Luego de crear el usuario en Supabase Auth, aplicá el acceso con su user_id.
              </p>
            </div>
          </div>

          {cargando ? (
            <div style={styles.emptyMini}>Cargando...</div>
          ) : invitacionesFiltradas.length === 0 ? (
            <div style={styles.emptyMini}>No hay invitaciones.</div>
          ) : (
            <div style={styles.list}>
              {invitacionesFiltradas.map((inv) => (
                <div key={inv.id} style={styles.userCard}>
                  <div style={styles.avatarCircle}>
                    {(inv.nombre_mostrar || inv.email || "I").slice(0, 1).toUpperCase()}
                  </div>

                  <div style={styles.userMain}>
                    <strong style={styles.userName}>{inv.email}</strong>
                    <div style={styles.userText}>
                      {inv.empresas?.nombre || "Empresa"} · Rol: {inv.rol}
                    </div>
                    <div style={styles.userText}>
                      Estado: {inv.estado}
                    </div>
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      type="button"
                      style={styles.editBtn}
                      onClick={() => cargarInvitacionEnFormulario(inv)}
                      disabled={!puedeAdministrar}
                    >
                      Editar
                    </button>

                    {inv.estado === "pendiente" && (
                      <button
                        type="button"
                        style={styles.primarySmallBtn}
                        onClick={() => aplicarAccesoManual(inv)}
                        disabled={!puedeAdministrar}
                      >
                        Aplicar acceso
                      </button>
                    )}

                    <button
                      type="button"
                      style={styles.deleteSmallBtn}
                      onClick={() => eliminarInvitacion(inv)}
                      disabled={!puedeAdministrar}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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

  hero: {
    background: "linear-gradient(135deg, #ffffff 0%, #f7f2fa 100%)",
    border: "1px solid #d7dbe2",
    borderRadius: "26px",
    padding: "26px",
    display: "flex",
    justifyContent: "space-between",
    gap: "18px",
    flexWrap: "wrap",
    boxShadow: "0 14px 40px rgba(15, 23, 42, 0.08)",
  },

  eyebrow: {
    display: "inline-flex",
    background: "#f4f0f7",
    color: "#6b5a7a",
    border: "1px solid #d3c7dd",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: "800",
    marginBottom: "10px",
  },

  title: {
    margin: 0,
    color: "#4f3f5f",
    fontSize: "34px",
    fontWeight: "900",
    letterSpacing: "-0.03em",
  },

  subtitle: {
    margin: "8px 0 0 0",
    color: "#64748b",
    fontSize: "15px",
    maxWidth: "680px",
  },

  heroInfo: {
    minWidth: "240px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "16px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    height: "fit-content",
  },

  heroCompany: {
    color: "#1f2937",
    fontWeight: "900",
    fontSize: "16px",
  },

  heroRole: {
    color: "#64748b",
    fontSize: "13px",
    marginTop: "6px",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "12px",
  },

  statCard: {
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "20px",
    padding: "16px",
    display: "grid",
    gap: "6px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #d7dbe2",
    borderRadius: "24px",
    padding: "20px",
    boxShadow: "0 12px 34px rgba(15, 23, 42, 0.06)",
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 0.9fr) minmax(420px, 1.1fr)",
    gap: "18px",
    alignItems: "start",
  },

  cardHeader: {
    marginBottom: "16px",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "21px",
    color: "#1f2937",
    fontWeight: "900",
  },

  sectionSubtitle: {
    margin: "5px 0 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "12px",
  },

  formGroup: {
    display: "grid",
    gap: "6px",
  },

  label: {
    fontSize: "13px",
    color: "#4b5f78",
    fontWeight: "700",
  },

  input: {
    width: "100%",
    padding: "12px 13px",
    borderRadius: "14px",
    border: "1px solid #cfd9e5",
    background: "#fff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: "14px",
  },

  subSection: {
    marginTop: "18px",
  },

  sectionLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: "10px",
  },

  miniTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "16px",
    fontWeight: "900",
  },

  helperText: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: "12px",
  },

  smallActions: {
    display: "flex",
    gap: "8px",
  },

  miniBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "10px",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "12px",
  },

  multiSelectWrap: {
    position: "relative",
    zIndex: 40,
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
  },

  multiSelectMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    right: 0,
    zIndex: 100,
    maxHeight: "260px",
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

  fakeCheck: {
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

  modulesList: {
    display: "grid",
    gap: "10px",
  },

  moduleCard: {
    border: "1px solid #d7dbe2",
    borderRadius: "18px",
    background: "#fbfbfc",
    overflow: "hidden",
  },

  moduleHeader: {
    width: "100%",
    border: "none",
    background: "#fff",
    padding: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    cursor: "pointer",
    textAlign: "left",
  },

  moduleHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
  },

  moduleIcon: {
    width: "40px",
    height: "40px",
    borderRadius: "14px",
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },

  moduleTitle: {
    color: "#1f2937",
    fontSize: "15px",
    fontWeight: "900",
  },

  moduleDesc: {
    color: "#64748b",
    fontSize: "12px",
    marginTop: "3px",
  },

  moduleHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "#574866",
    fontWeight: "900",
  },

  moduleCount: {
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "12px",
  },

  moduleBody: {
    padding: "12px 14px 14px",
    borderTop: "1px solid #edf2f7",
  },

  moduleActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginBottom: "10px",
  },

  tinyBtn: {
    background: "#fff",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "9px",
    padding: "6px 8px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "11px",
  },

  permissionsList: {
    display: "grid",
    gap: "2px",
  },

  switchRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
    padding: "8px 0",
    borderTop: "1px solid #edf2f7",
    color: "#334155",
    fontSize: "14px",
    fontWeight: "650",
  },

  actions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "18px",
  },

  primaryBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: "850",
  },

  secondaryBtn: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "14px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: "850",
  },

  disabledBtn: {
    opacity: 0.6,
    cursor: "not-allowed",
  },

  warnBox: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: "16px",
    padding: "14px 16px",
    fontWeight: "800",
  },

  searchCard: {
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "20px",
    padding: "14px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  },

  searchInput: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid #cfd9e5",
    outline: "none",
    boxSizing: "border-box",
  },

  twoCols: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: "18px",
  },

  list: {
    display: "grid",
    gap: "10px",
  },

  userCard: {
    display: "grid",
    gridTemplateColumns: "44px minmax(180px, 1fr) auto",
    gap: "12px",
    alignItems: "center",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "14px",
    background: "#fff",
  },

  avatarCircle: {
    width: "44px",
    height: "44px",
    borderRadius: "14px",
    background: "#f4f0f7",
    color: "#574866",
    display: "grid",
    placeItems: "center",
    fontWeight: "900",
    border: "1px solid #d3c7dd",
  },

  userMain: {
    minWidth: 0,
  },

  userName: {
    color: "#1f2937",
    fontSize: "15px",
    wordBreak: "break-word",
  },

  userText: {
    color: "#64748b",
    fontSize: "13px",
    marginTop: "4px",
    wordBreak: "break-word",
  },


  cardActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  editBtn: {
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "12px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: "800",
  },

  deleteSmallBtn: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "12px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: "800",
  },


  disableBtn: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: "12px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: "800",
  },

  enableBtn: {
    background: "#eefcf3",
    color: "#0f7a4d",
    border: "1px solid #c7eed5",
    borderRadius: "12px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: "800",
  },

  primarySmallBtn: {
    background: "#6b5a7a",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: "800",
  },

  empty: {
    background: "#fff",
    border: "1px solid #d7dbe2",
    borderRadius: "18px",
    padding: "20px",
    color: "#64748b",
  },

  emptyMini: {
    padding: "14px",
    color: "#64748b",
    background: "#f8fafc",
    borderRadius: "14px",
    border: "1px solid #e2e8f0",
  },
};

export default UsuariosAccesos;
