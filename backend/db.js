// ============================================================
//  SAPASE – Conexion a MySQL (pool de conexiones)
// ============================================================
const mysql  = require('mysql2/promise');
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
  timezone:           '-06:00',   // Hora Ciudad de Mexico
});

// Probar conexion al iniciar
pool.getConnection()
  .then(conn => {
    console.log('✔  MySQL conectado correctamente');
    conn.release();
  })
  .catch(err => {
    console.error('✖  Error al conectar MySQL:', err.message);
    process.exit(1);
  });

module.exports = pool;
