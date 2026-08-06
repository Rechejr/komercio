import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { success, AppError } from '../utils/response';

const router = Router();
router.use(authenticate);

// Estado de los "primeros pasos" del usuario. Cada paso se marca solo según los
// datos reales del negocio (no se persiste nada): así la guía desaparece a
// medida que el usuario va usando la herramienta. Distingue POS de Contable.
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) throw new AppError('No autorizado', 401);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { type: true, logo: true },
    });
    if (!business) throw new AppError('Negocio no encontrado', 404);

    if (business.type === 'contable') {
      const [clients, vencimientos, documents] = await Promise.all([
        prisma.taxClient.count({ where: { businessId } }),
        prisma.vencimiento.count({ where: { taxClient: { businessId } } }),
        prisma.clientDocument.count({ where: { taxClient: { businessId } } }),
      ]);
      return success(res, {
        productType: 'contable',
        steps: {
          client: clients > 0,
          vencimiento: vencimientos > 0,
          document: documents > 0,
        },
      });
    }

    // POS
    const [products, sales, customers, cashRegisters] = await Promise.all([
      prisma.product.count({ where: { businessId, deletedAt: null } }),
      prisma.sale.count({ where: { branch: { businessId }, deletedAt: null } }),
      prisma.customer.count({ where: { businessId } }),
      prisma.cashRegister.count({ where: { branch: { businessId } } }),
    ]);
    return success(res, {
      productType: 'pos',
      steps: {
        product: products > 0,
        sale: sales > 0,
        customer: customers > 0,
        cashRegister: cashRegisters > 0,
        branding: !!business.logo,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
