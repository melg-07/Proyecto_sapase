const express      = require('express');
const cors         = require('cors');
const { execFile } = require('child_process');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');
const { PDFDocument } = require('pdf-lib');

const config = require('./config.json');

const PUERTO              = Number(process.env.PORT || config.puerto || 5175);
const NOMBRE_DISPOSITIVO  = process.env.SCANNER_DEVICE_NAME || config.nombreDispositivo || '';
const MODO_ESCANEO        = (process.env.SCANNER_MODE || config.modoEscaneo || 'smarttouch').toLowerCase();
const RUTA_SMART_TOUCH    = process.env.SCANNER_SMART_TOUCH_PATH || config.rutaSmartTouch || '';
const RUTA_TWAIN          = process.env.SCANNER_TWAIN_PATH || config.rutaTwain || '';
const ORIGENES_PERMITIDOS = config.origenesPermitidos || [];
const SCRIPT_PATH         = path.join(__dirname, 'scripts', 'scan-wia.ps1');

function getModoEscaneoConfig() {
  if (MODO_ESCANEO === 'twain') {
    return { modo: 'twain', ruta: RUTA_TWAIN };
  }

  if (MODO_ESCANEO === 'wia') {
    return { modo: 'wia', ruta: '' };
  }

  return { modo: 'smarttouch', ruta: RUTA_SMART_TOUCH };
}
const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !ORIGENES_PERMITIDOS.length || ORIGENES_PERMITIDOS.includes('*')) {
      return callback(null, true);
    }
    if (ORIGENES_PERMITIDOS.includes(origin)) return callback(null, true);
    callback(new Error('Origen no permitido: ' + origin));
  },
}));

app.get('/health', (req, res) => {
  res.json({ ok: true, mensaje: 'Agente de Escaneo SAPASE activo', dispositivo: NOMBRE_DISPOSITIVO || '(cualquiera)' });
});

app.post('/scan', (req, res) => {
  const modoEscaneo = getModoEscaneoConfig();

  if (modoEscaneo.modo === 'smarttouch' || modoEscaneo.modo === 'twain') {
    if (!modoEscaneo.ruta) {
      return res.status(400).json({
        ok: false,
        error: `El agente está configurado en modo ${modoEscaneo.modo}, pero no hay una ruta del ejecutable configurada. Agrega la ruta de Smart Touch o TWAIN en config.json y vuelve a intentar.`,
      });
    }

    try {
      return ejecutarEscaneoSmartTouch(modoEscaneo, res);
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'No se pudo iniciar el escaneo con ' + modoEscaneo.modo + ': ' + e.message });
    }
  }

  return ejecutarEscaneoWia(res);
});

async function ejecutarEscaneoWia(res, fallbackMotivo = '') {
  let tmpDir;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapase-scan-'));
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'No se pudo crear carpeta temporal: ' + err.message });
  }

  const args = [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH,
    '-OutputDir', tmpDir,
  ];
  if (NOMBRE_DISPOSITIVO) args.push('-NombreDispositivo', NOMBRE_DISPOSITIVO);

  if (fallbackMotivo) {
    console.warn('[SAPASE Agente] Smart Touch/TWAIN no generó salida. Intentando WIA como respaldo:', fallbackMotivo);
  } else {
    console.log('[SAPASE Agente] Escaneando...');
  }

  execFile('powershell.exe', args, { timeout: 180000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' }, async (err, stdout, stderr) => {
    if (stderr && stderr.trim()) console.log('[SAPASE Agente] ' + stderr.trim().replace(/\r?\n/g, '\n[SAPASE Agente] '));

    const resultPath = path.join(tmpDir, 'result.json');
    let payload;
    try {
      const raw = fs.readFileSync(resultPath, 'utf8');
      payload = JSON.parse(raw);
      console.log('[SAPASE Agente] Archivos recibidos desde WIA:', payload.files ? payload.files.length : 0);
    } catch (readErr) {
      cleanup(tmpDir);
      if (err) {
        return res.status(500).json({ ok: false, error: 'No se pudo ejecutar el escaneo: ' + err.message });
      }
      return res.status(500).json({ ok: false, error: 'Respuesta inesperada del escáner: ' + (stdout || '').trim().slice(0, 300) });
    }

    if (!payload.ok) {
      cleanup(tmpDir);
      return res.status(400).json({ ok: false, error: payload.error || 'No se pudo completar el escaneo.' });
    }

    try {
      const pdfBytes = await imagenesAPdf(payload.files);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="escaneo-${Date.now()}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (e) {
      res.status(500).json({ ok: false, error: 'No se pudo generar el PDF: ' + e.message });
    } finally {
      cleanup(tmpDir);
    }
  });
}

async function ejecutarEscaneoSmartTouch(modoEscaneo, res) {
  const exePath = modoEscaneo.ruta;

  if (!fs.existsSync(exePath)) {
    return res.status(400).json({
      ok: false,
      error: `No se encontró el ejecutable de ${modoEscaneo.modo} en: ${exePath}. Revisa la ruta en config.json.`,
    });
  }

  const outputDir = await obtenerDirectorioSalidaSmartTouch(exePath);

  console.log('[SAPASE Agente] Lanzando Smart Touch para escanear...');

  try {
    await new Promise((resolve, reject) => {
      const child = execFile(exePath, [], { detached: true, stdio: 'ignore', windowsHide: true }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
      child.unref();
    });
  } catch (error) {
    console.warn('[SAPASE Agente] El ejecutable se inició, pero la aplicación terminó antes de generar el archivo:', error.message);
  }

  try {
    const filePath = await esperarArchivoEscaneado(outputDir, 180000);
    const pdfBytes = await convertirArchivoAPdf(filePath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="escaneo-${Date.now()}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.warn('[SAPASE Agente] Smart Touch/TWAIN no produjo archivos válidos:', error.message);
    return ejecutarEscaneoWia(res, error.message);
  }
}

function obtenerDirectorioSalidaSmartTouch(exePath) {
  const candidates = new Set();
  const exeDir = path.dirname(exePath);

  candidates.add(path.join(exeDir, 'output'));
  candidates.add(path.join(exeDir, 'Output'));
  candidates.add(path.join(exeDir, 'exports'));
  candidates.add(path.join(exeDir, 'Exports'));

  const documentsRoot = path.join(os.homedir(), 'Documents');
  candidates.add(path.join(documentsRoot, 'Smart Touch', 's2000', 'output'));
  candidates.add(path.join(documentsRoot, 'Smart Touch', 'output'));
  candidates.add(path.join(documentsRoot, 's2000', 'output'));

  const selected = [...candidates].find(dir => fs.existsSync(dir));
  return selected || [...candidates][0];
}

async function esperarArchivoEscaneado(outputDir, timeoutMs) {
  const start = Date.now();
  const validExt = ['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff'];

  while (Date.now() - start < timeoutMs) {
    const candidates = [];

    for (const dir of [outputDir, path.dirname(outputDir)]) {
      if (!dir || !fs.existsSync(dir)) continue;

      const files = listFilesRecursive(dir)
        .filter(file => validExt.includes(path.extname(file).toLowerCase()));

      candidates.push(...files);
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      return candidates[0];
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Smart Touch no generó ningún archivo de escaneo en el tiempo esperado. Escanea manualmente el documento y asegúrate de que se guarde en la carpeta de salida del software.');
}

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];

  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

async function convertirArchivoAPdf(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return fs.readFileSync(filePath);
  }

  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    const bytes = fs.readFileSync(filePath);
    const pdf = await PDFDocument.create();
    const img = ext === '.png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    return pdf.save();
  }

  if (['.tif', '.tiff'].includes(ext)) {
    throw new Error('Smart Touch generó un TIFF, pero este motor requiere que el archivo salga como PDF o imagen JPG/PNG. Configura la salida del software a PDF.');
  }

  throw new Error('El archivo generado por Smart Touch no es compatible con PDF: ' + filePath);
}

async function imagenesAPdf(files) {
  const pdf = await PDFDocument.create();
  console.log('[SAPASE Agente] Generando PDF con', files.length, 'página(s)');

  for (const filePath of files) {
    const bytes = fs.readFileSync(filePath);
    const isPng = /\.png$/i.test(filePath);
    const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const saved = await pdf.save();
  console.log('[SAPASE Agente] PDF generado, páginas:', (await PDFDocument.load(saved)).getPageCount());
  return saved;
}

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

app.listen(PUERTO, '127.0.0.1', () => {
  console.log('==================================================');
  console.log('  Agente de Escaneo SAPASE');
  console.log(`  Escuchando en http://127.0.0.1:${PUERTO}`);
  console.log(`  Dispositivo configurado: "${NOMBRE_DISPOSITIVO || '(el primero disponible)'}"`);
  console.log('  Deja esta ventana abierta mientras uses el escaneo');
  console.log('  desde la página de SAPASE. Ciérrala cuando termines.');
  console.log('==================================================');
});
