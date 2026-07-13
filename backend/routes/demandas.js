const router = require('express').Router();
const db     = require('../db');
const {
  authMiddleware, adminOSubadmin, noConsulta,
  areaUsuarioGuard, subareaUsuarioGuard, scopeArea, scopeSubarea,
} = require('../middleware/auth');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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

// undefined / '' → null para MySQL
const s = v => (v === undefined || v === '') ? null : v;

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

// Listar
router.get('/', async (req, res) => {
  try {
    const { area, estado, prioridad, q } = req.query;
    let sql    = 'SELECT * FROM v_demandas WHERE 1=1';
    const params = [];

    const scope    = scopeArea(req);
    const subScope = scopeSubarea(req);
    if (scope)     { sql += ' AND area_id = ?';    params.push(scope); }
    if (subScope)  { sql += ' AND subarea_id = ?'; params.push(subScope); }
    if (area)      { sql += ' AND area = ?';      params.push(area); }
    if (estado)    { sql += ' AND estado = ?';    params.push(estado); }
    if (prioridad) { sql += ' AND prioridad = ?'; params.push(prioridad); }
    if (q) {
      sql += ' AND (folio LIKE ? OR remitente LIKE ? OR asunto LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY creado_en DESC';

    const [rows] = await db.execute(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Peticiones con observaciones (reportes de problema) - jefe de area (de su
// propia area) y Administrador/Subadmin (de todas). Debe ir antes de '/:id'
// para que Express no interprete "reportes" como un id de demanda.
router.get('/reportes/lista', async (req, res) => {
  try {
    if (!['Administrador', 'Subadmin', 'jefe_area'].includes(req.user.rol)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para ver las observaciones' });
    }

    let sql = `
      SELECT r.id, r.demanda_id, r.nota, r.creado_en,
             d.folio, d.remitente, d.asunto, d.estado,
             a.nombre AS area, u.nombre AS reportado_por
      FROM reportes_problema r
      JOIN demandas d      ON r.demanda_id = d.id
      LEFT JOIN areas    a ON r.area_id    = a.id
      LEFT JOIN usuarios u ON r.usuario_id = u.id
      WHERE 1=1`;
    const params = [];

    const scope = scopeArea(req);
    if (scope) { sql += ' AND r.area_id = ?'; params.push(scope); }

    sql += ' ORDER BY r.creado_en DESC';

    const [rows] = await db.execute(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Detalle
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    const scope    = scopeArea(req);
    const subScope = scopeSubarea(req);
    if (scope && Number(rows[0].area_id) !== Number(scope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }
    if (subScope && Number(rows[0].subarea_id) !== Number(subScope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    const [hist] = await db.execute(
      `SELECT t.transferido_en, ao.nombre AS area_origen, ad.nombre AS area_destino,
              t.comentario, u.nombre AS transferido_por
       FROM transferencias t
       LEFT JOIN areas ao   ON t.area_origen_id  = ao.id
       LEFT JOIN areas ad   ON t.area_destino_id = ad.id
       LEFT JOIN usuarios u ON t.transferido_por = u.id
       WHERE t.demanda_id = ?
       ORDER BY t.transferido_en ASC`,
      [req.params.id]
    );

    const [histEst] = await db.execute(
      `SELECT he.creado_en, he.estado_anterior, he.estado_nuevo,
              he.archivo_nombre, he.archivo_ruta, he.comentario, u.nombre AS cambiado_por
       FROM historial_estados he
       LEFT JOIN usuarios u ON he.cambiado_por = u.id
       WHERE he.demanda_id = ?
       ORDER BY he.creado_en ASC`,
      [req.params.id]
    );

    const [reportes] = await db.execute(
      `SELECT r.creado_en, r.nota, u.nombre AS reportado_por
       FROM reportes_problema r
       LEFT JOIN usuarios u ON r.usuario_id = u.id
       WHERE r.demanda_id = ?
       ORDER BY r.creado_en ASC`,
      [req.params.id]
    );

    const [histEdit] = await db.execute(
      `SELECT he.editado_en, u.nombre AS editado_por, he.campos_editados
       FROM historial_ediciones he
       LEFT JOIN usuarios u ON he.editado_por = u.id
       WHERE he.demanda_id = ?
       ORDER BY he.editado_en ASC`,
      [req.params.id]
    );

    res.json({ ok: true, data: { ...rows[0], historial: hist, historial_estados: histEst, historial_ediciones: histEdit, reportes } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Crear
router.post('/', noConsulta, async (req, res) => {
  try {
    if (req.user.rol === 'subarea_usuario') {
      return res.status(403).json({ ok: false, error: 'Los usuarios de subarea no pueden crear peticiones' });
    }

    const {
      ref, area_id, remitente, asunto,
      domicilio, colonia, tel1, tel2,
      demanda, observaciones, concepto, fecha_demanda
    } = req.body;

    if (!remitente || !asunto) {
      return res.status(400).json({ ok: false, error: 'Remitente y asunto son requeridos' });
    }

    const id    = 'D-' + Date.now();
    const folio = await siguienteFolio();

    // Un usuario de area solo puede capturar peticiones para su propia area,
    // sin importar que area_id venga en el body
    const scope     = scopeArea(req);
    const areaIdVal = scope || (area_id != null && area_id !== '' ? Number(area_id) : null);

    await db.execute(
      `INSERT INTO demandas
        (id, folio, fecha_captura, fecha_demanda, folio_ref, area_id,
         remitente, asunto, domicilio, colonia, tel_principal, tel_secundario,
         descripcion, observaciones, concepto, estado, creado_por)
       VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)`,
      [
        id,
        folio,
        parseFecha(s(fecha_demanda)),
        s(ref),
        areaIdVal,
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

    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [id]);
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Editar
router.put('/:id', noConsulta, async (req, res) => {
  try {
    const body = req.body;

    // Un usuario de subarea solo puede cambiar el estado, nada mas
    if (req.user.rol === 'subarea_usuario') {
      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== 'estado') {
        return res.status(403).json({ ok: false, error: 'Los usuarios de subarea solo pueden cambiar el estado' });
      }
    }

    // Estado: Administrador, Subadmin, el usuario de la subarea a la que fue enviada, o el jefe de area
    if ('estado' in body && !['Administrador', 'Subadmin', 'subarea_usuario', 'jefe_area'].includes(req.user.rol)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para modificar el estado' });
    }
    // Prioridad: Administrador, Subadmin, el usuario de area o el jefe de area
    if ('prioridad' in body && !['Administrador', 'Subadmin', 'area_usuario', 'jefe_area'].includes(req.user.rol)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para modificar la prioridad' });
    }

    // Leer valores actuales para detectar cambios
    const [current] = await db.execute('SELECT * FROM demandas WHERE id = ?', [req.params.id]);
    if (!current.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    const before = current[0];

    // Un usuario de area solo puede editar peticiones de su propia area;
    // un usuario de subarea, solo las que fueron enviadas a la suya
    const scope    = scopeArea(req);
    const subScope = scopeSubarea(req);
    if (scope && Number(before.area_id) !== Number(scope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }
    if (subScope && Number(before.subarea_id) !== Number(subScope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
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

    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    // Registrar qué campos cambiaron
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
      estado:         'Estado',
      prioridad:      'Prioridad',
      area_id:        'Area',
    };
    const bodyToCol = {
      ref: 'folio_ref', remitente: 'remitente', asunto: 'asunto',
      domicilio: 'domicilio', colonia: 'colonia', tel1: 'tel_principal',
      tel2: 'tel_secundario', demanda: 'descripcion', observaciones: 'observaciones',
      concepto: 'concepto', estado: 'estado', prioridad: 'prioridad', area_id: 'area_id',
    };

    const changes = {};
    for (const [bodyKey, col] of Object.entries(bodyToCol)) {
      if (!(bodyKey in body)) continue;
      if (bodyKey === 'area_id' && scope) continue; // el area no se modifico (usuario de area)
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

// Cambiar estado con archivo obligatorio (En proceso / Atendida)
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

    if (!['En proceso', 'Atendida'].includes(estado)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'Estado no válido para este endpoint' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Se requiere un archivo adjunto' });
    }

    const [dem] = await db.execute('SELECT estado, area_id, subarea_id FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    const scope    = scopeArea(req);
    const subScope = scopeSubarea(req);
    if (scope && Number(dem[0].area_id) !== Number(scope)) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }
    if (subScope && Number(dem[0].subarea_id) !== Number(subScope)) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    await db.execute('UPDATE demandas SET estado = ? WHERE id = ?', [estado, req.params.id]);

    await db.execute(
      `INSERT INTO historial_estados
         (demanda_id, estado_anterior, estado_nuevo, archivo_nombre, archivo_ruta, comentario, cambiado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, dem[0].estado, estado, req.file.originalname, req.file.filename, comentario, req.user.id]
    );

    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [req.params.id]);
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reportar un problema / observacion sobre una peticion (usuario de area).
// Queda visible para el jefe de esa area y para Administrador/Subadmin.
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
    if (scope && Number(dem[0].area_id) !== Number(scope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    await db.execute(
      `INSERT INTO reportes_problema (demanda_id, area_id, usuario_id, nota) VALUES (?, ?, ?, ?)`,
      [req.params.id, dem[0].area_id, req.user.id, nota]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Transferir
router.post('/:id/transferir', adminOSubadmin, async (req, res) => {
  try {
    const area_destino_id = req.body.area_destino_id;
    const comentario      = s(req.body.comentario);

    if (!area_destino_id) {
      return res.status(400).json({ ok: false, error: 'area_destino_id requerido' });
    }

    const [dem] = await db.execute('SELECT area_id FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    await db.execute(
      `INSERT INTO transferencias (demanda_id, area_origen_id, area_destino_id, comentario, transferido_por)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, dem[0].area_id, Number(area_destino_id), comentario, req.user.id]
    );

    await db.execute(
      "UPDATE demandas SET area_id = ?, subarea_id = NULL, estado = 'En proceso' WHERE id = ?",
      [Number(area_destino_id), req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Enviar a una subarea de la propia area (usuario de area, o Administrador/Subadmin)
router.post('/:id/enviar-subarea', async (req, res) => {
  try {
    if (!['area_usuario', 'jefe_area', 'Administrador', 'Subadmin'].includes(req.user.rol)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para esta accion' });
    }

    const { subarea_id } = req.body;
    if (!subarea_id) {
      return res.status(400).json({ ok: false, error: 'subarea_id requerido' });
    }

    const [dem] = await db.execute('SELECT area_id, subarea_id FROM demandas WHERE id = ?', [req.params.id]);
    if (!dem.length) return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });

    const scope = scopeArea(req);
    if (scope && Number(dem[0].area_id) !== Number(scope)) {
      return res.status(404).json({ ok: false, error: 'Demanda no encontrada' });
    }

    const [sub] = await db.execute('SELECT id, area_id, nombre FROM subareas WHERE id = ?', [subarea_id]);
    if (!sub.length) return res.status(404).json({ ok: false, error: 'Subarea no encontrada' });
    if (Number(sub[0].area_id) !== Number(dem[0].area_id)) {
      return res.status(400).json({ ok: false, error: 'La subarea no pertenece a esta area' });
    }

    await db.execute('UPDATE demandas SET subarea_id = ? WHERE id = ?', [subarea_id, req.params.id]);

    await db.execute(
      `INSERT INTO historial_ediciones (demanda_id, editado_por, campos_editados) VALUES (?, ?, ?)`,
      [req.params.id, req.user.id, JSON.stringify({ Subarea: { antes: dem[0].subarea_id || '', despues: sub[0].nombre } })]
    );

    const [rows] = await db.execute('SELECT * FROM v_demandas WHERE id = ?', [req.params.id]);
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
