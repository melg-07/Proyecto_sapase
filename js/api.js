// URL relativa: funciona desde cualquier IP porque usa el mismo origen que la pagina
const API_BASE = '/api';

// Token persistido en sessionStorage: sobrevive a un refresh de pagina pero es
// exclusivo de cada pestaña, para que iniciar sesion en otra pestaña (u otro
// perfil) no cambie la sesion de esta.
let _token = sessionStorage.getItem('sapase_token');

function setToken(t)  { _token = t; sessionStorage.setItem('sapase_token', t); }
function getToken()   { return _token; }
function clearToken() { _token = null; sessionStorage.removeItem('sapase_token'); }

async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = 'Bearer ' + _token;

  const res = await fetch(API_BASE + endpoint, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });

  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(`Error del servidor (${res.status})`);
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      doLogout();
    }
    throw new Error(data.error || 'Error en la solicitud');
  }

  return data;
}

// Auth

async function apiLogin(usuario, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usuario, password }),
  });
}

async function apiLogout() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch(e) {}
  clearToken();
}

// Áreas

async function apiGetAreas() {
  const res = await apiFetch('/areas');
  return res.data;
}

async function apiCrearArea(nombre, jefe_area) {
  const res = await apiFetch('/areas', {
    method: 'POST',
    body: JSON.stringify({ nombre, jefe_area }),
  });
  return res.data;
}

async function apiEditarArea(id, nombre, jefe_area) {
  const res = await apiFetch('/areas/' + id, {
    method: 'PUT',
    body: JSON.stringify({ nombre, jefe_area }),
  });
  return res.data;
}

async function apiToggleArea(id) {
  const res = await apiFetch('/areas/' + id + '/toggle', { method: 'PATCH' });
  return res;
}

// Subareas

async function apiGetSubareas(area_id) {
  const res = await apiFetch('/subareas?area_id=' + area_id);
  return res.data;
}

async function apiCrearSubarea(area_id, nombre) {
  const res = await apiFetch('/subareas', {
    method: 'POST',
    body: JSON.stringify({ area_id, nombre }),
  });
  return res.data;
}

async function apiEliminarSubarea(id) {
  return apiFetch('/subareas/' + id, { method: 'DELETE' });
}

// Usuarios

async function apiGetUsuarios() {
  const res = await apiFetch('/usuarios');
  return res.data;
}

async function apiCrearUsuario(data) {
  const res = await apiFetch('/usuarios', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data;
}

async function apiEditarUsuario(id, data) {
  await apiFetch('/usuarios/' + id, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function apiEliminarUsuario(id) {
  return apiFetch('/usuarios/' + id, { method: 'DELETE' });
}

async function apiMiPerfil() {
  const res = await apiFetch('/usuarios/me');
  return res.data;
}

// Peticiones

async function apiGetDemandas(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.area)   params.set('area',   filtros.area);
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.q)      params.set('q',      filtros.q);
  const qs = params.toString();
  const res = await apiFetch('/demandas' + (qs ? '?' + qs : ''));
  return res.data;
}

async function apiGetDemanda(id) {
  const res = await apiFetch('/demandas/' + id);
  return res.data;
}

async function apiCrearDemanda(data) {
  const res = await apiFetch('/demandas', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data;
}

async function apiEditarDemanda(id, data) {
  const res = await apiFetch('/demandas/' + id, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.data;
}

async function apiEliminarDemanda(id) {
  await apiFetch('/demandas/' + id, { method: 'DELETE' });
}

async function apiTransferirDemanda(id, area_destino_id, comentario) {
  await apiFetch('/demandas/' + id + '/transferir', {
    method: 'POST',
    body: JSON.stringify({ area_destino_id, comentario }),
  });
}

async function apiEnviarSubarea(id, subarea_id) {
  const res = await apiFetch('/demandas/' + id + '/enviar-subarea', {
    method: 'POST',
    body: JSON.stringify({ subarea_id }),
  });
  return res.data;
}

async function apiReportarProblema(id, nota) {
  await apiFetch('/demandas/' + id + '/reportar', {
    method: 'POST',
    body: JSON.stringify({ nota }),
  });
}

async function apiResolverReporte(reporteId, nota) {
  await apiFetch('/demandas/reportes/' + reporteId + '/resolver', {
    method: 'PUT',
    body: JSON.stringify({ nota }),
  });
}

async function apiGetReportes() {
  const res = await apiFetch('/demandas/reportes/lista');
  return res.data;
}

// Configuración / Logos

async function apiGetLogos() {
  const res  = await fetch(API_BASE + '/config/logos');
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Error al obtener los logos');
  return data.data;
}

async function apiSubirLogo(key, file) {
  const fd = new FormData();
  fd.append('logo', file);

  const res = await fetch(API_BASE + '/config/logos/' + key, {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + getToken() },
    body:    fd,
  });
  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(`Error del servidor (${res.status})`);
  }
  if (!res.ok) {
    if (res.status === 401) { clearToken(); doLogout(); }
    throw new Error(data.error || 'Error al subir el logo');
  }
  return data.data;
}

async function apiCambiarEstado(id, estado, archivo, comentario) {
  const fd = new FormData();
  fd.append('estado', estado);
  fd.append('archivo', archivo);
  if (comentario) fd.append('comentario', comentario);

  const res = await fetch(API_BASE + '/demandas/' + id + '/cambiar-estado', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + getToken() },
    body:    fd,
  });
  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(`Error del servidor (${res.status})`);
  }
  if (!res.ok) {
    if (res.status === 401) { clearToken(); doLogout(); }
    throw new Error(data.error || 'Error en la solicitud');
  }
  return data.data;
}
