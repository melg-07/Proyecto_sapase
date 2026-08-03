/* ================================================
   SAPASE – Exportacion (PDF, Excel)
   ================================================ */
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
    'Demanda':          d.demanda       || '',
    'Observaciones':    d.observaciones || '',
    'Concepto':         d.concepto      || '',
    'Estado':           d.estado,
    'Prioridad':        d.prioridad,
    'Capturado por':    d.creadoPor     || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    {wch:24},{wch:14},{wch:14},{wch:22},{wch:40},{wch:32},{wch:36},
    {wch:26},{wch:22},{wch:14},{wch:14},{wch:60},{wch:40},{wch:22},{wch:12},{wch:12},{wch:22}
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Demandas');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, nombre.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_' + fecha + '.xlsx');
  showToast('Excel exportado correctamente', 'success');
}

/* ============================================================
   EXPORTAR PDF  –  Carta 215.9 × 279.4 mm
   ============================================================ */
function openExportarInformeModal() {
  populateAreaSelect('export-area', true);
  const exportArea = document.getElementById('export-area');
  if (exportArea && exportArea.options[0]) exportArea.options[0].textContent = 'Todas las áreas';
  document.getElementById('export-status').value = '';
  document.getElementById('export-prioridad').value = '';
  document.getElementById('export-date-from').value = '';
  document.getElementById('export-date-to').value = '';
  document.getElementById('export-date-single').value = '';
  document.getElementById('export-month').value = '';
  document.getElementById('export-year').value = '';
  document.getElementById('export-report-type').value = 'semanal';
  setExportInformeTipo('semanal');
  document.getElementById('modal-exportar-informe').classList.add('open');
}

function setExportInformeTipo(tipo) {
  const type = tipo || 'semanal';
  const typeInput = document.getElementById('export-report-type');
  if (typeInput) typeInput.value = type;

  const rangeGroup = document.getElementById('export-range-group');
  const rangeToGroup = document.getElementById('export-range-to-group');
  const singleGroup = document.getElementById('export-single-group');
  const monthGroup = document.getElementById('export-month-group');
  const yearGroup = document.getElementById('export-year-group');

  if (rangeGroup) rangeGroup.style.display = type === 'semanal' ? '' : 'none';
  if (rangeToGroup) rangeToGroup.style.display = type === 'semanal' ? '' : 'none';
  if (singleGroup) singleGroup.style.display = type === 'diario' ? '' : 'none';
  if (monthGroup) monthGroup.style.display = type === 'mensual' ? '' : 'none';
  if (yearGroup) yearGroup.style.display = type === 'anual' ? '' : 'none';
}

function getExportInformeFilters() {
  return {
    tipo: document.getElementById('export-report-type')?.value || 'semanal',
    area: document.getElementById('export-area')?.value || '',
    estado: document.getElementById('export-status')?.value || '',
    prioridad: document.getElementById('export-prioridad')?.value || '',
    fechaDesde: document.getElementById('export-date-from')?.value || '',
    fechaHasta: document.getElementById('export-date-to')?.value || '',
    fechaUnica: document.getElementById('export-date-single')?.value || '',
    mes: document.getElementById('export-month')?.value || '',
    anio: document.getElementById('export-year')?.value || '',
  };
}

function parseInformeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/').map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(str);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseInformeMonth(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(str)) {
    const [year, month] = str.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }
  const dt = parseInformeDate(value);
  return dt ? new Date(dt.getFullYear(), dt.getMonth(), 1) : null;
}

function formatDateForReport(date, options = {}) {
  if (!date) return 'Sin fecha';
  const dt = date instanceof Date ? date : parseInformeDate(date);
  if (!dt) return 'Sin fecha';
  return dt.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', ...options });
}

function formatMonthForReport(value) {
  const dt = parseInformeMonth(value);
  return dt ? dt.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : 'Sin fecha';
}

function getDateKey(date) {
  if (!date) return 'sin-fecha';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDemandDateForReport(d) {
  return parseInformeDate(d.fechaDemanda || d.fecha || '');
}

function getFilteredInformeDemandas(filters, tipo = filters?.tipo || 'semanal') {
  const baseList = (Array.isArray(filteredDemandas) && filteredDemandas.length) ? filteredDemandas : (Array.isArray(demandas) ? demandas : []);
  const from = filters.fechaDesde ? parseInformeDate(filters.fechaDesde) : null;
  const to = filters.fechaHasta ? parseInformeDate(filters.fechaHasta) : null;

  return baseList.filter(d => {
    const fecha = getDemandDateForReport(d);
    const matchArea = !filters.area || d.area === filters.area;
    const matchEstado = !filters.estado || d.estado === filters.estado;
    const matchPrioridad = !filters.prioridad || d.prioridad === filters.prioridad;

    if (tipo === 'diario') {
      const target = filters.fechaUnica ? parseInformeDate(filters.fechaUnica) : null;
      const matchDate = !target || !fecha || fecha.toDateString() === target.toDateString();
      return matchArea && matchEstado && matchPrioridad && matchDate;
    }

    if (tipo === 'mensual') {
      if (!filters.mes || !fecha) return false;
      const [year, month] = filters.mes.split('-').map(Number);
      const matchDate = fecha.getFullYear() === year && fecha.getMonth() === month - 1;
      return matchArea && matchEstado && matchPrioridad && matchDate;
    }

    if (tipo === 'anual') {
      const year = Number(filters.anio || 0);
      const matchDate = !year || !fecha || fecha.getFullYear() === year;
      return matchArea && matchEstado && matchPrioridad && matchDate;
    }

    const matchFrom = !from || !fecha || fecha >= from;
    const matchTo = !to || !fecha || fecha <= to;
    return matchArea && matchEstado && matchPrioridad && matchFrom && matchTo;
  });
}

function buildInformeGrupos(list, tipo) {
  const grupos = [];
  const map = new Map();

  list.forEach(d => {
    const fecha = getDemandDateForReport(d);
    let key = '';
    let label = '';

    if (tipo === 'diario') {
      key = getDateKey(fecha);
      label = fecha ? formatDateForReport(fecha) : 'Sin fecha';
    } else if (tipo === 'mensual') {
      key = fecha ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}` : 'sin-fecha';
      label = fecha ? fecha.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : 'Sin fecha';
    } else if (tipo === 'anual') {
      key = fecha ? String(fecha.getFullYear()) : 'sin-fecha';
      label = fecha ? String(fecha.getFullYear()) : 'Sin fecha';
    } else {
      const start = new Date(fecha || new Date());
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(start.getFullYear(), start.getMonth(), diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      key = `${getDateKey(monday)}|${getDateKey(sunday)}`;
      label = `Semana ${monday.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${sunday.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    }

    if (!map.has(key)) map.set(key, { label, items: [] });
    map.get(key).items.push(d);
  });

  map.forEach((value) => {
      value.items.sort((a, b) => {
        const aFolio = String(a.folio || '').replace(/^F-?0*/, '');
        const bFolio = String(b.folio || '').replace(/^F-?0*/, '');
        const aNum = Number(aFolio) || 0;
        const bNum = Number(bFolio) || 0;
        if (aNum !== bNum) return aNum - bNum;
        return String(a.folio || '').localeCompare(String(b.folio || ''));
      });
      grupos.push(value);
    });
  return grupos;
}

function drawInformeHeader(doc, title, subtitle, pageNumber, pageW, pageH, ML, MR) {
  const escudoFile = (currentLogosMeta && currentLogosMeta.escudo) || 'escudo.png';
  const logoFile = (currentLogosMeta && currentLogosMeta.logo_sapase) || 'logo_sapase.png';

  try { doc.addImage(`assets/${escudoFile}`, 'PNG', ML, 3, 34, 16); } catch (e) {}
  try { doc.addImage(`assets/${logoFile}`, 'PNG', pageW - MR - 40, 3, 40, 16); } catch (e) {}

  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.4);
  doc.line(ML, 22, pageW - MR, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text(title, pageW / 2, 30, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(subtitle, pageW / 2, 36, { align: 'center' });

  if (pageNumber) {
    doc.setFontSize(7);
    doc.text(`Página ${pageNumber}`, pageW - MR - 10, pageH - 8, { align: 'right' });
  }
}

function drawInformeTable(doc, rows, startY, pageW, pageH, ML, MR, title, subtitle, pageNumber) {
  const headers = ['Folio', 'Fecha', 'Remitente', 'Área', 'Asunto', 'Estado', 'Prioridad'];
  const widths = [14, 16, 24, 30, 70, 18, 18];
  const xPositions = [];
  let x = ML;
  widths.forEach((width) => {
    xPositions.push(x);
    x += width;
  });

  const tableWidth = pageW - ML - MR;
  const headerHeight = 7.5;
  let y = startY;

  if (y + headerHeight + 6 > pageH - 15) {
    doc.addPage();
    pageNumber += 1;
    drawInformeHeader(doc, title, subtitle, pageNumber, pageW, pageH, ML, MR);
    y = 42;
  }

  doc.setFillColor(240, 240, 240);
  doc.rect(ML, y, tableWidth, headerHeight, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(40, 40, 40);
  headers.forEach((label, idx) => {
    doc.text(label, xPositions[idx] + 1.4, y + 4.8);
  });
  y += headerHeight;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.1);
  rows.forEach((row, rowIndex) => {
    const cellLines = row.cells.map(cell => Math.max(1, (cell.lines || []).length));
    const lineHeight = 3.6;
    const rowHeight = Math.max(11, (lineHeight * Math.max(1, ...cellLines)) + 1.4);
    if (y + rowHeight > pageH - 15) {
      doc.addPage();
      pageNumber += 1;
      drawInformeHeader(doc, title, subtitle, pageNumber, pageW, pageH, ML, MR);
      y = 42;
      doc.setFillColor(240, 240, 240);
      doc.rect(ML, y, tableWidth, headerHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.4);
      headers.forEach((label, idx) => {
        doc.text(label, xPositions[idx] + 1.4, y + 4.8);
      });
      y += headerHeight;
    }

    if (rowIndex > 0) {
      doc.setDrawColor(220, 220, 220);
      doc.line(ML, y + 1.0, pageW - MR, y + 1.0);
    }
    row.cells.forEach((cell, idx) => {
      const lines = cell.lines || [];
      const textY = y + 3.3;
      lines.forEach((line, lineIdx) => {
        doc.text(line, xPositions[idx] + 1.6, textY + (lineIdx * lineHeight));
      });
    });
    y += rowHeight;
  });

  return { y, pageNumber };
}

function formatInformeFechaTexto(filters, tipo) {
  if (tipo === 'diario') {
    return filters.fechaUnica ? formatDateForReport(filters.fechaUnica) : 'Sin fecha';
  }
  if (tipo === 'mensual') {
    return filters.mes ? formatMonthForReport(filters.mes) : 'Sin fecha';
  }
  if (tipo === 'anual') {
    return filters.anio || 'Sin año';
  }
  if (filters.fechaDesde && filters.fechaHasta) {
    return formatDateForReport(filters.fechaDesde);
  }
  return filters.fechaDesde || filters.fechaHasta || 'Sin fecha';
}

function exportInformePDF(tipo) {
  const filters = getExportInformeFilters();
  const list = getFilteredInformeDemandas(filters, tipo);

  if (!list.length) {
    showToast('No hay peticiones para exportar con los filtros seleccionados', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = 215.9;
  const pageH = 279.4;
  const ML = 10;
  const MR = 10;
  const title = tipo === 'semanal' ? 'Informe Semanal' : tipo === 'diario' ? 'Informe Diario' : tipo === 'mensual' ? 'Informe Mensual' : 'Informe Anual';
  const subtitle = `${filters.area || 'Todas las áreas'} • ${filters.estado || 'Todos los estados'} • ${filters.prioridad || 'Todas las prioridades'}`;
  const grupos = buildInformeGrupos(list, tipo);

  let y = 42;
  let pageNumber = 1;

  drawInformeHeader(doc, title, subtitle, pageNumber, pageW, pageH, ML, MR);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text('Fecha:', ML, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(formatInformeFechaTexto(filters, tipo), ML + 12, 40);

  grupos.forEach((grupo, idx) => {
    y += 6;

    const rows = grupo.items.map((d) => {
      const fechaTexto = getDemandDateForReport(d)
        ? getDemandDateForReport(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'Sin fecha';
      const cells = [
        { value: d.folio || '-', lines: doc.splitTextToSize(String(d.folio || '-'), 13) },
        { value: fechaTexto, lines: doc.splitTextToSize(fechaTexto, 15) },
        { value: d.remitente || '-', lines: doc.splitTextToSize(String(d.remitente || '-'), 23) },
        { value: d.area || '-', lines: doc.splitTextToSize(String(d.area || '-'), 29) },
        { value: d.asunto || '-', lines: doc.splitTextToSize(String(d.asunto || '-'), 82) },
        { value: d.estado || '-', lines: doc.splitTextToSize(String(d.estado || '-'), 17) },
        { value: d.prioridad || '-', lines: doc.splitTextToSize(String(d.prioridad || '-'), 17) }
      ];
      return { cells };
    });

    const tableResult = drawInformeTable(doc, rows, y, pageW, pageH, ML, MR, title, subtitle, pageNumber);
    y = tableResult.y;
    pageNumber = tableResult.pageNumber;
    y += 3;
  });

  closeModal('modal-exportar-informe');
  window.open(doc.output('bloburl'), '_blank');
  showToast('Informe PDF generado correctamente', 'success');
}

/* ============================================================
   PETICIONES PDF  
   ============================================================ */

function exportSinglePDF(id) {
  const d = demandas.find(x => x.id === id);
  if (!d) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  /* ---- Constantes de layout ---- */
  const PW   = 215.9;   // ancho carta
  const ML   = 10;      // margen izquierdo
  const MR   = 10;      // margen derecho
  const CW   = PW - ML - MR; // 195.9 mm utilizables
  const RH   = 9;       // alto de cada fila
  const VGAP = 3;       // separacion vertical entre filas
  const HGAP = 5;       // separacion horizontal entre columnas
  const FS   = 7.5;     // tamano de fuente (pt)

  /* ---- Logos ---- */
  const escudoFile = (currentLogosMeta && currentLogosMeta.escudo)      || 'escudo.png';
  const logoFile   = (currentLogosMeta && currentLogosMeta.logo_sapase) || 'logo_sapase.png';
  try { doc.addImage(`assets/${escudoFile}`, 'PNG', ML,            3, 34, 16); } catch(e) {}
  try { doc.addImage(`assets/${logoFile}`,   'PNG', PW - MR - 40, 3, 40, 16); } catch(e) {}

  /* rowTop = borde superior de la fila actual */
  let rowTop = 28;

  function field(label, value, x, x2, h) {
    h = (h != null) ? h : RH;
    /* baseline: centrada para filas normales, alineada arriba para filas altas */
    const textY = rowTop + (h === RH ? h / 2 + 1.3 : 3.5);

    /* Etiqueta en negrita */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS);
    doc.setTextColor(40, 40, 40);
    const labelTxt = label ? label + ':' : '';
    const labelW   = label ? doc.getTextWidth(labelTxt) + 1.5 : 0;
    if (label) doc.text(labelTxt, x, textY);

    /* Recuadro */
    const boxX = x + labelW;
    const boxW = x2 - boxX;
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.2);
    doc.rect(boxX, rowTop, boxW, h);

    /* Valor en normal, con padding interior y soporte de wrapping */
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(String(value || ''), boxW - 4);
    doc.text(lines, boxX + 2, textY, { maxWidth: boxW - 4 });
  }

  function nextRow() { rowTop += RH + VGAP; }

  /* Igual que field(), pero centra verticalmente el bloque de texto,
     si el valor ocupa varias lineas, sube
     hacia el renglon de arriba para quedar centrado en el recuadro. */
  function fieldCentered(label, value, x, x2, h) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS);
    doc.setTextColor(40, 40, 40);
    const labelTxt = label ? label + ':' : '';
    const labelW   = label ? doc.getTextWidth(labelTxt) + 1.5 : 0;
    const boxX     = x + labelW;
    const boxW     = x2 - boxX;

    const lines       = doc.splitTextToSize(String(value || ''), boxW - 4);
    const lineH        = FS * 0.352 * 1.15;
    const totalTextH   = (lines.length - 1) * lineH;
    const textY         = rowTop + (h + 1.3) / 2 - totalTextH / 2;

    if (label) doc.text(labelTxt, x, textY);

    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.2);
    doc.rect(boxX, rowTop, boxW, h);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS);
    doc.setTextColor(40, 40, 40);
    doc.text(lines, boxX + 2, textY, { maxWidth: boxW - 4 });
  }

  
  const f1_fecha  = ML + 65;            // x2 de Fecha    = 75
  const f1_folio  = f1_fecha  + HGAP + 52; // x2 de Folio    = 132
  const f1_oficio = PW - MR;            // x2 de No.Oficio = 205.9

  field('Fecha',      d.fecha,     ML,              f1_fecha);
  field('Folio',      d.folio,     f1_fecha + HGAP, f1_folio);
  field('Folio de Demanda', d.ref || '', f1_folio + HGAP, f1_oficio);
  nextRow();

  /* ================================================================
     FILA 2 — Fecha de la Demanda 
     ================================================================ */
  if (d.fechaDemanda) {
    field('Fecha de la Demanda', d.fechaDemanda, ML, ML + 95);
    nextRow();
  }

  /* ================================================================
     FILA 3 — Nombre 
     ================================================================ */
  field('Nombre', d.remitente, ML, ML + 130);
  nextRow();

  /* ================================================================
     FILA 4 — Domicilio y Colonia
     ================================================================ */
  const f4_dom = ML + 117;
  const RH2 = 10;
  fieldCentered('Domicilio', d.domicilio || '', ML,           f4_dom, RH2);
  fieldCentered('Colonia',   d.colonia   || '', f4_dom + HGAP, PW - MR, RH2);
  rowTop += RH2 + VGAP;

  /* ================================================================
     FILA 5 — Teléfono 
     ================================================================ */
  const telStr = [d.tel1, d.tel2].filter(Boolean).join('  /  ');
  field('Telefono', telStr, ML, ML + 90);
  nextRow();

  /* ================================================================
     FILA 6 — Demanda 
     ================================================================ */
  field('Demanda', d.demanda || '', ML, ML + 130);
  nextRow();

  /* ================================================================
     FILA 7 — Asunto 
     ================================================================ */
  const asuntoH = 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FS);
  const asuntoLabelW = doc.getTextWidth('Asunto:') + 1.5;
  const asuntoBoxX   = ML + asuntoLabelW;
  const asuntoBoxW   = PW - MR - asuntoBoxX;

  const asuntoLines  = doc.splitTextToSize(d.asunto || '', asuntoBoxW - 4);
  const lineH        = FS * 0.352 * 1.15;                          // ~3 mm por renglón
  const totalTextH   = (asuntoLines.length - 1) * lineH;
  const asuntoTextY  = rowTop + (asuntoH + 1.3) / 2 - totalTextH / 2;

  doc.setTextColor(40, 40, 40);
  doc.text('Asunto:', ML, asuntoTextY);

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.2);
  doc.rect(asuntoBoxX, rowTop, asuntoBoxW, asuntoH);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FS);
  doc.setTextColor(40, 40, 40);
  doc.text(asuntoLines, asuntoBoxX + 2, asuntoTextY, { maxWidth: asuntoBoxW - 4 });
  rowTop += asuntoH + VGAP;

  window.open(doc.output('bloburl'), '_blank');
  showToast('PDF listo para imprimir', 'success');
}
