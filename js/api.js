/* ================================================
   SAPASE – Cliente API
   Conecta el frontend con el backend Node/Express
   Reemplaza las llamadas a localStorage
   ================================================ */

// Ruta relativa: funciona desde cualquier IP/puerto porque usa el mismo origen que la pagina
const API_BASE = '/api';

// ---- Token en memoria (no localStorage por seguridad) ----
let _token = null;

function setToken(t)  { _token = t; }
function getToken()   { return _token; }
function clearToken() { _token = null; }

/* ---- Fetch con JWT automatico ---- */
async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = 'Bearer ' + _token;

  const res = await fetch(API_BASE + endpoint, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });

  const data = await res.json();

  if (!res.ok) {
    // Si el token expiro, forzar logout
    if (res.status === 401) {
      clearToken();
      doLogout();
    }
    throw new Error(data.error || 'Error en la solicitud');
  }

  return data;
}

/* ============================================================
   AUTH
   ============================================================ */
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

/* ============================================================
   AREAS
   ============================================================ */
async function apiGetAreas() {
  const res = await apiFetch('/areas');
  return res.data;
}

async function apiCrearArea(nombre) {
  const res = await apiFetch('/areas', {
    method: 'POST',
    body: JSON.stringify({ nombre }),
  });
  return res.data;
}

async function apiToggleArea(id) {
  const res = await apiFetch('/areas/' + id + '/toggle', { method: 'PATCH' });
  return res;
}

/* ============================================================
   USUARIOS
   ============================================================ */
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

async function apiMiPerfil() {
  const res = await apiFetch('/usuarios/me');
  return res.data;
}

/* ============================================================
   DEMANDAS
   ============================================================ */
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
