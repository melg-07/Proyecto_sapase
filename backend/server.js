require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

// Logger
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function log(level, msg) {
  const ts   = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${level}] ${msg}\n`;
  (level === 'ERROR' ? process.stderr : process.stdout).write(line);
  const file = level === 'ERROR' ? 'error.log' : 'combined.log';
  try { fs.appendFileSync(path.join(logsDir, file), line); } catch (_) {}
}

process.on('uncaughtException', (err) => {
  log('ERROR', 'UncaughtException: ' + (err.stack || err));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log('ERROR', 'UnhandledRejection: ' + (reason?.stack || reason));
});

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/Sistema_Gestión_de_Peticiones',express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/areas',    require('./routes/areas'));
app.use('/api/subareas', require('./routes/subareas'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/demandas', require('./routes/demandas'));
app.use('/api/config',   require('./routes/config'));

app.get('/Sistema_Gestión_de_Peticiones', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.use((err, req, res, _next) => {
  log('ERROR', `${req.method} ${req.path} – ${err.stack || err}`);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();

  log('INFO', `SAPASE iniciado en puerto ${PORT}`);
  log('INFO', `Local: http://localhost:${PORT}`);
  log('INFO', `Accesible desde red: http://0.0.0.0:${PORT}`);
  Object.values(nets).flat()
    .filter(n => n.family === 'IPv4' && !n.internal)
    .forEach(n => log('INFO', `LAN:   http://${n.address}:${PORT}`));
});
