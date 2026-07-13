import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { logger } from './config/logger';
import { redis } from './config/redis';
import { AppError } from './utils/response';

// Rate-limit Redis store — only in production with REDIS_URL; each limiter gets its own instance
// (rate-limit-redis v4 forbids sharing one store across multiple limiters)
// In development we always use the default in-memory store (Redis may not be reachable locally)
function makeRateLimitStore(prefix: string) {
  if (process.env.NODE_ENV !== 'production' || !process.env.REDIS_URL) return undefined;
  return new RedisStore({
    sendCommand: (...args: string[]) =>
      redis.call(args[0], ...args.slice(1)) as Promise<number>,
    prefix,
  });
}

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import businessRoutes from './routes/business.routes';
import productRoutes from './routes/product.routes';
import categoryRoutes from './routes/category.routes';
import brandRoutes from './routes/brand.routes';
import customerRoutes from './routes/customer.routes';
import supplierRoutes from './routes/supplier.routes';
import saleRoutes from './routes/sale.routes';
import purchaseRoutes from './routes/purchase.routes';
import stockTransferRoutes from './routes/stockTransfer.routes';
import expenseRoutes from './routes/expense.routes';
import creditRoutes from './routes/credit.routes';
import cashRegisterRoutes from './routes/cashRegister.routes';
import reportRoutes from './routes/report.routes';
import notificationRoutes from './routes/notification.routes';
import inventoryRoutes from './routes/inventory.routes';
import dashboardRoutes from './routes/dashboard.routes';
import exportRoutes from './routes/export.routes';
import superadminRoutes from './routes/superadmin.routes';
import uploadRoutes from './routes/upload.routes';
import paymentRoutes from './routes/payment.routes';
import publicRoutes from './routes/public.routes';
import searchRoutes from './routes/search.routes';

const app = express();

// Trust Railway/Vercel reverse proxy so rate-limit and IP detection work correctly
app.set('trust proxy', 1);

// Serialize Prisma Decimal values as plain JS numbers in all JSON responses.
// Without this, res.json() would emit Decimal fields as strings (Decimal.toJSON() returns a string),
// which breaks the frontend that expects numeric types.
app.set('json replacer', (_key: string, value: unknown) => {
  if (value !== null && typeof value === 'object' && (value as any).constructor?.name === 'Decimal') {
    return parseFloat((value as any).toString());
  }
  return value;
});

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS
app.use(cors({
  origin: (origin, callback) => {
    const isDev = process.env.NODE_ENV !== 'production';
    // Sin header Origin no es una petición cross-origin de navegador
    // (fetch/XHR) — es una navegación directa (ej. el link de "Plantilla"
    // para descargar el Excel de importación, que abre la URL del backend
    // en una pestaña nueva), una herramienta como curl/Postman, o un
    // webhook. CORS no protege contra esos casos de todas formas — Origin es
    // un header que cualquier cliente no-navegador puede omitir o falsear
    // libremente. Los endpoints que sí dependen de la cookie de refresh
    // token ya se protegen aparte con requireCsrfHeader.
    if (!origin) return callback(null, true);
    // En desarrollo: acepta localhost y cualquier IP de red local
    if (isDev && /^http:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    if (isDev && /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    const allowed = (process.env.CORS_ORIGIN?.split(',') || []).map(s => s.trim());
    const ok = allowed.includes(origin);
    // Un Error plano cae en el catch-all de errorHandler.ts y responde 500 —
    // engañoso para algo que es, en realidad, un rechazo esperado (403), no
    // una falla del servidor. AppError sí lo maneja como corresponde.
    callback(ok ? null : new AppError('Origen no permitido', 403), ok);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 100 : 500),
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore('rl:api:'),
  message: { error: 'Demasiadas solicitudes, intente de nuevo más tarde.' },
});
app.use('/api/', limiter);

// Strict rate limit for auth endpoints — protects login/forgot-password from brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 1_000,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: makeRateLimitStore('rl:auth:'),
  message: { error: 'Demasiados intentos, espere 15 minutos antes de reintentar.' },
});

// Menos estricto que authLimiter — para registro/cambio de contraseña, donde
// bloquear tan agresivo estorbaría el uso normal, pero sí conviene un tope
// más bajo que el límite general de la API.
const moderateAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 1_000,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore('rl:auth-mod:'),
  message: { error: 'Demasiados intentos, espere 15 minutos antes de reintentar.' },
});

// El catálogo público no requiere sesión — sin este límite, cualquiera podría
// raspar el catálogo completo de un negocio repetidamente sin restricción.
const publicCatalogLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 60 : 1_000,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore('rl:catalog:'),
  message: { error: 'Demasiadas solicitudes, intente de nuevo más tarde.' },
});

// Body parsing — rawBody capturado globalmente para la verificación de firma del webhook Wompi
// El límite global es 1 MB; el webhook de Wompi usa su propio middleware con 10 MB
app.use((req: any, res, next) => {
  const isWebhook = req.path === '/api/v1/payments/webhook';
  express.json({
    limit: isWebhook ? '10mb' : '1mb',
    verify: (_req: any, _res, buf) => { (_req as any).rawBody = buf.toString('utf8'); },
  })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Komercio API', version: '1.0.0' });
});

// API Routes
const apiPrefix = '/api/v1';
app.use(`${apiPrefix}/auth/login`, authLimiter);
app.use(`${apiPrefix}/auth/forgot-password`, authLimiter);
app.use(`${apiPrefix}/auth/resend-verification`, authLimiter);
// La ruta real es /auth/refresh-token, no /auth/refresh — con el prefijo viejo
// este limiter nunca hacía match y ese endpoint solo quedaba cubierto por el
// límite general de la API (mucho más permisivo).
app.use(`${apiPrefix}/auth/refresh-token`, authLimiter);
app.use(`${apiPrefix}/auth/register`, moderateAuthLimiter);
app.use(`${apiPrefix}/auth/change-password`, moderateAuthLimiter);
app.use(`${apiPrefix}/auth/reset-password`, moderateAuthLimiter);
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/users`, userRoutes);
app.use(`${apiPrefix}/business`, businessRoutes);
app.use(`${apiPrefix}/products`, productRoutes);
app.use(`${apiPrefix}/categories`, categoryRoutes);
app.use(`${apiPrefix}/brands`, brandRoutes);
app.use(`${apiPrefix}/customers`, customerRoutes);
app.use(`${apiPrefix}/suppliers`, supplierRoutes);
app.use(`${apiPrefix}/sales`, saleRoutes);
app.use(`${apiPrefix}/purchases`, purchaseRoutes);
app.use(`${apiPrefix}/stock-transfers`, stockTransferRoutes);
app.use(`${apiPrefix}/expenses`, expenseRoutes);
app.use(`${apiPrefix}/credits`, creditRoutes);
app.use(`${apiPrefix}/cash-register`, cashRegisterRoutes);
app.use(`${apiPrefix}/reports`, reportRoutes);
app.use(`${apiPrefix}/notifications`, notificationRoutes);
app.use(`${apiPrefix}/inventory`, inventoryRoutes);
app.use(`${apiPrefix}/dashboard`, dashboardRoutes);
app.use(`${apiPrefix}/exports`, exportRoutes);
app.use(`${apiPrefix}/superadmin`, superadminRoutes);
app.use(`${apiPrefix}/uploads`, uploadRoutes);
app.use(`${apiPrefix}/payments`, paymentRoutes);
app.use(`${apiPrefix}/public`, publicCatalogLimiter, publicRoutes);
app.use(`${apiPrefix}/search`, searchRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;
