const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'sapase_db',
  charset:            'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '-06:00', // Ciudad de Mexico
});

// Prueba de conexion al arrancar (no detiene el proceso si falla)
pool.getConnection()
  .then(async conn => {
    console.log('✔  MySQL conectado');
    conn.release();
    await ensureRolEnumSubadmin();
    await ensureObservacionesSchema();
  })
  .catch(err => { console.error('✖  MySQL:', err.message); });

// Asegura que el ENUM de usuarios.rol tenga todos los roles vigentes (idempotente)
async function ensureRolEnumSubadmin() {
  try {
    await pool.execute(
      "ALTER TABLE usuarios MODIFY rol ENUM('Administrador','Subadmin','Capturista','Consulta','TIC','area_usuario','subarea_usuario','jefe_area') NOT NULL DEFAULT 'Capturista'"
    );
  } catch (err) {
    console.error('⚠  No se pudo actualizar el ENUM de rol:', err.message);
  }
}

// Agrega la columna de comentario a historial_estados y la tabla de reportes
async function ensureObservacionesSchema() {
  try {
    await pool.execute('ALTER TABLE historial_estados ADD COLUMN comentario TEXT NULL AFTER archivo_ruta');
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') console.error('⚠  No se pudo agregar historial_estados.comentario:', err.message);
  }

  try {
 
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reportes_problema (
        id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        demanda_id       VARCHAR(20)  NOT NULL,
        area_id          INT UNSIGNED,
        usuario_id       INT UNSIGNED,
        nota             TEXT NOT NULL,
        resuelto         TINYINT(1) NOT NULL DEFAULT 0,
        nota_resolucion  TEXT NULL,
        resuelto_por     INT UNSIGNED NULL,
        resuelto_en      DATETIME NULL,
        creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_reportes_demanda (demanda_id),
        KEY idx_reportes_area    (area_id)
      ) ENGINE=InnoDB
    `);
  } catch (err) {
    console.error('⚠  No se pudo crear la tabla reportes_problema:', err.message);
  }

  const reporteCols = [
    "ADD COLUMN resuelto TINYINT(1) NOT NULL DEFAULT 0 AFTER nota",
    "ADD COLUMN nota_resolucion TEXT NULL AFTER resuelto",
    "ADD COLUMN resuelto_por INT UNSIGNED NULL AFTER nota_resolucion",
    "ADD COLUMN resuelto_en DATETIME NULL AFTER resuelto_por",
  ];
  for (const clause of reporteCols) {
    try {
      await pool.execute(`ALTER TABLE reportes_problema ${clause}`);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') console.error('⚠  No se pudo actualizar reportes_problema:', err.message);
    }
  }
}

module.exports = pool;
