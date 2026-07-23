# Ventrix

Punto de venta y plataforma de gestión para pequeños negocios. Incluye control de inventario por bodegas, ventas, compras, créditos y fiados, caja, reportes y más.

> El repositorio se llama `komercio` por razones históricas; la marca del producto es **Ventrix** (ventrix.lat).

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js · Express · TypeScript |
| Frontend | Next.js 14 · React 18 · TypeScript |
| Base de datos | PostgreSQL 16 (Prisma ORM) |
| Cache | Redis 7 |
| Tiempo real | Socket.io |
| Auth | JWT (access + refresh tokens) |
| Contenedores | Docker · Docker Compose |

---

## Requisitos previos

- [Docker](https://www.docker.com/) y Docker Compose
- **O bien** (para desarrollo local sin Docker):
  - Node.js ≥ 20
  - PostgreSQL 16
  - Redis 7

---

## Inicio rápido con Docker

```bash
# 1. Clona el repositorio
git clone <repo-url>
cd komercio

# 2. Configura las variables de entorno del backend
cp backend/.env.example backend/.env
# Edita backend/.env y ajusta los secrets (JWT_SECRET, etc.)

# 3. Levanta todos los servicios
docker compose up --build

# 4. Carga los datos iniciales (primera vez)
docker compose exec backend npm run db:seed
```

Servicios disponibles:

| Servicio | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000/api/v1 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## Desarrollo local (sin Docker)

### Backend

```bash
cd backend
cp .env.example .env        # configura DATABASE_URL, REDIS_URL y JWT secrets
npm install
npm run db:generate         # genera el cliente Prisma
npm run db:migrate          # aplica migraciones
npm run db:seed             # datos iniciales (opcional)
npm run dev                 # inicia en puerto 4000 con hot-reload
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # ajusta NEXT_PUBLIC_API_URL si es necesario
npm install
npm run dev                         # inicia en puerto 3001
```

---

## Variables de entorno (backend)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Conexión PostgreSQL | `postgresql://user:pass@localhost:5432/komercio_db` |
| `REDIS_URL` | Conexión Redis | `redis://localhost:6379` |
| `JWT_SECRET` | Secret para access tokens | cadena aleatoria larga |
| `JWT_REFRESH_SECRET` | Secret para refresh tokens | cadena aleatoria distinta |
| `JWT_EXPIRES_IN` | Duración del access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Duración del refresh token | `7d` |
| `PORT` | Puerto del servidor | `4000` |
| `NODE_ENV` | Entorno | `development` / `production` |
| `CORS_ORIGIN` | Origen permitido por CORS | `http://localhost:3001` |

---

## Comandos útiles

```bash
# Backend
npm run dev          # desarrollo
npm run build        # compilar TypeScript
npm run test         # ejecutar tests
npm run test -- --coverage   # tests con cobertura
npm run db:studio    # Prisma Studio (interfaz visual de la BD)
npm run db:migrate   # aplicar migraciones
npm run lint         # lint TypeScript

# Frontend
npm run dev          # desarrollo
npm run build        # build de producción
npm run lint         # lint Next.js
```

---

## Estructura del proyecto

```
komercio/
├── backend/
│   ├── src/
│   │   ├── __tests__/          # Tests unitarios
│   │   │   ├── middlewares/
│   │   │   └── utils/
│   │   ├── config/             # DB, Redis, Logger, Socket
│   │   ├── controllers/        # Lógica de negocio
│   │   ├── middlewares/        # Auth, validación, errores
│   │   ├── routes/             # Definición de endpoints
│   │   └── utils/              # JWT, respuestas, paginación
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── jest.config.ts
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (dashboard)/    # Módulos autenticados
│   │   │   ├── login/
│   │   │   └── register/
│   │   └── components/
│   └── package.json
└── docker-compose.yml
```

---

## Módulos

| Módulo | Descripción |
|---|---|
| Auth | Registro, login, refresh token, recuperación de contraseña |
| Usuarios | Gestión de empleados y roles |
| Negocio | Configuración del negocio y sucursales |
| Productos | Catálogo, categorías, marcas, control de stock |
| Inventario | Movimientos de entrada/salida/ajuste |
| Ventas | Punto de venta, historial, anulaciones |
| Compras | Órdenes a proveedores |
| Clientes | Base de clientes |
| Proveedores | Base de proveedores |
| Créditos | Ventas a crédito y seguimiento de pagos |
| Gastos | Registro de egresos |
| Caja | Apertura y cierre de caja diaria |
| Reportes | Ventas, inventario, rentabilidad |
| Exportación | Generación de PDF y Excel |
| Notificaciones | Alertas en tiempo real vía Socket.io |
| Dashboard | Métricas y resumen general |

---

## Roles de usuario

| Rol | Permisos principales |
|---|---|
| `ADMIN` | Acceso total |
| `SUPERVISOR` | Gestión de productos, ventas, reportes; no puede eliminar datos críticos |
| `CASHIER` | Punto de venta y caja |
| `SELLER` | Ventas y clientes |
| `WAREHOUSE` | Inventario y productos |

---

## Tests

Los tests unitarios cubren los módulos core del backend:

```bash
cd backend
npm test
```

| Archivo de test | Qué cubre |
|---|---|
| `__tests__/utils/jwt.test.ts` | Generación y verificación de access/refresh tokens |
| `__tests__/utils/response.test.ts` | Helpers de respuesta HTTP y clase `AppError` |
| `__tests__/middlewares/auth.test.ts` | Middleware `authenticate` y `authorize` |
| `__tests__/middlewares/validate.test.ts` | Middleware de validación con express-validator |

La suite completa son **28 archivos de test** que además cubren los controladores
(ventas, compras, productos, clientes, exportaciones, pagos) y el control de
acceso por rol de las rutas sensibles.

---

## Pruebas end-to-end

Playwright, en la carpeta `e2e/`.

```bash
cd e2e
npm install
cp .env.example .env     # define E2E_EMAIL y E2E_PASSWORD
npx playwright test
```

Las credenciales **no van en el código**: se leen de `e2e/.env`, que está
ignorado por git. Conviene usar un usuario dedicado a pruebas y no la cuenta de
administrador real.

Para verificar un entorno ya desplegado:

```bash
E2E_BASE_URL=https://tu-entorno npx playwright test --config=playwright-prod.config.ts
```

Esa suite (`prod-verification.spec.ts`) es de **solo lectura** a propósito:
comprueba que las pantallas carguen, sin crear ni modificar datos. Una prueba
automatizada no distingue "mi dato de prueba" del dato de un cliente real.

---

## Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` o `develop` y en cada pull
request, con PostgreSQL y Redis levantados como servicios:

| Job | Pasos |
|---|---|
| **Backend** | `npm ci` · Prisma generate · lint · migraciones · build · tests |
| **Frontend** | `npm ci` · lint · `tsc --noEmit` · build |

Se usa `npm ci` (no `npm install`) para que el build falle si `package.json` y
`package-lock.json` están desincronizados, en vez de corregirlo en silencio.

> Los lock files se generan en Windows y el CI corre en Linux. Si `npm ci` falla
> con `Missing: ... from lock file`, se arregla con
> `npm install --package-lock-only`. Ver `RESPALDOS.md` y el historial de commits
> para el detalle.
