const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { authMiddleware, soloAdmin } = require('../middleware/auth');

const assetsDir = path.join(__dirname, '..', '..', 'assets');
const metaPath  = path.join(assetsDir, 'logos.json');

const LOGO_KEYS = ['escudo', 'logo_sapase'];

const DEFAULT_META = { escudo: 'escudo.png', logo_sapase: 'logo_sapase.png', version: 0 };

function readMeta() {
  try {
    return { ...DEFAULT_META, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) };
  } catch (_) {
    return { ...DEFAULT_META };
  }
}

function writeMeta(meta) {
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Formato de imagen no permitido'));
    }
  },
});

// Publico: la pantalla de login tambien necesita mostrar los logos
router.get('/logos', (req, res) => {
  res.json({ ok: true, data: readMeta() });
});

// Solo administradores pueden reemplazar los logos
router.post('/logos/:key', authMiddleware, soloAdmin, (req, res, next) => {
  upload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    next();
  });
}, (req, res) => {
  try {
    const key = req.params.key;
    if (!LOGO_KEYS.includes(key)) {
      return res.status(400).json({ ok: false, error: 'Logo no valido' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Se requiere una imagen' });
    }

    const meta     = readMeta();
    const ext      = path.extname(req.file.originalname).toLowerCase();
    const filename = `${key}${ext}`;

    // Si el nuevo archivo tiene otra extension, elimina el anterior
    if (meta[key] && meta[key] !== filename) {
      try { fs.unlinkSync(path.join(assetsDir, meta[key])); } catch (_) {}
    }

    fs.writeFileSync(path.join(assetsDir, filename), req.file.buffer);

    meta[key]  = filename;
    meta.version = Date.now();
    writeMeta(meta);

    res.json({ ok: true, data: meta });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
