import { Router } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { success, created, AppError } from '../utils/response';
import { validate } from '../middlewares/validate';
import { logger } from '../config/logger';
import { createBusinessForOwner } from '../controllers/auth.controller';

// Portal de vendedoras (/seller): cada vendedora inicia sesión y crea cuentas de
// clientes ya listas (verificadas, en Pro, con clave) para enviarlas por WhatsApp.
// Auth propia y separada de la de usuarios (JWT con kind:'seller').
const router = Router();

const SELLER_JWT_EXPIRES = process.env.SELLER_JWT_EXPIRES || '30d';

function signSellerToken(sellerId: string): string {
  const secret = process.env.JWT_SECRET || '';
  return jwt.sign({ sellerId, kind: 'seller' }, secret, { expiresIn: SELLER_JWT_EXPIRES } as jwt.SignOptions);
}

async function authSeller(req: any, res: any, next: any) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('No autorizado', 401);
    const payload = jwt.verify(token, process.env.JWT_SECRET || '') as { sellerId?: string; kind?: string };
    if (payload.kind !== 'seller' || !payload.sellerId) throw new AppError('Sesión inválida', 401);
    const seller = await prisma.seller.findFirst({ where: { id: payload.sellerId, active: true } });
    if (!seller) throw new AppError('Vendedora no encontrada o inactiva', 401);
    req.seller = seller;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    return next(new AppError('Sesión inválida', 401));
  }
}

// Contraseña legible para enviar por WhatsApp (sin caracteres confusos).
function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i += 1) out += chars[bytes[i] % chars.length];
  return out;
}

const PLAN_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, annual: 12 };

// POST /seller/login
router.post('/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const { email, password } = req.body;
      const seller = await prisma.seller.findUnique({ where: { email } });
      if (!seller || !seller.active) throw new AppError('Correo o contraseña incorrectos', 401);
      const ok = await bcrypt.compare(password, seller.password);
      if (!ok) throw new AppError('Correo o contraseña incorrectos', 401);
      const token = signSellerToken(seller.id);
      return success(res, { token, seller: { name: seller.name, slug: seller.slug, phone: seller.phone } }, 'Sesión iniciada');
    } catch (err) { next(err); }
  },
);

// GET /seller/me
router.get('/me', authSeller, (req: any, res) => {
  const s = req.seller;
  return success(res, { name: s.name, slug: s.slug, phone: s.phone });
});

// POST /seller/change-password
router.post('/change-password',
  authSeller,
  [body('newPassword').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres')],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const hashed = await bcrypt.hash(req.body.newPassword, 12);
      await prisma.seller.update({ where: { id: req.seller.id }, data: { password: hashed } });
      return success(res, null, 'Contraseña actualizada');
    } catch (err) { next(err); }
  },
);

// POST /seller/provision → crea la cuenta del cliente lista para usar.
router.post('/provision',
  authSeller,
  [
    body('name').trim().notEmpty().withMessage('El nombre es obligatorio'),
    body('email').isEmail().normalizeEmail().withMessage('Correo inválido'),
    body('businessType').isIn(['pos', 'contable']).withMessage('Producto inválido'),
    body('businessName').optional().trim(),
    body('period').optional().isIn(['monthly', 'quarterly', 'annual']),
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const { name, email, businessType } = req.body;
      const period: string = req.body.period || (businessType === 'contable' ? 'annual' : 'monthly');
      const businessName = (req.body.businessName || '').trim()
        || (businessType === 'contable' ? `Contabilidad de ${name}` : `Negocio de ${name}`);

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new AppError('Ese correo ya tiene una cuenta en Ventrix', 409);

      const months = businessType === 'contable' ? 12 : (PLAN_MONTHS[period] || 1);
      const planExpiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);
      const plainPassword = genPassword();
      const hashed = await bcrypt.hash(plainPassword, 12);

      const business = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          // Verificada de una vez: la vendedora responde por el cliente, así el
          // cliente no tiene que verificar correo para entrar.
          data: { name, email, password: hashed, role: 'ADMIN', isEmailVerified: true },
        });
        const biz = await createBusinessForOwner(tx, { userId: user.id, businessName, businessType, assignBranch: true });
        await tx.business.update({
          where: { id: biz.id },
          data: { plan: 'pro', planExpiresAt, createdBySellerId: req.seller.id },
        });
        return biz;
      });

      logger.info(`[seller] ${req.seller.name} provisionó ${businessType} (${business.id}) para ${email}`);
      return created(res, {
        name, email, password: plainPassword, businessType, businessName,
        loginUrl: businessType === 'contable' ? 'ventrix.lat/login?tipo=contable' : 'ventrix.lat/login',
      }, 'Cuenta creada');
    } catch (err) { next(err); }
  },
);

// GET /seller/accounts → cuentas que esta vendedora creó.
router.get('/accounts', authSeller, async (req: any, res: any, next: any) => {
  try {
    const businesses = await prisma.business.findMany({
      where: { createdBySellerId: req.seller.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, name: true, type: true, plan: true, planExpiresAt: true, createdAt: true,
        owner: { select: { name: true, email: true } },
      },
    });
    return success(res, businesses);
  } catch (err) { next(err); }
});

export default router;
