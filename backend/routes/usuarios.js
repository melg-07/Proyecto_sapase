const router = require('express').Router();
const bcrypt = require('bcrypt');
const db     = require('../db');
const { authMiddleware, soloAdmin } = require('../middleware/auth');

// Los roles 'area_usuario' y 'jefe_area' requieren siempre un area asignada, y 'subarea_usuario' una subarea
function validarAreaDeRol(rol, area_id, subarea_id) {
  if (rol === 'area_usuario' && !area_id) {
    return 'El rol "Usuario de Area" requiere un area asignada';
  }
  if (rol === 'jefe_area' && !area_id) {
    return 'El rol "Jefe de Area" requiere un area asignada';
  }
  if (rol === 'subarea_usuario' && !subarea_id) {
    return 'El rol "Usuario de Subarea" requiere una subarea asignada';
  }
  return null;
}

router.use(authMiddleware);

router.get('/me', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.nombre, u.usuario, u.correo, u.telefono, u.cargo, u.rol, u.activo,
              a.id AS area_id, a.nombre AS area,
              sa.id AS subarea_id, sa.nombre AS subarea
       FROM usuarios u
       LEFT JOIN areas a     ON u.area_id    = a.id
       LEFT JOIN subareas sa ON u.subarea_id = sa.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/', soloAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.nombre, u.usuario, u.password_texto, u.correo, u.telefono, u.cargo, u.rol, u.activo,
              a.id AS area_id, a.nombre AS area,
              sa.id AS subarea_id, sa.nombre AS subarea
       FROM usuarios u
       LEFT JOIN areas a     ON u.area_id    = a.id
       LEFT JOIN subareas sa ON u.subarea_id = sa.id
       ORDER BY u.id ASC`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/', soloAdmin, async (req, res) => {
  try {
    const { nombre, usuario, password, area_id, subarea_id, correo, telefono, cargo, rol } = req.body;
    if (!nombre || !usuario || !password) {
      return res.status(400).json({ ok: false, error: 'Nombre, usuario y password son requeridos' });
    }
    const errorArea = validarAreaDeRol(rol || 'Capturista', area_id, subarea_id);
    if (errorArea) {
      return res.status(400).json({ ok: false, error: errorArea });
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      `INSERT INTO usuarios (nombre, usuario, password_hash, password_texto, area_id, subarea_id, correo, telefono, cargo, rol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre, usuario, hash, password, area_id || null, subarea_id || null, correo || null, telefono || null, cargo || null, rol || 'Capturista']
    );
    res.json({ ok: true, data: { id: result.insertId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, error: 'El nombre de usuario ya existe' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/:id', soloAdmin, async (req, res) => {
  try {
    const { nombre, usuario, password, area_id, subarea_id, correo, telefono, cargo, rol, activo } = req.body;

    if (rol !== undefined || area_id !== undefined || subarea_id !== undefined) {
      const [current] = await db.execute('SELECT rol, area_id, subarea_id FROM usuarios WHERE id = ?', [req.params.id]);
      if (!current.length) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      const rolFinal       = rol        !== undefined ? rol        : current[0].rol;
      const areaIdFinal    = area_id    !== undefined ? area_id    : current[0].area_id;
      const subareaIdFinal = subarea_id !== undefined ? subarea_id : current[0].subarea_id;
      const errorArea      = validarAreaDeRol(rolFinal, areaIdFinal, subareaIdFinal);
      if (errorArea) return res.status(400).json({ ok: false, error: errorArea });
    }

    const fields = [];
    const vals   = [];

    if (nombre     !== undefined) { fields.push('nombre = ?');        vals.push(nombre); }
    if (usuario    !== undefined) { fields.push('usuario = ?');       vals.push(usuario); }
    if (correo     !== undefined) { fields.push('correo = ?');        vals.push(correo); }
    if (telefono   !== undefined) { fields.push('telefono = ?');      vals.push(telefono); }
    if (cargo      !== undefined) { fields.push('cargo = ?');         vals.push(cargo); }
    if (rol        !== undefined) { fields.push('rol = ?');           vals.push(rol); }
    if (activo     !== undefined) { fields.push('activo = ?');        vals.push(activo ? 1 : 0); }
    if (area_id    !== undefined) { fields.push('area_id = ?');       vals.push(area_id || null); }
    if (subarea_id !== undefined) { fields.push('subarea_id = ?');    vals.push(subarea_id || null); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      fields.push('password_hash = ?');
      vals.push(hash);
      fields.push('password_texto = ?');
      vals.push(password);
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
