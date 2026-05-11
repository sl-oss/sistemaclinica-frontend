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
      // Nota: pacientes usa "pacientes_ver". No repetimos "citas_ver" para evitar keys duplicadas.
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
      // Nota: no repetimos configuracion_ver/configuracion_editar para evitar keys duplicadas.
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
      // Nota: no repetimos configuracion_ver/configuracion_editar para evitar keys duplicadas.
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
      // Nota: no repetimos configuracion_ver/configuracion_editar para evitar keys duplicadas.
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

const permisosBase = Array.from(
  new Map(
    modulosPermisos
      .flatMap((modulo) =>
        modulo.permisos.map((permiso) => ({
          ...permiso,
          grupo: modulo.titulo,
          moduloId: modulo.id,
        }))
      )
      .map((permiso) => [permiso.key, permiso])
  ).values()
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


function completarPermisos(permisosGuardados = {}, valorDefecto = false) {
  const completos = {};

  permisosBase.forEach((permiso) => {
    completos[permiso.key] = Boolean(
      Object.prototype.hasOwnProperty.call(permisosGuardados || {}, permiso.key)
        ? permisosGuardados[permiso.key]
        : valorDefecto
    );
  });

  return completos;
}

function permisosVaciosGlobal() {
  return completarPermisos({}, false);
}

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
  const [permisos, setPermisos] = useState(() => completarPermisos(permisosColaborador, false));

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

  const [moduloPermisosActivo, setModuloPermisosActivo] = useState(null);
  const [usuarioDetalleActivo, setUsuarioDetalleActivo] = useState(null);
  const [invitacionDetalleActiva, setInvitacionDetalleActiva] = useState(null);

  const [loading, setLoading] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [debugGuardadoPermisos, setDebugGuardadoPermisos] = useState("");

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
    if (editandoUsuarioId || editandoInvitacionId) return;

    if (rol === "admin" || rol === "owner" || rol === "propietario") {
      setPermisos(completarPermisos(permisosAdmin, true));
    } else {
      setPermisos(completarPermisos(permisosColaborador, false));
    }
  }, [rol, editandoUsuarioId, editandoInvitacionId]);

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
    setPermisos(completarPermisos(permisosColaborador, false));
    setEmpresasSeleccionadas(empresaActiva?.id ? [empresaActiva.id] : []);
    setMostrarEmpresas(false);
    setEditandoInvitacionId(null);
    setEditandoUsuarioId(null);
  };

  const guardarInvitacion = async () => {
    if (!puedeAdministrar) {
      return alert("No tienes permiso para invitar usuarios");
    }

    if (editandoInvitacionId) {
      alert(
        "Ojo: estás editando una INVITACIÓN. Si el usuario ya aceptó, los módulos reales se cambian desde 'Usuarios asignados' > Editar."
      );
    }

    if (!email.trim()) {
      return alert("Ingresa el correo del usuario");
    }

    if (empresasSeleccionadas.length === 0) {
      return alert("Selecciona al menos una empresa");
    }

    setLoading(true);

    const permisosGuardar = normalizarPermisosParaGuardar();

    const invitacionesParaGuardar = empresasSeleccionadas.map((empresaId) => ({
      empresa_id: empresaId,
      email: email.trim().toLowerCase(),
      codigo_usuario: codigoUsuario.trim() || null,
      nombre_mostrar: nombreMostrar.trim() || email.trim().toLowerCase(),
      rol,
      permisos: permisosGuardar,
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
            permisos: permisosGuardar,
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

    notificarAccesosActualizados();
    alert("Invitación guardada correctamente. Si ya existía, se actualizó.");
    limpiarFormulario();
    await cargarDatos();
  };

  const cargarInvitacionEnFormulario = (invitacion, grupoInvitacion = null) => {
    if (!puedeAdministrar) return alert("No tienes permiso para editar invitaciones");

    setEditandoInvitacionId(invitacion.id);
    setEditandoUsuarioId(null);
    setEmail(invitacion.email || "");
    setNombreMostrar(invitacion.nombre_mostrar || "");
    setCodigoUsuario(invitacion.codigo_usuario || "");
    setRol(invitacion.rol || "colaborador");
    setPermisos(completarPermisos(invitacion.permisos || {}, false));
    setEmpresasSeleccionadas(
      grupoInvitacion?.registros?.length
        ? grupoInvitacion.registros.map((r) => r.empresa_id)
        : [invitacion.empresa_id]
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cargarUsuarioEnFormulario = (usuario, grupoUsuario = null) => {
    if (!puedeAdministrar) return alert("No tienes permiso para editar usuarios");

    if (usuario.rol === "owner" && rolActivo !== "owner") {
      return alert("Solo el Owner puede editar otro Owner");
    }

    // IMPORTANTE:
    // Esto edita la tabla REAL que usa el sistema: empresa_usuarios.
    // No toca empresa_invitaciones.
    setEditandoUsuarioId(usuario.id);
    setEditandoInvitacionId(null);

    setEmail("");
    setNombreMostrar(usuario.nombre_mostrar || "");
    setCodigoUsuario(usuario.codigo_usuario || "");
    setRol(usuario.rol || "colaborador");
    setPermisos(completarPermisos(usuario.permisos || {}, false));

    setEmpresasSeleccionadas(
      grupoUsuario?.registros?.length
        ? grupoUsuario.registros.filter((r) => r.activo).map((r) => r.empresa_id)
        : [usuario.empresa_id]
    );

    setDebugGuardadoPermisos(
      `Editando usuario real empresa_usuarios id=${usuario.id}`
    );

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const permisosVacios = () => permisosVaciosGlobal();


  const normalizarPermisosParaGuardar = () => completarPermisos(permisos, false);


  const notificarAccesosActualizados = () => {
    localStorage.setItem("accesosActualizados", String(Date.now()));
    window.dispatchEvent(new Event("accesosActualizados"));
  };

  const guardarCambiosUsuario = async () => {
    if (!puedeAdministrar) return alert("No tienes permiso para editar usuarios");

    if (!editandoUsuarioId) {
      return alert("No hay usuario real seleccionado. Dale clic en EDITAR dentro de Usuarios asignados, no en Invitaciones.");
    }

    setLoading(true);
    setDebugGuardadoPermisos("");

    try {
      const permisosGuardar = normalizarPermisosParaGuardar();

      const usuarioEditar = usuarios.find(
        (u) => String(u.id) === String(editandoUsuarioId)
      );

      if (!usuarioEditar?.id || !usuarioEditar?.user_id) {
        throw new Error("Usuario no encontrado en empresa_usuarios");
      }

      const registrosDelUsuario = usuarios.filter(
        (u) => String(u.user_id) === String(usuarioEditar.user_id)
      );

      const resultados = [];

      for (const registro of registrosDelUsuario) {
        const debeEstarActivo = empresasSeleccionadas.some(
          (empresaId) => String(empresaId) === String(registro.empresa_id)
        );

        const payload = debeEstarActivo
          ? {
              permisos: permisosGuardar,
              rol,
              codigo_usuario: codigoUsuario.trim() || null,
              nombre_mostrar:
                nombreMostrar.trim() || usuarioEditar.nombre_mostrar || null,
              activo: true,
            }
          : {
              activo: false,
            };

        const { data, error } = await supabase
          .from("empresa_usuarios")
          .update(payload)
          .eq("id", registro.id)
          .select("id, empresa_id, user_id, permisos, activo");

        if (error) throw error;

        resultados.push({
          id: registro.id,
          empresa_id: registro.empresa_id,
          filas: data?.length || 0,
          activo: data?.[0]?.activo,
          ventas_ver: data?.[0]?.permisos?.ventas_ver,
          ventas_crear: data?.[0]?.permisos?.ventas_crear,
          bandeja_notificaciones_ver:
            data?.[0]?.permisos?.bandeja_notificaciones_ver,
        });
      }

      // Si seleccionaste una empresa donde aún no existe registro empresa_usuarios, lo crea.
      for (const empresaId of empresasSeleccionadas) {
        const yaExiste = registrosDelUsuario.some(
          (r) => String(r.empresa_id) === String(empresaId)
        );

        if (!yaExiste) {
          const { data, error } = await supabase
            .from("empresa_usuarios")
            .insert([
              {
                empresa_id: empresaId,
                user_id: usuarioEditar.user_id,
                rol,
                permisos: permisosGuardar,
                activo: true,
                codigo_usuario: codigoUsuario.trim() || null,
                nombre_mostrar:
                  nombreMostrar.trim() || usuarioEditar.nombre_mostrar || null,
              },
            ])
            .select("id, empresa_id, user_id, permisos, activo");

          if (error) throw error;

          resultados.push({
            id: data?.[0]?.id,
            empresa_id: empresaId,
            filas: data?.length || 0,
            activo: data?.[0]?.activo,
            ventas_ver: data?.[0]?.permisos?.ventas_ver,
            ventas_crear: data?.[0]?.permisos?.ventas_crear,
            bandeja_notificaciones_ver:
              data?.[0]?.permisos?.bandeja_notificaciones_ver,
          });
        }
      }

      console.table(resultados);
      localStorage.setItem("accesosDiagnostico", JSON.stringify(resultados));

      const actualizados = resultados.filter((r) => r.filas > 0).length;

      if (actualizados === 0) {
        throw new Error("No se actualizó ninguna fila de empresa_usuarios.");
      }

      setDebugGuardadoPermisos(
        `empresa_usuarios actualizado: ${actualizados} fila(s). Revisa consola: accesosDiagnostico`
      );

      notificarAccesosActualizados();
      await cargarDatos();
      limpiarFormulario();

      alert("Permisos del usuario real actualizados correctamente. Que el usuario cierre sesión y vuelva a entrar.");
    } catch (err) {
      console.error("Error guardando empresa_usuarios:", err);
      setDebugGuardadoPermisos(err.message || "Error al guardar permisos");
      alert(err.message || "No se pudieron actualizar los permisos del usuario real");
    } finally {
      setLoading(false);
    }
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
          permisos: completarPermisos(invitacion.permisos || {}, false),
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

  const usuariosConsolidados = useMemo(() => {
    const mapa = new Map();

    usuariosFiltrados.forEach((usuario) => {
      const llave =
        usuario.user_id ||
        usuario.codigo_usuario ||
        usuario.nombre_mostrar ||
        usuario.id;

      if (!mapa.has(llave)) {
        mapa.set(llave, {
          llave,
          nombre_mostrar: usuario.nombre_mostrar,
          codigo_usuario: usuario.codigo_usuario,
          user_id: usuario.user_id,
          rol: usuario.rol,
          activo: usuario.activo,
          permisos: completarPermisos(usuario.permisos || {}, false),
          registros: [],
          empresas: [],
        });
      }

      const grupo = mapa.get(llave);
      grupo.registros.push(usuario);
      grupo.empresas.push(usuario.empresas?.nombre || "Empresa");
      grupo.activo = grupo.activo || usuario.activo;
      grupo.rol = grupo.rol || usuario.rol;
    });

    return Array.from(mapa.values()).sort((a, b) =>
      String(a.nombre_mostrar || a.codigo_usuario || "").localeCompare(
        String(b.nombre_mostrar || b.codigo_usuario || "")
      )
    );
  }, [usuariosFiltrados]);

  const invitacionesConsolidadas = useMemo(() => {
    const mapa = new Map();

    invitacionesFiltradas.forEach((invitacion) => {
      const llave = invitacion.email || invitacion.codigo_usuario || invitacion.id;

      if (!mapa.has(llave)) {
        mapa.set(llave, {
          llave,
          email: invitacion.email,
          nombre_mostrar: invitacion.nombre_mostrar,
          codigo_usuario: invitacion.codigo_usuario,
          rol: invitacion.rol,
          estado: invitacion.estado,
          permisos: completarPermisos(invitacion.permisos || {}, false),
          registros: [],
          empresas: [],
        });
      }

      const grupo = mapa.get(llave);
      grupo.registros.push(invitacion);
      grupo.empresas.push(invitacion.empresas?.nombre || "Empresa");
    });

    return Array.from(mapa.values()).sort((a, b) =>
      String(a.nombre_mostrar || a.email || "").localeCompare(
        String(b.nombre_mostrar || b.email || "")
      )
    );
  }, [invitacionesFiltradas]);

  const abrirModalPermisos = (modulo) => {
    setModuloPermisosActivo(modulo);
  };

  const cerrarModalPermisos = () => {
    setModuloPermisosActivo(null);
  };

  const contarPermisosGrupo = (modulo) => {
    return modulo.permisos.filter((p) => permisos[p.key]).length;
  };

  const resumenPermisosTexto = (permisosObj = {}) => {
    const activos = permisosBase.filter((p) => permisosObj[p.key]);
    if (activos.length === 0) return "Sin permisos activos";
    return activos.slice(0, 4).map((p) => p.label).join(", ") + (activos.length > 4 ? "..." : "");
  };


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
            Creá accesos arriba, configurá permisos por módulo en tarjetas y revisá usuarios consolidados sin duplicados.
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

      {debugGuardadoPermisos && (
        <div style={styles.debugBox}>
          {debugGuardadoPermisos}
        </div>
      )}

      {!puedeAdministrar && (
        <div style={styles.warnBox}>
          Tu usuario no tiene permisos para administrar accesos. Puedes ver la información, pero no modificarla.
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.cardHeaderFlex}>
          <div>
            <h3 style={styles.sectionTitle}>
              {editandoUsuarioId ? "Editar usuario" : editandoInvitacionId ? "Editar invitación" : "Dar acceso a nuevo usuario"}
            </h3>
            <p style={styles.sectionSubtitle}>
              Definí los datos principales. Los permisos se configuran en las tarjetas de módulos de abajo.
            </p>
          </div>

          {(editandoUsuarioId || editandoInvitacionId) && (
            <button type="button" style={styles.secondaryBtn} onClick={limpiarFormulario}>
              Cancelar edición
            </button>
          )}
        </div>

        <div style={styles.formGridTop}>
          {!editandoUsuarioId && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Correo</label>
              <input
                style={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@correo.com"
              />
            </div>
          )}

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

        <div style={styles.accessFooterGrid}>
          <div style={styles.subSectionClean}>
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

          <div style={styles.actionsPanel}>
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
                ? "Actualizar solo invitación"
                : "Guardar invitación"}
            </button>

            <button type="button" style={styles.secondaryBtn} onClick={limpiarFormulario}>
              Limpiar
            </button>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeaderFlex}>
          <div>
            <h3 style={styles.sectionTitle}>Permisos por módulo</h3>
            <p style={styles.sectionSubtitle}>
              Tocá una tarjeta para abrir el modal y marcar permisos específicos.
            </p>
          </div>
        </div>

        <div style={styles.moduleGridCards}>
          {modulosPermisos.map((modulo) => {
            const totalModulo = modulo.permisos.length;
            const marcados = contarPermisosGrupo(modulo);

            return (
              <button
                key={modulo.id}
                type="button"
                style={{
                  ...styles.moduleTile,
                  ...(marcados > 0 ? styles.moduleTileActive : {}),
                }}
                onClick={() => abrirModalPermisos(modulo)}
              >
                <span style={styles.moduleTileIcon}>{modulo.icono}</span>

                <div style={styles.moduleTileBody}>
                  <strong>{modulo.titulo}</strong>
                  <span>{modulo.descripcion}</span>
                </div>

                <div style={styles.moduleTileFooter}>
                  <span style={styles.moduleCount}>{marcados}/{totalModulo}</span>
                  <span style={styles.configureTag}>Configurar</span>
                </div>
              </button>
            );
          })}
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
          <div style={styles.cardHeaderFlex}>
            <div>
              <h3 style={styles.sectionTitle}>Usuarios asignados</h3>
              <p style={styles.sectionSubtitle}>
                Consolidados por persona. Abrí detalle para ver empresas y accesos.
              </p>
            </div>
          </div>

          {cargando ? (
            <div style={styles.emptyMini}>Cargando...</div>
          ) : usuariosConsolidados.length === 0 ? (
            <div style={styles.emptyMini}>No hay usuarios asignados.</div>
          ) : (
            <div style={styles.list}>
              {usuariosConsolidados.map((u) => (
                <div key={u.llave} style={styles.userCardCompact}>
                  <div style={styles.avatarCircle}>
                    {(u.nombre_mostrar || u.codigo_usuario || "U").slice(0, 1).toUpperCase()}
                  </div>

                  <div style={styles.userMain}>
                    <strong style={styles.userName}>
                      {u.nombre_mostrar || u.codigo_usuario || u.user_id}
                    </strong>
                    <div style={styles.userText}>
                      {u.empresas.length} empresa(s) · Rol: {u.rol || "-"} · {u.activo ? "Activo" : "Inactivo"}
                    </div>
                    <div style={styles.userText}>
                      {resumenPermisosTexto(u.permisos)}
                    </div>
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      type="button"
                      style={styles.editBtn}
                      onClick={() => setUsuarioDetalleActivo(u)}
                    >
                      Ver detalle
                    </button>

                    <button
                      type="button"
                      style={styles.primarySmallBtn}
                      onClick={() => cargarUsuarioEnFormulario(u.registros[0], u)}
                      disabled={!puedeAdministrar}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeaderFlex}>
            <div>
              <h3 style={styles.sectionTitle}>Invitaciones pendientes</h3>
              <p style={styles.sectionSubtitle}>
                Consolidadas por correo. El detalle muestra empresas e invitaciones.
              </p>
            </div>
          </div>

          {cargando ? (
            <div style={styles.emptyMini}>Cargando...</div>
          ) : invitacionesConsolidadas.length === 0 ? (
            <div style={styles.emptyMini}>No hay invitaciones.</div>
          ) : (
            <div style={styles.list}>
              {invitacionesConsolidadas.map((inv) => (
                <div key={inv.llave} style={styles.userCardCompact}>
                  <div style={styles.avatarCircle}>
                    {(inv.nombre_mostrar || inv.email || "I").slice(0, 1).toUpperCase()}
                  </div>

                  <div style={styles.userMain}>
                    <strong style={styles.userName}>{inv.email}</strong>
                    <div style={styles.userText}>
                      {inv.empresas.length} empresa(s) · Rol: {inv.rol} · Estado: {inv.estado}
                    </div>
                    <div style={styles.userText}>
                      {resumenPermisosTexto(inv.permisos)}
                    </div>
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      type="button"
                      style={styles.editBtn}
                      onClick={() => setInvitacionDetalleActiva(inv)}
                    >
                      Ver detalle
                    </button>

                    <button
                      type="button"
                      style={styles.primarySmallBtn}
                      onClick={() => cargarInvitacionEnFormulario(inv.registros[0], inv)}
                      disabled={!puedeAdministrar}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {moduloPermisosActivo && (
        <div style={styles.modalOverlay} onClick={cerrarModalPermisos}>
          <div style={styles.permissionModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>
                  {moduloPermisosActivo.icono} Permisos - {moduloPermisosActivo.titulo}
                </h3>
                <p style={styles.modalText}>{moduloPermisosActivo.descripcion}</p>
              </div>

              <button type="button" style={styles.closeBtn} onClick={cerrarModalPermisos}>
                ✕
              </button>
            </div>

            <div style={styles.moduleActions}>
              <button type="button" style={styles.tinyBtn} onClick={() => marcarModulo(moduloPermisosActivo, true)}>
                Marcar todo
              </button>
              <button type="button" style={styles.tinyBtn} onClick={() => marcarModulo(moduloPermisosActivo, false)}>
                Quitar todo
              </button>
            </div>

            <div style={styles.permissionsListModal}>
              {moduloPermisosActivo.permisos.map((permiso) => (
                <label key={`${moduloPermisosActivo.id}-${permiso.key}`} style={styles.switchRowModal}>
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
        </div>
      )}

      {usuarioDetalleActivo && (
        <div style={styles.modalOverlay} onClick={() => setUsuarioDetalleActivo(null)}>
          <div style={styles.detailModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>
                  👤 {usuarioDetalleActivo.nombre_mostrar || usuarioDetalleActivo.codigo_usuario || "Usuario"}
                </h3>
                <p style={styles.modalText}>
                  Rol: {usuarioDetalleActivo.rol || "-"} · Código: {usuarioDetalleActivo.codigo_usuario || "-"}
                </p>
              </div>

              <button type="button" style={styles.closeBtn} onClick={() => setUsuarioDetalleActivo(null)}>
                ✕
              </button>
            </div>

            <div style={styles.detailSection}>
              <h4>Empresas con acceso</h4>
              <div style={styles.chipList}>
                {usuarioDetalleActivo.registros.map((reg) => (
                  <span key={reg.id} style={styles.companyChip}>
                    ID {reg.id} · {reg.empresas?.nombre || "Empresa"} · {reg.activo ? "Activo" : "Inactivo"}
                  </span>
                ))}
              </div>
            </div>

            <div style={styles.detailSection}>
              <h4>Permisos activos</h4>
              <div style={styles.chipList}>
                {permisosBase
                  .filter((p) => usuarioDetalleActivo.permisos?.[p.key])
                  .map((p) => (
                    <span key={`${p.key}-${p.moduloId}`} style={styles.permissionChip}>{p.label}</span>
                  ))}
              </div>
            </div>

            <div style={styles.modalFooterActions}>
              <button
                type="button"
                style={styles.primarySmallBtn}
                onClick={() => {
                  cargarUsuarioEnFormulario(usuarioDetalleActivo.registros[0], usuarioDetalleActivo);
                  setUsuarioDetalleActivo(null);
                }}
                disabled={!puedeAdministrar}
              >
                Editar permisos
              </button>

              {usuarioDetalleActivo.registros.map((reg) => (
                <button
                  key={reg.id}
                  type="button"
                  style={reg.activo ? styles.disableBtn : styles.enableBtn}
                  onClick={async () => {
                    await cambiarActivoUsuario(reg);
                    setUsuarioDetalleActivo(null);
                  }}
                  disabled={!puedeAdministrar || reg.rol === "owner"}
                >
                  {reg.activo ? `Desactivar ${reg.empresas?.nombre || ""}` : `Activar ${reg.empresas?.nombre || ""}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {invitacionDetalleActiva && (
        <div style={styles.modalOverlay} onClick={() => setInvitacionDetalleActiva(null)}>
          <div style={styles.detailModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>✉️ {invitacionDetalleActiva.email}</h3>
                <p style={styles.modalText}>
                  Rol: {invitacionDetalleActiva.rol || "-"} · Estado: {invitacionDetalleActiva.estado || "-"}
                </p>
              </div>

              <button type="button" style={styles.closeBtn} onClick={() => setInvitacionDetalleActiva(null)}>
                ✕
              </button>
            </div>

            <div style={styles.detailSection}>
              <h4>Empresas invitadas</h4>
              <div style={styles.chipList}>
                {invitacionDetalleActiva.registros.map((reg) => (
                  <span key={reg.id} style={styles.companyChip}>
                    {reg.empresas?.nombre || "Empresa"} · {reg.estado}
                  </span>
                ))}
              </div>
            </div>

            <div style={styles.detailSection}>
              <h4>Permisos configurados</h4>
              <div style={styles.chipList}>
                {permisosBase
                  .filter((p) => invitacionDetalleActiva.permisos?.[p.key])
                  .map((p) => (
                    <span key={`${p.key}-${p.moduloId}`} style={styles.permissionChip}>{p.label}</span>
                  ))}
              </div>
            </div>

            <div style={styles.modalFooterActions}>
              <button
                type="button"
                style={styles.primarySmallBtn}
                onClick={() => {
                  cargarInvitacionEnFormulario(invitacionDetalleActiva.registros[0], invitacionDetalleActiva);
                  setInvitacionDetalleActiva(null);
                }}
                disabled={!puedeAdministrar}
              >
                Editar invitación
              </button>

              {invitacionDetalleActiva.registros.map((reg) => (
                <button
                  key={reg.id}
                  type="button"
                  style={styles.deleteSmallBtn}
                  onClick={async () => {
                    await eliminarInvitacion(reg);
                    setInvitacionDetalleActiva(null);
                  }}
                  disabled={!puedeAdministrar}
                >
                  Eliminar {reg.empresas?.nombre || ""}
                </button>
              ))}
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
    maxWidth: "760px",
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

  cardHeaderFlex: {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    alignItems: "flex-start",
    flexWrap: "wrap",
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

  formGridTop: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

  accessFooterGrid: {
    marginTop: "16px",
    display: "grid",
    gridTemplateColumns: "minmax(280px, 1fr) auto",
    gap: "14px",
    alignItems: "end",
  },

  subSectionClean: {
    minWidth: 0,
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

  actionsPanel: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
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

  moduleGridCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "12px",
  },

  moduleTile: {
    minHeight: "155px",
    border: "1px solid #d7dbe2",
    background: "linear-gradient(180deg, #fff 0%, #fbfbfc 100%)",
    borderRadius: "20px",
    padding: "15px",
    cursor: "pointer",
    textAlign: "left",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: "10px",
    color: "#334155",
    boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
  },

  moduleTileActive: {
    border: "1px solid #8a79a0",
    background: "linear-gradient(180deg, #fff 0%, #f7f2fa 100%)",
  },

  moduleTileIcon: {
    width: "44px",
    height: "44px",
    borderRadius: "15px",
    background: "#f4f0f7",
    border: "1px solid #d3c7dd",
    display: "grid",
    placeItems: "center",
    fontSize: "22px",
  },

  moduleTileBody: {
    display: "grid",
    gap: "5px",
  },

  moduleTileFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  },

  moduleCount: {
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "12px",
    fontWeight: "900",
  },

  configureTag: {
    color: "#574866",
    fontSize: "12px",
    fontWeight: "900",
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

  userCardCompact: {
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr) auto",
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

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    zIndex: 9900,
    display: "grid",
    placeItems: "center",
    padding: "18px",
  },

  permissionModal: {
    width: "min(620px, calc(100vw - 30px))",
    maxHeight: "calc(100vh - 40px)",
    overflowY: "auto",
    background: "#fff",
    borderRadius: "24px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 24px 80px rgba(15,23,42,0.24)",
    padding: "18px",
    display: "grid",
    gap: "14px",
  },

  detailModal: {
    width: "min(720px, calc(100vw - 30px))",
    maxHeight: "calc(100vh - 40px)",
    overflowY: "auto",
    background: "#fff",
    borderRadius: "24px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 24px 80px rgba(15,23,42,0.24)",
    padding: "18px",
    display: "grid",
    gap: "14px",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
  },

  modalTitle: {
    margin: 0,
    color: "#574866",
    fontSize: "22px",
    fontWeight: "950",
  },

  modalText: {
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: "13px",
  },

  closeBtn: {
    border: "none",
    background: "#f1f5f9",
    color: "#334155",
    borderRadius: "11px",
    width: "36px",
    height: "36px",
    cursor: "pointer",
    fontWeight: "950",
  },

  moduleActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  },

  tinyBtn: {
    background: "#fff",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "9px",
    padding: "7px 9px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "12px",
  },

  permissionsListModal: {
    display: "grid",
    gap: "8px",
  },

  switchRowModal: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    padding: "12px",
    border: "1px solid #edf2f7",
    borderRadius: "14px",
    color: "#334155",
    fontSize: "14px",
    fontWeight: "750",
    background: "#fbfbfc",
  },

  detailSection: {
    display: "grid",
    gap: "9px",
  },

  chipList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },

  companyChip: {
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "999px",
    padding: "7px 10px",
    fontSize: "12px",
    fontWeight: "850",
  },

  permissionChip: {
    background: "#f4f0f7",
    color: "#574866",
    border: "1px solid #d3c7dd",
    borderRadius: "999px",
    padding: "7px 10px",
    fontSize: "12px",
    fontWeight: "850",
  },

  modalFooterActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  debugBox: {
    background: "#eef6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "16px",
    padding: "12px 14px",
    fontWeight: "800",
  },
};

export default UsuariosAccesos;
