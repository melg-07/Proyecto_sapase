const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({ ok: false, error: 'Usuario y password requeridos' });
    }

    const [rows] = await db.execute(
      `SELECT u.*, a.nombre AS area_nombre
       FROM usuarios u
       LEFT JOIN areas a ON u.area_id = a.id
       WHERE u.usuario = ? AND u.activo = 1
       LIMIT 1`,
      [usuario]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Usuario o contrasena incorrectos' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ ok: false, error: 'Usuario o contrasena incorrectos' });
    }

    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre, area_id: user.area_id || null },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '8h' }
    );

    const expira = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.execute(
      'INSERT INTO sesiones (usuario_id, token, ip, expira_en) VALUES (?, ?, ?, ?)',
      [user.id, token, req.ip, expira]
    );

    res.json({
      ok: true,
      token,
      user: {
        id:        user.id,
        nombre:    user.nombre,
        usuario:   user.usuario,
        rol:       user.rol,
        area_id:   user.area_id || null,
        area:      user.area_nombre || '',
        correo:    user.correo      || '',
        telefono:  user.telefono    || '',
        cargo:     user.cargo       || '',
        activo:    !!user.activo,
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// Logout
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const token = req.headers['authorization'].slice(7);
    await db.execute('UPDATE sesiones SET activa = 0 WHERE token = ?', [token]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error al cerrar sesion' });
  }
});

module.exports = router;
