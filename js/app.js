/* ================================================
   SAPASE – Dashboard, Areas, Stats
   ================================================ */

window.onload = function () {
  // Login es el punto de entrada, no hacemos nada aqui
};

/* ---------- Stats ---------- */
function updateStats() {
  document.getElementById('stat-total').textContent      = demandas.length;
  document.getElementById('stat-pendientes').textContent = demandas.filter(d => d.estado === 'Pendiente').length;
  document.getElementById('stat-atendidas').textContent  = demandas.filter(d => d.estado === 'Atendida').length;
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const tbody = document.getElementById('dashboard-table');
  const list  = demandas.slice(0, 10);
  tbody.innerHTML = list.map(d => `
    <tr>
      <td><code style="font-size:11px; color:var(--guinda);">${d.folio}</code></td>
      <td>${d.fecha}</td>
      <td>${d.remitente}</td>
      <td><small>${d.area}</small></td>
      <td>${d.asunto}</td>
      <td><span class="badge ${badgeClass(d.estado)}">${d.estado}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center; color:var(--gray); padding:20px;">Sin demandas registradas</td></tr>';
}

/* ============================================================
   AREAS
   ============================================================ */
function renderAreasGrid() {
  const grid    = document.getElementById('areas-grid');
  const isAdmin = currentUser && currentUser.rol === 'Administrador';
  if (!grid) return;

  grid.innerHTML = _areasCache.map((a) => {
    const count       = demandas.filter(d => d.area === a.nombre).length;
    const estadoBadge = a.activa
      ? '<span class="badge badge-green">Activa</span>'
      : '<span class="badge badge-red">Inactiva</span>';
    const toggleBtn = isAdmin
      ? `<button class="btn btn-outline btn-sm area-toggle-btn" onclick="event.stopPropagation(); toggleAreaEstado(${a.id})">${a.activa ? 'Desactivar' : 'Activar'}</button>`
      : '';
    return `
      <div class="area-card ${!a.activa ? 'area-inactiva' : ''}" onclick="showAreaDetail('${a.nombre.replace(/'/g, "\\'")}')">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
          <div class="area-num">Area ${String(a.id).padStart(2,'0')}</div>
          ${estadoBadge}
        </div>
        <div class="area-name">${a.nombre}</div>
        <div class="area-count">${count} demanda${count !== 1 ? 's' : ''}</div>
        ${toggleBtn ? `<div style="margin-top:10px;">${toggleBtn}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function toggleAreaEstado(id) {
  try {
    const res = await apiToggleArea(id);
    const a = _areasCache.find(x => x.id === id);
    if (a) a.activa = res.activa;
    renderAreasGrid();
    populateAllSelects();
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
    closeModal('modal-nueva-area');
    showToast('Area agregada: ' + nombre, 'success');
  } catch (err) {
    showToast(err.message || 'Error al crear area', 'error');
  }
}

/* ---------- Detalle de area ---------- */
function showAreaDetail(area) {
  selectedArea = area;
  document.getElementById('area-detail').style.display = 'block';
  document.getElementById('area-detail-title').textContent = area;
  filterAreaDetail();
  document.getElementById('area-detail').scrollIntoView({ behavior: 'smooth' });
}

function hideAreaDetail() {
  document.getElementById('area-detail').style.display = 'none';
  selectedArea = null;
}

function filterAreaDetail() {
  const q       = (document.getElementById('area-search')?.value || '').toLowerCase();
  const isAdmin = currentUser && currentUser.rol === 'Administrador';
  const list    = demandas.filter(d =>
    d.area === selectedArea &&
    (!q || d.folio.toLowerCase().includes(q) || d.remitente.toLowerCase().includes(q) || d.asunto.toLowerCase().includes(q))
  );
  const tbody = document.getElementById('area-detail-table');
  tbody.innerHTML = list.map(d => `
    <tr>
      <td><code style="font-size:11px; color:var(--guinda);">${d.folio}</code></td>
      <td>${d.fecha}</td>
      <td>${d.remitente}</td>
      <td>${d.asunto}</td>
      <td><span class="badge ${badgeClass(d.estado)}">${d.estado}</span></td>
      <td>
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="viewDemanda('${d.id}')">Ver</button>
          <button class="btn btn-guinda btn-sm" onclick="exportSinglePDF('${d.id}')">Imprimir</button>
          <button class="btn btn-blue btn-sm" onclick="openEditDemanda('${d.id}')">Editar</button>
          ${isAdmin ? `<button class="btn btn-red btn-sm" onclick="deleteDemanda('${d.id}')">Eliminar</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center; color:var(--gray); padding:20px;">Sin demandas en esta area</td></tr>';
}

function exportAreaExcel() {
  const list = demandas.filter(d => d.area === selectedArea);
  exportToExcel(list, selectedArea);
}
