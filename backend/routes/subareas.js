const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, areaUsuarioGuard, scopeArea } = require('../middleware/auth');

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

module.exports = router;
