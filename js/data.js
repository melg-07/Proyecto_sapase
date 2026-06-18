/* ================================================
   SAPASE – Estado global y helpers
   (sin localStorage – toda persistencia va a la API)
   ================================================ */

// ---- Caches en memoria (se llenan después del login) ----
let _areasCache   = [];   // [{ id, nombre, activa }]
let _usersCache   = [];   // usuarios normalizados (para modal de edición)

// ---- Estado de sesión y UI ----
let demandas       = [];
let currentUser    = null;
let currentViewId  = null;
let transferId     = null;
let selectedArea   = null;
let filteredDemandas = [];

/* ============================================================
   NORMALIZADORES  (API → formato que espera el frontend)
   ============================================================ */
function normalizeArea(a) {
  return { id: a.id, nombre: a.nombre, activa: !!a.activa };
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
    rol:      u.rol,
    active:   !!u.activo,
    password: '',
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

function normalizeDemanda(d) {
  return {
    id:            d.id,
    folio:         d.folio         || '',
    fecha:         d.fecha         || '',
    fechaDemanda:  d.fecha_demanda || d.fechaDemanda || '',
    ref:           d.ref           || '',
    area_id:       d.area_id       || null,
    area:          d.area          || '',
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
    historial:     normalizeHistorial(d.historial),
    creadoPor:     d.creado_por    || d.creadoPor || '',
    fechaCreacion: d.creado_en     || d.fechaCreacion || '',
  };
}

/* ---- Helpers de búsqueda en caches ---- */
function getAreasActivas() {
  return _areasCache.filter(a => a.activa).map(a => a.nombre);
}

function getAreaId(nombre) {
  const a = _areasCache.find(x => x.nombre === nombre);
  return a ? a.id : null;
}

/* ============================================================
   HELPERS GENERALES
   ============================================================ */
function generarFolio() {
  const now = new Date();
  const num = String(demandas.length + 1).padStart(6, '0');
  return 'SAPASE-' + now.getFullYear() + '-' + num;
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function getInitials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function badgeClass(estado) {
  if (estado === 'Atendida')   return 'badge-green';
  if (estado === 'En proceso') return 'badge-blue';
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

/* ============================================================
   SELECTS DE AREA
   ============================================================ */
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
