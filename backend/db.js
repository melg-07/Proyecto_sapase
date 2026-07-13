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
// de problema si aun no existen (idempotente, para bases de datos ya creadas
// antes de que existiera esta funcionalidad).
async function ensureObservacionesSchema() {
  try {
    await pool.execute('ALTER TABLE historial_estados ADD COLUMN comentario TEXT NULL AFTER archivo_ruta');
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') console.error('⚠  No se pudo agregar historial_estados.comentario:', err.message);
  }

  try {
    // Sin FOREIGN KEY: algunas bases ya existentes tienen demandas.id con una
    // collation distinta a la que usan las tablas nuevas por defecto, lo que
    // rompe la constraint (Error 3780). Las consultas ya hacen JOIN manualmente.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reportes_problema (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        demanda_id  VARCHAR(20)  NOT NULL,
        area_id     INT UNSIGNED,
        usuario_id  INT UNSIGNED,
        nota        TEXT NOT NULL,
        creado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_reportes_demanda (demanda_id),
        KEY idx_reportes_area    (area_id)
      ) ENGINE=InnoDB
    `);
  } catch (err) {
    console.error('⚠  No se pudo crear la tabla reportes_problema:', err.message);
  }
}

module.exports = pool;
