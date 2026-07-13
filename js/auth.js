function buildCurrentUser(u) {
  return {
    id:       u.id,
    name:     u.nombre,
    user:     u.usuario,
    rol:      u.rol,
    area:     u.area     || '',
    area_id:  u.area_id  || null,
    subarea:    u.subarea    || '',
    subarea_id: u.subarea_id || null,
    correo:   u.correo   || '',
    telefono: u.telefono || '',
    cargo:    u.cargo    || '',
    active:   !!u.activo,
  };
}

async function bootApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display          = 'block';
  document.getElementById('user-name').textContent      = currentUser.name.split(' ')[0];
  document.getElementById('user-avatar').textContent    = getInitials(currentUser.name);
  document.getElementById('user-rol-top').textContent   = currentUser.rol;

  const [areas, rawDemandas] = await Promise.all([
    apiGetAreas(),
    apiGetDemandas(),
  ]);
  _areasCache = areas.map(normalizeArea);
  demandas    = rawDemandas.map(normalizeDemanda);

  populateAllSelects();
  updateStats();
  renderDashboard();
  renderAreasGrid();

  const defaultPage = isAdminLevel(currentUser.rol)                    ? 'dashboard'
                     : currentUser.rol === 'Consulta'                  ? 'archivos'
                     : isAreaUsuario(currentUser.rol)                  ? 'archivos'
                     : isSubareaUsuario(currentUser.rol)                ? 'archivos'
                     : isJefeArea(currentUser.rol)                     ? 'areas'
                     : 'formulario';
  const savedPage = sessionStorage.getItem('sapase_page');
  showPage(savedPage || defaultPage);
}

// Login
async function doLogin() {
  const u     = document.getElementById('username').value.trim();
  const p     = document.getElementById('password').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  try {
    const resp = await apiLogin(u, p);
    setToken(resp.token);
    currentUser = buildCurrentUser(resp.user);
    await bootApp();
  } catch (err) {
    errEl.textContent   = err.message || 'Usuario o contrasena incorrectos.';
    errEl.style.display = 'block';
  }
}

// Restaura la sesion al recargar la pagina, si hay un token guardado y valido
async function restoreSession() {
  if (!getToken()) return;
  try {
    const u = await apiMiPerfil();
    currentUser = buildCurrentUser(u);
    await bootApp();
  } catch (err) {
    clearToken();
  }
}

// Logout
function doLogout() {
  if (getToken()) {
    apiLogout(); // invalida la sesion en el servidor
  }
  currentUser      = null;
  demandas         = [];
  _areasCache      = [];
  _usersCache      = [];
  filteredDemandas = [];
  sessionStorage.removeItem('sapase_page');

  document.getElementById('app').style.display          = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('password').value             = '';
  document.getElementById('login-error').style.display  = 'none';
}

// Sidebar
function renderSidebar(activePage) {
  const isFullAdmin = currentUser && currentUser.rol === 'Administrador';
  const isAdminLvl  = currentUser && isAdminLevel(currentUser.rol);
  const isConsulta  = currentUser && currentUser.rol === 'Consulta';
  const isJefe      = currentUser && isJefeArea(currentUser.rol);
  const isAreaUser  = currentUser && (isAreaUsuario(currentUser.rol) || isSubareaUsuario(currentUser.rol) || isJefe);
  let html = '';

  if (isAdminLvl) {
    html += navSection('Principal');
    html += navItem('dashboard',  'Dashboard',    activePage);
    html += navItem('formulario', 'Nueva Peticion', activePage);
    html += navSection('Gestion');
    html += navItem('archivos',      'Archivos',      activePage);
    html += navItem('areas',         'Areas',         activePage);
    html += navItem('observaciones', 'Observaciones', activePage);
    if (isFullAdmin) {
      html += navSection('Sistema');
      html += navItem('usuarios',      'Usuarios',      activePage);
      html += navItem('configuracion', 'Configuracion', activePage);
    }
  } else if (isConsulta) {
    html += navSection('Gestion');
    html += navItem('archivos', 'Archivos', activePage);
  } else if (isJefe) {
    html += navSection('Gestion');
    html += navItem('areas',         'Mi Area',       activePage);
    html += navItem('archivos',      'Archivos',      activePage);
    html += navItem('observaciones', 'Observaciones', activePage);
  } else if (isAreaUser) {
    html += navSection('Gestion');
    html += navItem('archivos', 'Archivos', activePage);
  } else {
    html += navSection('Gestion');
    html += navItem('formulario', 'Nueva Peticion', activePage);
    html += navItem('archivos',   'Archivos',      activePage);
  }

  document.getElementById('sidebar-content').innerHTML = html;
}

function navSection(label) {
  return `<div class="nav-section">${label}</div>`;
}

function navItem(page, label, active) {
  const cls = page === active ? ' active' : '';
  return `<div class="nav-item${cls}" onclick="showPage('${page}')"><span class="nav-dot"></span>${label}</div>`;
}

// Navegación
function showPage(name) {
  const isFullAdmin = currentUser && currentUser.rol === 'Administrador';
  const isAdminLvl  = currentUser && isAdminLevel(currentUser.rol);
  const isConsulta  = currentUser && currentUser.rol === 'Consulta';
  const isJefe      = currentUser && isJefeArea(currentUser.rol);
  const isAreaUser  = currentUser && (isAreaUsuario(currentUser.rol) || isSubareaUsuario(currentUser.rol) || isJefe);

  if (isConsulta) {
    if (name !== 'archivos') name = 'archivos';
  } else if (isAdminLvl) {
    if (!isFullAdmin && ['usuarios', 'configuracion'].includes(name)) name = 'dashboard';
  } else if (isJefe) {
    if (!['areas', 'archivos', 'observaciones'].includes(name)) name = 'areas';
  } else if (isAreaUser) {
    if (name !== 'archivos') name = 'archivos';
  } else if (!['formulario', 'archivos'].includes(name)) {
    name = 'formulario';
  }

  sessionStorage.setItem('sapase_page', name);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');

  renderSidebar(name);
  if (window.innerWidth <= 768) closeSidebar();

  if (name === 'formulario') initForm();

  const btnNuevaArea = document.getElementById('btn-nueva-area');
  if (btnNuevaArea) {
    btnNuevaArea.style.display = (name === 'areas' && isAdminLvl) ? 'inline-flex' : 'none';
  }

  // Jefe de area, usuario de area y usuario de subarea solo ven las peticiones
  // de su propia area/subarea (el backend ya las filtra), no tiene sentido
  // ofrecerles un filtro para buscar en todas las areas.
  const filterAreaSel = document.getElementById('filter-area');
  if (filterAreaSel) {
    const showAreaFilter = currentUser && (isAdminLvl || isConsulta);
    filterAreaSel.style.display = showAreaFilter ? '' : 'none';
  }

  if (name === 'archivos')  { renderArchivos(); }
  if (name === 'areas')     {
    renderAreasGrid();
    if (isJefe && currentUser.area) showAreaDetail(currentUser.area);
    else hideAreaDetail();
  }
  if (name === 'dashboard') { updateStats(); renderDashboard(); }
  if (name === 'usuarios')  { renderUsuarios(); }
  if (name === 'configuracion') { renderConfiguracion(); }
  if (name === 'observaciones') { renderObservaciones(); }
}

// Perfil
function openUserProfile() {
  if (!currentUser) return;
  const u = currentUser;
  document.getElementById('profile-avatar-big').textContent = getInitials(u.name);
  document.getElementById('profile-name').textContent       = u.name;
  document.getElementById('profile-cargo').textContent      = u.cargo || u.rol;

  const fields = [
    ['Usuario',  u.user],
    ['Rol',      u.rol],
    ['Correo',   u.correo   || '—'],
    ['Telefono', u.telefono || '—'],
    ['Cargo',    u.cargo    || '—'],
    ['Area',     u.area     || '—'],
    ['Subarea',  u.subarea  || '—'],
    ['Estado',   u.active   ? 'Activo' : 'Inactivo'],
  ];

  document.getElementById('profile-fields').innerHTML = fields.map(([label, val]) => `
    <div class="profile-row">
      <span class="profile-label">${label}</span>
      <span class="profile-value">${val}</span>
    </div>
  `).join('');

  document.getElementById('modal-profile').classList.add('open');
}