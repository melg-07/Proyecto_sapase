// ============================================================
//  SAPASE – Rutas de Areas
//  GET    /api/areas           – listar todas
//  POST   /api/areas           – crear nueva (admin)
//  PUT    /api/areas/:id       – editar nombre (admin)
//  PATCH  /api/areas/:id/toggle – activar/desactivar (admin)
// ============================================================
const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, soloAdmin } = require('../middleware/auth');

// Todas las rutas requieren token
router.use(authMiddleware);

// ---------- LISTAR ----------
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, nombre, activa FROM areas ORDER BY id ASC'
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- CREAR ----------
router.post('/', soloAdmin, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre?.trim()) {
      return res.status(400).json({ ok: false, error: 'Nombre requerido' });
    }
    const nombreUp = nombre.trim().toUpperCase();
    const [result] = await db.execute(
      'INSERT INTO areas (nombre) VALUES (?)',
      [nombreUp]
    );
    res.json({ ok: true, data: { id: result.insertId, nombre: nombreUp, activa: true } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, error: 'Ya existe un area con ese nombre' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- EDITAR NOMBRE ----------
router.put('/:id', soloAdmin, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre?.trim()) {
      return res.status(400).json({ ok: false, error: 'Nombre requerido' });
    }
    await db.execute(
      'UPDATE areas SET nombre = ? WHERE id = ?',
      [nombre.trim().toUpperCase(), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- TOGGLE ACTIVA ----------
router.patch('/:id/toggle', soloAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT activa FROM areas WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Area no encontrada' });
    const nueva = rows[0].activa ? 0 : 1;
    await db.execute('UPDATE areas SET activa = ? WHERE id = ?', [nueva, req.params.id]);
    res.json({ ok: true, activa: !!nueva });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
