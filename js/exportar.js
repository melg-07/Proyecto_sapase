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
  try { doc.addImage('assets/escudo.png',      'PNG', ML,            3, 34, 16); } catch(e) {}
  try { doc.addImage('assets/logo_sapase.png', 'PNG', PW - MR - 40, 3, 40, 16); } catch(e) {}

  /* ---- Linea divisoria ---- */
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.4);
  doc.line(ML, 22, PW - MR, 22);

  /* rowTop = borde superior de la fila actual */
  let rowTop = 28;

  /*
   * field(label, value, x, x2)
   *   x  — borde izquierdo del campo (donde empieza la etiqueta)
   *   x2 — borde derecho del recuadro (nunca debe superar PW - MR)
   *
   *   El texto se centra verticalmente dentro del recuadro de altura RH.
   */
  function field(label, value, x, x2) {
    /* baseline centrada: top + RH/2 + mitad aprox. de cap-height (7.5pt ≈ 1.3mm) */
    const textY = rowTop + RH / 2 + 1.3;

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
    doc.rect(boxX, rowTop, boxW, RH);

    /* Valor en normal, con padding interior y texto centrado verticalmente */
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS);
    doc.setTextColor(40, 40, 40);
    doc.text(String(value || ''), boxX + 2, textY, { maxWidth: boxW - 4 });
  }

  function nextRow() { rowTop += RH + VGAP; }

  /* ================================================================
     FILA 1 — Fecha | Folio | No. Oficio
     Anchos totales (label + box): 65 | 52 | resto
     Verificacion: 65 + HGAP + 52 + HGAP + resto = CW
     resto = 195.9 - 65 - 5 - 52 - 5 = 68.9 mm
     ================================================================ */
  const f1_fecha  = ML + 65;            // x2 de Fecha    = 75
  const f1_folio  = f1_fecha  + HGAP + 52; // x2 de Folio    = 132
  const f1_oficio = PW - MR;            // x2 de No.Oficio = 205.9

  field('Fecha',      d.fecha,     ML,              f1_fecha);
  field('Folio',      d.folio,     f1_fecha + HGAP, f1_folio);
  field('Folio de Demanda', d.ref || '', f1_folio + HGAP, f1_oficio);
  nextRow();

  /* ================================================================
     FILA 2 — Fecha de la Demanda (solo si existe, ~48% del ancho)
     ================================================================ */
  if (d.fechaDemanda) {
    field('Fecha de la Demanda', d.fechaDemanda, ML, ML + 95);
    nextRow();
  }

  /* ================================================================
     FILA 3 — Nombre (~66% del ancho para no ocupar toda la hoja)
     ================================================================ */
  field('Nombre', d.remitente, ML, ML + 130);
  nextRow();

  /* ================================================================
     FILA 4 — Domicilio (60%) | Colonia (resto)
     Cada campo con su propio recuadro, separados por HGAP
     ================================================================ */
  const f4_dom = ML + 117;             // x2 de Domicilio = 127
  field('Domicilio', d.domicilio || '', ML,             f4_dom);
  field('Colonia',   d.colonia   || '', f4_dom + HGAP,  PW - MR);
  nextRow();

  /* ================================================================
     FILA 5 — Telefono (~46% del ancho)
     ================================================================ */
  const telStr = [d.tel1, d.tel2].filter(Boolean).join('  /  ');
  field('Telefono', telStr, ML, ML + 90);
  nextRow();

  /* ================================================================
     FILA 6 — Asunto (ancho completo)
     ================================================================ */
  field('Asunto', d.asunto || '', ML, PW - MR);
  nextRow();

  /* ================================================================
     BLOQUE DESCRIPCION — caja alta, etiqueta a la izquierda
     El recuadro SIEMPRE termina en PW - MR (nunca se sale)
     ================================================================ */
  const descTextY  = rowTop + RH / 2 + 1.3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FS);
  doc.setTextColor(40, 40, 40);
  doc.text('Descripcion:', ML, descTextY);

  const descLabelW = doc.getTextWidth('Descripcion:') + 1.5;
  const descBoxX   = ML + descLabelW;
  const descBoxW   = PW - MR - descBoxX; // espacio restante hasta margen derecho
  const descBoxH   = 42;

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.2);
  doc.rect(descBoxX, rowTop, descBoxW, descBoxH);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FS);
  doc.setTextColor(40, 40, 40);
  const descLines = doc.splitTextToSize(d.demanda || '', descBoxW - 4);
  doc.text(descLines, descBoxX + 2, descTextY, { maxWidth: descBoxW - 4 });

  window.open(doc.output('bloburl'), '_blank');
  showToast('PDF listo para imprimir', 'success');
}
