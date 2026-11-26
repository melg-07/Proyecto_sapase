const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, adminOSubadmin, areaUsuarioGuard, scopeArea } = require('../middleware/auth');

router.use(authMiddleware);
router.use(areaUsuarioGuard);

async function jefeDireccionGeneralGuard(req, res, next) {
  if (req.user?.rol !== 'jefe_area' || !req.user.area_id) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para consultar subareas de otras areas' });
  }
  try {
    const [rows] = await db.execute(
      `SELECT a.nombre
       FROM usuarios u
       JOIN areas a ON a.id = u.area_id
       WHERE u.id = ? AND u.area_id = ? AND u.rol = 'jefe_area'
         AND u.activo = 1 AND a.activa = 1`,
      [req.user.id, req.user.area_id]
    );
    const area = String(rows[0]?.nombre || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (area !== 'DIRECCION GENERAL') {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para consultar subareas de otras areas' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/consulta/global', jefeDireccionGeneralGuard, async (req, res) => {
  const areaId = Number(req.query.area_id);
  if (!Number.isInteger(areaId) || areaId <= 0) {
    return res.status(400).json({ ok: false, error: 'area_id requerido' });
  }
  try {
    const [rows] = await db.execute(
      'SELECT id, area_id, nombre, activa FROM subareas WHERE area_id = ? ORDER BY id ASC',
      [areaId]
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Lista las subareas de un area.
router.get('/', async (req, res) => {
  try {
    const scope = scopeArea(req);
    let areaId = scope || (req.query.area_id ? Number(req.query.area_id) : null);
    if (req.user?.rol === 'subarea_usuario') {
      const [subareas] = await db.execute(
        'SELECT area_id FROM subareas WHERE id = ?',
        [req.user.subarea_id]
      );
      areaId = subareas[0]?.area_id || null;
      if (req.query.area_id && Number(req.query.area_id) !== Number(areaId)) {
        return res.status(403).json({ ok: false, error: 'No puedes ver subareas de otra area' });
      }
    }

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
