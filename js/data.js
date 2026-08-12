let _areasCache    = [];
let _usersCache    = [];

let demandas         = [];
let currentUser      = null;
let currentViewId    = null;
let transferId       = null;
let selectedArea     = null;
let filteredDemandas = [];
let _reportesPendientes = 0;
let _currentPage        = null;

let _pendingEstadoId   = null;
let _pendingEstadoVal  = null;
let _pendingEstadoSel  = null;
let _pendingEstadoFile = null;
let _pendingScannedDocs = [];

// Normalizadores

function normalizeArea(a) {
  return { id: a.id, nombre: a.nombre, jefe_area: a.jefe_area || '', activa: !!a.activa };
}

function normalizeUsuario(u) {
  return {
    id:       u.id,
    name:     u.nombre,
    user:     u.usuario,
    correo:   u.correo    || '',
    telefono: u.telefono  || '',
    cargo:    u.cargo     || '',
    area:     u.area      || '',
    area_id:  u.area_id   || null,
    subarea:    u.subarea    || '',
    subarea_id: u.subarea_id || null,
    rol:      u.rol,
    active:   !!u.activo,
    password: u.password_texto || '',
  };
}

function normalizeHistorial(h) {
  if (!h) return [];
  return h.map(item => ({
    fecha:      item.transferido_en
      ? new Date(item.transferido_en).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' })
      : (item.fecha || ''),
    area:       item.area_destino || item.area || '',
    comentario: item.comentario   || '',
    de:         item.area_origen  || item.de   || '',
  }));
}

function normalizeHistorialEstados(h) {
  if (!h) return [];
  return h.map(item => ({
    fecha:         item.creado_en
      ? new Date(item.creado_en).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '',
    estadoAnterior: item.estado_anterior || '',
    estadoNuevo:   item.estado_nuevo    || '',
    archivoNombre: item.archivo_nombre  || '',
    archivoRuta:   item.archivo_ruta    || '',
    comentario:    item.comentario      || '',
    cambiadoPor:   item.cambiado_por    || '',
  }));
}

function normalizeReportes(r) {
  if (!r) return [];
  return r.map(item => ({
    fecha: item.creado_en
      ? new Date(item.creado_en).toLocaleString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '',
    nota:            item.nota            || '',
    reportadoPor:    item.reportado_por   || '',
    resuelto:        !!item.resuelto,
    notaResolucion:  item.nota_resolucion || '',
    resueltoPor:     item.resuelto_por    || '',
    fechaResolucion: item.resuelto_en
      ? new Date(item.resuelto_en).toLocaleString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '',
  }));
}

function normalizeHistorialEdiciones(h) {
  if (!h) return [];
  return h.map(item => ({
    fecha: item.editado_en
      ? new Date(item.editado_en).toLocaleString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '',
    editadoPor: item.editado_por || '',
    campos: (() => {
      try { return JSON.parse(item.campos_editados || '{}'); } catch (_) { return {}; }
    })(),
  }));
}

function normalizeDemanda(d) {
  const historial = d.historial ?? d.historiales ?? [];
  const historialEstados = d.historial_estados ?? d.historialEstados ?? [];
  const historialEdiciones = d.historial_ediciones ?? d.historialEdiciones ?? [];
  const reportes = d.reportes ?? d.reportesProblema ?? [];

  return {
    id:            d.id,
    folio:         d.folio         || '',
    fecha:         d.fecha         || '',
    fechaDemanda:  d.fecha_demanda || d.fechaDemanda || '',
    ref:           d.ref           || '',
    area_id:       d.area_id       || null,
    area:          d.area          || '',
    subarea_id:    d.subarea_id    || null,
    subarea:       d.subarea       || '',
    remitente:     d.remitente     || '',
    asunto:        d.asunto        || '',
    domicilio:     d.domicilio     || '',
    colonia:       d.colonia       || '',
    tel1:          d.tel1          || '',
    tel2:          d.tel2          || '',
    demanda:       d.demanda       || '',
    observaciones: d.observaciones || '',
    concepto:      d.concepto      || '',
    estado:        d.estado        || 'Pendiente',
    prioridad:     d.prioridad     || 'Media',
    historial:         normalizeHistorial(historial),
    historialEstados:  normalizeHistorialEstados(historialEstados),
    historialEdiciones: normalizeHistorialEdiciones(historialEdiciones),
    reportes:          normalizeReportes(reportes),
    adjuntos:          Array.isArray(d.adjuntos) ? d.adjuntos.map(item => ({
      id: item.id,
      nombre: item.nombre || item.name || '',
      ruta: item.ruta || item.path || '',
    })) : [],
    creadoPor:     d.creado_por    || d.creadoPor || '',
    fechaCreacion: d.creado_en     || d.fechaCreacion || '',
  };
}

function getAreasActivas() {
  return _areasCache.filter(a => a.activa).map(a => a.nombre);
}

function getAreaId(nombre) {
  const a = _areasCache.find(x => x.nombre === nombre);
  return a ? a.id : null;
}

// Helpers

function generarFolio() {
  const maxNum = demandas.reduce((max, d) => {
    const n = parseInt(String(d.folio || '').replace(/^F-/, ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const num = String(maxNum + 1).padStart(5, '0');
  return 'F-' + num;
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
}

// Administrador y Subadmin comparten permisos de gestion (demandas, areas);
// solo Administrador puede ver/editar Usuarios y Configuracion.
function isAdminLevel(rol) {
  return rol === 'Administrador' || rol === 'Subadmin';
}

function isFullAdmin(rol) {
  return rol === 'Administrador';
}

function normalizeAreaName(area) {
  if (!area) return '';
  return area.toString().trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
}

function isDireccionGeneralArea(area) {
  return normalizeAreaName(area) === 'DIRECCION GENERAL';
}

function isAreaUsuario(rol) {
  return rol === 'area_usuario';
}

function isSubareaUsuario(rol) {
  return rol === 'subarea_usuario';
}

function isJefeArea(rol) {
  return rol === 'jefe_area';
}

function getInitials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function badgeClass(estado) {
  if (estado === 'Atendida')   return 'badge-green';
  if (estado === 'En proceso') return 'badge-blue';
  return 'badge-gold';
}

function prioridadBadgeClass(prioridad) {
  if (prioridad === 'Alta') return 'badge-red';
  if (prioridad === 'Baja') return 'badge-green';
  return 'badge-gold';
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Selects de área

function populateAreaSelect(selId, addEmpty) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  if (addEmpty) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = '— Seleccione un area —';
    sel.appendChild(opt);
  }
  getAreasActivas().forEach(a => {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

function populateAllSelects() {
  ['f-area', 'filter-area', 'transfer-area', 'ed-area', 'eu-area', 'nu-area'].forEach(id => {
    const addEmpty = ['f-area', 'filter-area', 'transfer-area'].includes(id);
    populateAreaSelect(id, addEmpty);
  });
  const fa = document.getElementById('filter-area');
  if (fa && fa.options[0] && fa.options[0].value === '') fa.options[0].textContent = 'Todas las areas';
}
