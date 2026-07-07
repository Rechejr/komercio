import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { authenticate } from '../middlewares/auth';
import { AppError, success, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';

const router = Router();

router.use(authenticate);
router.use((req: AuthRequest, _res, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') return next(new AppError('Acceso restringido', 403));
  next();
});

router.get('/stats', async (_req, res, next) => {
  try {
    const [totalBusinesses, totalUsers, freePlan, proPlan, salesAgg, recentBusinesses] = await Promise.all([
      prisma.business.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, role: { not: 'SUPER_ADMIN' } } }),
      prisma.business.count({ where: { deletedAt: null, plan: 'free' } }),
      prisma.business.count({ where: { deletedAt: null, plan: 'pro' } }),
      prisma.sale.aggregate({
        where: { deletedAt: null, status: 'COMPLETED' },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.business.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, name: true, plan: true, createdAt: true,
          owner: { select: { email: true, name: true } },
        },
      }),
    ]);

    return success(res, {
      totalBusinesses,
      totalUsers,
      plans: { free: freePlan, pro: proPlan },
      sales: { total: salesAgg._sum.total || 0, count: salesAgg._count.id },
      recentBusinesses,
    });
  } catch (err) { next(err); }
});

router.get('/businesses', async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { search, plan } = req.query;

    const where: any = { deletedAt: null };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (plan) where.plan = plan;

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, plan: true, planExpiresAt: true,
          createdAt: true, city: true,
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { branches: true } },
        },
      }),
      prisma.business.count({ where }),
    ]);

    return paginated(res, businesses, total, page, limit);
  } catch (err) { next(err); }
});

router.patch('/businesses/:id/plan', async (req, res, next) => {
  try {
    const { plan, planExpiresAt } = req.body;

    if (!['free', 'pro'].includes(plan)) throw new AppError('Plan inválido. Use "free" o "pro"', 400);

    const business = await prisma.business.update({
      where: { id: req.params.id },
      data: {
        plan,
        planExpiresAt: planExpiresAt ? new Date(planExpiresAt) : null,
      },
      select: { id: true, name: true, plan: true, planExpiresAt: true },
    });

    return success(res, business, `Plan de "${business.name}" actualizado a ${plan}`);
  } catch (err) { next(err); }
});

router.patch('/businesses/:id/status', async (req, res, next) => {
  try {
    const { active } = req.body;

    const business = await prisma.business.update({
      where: { id: req.params.id },
      data: { deletedAt: active ? null : new Date() },
      select: { id: true, name: true, deletedAt: true },
    });

    return success(res, business, active ? `"${business.name}" activado` : `"${business.name}" desactivado`);
  } catch (err) { next(err); }
});

// Eliminar negocio permanentemente — requiere contraseña del superadmin
router.delete('/businesses/:id', async (req: AuthRequest, res, next) => {
  try {
    const { password } = req.body;
    if (!password) throw new AppError('Se requiere la contraseña para confirmar', 400);

    // Verificar contraseña del superadmin
    const superAdmin = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { password: true },
    });
    if (!superAdmin || !(await bcrypt.compare(password, superAdmin.password))) {
      throw new AppError('Contraseña incorrecta', 401);
    }

    const business = await prisma.business.findUnique({
      where: { id: req.params.id },
      include: { branches: { select: { id: true } } },
    });
    if (!business) throw new AppError('Negocio no encontrado', 404);

    const businessId = req.params.id;
    const branchIds = business.branches.map((b) => b.id);

    // Recoger IDs de usuarios del negocio para limpiar audit_logs antes de borrarlos
    // (AuditLog.userId no tiene onDelete: Cascade → PostgreSQL bloquea el delete)
    const staffUsers = branchIds.length > 0
      ? await prisma.user.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })
      : [];
    const allUserIds = [...staffUsers.map((u) => u.id), business.ownerId];

    await prisma.$transaction(async (tx) => {
      // 1. Pagos de créditos
      await tx.creditPayment.deleteMany({ where: { credit: { customer: { businessId } } } });
      // 2. Créditos
      await tx.credit.deleteMany({ where: { customer: { businessId } } });
      // 3-5. Caja
      if (branchIds.length > 0) {
        await tx.cashMovement.deleteMany({ where: { cashRegister: { branchId: { in: branchIds } } } });
        await tx.cashRegister.deleteMany({ where: { branchId: { in: branchIds } } });
        await tx.saleNumberCounter.deleteMany({ where: { branchId: { in: branchIds } } });
      }
      // 6. Movimientos de inventario (FK productId requerido sin cascade)
      await tx.inventoryMovement.deleteMany({ where: { product: { businessId } } });
      // 7. Ventas (SaleDetail.productId FK requerido sin cascade → antes de productos)
      if (branchIds.length > 0) {
        await tx.saleDetail.deleteMany({ where: { sale: { branchId: { in: branchIds } } } });
        await tx.sale.deleteMany({ where: { branchId: { in: branchIds } } });
      }
      // 8. Compras (PurchaseDetail.productId FK requerido sin cascade → antes de productos)
      await tx.purchaseDetail.deleteMany({ where: { purchase: { businessId } } });
      await tx.purchase.deleteMany({ where: { businessId } });
      // 9. Productos (ahora sin referencias pendientes)
      await tx.product.deleteMany({ where: { businessId } });
      // 10. Gastos
      await tx.expense.deleteMany({ where: { businessId } });
      await tx.expenseCategory.deleteMany({ where: { businessId } });
      // 11. Clientes, proveedores, categorías, marcas
      await tx.customer.deleteMany({ where: { businessId } });
      await tx.supplier.deleteMany({ where: { businessId } });
      await tx.category.deleteMany({ where: { businessId } });
      await tx.brand.deleteMany({ where: { businessId } });
      // 12. AuditLog: userId nullable sin cascade → poner null para no bloquear delete de usuarios
      await tx.auditLog.updateMany({ where: { userId: { in: allUserIds } }, data: { userId: null } });
      // 13. Usuarios staff — excluir el owner (tiene negocio con FK; se borra en paso 16)
      if (branchIds.length > 0) {
        await tx.user.deleteMany({ where: { branchId: { in: branchIds }, id: { not: business.ownerId } } });
      }
      // 14. Sucursales
      await tx.branch.deleteMany({ where: { businessId } });
      // 15. Negocio (libera FK Business.ownerId → User)
      await tx.business.delete({ where: { id: businessId } });
      // 16. Owner
      await tx.user.delete({ where: { id: business.ownerId } });
    });

    return success(res, null, `Negocio "${business.name}" eliminado permanentemente`);
  } catch (err) { next(err); }
});

export default router;
