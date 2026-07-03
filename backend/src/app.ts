import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';

import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { logger } from './config/logger';

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
    // En desarrollo: acepta localhost y cualquier IP de red local
    if (!origin && isDev) return callback(null, true);
    if (isDev && origin && /^http:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    if (isDev && origin && /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    const allowed = (process.env.CORS_ORIGIN?.split(',') || []).map(s => s.trim());
    const ok = !origin || allowed.includes(origin);
    callback(ok ? null : new Error('CORS'), ok);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 100 : 500),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intente de nuevo más tarde.' },
});
app.use('/api/', limiter);

// Strict rate limit for auth endpoints — protects login/forgot-password from brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos, espere 15 minutos antes de reintentar.' },
});

// Body parsing — capture raw body for Wompi webhook signature verification
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
app.use(`${apiPrefix}/auth/refresh`, authLimiter);
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

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;
