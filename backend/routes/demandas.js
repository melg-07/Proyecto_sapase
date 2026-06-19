// ============================================================
//  SAPASE – Rutas de Demandas
//  GET    /api/demandas             – listar
//  GET    /api/demandas/:id         – detalle
//  POST   /api/demandas             – crear
//  PUT    /api/demandas/:id         – editar (solo campos enviados)
//  DELETE /api/demandas/:id         – eliminar (admin)
//  POST   /api/demandas/:id/transferir – transferir a otra area
// ============================================================
const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, soloAdmin } = require('../middleware/auth');

router.use(authMiddleware);

/* ---- Sanitizador: undefined / '' -> null para MySQL ---- */
const s = v => (v === undefined || v === '') ? null : v;

/* ---- Convierte fecha dd/mm/yyyy o yyyy-mm-dd a yyyy-mm-dd para MySQL ---- */
function parseFecha(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

/* ---- Siguiente folio automatico ---- */
async function siguienteFolio() {
  const [rows] = await db.execute("SELECT COUNT(*) AS total FROM demandas");
  const num = String(rows[0].total + 1).padStart(5, '0');
  return `F-${num}`;
}

// ---------- LISTAR ----------
router.get('/', async (req, res) => {
  try {
    const { area, estado, q } = req.query;
    let sql    = 'SELECT * FROM v_demandas WHERE 1=1';
    const params = [];

    if (area)   { sql += ' AND area = ?';  params.push(area); }
    if (estado) { sql += ' AND estado = ?'; params.push(estado); }
    if (q) {
      sql += ' AND (folio LIKE ? OR remitente LIKE ? OR asunto LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY creado_en DESC';

    const [rows] = await db.execute(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- DETALLE ----------
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    const [hist] = await db.execute(
      `SELECT t.transferido_en, ao.nombre AS area_origen, ad.nombre AS area_destino,
              t.comentario, u.nombre AS transferido_por
       FROM transferencias t
       LEFT JOIN areas ao   ON t.area_origen_id  = ao.id
       LEFT JOIN areas ad   ON t.area_destino_id = ad.id
       LEFT JOIN usuarios u ON t.transferido_por = u.id
       WHERE t.demanda_id = ?
       ORDER BY t.transferido_en ASC`,
      [req.params.id]
    );

    res.json({ ok: true, data: { ...rows[0], historial: hist } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- CREAR ----------
router.post('/', async (req, res) => {
  try {
    const {
      ref, area_id, remitente, asunto,
      domicilio, colonia, tel1, tel2,
      demanda, observaciones, concepto, fecha_demanda
    } = req.body;

    if (!remitente || !asunto) {
      return res.status(400).json({ ok: false, error: 'Remitente y asunto son requeridos' });
    }

    const id    = 'D-' + Date.now();
    const folio = await siguienteFolio();

    await db.execute(
      `INSERT INTO demandas
        (id, folio, fecha_captura, fecha_demanda, folio_ref, area_id,
         remitente, asunto, domicilio, colonia, tel_principal, tel_secundario,
         descripcion, observaciones, concepto, estado, creado_por)
       VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)`,
      [
        id,
        folio,
        parseFecha(s(fecha_demanda)),
        s(ref),
        area_id != null && area_id !== '' ? Number(area_id) : null,
        String(remitente).trim(),
        String(asunto).trim(),
        s(domicilio),
        s(colonia),
        s(tel1),
        s(tel2),
        s(demanda),
        s(observaciones),
        s(concepto),
        req.user.id,
      ]
    );

    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [id]);
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- EDITAR (solo actualiza los campos presentes en el body) ----------
router.put('/:id', async (req, res) => {
  try {
    const body   = req.body;
    const fields = [];
    const vals   = [];

    // Mapa: clave recibida del frontend -> columna en la tabla
    const mapping = {
      ref:           'folio_ref',
      remitente:     'remitente',
      asunto:        'asunto',
      domicilio:     'domicilio',
      colonia:       'colonia',
      tel1:          'tel_principal',
      tel2:          'tel_secundario',
      demanda:       'descripcion',
      observaciones: 'observaciones',
      concepto:      'concepto',
      estado:        'estado',
    };

    for (const [key, col] of Object.entries(mapping)) {
      if (key in body) {
        fields.push(`${col} = ?`);
        vals.push(s(body[key]));
      }
    }

    if ('area_id' in body) {
      fields.push('area_id = ?');
      vals.push(body.area_id != null && body.area_id !== '' ? Number(body.area_id) : null);
    }

    if ('fecha_demanda' in body) {
      fields.push('fecha_demanda = ?');
      vals.push(parseFecha(s(body.fecha_demanda)));
    }

    if (!fields.length) {
      return res.status(400).json({ ok: false, error: 'Sin campos para actualizar' });
    }

    vals.push(req.params.id);
    await db.execute(`UPDATE demandas SET ${fields.join(', ')} WHERE id = ?`, vals);

    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- ELIMINAR (solo admin) ----------
router.delete('/:id', soloAdmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM demandas WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- TRANSFERIR ----------
router.post('/:id/transferir', async (req, res) => {
  try {
    const area_destino_id = req.body.area_destino_id;
    const comentario      = s(req.body.comentario);

    if (!area_destino_id) {
      return res.status(400).json({ ok: false, error: 'area_destino_id requerido' });
    }

    const [dem] = await db.execute('SELECT area_id FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    await db.execute(
      `INSERT INTO transferencias (demanda_id, area_origen_id, area_destino_id, comentario, transferido_por)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, dem[0].area_id, Number(area_destino_id), comentario, req.user.id]
    );

    await db.execute(
      "UPDATE demandas SET area_id = ?, estado = 'En proceso' WHERE id = ?",
      [Number(area_destino_id), req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
