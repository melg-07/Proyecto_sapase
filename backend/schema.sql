-- ============================================================
--  SAPASE – Esquema MySQL
--  Sistema de Gestión de Demandas
--  Ecatepec de Morelos 2025-2027
-- ============================================================

CREATE DATABASE IF NOT EXISTS sapase_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_spanish_ci;

USE sapase_db;

-- ------------------------------------------------------------
-- AREAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS areas (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(300) NOT NULL,
  activa    TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_area_nombre (nombre)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- USUARIOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(200) NOT NULL,
  usuario       VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_texto VARCHAR(255),
  area_id       INT UNSIGNED,
  correo        VARCHAR(200),
  telefono      VARCHAR(30),
  cargo         VARCHAR(150),
  rol           ENUM('Administrador','Capturista','Consulta','TIC') NOT NULL DEFAULT 'Capturista',
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  creado_en     DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usuario (usuario),
  FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- DEMANDAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demandas (
  id               VARCHAR(20)  PRIMARY KEY,
  folio            VARCHAR(60)  NOT NULL,
  fecha_captura    DATE         NOT NULL,
  fecha_demanda    DATE,
  folio_ref        VARCHAR(100),
  area_id          INT UNSIGNED,
  remitente        VARCHAR(300) NOT NULL,
  asunto           VARCHAR(500) NOT NULL,
  domicilio        VARCHAR(300),
  colonia          VARCHAR(200),
  tel_principal    VARCHAR(30),
  tel_secundario   VARCHAR(30),
  descripcion      TEXT,
  observaciones    TEXT,
  concepto         VARCHAR(200),
  estado           ENUM('Pendiente','En proceso','Atendida') NOT NULL DEFAULT 'Pendiente',
  creado_por       INT UNSIGNED,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   DATETIME ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_folio (folio),
  FOREIGN KEY (area_id)    REFERENCES areas(id)    ON DELETE SET NULL,
  FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- HISTORIAL DE TRANSFERENCIAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transferencias (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  demanda_id       VARCHAR(20)  NOT NULL,
  area_origen_id   INT UNSIGNED,
  area_destino_id  INT UNSIGNED,
  comentario       TEXT,
  transferido_por  INT UNSIGNED,
  transferido_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (demanda_id)      REFERENCES demandas(id)  ON DELETE CASCADE,
  FOREIGN KEY (area_origen_id)  REFERENCES areas(id)     ON DELETE SET NULL,
  FOREIGN KEY (area_destino_id) REFERENCES areas(id)     ON DELETE SET NULL,
  FOREIGN KEY (transferido_por) REFERENCES usuarios(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- SESIONES (tokens JWT guardados para blacklist/logout)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  token      VARCHAR(512) NOT NULL,
  ip         VARCHAR(45),
  creado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en  DATETIME NOT NULL,
  activa     TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- VISTA UTIL: demandas con nombre de area y usuario
-- ============================================================
CREATE OR REPLACE VIEW v_demandas AS
SELECT
  d.id,
  d.folio,
  DATE_FORMAT(d.fecha_captura, '%d/%m/%Y') AS fecha,
  DATE_FORMAT(d.fecha_demanda, '%d/%m/%Y') AS fecha_demanda,
  d.folio_ref        AS ref,
  a.id               AS area_id,
  a.nombre           AS area,
  d.remitente,
  d.asunto,
  d.domicilio,
  d.colonia,
  d.tel_principal    AS tel1,
  d.tel_secundario   AS tel2,
  d.descripcion      AS demanda,
  d.observaciones,
  d.concepto,
  d.estado,
  u.usuario          AS creado_por,
  d.creado_en
FROM demandas d
LEFT JOIN areas    a ON d.area_id    = a.id
LEFT JOIN usuarios u ON d.creado_por = u.id;

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Areas (27)
INSERT IGNORE INTO areas (nombre) VALUES
  ('MANTENIMIENTO'),
  ('OPERACIONES'),
  ('DIRECCION GENERAL'),
  ('CONTRALORIA INTERNA'),
  ('COORDINACION JURIDICA'),
  ('SECRETARIA TECNICA'),
  ('UIPPE'),
  ('UNIDAD DE TRANSPARENCIA'),
  ('COORDINACION DE TECNOLOGIA DE LA INFORMACION Y DE LA COMUNICACION'),
  ('COORDINACION DE PIPAS'),
  ('DIRECCION DE FINANZAS Y ADMINISTRACION'),
  ('COORDINACION DE RECURSOS HUMANOS'),
  ('DEPARTAMENTO DE NOMINA Y PAGOS'),
  ('DEPARTAMENTO DE MANTENIMIENTO Y CONTROL VEHICULAR'),
  ('DEPARTAMENTO DE ADQUISICIONES'),
  ('DEPARTAMENTO DE CONTROL PATRIMONIAL'),
  ('COORDINACION DE CONTABILIDAD, PRESUPUESTO, INGRESOS Y EGRESOS'),
  ('COORDINACION DE RECURSOS MATERIALES'),
  ('OFICINA DE CAJA GENERAL'),
  ('DIRECCION DE COMERCIALIZACION'),
  ('DEPARTAMENTO DE LIQUIDACIONES, ACLARACIONES, CONCENTRACION DE EXPEDIENTES'),
  ('DEPARTAMENTO DE REZAGO, COBRANZA, CONVENIOS Y EJECUCION FISCAL'),
  ('DEPARTAMENTO DE COMERCIO MICROMEDICION, INSPECCION Y VERIFICACION'),
  ('DIRECCION DE CONSTRUCCION'),
  ('COORDINACION DE OPERACION'),
  ('DEPARTAMENTO DE ELECTROMECANICO'),
  ('DIRECCION DE CONSTRUCCION Y OPERACION HIDRAULICA');

-- ------------------------------------------------------------
-- HISTORIAL DE CAMBIOS DE ESTADO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_estados (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  demanda_id      VARCHAR(20)  NOT NULL,
  estado_anterior VARCHAR(50),
  estado_nuevo    ENUM('Pendiente','En proceso','Atendida') NOT NULL,
  archivo_nombre  VARCHAR(255),
  archivo_ruta    VARCHAR(500),
  cambiado_por    INT UNSIGNED,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (demanda_id)   REFERENCES demandas(id)  ON DELETE CASCADE,
  FOREIGN KEY (cambiado_por) REFERENCES usuarios(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- HISTORIAL DE EDICIONES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_ediciones (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  demanda_id      VARCHAR(20)  NOT NULL,
  editado_por     INT UNSIGNED,
  campos_editados TEXT,
  editado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (demanda_id)  REFERENCES demandas(id)  ON DELETE CASCADE,
  FOREIGN KEY (editado_por) REFERENCES usuarios(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- Migracion: agrega columna si ya existe la tabla sin ella
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_texto VARCHAR(255) AFTER password_hash;

-- Migracion: amplia telefonos para admitir simbolos, letras y extension (EXT)
ALTER TABLE usuarios  MODIFY COLUMN telefono      VARCHAR(30);
ALTER TABLE demandas  MODIFY COLUMN tel_principal  VARCHAR(30);
ALTER TABLE demandas  MODIFY COLUMN tel_secundario VARCHAR(30);

-- Usuario admin inicial
-- Contraseña: sapase2026  →  hash generado con bcrypt (rounds=10)
-- Para regenerar: node -e "const b=require('bcrypt'); b.hash('sapase2026',10).then(h=>console.log(h))"
INSERT IGNORE INTO usuarios (nombre, usuario, password_hash, area_id, correo, telefono, cargo, rol)
VALUES (
  'Administrador General',
  'admin',
  '$2b$10$placeholderHashReplaceWithRealBcryptHash00000000000000000',
  (SELECT id FROM areas WHERE nombre = 'DIRECCION GENERAL'),
  'admin@sapase.gob.mx',
  '5551000001',
  'Administrador del Sistema',
  'Administrador'
);
