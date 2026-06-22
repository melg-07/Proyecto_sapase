# SAPASE

Sistema de gestion de demandas ciudadanas para SAPASE Ecatepec.

## Tecnologias

- Node.js + Express
- MySQL
- JWT
- HTML / CSS / JavaScript (vanilla)

## Instalacion

```bash
npm install
```

Copia `.env.example` como `.env` en la raiz del proyecto y ajusta los datos de tu base de datos:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=sapase_db
JWT_SECRET=una_clave_larga
JWT_EXPIRES=8h
PORT=3001
```

Importa el esquema en MySQL:

```sql
source backend/schema.sql
```

Crea el usuario administrador:

```bash
npm run setup-db
```

## Uso

```bash
# Produccion
npm start

# Desarrollo
npm run dev
```

La aplicacion queda disponible en `http://localhost:3001`.

## Despliegue en Render

1. Crea un servicio MySQL externo (Railway, PlanetScale, Aiven).
2. Importa `backend/schema.sql` en esa base de datos.
3. Conecta el repositorio en Render como Web Service.
4. Configura las variables de entorno en el dashboard de Render.
5. Build: `npm install` — Start: `npm start`.
