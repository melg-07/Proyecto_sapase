/**
 * Agente de Escaneo SAPASE (v2 — usa WIA, el mismo driver que instaló el
 * software de Kodak; NO requiere NAPS2 ni ningún otro programa).
 * ---------------------------------------------------------------
 * Este programa corre en la MISMA computadora donde está conectado el
 * escáner (Kodak S2070). Escucha en 127.0.0.1 (solo esta computadora puede
 * hablarle, nunca internet). Cuando la página de SAPASE pide un escaneo:
 *   1. Ejecuta scripts/scan-wia.ps1, que le habla directo al driver WIA
 *      del escáner (instalado junto con el software de Kodak) y devuelve
 *      una imagen por cada hoja escaneada (soporta el alimentador ADF).
 *   2. Une todas las páginas en un solo PDF (con la librería pdf-lib).
 *   3. Le regresa ese PDF al navegador, que lo agrega a la petición.
 *
 * Requisitos en esta computadora:
 *  1. Node.js instalado (https://nodejs.org).
 *  2. El driver del Kodak S2070 instalado (ya lo hiciste: InstallSoftware_s2000).
 *  3. Ejecutar "npm install" una vez, y luego "npm start"
 *     (o usar iniciar-agente.bat) cada vez que se quiera escanear desde SAPASE.
 */

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
const ORIGENES_PERMITIDOS = config.origenesPermitidos || [];
const SCRIPT_PATH         = path.join(__dirname, 'scripts', 'scan-wia.ps1');

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

  console.log('[SAPASE Agente] Escaneando...');

  execFile('powershell.exe', args, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, async (err, stdout, stderr) => {
    if (stderr && stderr.trim()) console.log('[SAPASE Agente] ' + stderr.trim().replace(/\r?\n/g, '\n[SAPASE Agente] '));

    if (err) {
      cleanup(tmpDir);
      return res.status(500).json({ ok: false, error: 'No se pudo ejecutar el escaneo: ' + err.message });
    }

    let payload;
    try {
      payload = JSON.parse(stdout.trim().split('\n').pop());
    } catch (_) {
      cleanup(tmpDir);
      return res.status(500).json({ ok: false, error: 'Respuesta inesperada del escáner: ' + stdout.trim().slice(0, 300) });
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
});

async function imagenesAPdf(files) {
  const pdf = await PDFDocument.create();
  for (const filePath of files) {
    const bytes = fs.readFileSync(filePath);
    const isPng = /\.png$/i.test(filePath);
    const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return pdf.save();
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
