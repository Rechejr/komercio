import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { planLimit } from '../middlewares/planLimit';
import { success, created, AppError } from '../utils/response';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

router.get('/me', async (req: any, res, next) => {
  try {
    const businessId = req.user.businessId;
    if (!businessId) return success(res, null);
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    return success(res, business);
  } catch (err) { next(err); }
});

router.put('/me',
  authorize('ADMIN'),
  [
    body('email').optional({ nullable: true }).isEmail().normalizeEmail().withMessage('Email inválido'),
    body('taxRate').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('IVA debe estar entre 0 y 100'),
    body('name').optional().trim().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Moneda debe ser un código de 3 letras'),
    body('settings').optional({ nullable: true }).custom((v) => {
      if (v === null || v === undefined) return true;
      if (typeof v !== 'object' || Array.isArray(v)) throw new Error('settings debe ser un objeto plano');
      const forbidden = ['__proto__', 'constructor', 'prototype'];
      if (Object.keys(v).some((k) => forbidden.includes(k))) throw new Error('settings contiene claves no permitidas');
      return true;
    }),
  ],
  validate,
  async (req: any, res: Response, next: NextFunction) => {
  try {
    const businessId = req.user.businessId;
    if (!businessId) return success(res, null, 'No tiene negocio asociado');

    const { name, legalName, nit, phone, email, address, city, country, logo, currency, taxRate, settings } = req.body;
    const business = await prisma.business.update({
      where: { id: businessId },
      data: { name, legalName, nit, phone, email, address, city, country, logo, currency, taxRate, settings },
    });
    return success(res, business, 'Negocio actualizado');
  } catch (err) { next(err); }
});

router.get('/branches', async (req: any, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { businessId: req.user.businessId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { users: true } },
      },
    });

    // Antes esto contaba Product.branchId ("quién la creó ahí"), que ya no
    // significa nada útil ahora que el stock vive en ProductStock — un producto
    // puede haberse creado en una bodega y hoy tener su stock real en otra
    // (o en ninguna). Se reemplaza por "cuántos productos tienen stock > 0 aquí".
    const stockCounts = await prisma.productStock.groupBy({
      by: ['branchId'],
      where: { branchId: { in: branches.map((b) => b.id) }, stock: { gt: 0 } },
      _count: { _all: true },
    });
    const productCountByBranch = new Map(stockCounts.map((c) => [c.branchId, c._count._all]));

    const data = branches.map((b) => ({
      ...b,
      _count: { ...b._count, products: productCountByBranch.get(b.id) ?? 0 },
    }));
    return success(res, data);
  } catch (err) { next(err); }
});

// Solo el dueño del negocio (ADMIN) puede crear/editar bodegas — nunca el
// staff. El límite de plan (planLimit.branches()) es el único freno duro:
// Free se queda en 1, Pro en 2 (ver plans.ts) — a propósito no ilimitado, para
// que no se use una sola suscripción Pro para operar más de dos locales.
router.post('/branches', authorize('ADMIN'), planLimit.branches(), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, address, phone } = req.body;
    if (!name?.trim()) throw new AppError('El nombre de la bodega es requerido', 400);

    const businessId = req.user!.businessId;
    if (!businessId) throw new AppError('No se encontró un negocio para este usuario', 400);

    const branch = await prisma.branch.create({
      data: {
        name: name.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        businessId,
        createdById: req.user!.userId,
      },
    });
    return created(res, branch, 'Bodega creada');
  } catch (err) { next(err); }
});

router.put('/branches/:id', authorize('ADMIN'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.branch.findFirst({
      where: { id: req.params.id, businessId: req.user!.businessId, deletedAt: null },
    });
    if (!existing) throw new AppError('Bodega no encontrada', 404);

    const { name, address, phone } = req.body;
    if (name !== undefined && !name?.trim()) throw new AppError('El nombre de la bodega es requerido', 400);

    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        address: address !== undefined ? (address?.trim() || null) : undefined,
        phone: phone !== undefined ? (phone?.trim() || null) : undefined,
      },
    });
    return success(res, branch, 'Bodega actualizada');
  } catch (err) { next(err); }
});

// ─── MEDIOS DE PAGO (PaymentAccount) ──────────────────────────────────────────
// Cuentas configurables donde entra/sale la plata (Efectivo, Bancolombia, Caja 1,
// Nequi…). Patrón de Bodegas: solo el ADMIN las gestiona. `type` define cuáles son
// EFECTIVO (los únicos que alimentan la caja física); `legacyEnum` mantiene poblado
// el enum viejo en escrituras nuevas para no romper reportes durante la transición.
const PAYMENT_TYPES = ['CASH', 'BANK', 'OTHER'] as const;
const legacyEnumDeTipo = (type: string) => (type === 'CASH' ? 'CASH' : 'TRANSFER');

router.get('/payment-accounts', async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return success(res, []);
    const accounts = await prisma.paymentAccount.findMany({
      where: { businessId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return success(res, accounts);
  } catch (err) { next(err); }
});

router.post('/payment-accounts', authorize('ADMIN'),
  [
    body('name').trim().notEmpty().withMessage('El nombre es requerido'),
    body('type').optional().isIn(PAYMENT_TYPES as unknown as string[]).withMessage('Tipo inválido'),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const businessId = req.user!.businessId;
      if (!businessId) throw new AppError('No se encontró un negocio para este usuario', 400);

      const { name } = req.body;
      const type = (req.body.type as string) || 'OTHER';
      const count = await prisma.paymentAccount.count({ where: { businessId } });

      const account = await prisma.paymentAccount.create({
        data: {
          businessId,
          name: name.trim(),
          type: type as any,
          legacyEnum: legacyEnumDeTipo(type) as any,
          order: count,
        },
      });
      return created(res, account, 'Medio de pago creado');
    } catch (err) { next(err); }
  });

router.put('/payment-accounts/:id', authorize('ADMIN'),
  [
    body('name').optional().trim().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('type').optional().isIn(PAYMENT_TYPES as unknown as string[]).withMessage('Tipo inválido'),
    body('active').optional().isBoolean(),
    body('order').optional().isInt({ min: 0 }),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.paymentAccount.findFirst({
        where: { id: req.params.id, businessId: req.user!.businessId },
      });
      if (!existing) throw new AppError('Medio de pago no encontrado', 404);

      const { name, type, active, order } = req.body;
      const account = await prisma.paymentAccount.update({
        where: { id: req.params.id },
        data: {
          name: name !== undefined ? name.trim() : undefined,
          type: type !== undefined ? (type as any) : undefined,
          // Si cambia el tipo, se recalcula el puente con el enum viejo.
          legacyEnum: type !== undefined ? (legacyEnumDeTipo(type) as any) : undefined,
          active: active !== undefined ? active : undefined,
          order: order !== undefined ? order : undefined,
        },
      });
      return success(res, account, 'Medio de pago actualizado');
    } catch (err) { next(err); }
  });

// Borrado seguro: si el medio ya tiene movimientos (ventas/compras/gastos/abonos),
// NO se borra — se desactiva, para conservar a qué cuenta fue cada movimiento
// histórico. Solo se elimina de verdad si nunca se usó.
router.delete('/payment-accounts/:id', authorize('ADMIN'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.paymentAccount.findFirst({
      where: { id: req.params.id, businessId: req.user!.businessId },
    });
    if (!existing) throw new AppError('Medio de pago no encontrado', 404);

    const [ventas, compras, gastos, abonos] = await Promise.all([
      prisma.sale.count({ where: { paymentAccountId: existing.id } }),
      prisma.purchase.count({ where: { paymentAccountId: existing.id } }),
      prisma.expense.count({ where: { paymentAccountId: existing.id } }),
      prisma.creditPayment.count({ where: { paymentAccountId: existing.id } }),
    ]);
    const enUso = ventas + compras + gastos + abonos > 0;

    if (enUso) {
      await prisma.paymentAccount.update({ where: { id: existing.id }, data: { active: false } });
      return success(res, { deactivated: true }, 'Medio de pago desactivado (tiene movimientos y no se puede borrar para no perder el historial)');
    }
    await prisma.paymentAccount.delete({ where: { id: existing.id } });
    return success(res, { deleted: true }, 'Medio de pago eliminado');
  } catch (err) { next(err); }
});

export default router;