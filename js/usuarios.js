async function renderUsuarios() {
  const tbody   = document.getElementById('usuarios-table');
  const isAdmin = currentUser && currentUser.rol === 'Administrador';

  const btnNuevo = document.getElementById('btn-nuevo-usuario');
  if (btnNuevo) btnNuevo.style.display = isAdmin ? 'inline-flex' : 'none';

  try {
    const users = await apiGetUsuarios();
    _usersCache = users.map(normalizeUsuario);
    _renderUsuariosTable(_usersCache);
  } catch (err) {
    showToast(err.message || 'Error al cargar usuarios', 'error');
  }
}

function _renderUsuariosTable(list) {
  const tbody   = document.getElementById('usuarios-table');
  const isAdmin = currentUser && currentUser.rol === 'Administrador';

  tbody.innerHTML = list.map(u => `
    <tr>
      <td>${u.id}</td>
      <td><strong>${u.name}</strong></td>
      <td><code>${u.user}</code></td>
      <td><span>••••••••</span></td>
      <td>${u.correo   || '—'}</td>
      <td>${u.telefono || '—'}</td>
      <td>${u.cargo    || '—'}</td>
      <td><small>${u.area}</small></td>
      <td><span class="badge badge-blue">${u.rol}</span></td>
      <td><span class="badge ${u.active ? 'badge-green' : 'badge-red'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
      ${isAdmin ? `<td><button class="btn btn-outline btn-sm" onclick="openEditUser(${u.id})">Editar</button></td>` : '<td>—</td>'}
    </tr>
  `).join('') || '<tr><td colspan="11" style="text-align:center; padding:20px; color:var(--gray);">Sin usuarios</td></tr>';

  const thead = tbody.closest('table').querySelector('thead tr');
  if (thead && !thead.querySelector('th.th-acciones')) {
    const th = document.createElement('th');
    th.textContent = 'Acciones';
    th.className   = 'th-acciones';
    thead.appendChild(th);
  }
}

function toggleModalPw(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input || !btn) return;
  if (input.type === 'password') {
    input.type      = 'text';
    btn.textContent = 'Ocultar';
    btn.classList.add('active');
  } else {
    input.type      = 'password';
    btn.textContent = 'Ver';
    btn.classList.remove('active');
  }
}

function openEditUser(id) {
  if (!currentUser || currentUser.rol !== 'Administrador') {
    showToast('Solo los administradores pueden editar usuarios', 'error');
    return;
  }
  const u = _usersCache.find(x => x.id === id);
  if (!u) return;

  document.getElementById('eu-id').value       = u.id;
  document.getElementById('eu-name').value     = u.name;
  document.getElementById('eu-user').value     = u.user;
  document.getElementById('eu-password').value = u.password;
  document.getElementById('eu-correo').value   = u.correo   || '';
  document.getElementById('eu-telefono').value = u.telefono || '';
  document.getElementById('eu-cargo').value    = u.cargo    || '';
  document.getElementById('eu-rol').value      = u.rol;
  document.getElementById('eu-active').value   = String(u.active);

  const pwInput = document.getElementById('eu-password');
  const pwBtn   = document.getElementById('eu-pw-toggle');
  pwInput.type      = 'password';
  pwBtn.textContent = 'Ver';
  pwBtn.classList.remove('active');

  populateAreaSelect('eu-area', false);
  document.getElementById('eu-area').value = u.area || '';

  document.getElementById('modal-edit-user').classList.add('open');
}

async function saveEditUser() {
  const id      = parseInt(document.getElementById('eu-id').value);
  const newName = document.getElementById('eu-name').value.trim();
  const newUser = document.getElementById('eu-user').value.trim();
  const newPw   = document.getElementById('eu-password').value.trim();

  if (!newName || !newUser) {
    showToast('Nombre y usuario son obligatorios', 'error');
    return;
  }

  const areaName = document.getElementById('eu-area').value;
  const areaObj  = _areasCache.find(a => a.nombre === areaName);

  const payload = {
    nombre:   newName,
    usuario:  newUser,
    correo:   document.getElementById('eu-correo').value.trim(),
    telefono: document.getElementById('eu-telefono').value.trim(),
    cargo:    document.getElementById('eu-cargo').value.trim(),
    area_id:  areaObj ? areaObj.id : null,
    rol:      document.getElementById('eu-rol').value,
    activo:   document.getElementById('eu-active').value === 'true',
  };
  if (newPw) payload.password = newPw;

  try {
    await apiEditarUsuario(id, payload);

    // Si el usuario editado es el que esta logueado, actualiza la sesion activa
    if (currentUser && currentUser.id === id) {
      currentUser.name     = payload.nombre;
      currentUser.user     = payload.usuario;
      currentUser.correo   = payload.correo;
      currentUser.telefono = payload.telefono;
      currentUser.cargo    = payload.cargo;
      currentUser.area     = areaName;
      currentUser.rol      = payload.rol;
      currentUser.active   = payload.activo;
      document.getElementById('user-name').textContent      = currentUser.name.split(' ')[0];
      document.getElementById('user-avatar').textContent    = getInitials(currentUser.name);
      document.getElementById('user-rol-top').textContent   = currentUser.rol;
    }

    renderUsuarios();
    closeModal('modal-edit-user');
    showToast('Usuario actualizado: ' + payload.usuario, 'success');
  } catch (err) {
    showToast(err.message || 'Error al actualizar usuario', 'error');
  }
}

function openAddUser() {
  if (!currentUser || currentUser.rol !== 'Administrador') {
    showToast('Solo los administradores pueden crear usuarios', 'error');
    return;
  }

  ['nu-name','nu-user','nu-password','nu-correo','nu-telefono','nu-cargo'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('nu-rol').value = 'Capturista';

  const pwInput = document.getElementById('nu-password');
  const pwBtn   = document.getElementById('nu-pw-toggle');
  pwInput.type      = 'password';
  pwBtn.textContent = 'Ver';
  pwBtn.classList.remove('active');

  populateAreaSelect('nu-area', false);
  document.getElementById('modal-new-user').classList.add('open');
}

async function saveNewUser() {
  const name = document.getElementById('nu-name').value.trim();
  const user = document.getElementById('nu-user').value.trim();
  const pw   = document.getElementById('nu-password').value.trim();

  if (!name || !user || !pw) {
    showToast('Nombre, usuario y contrasena son obligatorios', 'error');
    return;
  }

  const areaName = document.getElementById('nu-area').value;
  const areaObj  = _areasCache.find(a => a.nombre === areaName);

  const payload = {
    nombre:   name,
    usuario:  user,
    password: pw,
    area_id:  areaObj ? areaObj.id : null,
    correo:   document.getElementById('nu-correo').value.trim(),
    telefono: document.getElementById('nu-telefono').value.trim(),
    cargo:    document.getElementById('nu-cargo').value.trim(),
    rol:      document.getElementById('nu-rol').value,
  };

  try {
    await apiCrearUsuario(payload);
    renderUsuarios();
    closeModal('modal-new-user');
    showToast('Usuario creado: ' + payload.usuario, 'success');
  } catch (err) {
    showToast(err.message || 'Error al crear usuario', 'error');
  }
}
