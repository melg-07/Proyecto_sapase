/* ================================================
   SAPASE – Exportacion (PDF, Ticket, Excel)
   ================================================ */

/* ============================================================
   DROPDOWN DE EXPORTACION
   – reemplaza los botones PDF y Ticket por uno solo
   ============================================================ */
function openExportMenu(id, btnEl) {
  // Cierra cualquier menu abierto
  closeAllExportMenus();

  const menu = document.createElement('div');
  menu.className   = 'export-menu';
  menu.id          = 'export-menu-' + id;
  menu.innerHTML   = `
    <div class="export-menu-item" onclick="exportSinglePDF('${id}'); closeAllExportMenus();">Exportar PDF</div>
  `;

  // Posicionar junto al boton
  const rect = btnEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top      = (rect.bottom + 4) + 'px';
  menu.style.left     = rect.left + 'px';
  menu.style.zIndex   = '500';
  document.body.appendChild(menu);

  // Cerrar al hacer click fuera
  setTimeout(() => {
    document.addEventListener('click', closeAllExportMenus, { once: true });
  }, 10);
}

function closeAllExportMenus() {
  document.querySelectorAll('.export-menu').forEach(m => m.remove());
}

/* ============================================================
   EXPORTAR EXCEL
   ============================================================ */
function exportarTodoExcel() {
  const list = filteredDemandas.length ? filteredDemandas : demandas;
  exportToExcel(list, 'SAPASE_Demandas');
}

function exportToExcel(list, nombre) {
  const rows = list.map(d => ({
    'Folio':            d.folio,
    'Fecha Captura':    d.fecha,
    'Fecha Demanda':    d.fechaDemanda  || '',
    'Folio Referencia': d.ref           || '',
    'Area':             d.area,
    'Remitente':        d.remitente,
    'Asunto':           d.asunto,
    'Domicilio':        d.domicilio     || '',
    'Colonia':          d.colonia       || '',
    'Tel. Principal':   d.tel1          || '',
    'Tel. Secundario':  d.tel2          || '',
    'Descripcion':      d.demanda       || '',
    'Observaciones':    d.observaciones || '',
    'Concepto':         d.concepto      || '',
    'Estado':           d.estado,
    'Capturado por':    d.creadoPor     || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    {wch:24},{wch:14},{wch:14},{wch:22},{wch:40},{wch:32},{wch:36},
    {wch:26},{wch:22},{wch:14},{wch:14},{wch:60},{wch:40},{wch:22},{wch:12},{wch:22}
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Demandas');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, nombre.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_' + fecha + '.xlsx');
  showToast('Excel exportado correctamente', 'success');
}

/* ============================================================
   EXPORTAR PDF  –  media hoja, layout igual a imagen de referencia
   ============================================================ */
function exportSinglePDF(id) {
  const d = demandas.find(x => x.id === id);
  if (!d) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pw  = doc.internal.pageSize.getWidth();

  /* Logos */
  try { doc.addImage('assets/escudo.png',      'PNG', 8,  3, 44, 18); } catch(e) {}
  try { doc.addImage('assets/logo_sapase.png', 'PNG', pw - 64, 3, 56, 18); } catch(e) {}

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(8, 23, pw - 8, 23);

  const rowH = 8.5;
  let y = 30;

  function labelBox(label, value, x, boxW, yy) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    doc.text(label, x, yy);
    const lw = doc.getTextWidth(label) + 2;
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.25);
    doc.rect(x + lw, yy - rowH + 2, boxW - lw, rowH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(String(value || ''), x + lw + 2, yy, { maxWidth: boxW - lw - 4 });
  }

  /* Fila 1: Fecha Captura | Folio | Referencia */
  const c1w = 74, c2w = 52, c3w = pw - 8 - c1w - c2w - 12;
  labelBox('Fecha',   d.fecha,        8,                  c1w,     y);
  labelBox('Folio',   d.folio,        8 + c1w + 4,        c2w,     y);
  labelBox('Demanda', d.ref || '',    8 + c1w + c2w + 8,  c3w + 8, y);
  y += rowH + 2;

  /* Fecha demanda */
  if (d.fechaDemanda) {
    labelBox('Fecha de la Demanda', d.fechaDemanda, 8, 90, y);
    y += rowH + 2;
  }

  /* Nombre */
  labelBox('Nombre', d.remitente, 8, pw - 16, y);
  y += rowH + 2;

  /* Domicilio | Colonia */
  const domW = (pw - 20) * 0.6;
  const colW = pw - 20 - domW - 4;
  labelBox('Domicilio', d.domicilio || '', 8,           domW + 8,  y);
  labelBox('',          d.colonia   || '', 8 + domW + 6, colW + 4, y);
  y += rowH + 2;

  /* Telefono */
  const telStr = [d.tel1, d.tel2].filter(Boolean).join('   /   ');
  labelBox('Telefono', telStr, 8, pw - 16, y);
  y += rowH + 2;

  /* Demanda (asunto) */
  labelBox('Demanda', d.asunto || '', 8, pw - 16, y);
  y += rowH + 2;

  /* Descripcion – caja grande */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);
  doc.text('Descripcion', 8, y);
  const dLW   = doc.getTextWidth('Descripcion') + 2;
  const dBoxX = 8 + dLW;
  const dBoxW = pw - 8 - dBoxX;
  const dBoxH = 38;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.25);
  doc.rect(dBoxX, y - rowH + 2, dBoxW, dBoxH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const descLines = doc.splitTextToSize(d.demanda || '', dBoxW - 4);
  doc.text(descLines, dBoxX + 2, y - rowH + 8);

  doc.save('Demanda_' + d.folio + '.pdf');
  showToast('PDF generado: ' + d.folio, 'success');
}
