// ============================================================
//  SAPASE – Script de configuracion inicial de BD
//  Crea el usuario admin con password hasheado
//  Uso: node scripts/setup-db.js
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const db     = require('../db');

async function setup() {
  try {
    console.log('Configurando base de datos...\n');

    // 1. Generar hash para password "sapase2026"
    const password = 'sapase2026';
    const hash     = await bcrypt.hash(password, 10);
    console.log('Hash generado para "sapase2026":', hash);

    // 2. Actualizar o insertar usuario admin
    const [existing] = await db.execute("SELECT id FROM usuarios WHERE usuario = 'admin'");

    if (existing.length > 0) {
      await db.execute(
        "UPDATE usuarios SET password_hash = ? WHERE usuario = 'admin'",
        [hash]
      );
      console.log('\n✔  Usuario admin actualizado con hash correcto');
    } else {
      // Obtener id de DIRECCION GENERAL
      const [area] = await db.execute(
        "SELECT id FROM areas WHERE nombre = 'DIRECCION GENERAL' LIMIT 1"
      );
      const areaId = area[0]?.id || null;

      await db.execute(
        `INSERT INTO usuarios (nombre, usuario, password_hash, area_id, correo, telefono, cargo, rol)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Administrador General', 'admin', hash, areaId,
          'admin@sapase.gob.mx', '5551000001', 'Administrador del Sistema', 'Administrador'
        ]
      );
      console.log('\n✔  Usuario admin creado');
    }

    console.log('\n  Credenciales iniciales:');
    console.log('  Usuario:    admin');
    console.log('  Contrasena: sapase2026');
    console.log('\n  Cambia la contrasena despues del primer acceso.\n');

    process.exit(0);
  } catch (err) {
    console.error('\n✖  Error:', err.message);
    process.exit(1);
  }
}

setup();
