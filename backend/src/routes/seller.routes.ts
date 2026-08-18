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
import { getWompiTransaction, WOMPI_CONFIGURED, PLAN_PRICES, CONTABLE_ANNUAL_PRICE } from '../controllers/payment.controller';
import { generarPasswordTemporal } from '../utils/tempPassword';
import { getVapidPublicKey, sendPushToSellers, pushEnabled } from '../config/webpush';
import { planDesdeMonto, planDesdeDuracion } from '../utils/comision';

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
    body('transactionId').trim().notEmpty().withMessage('Falta el número de transacción de Wompi'),
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const { name, email, businessType } = req.body;
      const transactionId: string = (req.body.transactionId || '').trim();
      const period: string = req.body.period || (businessType === 'contable' ? 'annual' : 'monthly');
      const businessName = (req.body.businessName || '').trim()
        || (businessType === 'contable' ? `Contabilidad de ${name}` : `Negocio de ${name}`);

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new AppError('Ese correo ya tiene una cuenta en Ventrix', 409);

      // ── SEGURO: el pago debe estar hecho y APROBADO en Wompi (tu cuenta) ──────
      if (!WOMPI_CONFIGURED) throw new AppError('La verificación de pagos no está configurada en el servidor.', 503);
      // Ese pago no puede haberse usado ya para crear otra cuenta.
      const yaUsado = await prisma.business.findUnique({ where: { paymentRef: transactionId } });
      if (yaUsado) throw new AppError('Ese pago ya se usó para crear una cuenta.', 409);

      let tx;
      try {
        const resp = await getWompiTransaction(transactionId);
        tx = resp.data?.data;
      } catch {
        throw new AppError('No se pudo verificar el pago con Wompi. Revisa el número e intenta de nuevo.', 502);
      }
      if (!tx || !tx.status) throw new AppError('No se encontró esa transacción en Wompi. Revisa el número.', 404);
      if (tx.status !== 'APPROVED') throw new AppError(`El pago no está aprobado (estado: ${tx.status}). No se puede crear la cuenta.`, 402);

      // El monto pagado debe coincidir con el del producto/periodo elegido.
      const esperado = businessType === 'contable' ? CONTABLE_ANNUAL_PRICE : (PLAN_PRICES[period] || 0);
      const pagado = Math.round((tx.amount_in_cents || 0) / 100);
      if (esperado > 0 && pagado !== esperado) {
        throw new AppError(`El monto pagado ($${pagado.toLocaleString('es-CO')}) no coincide con el plan elegido ($${esperado.toLocaleString('es-CO')}).`, 409);
      }

      const months = businessType === 'contable' ? 12 : (PLAN_MONTHS[period] || 1);
      const planExpiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);
      const plainPassword = generarPasswordTemporal();
      const hashed = await bcrypt.hash(plainPassword, 12);

      const business = await prisma.$transaction(async (dbtx) => {
        const user = await dbtx.user.create({
          // Verificada de una vez: la vendedora responde por el cliente, así el
          // cliente no tiene que verificar correo para entrar.
          data: { name, email, password: hashed, role: 'ADMIN', isEmailVerified: true },
        });
        const biz = await createBusinessForOwner(dbtx, { userId: user.id, businessName, businessType, assignBranch: true });
        await dbtx.business.update({
          where: { id: biz.id },
          data: { plan: 'pro', planExpiresAt, createdBySellerId: req.seller.id, paymentRef: transactionId },
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

    // La comisión la calcula el SERVIDOR, no el navegador: es la misma cifra que
    // ve el dueño en su panel, así que no pueden discrepar a la hora de pagar.
    // Cuando la venta entró por el link se usa el monto realmente pagado; en las
    // creadas a mano se deduce de la duración del plan.
    const compras = await prisma.guestCheckout.findMany({
      where: { status: 'provisioned', businessId: { in: businesses.map((b) => b.id) } },
      select: { businessId: true, amount: true, productType: true },
    });
    const porNegocio = new Map(compras.map((c) => [c.businessId!, c]));

    const conComision = businesses.map((b) => {
      const compra = porNegocio.get(b.id);
      const plan = compra
        ? planDesdeMonto(compra.amount, compra.productType)
        : planDesdeDuracion({ type: b.type, createdAt: b.createdAt, planExpiresAt: b.planExpiresAt });
      return { ...b, periodo: plan.periodo, precio: plan.precio, comision: plan.comision };
    });

    return success(res, conComision);
  } catch (err) { next(err); }
});

// GET /seller/compras → compras hechas por SU link (?v=slug), con el celular del
// cliente para poder escribirle. El correo con las credenciales se va a spam más
// seguido de lo que uno quisiera: sin un teléfono, la vendedora no tiene cómo
// avisarle al cliente que su cuenta ya está lista.
router.get('/compras', authSeller, async (req: any, res: any, next: any) => {
  try {
    const compras = await prisma.guestCheckout.findMany({
      where: { sellerSlug: req.seller.slug },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, buyerName: true, buyerLastName: true, buyerEmail: true, buyerPhone: true,
        productType: true, period: true, amount: true, status: true, errorMessage: true,
        createdAt: true, provisionedAt: true,
      },
    });
    return success(res, compras);
  } catch (err) { next(err); }
});

// ─── Avisos al celular de la vendedora (Web Push) ─────────────────────────────
// Cuando un cliente compra por su link, ella se entera al instante aunque tenga
// el portal cerrado — que es cuando puede escribirle mientras el cliente todavía
// está pendiente del celular. Sesión propia (authSeller), tabla propia.

// GET /seller/push/vapid → clave pública que el navegador necesita para suscribirse.
router.get('/push/vapid', authSeller, (_req, res) => success(res, { key: getVapidPublicKey() }));

// POST /seller/push/subscribe → guarda (o actualiza) este dispositivo.
router.post('/push/subscribe', authSeller, async (req: any, res: any, next: any) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) throw new AppError('Suscripción incompleta', 400);
    await prisma.sellerPushSubscription.upsert({
      where: { endpoint },
      // El mismo dispositivo puede cambiar de vendedora (un celular compartido):
      // el update reasigna la suscripción en vez de dejarla apuntando a la otra.
      update: { sellerId: req.seller.id, p256dh: keys.p256dh, auth: keys.auth },
      create: { sellerId: req.seller.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    return success(res, null, 'Avisos activados en este dispositivo');
  } catch (err) { next(err); }
});

// POST /seller/push/unsubscribe → deja de avisar en este dispositivo.
router.post('/push/unsubscribe', authSeller, async (req: any, res: any, next: any) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) await prisma.sellerPushSubscription.deleteMany({ where: { endpoint, sellerId: req.seller.id } });
    return success(res, null, 'Avisos desactivados en este dispositivo');
  } catch (err) { next(err); }
});

// POST /seller/push/test → prueba en un toque, para que confirme que le llegan.
router.post('/push/test', authSeller, async (req: any, res: any, next: any) => {
  try {
    if (!pushEnabled) throw new AppError('El servidor aún no tiene las notificaciones configuradas.', 503);
    const count = await prisma.sellerPushSubscription.count({ where: { sellerId: req.seller.id } });
    if (count === 0) return success(res, { sent: 0 }, 'Este dispositivo no está suscrito. Activa los avisos y vuelve a intentar.');
    await sendPushToSellers([req.seller.id], {
      title: 'Ventrix · Prueba',
      body: '✅ Los avisos funcionan. Así te avisaremos cuando un cliente compre por tu link.',
      url: '/vendedor',
      tag: 'seller-test',
    });
    return success(res, { sent: count }, `Aviso de prueba enviado a ${count} dispositivo(s).`);
  } catch (err) { next(err); }
});

export default router;
