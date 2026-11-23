/* ================================================
   SAPASE – Gestion de Peticiones 
   ================================================ */
   

let _pendingNewDemand = null;
let _savingNewDemand = false;
const _pendingNewDemandStorageKey = 'sapase_pending_new_demand';

/* ---------- Formulario Nuevo ---------- */
function initForm() {
  if (_pendingNewDemand) {
    renderPendingNewDemandState();
    return;
  }
  document.getElementById('f-folio').value = generarFolio();
  document.getElementById('f-fecha').value = fechaHoy();
  const hoy  = new Date();
  const yyyy = hoy.getFullYear();
  const mm   = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd   = String(hoy.getDate()).padStart(2, '0');
  document.getElementById('f-fecha-demanda').value = `${yyyy}-${mm}-${dd}`;
  renderPendingNewDemandState();
}

function clearForm() {
  if (_pendingNewDemand) {
    showToast('Adjunta al menos un documento a la petición antes de salir o crear otra', 'error');
    return;
  }
  ['f-ref','f-remitente','f-asunto','f-domicilio','f-colonia',
   'f-tel1','f-tel2','f-demanda','f-observaciones','f-concepto'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-area').value = '';
  document.getElementById('f-tipo-peticion').value = '';
  _pendingUploadedDocs.forEach(item => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  _pendingUploadedDocs = [];
  renderUploadedDocs();
  initForm();
}

function renderPendingNewDemandState() {
  const form = document.getElementById('page-formulario');
  if (!form) return;

  const isPending = !!_pendingNewDemand;
  form.querySelectorAll('input, select, textarea').forEach(input => {
    input.disabled = isPending;
  });

  const folioGroup = document.getElementById('f-folio-group');
  if (folioGroup) folioGroup.style.display = isPending ? '' : 'none';

  const status = document.getElementById('nueva-peticion-status');
  if (status) {
    status.style.display = isPending ? 'block' : 'none';
    status.textContent = isPending
      ? `Petición guardada. Folio: ${_pendingNewDemand.folio || 'pendiente'}. ${_pendingUploadedDocs.length} documento(s) listo(s). Puedes seguir escaneando o subir documentos y guardarlos cuando termines.`
      : '';
  }

  const uploadButton = document.getElementById('btn-subir-documentos');
  const scanButton = document.getElementById('btn-escanear-documentos');
  const saveDocumentsButton = document.getElementById('btn-guardar-documentos-pendientes');
  const clearButton = document.getElementById('btn-limpiar-form');
  const saveButton = document.getElementById('btn-guardar-peticion');
  if (uploadButton) uploadButton.style.display = isPending ? '' : 'none';
  if (scanButton) scanButton.style.display = isPending ? '' : 'none';
  if (saveDocumentsButton) {
    saveDocumentsButton.style.display = isPending ? '' : 'none';
    saveDocumentsButton.disabled = !_pendingUploadedDocs.length || _savingPendingDemandDocs;
  }
  if (clearButton) clearButton.style.display = isPending ? 'none' : '';
  if (saveButton) saveButton.style.display = isPending ? 'none' : '';
}

function populateNewDemandForm(demanda) {
  const fields = {
    'f-folio': demanda.folio,
    'f-fecha': demanda.fechaHoraCaptura || demanda.fecha,
    'f-ref': demanda.ref,
    'f-area': demanda.area_id,
    'f-tipo-peticion': demanda.tipo_peticion,
    'f-remitente': demanda.remitente,
    'f-asunto': demanda.asunto,
    'f-domicilio': demanda.domicilio,
    'f-colonia': demanda.colonia,
    'f-tel1': demanda.tel1,
    'f-tel2': demanda.tel2,
    'f-demanda': demanda.demanda,
    'f-observaciones': demanda.observaciones,
    'f-concepto': demanda.concepto,
  };
  Object.entries(fields).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value || '';
  });

  let fechaDemanda = demanda.fechaDemanda || '';
  if (fechaDemanda.includes('/')) {
    const [day, month, year] = fechaDemanda.split('/');
    fechaDemanda = `${year}-${month}-${day}`;
  } else if (fechaDemanda.includes('T')) {
    fechaDemanda = fechaDemanda.slice(0, 10);
  }
  document.getElementById('f-fecha-demanda').value = fechaDemanda;
}

async function restorePendingNewDemand() {
  const saved = sessionStorage.getItem(_pendingNewDemandStorageKey);
  if (!saved) return;

  let pending;
  try {
    pending = JSON.parse(saved);
  } catch (err) {
    sessionStorage.removeItem(_pendingNewDemandStorageKey);
    showToast('No se pudo recuperar la petición pendiente de documentos', 'error');
    return;
  }
  if (!pending || !pending.id) {
    sessionStorage.removeItem(_pendingNewDemandStorageKey);
    showToast('No se pudo recuperar la petición pendiente de documentos', 'error');
    return;
  }

  try {
    const demanda = normalizeDemanda(await apiGetDemanda(pending.id));
    if (demanda.adjuntos.length) {
      sessionStorage.removeItem(_pendingNewDemandStorageKey);
      return;
    }
    _pendingNewDemand = demanda;
    populateNewDemandForm(demanda);
  } catch (err) {
    _pendingNewDemand = { id: pending.id, folio: pending.folio || '', adjuntos: [] };
    showToast(err.message || 'No se pudo verificar la petición pendiente', 'error');
  }
  renderPendingNewDemandState();
}

function finishNewDemandAfterDocuments(adjuntos) {
  if (!_pendingNewDemand) return;
  const demanda = _pendingNewDemand;
  demanda.adjuntos = [...(demanda.adjuntos || []), ...(adjuntos || []).map(item => ({
    id: item.id,
    nombre: item.nombre || item.name || '',
    ruta: item.ruta || item.path || '',
  }))];
  const index = demandas.findIndex(item => String(item.id) === String(demanda.id));
  if (index >= 0) demandas[index] = demanda;

  _pendingNewDemand = null;
  sessionStorage.removeItem(_pendingNewDemandStorageKey);
  clearForm();
  updateStats();
  renderDashboard();
  showPage('archivos');
  showToast(`Petición ${demanda.folio} lista; se agregó el documento`, 'success');
}

window.addEventListener('beforeunload', event => {
  if (!_pendingNewDemand) return;
  event.preventDefault();
  event.returnValue = '';
});

function renderUploadedDocs() {
  const panel = document.getElementById('uploaded-files-panel');
  const list = document.getElementById('uploaded-files-list');
  if (!panel || !list) return;
  if (!_pendingUploadedDocs.length) {
    panel.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  panel.style.display = 'block';
  list.innerHTML = _pendingUploadedDocs.map((item, idx) => `
    <li style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <a href="${_escapeFileName(item.previewUrl || '')}" target="_blank" rel="noopener" style="flex:1; color:#1565c0;">${_escapeFileName(item.name || item.nombre || 'Documento')}</a>
      <button type="button" title="Quitar" style="background:none; border:none; cursor:pointer; color:#999; font-size:14px;"
              onclick="removePendingUploadedDoc(${idx})">&#215;</button>
    </li>
  `).join('');
}

function removePendingUploadedDoc(idx) {
  if (_pendingUploadedDocs[idx]?.previewUrl) URL.revokeObjectURL(_pendingUploadedDocs[idx].previewUrl);
  _pendingUploadedDocs.splice(idx, 1);
  renderUploadedDocs();
  renderPendingNewDemandState();
}

function openSubirDocumentos(demandaId = null, consultaGlobal = false) {
  const targetId = demandaId || (_pendingNewDemand && _pendingNewDemand.id) || null;
  const isPendingNewDemand = _pendingNewDemand
    && String(targetId) === String(_pendingNewDemand.id);
  if (targetId && !isPendingNewDemand && !puedeAgregarAdjuntosConsultaGlobal()) {
    showToast('Solo la jefa de área de Contact Center puede agregar documentos a una petición existente', 'error');
    return;
  }
  if (consultaGlobal && (!targetId || !puedeAgregarAdjuntosConsultaGlobal())) {
    showToast('No tienes permiso para agregar documentos desde Consulta', 'error');
    return;
  }
  _subirDocumentosDemandaId = targetId;
  _subirDocumentosConsultaGlobal = !!consultaGlobal;
  _clearSubirDocumentosFile();
  document.getElementById('subir-documentos-title').textContent = targetId
    ? 'Agregar documentos a la petición'
    : 'Subir Documentos';
  document.getElementById('subir-documentos-description').textContent = isPendingNewDemand
    ? `Adjunta al menos un documento a la petición ${_pendingNewDemand.folio || ''}.`
    : targetId
    ? 'Adjunta documentos a esta petición.'
    : 'Adjunta los documentos que deseas incluir en esta petición.';
  document.getElementById('subir-documentos-confirm').textContent = targetId
    ? 'Guardar documentos'
    : 'Agregar Documento(s)';
  document.getElementById('modal-subir-documentos').classList.add('open');
}

function formatFixedPhone(value) {
  const digits = (value.match(/\d/g) || []).join('').slice(0, 10);
  if (!digits) return '';
  const part1 = digits.slice(0, 2);
  const part2 = digits.slice(2, 6);
  const part3 = digits.slice(6, 10);
  return part1 + (part2 ? ' ' + part2 : '') + (part3 ? ' ' + part3 : '');
}

function formatPhoneInput(input) {
  input.value = formatFixedPhone(input.value);
}

function formatDateInput(val) {
  if (!val) return '';
  const [y, m, d] = val.split('-');
  return `${d}/${m}/${y}`;
}

/* ---------- Guardar nueva petición ---------- */
async function saveDemanda() {
  if (_pendingNewDemand) {
    showToast('Adjunta al menos un documento a la petición actual antes de crear otra', 'error');
    return;
  }
  if (_savingNewDemand) return;

  const areaValue = document.getElementById('f-area').value;
  const area_id  = areaValue ? Number(areaValue) : null;
  const tipo_peticion = document.getElementById('f-tipo-peticion').value;
  const remitente= document.getElementById('f-remitente').value.trim();
  const asunto   = document.getElementById('f-asunto').value.trim();
  const domicilio= document.getElementById('f-domicilio').value.trim();
  const colonia  = document.getElementById('f-colonia').value.trim();
  const tel1     = document.getElementById('f-tel1').value.trim();
  const tel2     = document.getElementById('f-tel2').value.trim();
  const cleanTel1= (tel1.match(/\d/g) || []).join('');
  const cleanTel2= (tel2.match(/\d/g) || []).join('');

  if (!remitente || !area_id || !asunto || !domicilio || !colonia || !cleanTel1) {
    showToast('Capture Área, Nombre, Asunto, Domicilio, Colonia y Teléfono Principal', 'error');
    return;
  }

  if (cleanTel1.length !== 10) {
    showToast('Teléfono Principal debe tener 10 dígitos', 'error');
    return;
  }

  if (cleanTel2 && cleanTel2.length !== 10) {
    showToast('Teléfono Secundario debe tener 10 dígitos o estar vacío', 'error');
    return;
  }

  const payload = {
    ref:           document.getElementById('f-ref').value.trim(),
    area_id,
    tipo_peticion,
    remitente,
    asunto,
    domicilio,
    colonia,
    tel1:          formatFixedPhone(tel1),
    tel2:          tel2 ? formatFixedPhone(tel2) : '',
    demanda:       document.getElementById('f-demanda').value.trim(),
    observaciones: document.getElementById('f-observaciones').value.trim(),
    concepto:      document.getElementById('f-concepto').value.trim(),
    fecha_demanda: document.getElementById('f-fecha-demanda').value,
  };

  const saveButton = document.getElementById('btn-guardar-peticion');
  _savingNewDemand = true;
  if (saveButton) saveButton.disabled = true;
  try {
    const rec = await apiCrearDemanda(payload, []);
    const created = normalizeDemanda(rec);
    created.adjuntos = Array.isArray(rec.adjuntos) ? rec.adjuntos : [];
    demandas.unshift(created);
    updateStats();
    renderDashboard();

    _pendingNewDemand = created;
    document.getElementById('f-folio').value = created.folio;
    sessionStorage.setItem(_pendingNewDemandStorageKey, JSON.stringify({
      id: created.id,
      folio: created.folio,
    }));
    renderPendingNewDemandState();
    showToast(`Petición guardada exitosamente. Folio: ${created.folio}`, 'success');
  } catch (err) {
    showToast(err.message || 'Error al guardar demanda', 'error');
  } finally {
    _savingNewDemand = false;
    if (saveButton) saveButton.disabled = false;
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
                   String(d.ref || '').toLowerCase().includes(q)  ||
                   String(d.ref2 || '').toLowerCase().includes(q) ||
                   d.remitente.toLowerCase().includes(q)   ||
                   d.asunto.toLowerCase().includes(q);
    const matchA = !fa || d.area      === fa;
    const matchS = !fs || d.estado    === fs;
    const matchP = !fp || d.prioridad === fp;
    return matchQ && matchA && matchS && matchP;
  });

  renderArchivosTable(filteredDemandas);
}

async function renderConsultaGlobal() {
  const tbody = document.getElementById('consulta-table');
  const subtitle = document.getElementById('consulta-subtitle');
  if (subtitle) {
    subtitle.textContent = puedeEditarConsultaGlobal()
      ? 'Consulta de peticiones de todas las áreas; puedes editar peticiones'
      : 'Consulta de peticiones de todas las áreas (solo lectura)';
  }
  if (!puedeConsultarTodasLasAreas()) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">No tienes permiso para consultar todas las áreas</td></tr>';
    return;
  }
  try {
    _consultaDemandas = (await apiGetDemandasConsultaGlobal()).map(normalizeDemanda);
    filterConsultaGlobal();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;">${_escapeFileName(err.message || 'Error al cargar las peticiones')}</td></tr>`;
  }
}

function filterConsultaGlobal() {
  const query = (document.getElementById('consulta-search-input')?.value || '').trim().toLowerCase();
  const area = document.getElementById('consulta-filter-area')?.value || '';
  const estado = document.getElementById('consulta-filter-status')?.value || '';
  const prioridad = document.getElementById('consulta-filter-prioridad')?.value || '';
  const list = _consultaDemandas.filter(d => {
    const matchesQuery = !query || [d.folio, d.ref, d.ref2, d.remitente, d.asunto]
      .some(value => String(value || '').toLowerCase().includes(query));
    return matchesQuery
      && (!area || d.area === area)
      && (!estado || d.estado === estado)
      && (!prioridad || d.prioridad === prioridad);
  });
  const tbody = document.getElementById('consulta-table');
  const puedeEditar = puedeEditarConsultaGlobal();
  tbody.innerHTML = list.map(d => `
    <tr>
      <td><span class="folio-cell">${d.folio}</span></td>
      <td>${d.fechaHoraCaptura || d.fecha}</td>
      <td>${d.remitente}</td>
      <td><small>${d.area}</small></td>
      <td>${d.asunto}</td>
      <td><span class="badge ${badgeClass(d.estado)}">${d.estado}</span></td>
      <td><span class="badge ${prioridadBadgeClass(d.prioridad)}">${d.prioridad}</span></td>
      <td><div style="display:flex; gap:4px; flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" onclick="viewDemanda('${d.id}', true)">Ver</button>
        <button class="btn btn-guinda btn-sm" onclick="exportSinglePDF('${d.id}')">Imprimir</button>
        ${puedeEditar ? `<button class="btn btn-blue btn-sm" onclick="openEditDemanda('${d.id}', true)">Editar</button>` : ''}
      </div></td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center; color:var(--gray); padding:20px;">Sin resultados</td></tr>';
}

function tieneObservacionesPendientes(d) {
  return Array.isArray(d.reportes) && d.reportes.some(r => !r.resuelto);
}

function renderArchivosTable(list) {
  const tbody          = document.getElementById('archivos-table');
  const isAdmin         = currentUser && isAdminLevel(currentUser.rol);
  const isAreaUsuarioRol = currentUser && isAreaUsuario(currentUser.rol);
  const isJefeRol        = currentUser && isJefeArea(currentUser.rol);
  const isAreaUser      = isAreaUsuarioRol || isJefeRol;
  const isSubareaUser   = currentUser && isSubareaUsuario(currentUser.rol);

  const rowHtml = d => {
    const puedeCambiarEstado = isSubareaUser
      && Number(d.subarea_id) === Number(currentUser.subarea_id);
    const puedeEnviarEstaDemanda = isAreaUser || (puedeEnviarDesdeSubarea()
      && Number(d.subarea_id) === Number(currentUser.subarea_id));
    return `
    <tr>
      <td><span class="folio-cell">${d.folio}</span></td>
      <td>${d.fechaHoraCaptura || d.fecha}</td>
      <td>${d.remitente}</td>
      <td><small>${d.area}</small></td>
      <td>${d.asunto}</td>
      <td>${puedeCambiarEstado ? `
        <select style="font-size:11px; padding:3px 6px; border:1px solid #ddd; border-radius:4px;"
                onfocus="this.dataset.prev=this.value"
                onchange="changeEstadoArea('${d.id}', this.value, this)">
          <option ${d.estado==='Pendiente'  ?'selected':''}>Pendiente</option>
          <option ${d.estado==='En proceso' ?'selected':''}>En proceso</option>
          <option ${d.estado==='Atendida'   ?'selected':''}>Atendida</option>
        </select>` : `<span class="badge ${badgeClass(d.estado)}">${d.estado}</span>`}</td>
      <td>${isAreaUsuarioRol ? `
        <select style="font-size:11px; padding:3px 6px; border:1px solid #ddd; border-radius:4px;"
                onfocus="this.dataset.prev=this.value"
                onchange="changePri
                oridadArea('${d.id}', this.value, this)">
          <option ${d.prioridad==='Alta'  ?'selected':''}>Alta</option>
          <option ${d.prioridad==='Media' ?'selected':''}>Media</option>
          <option ${d.prioridad==='Baja'  ?'selected':''}>Baja</option>
        </select>` : `<span class="badge ${prioridadBadgeClass(d.prioridad)}">${d.prioridad}</span>`}</td>
      <td>
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="viewDemanda('${d.id}')">Ver</button>
          <button class="btn btn-guinda btn-sm"  onclick="exportSinglePDF('${d.id}')">Imprimir</button>
          ${isAreaUsuarioRol ? `<button class="btn btn-blue btn-sm" onclick="openEditDemanda('${d.id}')">Editar</button>` : ''}
          ${isAreaUsuarioRol ? `<button class="btn btn-outline btn-sm" onclick="openReportarProblema('${d.id}')">Observaciones</button>` : ''}
          ${puedeEnviarEstaDemanda ? `<button class="btn btn-outline btn-sm" onclick="openEnviarSubarea('${d.id}')">Enviar a Subarea</button>` : ''}
          ${isAdmin ? `<button class="btn btn-red btn-sm" onclick="deleteDemanda('${d.id}')">Eliminar</button>` : ''}
        </div>
      </td>
    </tr>
  `;
  };

  const esPendienteEnvio = d =>
    (!d.subarea_id && d.estado === 'Pendiente') || tieneObservacionesPendientes(d);

  const puedeEnviarDesdeEstaSubarea = puedeEnviarDesdeSubarea();
  const esPendiente = d => {
    if (!isSubareaUser) return esPendienteEnvio(d);
    if (puedeEnviarDesdeEstaSubarea
        && Number(d.subarea_id) !== Number(currentUser.subarea_id)) {
      return false;
    }
    return d.estado === 'Pendiente' || tieneObservacionesPendientes(d);
  };

  const pendientesEnvio = list.filter(esPendiente);
  const enGestion       = list.filter(d => !esPendiente(d));
  const dividerHtml = label => `
    <tr class="archivos-group-divider">
      <td colspan="8" style="padding:8px 10px; background:var(--cream); border-top:2px solid var(--guinda-light); border-bottom:2px solid var(--guinda-light); font-size:11px; font-weight:700; color:var(--guinda); text-transform:uppercase; letter-spacing:.3px;">
        ${label}
      </td>
    </tr>
  `;

  let html = pendientesEnvio.map(rowHtml).join('');
  if (isSubareaUser && puedeEnviarDesdeEstaSubarea) {
    const enviadasASubarea = enGestion.filter(d =>
      Number(d.subarea_id) !== Number(currentUser.subarea_id));
    const propiasEnGestion = enGestion.filter(d =>
      Number(d.subarea_id) === Number(currentUser.subarea_id));
    if (propiasEnGestion.length) {
      html += dividerHtml('En proceso / Atendidas') + propiasEnGestion.map(rowHtml).join('');
    }
    if (enviadasASubarea.length) {
      html += dividerHtml('Enviadas a subarea') + enviadasASubarea.map(rowHtml).join('');
    }
  } else {
    if (enGestion.length && (pendientesEnvio.length || isSubareaUser)) {
      const label = isSubareaUser
        ? 'En proceso / Atendidas'
        : 'Enviadas a subarea / En proceso / Atendidas';
      html += dividerHtml(label);
    }
    html += enGestion.map(rowHtml).join('');
  }

  tbody.innerHTML = html || '<tr><td colspan="8" style="text-align:center; color:var(--gray); padding:20px;">Sin resultados</td></tr>';
}

/* ---------- Observaciones (peticiones reportadas) ---------- */
async function renderObservaciones() {
  const tbody = document.getElementById('observaciones-table');
  try {
    const list = await apiGetReportes();
    _reportesPendientes = list.length;
    renderSidebar(_currentPage);
    tbody.innerHTML = list.map(r => `
      <tr>
        <td><span class="folio-cell">${r.folio}</span></td>
        <td><small>${r.area || ''}</small></td>
        <td>${r.remitente}</td>
        <td>${r.asunto}</td>
        <td><span class="badge ${badgeClass(r.estado)}">${r.estado}</span></td>
        <td>${r.nota}</td>
        <td>${r.reportado_por || ''}</td>
        <td>${r.creado_en ? new Date(r.creado_en).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }) : ''}</td>
        <td>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewDemanda('${r.demanda_id}')">Ver</button>
            <button class="btn btn-blue btn-sm" onclick="openEditDemanda('${r.demanda_id}')">Editar</button>
            <button class="btn btn-green btn-sm" onclick="openResolverObservacion('${r.id}')">Observación Corregida</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="9" style="text-align:center; color:var(--gray); padding:20px;">Sin observaciones reportadas</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--gray); padding:20px;">Error al cargar las observaciones</td></tr>';
  }
}

async function refreshReportesPendientes() {
  if (!currentUser || !(isAdminLevel(currentUser.rol) || isJefeArea(currentUser.rol))) return;
  try {
    const list = await apiGetReportes();
    _reportesPendientes = list.length;
  } catch (err) {
    _reportesPendientes = 0;
  }
  renderSidebar(_currentPage);
}

/* ---------- Marcar observación como corregida ---------- */
let resolverObservacionId = null;

function openResolverObservacion(reporteId) {
  resolverObservacionId = reporteId;
  document.getElementById('ro-nota').value = '';
  document.getElementById('modal-resolver-observacion').classList.add('open');
}

async function confirmResolverObservacion() {
  const nota = document.getElementById('ro-nota').value.trim();

  try {
    await apiResolverReporte(resolverObservacionId, nota);
    closeModal('modal-resolver-observacion');
    showToast('Observación marcada como corregida', 'success');
    renderObservaciones();
  } catch (err) {
    showToast(err.message || 'Error al marcar la observación como corregida', 'error');
  }
}

/* ---------- Ver detalle ---------- */
async function viewDemanda(id, soloLectura = false) {
  currentViewId = id;
  _viewReadOnly = soloLectura;
  const local = demandas.find(x => x.id === id);
  const consultaLocal = soloLectura ? _consultaDemandas.find(x => String(x.id) === String(id)) : null;
  if (consultaLocal) _renderViewModal(consultaLocal);
  else if (local) _renderViewModal(local); // mostrar inmediatamente con datos locales

  try {
    const raw = soloLectura ? await apiGetDemandaConsultaGlobal(id) : await apiGetDemanda(id);
    const fresh = normalizeDemanda(raw);
    const base = consultaLocal || local || {};
    const d = {
      ...base,
      ...fresh,
      historial: fresh.historial?.length ? fresh.historial : (base.historial || []),
      historialEstados: fresh.historialEstados?.length ? fresh.historialEstados : (base.historialEstados || []),
      historialEdiciones: fresh.historialEdiciones?.length ? fresh.historialEdiciones : (base.historialEdiciones || []),
      reportes: fresh.reportes?.length ? fresh.reportes : (base.reportes || []),
      adjuntos: fresh.adjuntos?.length ? fresh.adjuntos : (base.adjuntos || []),
    };
    const idx = demandas.findIndex(x => String(x.id) === String(id));
    if (idx >= 0) demandas[idx] = d;
    const consultaIdx = _consultaDemandas.findIndex(x => String(x.id) === String(id));
    if (consultaIdx >= 0) _consultaDemandas[consultaIdx] = d;
    _renderViewModal(d); // actualizar con historial
  } catch (err) {
    if (!local) showToast(err.message || 'Error al cargar demanda', 'error');
  }
}

function _renderViewModal(d) {
  const canChangePriority = !_viewReadOnly && currentUser && isJefeArea(currentUser.rol) && isDireccionGeneralArea(currentUser.area);
  const prioridadHTML = canChangePriority
    ? `<select aria-label="Prioridad" style="width:100%; padding:10px 12px; border:1px solid #d5e0fb; border-radius:8px; background:#eef4ff; color:var(--gray-dark);"
               onchange="changePrioridadView(currentViewId, this)">
         <option value="Alta" ${d.prioridad === 'Alta' ? 'selected' : ''}>Alta</option>
         <option value="Media" ${d.prioridad === 'Media' ? 'selected' : ''}>Media</option>
         <option value="Baja" ${d.prioridad === 'Baja' ? 'selected' : ''}>Baja</option>
       </select>`
    : `<span class="badge ${prioridadBadgeClass(d.prioridad)}">${d.prioridad}</span>`;
  document.getElementById('modal-ver-content').innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:13px;">
      ${field2('Folio',             `<strong style="color:var(--guinda);">${d.folio}</strong>`)}
      ${field2('Fecha de Captura',  d.fechaHoraCaptura || d.fecha)}
      ${field2('Fecha de Demanda',  d.fechaDemanda || '—')}
      ${field2('Folio Petición', d.ref || '—')}
      ${field2('Area',              d.area)}
      ${field2('Tipo de petición', d.tipo_peticion || '—')}
      ${d.subarea ? field2('Subarea', d.subarea) : ''}
      ${field2col('Remitente',      d.remitente)}
      ${field2col('Descripcion',    d.asunto)}
      ${field2('Domicilio',         d.domicilio || '—')}
      ${field2('Colonia',           d.colonia   || '—')}
      ${field2('Tel. Principal',    d.tel1 || '—')}
      ${field2('Tel. Secundario',   d.tel2 || '—')}
      ${field2col('Demanda',         `<div style="background:var(--cream); padding:8px 10px; border-radius:6px;">${d.demanda || '—'}</div>`)}
      ${d.observaciones ? field2col('Anexos y Observaciones', `<div style="background:var(--cream); padding:8px 10px; border-radius:6px;">${d.observaciones}</div>`) : ''}
      ${field2('Concepto', d.concepto || '—')}
      ${d.adjuntos && d.adjuntos.length ? field2col('Documentos adjuntos', `<div>${d.adjuntos.map(a => `<div style="margin-bottom:6px;"><a href="/uploads/${_escapeFileName(a.ruta)}" target="_blank" rel="noopener" style="color:#1565c0;">${_escapeFileName(a.nombre)}</a></div>`).join('')}</div>`) : ''}
      ${field2('Estado',   `<span class="badge ${badgeClass(d.estado)}">${d.estado}</span>`)}
      ${field2('Prioridad', prioridadHTML)}
      ${d.historial && d.historial.length ? historialHTML(d.historial) : ''}
      ${d.historialEstados && d.historialEstados.length ? historialEstadosHTML(d.historialEstados) : ''}
      ${d.historialEdiciones && d.historialEdiciones.length ? historialEdicionesHTML(d.historialEdiciones) : ''}
      ${d.reportes && d.reportes.length ? reportesHTML(d.reportes) : ''}
    </div>
  `;

  const btnTransferir = document.getElementById('btn-transferir-demanda');
  if (btnTransferir) {
    const canTransfer = !_viewReadOnly && currentUser && isJefeArea(currentUser.rol) && isDireccionGeneralArea(currentUser.area);
    btnTransferir.style.display = canTransfer ? '' : 'none';
  }
  const btnImprimir = document.querySelector('#modal-ver .btn-row > button:first-child');
  if (btnImprimir) btnImprimir.style.display = '';
  document.getElementById('modal-ver').classList.add('open');
}

async function changePrioridadView(id, selectEl) {
  const canChangePriority = currentUser && isJefeArea(currentUser.rol) && isDireccionGeneralArea(currentUser.area);
  const demanda = demandas.find(item => item.id === id);
  const prioridad = selectEl.value;
  if (!canChangePriority || !demanda || !['Alta', 'Media', 'Baja'].includes(prioridad)) {
    showToast('No se pudo cambiar la prioridad de esta petición', 'error');
    if (demanda) selectEl.value = demanda.prioridad || 'Media';
    return;
  }

  try {
    await apiEditarDemanda(id, { prioridad });
    demanda.prioridad = prioridad;
    filterArchivos();
    if (selectedArea) filterAreaDetail();
    showToast('Prioridad actualizada', 'success');
  } catch (err) {
    selectEl.value = demanda.prioridad || 'Media';
    showToast(err.message || 'Error al cambiar la prioridad', 'error');
  }
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
      ? `<a href="/uploads/${h.archivoRuta}" target="_blank" rel="noopener"
        style="color:#1565c0; font-size:11px; display:inline-flex; align-items:center; gap:3px; margin-top:4px;">
           ${h.archivoNombre}
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
        ${h.comentario ? `<div style="margin-top:4px; font-size:11px;">${h.comentario}</div>` : ''}
        ${archivoLink ? `<div>${archivoLink}</div>` : ''}
      </div>`;
  }).join('');
  return `<div style="grid-column:1/-1;">
    <div style="font-size:10px; font-weight:700; color:var(--guinda); text-transform:uppercase; margin-bottom:6px;">Historial de Cambios de Estado</div>
    ${items}
  </div>`;
}

function reportesHTML(reportes) {
  const items = reportes.map(r => `
    <div style="background:${r.resuelto ? 'var(--cream)' : '#fdecea'}; padding:8px 10px; border-radius:6px; margin-bottom:6px; font-size:12px;">
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <strong>${r.fecha}</strong>
        ${r.reportadoPor ? `<span style="color:var(--gray); font-size:11px;">por ${r.reportadoPor}</span>` : ''}
        ${!r.resuelto ? `<span class="badge badge-gold" style="font-size:10px;">Pendiente</span>` : ''}
      </div>
      <div style="margin-top:4px;">${r.nota}</div>
      ${r.resuelto ? `
      <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(0,0,0,.08);">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <strong>${r.fechaResolucion}</strong>
          ${r.resueltoPor ? `<span style="color:var(--gray); font-size:11px;">por ${r.resueltoPor}</span>` : ''}
          <span class="badge badge-green" style="font-size:10px;">Corregida</span>
        </div>
        ${r.notaResolucion ? `<div style="margin-top:4px;">${r.notaResolucion}</div>` : ''}
      </div>` : ''}
    </div>`
  ).join('');
  return `<div style="grid-column:1/-1;">
    <div style="font-size:10px; font-weight:700; color:var(--guinda); text-transform:uppercase; margin-bottom:6px;">Observaciones Reportadas</div>
    ${items}
  </div>`;
}

function historialEdicionesHTML(historial) {
  const items = historial.map(h => {
    const cambios = Object.entries(h.campos).map(([campo, vals]) =>
      `<div style="margin-top:4px; padding-left:8px; border-left:2px solid var(--guinda); font-size:11px;">
        <span style="font-weight:600;">${_escapeFileName(campo)}:</span>
        <span style="color:#999; text-decoration:line-through; margin:0 5px;">${_escapeFileName(vals.antes || '—')}</span>
        <span style="color:var(--gray);">→</span>
        <span style="margin-left:5px;">${_escapeFileName(vals.despues || '—')}</span>
      </div>`
    ).join('');
    return `
      <div style="background:var(--cream); padding:8px 10px; border-radius:6px; margin-bottom:6px; font-size:12px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <strong>${_escapeFileName(h.fecha)}</strong>
          ${h.editadoPor ? `<span style="color:var(--gray); font-size:11px;">por ${_escapeFileName(h.editadoPor)}</span>` : ''}
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
let _pendingEditEstadoPayload = null;
let _editDemandaConsultaGlobal = false;

function openEditDemanda(id, consultaGlobal = false) {
  if (!currentUser || currentUser.rol === 'Consulta' ||
      (consultaGlobal && !puedeEditarConsultaGlobal())) {
    showToast('El usuario de consulta solo puede ver e imprimir', 'error');
    return;
  }
  if (isSubareaUsuario(currentUser.rol)) {
    showToast('Los usuarios de subarea solo pueden cambiar el estado', 'error');
    return;
  }
  const d = consultaGlobal
    ? _consultaDemandas.find(x => String(x.id) === String(id))
    : demandas.find(x => String(x.id) === String(id));
  if (!d) return;
  currentViewId  = id;
  _editDemandaConsultaGlobal = consultaGlobal;

  // Estado: Administrador/Subadmin y el jefe de area. Prioridad: ademas, el usuario de area
  const isAdmin       = isAdminLevel(currentUser.rol);
  const isAreaUser    = isAreaUsuario(currentUser.rol);
  const isJefeAreaUser = isJefeArea(currentUser.rol);
  const estadoGroup   = document.getElementById('ed-estado-group');
  const prioridadGroup = document.getElementById('ed-prioridad-group');
  const btnAdjuntar = document.getElementById('btn-ed-agregar-adjuntos');
  if (btnAdjuntar) btnAdjuntar.style.display = puedeAgregarAdjuntosConsultaGlobal() ? '' : 'none';
  if (estadoGroup)    estadoGroup.style.display    = !consultaGlobal && (isAdmin || isJefeAreaUser) ? '' : 'none';
  if (prioridadGroup) prioridadGroup.style.display = (isAdmin || isAreaUser || isJefeAreaUser) ? '' : 'none';

  const areaSelect = document.getElementById('ed-area');
  if (areaSelect) {
    areaSelect.disabled = false;
    if (d.area && !Array.from(areaSelect.options).some(option => option.value === d.area)) {
      const option = document.createElement('option');
      option.value = d.area;
      option.textContent = d.area;
      areaSelect.appendChild(option);
    }
  }
  document.getElementById('ed-folio').value         = d.folio;
  document.getElementById('ed-fecha').value         = d.fechaHoraCaptura || d.fecha;
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
  document.getElementById('ed-tipo-peticion').value = d.tipo_peticion || '';
  document.getElementById('ed-estado').value        = d.estado       || 'Pendiente';
  document.getElementById('ed-prioridad').value     = d.prioridad    || 'Media';

  document.getElementById('ed-area').value = d.area || '';
  renderEditAdjuntos(d);
  document.getElementById('modal-edit-demanda').classList.add('open');
}

function renderEditAdjuntos(demanda) {
  const panel = document.getElementById('ed-adjuntos-panel');
  const list = document.getElementById('ed-adjuntos-list');
  const isFullAdmin = currentUser && currentUser.rol === 'Administrador';
  if (!panel || !list) return;

  panel.style.display = isFullAdmin ? '' : 'none';
  list.innerHTML = '';
  if (!isFullAdmin) return;

  const adjuntos = Array.isArray(demanda.adjuntos) ? demanda.adjuntos : [];
  list.innerHTML = adjuntos.map(adjunto => `
    <div style="display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid #eee;">
      <a href="/uploads/${_escapeFileName(encodeURIComponent(adjunto.ruta || ''))}"
         target="_blank" rel="noopener" style="flex:1; min-width:0; color:#1565c0; overflow-wrap:anywhere;">
        ${_escapeFileName(adjunto.nombre || 'Documento')}
      </a>
      <button type="button" class="btn btn-red btn-sm"
              data-demanda-id="${_escapeFileName(demanda.id)}"
              data-adjunto-id="${_escapeFileName(adjunto.id)}"
              onclick="deleteDemandaAdjunto(this)">Eliminar</button>
    </div>
  `).join('') || '<div style="color:var(--gray); font-size:12px;">Sin documentos adjuntos</div>';
}

async function deleteDemandaAdjunto(button) {
  if (!currentUser || currentUser.rol !== 'Administrador') {
    showToast('Solo el administrador puede eliminar documentos', 'error');
    return;
  }
  const demandaId = button.dataset.demandaId;
  const adjuntoId = button.dataset.adjuntoId;
  if (!confirm('¿Eliminar este documento de la petición? Esta acción no se puede deshacer.')) return;

  button.disabled = true;
  try {
    await apiEliminarAdjuntoDemanda(demandaId, adjuntoId);
    const demanda = demandas.find(item => String(item.id) === String(demandaId))
      || _consultaDemandas.find(item => String(item.id) === String(demandaId));
    if (demanda) {
      demanda.adjuntos = (demanda.adjuntos || [])
        .filter(adjunto => String(adjunto.id) !== String(adjuntoId));
      renderEditAdjuntos(demanda);
    }
    showToast('Documento eliminado', 'success');
  } catch (err) {
    button.disabled = false;
    showToast(err.message || 'Error al eliminar el documento', 'error');
  }
}

async function saveEditDemanda() {
  const areaName   = document.getElementById('ed-area').value;
  const area_id    = getAreaId(areaName);
  if (!area_id) {
    showToast('Seleccione un área válida', 'error');
    return;
  }
  const isAdmin       = currentUser && isAdminLevel(currentUser.rol);
  const isAreaUser    = currentUser && isAreaUsuario(currentUser.rol);
  const isJefeAreaUser = currentUser && isJefeArea(currentUser.rol);
  const demandaActual = (_editDemandaConsultaGlobal ? _consultaDemandas : demandas)
    .find(x => String(x.id) === String(currentViewId));

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
    tipo_peticion: document.getElementById('ed-tipo-peticion').value,
    fecha_demanda: document.getElementById('ed-fecha-demanda').value,
  };
  let estadoNuevo = demandaActual?.estado;
  if (!_editDemandaConsultaGlobal && (isAdmin || isJefeAreaUser)) {
    estadoNuevo = document.getElementById('ed-estado').value;
  }
  if (isAdmin || isAreaUser || isJefeAreaUser) payload.prioridad = document.getElementById('ed-prioridad').value;

  if (demandaActual && estadoNuevo !== demandaActual.estado) {
    _pendingEstadoId = currentViewId;
    _pendingEstadoVal = estadoNuevo;
    _pendingEstadoSel = null;
    _pendingEditEstadoPayload = payload;
    document.getElementById('cambio-estado-titulo').textContent = `Adjunta un documento para cambiar el estado a: ${estadoNuevo}`;
    _clearEstadoFile();
    document.getElementById('cambio-estado-nota').value = '';
    closeModal('modal-edit-demanda');
    document.getElementById('modal-cambio-estado').classList.add('open');
    return;
  }

  try {
    const updated = _editDemandaConsultaGlobal
      ? await apiEditarDemandaConsultaGlobal(currentViewId, payload)
      : await apiEditarDemanda(currentViewId, payload);
    const norm    = normalizeDemanda(updated);
    norm.adjuntos = demandaActual?.adjuntos || [];
    const idx     = demandas.findIndex(x => x.id === currentViewId);
    if (idx >= 0) demandas[idx] = norm;
    if (_editDemandaConsultaGlobal) {
      const consultaIdx = _consultaDemandas.findIndex(x => String(x.id) === String(currentViewId));
      if (consultaIdx >= 0) _consultaDemandas[consultaIdx] = norm;
      filterConsultaGlobal();
    }
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
  if (!confirm('Eliminar esta demanda? Esta acción no se puede deshacer.')) return;
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
  const canTransfer = currentUser && isJefeArea(currentUser.rol) && isDireccionGeneralArea(currentUser.area);
  if (!canTransfer) {
    showToast('Solo el jefe de área de Dirección General puede enviar peticiones a otras áreas', 'error');
    return;
  }
  transferId = id;
  closeModal('modal-ver');
  document.getElementById('transfer-comment').value = '';
  populateAreaSelect('transfer-area', true);
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

/* ---------- Reportar observación / problema ---------- */
let reportarProblemaId = null;

function openReportarProblema(id) {
  reportarProblemaId = id;
  document.getElementById('rp-nota').value = '';
  document.getElementById('modal-reportar-problema').classList.add('open');
}

async function confirmReportarProblema() {
  const nota = document.getElementById('rp-nota').value.trim();
  if (!nota) { showToast('Escribe una nota describiendo el problema', 'error'); return; }

  try {
    await apiReportarProblema(reportarProblemaId, nota);
    closeModal('modal-reportar-problema');
    showToast('Observacion reportada', 'success');
  } catch (err) {
    showToast(err.message || 'Error al reportar la observación', 'error');
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
    let destinos = list;
    if (puedeEnviarDesdeCoordinacion()) {
      destinos = list.filter(s => /^SECTOR [1-5]$/.test(normalizeAreaName(s.nombre))
        || normalizeAreaName(s.nombre) === 'COORDINACION DE MAQUINARIA');
    } else if (puedeEnviarDesdeCoordinacionConstruccion()) {
      const destinosPermitidos = new Set([
        'DEPARTAMENTO DE ESTUDIOS Y PROYECTOS',
        'DEPARTAMENTO DE OBRAS',
        'DEPARTAMENTO DE PLANTAS POTABILIZADORAS',
        'DEPARTAMENTO DE ELECTROMECANICO',
      ]);
      destinos = list.filter(s => destinosPermitidos.has(normalizeAreaName(s.nombre)));
    }
    sel._subareas = destinos;
    sel.innerHTML = destinos.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')
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
