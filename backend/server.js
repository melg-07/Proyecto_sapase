// ============================================================
//  SAPASE – Servidor Express principal
//  Arrancar con:  node server.js   o   npm run start:prod
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

// ============================================================
// Logger de archivos (sin dependencias externas)
// Escribe en:  backend/logs/combined.log  y  backend/logs/error.log
// NSSM adicionalmente captura stdout/stderr en sus propios archivos
// ============================================================
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function log(level, msg) {
  const ts   = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${level}] ${msg}\n`;
  (level === 'ERROR' ? process.stderr : process.stdout).write(line);
  const file = level === 'ERROR' ? 'error.log' : 'combined.log';
  try { fs.appendFileSync(path.join(logsDir, file), line); } catch (_) {}
}

// ---- Capturar errores no controlados para que queden en el log ----
process.on('uncaughtException', (err) => {
  log('ERROR', 'UncaughtException: ' + (err.stack || err));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log('ERROR', 'UnhandledRejection: ' + (reason?.stack || reason));
});

// ============================================================
const app = express();

// ---- CORS: permite acceso desde cualquier equipo de la red ----
app.use(cors({ origin: true, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Servir el frontend estatico (carpeta raiz del proyecto) ----
app.use(express.static(path.join(__dirname, '..')));

// ---- Rutas API ----
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/areas',    require('./routes/areas'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/demandas', require('./routes/demandas'));

// ---- Ruta raiz ----
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ---- Manejo de errores global de Express ----
app.use((err, req, res, _next) => {
  log('ERROR', `${req.method} ${req.path} – ${err.stack || err}`);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

// ---- Arrancar en todas las interfaces de red (0.0.0.0) ----
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();

  log('INFO', `SAPASE API iniciado en puerto ${PORT}`);
  log('INFO', `Acceso local:  http://localhost:${PORT}`);
  Object.values(nets).flat()
    .filter(n => n.family === 'IPv4' && !n.internal)
    .forEach(n => log('INFO', `Acceso LAN:    http://${n.address}:${PORT}`));

  log('INFO', `Logs en: ${logsDir}`);
});
