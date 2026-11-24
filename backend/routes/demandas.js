const router = require('express').Router();
const db     = require('../db');
const {
  authMiddleware, soloAdmin, adminOSubadmin, noConsulta,
  areaUsuarioGuard, subareaUsuarioGuard, scopeArea, scopeSubarea,
} = require('../middleware/auth');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { execFile } = require('child_process');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function isContactCenterAreaName(name) {
  const area = String(name || '').trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  return /^(?:DEPARTAMENTO DE )?CONTAC(?:T)? CENTER(?: Y ATENCION CIUDADANA)?$/.test(area);
}

function normalizeLocationName(name) {
  return String(name || '').trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
}

const areasAutorizadasAsignacionMultiple = new Set([
  'DIRECCION GENERAL',
  'DIRECCION DE CONSTRUCCION Y OPERACION HIDRAULICA',
]);

async function jefePuedeAsignarAreas(req) {
  if (req.user?.rol !== 'jefe_area' || !req.user.area_id) return false;
  const [rows] = await db.execute(
    `SELECT a.nombre
     FROM usuarios u
     JOIN areas a ON a.id = u.area_id
     WHERE u.id = ? AND u.area_id = ? AND u.rol = 'jefe_area'
       AND u.activo = 1 AND a.activa = 1`,
    [req.user.id, req.user.area_id]
  );
  return areasAutorizadasAsignacionMultiple.has(normalizeLocationName(rows[0]?.nombre));
}

async function demandaDisponibleEnArea(demandaId, areaId) {
  const [rows] = await db.execute(
    `SELECT 1
     FROM demandas d
     WHERE d.id = ?
       AND (
         d.area_id = ?
         OR EXISTS (
           SELECT 1 FROM demanda_areas da
           WHERE BINARY da.demanda_id = BINARY d.id AND da.area_id = ?
         )
       )
     LIMIT 1`,
    [demandaId, areaId, areaId]
  );
  return rows.length > 0;
}

const destinosCoordinacionOperativa = [
  'SECTOR 1', 'SECTOR 2', 'SECTOR 3', 'SECTOR 4', 'SECTOR 5',
  'COORDINACION DE MAQUINARIA', 'COORDINACIÓN DE MAQUINARIA',
];
const destinosCoordinacionConstruccion = [
  'DEPARTAMENTO DE ESTUDIOS Y PROYECTOS',
  'DEPARTAMENTO DE OBRAS',
  'DEPARTAMENTO DE PLANTAS POTABILIZADORAS',
  'DEPARTAMENTO DE ELECTROMECANICO',
  'DEPARTAMENTO DE ELECTROMECÁNICO',
];

async function getPerfilEnvioSubarea(req) {
  if (req.user?.rol !== 'subarea_usuario') return null;
  const [rows] = await db.execute(
    `SELECT sa.id AS subarea_id, sa.area_id, sa.nombre AS subarea_nombre,
            a.nombre AS area_nombre
     FROM usuarios u
     JOIN subareas sa ON sa.id = u.subarea_id
     JOIN areas a ON a.id = sa.area_id
     WHERE u.id = ? AND u.activo = 1 AND u.rol = 'subarea_usuario'`,
    [req.user.id]
  );
  const userSubarea = rows[0];
  if (!userSubarea) return null;

  const subarea = normalizeLocationName(userSubarea.subarea_nombre);
  const area = normalizeLocationName(userSubarea.area_nombre);
  let destinosPermitidos;
  if (subarea === 'COORDINACION OPERATIVA') {
    destinosPermitidos = destinosCoordinacionOperativa;
  } else if (subarea === 'COORDINACION DE CONSTRUCCION'
      && area === 'DIRECCION DE CONSTRUCCION Y OPERACION HIDRAULICA') {
    destinosPermitidos = destinosCoordinacionConstruccion;
  } else {
    return null;
  }

  return {
    ...userSubarea,
    destinosSQL: destinosPermitidos,
    destinosNormalizados: new Set(destinosPermitidos.map(normalizeLocationName)),
  };
}

function condicionDestinoPermitido(alias, perfil) {
  return `UPPER(TRIM(${alias}.nombre)) IN (${perfil.destinosSQL.map(() => '?').join(', ')})`;
}

async function demandaEnviadaPorSubarea(demanda, perfil) {
  if (!perfil
      || Number(demanda.area_id) !== Number(perfil.area_id)
      || !demanda.subarea_id) {
    return false;
  }

  const [rows] = await db.execute(
    `SELECT 1
     FROM subareas destino
     WHERE destino.id = ?
       AND destino.area_id = ?
       AND ${condicionDestinoPermitido('destino', perfil)}
       AND EXISTS (
         SELECT 1
         FROM historial_ediciones he
         JOIN usuarios emisor ON emisor.id = he.editado_por
         WHERE he.demanda_id = ?
           AND emisor.subarea_id = ?
           AND emisor.rol = 'subarea_usuario'
           AND he.campos_editados LIKE ?
       )
     LIMIT 1`,
    [
      demanda.subarea_id, perfil.area_id, ...perfil.destinosSQL,
      demanda.id, perfil.subarea_id, '%"Subarea":%',
    ]
  );
  return rows.length > 0;
}

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
function log(level, msg) {
  const ts   = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${level}] ${msg}\n`;
  (level === 'ERROR' ? process.stderr : process.stdout).write(line);
  try { fs.appendFileSync(path.join(logsDir, level === 'ERROR' ? 'error.log' : 'combined.log'), line); } catch (_) {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpg|jpeg|png|gif|webp|tif|tiff|pdf|doc|docx|xls|xlsx)$/i.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  },
});

router.use(authMiddleware);
router.use(areaUsuarioGuard);
router.use(subareaUsuarioGuard);

async function jefeConsultaGlobalGuard(req, res, next) {
  if (req.user?.rol !== 'jefe_area' || !req.user.area_id) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para consultar todas las áreas' });
  }
  try {
    const [areas] = await db.execute('SELECT nombre FROM areas WHERE id = ?', [req.user.area_id]);
    const area = String(areas[0]?.nombre || '').trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    if (area !== 'DIRECCION GENERAL' && !isContactCenterAreaName(area)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para consultar todas las áreas' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

async function jefeContactCenterAdjuntosGuard(req, res, next) {
  if (req.user?.rol !== 'jefe_area' || !req.user.area_id) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para agregar documentos a una petición existente' });
  }
  try {
    const [areas] = await db.execute('SELECT nombre FROM areas WHERE id = ?', [req.user.area_id]);
    if (!isContactCenterAreaName(areas[0]?.nombre)) {
      return res.status(403).json({ ok: false, error: 'Solo la jefa de área de Contact Center puede agregar documentos a una petición existente' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

async function jefeContactCenterConsultaEditGuard(req, res, next) {
  if (req.user?.rol !== 'jefe_area' || !req.user.area_id) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para editar peticiones desde Consulta' });
  }
  try {
    const [areas] = await db.execute('SELECT nombre FROM areas WHERE id = ?', [req.user.area_id]);
    const area = normalizeLocationName(areas[0]?.nombre);
    if (area !== 'DIRECCION GENERAL' && !isContactCenterAreaName(area)) {
      return res.status(403).json({ ok: false, error: 'Solo la jefa de Dirección General o de Contact Center puede editar peticiones desde Consulta' });
    }
    next();
  } catch (err) {
    next(err);
  }
}


const s = v => (v === undefined || v === '') ? null : v;
const tiposPeticion = new Set([
  'Cambio de poliducto',
  'Malacateo',
  'Desazolve o vactor',
  'Socavón o hundimiento',
  'Reparación de la red de agua o drenaje',
  'Pipa para escuelas o usuarios',
  'Inspección para conexión de red de agua y drenaje',
  'Baja ISSEMYM por defunción o por renuncia del trabajador',
  'Factibilidad doméstica o comercial',
  'Constancia de no servicio',
]);

// Acepta dd/mm/yyyy y yyyy-mm-dd
function parseFecha(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

async function siguienteFolio() {
  const [rows] = await db.execute(
    "SELECT MAX(CAST(SUBSTRING(folio, 3) AS UNSIGNED)) AS maxNum FROM demandas WHERE folio LIKE 'F-%'"
  );
  const num = String((rows[0].maxNum || 0) + 1).padStart(5, '0');
  return `F-${num}`;
}

// Helper: renombra un archivo subido para incluir el folio de la peticion.
// Ej: 1759876543-abc.pdf  ->  F-00042-1759876543.pdf
function renombrarConFolio(filename, folio) {
  if (!filename || !folio) return filename;
  if (filename.startsWith(folio + '-')) return filename; // ya tiene folio, no tocar

  const ext        = path.extname(filename);
  const viejoPath  = path.join(uploadsDir, filename);
  const nuevoNom   = `${folio}-${Date.now()}${ext}`;
  const nuevoPath  = path.join(uploadsDir, nuevoNom);

  try {
    if (fs.existsSync(viejoPath)) {
      fs.renameSync(viejoPath, nuevoPath);
      return nuevoNom;
    }
    log('ERROR', `[renombrarConFolio] No existe el archivo origen: ${viejoPath}`);
  } catch (err) {
    log('ERROR', `[renombrarConFolio] No se pudo renombrar ${filename} -> ${nuevoNom}: ${err.message}`);
  }
  return filename;
}

function autorizarAdjuntos(req, res, next) {
  if (req.get('X-Adjunto-Existente') === 'true') {
    return jefeContactCenterAdjuntosGuard(req, res, next);
  }
  noConsulta(req, res, next);
}

function uploadAdjuntos(req, res, next) {
  upload.array('archivo', 50)(req, res, (err) => {
    if (err) {
      console.error('[adjuntos] Error de multer al subir archivo(s):', err.message);
      return res.status(400).json({ ok: false, error: err.message || 'No se pudo subir el archivo' });
    }
    next();
  });
}

function limpiarArchivosSubidos(files, rutasExtra = []) {
  const rutas = new Set([
    ...(files || []).map(file => file.filename),
    ...rutasExtra,
  ]);
  for (const ruta of rutas) {
    const filePath = path.join(uploadsDir, path.basename(ruta));
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log('ERROR', `[crear] No se pudo eliminar el archivo temporal ${filePath}: ${err.message}`);
      }
    }
  }
}

async function loadDemandaDetails(id) {
  const [hist] = await db.execute(
    `SELECT t.transferido_en, ao.nombre AS area_origen, ad.nombre AS area_destino,
            t.comentario, u.nombre AS transferido_por
     FROM transferencias t
     LEFT JOIN areas ao   ON t.area_origen_id  = ao.id
     LEFT JOIN areas ad   ON t.area_destino_id = ad.id
     LEFT JOIN usuarios u ON t.transferido_por = u.id
     WHERE t.demanda_id = ?
     ORDER BY t.transferido_en ASC`,
    [id]
  );

  const [histEst] = await db.execute(
    `SELECT he.creado_en, he.estado_anterior, he.estado_nuevo,
            he.archivo_nombre, he.archivo_ruta, he.comentario, u.nombre AS cambiado_por
     FROM historial_estados he
     LEFT JOIN usuarios u ON he.cambiado_por = u.id
     WHERE he.demanda_id = ?
     ORDER BY he.creado_en ASC`,
    [id]
  );

  const [reportes] = await db.execute(
    `SELECT r.creado_en, r.nota, u.nombre AS reportado_por,
            r.resuelto, r.nota_resolucion, r.resuelto_en, ru.nombre AS resuelto_por
     FROM reportes_problema r
     LEFT JOIN usuarios u  ON r.usuario_id  = u.id
     LEFT JOIN usuarios ru ON r.resuelto_por = ru.id
     WHERE r.demanda_id = ?
     ORDER BY r.creado_en ASC`,
    [id]
  );

  const [histEdit] = await db.execute(
    `SELECT he.editado_en, u.nombre AS editado_por, he.campos_editados
     FROM historial_ediciones he
     LEFT JOIN usuarios u ON he.editado_por = u.id
     WHERE he.demanda_id = ?
     ORDER BY he.editado_en ASC`,
    [id]
  );

  const [adjuntos] = await db.execute(
    `SELECT id, nombre, ruta, tipo, creado_en
     FROM demanda_archivos
     WHERE demanda_id = ?
     ORDER BY creado_en ASC`,
    [id]
  );

  const [areasAsignadas] = await db.execute(
    `SELECT a.id, a.nombre
     FROM demandas d
     JOIN areas a ON a.id = d.area_id
     WHERE d.id = ?
     UNION
     SELECT a.id, a.nombre
     FROM demanda_areas da
     JOIN areas a ON a.id = da.area_id
     WHERE da.demanda_id = ?
     ORDER BY nombre ASC`,
    [id, id]
  );

  return {
    historial: hist,
    historial_estados: histEst,
    historial_ediciones: histEdit,
    reportes,
    adjuntos,
    areas_asignadas: areasAsignadas,
  };
}

// Listar
async function listarDemandas(req, res, consultaGlobal = false) {
  try {
    const { area, estado, prioridad, q } = req.query;
    let sql    = `SELECT v.*, d.folio_ref2 AS folio_ref2_actual,
                         d.tipo_peticion AS tipo_peticion_actual
                  FROM v_demandas v
                  LEFT JOIN demandas d ON d.id = v.id
                  WHERE 1=1`;
    const params = [];

    const scope    = consultaGlobal ? null : scopeArea(req);
    const subScope = consultaGlobal ? null : scopeSubarea(req);
    const perfilEnvio = subScope ? await getPerfilEnvioSubarea(req) : null;
    if (scope) {
      sql += ` AND (
        v.area_id = ?
        OR EXISTS (
          SELECT 1 FROM demanda_areas da
          WHERE BINARY da.demanda_id = BINARY v.id AND da.area_id = ?
        )
      )`;
      params.push(scope, scope);
    }
    if (subScope && perfilEnvio) {
      sql += ` AND (
        v.subarea_id = ?
        OR (
          v.area_id = ?
          AND EXISTS (
            SELECT 1
            FROM subareas destino
            WHERE destino.id = v.subarea_id
              AND destino.area_id = ?
              AND ${condicionDestinoPermitido('destino', perfilEnvio)}
          )
          AND EXISTS (
            SELECT 1
            FROM historial_ediciones he
            JOIN usuarios emisor ON emisor.id = he.editado_por
            WHERE he.demanda_id = v.id
              AND emisor.subarea_id = ?
              AND emisor.rol = 'subarea_usuario'
              AND he.campos_editados LIKE ?
          )
        )
      )`;
      params.push(
        subScope, perfilEnvio.area_id, perfilEnvio.area_id, ...perfilEnvio.destinosSQL,
        perfilEnvio.subarea_id, '%"Subarea":%',
      );
    } else if (subScope) {
      sql += ' AND v.subarea_id = ?';
      params.push(subScope);
    }
    if (area)      { sql += ' AND v.area = ?';       params.push(area); }
    if (estado)    { sql += ' AND v.estado = ?';     params.push(estado); }
    if (prioridad) { sql += ' AND v.prioridad = ?';  params.push(prioridad); }
    if (q) {
      sql += ' AND (v.folio LIKE ? OR v.remitente LIKE ? OR v.asunto LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY v.creado_en DESC';

    const [rows] = await db.execute(sql, params);
    const data = await Promise.all(rows.map(async row => ({
      ...row,
      ref2: row.folio_ref2_actual || row.ref2 || '',
      tipo_peticion: row.tipo_peticion_actual || row.tipo_peticion || '',
      ...(await loadDemandaDetails(row.id)),
    })));
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

router.get('/consulta/global', jefeConsultaGlobalGuard, (req, res) => listarDemandas(req, res, true));
router.get('/', (req, res) => listarDemandas(req, res));

router.get('/areas-asignables', async (req, res) => {
  try {
    if (!await jefePuedeAsignarAreas(req)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para consultar áreas asignables' });
    }
    const [rows] = await db.execute('SELECT id, nombre, activa FROM areas WHERE activa = 1 ORDER BY nombre ASC');
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function obtenerDemanda(req, res, consultaGlobal = false) {
  try {
    const [rows] = await db.execute(
      `SELECT v.*, d.folio_ref2 AS folio_ref2_actual,
              d.tipo_peticion AS tipo_peticion_actual
       FROM v_demandas v
       LEFT JOIN demandas d ON d.id = v.id
       WHERE v.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    if (!consultaGlobal) {
      const scope    = scopeArea(req);
      const subScope = scopeSubarea(req);
      if (scope && !await demandaDisponibleEnArea(req.params.id, scope)) {
        return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
      }
      if (subScope && Number(rows[0].subarea_id) !== Number(subScope)) {
        const perfilEnvio = await getPerfilEnvioSubarea(req);
        if (!await demandaEnviadaPorSubarea(rows[0], perfilEnvio)) {
          return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
        }
      }
    }

    const details = await loadDemandaDetails(req.params.id);
    res.json({
      ok: true,
      data: {
        ...rows[0],
        ref2: rows[0].folio_ref2_actual || rows[0].ref2 || '',
        tipo_peticion: rows[0].tipo_peticion_actual || rows[0].tipo_peticion || '',
        ...details,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

router.get('/consulta/global/:id', jefeConsultaGlobalGuard, (req, res) => obtenerDemanda(req, res, true));
router.get('/:id', (req, res) => obtenerDemanda(req, res));

// Peticiones con observaciones 
router.get('/reportes/lista', async (req, res) => {
  try {
    if (!['Administrador', 'Subadmin', 'jefe_area'].includes(req.user.rol)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para ver las observaciones' });
    }

    let sql = `
      SELECT r.id, r.demanda_id, r.nota, r.creado_en,
             d.folio, d.remitente, d.asunto, d.estado, d.area_id,
             a.nombre AS area, u.nombre AS reportado_por
      FROM reportes_problema r
      JOIN demandas d      ON BINARY r.demanda_id = BINARY d.id
      LEFT JOIN areas    a ON d.area_id    = a.id
      LEFT JOIN usuarios u ON r.usuario_id = u.id
      WHERE r.resuelto = 0`;
    const params = [];

    const scope = scopeArea(req);
    if (scope) {
      sql += ` AND (
        d.area_id = ?
        OR EXISTS (
          SELECT 1 FROM demanda_areas da
          WHERE BINARY da.demanda_id = BINARY d.id AND da.area_id = ?
        )
      )`;
      params.push(scope, scope);
    }

    sql += ' ORDER BY r.creado_en DESC';

    const [rows] = await db.execute(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Marcar una observacion como corregida
router.put('/reportes/:reporteId/resolver', noConsulta, async (req, res) => {
  try {
    if (!['Administrador', 'Subadmin', 'jefe_area'].includes(req.user.rol)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para esta accion' });
    }

    const nota = s(req.body.nota);

    const [rep] = await db.execute(
      `SELECT r.id, r.demanda_id, d.area_id
       FROM reportes_problema r
       JOIN demandas d ON BINARY r.demanda_id = BINARY d.id
       WHERE r.id = ?`,
      [req.params.reporteId]
    );
    if (!rep.length) return res.status(404).json({ ok: false, error: 'Observacion no encontrada' });

    const scope = scopeArea(req);
    if (scope && !await demandaDisponibleEnArea(rep[0].demanda_id, scope)) {
      return res.status(404).json({ ok: false, error: 'Observacion no encontrada' });
    }

    await db.execute(
      `UPDATE reportes_problema
       SET resuelto = 1, nota_resolucion = ?, resuelto_por = ?, resuelto_en = NOW()
       WHERE id = ?`,
      [nota, req.user.id, req.params.reporteId]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Adjuntar documentos a una petición
async function guardarAdjuntos(req, res, consultaGlobal = false) {
  let connection;
  const archivosEnDisco = new Set();
  try {
    const demandaId = req.params.id;
    const [dem] = await db.execute('SELECT id, area_id, folio FROM demandas WHERE id = ?', [demandaId]);
    if (!dem.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    const scope = consultaGlobal ? null : scopeArea(req);
    if (scope && !await demandaDisponibleEnArea(demandaId, scope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    // Folio de la peticion (para nombrar los archivos en disco)
    const folio = dem[0].folio || null;

    const payloadItems = [];
    if (typeof req.body.archivos === 'string') {
      try { payloadItems.push(...JSON.parse(req.body.archivos)); } catch (_) {}
    } else if (Array.isArray(req.body.archivos)) {
      payloadItems.push(...req.body.archivos);
    }

    const fileItems = (req.files || []).map(file => ({
      name: file.originalname,
      path: file.filename,
    }));

    const items = [...payloadItems, ...fileItems].filter(item => item && (item.name || item.path));
    if (!items.length) {
      return res.status(400).json({ ok: false, error: 'No hay documentos para adjuntar' });
    }

    const inserted = [];
    const fallidos = [];
    connection = await db.getConnection();
    await connection.beginTransaction();
    for (const item of items) {
      const nombre = String(item.name || item.nombre || path.basename(item.path || '')).trim();
      let ruta     = String(item.path || item.ruta || '').trim();
      if (!nombre || !ruta) continue;

      const esArchivoSubido = (req.files || []).some(f => f.filename === ruta);
      if (esArchivoSubido) {
        const rutaCompleta = path.join(uploadsDir, ruta);
        if (!fs.existsSync(rutaCompleta)) {
          log('ERROR', `[adjuntos] El archivo "${nombre}" (${ruta}) no quedo guardado en disco en ${rutaCompleta}. Puede que un antivirus lo haya movido o que falten permisos de escritura en la carpeta uploads.`);
          fallidos.push(nombre);
          continue;
        }
        
        ruta = renombrarConFolio(ruta, folio);
        archivosEnDisco.add(ruta);
      }

      await connection.execute(
        'INSERT INTO demanda_archivos (demanda_id, nombre, ruta, tipo) VALUES (?, ?, ?, ?)',
        [demandaId, nombre, ruta, 'documento']
      );
      inserted.push({ nombre, ruta });
    }

    if (inserted.length) {
      await connection.execute(
        'INSERT INTO historial_ediciones (demanda_id, editado_por, campos_editados) VALUES (?, ?, ?)',
        [
          demandaId,
          req.user.id,
          JSON.stringify({
            'Documentos agregados': { antes: '—', despues: inserted.map(item => item.nombre).join(', ') },
          }),
        ]
      );
    }

    await connection.commit();
    if (fallidos.length) {
      return res.status(207).json({
        ok: true,
        data: inserted,
        error: `No se pudieron guardar en el servidor estos documentos: ${fallidos.join(', ')}. Revisa el antivirus o los permisos de la carpeta "uploads" e intenta de nuevo.`,
      });
    }

    res.json({ ok: true, data: inserted });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        log('ERROR', `[adjuntos] No se pudo revertir la transacción: ${rollbackErr.message}`);
      }
    }
    limpiarArchivosSubidos(req.files, [...archivosEnDisco]);
    res.status(500).json({ ok: false, error: err.message || 'Error al adjuntar documentos' });
  } finally {
    if (connection) connection.release();
  }
}

router.post('/:id/adjuntos', autorizarAdjuntos, uploadAdjuntos, guardarAdjuntos);
router.post(
  '/consulta/global/:id/adjuntos',
  jefeContactCenterAdjuntosGuard,
  uploadAdjuntos,
  (req, res) => guardarAdjuntos(req, res, true)
);

router.get('/:id/adjuntos', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT id, nombre, ruta, tipo, creado_en FROM demanda_archivos WHERE demanda_id = ? ORDER BY creado_en ASC', [req.params.id]);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/:id/adjuntos/:adjuntoId', soloAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, ruta FROM demanda_archivos WHERE id = ? AND demanda_id = ?',
      [req.params.adjuntoId, req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado en esta petición' });
    }

    const [result] = await db.execute(
      'DELETE FROM demanda_archivos WHERE id = ? AND demanda_id = ?',
      [req.params.adjuntoId, req.params.id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado en esta petición' });
    }

    const fileName = path.basename(String(rows[0].ruta || ''));
    if (fileName && fileName !== '.' && fileName !== '..') {
      try {
        fs.unlinkSync(path.join(uploadsDir, fileName));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          log('ERROR', `[adjuntos] No se pudo eliminar ${fileName}: ${err.message}`);
          return res.status(500).json({
            ok: false,
            error: 'El documento se quitó de la petición, pero no se pudo borrar el archivo del servidor',
          });
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Error al eliminar el documento' });
  }
});

// Crear
router.post('/', noConsulta, uploadAdjuntos, async (req, res) => {
  const files = req.files || [];
  const archivosEnDisco = new Set();
  let connection;
  try {
    if (req.user.rol === 'subarea_usuario') {
      limpiarArchivosSubidos(files);
      return res.status(403).json({ ok: false, error: 'Los usuarios de subarea no pueden crear peticiones' });
    }

    const {
      ref, ref2, area_id, tipo_peticion, remitente, asunto,
      domicilio, colonia, tel1, tel2,
      demanda, observaciones, concepto, fecha_demanda
    } = req.body;

    const scope     = scopeArea(req);
    const areaIdVal = scope || (area_id != null && area_id !== '' ? Number(area_id) : null);
    const tipoPeticion = tipo_peticion == null ? '' : String(tipo_peticion).trim();
    const telPrincipal = String(tel1 || '').replace(/\D/g, '');

    if (!Number.isInteger(Number(areaIdVal)) || Number(areaIdVal) < 1 ||
        !String(remitente || '').trim() || !String(asunto || '').trim() ||
        !String(domicilio || '').trim() || !String(colonia || '').trim() ||
        telPrincipal.length !== 10 ||
        (tipoPeticion && !tiposPeticion.has(tipoPeticion))) {
      limpiarArchivosSubidos(files);
      return res.status(400).json({
        ok: false,
        error: 'Área, remitente, asunto, domicilio, colonia y teléfono principal de 10 dígitos son requeridos; el tipo de petición es opcional',
      });
    }

    const id    = 'D-' + Date.now();
    const folio = await siguienteFolio();

    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO demandas
        (id, folio, fecha_captura, fecha_demanda, folio_ref, folio_ref2, area_id, tipo_peticion,
         remitente, asunto, domicilio, colonia, tel_principal, tel_secundario,
         descripcion, observaciones, concepto, estado, creado_por)
       VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)`,
      [
        id,
        folio,
        parseFecha(s(fecha_demanda)),
        s(ref),
        s(ref2),
        areaIdVal,
        tipoPeticion || null,
        String(remitente).trim(),
        String(asunto).trim(),
        s(domicilio),
        s(colonia),
        s(tel1),
        s(tel2),
        s(demanda),
        s(observaciones),
        s(concepto),
        req.user.id,
      ]
    );

    const adjuntos = [];
    for (const file of files) {
      let ruta = renombrarConFolio(file.filename, folio);
      archivosEnDisco.add(ruta);
      const rutaCompleta = path.join(uploadsDir, ruta);
      if (!fs.existsSync(rutaCompleta)) {
        throw new Error(`El archivo "${file.originalname}" no quedó guardado en el servidor`);
      }
      await connection.execute(
        'INSERT INTO demanda_archivos (demanda_id, nombre, ruta, tipo) VALUES (?, ?, ?, ?)',
        [id, file.originalname, ruta, 'documento']
      );
      adjuntos.push({ nombre: file.originalname, ruta });
    }

    const [rows] = await connection.execute(
      `SELECT v.*, d.tipo_peticion AS tipo_peticion_actual
       FROM v_demandas v
       JOIN demandas d ON d.id = v.id
       WHERE v.id = ?`,
      [id]
    );
    if (rows[0]) rows[0].tipo_peticion = rows[0].tipo_peticion_actual || rows[0].tipo_peticion || '';
    await connection.commit();
    res.status(201).json({ ok: true, data: { ...rows[0], adjuntos } });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        log('ERROR', `[crear] No se pudo revertir la transacción: ${rollbackErr.message}`);
      }
    }
    limpiarArchivosSubidos(files, [...archivosEnDisco]);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Editar
async function editarDemanda(req, res, consultaGlobal = false) {
  try {
    const body = req.body;

    if (req.user.rol === 'subarea_usuario') {
      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== 'estado') {
        return res.status(403).json({ ok: false, error: 'Los usuarios de subarea solo pueden cambiar el estado' });
      }
    }

    if ('estado' in body && !['Administrador', 'Subadmin', 'subarea_usuario', 'jefe_area'].includes(req.user.rol)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para modificar el estado' });
    }
    if ('prioridad' in body && !['Administrador', 'Subadmin', 'area_usuario', 'jefe_area'].includes(req.user.rol)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para modificar la prioridad' });
    }
    if ('tipo_peticion' in body && body.tipo_peticion && !tiposPeticion.has(body.tipo_peticion)) {
      return res.status(400).json({ ok: false, error: 'Tipo de petición no válido' });
    }

    const [current] = await db.execute('SELECT * FROM demandas WHERE id = ?', [req.params.id]);
    if (!current.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    const before = current[0];

    const scope    = consultaGlobal ? null : scopeArea(req);
    const subScope = scopeSubarea(req);
    if (scope && !await demandaDisponibleEnArea(req.params.id, scope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }
    if (subScope && Number(before.subarea_id) !== Number(subScope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }
    if ('estado' in body && body.estado !== before.estado) {
      return res.status(400).json({ ok: false, error: 'Para cambiar el estado debes adjuntar un documento usando el flujo de cambio de estado' });
    }

    const fields = [];
    const vals   = [];

    const mapping = {
      ref:           'folio_ref',
      remitente:     'remitente',
      asunto:        'asunto',
      domicilio:     'domicilio',
      colonia:       'colonia',
      tel1:          'tel_principal',
      tel2:          'tel_secundario',
      demanda:       'descripcion',
      observaciones: 'observaciones',
      concepto:      'concepto',
      tipo_peticion: 'tipo_peticion',
      estado:        'estado',
      prioridad:     'prioridad',
    };

    for (const [key, col] of Object.entries(mapping)) {
      if (key in body) {
        fields.push(`${col} = ?`);
        vals.push(s(body[key]));
      }
    }

    if ('area_id' in body && !scope) {
      fields.push('area_id = ?');
      vals.push(body.area_id != null && body.area_id !== '' ? Number(body.area_id) : null);
    }

    if ('fecha_demanda' in body) {
      fields.push('fecha_demanda = ?');
      vals.push(parseFecha(s(body.fecha_demanda)));
    }

    if (!fields.length) {
      return res.status(400).json({ ok: false, error: 'Sin campos para actualizar' });
    }

    vals.push(req.params.id);
    await db.execute(`UPDATE demandas SET ${fields.join(', ')} WHERE id = ?`, vals);

    const [rows] = await db.execute(
      `SELECT v.*, d.tipo_peticion AS tipo_peticion_actual
       FROM v_demandas v
       JOIN demandas d ON d.id = v.id
       WHERE v.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    rows[0].tipo_peticion = rows[0].tipo_peticion_actual || rows[0].tipo_peticion || '';

    const labelMap = {
      folio_ref:      'Folio Referencia',
      remitente:      'Remitente',
      asunto:         'Asunto',
      domicilio:      'Domicilio',
      colonia:        'Colonia',
      tel_principal:  'Tel. Principal',
      tel_secundario: 'Tel. Secundario',
      descripcion:    'Demanda',
      observaciones:  'Observaciones',
      concepto:       'Concepto',
      tipo_peticion:  'Tipo de petición',
      estado:         'Estado',
      prioridad:      'Prioridad',
      area_id:        'Area',
    };
    const bodyToCol = {
      ref: 'folio_ref', remitente: 'remitente', asunto: 'asunto',
      domicilio: 'domicilio', colonia: 'colonia', tel1: 'tel_principal',
      tel2: 'tel_secundario', demanda: 'descripcion', observaciones: 'observaciones',
      concepto: 'concepto', tipo_peticion: 'tipo_peticion',
      estado: 'estado', prioridad: 'prioridad', area_id: 'area_id',
    };

    const changes = {};
    for (const [bodyKey, col] of Object.entries(bodyToCol)) {
      if (!(bodyKey in body)) continue;
      if (bodyKey === 'area_id' && scope) continue;
      let newVal;
      if (bodyKey === 'area_id') {
        newVal = body[bodyKey] != null && body[bodyKey] !== '' ? Number(body[bodyKey]) : null;
      } else if (bodyKey === 'fecha_demanda') {
        newVal = parseFecha(s(body[bodyKey]));
      } else {
        newVal = s(body[bodyKey]);
      }
      const oldVal = before[col] ?? null;
      if (String(oldVal ?? '') !== String(newVal ?? '')) {
        changes[labelMap[col] || col] = { antes: oldVal ?? '', despues: newVal ?? '' };
      }
    }

    if (Object.keys(changes).length > 0) {
      await db.execute(
        `INSERT INTO historial_ediciones (demanda_id, editado_por, campos_editados) VALUES (?, ?, ?)`,
        [req.params.id, req.user.id, JSON.stringify(changes)]
      );
    }

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

router.put('/:id', (req, res, next) => {
  if (req.get('X-Consulta-Global') === 'true') {
    return jefeContactCenterConsultaEditGuard(req, res, () => editarDemanda(req, res, true));
  }
  return noConsulta(req, res, () => editarDemanda(req, res));
});

// Eliminar
router.delete('/:id', adminOSubadmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM demandas WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Cambiar estado con archivo obligatorio
router.post('/:id/cambiar-estado', noConsulta, (req, res, next) => {
  upload.single('archivo')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (req.user.rol === 'area_usuario') {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ ok: false, error: 'Los usuarios de area no pueden cambiar el estado, solo la prioridad' });
    }

    const { estado } = req.body;
    const comentario = s(req.body.comentario);

    if (!['Pendiente', 'En proceso', 'Atendida'].includes(estado)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'Estado no válido para este endpoint' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Se requiere un archivo adjunto' });
    }

    const [dem] = await db.execute('SELECT estado, area_id, subarea_id, folio FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }
    if (dem[0].estado === estado) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'La petición ya tiene ese estado' });
    }

    const scope    = scopeArea(req);
    const subScope = scopeSubarea(req);
    if (scope && !await demandaDisponibleEnArea(req.params.id, scope)) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }
    if (subScope && Number(dem[0].subarea_id) !== Number(subScope)) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    // ⬇️ Renombramos el archivo de evidencia con el folio de la peticion
    const archivoRuta = renombrarConFolio(req.file.filename, dem[0].folio);

    await db.execute('UPDATE demandas SET estado = ? WHERE id = ?', [estado, req.params.id]);

    await db.execute(
      `INSERT INTO historial_estados
         (demanda_id, estado_anterior, estado_nuevo, archivo_nombre, archivo_ruta, comentario, cambiado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, dem[0].estado, estado, req.file.originalname, archivoRuta, comentario, req.user.id]
    );

    const [rows] = await db.execute(
      `SELECT v.*, d.tipo_peticion AS tipo_peticion_actual
       FROM v_demandas v
       JOIN demandas d ON d.id = v.id
       WHERE v.id = ?`,
      [req.params.id]
    );
    if (rows[0]) rows[0].tipo_peticion = rows[0].tipo_peticion_actual || rows[0].tipo_peticion || '';
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {
        try { fs.unlinkSync(path.join(uploadsDir, path.basename(req.file.filename))); } catch (_) {}
      }
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reportar un problema / observacion sobre una peticion (usuario de area).
router.post('/:id/reportar', noConsulta, async (req, res) => {
  try {
    if (req.user.rol !== 'area_usuario') {
      return res.status(403).json({ ok: false, error: 'Solo el usuario de area puede reportar una observacion' });
    }

    const nota = s(req.body.nota);
    if (!nota) {
      return res.status(400).json({ ok: false, error: 'Escribe una nota describiendo el problema' });
    }

    const [dem] = await db.execute('SELECT area_id FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    const scope = scopeArea(req);
    if (scope && !await demandaDisponibleEnArea(req.params.id, scope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    await db.execute(
      `INSERT INTO reportes_problema (demanda_id, area_id, usuario_id, nota) VALUES (?, ?, ?, ?)`,
      [req.params.id, scope || dem[0].area_id, req.user.id, nota]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const direccionGeneralMatcher = /DIRECCI[OÓ]N GENERAL/i;

function isDireccionGeneralAreaName(name) {
  if (!name) return false;
  return direccionGeneralMatcher.test(name.toString().trim());
}

// Transferir
router.post('/:id/asignar-areas', noConsulta, async (req, res) => {
  let connection;
  try {
    if (!await jefePuedeAsignarAreas(req)) {
      return res.status(403).json({
        ok: false,
        error: 'Solo las jefaturas de Dirección General y de Dirección de Construcción y Operación Hidráulica pueden asignar a varias áreas',
      });
    }

    if (!Array.isArray(req.body.area_ids) || req.body.area_ids.length === 0) {
      return res.status(400).json({ ok: false, error: 'Selecciona al menos un área destino' });
    }

    const areaIds = [...new Set(req.body.area_ids.map(Number))];
    if (areaIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      return res.status(400).json({ ok: false, error: 'La lista de áreas destino no es válida' });
    }

    const [dem] = await db.execute('SELECT id, area_id FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    const [destinos] = await db.execute(
      `SELECT id, nombre FROM areas
       WHERE activa = 1 AND id IN (${areaIds.map(() => '?').join(', ')})`,
      areaIds
    );
    if (destinos.length !== areaIds.length) {
      return res.status(400).json({ ok: false, error: 'Una o más áreas destino no existen o están inactivas' });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [lockedDemand] = await connection.execute(
      'SELECT area_id FROM demandas WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!lockedDemand.length) {
      await connection.rollback();
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    let demandaEnAreaDelUsuario = Number(lockedDemand[0].area_id) === Number(req.user.area_id);
    if (!demandaEnAreaDelUsuario) {
      const [asignacionUsuario] = await connection.execute(
        `SELECT 1 FROM demanda_areas
         WHERE BINARY demanda_id = BINARY ? AND area_id = ?
         LIMIT 1`,
        [req.params.id, req.user.area_id]
      );
      demandaEnAreaDelUsuario = asignacionUsuario.length > 0;
    }
    if (!demandaEnAreaDelUsuario) {
      await connection.rollback();
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }
    if (areaIds.includes(Number(req.user.area_id)) || areaIds.includes(Number(lockedDemand[0].area_id))) {
      await connection.rollback();
      return res.status(400).json({ ok: false, error: 'No selecciones tu propia área ni el área responsable como destino' });
    }

    const [existing] = await connection.execute(
      `SELECT area_id FROM demanda_areas
       WHERE demanda_id = ? AND area_id IN (${areaIds.map(() => '?').join(', ')})
       FOR UPDATE`,
      [req.params.id, ...areaIds]
    );
    const existingIds = new Set(existing.map(row => Number(row.area_id)));
    const nuevasAreas = destinos.filter(area => !existingIds.has(Number(area.id)));

    for (const area of nuevasAreas) {
      await connection.execute(
        'INSERT INTO demanda_areas (demanda_id, area_id, asignado_por) VALUES (?, ?, ?)',
        [req.params.id, area.id, req.user.id]
      );
    }

    if (nuevasAreas.length) {
      await connection.execute(
        `INSERT INTO historial_ediciones (demanda_id, editado_por, campos_editados)
         VALUES (?, ?, ?)`,
        [
          req.params.id,
          req.user.id,
          JSON.stringify({
            'Áreas asignadas': {
              antes: '',
              despues: nuevasAreas.map(area => area.nombre).join(', '),
            },
          }),
        ]
      );
    }

    const [areasAsignadas] = await connection.execute(
      `SELECT a.id, a.nombre
       FROM demandas d
       JOIN areas a ON a.id = d.area_id
       WHERE d.id = ?
       UNION
       SELECT a.id, a.nombre
       FROM demanda_areas da
       JOIN areas a ON a.id = da.area_id
       WHERE da.demanda_id = ?
       ORDER BY nombre ASC`,
      [req.params.id, req.params.id]
    );
    await connection.commit();
    res.json({ ok: true, data: { areas_asignadas: areasAsignadas } });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        log('ERROR', `[asignar-areas] No se pudo revertir la transacción: ${rollbackErr.message}`);
      }
    }
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/transferir', noConsulta, async (req, res) => {
  try {
    if (req.user?.rol !== 'jefe_area' || !req.user?.area_id) {
      return res.status(403).json({ ok: false, error: 'Solo el jefe de área de Dirección General puede enviar peticiones a otras áreas' });
    }

    const [areasOrigen] = await db.execute(
      'SELECT nombre FROM areas WHERE id = ? LIMIT 1',
      [req.user.area_id]
    );
    if (!areasOrigen.length || !isDireccionGeneralAreaName(areasOrigen[0].nombre)) {
      return res.status(403).json({ ok: false, error: 'Solo el jefe de área de Dirección General puede enviar peticiones a otras áreas' });
    }

    const area_destino_id = req.body.area_destino_id;
    const comentario      = s(req.body.comentario);

    if (!area_destino_id) {
      return res.status(400).json({ ok: false, error: 'area_destino_id requerido' });
    }

    if (Number(area_destino_id) === Number(req.user.area_id)) {
      return res.status(400).json({ ok: false, error: 'Selecciona un área distinta a Dirección General' });
    }

    const [dem] = await db.execute('SELECT area_id, estado FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    if (Number(dem[0].area_id) !== Number(req.user.area_id)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    const [areasDestino] = await db.execute(
      'SELECT id FROM areas WHERE id = ? AND activa = 1 LIMIT 1',
      [Number(area_destino_id)]
    );
    if (!areasDestino.length) {
      return res.status(400).json({ ok: false, error: 'El área destino no existe o está inactiva' });
    }

    await db.execute(
      `INSERT INTO transferencias (demanda_id, area_origen_id, area_destino_id, comentario, transferido_por)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, dem[0].area_id, Number(area_destino_id), comentario, req.user.id]
    );

    await db.execute(
      "UPDATE demandas SET area_id = ?, subarea_id = NULL, estado = ? WHERE id = ?",
      [Number(area_destino_id), dem[0].estado, req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Enviar a una subarea de la propia area
router.post('/:id/enviar-subarea', async (req, res) => {
  try {
    const esUsuarioSubarea = req.user.rol === 'subarea_usuario';
    if (!['area_usuario', 'jefe_area', 'Administrador', 'Subadmin'].includes(req.user.rol)
        && !esUsuarioSubarea) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para esta accion' });
    }

    const perfilEnvio = esUsuarioSubarea ? await getPerfilEnvioSubarea(req) : null;
    if (esUsuarioSubarea && !perfilEnvio) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para enviar a estas subareas' });
    }

    const { subarea_id } = req.body;
    if (!subarea_id) {
      return res.status(400).json({ ok: false, error: 'subarea_id requerido' });
    }

    const [dem] = await db.execute('SELECT area_id, subarea_id FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    if (perfilEnvio) {
      if (Number(dem[0].area_id) !== Number(perfilEnvio.area_id)
          || Number(dem[0].subarea_id) !== Number(perfilEnvio.subarea_id)) {
        return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
      }
    } else {
      const scope = scopeArea(req);
      if (scope && Number(dem[0].area_id) !== Number(scope)) {
        return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
      }
    }

    const [sub] = await db.execute('SELECT id, area_id, nombre FROM subareas WHERE id = ?', [subarea_id]);
    if (!sub.length) return res.status(404).json({ ok: false, error: 'Subarea no encontrada' });
    if (Number(sub[0].area_id) !== Number(dem[0].area_id)) {
      return res.status(400).json({ ok: false, error: 'La subarea no pertenece a esta area' });
    }
    if (perfilEnvio && !perfilEnvio.destinosNormalizados.has(normalizeLocationName(sub[0].nombre))) {
      return res.status(403).json({
        ok: false,
        error: 'Tu subarea no tiene permiso para enviar a este destino',
      });
    }

    await db.execute('UPDATE demandas SET subarea_id = ? WHERE id = ?', [subarea_id, req.params.id]);

    await db.execute(
      `INSERT INTO historial_ediciones (demanda_id, editado_por, campos_editados) VALUES (?, ?, ?)`,
      [req.params.id, req.user.id, JSON.stringify({ Subarea: { antes: dem[0].subarea_id || '', despues: sub[0].nombre } })]
    );

    const [rows] = await db.execute(
      `SELECT v.*, d.tipo_peticion AS tipo_peticion_actual
       FROM v_demandas v
       JOIN demandas d ON d.id = v.id
       WHERE v.id = ?`,
      [req.params.id]
    );
    if (rows[0]) rows[0].tipo_peticion = rows[0].tipo_peticion_actual || rows[0].tipo_peticion || '';
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;