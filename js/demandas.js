/* ================================================
   SAPASE – Gestion de Demandas (CRUD)
   ================================================ */

/* ---------- Formulario nuevo ---------- */
function initForm() {
  document.getElementById('f-folio').value = generarFolio();
  document.getElementById('f-fecha').value = fechaHoy();
  const hoy  = new Date();
  const yyyy = hoy.getFullYear();
  const mm   = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd   = String(hoy.getDate()).padStart(2, '0');
  document.getElementById('f-fecha-demanda').value = `${yyyy}-${mm}-${dd}`;
}

function clearForm() {
  ['f-ref','f-remitente','f-asunto','f-domicilio','f-colonia',
   'f-tel1','f-tel2','f-demanda','f-observaciones','f-concepto'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-area').value = '';
  initForm();
}

function formatDateInput(val) {
  if (!val) return '';
  const [y, m, d] = val.split('-');
  return `${d}/${m}/${y}`;
}

/* ---------- Guardar nueva demanda ---------- */
async function saveDemanda() {
  const area     = document.getElementById('f-area').value;
  const area_id  = getAreaId(area);
  const remitente= document.getElementById('f-remitente').value.trim();
  const asunto   = document.getElementById('f-asunto').value.trim();

  if (!remitente || !area_id || !asunto) {
    showToast('Complete los campos obligatorios: Remitente, Area y Asunto', 'error');
    return;
  }

  const payload = {
    ref:           document.getElementById('f-ref').value.trim(),
    area_id,
    remitente,
    asunto,
    domicilio:     document.getElementById('f-domicilio').value.trim(),
    colonia:       document.getElementById('f-colonia').value.trim(),
    tel1:          document.getElementById('f-tel1').value.trim(),
    tel2:          document.getElementById('f-tel2').value.trim(),
    demanda:       document.getElementById('f-demanda').value.trim(),
    observaciones: document.getElementById('f-observaciones').value.trim(),
    concepto:      document.getElementById('f-concepto').value.trim(),
    fecha_demanda: document.getElementById('f-fecha-demanda').value,
  };

  try {
    const rec = await apiCrearDemanda(payload);
    demandas.unshift(normalizeDemanda(rec));
    updateStats();
    renderDashboard();
    showToast('Demanda guardada: ' + rec.folio, 'success');
    clearForm();
    showPage('archivos');
  } catch (err) {
    showToast(err.message || 'Error al guardar demanda', 'error');
  }
}

/* ---------- Archivos / listado ---------- */
async function renderArchivos() {
  filterArchivos(); // mostrar cache local inmediatamente
  try {
    const raw = await apiGetDemandas();
    demandas  = raw.map(normalizeDemanda);
    filterArchivos(); // actualizar con datos frescos
  } catch (err) {
    // conservar cache local
  }
}

function filterArchivos() {
  const q  = (document.getElementById('search-input')?.value  || '').toLowerCase();
  const fa = document.getElementById('filter-area')?.value    || '';
  const fs = document.getElementById('filter-status')?.value  || '';

  filteredDemandas = demandas.filter(d => {
    const matchQ = !q || d.folio.toLowerCase().includes(q) ||
                   d.remitente.toLowerCase().includes(q)   ||
                   d.asunto.toLowerCase().includes(q);
    const matchA = !fa || d.area   === fa;
    const matchS = !fs || d.estado === fs;
    return matchQ && matchA && matchS;
  });

  renderArchivosTable(filteredDemandas);
}

function renderArchivosTable(list) {
  const tbody   = document.getElementById('archivos-table');
  const isAdmin = currentUser && currentUser.rol === 'Administrador';
  tbody.innerHTML = list.map(d => `
    <tr>
      <td><code style="font-size:11px; color:var(--guinda);">${d.folio}</code></td>
      <td>${d.fecha}</td>
      <td>${d.remitente}</td>
      <td><small>${d.area}</small></td>
      <td>${d.asunto}</td>
      <td>
        <select style="font-size:11px; padding:3px 6px; border:1px solid #ddd; border-radius:4px;"
                onchange="changeEstado('${d.id}', this.value)">
          <option ${d.estado==='Pendiente'  ?'selected':''}>Pendiente</option>
          <option ${d.estado==='En proceso' ?'selected':''}>En proceso</option>
          <option ${d.estado==='Atendida'   ?'selected':''}>Atendida</option>
        </select>
      </td>
      <td>
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="viewDemanda('${d.id}')">Ver</button>
          <button class="btn btn-guinda btn-sm"  onclick="exportSinglePDF('${d.id}')">Imprimir</button>
          <button class="btn btn-blue btn-sm"    onclick="openEditDemanda('${d.id}')">Editar</button>
          ${isAdmin ? `<button class="btn btn-red btn-sm" onclick="deleteDemanda('${d.id}')">Eliminar</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center; color:var(--gray); padding:20px;">Sin resultados</td></tr>';
}

async function changeEstado(id, estado) {
  try {
    await apiEditarDemanda(id, { estado });
    const d = demandas.find(x => x.id === id);
    if (d) d.estado = estado;
    updateStats();
  } catch (err) {
    showToast(err.message || 'Error al cambiar estado', 'error');
  }
}

/* ---------- Ver detalle ---------- */
async function viewDemanda(id) {
  currentViewId = id;
  const local = demandas.find(x => x.id === id);
  if (local) _renderViewModal(local); // mostrar inmediatamente con datos locales

  try {
    const raw  = await apiGetDemanda(id);
    const d    = normalizeDemanda(raw);
    const idx  = demandas.findIndex(x => x.id === id);
    if (idx >= 0) demandas[idx] = d;
    _renderViewModal(d); // actualizar con historial
  } catch (err) {
    if (!local) showToast(err.message || 'Error al cargar demanda', 'error');
  }
}

function _renderViewModal(d) {
  document.getElementById('modal-ver-content').innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:13px;">
      ${field2('Folio',             `<strong style="color:var(--guinda);">${d.folio}</strong>`)}
      ${field2('Fecha de Captura',  d.fecha)}
      ${field2('Fecha de Demanda',  d.fechaDemanda || '—')}
      ${field2('Referencia',        d.ref || '—')}
      ${field2('Area',              d.area)}
      ${field2col('Remitente',      d.remitente)}
      ${field2col('Asunto',         d.asunto)}
      ${field2('Domicilio',         d.domicilio || '—')}
      ${field2('Colonia',           d.colonia   || '—')}
      ${field2('Tel. Principal',    d.tel1 || '—')}
      ${field2('Tel. Secundario',   d.tel2 || '—')}
      ${field2col('Descripcion',    `<div style="background:var(--cream); padding:8px 10px; border-radius:6px;">${d.demanda || '—'}</div>`)}
      ${d.observaciones ? field2col('Observaciones', `<div style="background:var(--cream); padding:8px 10px; border-radius:6px;">${d.observaciones}</div>`) : ''}
      ${field2('Concepto', d.concepto || '—')}
      ${field2('Estado',   `<span class="badge ${badgeClass(d.estado)}">${d.estado}</span>`)}
      ${d.historial && d.historial.length ? historialHTML(d.historial) : ''}
    </div>
  `;
  document.getElementById('modal-ver').classList.add('open');
}

function field2(label, val) {
  return `<div>
    <div style="font-size:10px; font-weight:700; color:var(--guinda); text-transform:uppercase; margin-bottom:3px;">${label}</div>
    <div>${val}</div>
  </div>`;
}

function field2col(label, val) {
  return `<div style="grid-column:1/-1;">
    <div style="font-size:10px; font-weight:700; color:var(--guinda); text-transform:uppercase; margin-bottom:3px;">${label}</div>
    <div>${val}</div>
  </div>`;
}

function historialHTML(historial) {
  const items = historial.map(h =>
    `<div style="background:var(--cream); padding:8px 10px; border-radius:6px; margin-bottom:6px; font-size:12px;">
      <strong>${h.fecha}</strong> — De: <em>${h.de || '—'}</em> → Enviado a: <em>${h.area}</em>
      ${h.comentario ? `<br><span style="color:var(--gray);">${h.comentario}</span>` : ''}
    </div>`
  ).join('');
  return `<div style="grid-column:1/-1;">
    <div style="font-size:10px; font-weight:700; color:var(--guinda); text-transform:uppercase; margin-bottom:6px;">Historial de Transferencias</div>
    ${items}
  </div>`;
}

/* ---------- Editar demanda ---------- */
function openEditDemanda(id) {
  const d = demandas.find(x => x.id === id);
  if (!d) return;
  currentViewId = id;

  document.getElementById('ed-folio').value         = d.folio;
  document.getElementById('ed-fecha').value         = d.fecha;
  const fdRaw = d.fechaDemanda || '';
  if (fdRaw && fdRaw.includes('/')) {
    const [dd2, mm2, yy2] = fdRaw.split('/');
    document.getElementById('ed-fecha-demanda').value = `${yy2}-${mm2}-${dd2}`;
  } else {
    document.getElementById('ed-fecha-demanda').value = fdRaw;
  }
  document.getElementById('ed-ref').value           = d.ref          || '';
  document.getElementById('ed-area').value          = d.area         || '';
  document.getElementById('ed-remitente').value     = d.remitente    || '';
  document.getElementById('ed-asunto').value        = d.asunto       || '';
  document.getElementById('ed-domicilio').value     = d.domicilio    || '';
  document.getElementById('ed-colonia').value       = d.colonia      || '';
  document.getElementById('ed-tel1').value          = d.tel1         || '';
  document.getElementById('ed-tel2').value          = d.tel2         || '';
  document.getElementById('ed-demanda').value       = d.demanda      || '';
  document.getElementById('ed-observaciones').value = d.observaciones|| '';
  document.getElementById('ed-concepto').value      = d.concepto     || '';
  document.getElementById('ed-estado').value        = d.estado       || 'Pendiente';

  document.getElementById('ed-area').value = d.area || '';
  document.getElementById('modal-edit-demanda').classList.add('open');
}

async function saveEditDemanda() {
  const areaName = document.getElementById('ed-area').value;
  const area_id  = getAreaId(areaName);

  const payload = {
    ref:           document.getElementById('ed-ref').value.trim(),
    area_id,
    remitente:     document.getElementById('ed-remitente').value.trim(),
    asunto:        document.getElementById('ed-asunto').value.trim(),
    domicilio:     document.getElementById('ed-domicilio').value.trim(),
    colonia:       document.getElementById('ed-colonia').value.trim(),
    tel1:          document.getElementById('ed-tel1').value.trim(),
    tel2:          document.getElementById('ed-tel2').value.trim(),
    demanda:       document.getElementById('ed-demanda').value.trim(),
    observaciones: document.getElementById('ed-observaciones').value.trim(),
    concepto:      document.getElementById('ed-concepto').value.trim(),
    estado:        document.getElementById('ed-estado').value,
    fecha_demanda: document.getElementById('ed-fecha-demanda').value,
  };

  try {
    const updated = await apiEditarDemanda(currentViewId, payload);
    const norm    = normalizeDemanda(updated);
    const idx     = demandas.findIndex(x => x.id === currentViewId);
    if (idx >= 0) demandas[idx] = norm;
    filterArchivos();
    if (selectedArea) filterAreaDetail();
    updateStats();
    renderDashboard();
    closeModal('modal-edit-demanda');
    showToast('Demanda actualizada: ' + norm.folio, 'success');
  } catch (err) {
    showToast(err.message || 'Error al actualizar demanda', 'error');
  }
}

/* ---------- Eliminar demanda ---------- */
async function deleteDemanda(id) {
  if (!confirm('Eliminar esta demanda? Esta accion no se puede deshacer.')) return;
  try {
    await apiEliminarDemanda(id);
    demandas = demandas.filter(x => x.id !== id);
    filterArchivos();
    if (selectedArea) filterAreaDetail();
    updateStats();
    renderDashboard();
    showToast('Demanda eliminada', 'info');
  } catch (err) {
    showToast(err.message || 'Error al eliminar demanda', 'error');
  }
}

/* ---------- Transferir ---------- */
function openTransferModal(id) {
  transferId = id;
  closeModal('modal-ver');
  document.getElementById('transfer-comment').value = '';
  document.getElementById('modal-transfer').classList.add('open');
}

async function confirmTransfer() {
  const areaName = document.getElementById('transfer-area').value;
  const comentario = document.getElementById('transfer-comment').value.trim();
  if (!areaName) { showToast('Seleccione un area destino', 'error'); return; }

  const area_destino_id = getAreaId(areaName);
  if (!area_destino_id) { showToast('Area no encontrada', 'error'); return; }

  try {
    await apiTransferirDemanda(transferId, area_destino_id, comentario);

    // Actualizar cache local
    const d = demandas.find(x => x.id === transferId);
    if (d) {
      d.historial = d.historial || [];
      d.historial.push({ fecha: fechaHoy(), area: areaName, comentario, de: d.area });
      d.area   = areaName;
      d.estado = 'En proceso';
    }
    filterArchivos();
    renderAreasGrid();
    updateStats();
    showToast('Demanda enviada a: ' + areaName, 'success');
    closeModal('modal-transfer');
  } catch (err) {
    showToast(err.message || 'Error al transferir demanda', 'error');
  }
}
