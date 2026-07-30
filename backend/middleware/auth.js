const jwt = require('jsonwebtoken');
const db = require('../db');

async function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.execute(
      'SELECT id FROM sesiones WHERE token = ? AND activa = 1 AND expira_en > NOW() LIMIT 1',
      [token]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Sesion invalida o cerrada' });
    }

    req.user = payload; // { id, usuario, rol, nombre, area_id }
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Token invalido o expirado' });
  }
}

function soloAdmin(req, res, next) {
  if (req.user?.rol !== 'Administrador') {
    return res.status(403).json({ ok: false, error: 'Solo administradores' });
  }
  next();
}

// Administrador o Subadmin: mismos privilegios de gestion, salvo usuarios y configuracion
function adminOSubadmin(req, res, next) {
  if (req.user?.rol !== 'Administrador' && req.user?.rol !== 'Subadmin') {
    return res.status(403).json({ ok: false, error: 'No tienes permisos suficientes' });
  }
  next();
}

function noConsulta(req, res, next) {
  if (req.user?.rol === 'Consulta') {
    return res.status(403).json({ ok: false, error: 'El usuario de consulta solo puede ver e imprimir' });
  }
  next();
}

// Bloquea a un usuario de area o jefe de area sin area_id asignada (evita que quede sin restriccion por error de datos)
function areaUsuarioGuard(req, res, next) {
  if ((req.user?.rol === 'area_usuario' || req.user?.rol === 'jefe_area') && !req.user.area_id) {
    return res.status(403).json({ ok: false, error: 'Tu usuario no tiene un area asignada. Contacta al administrador.' });
  }
  next();
}

// Bloquea a un usuario de subarea sin subarea_id asignada
function subareaUsuarioGuard(req, res, next) {
  if (req.user?.rol === 'subarea_usuario' && !req.user.subarea_id) {
    return res.status(403).json({ ok: false, error: 'Tu usuario no tiene una subarea asignada. Contacta al administrador.' });
  }
  next();
}

// Devuelve el area_id al que debe restringirse la consulta, o null si el usuario ve todas las areas
function scopeArea(req) {
  return (req.user?.rol === 'area_usuario' || req.user?.rol === 'jefe_area') ? req.user.area_id : null;
}

// Devuelve el subarea_id al que debe restringirse la consulta, o null si no aplica
function scopeSubarea(req) {
  return req.user?.rol === 'subarea_usuario' ? req.user.subarea_id : null;
}

module.exports = {
  authMiddleware, soloAdmin, adminOSubadmin, noConsulta,
  areaUsuarioGuard, subareaUsuarioGuard, scopeArea, scopeSubarea,
};
