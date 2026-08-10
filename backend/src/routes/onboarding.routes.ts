import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { success, AppError } from '../utils/response';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

// Orden en que se recomiendan los pasos (define el "siguiente paso").
const STEP_ORDER: Record<string, string[]> = {
  pos: ['product', 'sale', 'customer', 'cashRegister', 'branding'],
  contable: ['client', 'vencimiento', 'document'],
};

type OnbState = { welcomeSeenAt?: string; tourDoneAt?: string; dismissedAt?: string; firstSaleAt?: string; legacy?: boolean };

// Estado de los "primeros pasos": los pasos se marcan solos según datos reales
// del negocio; el estado (bienvenida vista, tour hecho, guía oculta) se guarda en
// business.onboarding para que sea cross-device y no molestar a usuarios viejos.
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) throw new AppError('No autorizado', 401);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { type: true, logo: true, onboarding: true },
    });
    if (!business) throw new AppError('Negocio no encontrado', 404);

    const onb = (business.onboarding || {}) as OnbState;
    const state = {
      welcomeSeen: !!onb.welcomeSeenAt,
      tourDone: !!onb.tourDoneAt,
      dismissed: !!onb.dismissedAt,
    };

    let productType: 'pos' | 'contable';
    let steps: Record<string, boolean>;

    if (business.type === 'contable') {
      const [clients, vencimientos, documents] = await Promise.all([
        prisma.taxClient.count({ where: { businessId } }),
        prisma.vencimiento.count({ where: { taxClient: { businessId } } }),
        prisma.clientDocument.count({ where: { taxClient: { businessId } } }),
      ]);
      productType = 'contable';
      steps = { client: clients > 0, vencimiento: vencimientos > 0, document: documents > 0 };
    } else {
      const [products, sales, customers, cashRegisters] = await Promise.all([
        prisma.product.count({ where: { businessId, deletedAt: null } }),
        prisma.sale.count({ where: { branch: { businessId }, deletedAt: null } }),
        prisma.customer.count({ where: { businessId } }),
        prisma.cashRegister.count({ where: { branch: { businessId } } }),
      ]);
      productType = 'pos';
      steps = { product: products > 0, sale: sales > 0, customer: customers > 0, cashRegister: cashRegisters > 0, branding: !!business.logo };
    }

    // Siguiente paso recomendado = primer paso incompleto en el orden definido.
    const nextStep = STEP_ORDER[productType].find((k) => !steps[k]) || null;

    return success(res, { productType, steps, state, nextStep });
  } catch (err) {
    next(err);
  }
});

// Actualiza el estado del onboarding (bienvenida vista, tour hecho, guía oculta).
// Solo agrega marcas de tiempo; nunca borra los datos reales del negocio.
router.patch('/',
  [
    body('welcomeSeen').optional().isBoolean(),
    body('tourDone').optional().isBoolean(),
    body('dismissed').optional().isBoolean(),
    body('firstSale').optional().isBoolean(),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) throw new AppError('No autorizado', 401);

      const business = await prisma.business.findUnique({ where: { id: businessId }, select: { onboarding: true } });
      if (!business) throw new AppError('Negocio no encontrado', 404);

      const onb = { ...((business.onboarding || {}) as OnbState) };
      const now = new Date().toISOString();
      if (req.body.welcomeSeen && !onb.welcomeSeenAt) onb.welcomeSeenAt = now;
      if (req.body.tourDone && !onb.tourDoneAt) onb.tourDoneAt = now;
      if (req.body.firstSale && !onb.firstSaleAt) onb.firstSaleAt = now;
      // dismissed puede alternar (ocultar / volver a mostrar la guía).
      if (req.body.dismissed === true) onb.dismissedAt = now;
      if (req.body.dismissed === false) delete onb.dismissedAt;

      await prisma.business.update({ where: { id: businessId }, data: { onboarding: onb as object } });
      return success(res, { state: { welcomeSeen: !!onb.welcomeSeenAt, tourDone: !!onb.tourDoneAt, dismissed: !!onb.dismissedAt } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
