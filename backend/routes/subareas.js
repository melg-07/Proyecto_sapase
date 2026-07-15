const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, adminOSubadmin, areaUsuarioGuard, scopeArea } = require('../middleware/auth');

router.use(authMiddleware);
router.use(areaUsuarioGuard);

// Lista las subareas de un area.
router.get('/', async (req, res) => {
  try {
    const scope = scopeArea(req);
    const areaId = scope || (req.query.area_id ? Number(req.query.area_id) : null);

    if (!areaId) {
      return res.status(400).json({ ok: false, error: 'area_id requerido' });
    }
    if (scope && Number(req.query.area_id) && Number(req.query.area_id) !== scope) {
      return res.status(403).json({ ok: false, error: 'No puedes ver subareas de otra area' });
    }

    const [rows] = await db.execute(
      'SELECT id, area_id, nombre, activa FROM subareas WHERE area_id = ? ORDER BY id ASC',
      [areaId]
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Crea una subarea nueva dentro de un area.
router.post('/', adminOSubadmin, async (req, res) => {
  try {
    const { area_id, nombre } = req.body;
    if (!area_id || !nombre?.trim()) {
      return res.status(400).json({ ok: false, error: 'Area y nombre son requeridos' });
    }
    const nombreVal = nombre.trim();
    const [result] = await db.execute(
      'INSERT INTO subareas (area_id, nombre) VALUES (?, ?)',
      [area_id, nombreVal]
    );
    res.json({ ok: true, data: { id: result.insertId, area_id: Number(area_id), nombre: nombreVal, activa: true } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, error: 'Ya existe una subarea con ese nombre en esta area' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Renombra una subarea.
router.put('/:id', adminOSubadmin, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre?.trim()) {
      return res.status(400).json({ ok: false, error: 'Nombre requerido' });
    }
    const nombreVal = nombre.trim();
    const [result] = await db.execute(
      'UPDATE subareas SET nombre = ? WHERE id = ?',
      [nombreVal, req.params.id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: 'Subarea no encontrada' });
    }
    res.json({ ok: true, data: { nombre: nombreVal } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, error: 'Ya existe una subarea con ese nombre en esta area' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Elimina una subarea.
router.delete('/:id', adminOSubadmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM subareas WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: 'Subarea no encontrada' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
