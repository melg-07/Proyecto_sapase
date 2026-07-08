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
  })
  .catch(err => { console.error('✖  MySQL:', err.message); });

// Asegura que el rol 'Subadmin' exista en el ENUM de usuarios.rol (idempotente)
async function ensureRolEnumSubadmin() {
  try {
    await pool.execute(
      "ALTER TABLE usuarios MODIFY rol ENUM('Administrador','Subadmin','Capturista','Consulta','TIC') NOT NULL DEFAULT 'Capturista'"
    );
  } catch (err) {
    console.error('⚠  No se pudo actualizar el ENUM de rol:', err.message);
  }
}

module.exports = pool;
