// Login
async function doLogin() {
  const u     = document.getElementById('username').value.trim();
  const p     = document.getElementById('password').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  try {
    const resp = await apiLogin(u, p);
    setToken(resp.token);

    currentUser = {
      id:       resp.user.id,
      name:     resp.user.nombre,
      user:     resp.user.usuario,
      rol:      resp.user.rol,
      area:     resp.user.area     || '',
      correo:   resp.user.correo   || '',
      telefono: resp.user.telefono || '',
      cargo:    resp.user.cargo    || '',
      active:   resp.user.activo,
    };

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

    const startPage = (currentUser.rol === 'Administrador') ? 'dashboard' : 'formulario';
    showPage(startPage);

  } catch (err) {
    errEl.textContent   = err.message || 'Usuario o contrasena incorrectos.';
    errEl.style.display = 'block';
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

  document.getElementById('app').style.display          = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('password').value             = '';
  document.getElementById('login-error').style.display  = 'none';
}

// Sidebar
function renderSidebar(activePage) {
  const isAdmin = currentUser && currentUser.rol === 'Administrador';
  let html = '';

  if (isAdmin) {
    html += navSection('Principal');
    html += navItem('dashboard',  'Dashboard',    activePage);
    html += navItem('formulario', 'Nueva Demanda', activePage);
    html += navSection('Gestion');
    html += navItem('archivos', 'Archivos', activePage);
    html += navItem('areas',    'Areas',    activePage);
    html += navSection('Sistema');
    html += navItem('usuarios', 'Usuarios', activePage);
  } else {
    html += navSection('Gestion');
    html += navItem('formulario', 'Nueva Demanda', activePage);
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

// Navegacion
function showPage(name) {
  const isAdmin = currentUser && currentUser.rol === 'Administrador';
  if (!isAdmin && !['formulario', 'archivos'].includes(name)) name = 'formulario';

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');

  renderSidebar(name);
  if (window.innerWidth <= 768) closeSidebar();

  if (name === 'formulario') initForm();

  const btnNuevaArea = document.getElementById('btn-nueva-area');
  if (btnNuevaArea) {
    btnNuevaArea.style.display = (name === 'areas' && isAdmin) ? 'inline-flex' : 'none';
  }

  if (name === 'archivos')  { renderArchivos(); }
  if (name === 'areas')     { renderAreasGrid(); hideAreaDetail(); }
  if (name === 'dashboard') { updateStats(); renderDashboard(); }
  if (name === 'usuarios')  { renderUsuarios(); }
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
