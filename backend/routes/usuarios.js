// ============================================================
//  SAPASE – Rutas de Usuarios
//  GET    /api/usuarios        – listar (admin)
//  POST   /api/usuarios        – crear (admin)
//  PUT    /api/usuarios/:id    – editar (admin)
//  GET    /api/usuarios/me     – perfil propio
// ============================================================
const router = require('express').Router();
const bcrypt = require('bcrypt');
const db     = require('../db');
const { authMiddleware, soloAdmin } = require('../middleware/auth');

router.use(authMiddleware);

// ---------- MI PERFIL ----------
router.get('/me', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.nombre, u.usuario, u.correo, u.telefono, u.cargo, u.rol, u.activo,
              a.nombre AS area
       FROM usuarios u
       LEFT JOIN areas a ON u.area_id = a.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- LISTAR (admin) ----------
router.get('/', soloAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.nombre, u.usuario, u.correo, u.telefono, u.cargo, u.rol, u.activo,
              a.id AS area_id, a.nombre AS area
       FROM usuarios u
       LEFT JOIN areas a ON u.area_id = a.id
       ORDER BY u.id ASC`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- CREAR (admin) ----------
router.post('/', soloAdmin, async (req, res) => {
  try {
    const { nombre, usuario, password, area_id, correo, telefono, cargo, rol } = req.body;
    if (!nombre || !usuario || !password) {
      return res.status(400).json({ ok: false, error: 'Nombre, usuario y password son requeridos' });
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      `INSERT INTO usuarios (nombre, usuario, password_hash, area_id, correo, telefono, cargo, rol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre, usuario, hash, area_id || null, correo || null, telefono || null, cargo || null, rol || 'Capturista']
    );
    res.json({ ok: true, data: { id: result.insertId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, error: 'El nombre de usuario ya existe' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- EDITAR (admin) ----------
router.put('/:id', soloAdmin, async (req, res) => {
  try {
    const { nombre, usuario, password, area_id, correo, telefono, cargo, rol, activo } = req.body;
    const fields = [];
    const vals   = [];

    if (nombre    !== undefined) { fields.push('nombre = ?');        vals.push(nombre); }
    if (usuario   !== undefined) { fields.push('usuario = ?');       vals.push(usuario); }
    if (correo    !== undefined) { fields.push('correo = ?');        vals.push(correo); }
    if (telefono  !== undefined) { fields.push('telefono = ?');      vals.push(telefono); }
    if (cargo     !== undefined) { fields.push('cargo = ?');         vals.push(cargo); }
    if (rol       !== undefined) { fields.push('rol = ?');           vals.push(rol); }
    if (activo    !== undefined) { fields.push('activo = ?');        vals.push(activo ? 1 : 0); }
    if (area_id   !== undefined) { fields.push('area_id = ?');       vals.push(area_id || null); }
    if (password  )              { 
      const hash = await bcrypt.hash(password, 10);
      fields.push('password_hash = ?');
      vals.push(hash);
    }

    if (!fields.length) return res.status(400).json({ ok: false, error: 'Sin campos para actualizar' });

    vals.push(req.params.id);
    await db.execute(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
