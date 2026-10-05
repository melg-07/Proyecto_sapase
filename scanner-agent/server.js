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

  const outputDirs = obtenerDirectoriosSalidaSmartTouch(exePath);
  const archivosAntes = capturarArchivosSalida(outputDirs);

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
    const files = await esperarArchivosEscaneados(outputDirs, 180000, archivosAntes);
    const pdfBytes = await convertirArchivosAPdf(files);
    const pdf = await PDFDocument.load(pdfBytes);
    if (pdf.getPageCount() < 1) throw new Error('El PDF del escaneo no contiene páginas.');
    console.log('[SAPASE Agente] PDF generado con', pdf.getPageCount(), 'página(s) desde TWAIN/Smart Touch');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="escaneo-${Date.now()}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.warn('[SAPASE Agente] Smart Touch/TWAIN no produjo archivos válidos:', error.message);
    return ejecutarEscaneoWia(res, error.message);
  }
}

function obtenerDirectoriosSalidaSmartTouch(exePath) {
  const candidates = new Set();
  const exeDir = path.dirname(exePath);
  const documentsRoot = path.join(os.homedir(), 'Documents');
  const localSmartTouchRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Smart Touch', 's2000');

  candidates.add(path.join(exeDir, 'output'));
  candidates.add(path.join(exeDir, 'Output'));
  candidates.add(path.join(exeDir, 'exports'));
  candidates.add(path.join(exeDir, 'Exports'));
  candidates.add(path.join(documentsRoot, 'Smart Touch', 's2000', 'output'));
  candidates.add(path.join(documentsRoot, 'Smart Touch', 'output'));
  candidates.add(path.join(documentsRoot, 's2000', 'output'));
  candidates.add(path.join(documentsRoot, 'Smart Touch', 's2000'));
  candidates.add(localSmartTouchRoot);

  return [...candidates];
}

const EXTENSIONES_ESCANEO = ['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff'];

function listarArchivosSalida(outputDirs) {
  return [...new Set(outputDirs.flatMap(dir => listFilesRecursive(dir)))]
    .filter(file => EXTENSIONES_ESCANEO.includes(path.extname(file).toLowerCase()));
}

function capturarArchivosSalida(outputDirs) {
  return new Map(listarArchivosSalida(outputDirs).map(file => {
    const stat = fs.statSync(file);
    return [file, `${stat.size}:${stat.mtimeMs}`];
  }));
}

async function esperarArchivosEscaneados(outputDirs, timeoutMs, archivosAntes) {
  const start = Date.now();
  let firmaAnterior = '';
  let estableDesde = 0;

  while (Date.now() - start < timeoutMs) {
    const files = listarArchivosSalida(outputDirs).filter(file => {
      const stat = fs.statSync(file);
      const firma = `${stat.size}:${stat.mtimeMs}`;
      return !archivosAntes.has(file) || archivosAntes.get(file) !== firma;
    });

    if (files.length) {
      const firma = files.map(file => {
        const stat = fs.statSync(file);
        return `${file}:${stat.size}:${stat.mtimeMs}`;
      }).sort().join('|');

      if (firma !== firmaAnterior) {
        firmaAnterior = firma;
        estableDesde = Date.now();
      } else if (Date.now() - estableDesde >= 10000) {
        const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
        return (pdfFiles.length ? pdfFiles : files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      }
    } else {
      firmaAnterior = '';
      estableDesde = 0;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
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

async function convertirArchivosAPdf(files) {
  if (files.length === 1 && path.extname(files[0]).toLowerCase() === '.pdf') {
    const bytes = fs.readFileSync(files[0]);
    await PDFDocument.load(bytes);
    return bytes;
  }

  const pdf = await PDFDocument.create();
  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      const source = await PDFDocument.load(fs.readFileSync(filePath));
      const pages = await pdf.copyPages(source, source.getPageIndices());
      pages.forEach(page => pdf.addPage(page));
      continue;
    }

    if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      const bytes = fs.readFileSync(filePath);
      const img = ext === '.png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      continue;
    }

    if (['.tif', '.tiff'].includes(ext)) {
      throw new Error('Smart Touch generó un TIFF, pero este motor requiere que el archivo salga como PDF o imagen JPG/PNG. Configura la salida del software a PDF.');
    }

    throw new Error('El archivo generado por Smart Touch no es compatible con PDF: ' + filePath);
  }

  return pdf.save();
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

if (require.main === module) {
  app.listen(PUERTO, '127.0.0.1', () => {
    console.log('==================================================');
    console.log('  Agente de Escaneo SAPASE');
    console.log(`  Escuchando en http://127.0.0.1:${PUERTO}`);
    console.log(`  Dispositivo configurado: "${NOMBRE_DISPOSITIVO || '(el primero disponible)'}"`);
    console.log('  Deja esta ventana abierta mientras uses el escaneo');
    console.log('  desde la página de SAPASE. Ciérrala cuando termines.');
    console.log('==================================================');
  });
}

module.exports = { convertirArchivosAPdf };
