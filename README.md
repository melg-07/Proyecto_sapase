# SAPASE – Sistema de Gestión de Demandas
## Guía de instalación y conexión a MySQL

---

## Requisitos

| Herramienta | Version minima |
|-------------|---------------|
| Node.js     | 18+           |
| MySQL       | 8.0+          |
| VS Code     | Cualquiera    |

---

## 1. Crear la base de datos en MySQL

Abre MySQL Workbench (o tu cliente favorito) y ejecuta:

```sql
-- Primero importa el esquema completo:
source backend/schema.sql
```

O copia y pega el contenido de `backend/schema.sql` directamente.

Esto crea:
- La base de datos `sapase_db`
- Las tablas: `areas`, `usuarios`, `demandas`, `transferencias`, `sesiones`
- Las 27 áreas iniciales
- Un usuario admin de ejemplo (con hash temporal)

---

## 2. Configurar variables de entorno

Dentro de la carpeta `backend/`, copia el archivo de ejemplo:

```bash
# En Windows:
copy backend\.env.example backend\.env

# En Mac/Linux:
cp backend/.env.example backend/.env
```

Abre `backend/.env` y ajusta los datos de tu MySQL:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=TU_PASSWORD_AQUI
DB_NAME=sapase_db

JWT_SECRET=cambia_esto_por_una_clave_muy_larga_y_segura_2025
JWT_EXPIRES=8h

PORT=3001
```

---

## 3. Instalar dependencias del backend

```bash
cd backend
npm install
```

---

## 4. Crear el usuario admin con contraseña correcta

Este paso genera el hash bcrypt real para "sapase2026":

```bash
cd backend
node scripts/setup-db.js
```

Verás algo como:
```
✔  MySQL conectado correctamente
✔  Usuario admin actualizado con hash correcto

  Credenciales iniciales:
  Usuario:    admin
  Contrasena: sapase2026
```

---

## 5. Arrancar el servidor

```bash
# En la carpeta backend/:
node server.js

# O con recarga automatica (recomendado para desarrollo):
npm run dev
```

El servidor queda corriendo en `http://localhost:3001`

---

## 6. Abrir la aplicación

Abre tu navegador en:

```
http://localhost:3001
```

O si usas Live Server de VS Code, asegúrate de que `API_BASE` en `js/api.js`
apunte al puerto correcto (por defecto `http://localhost:3001/api`).

---

## Estructura del proyecto

```
sapase-project/
├── index.html              ← Página principal (frontend)
├── assets/
│   ├── escudo.png
│   └── logo_sapase.png
├── css/
│   └── styles.css
├── js/
│   ├── api.js              ← Cliente API (fetch al backend)
│   ├── data.js             ← Datos en memoria + helpers
│   ├── auth.js             ← Login/logout/navegación
│   ├── app.js              ← Dashboard, Áreas
│   ├── demandas.js         ← Formulario, Archivos
│   ├── usuarios.js         ← Tabla de usuarios
│   └── exportar.js         ← PDF, Excel
└── backend/
    ├── server.js           ← Servidor Express
    ├── db.js               ← Pool MySQL
    ├── package.json
    ├── .env.example        ← Plantilla de variables
    ├── schema.sql          ← Esquema y datos iniciales
    ├── middleware/
    │   └── auth.js         ← JWT middleware
    ├── routes/
    │   ├── auth.js         ← POST /api/auth/login
    │   ├── areas.js        ← CRUD /api/areas
    │   ├── usuarios.js     ← CRUD /api/usuarios
    │   └── demandas.js     ← CRUD /api/demandas
    └── scripts/
        └── setup-db.js     ← Configura usuario admin
```

---

## Endpoints de la API

### Auth
| Método | Ruta              | Descripción           |
|--------|-------------------|-----------------------|
| POST   | /api/auth/login   | Iniciar sesión        |
| POST   | /api/auth/logout  | Cerrar sesión         |

### Areas
| Método | Ruta                        | Descripción              |
|--------|-----------------------------|--------------------------|
| GET    | /api/areas                  | Listar todas             |
| POST   | /api/areas                  | Nueva área (admin)       |
| PUT    | /api/areas/:id              | Editar nombre (admin)    |
| PATCH  | /api/areas/:id/toggle       | Activar/desactivar (admin) |

### Usuarios
| Método | Ruta                | Descripción          |
|--------|---------------------|----------------------|
| GET    | /api/usuarios       | Listar (admin)       |
| POST   | /api/usuarios       | Crear (admin)        |
| PUT    | /api/usuarios/:id   | Editar (admin)       |
| GET    | /api/usuarios/me    | Mi perfil            |

### Demandas
| Método | Ruta                           | Descripción          |
|--------|--------------------------------|----------------------|
| GET    | /api/demandas                  | Listar               |
| GET    | /api/demandas/:id              | Detalle              |
| POST   | /api/demandas                  | Crear                |
| PUT    | /api/demandas/:id              | Editar               |
| DELETE | /api/demandas/:id              | Eliminar (admin)     |
| POST   | /api/demandas/:id/transferir   | Transferir área      |

---

## Notas importantes

- El archivo `backend/.env` **nunca** debe subirse a Git. Ya está en `.gitignore`.
- Cambia `JWT_SECRET` por una cadena larga y aleatoria antes de producción.
- Para producción, usa HTTPS y configura un servidor como Nginx frente a Node.
