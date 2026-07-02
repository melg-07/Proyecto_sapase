const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, usuario, rol, nombre }
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

function noConsulta(req, res, next) {
  if (req.user?.rol === 'Consulta') {
    return res.status(403).json({ ok: false, error: 'El usuario de consulta solo puede ver e imprimir' });
  }
  next();
}

module.exports = { authMiddleware, soloAdmin, noConsulta };
