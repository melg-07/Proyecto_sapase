/* ================================================
   SAPASE – Gestion de Peticiones (CRUD)
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

/* ---------- Guardar nueva petición ---------- */
async function saveDemanda() {
  const area     = document.getElementById('f-area').value;
  const area_id  = getAreaId(area);
  const remitente= document.getElementById('f-remitente').value.trim();
  const asunto   = document.getElementById('f-asunto').value.trim();
  const domicilio= document.getElementById('f-domicilio').value.trim();
  const colonia  = document.getElementById('f-colonia').value.trim();
  const tel1     = document.getElementById('f-tel1').value.trim();

  if (!remitente || !area_id || !asunto || !domicilio || !colonia || !tel1) {
    showToast('Rellene los campos obligatorios', 'error');
    return;
  }

  const payload = {
    ref:           document.getElementById('f-ref').value.trim(),
    area_id,
    remitente,
    asunto,
    domicilio,
    colonia,
    tel1,
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
  const fp = document.getElementById('filter-prioridad')?.value || '';

  filteredDemandas = demandas.filter(d => {
    const matchQ = !q || d.folio.toLowerCase().includes(q) ||
                   d.remitente.toLowerCase().includes(q)   ||
                   d.asunto.toLowerCase().includes(q);
    const matchA = !fa || d.area      === fa;
    const matchS = !fs || d.estado    === fs;
    const matchP = !fp || d.prioridad === fp;
    return matchQ && matchA && matchS && matchP;
  });

  renderArchivosTable(filteredDemandas);
}

function renderArchivosTable(list) {
  const tbody        = document.getElementById('archivos-table');
  const isAdmin       = currentUser && isAdminLevel(currentUser.rol);
  const isAreaUser    = currentUser && (isAreaUsuario(currentUser.rol) || isJefeArea(currentUser.rol));
  const isSubareaUser = currentUser && isSubareaUsuario(currentUser.rol);

  tbody.innerHTML = list.map(d => `
    <tr>
      <td><code style="font-size:11px; color:var(--guinda);">${d.folio}</code></td>
      <td>${d.fecha}</td>
      <td>${d.remitente}</td>
      <td><small>${d.area}</small></td>
      <td>${d.asunto}</td>
      <td>${isSubareaUser ? `
        <select style="font-size:11px; padding:3px 6px; border:1px solid #ddd; border-radius:4px;"
                onfocus="this.dataset.prev=this.value"
                onchange="changeEstadoArea('${d.id}', this.value, this)">
          <option ${d.estado==='Pendiente'  ?'selected':''}>Pendiente</option>
          <option ${d.estado==='En proceso' ?'selected':''}>En proceso</option>
          <option ${d.estado==='Atendida'   ?'selected':''}>Atendida</option>
        </select>` : `<span class="badge ${badgeClass(d.estado)}">${d.estado}</span>`}</td>
      <td><span class="badge ${prioridadBadgeClass(d.prioridad)}">${d.prioridad}</span></td>
      <td>
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="viewDemanda('${d.id}')">Ver</button>
          <button class="btn btn-guinda btn-sm"  onclick="exportSinglePDF('${d.id}')">Imprimir</button>
          ${isAreaUser ? `<button class="btn btn-blue btn-sm" onclick="openEditDemanda('${d.id}')">Editar</button>` : ''}
          ${isAreaUser ? `<button class="btn btn-outline btn-sm" onclick="openEnviarSubarea('${d.id}')">Enviar a Subarea</button>` : ''}
          ${isAdmin ? `<button class="btn btn-red btn-sm" onclick="deleteDemanda('${d.id}')">Eliminar</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center; color:var(--gray); padding:20px;">Sin resultados</td></tr>';
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
      ${d.subarea ? field2('Subarea', d.subarea) : ''}
      ${field2col('Remitente',      d.remitente)}
      ${field2col('Descripcion',    d.asunto)}
      ${field2('Domicilio',         d.domicilio || '—')}
      ${field2('Colonia',           d.colonia   || '—')}
      ${field2('Tel. Principal',    d.tel1 || '—')}
      ${field2('Tel. Secundario',   d.tel2 || '—')}
      ${field2col('Demanda',         `<div style="background:var(--cream); padding:8px 10px; border-radius:6px;">${d.demanda || '—'}</div>`)}
      ${d.observaciones ? field2col('Observaciones', `<div style="background:var(--cream); padding:8px 10px; border-radius:6px;">${d.observaciones}</div>`) : ''}
      ${field2('Concepto', d.concepto || '—')}
      ${field2('Estado',   `<span class="badge ${badgeClass(d.estado)}">${d.estado}</span>`)}
      ${field2('Prioridad', `<span class="badge ${prioridadBadgeClass(d.prioridad)}">${d.prioridad}</span>`)}
      ${d.historial && d.historial.length ? historialHTML(d.historial) : ''}
      ${d.historialEstados && d.historialEstados.length ? historialEstadosHTML(d.historialEstados) : ''}
      ${d.historialEdiciones && d.historialEdiciones.length ? historialEdicionesHTML(d.historialEdiciones) : ''}
    </div>
  `;

  const btnTransferir = document.getElementById('btn-transferir-demanda');
  if (btnTransferir) {
    const isAdmin = currentUser && isAdminLevel(currentUser.rol);
    btnTransferir.style.display = isAdmin ? '' : 'none';
  }

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

function historialEstadosHTML(historial) {
  const items = historial.map(h => {
    const archivoLink = h.archivoRuta
      ? `<a href="/uploads/${h.archivoRuta}" target="_blank"
            style="color:var(--guinda); font-size:11px; display:inline-flex; align-items:center; gap:3px; margin-top:4px;">
           &#128206; ${h.archivoNombre}
         </a>`
      : '';
    return `
      <div style="background:var(--cream); padding:8px 10px; border-radius:6px; margin-bottom:6px; font-size:12px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <strong>${h.fecha}</strong>
          <span class="badge ${badgeClass(h.estadoAnterior)}" style="font-size:10px;">${h.estadoAnterior || '—'}</span>
          <span style="color:var(--gray);">→</span>
          <span class="badge ${badgeClass(h.estadoNuevo)}" style="font-size:10px;">${h.estadoNuevo}</span>
          ${h.cambiadoPor ? `<span style="color:var(--gray); font-size:11px;">por ${h.cambiadoPor}</span>` : ''}
        </div>
        ${archivoLink ? `<div>${archivoLink}</div>` : ''}
      </div>`;
  }).join('');
  return `<div style="grid-column:1/-1;">
    <div style="font-size:10px; font-weight:700; color:var(--guinda); text-transform:uppercase; margin-bottom:6px;">Historial de Cambios de Estado</div>
    ${items}
  </div>`;
}

function historialEdicionesHTML(historial) {
  const items = historial.map(h => {
    const cambios = Object.entries(h.campos).map(([campo, vals]) =>
      `<div style="margin-top:4px; padding-left:8px; border-left:2px solid var(--guinda); font-size:11px;">
        <span style="font-weight:600;">${campo}:</span>
        <span style="color:#999; text-decoration:line-through; margin:0 5px;">${vals.antes || '—'}</span>
        <span style="color:var(--gray);">→</span>
        <span style="margin-left:5px;">${vals.despues || '—'}</span>
      </div>`
    ).join('');
    return `
      <div style="background:var(--cream); padding:8px 10px; border-radius:6px; margin-bottom:6px; font-size:12px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <strong>${h.fecha}</strong>
          ${h.editadoPor ? `<span style="color:var(--gray); font-size:11px;">por ${h.editadoPor}</span>` : ''}
        </div>
        ${cambios}
      </div>`;
  }).join('');
  return `<div style="grid-column:1/-1;">
    <div style="font-size:10px; font-weight:700; color:var(--guinda); text-transform:uppercase; margin-bottom:6px;">Historial de Ediciones</div>
    ${items}
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

/* ---------- Editar petición ---------- */
function openEditDemanda(id) {
  if (!currentUser || currentUser.rol === 'Consulta') {
    showToast('El usuario de consulta solo puede ver e imprimir', 'error');
    return;
  }
  if (isSubareaUsuario(currentUser.rol)) {
    showToast('Los usuarios de subarea solo pueden cambiar el estado', 'error');
    return;
  }
  const d = demandas.find(x => x.id === id);
  if (!d) return;
  currentViewId  = id;

  // Estado: Administrador/Subadmin y el jefe de area. Prioridad: ademas, el usuario de area
  const isAdmin       = isAdminLevel(currentUser.rol);
  const isAreaUser    = isAreaUsuario(currentUser.rol);
  const isJefeAreaUser = isJefeArea(currentUser.rol);
  const estadoGroup   = document.getElementById('ed-estado-group');
  const prioridadGroup = document.getElementById('ed-prioridad-group');
  if (estadoGroup)    estadoGroup.style.display    = (isAdmin || isJefeAreaUser) ? '' : 'none';
  if (prioridadGroup) prioridadGroup.style.display = (isAdmin || isAreaUser || isJefeAreaUser) ? '' : 'none';

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
  document.getElementById('ed-prioridad').value     = d.prioridad    || 'Media';

  document.getElementById('ed-area').value = d.area || '';
  document.getElementById('modal-edit-demanda').classList.add('open');
}

async function saveEditDemanda() {
  const areaName   = document.getElementById('ed-area').value;
  const area_id    = getAreaId(areaName);
  const isAdmin       = currentUser && isAdminLevel(currentUser.rol);
  const isAreaUser    = currentUser && isAreaUsuario(currentUser.rol);
  const isJefeAreaUser = currentUser && isJefeArea(currentUser.rol);

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
    fecha_demanda: document.getElementById('ed-fecha-demanda').value,
  };
  if (isAdmin || isJefeAreaUser) payload.estado = document.getElementById('ed-estado').value;
  if (isAdmin || isAreaUser || isJefeAreaUser) payload.prioridad = document.getElementById('ed-prioridad').value;

  try {
    const updated = await apiEditarDemanda(currentViewId, payload);
    const norm    = normalizeDemanda(updated);
    const idx     = demandas.findIndex(x => x.id === currentViewId);
    if (idx >= 0) demandas[idx] = norm;
    filterArchivos();
    if (selectedArea) { filterAreaDetail(); _updateAreaInfoPanel(selectedArea); }
    updateStats();
    renderDashboard();
    closeModal('modal-edit-demanda');
    showToast('Demanda actualizada: ' + norm.folio, 'success');
  } catch (err) {
    showToast(err.message || 'Error al actualizar demanda', 'error');
  }
}

/* ---------- Eliminar petición ---------- */
async function deleteDemanda(id) {
  if (!confirm('Eliminar esta demanda? Esta accion no se puede deshacer.')) return;
  try {
    await apiEliminarDemanda(id);
    demandas = demandas.filter(x => x.id !== id);
    filterArchivos();
    if (selectedArea) { filterAreaDetail(); _updateAreaInfoPanel(selectedArea); }
    updateStats();
    renderDashboard();
    showToast('Demanda eliminada', 'info');
  } catch (err) {
    showToast(err.message || 'Error al eliminar demanda', 'error');
  }
}

/* ---------- Transferir ---------- */
function openTransferModal(id) {
  if (!currentUser || currentUser.rol === 'Consulta') {
    showToast('El usuario de consulta solo puede ver e imprimir', 'error');
    return;
  }
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
    if (selectedArea) filterAreaDetail();
    updateStats();
    showToast('Demanda enviada a: ' + areaName, 'success');
    closeModal('modal-transfer');
  } catch (err) {
    showToast(err.message || 'Error al transferir demanda', 'error');
  }
}

/* ---------- Enviar a subarea ---------- */
let enviarSubareaId = null;

async function openEnviarSubarea(id) {
  enviarSubareaId = id;
  const sel = document.getElementById('es-subarea');
  sel.innerHTML = '<option value="">Cargando...</option>';
  document.getElementById('modal-enviar-subarea').classList.add('open');

  try {
    const list = await apiGetSubareas(currentUser.area_id);
    sel._subareas = list;
    sel.innerHTML = list.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')
      || '<option value="">Sin subareas</option>';
  } catch (err) {
    sel.innerHTML = '<option value="">Error al cargar</option>';
    showToast(err.message || 'Error al cargar subareas', 'error');
  }
}

async function confirmEnviarSubarea() {
  const sel        = document.getElementById('es-subarea');
  const subarea_id = sel.value;
  if (!subarea_id) { showToast('Seleccione una subarea', 'error'); return; }

  const subareaObj = (sel._subareas || []).find(s => String(s.id) === String(subarea_id));

  try {
    const updated = await apiEnviarSubarea(enviarSubareaId, subarea_id);
    const norm    = normalizeDemanda(updated);
    const idx     = demandas.findIndex(x => x.id === enviarSubareaId);
    if (idx >= 0) demandas[idx] = norm;
    filterArchivos();
    closeModal('modal-enviar-subarea');
    showToast('Enviado a subarea: ' + (subareaObj ? subareaObj.nombre : ''), 'success');
  } catch (err) {
    showToast(err.message || 'Error al enviar a subarea', 'error');
  }
}
