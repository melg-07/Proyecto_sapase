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

  /* ---- Linea divisoria ---- */
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.4);
  doc.line(ML, 22, PW - MR, 22);

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

  /* Igual que field(), pero centra verticalmente el bloque de texto
     completo (como en Asunto): si el valor ocupa varias lineas, sube
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
     FILA 5 — Telefono 
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
