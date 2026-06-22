const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, soloAdmin } = require('../middleware/auth');

router.use(authMiddleware);

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
