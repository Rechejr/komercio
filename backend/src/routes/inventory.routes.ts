import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { success, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';

const router = Router();
router.use(authenticate);

router.get('/movements', async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { productId, type } = req.query;
    const businessId = req.user!.businessId;

    const where: any = { product: { businessId } };
    if (productId) where.productId = productId;
    if (type) where.type = type;

    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { product: { select: { id: true, name: true, code: true } } },
      }),
      prisma.inventoryMovement.count({ where }),
    ]);
    return paginated(res, movements, total, page, limit);
  } catch (err) { next(err); }
});

router.get('/valuation', async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.businessId;
    const result = await prisma.$queryRaw<[{ total_cost: number; total_sale: number; count: bigint }]>`
      SELECT
        SUM("costPrice" * stock) as total_cost,
        SUM("salePrice" * stock) as total_sale,
        COUNT(*) as count
      FROM products
      WHERE "deletedAt" IS NULL
        AND "isActive" = true
        AND "businessId" = ${businessId}
    `;
    return success(res, {
      totalCostValue: Number(result[0]?.total_cost || 0),
      totalSaleValue: Number(result[0]?.total_sale || 0),
      totalProducts: Number(result[0]?.count || 0),
    });
  } catch (err) { next(err); }
});

export default router;
