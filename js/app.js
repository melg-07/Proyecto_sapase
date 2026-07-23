window.onload = function () {
  loadLogos();
  restoreSession();
};

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

// Stats
function updateStats() {
  document.getElementById('stat-total').textContent      = demandas.length;
  document.getElementById('stat-pendientes').textContent = demandas.filter(d => d.estado === 'Pendiente').length;
  document.getElementById('stat-atendidas').textContent  = demandas.filter(d => d.estado === 'Atendida').length;
  document.getElementById('stat-areas').textContent      = _areasCache.filter(a => a.activa).length;
}

// Dashboard
function renderDashboard() {
  const tbody = document.getElementById('dashboard-table');
  const list  = demandas.slice(0, 10);
  tbody.innerHTML = list.map(d => `
    <tr>
      <td><span class="folio-cell">${d.folio}</span></td>
      <td>${d.fecha}</td>
      <td>${d.remitente}</td>
      <td><small>${d.area}</small></td>
      <td>${d.asunto}</td>
      <td><span class="badge ${badgeClass(d.estado)}">${d.estado}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center; color:var(--gray); padding:20px;">Sin demandas registradas</td></tr>';
}

// Áreas
function renderAreasGrid() {
  const isJefe     = currentUser && isJefeArea(currentUser.rol);
  const isAreaUser = currentUser && (isAreaUsuario(currentUser.rol) || isJefe);

  const wrap = document.getElementById('areas-dropdown-wrap');
  if (wrap) wrap.style.display = isAreaUser ? 'none' : '';

  const btnCerrar = document.getElementById('btn-cerrar-area');
  if (btnCerrar) btnCerrar.style.display = isAreaUser ? 'none' : '';

  const title    = document.getElementById('areas-page-title');
  const subtitle = document.getElementById('areas-page-subtitle');
  if (title)    title.textContent    = isJefe ? 'Mi Area' : 'Areas';
  if (subtitle) subtitle.textContent = isJefe ? 'Resumen y peticiones de tu area' : 'Gestion por departamento';

  const sel = document.getElementById('areas-dropdown');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Seleccione un area —</option>';
  _areasCache.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.nombre;
    opt.textContent = `${a.nombre}${!a.activa ? ' — Inactiva' : ''}`;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
  if (selectedArea) _updateAreaInfoPanel(selectedArea);
}

function _updateAreaInfoPanel(areaNombre) {
  const idx = _areasCache.findIndex(a => a.nombre === areaNombre);
  if (idx < 0) return;
  const a          = _areasCache[idx];
  const lista      = demandas.filter(d => d.area === a.nombre);
  const total      = lista.length;
  const pendientes = lista.filter(d => d.estado === 'Pendiente').length;
  const enProceso  = lista.filter(d => d.estado === 'En proceso').length;
  const atendidas  = lista.filter(d => d.estado === 'Atendida').length;
  const isAdmin    = currentUser && isAdminLevel(currentUser.rol);

  document.getElementById('area-info-num').textContent  = `AREA ${String(idx + 1).padStart(2, '0')}`;
  document.getElementById('area-info-name').textContent = a.nombre;
  document.getElementById('area-info-jefe').textContent = a.jefe_area ? `Jefe de Area: ${a.jefe_area}` : 'Jefe de Area: —';
  document.getElementById('area-info-badge').innerHTML  = a.activa
    ? '<span class="badge badge-green">Activa</span>'
    : '<span class="badge badge-red">Inactiva</span>';
  document.getElementById('area-info-count').innerHTML  = `
    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
      <div style="text-align:center;">
        <div style="font-size:18px; font-weight:700; color:var(--guinda-dark);">${total}</div>
        <div style="font-size:10px; color:var(--gray); text-transform:uppercase; letter-spacing:.5px;">Total</div>
      </div>
      <div style="width:1px; background:#ddd; align-self:stretch;"></div>
      <div style="text-align:center;">
        <div style="font-size:18px; font-weight:700; color:var(--gold);">${pendientes}</div>
        <div style="font-size:10px; color:var(--gray); text-transform:uppercase; letter-spacing:.5px;">Pendientes</div>
      </div>
      <div style="width:1px; background:#ddd; align-self:stretch;"></div>
      <div style="text-align:center;">
        <div style="font-size:18px; font-weight:700; color:#1565C0;">${enProceso}</div>
        <div style="font-size:10px; color:var(--gray); text-transform:uppercase; letter-spacing:.5px;">En Proceso</div>
      </div>
      <div style="width:1px; background:#ddd; align-self:stretch;"></div>
      <div style="text-align:center;">
        <div style="font-size:18px; font-weight:700; color:#2E7D32;">${atendidas}</div>
        <div style="font-size:10px; color:var(--gray); text-transform:uppercase; letter-spacing:.5px;">Atendidas</div>
      </div>
    </div>`;
  document.getElementById('area-info-toggle').innerHTML  = isAdmin
    ? `<button class="btn btn-outline btn-sm" onclick="openEditArea(${a.id})">Editar</button>
       <button class="btn btn-outline btn-sm area-toggle-btn" onclick="toggleAreaEstado(${a.id})">${a.activa ? 'Desactivar' : 'Activar'}</button>`
    : '';
}

function openEditArea(id) {
  const a = _areasCache.find(x => x.id === id);
  if (!a) return;
  document.getElementById('ea-id').value     = a.id;
  document.getElementById('ea-nombre').value = a.nombre;
  document.getElementById('ea-jefe').value   = a.jefe_area || '';
  document.getElementById('modal-editar-area').classList.add('open');
}

async function saveEditArea() {
  const id     = document.getElementById('ea-id').value;
  const nombre = document.getElementById('ea-nombre').value.trim().toUpperCase();
  const jefe   = document.getElementById('ea-jefe').value.trim();
  if (!nombre) { showToast('Escribe el nombre del area', 'error'); return; }
  if (_areasCache.find(a => a.nombre === nombre && String(a.id) !== String(id))) {
    showToast('Ya existe un area con ese nombre', 'error');
    return;
  }

  try {
    await apiEditarArea(id, nombre, jefe);
    const a = _areasCache.find(x => String(x.id) === String(id));
    if (a) { a.nombre = nombre; a.jefe_area = jefe; }
    renderAreasGrid();
    populateAllSelects();
    if (selectedArea && a) { selectedArea = nombre; showAreaDetail(nombre); }
    closeModal('modal-editar-area');
    showToast('Area actualizada: ' + nombre, 'success');
  } catch (err) {
    showToast(err.message || 'Error al actualizar area', 'error');
  }
}

function onAreaDropdownChange(nombre) {
  if (!nombre) {
    document.getElementById('area-info-panel').style.display = 'none';
    document.getElementById('area-detail').style.display     = 'none';
    selectedArea = null;
    return;
  }
  showAreaDetail(nombre);
}

async function toggleAreaEstado(id) {
  try {
    const res = await apiToggleArea(id);
    const a = _areasCache.find(x => x.id === id);
    if (a) a.activa = res.activa;
    renderAreasGrid();
    populateAllSelects();
    updateStats();
    showToast('Area ' + (a && a.activa ? 'activada' : 'desactivada') + (a ? ': ' + a.nombre : ''), a && a.activa ? 'success' : 'info');
  } catch (err) {
    showToast(err.message || 'Error al cambiar estado', 'error');
  }
}

function openNuevaArea() {
  document.getElementById('na-nombre').value = '';
  document.getElementById('modal-nueva-area').classList.add('open');
  document.getElementById('na-nombre').focus();
}

async function saveNuevaArea() {
  const nombre = document.getElementById('na-nombre').value.trim().toUpperCase();
  if (!nombre) { showToast('Escribe el nombre del area', 'error'); return; }
  if (_areasCache.find(a => a.nombre === nombre)) { showToast('Ya existe un area con ese nombre', 'error'); return; }

  try {
    const area = await apiCrearArea(nombre);
    _areasCache.push(normalizeArea(area));
    renderAreasGrid();
    populateAllSelects();
    updateStats();
    closeModal('modal-nueva-area');
    showToast('Area agregada: ' + nombre, 'success');
  } catch (err) {
    showToast(err.message || 'Error al crear area', 'error');
  }
}

// Detalle de área
function showAreaDetail(area) {
  selectedArea = area;
  _updateAreaInfoPanel(area);
  document.getElementById('area-info-panel').style.display = 'block';
  document.getElementById('area-detail').style.display     = 'block';
  document.getElementById('area-detail-title').textContent = area;
  filterAreaDetail();
  document.getElementById('area-detail').scrollIntoView({ behavior: 'smooth' });
}

function hideAreaDetail() {
  document.getElementById('area-detail').style.display     = 'none';
  document.getElementById('area-info-panel').style.display = 'none';
  const sel = document.getElementById('areas-dropdown');
  if (sel) sel.value = '';
  selectedArea = null;
}

// Resumen de peticiones por subarea (pagina "Subareas", solo jefe de area)
async function renderSubareasPanel() {
  const tbody = document.getElementById('subareas-panel-table');
  if (!tbody) return;
  if (!currentUser || !currentUser.area_id) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray); padding:20px;">Sin area asignada</td></tr>';
    return;
  }

  try {
    const subareas = await apiGetSubareas(currentUser.area_id);
    tbody.innerHTML = subareas.map(s => {
      const lista      = demandas.filter(d => Number(d.subarea_id) === Number(s.id));
      const total      = lista.length;
      const pendientes = lista.filter(d => d.estado === 'Pendiente').length;
      const enProceso  = lista.filter(d => d.estado === 'En proceso').length;
      const atendidas  = lista.filter(d => d.estado === 'Atendida').length;
      return `
        <tr>
          <td>${s.nombre}</td>
          <td>${total}</td>
          <td>${pendientes}</td>
          <td>${enProceso}</td>
          <td>${atendidas}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center; color:var(--gray); padding:20px;">Sin subareas</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray); padding:20px;">Error al cargar las subareas</td></tr>';
  }
}

// Gestion de subareas (pagina "Subareas" del administrador: agregar/eliminar subareas de un area)
let _gsSelectedAreaId = null;

function renderGestionSubareas() {
  const sel = document.getElementById('gs-area-dropdown');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Seleccione un área —</option>' +
    _areasCache.map(a => `<option value="${a.id}">${a.nombre}${!a.activa ? ' — Inactiva' : ''}</option>`).join('');
  if (prev) sel.value = prev;

  if (_gsSelectedAreaId && _areasCache.some(a => String(a.id) === String(_gsSelectedAreaId))) {
    sel.value = _gsSelectedAreaId;
    loadGestionSubareas(_gsSelectedAreaId);
  } else {
    _gsSelectedAreaId = null;
    document.getElementById('gs-subareas-wrap').style.display = 'none';
  }
}

function onGestionSubareasAreaChange(areaId) {
  _gsSelectedAreaId = areaId || null;
  if (!areaId) {
    document.getElementById('gs-subareas-wrap').style.display = 'none';
    return;
  }
  loadGestionSubareas(areaId);
}

async function loadGestionSubareas(areaId) {
  const wrap  = document.getElementById('gs-subareas-wrap');
  const tbody = document.getElementById('gs-subareas-table');
  const area  = _areasCache.find(a => String(a.id) === String(areaId));
  wrap.style.display = 'block';
  document.getElementById('gs-subareas-title').textContent = area ? `Subareas de ${area.nombre}` : 'Subareas';
  document.getElementById('gs-nueva-subarea').value = '';
  tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:var(--gray); padding:20px;">Cargando...</td></tr>';

  try {
    const subareas = await apiGetSubareas(areaId);
    tbody._subareas = subareas;
    tbody.innerHTML = subareas.map(s => `
      <tr>
        <td>${s.nombre}</td>
        <td style="display:flex; gap:8px;">
          <button class="btn btn-outline btn-sm" onclick="openEditGestionSubarea(${s.id})">Editar</button>
          <button class="btn btn-outline btn-sm" onclick="deleteGestionSubarea(${s.id})">Eliminar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="2" style="text-align:center; color:var(--gray); padding:20px;">Sin subareas</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:var(--gray); padding:20px;">Error al cargar las subareas</td></tr>';
  }
}

async function addGestionSubarea() {
  if (!_gsSelectedAreaId) { showToast('Selecciona un area primero', 'error'); return; }
  const input  = document.getElementById('gs-nueva-subarea');
  const nombre = input.value.trim();
  if (!nombre) { showToast('Escribe el nombre de la subarea', 'error'); return; }

  try {
    await apiCrearSubarea(_gsSelectedAreaId, nombre);
    input.value = '';
    await loadGestionSubareas(_gsSelectedAreaId);
    showToast('Subarea agregada: ' + nombre, 'success');
  } catch (err) {
    showToast(err.message || 'Error al crear la subarea', 'error');
  }
}

function openEditGestionSubarea(id) {
  const tbody = document.getElementById('gs-subareas-table');
  const s = (tbody._subareas || []).find(x => x.id === id);
  if (!s) return;
  document.getElementById('es2-id').value     = s.id;
  document.getElementById('es2-nombre').value = s.nombre;
  document.getElementById('modal-editar-subarea').classList.add('open');
}

async function saveEditGestionSubarea() {
  const id     = document.getElementById('es2-id').value;
  const nombre = document.getElementById('es2-nombre').value.trim();
  if (!nombre) { showToast('Escribe el nombre de la subarea', 'error'); return; }

  try {
    await apiEditarSubarea(id, nombre);
    closeModal('modal-editar-subarea');
    await loadGestionSubareas(_gsSelectedAreaId);
    showToast('Subarea actualizada: ' + nombre, 'success');
  } catch (err) {
    showToast(err.message || 'Error al actualizar la subarea', 'error');
  }
}

async function deleteGestionSubarea(id) {
  if (!confirm('¿Eliminar esta subarea? Esta acción no se puede deshacer.')) return;
  try {
    await apiEliminarSubarea(id);
    await loadGestionSubareas(_gsSelectedAreaId);
    showToast('Subarea eliminada', 'success');
  } catch (err) {
    showToast(err.message || 'Error al eliminar la subarea', 'error');
  }
}

function filterAreaDetail() {
  const q       = (document.getElementById('area-search')?.value || '').toLowerCase();
  const fs      = document.getElementById('area-filter-status')?.value    || '';
  const fp      = document.getElementById('area-filter-prioridad')?.value || '';
  const isAdmin = currentUser && isAdminLevel(currentUser.rol);
  const list    = demandas.filter(d =>
    d.area === selectedArea &&
    (!q  || d.folio.toLowerCase().includes(q) || d.remitente.toLowerCase().includes(q) || d.asunto.toLowerCase().includes(q)) &&
    (!fs || d.estado    === fs) &&
    (!fp || d.prioridad === fp)
  );
  const tbody = document.getElementById('area-detail-table');
  tbody.innerHTML = list.map(d => `
    <tr>
      <td><span class="folio-cell">${d.folio}</span></td>
      <td>${d.fecha}</td>
      <td>${d.remitente}</td>
      <td>${d.asunto}</td>
      <td>
        <select style="font-size:11px; padding:3px 6px; border:1px solid #ddd; border-radius:4px;"
                onfocus="this.dataset.prev=this.value"
                onchange="changeEstadoArea('${d.id}', this.value, this)">
          <option ${d.estado==='Pendiente'  ?'selected':''}>Pendiente</option>
          <option ${d.estado==='En proceso' ?'selected':''}>En proceso</option>
          <option ${d.estado==='Atendida'   ?'selected':''}>Atendida</option>
        </select>
      </td>
      <td>
        <select style="font-size:11px; padding:3px 6px; border:1px solid #ddd; border-radius:4px;"
                onfocus="this.dataset.prev=this.value"
                onchange="changePrioridadArea('${d.id}', this.value, this)">
          <option ${d.prioridad==='Alta'  ?'selected':''}>Alta</option>
          <option ${d.prioridad==='Media' ?'selected':''}>Media</option>
          <option ${d.prioridad==='Baja'  ?'selected':''}>Baja</option>
        </select>
      </td>
      <td>
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="viewDemanda('${d.id}')">Ver</button>
          <button class="btn btn-guinda btn-sm" onclick="exportSinglePDF('${d.id}')">Imprimir</button>
          <button class="btn btn-blue btn-sm" onclick="openEditDemanda('${d.id}')">Editar</button>
          ${isAdmin ? `<button class="btn btn-red btn-sm" onclick="deleteDemanda('${d.id}')">Eliminar</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center; color:var(--gray); padding:20px;">Sin demandas en esta area</td></tr>';
}

function exportAreaExcel() {
  const list = demandas.filter(d => d.area === selectedArea);
  exportToExcel(list, selectedArea);
}

async function changePrioridadArea(id, prioridad, selectEl) {
  try {
    await apiEditarDemanda(id, { prioridad });
    const d = demandas.find(x => x.id === id);
    if (d) { d.prioridad = prioridad; }
    if (selectEl) selectEl.dataset.prev = prioridad;
    filterArchivos();
  } catch (err) {
    showToast(err.message || 'Error al cambiar prioridad', 'error');
    if (selectEl && selectEl.dataset.prev) selectEl.value = selectEl.dataset.prev;
  }
}

async function changeEstadoArea(id, estado, selectEl) {
  if (estado === 'En proceso' || estado === 'Atendida') {
    _pendingEstadoId  = id;
    _pendingEstadoVal = estado;
    _pendingEstadoSel = selectEl;
    document.getElementById('cambio-estado-titulo').textContent = `Cambiar estado a: ${estado}`;
    _clearEstadoFile();
    document.getElementById('cambio-estado-nota').value = '';
    document.getElementById('modal-cambio-estado').classList.add('open');
    return;
  }
  try {
    await apiEditarDemanda(id, { estado });
    const d = demandas.find(x => x.id === id);
    if (d) { d.estado = estado; }
    if (selectEl) selectEl.dataset.prev = estado;
    updateStats();
    renderDashboard();
    if (selectedArea) _updateAreaInfoPanel(selectedArea);
  } catch (err) {
    showToast(err.message || 'Error al cambiar estado', 'error');
    if (selectEl && selectEl.dataset.prev) selectEl.value = selectEl.dataset.prev;
  }
}

function handleEstadoDrop(event) {
  event.preventDefault();
  document.getElementById('cambio-estado-dropzone').style.borderColor = '#ccc';
  const file = event.dataTransfer.files[0];
  if (file) _setEstadoFile(file);
}

function handleEstadoFile(file) {
  if (file) _setEstadoFile(file);
}

function _setEstadoFile(file) {
  _pendingEstadoFile = file;
  document.getElementById('cambio-estado-filename').textContent = file.name;
  document.getElementById('cambio-estado-preview').style.display = 'flex';
}

function _clearEstadoFile() {
  _pendingEstadoFile = null;
  const inp = document.getElementById('cambio-estado-file');
  if (inp) inp.value = '';
  document.getElementById('cambio-estado-preview').style.display = 'none';
}

function cancelCambioEstado() {
  if (_pendingEstadoSel && _pendingEstadoSel.dataset.prev !== undefined) {
    _pendingEstadoSel.value = _pendingEstadoSel.dataset.prev;
  }
  _clearEstadoFile();
  closeModal('modal-cambio-estado');
  _pendingEstadoId = _pendingEstadoVal = _pendingEstadoSel = null;
}

async function confirmCambioEstado() {
  if (!_pendingEstadoFile) {
    showToast('Debes adjuntar un archivo para continuar', 'error');
    return;
  }
  try {
    const nota    = document.getElementById('cambio-estado-nota')?.value.trim() || '';
    const updated = await apiCambiarEstado(_pendingEstadoId, _pendingEstadoVal, _pendingEstadoFile, nota);
    const norm    = normalizeDemanda(updated);
    const idx     = demandas.findIndex(x => x.id === _pendingEstadoId);
    if (idx >= 0) demandas[idx] = norm;
    if (_pendingEstadoSel) _pendingEstadoSel.dataset.prev = _pendingEstadoVal;
    filterArchivos();
    filterAreaDetail();
    updateStats();
    renderDashboard();
    if (selectedArea) _updateAreaInfoPanel(selectedArea);
    showToast(`Estado cambiado a: ${_pendingEstadoVal}`, 'success');
    _clearEstadoFile();
    closeModal('modal-cambio-estado');
    _pendingEstadoId = _pendingEstadoVal = _pendingEstadoSel = null;
  } catch (err) {
    showToast(err.message || 'Error al cambiar estado', 'error');
    if (_pendingEstadoSel && _pendingEstadoSel.dataset.prev !== undefined) {
      _pendingEstadoSel.value = _pendingEstadoSel.dataset.prev;
    }
  }
}
