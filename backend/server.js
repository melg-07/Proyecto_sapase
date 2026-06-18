// ============================================================
//  SAPASE – Servidor Express principal
//  Arrancar con:  node server.js   o   npm run dev
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ---- Middlewares ----
app.use(cors({
  origin: [
    'http://localhost:5500',   // Live Server de VS Code
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Servir el frontend estatico (carpeta raiz del proyecto) ----
// Los archivos HTML/CSS/JS estan un nivel arriba del backend
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

// ---- Manejo de errores global ----
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

// ---- Arrancar ----
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n  SAPASE API corriendo en  http://localhost:${PORT}`);
  console.log(`  Frontend en             http://localhost:${PORT}/index.html\n`);
});
