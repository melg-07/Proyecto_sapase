// ============================================================
//  SAPASE – Rutas de Demandas
//  GET    /api/demandas             – listar
//  GET    /api/demandas/:id         – detalle
//  POST   /api/demandas             – crear
//  PUT    /api/demandas/:id         – editar
//  DELETE /api/demandas/:id         – eliminar (admin)
//  POST   /api/demandas/:id/transferir – transferir a otra area
// ============================================================
const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, soloAdmin } = require('../middleware/auth');

router.use(authMiddleware);

/* ---- helper: convierte fecha dd/mm/yyyy a yyyy-mm-dd para MySQL ---- */
function parseFecha(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;   // ya es ISO
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

/* ---- helper: siguiente folio ---- */
async function siguienteFolio() {
  const year = new Date().getFullYear();
  const [rows] = await db.execute(
    "SELECT COUNT(*) AS total FROM demandas WHERE folio LIKE ?",
    [`SAPASE-${year}-%`]
  );
  const num = String(rows[0].total + 1).padStart(6, '0');
  return `SAPASE-${year}-${num}`;
}

// ---------- LISTAR ----------
router.get('/', async (req, res) => {
  try {
    const { area, estado, q } = req.query;
    let sql  = 'SELECT * FROM v_demandas WHERE 1=1';
    const params = [];

    if (area)   { sql += ' AND area = ?';  params.push(area); }
    if (estado) { sql += ' AND estado = ?'; params.push(estado); }
    if (q)      { 
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

    // Historial de transferencias
    const [hist] = await db.execute(
      `SELECT t.transferido_en, ao.nombre AS area_origen, ad.nombre AS area_destino,
              t.comentario, u.nombre AS transferido_por
       FROM transferencias t
       LEFT JOIN areas ao    ON t.area_origen_id  = ao.id
       LEFT JOIN areas ad    ON t.area_destino_id = ad.id
       LEFT JOIN usuarios u  ON t.transferido_por = u.id
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
      demanda, observaciones, concepto,
      fecha_demanda
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
        id, folio,
        parseFecha(fecha_demanda),
        ref       || null,
        area_id   || null,
        remitente, asunto,
        domicilio || null, colonia  || null,
        tel1      || null, tel2     || null,
        demanda   || null, observaciones || null, concepto || null,
        req.user.id
      ]
    );

    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [id]);
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- EDITAR ----------
router.put('/:id', async (req, res) => {
  try {
    const {
      ref, area_id, remitente, asunto, domicilio, colonia,
      tel1, tel2, demanda, observaciones, concepto, estado, fecha_demanda
    } = req.body;

    await db.execute(
      `UPDATE demandas SET
        folio_ref      = ?,
        area_id        = ?,
        remitente      = ?,
        asunto         = ?,
        domicilio      = ?,
        colonia        = ?,
        tel_principal  = ?,
        tel_secundario = ?,
        descripcion    = ?,
        observaciones  = ?,
        concepto       = ?,
        estado         = ?,
        fecha_demanda  = ?
       WHERE id = ?`,
      [
        ref       || null, area_id   || null,
        remitente, asunto,
        domicilio || null, colonia   || null,
        tel1      || null, tel2      || null,
        demanda   || null, observaciones || null, concepto || null,
        estado    || 'Pendiente',
        parseFecha(fecha_demanda),
        req.params.id
      ]
    );

    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [req.params.id]);
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
    const { area_destino_id, comentario } = req.body;
    if (!area_destino_id) return res.status(400).json({ ok: false, error: 'area_destino_id requerido' });

    // Area origen actual
    const [dem] = await db.execute('SELECT area_id FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    await db.execute(
      `INSERT INTO transferencias (demanda_id, area_origen_id, area_destino_id, comentario, transferido_por)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, dem[0].area_id, area_destino_id, comentario || null, req.user.id]
    );

    await db.execute(
      "UPDATE demandas SET area_id = ?, estado = 'En proceso' WHERE id = ?",
      [area_destino_id, req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
