import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../config/database';
import { authenticate } from '../middlewares/auth';
import { AppError, success, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';
import { PLAN_PRICES, CONTABLE_ANNUAL_PRICE } from '../controllers/payment.controller';
import { planDesdeMonto, planDesdeDuracion, COMMISSION_RATE, ANNUAL_CAP } from '../utils/comision';

const router = Router();

router.use(authenticate);
router.use((req: AuthRequest, _res, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') return next(new AppError('Acceso restringido', 403));
  next();
});

// Borrado de negocio es destructivo e irreversible — un tope bajo (aparte del
// límite general de /api) reduce el daño de una sesión de superadmin
// comprometida o un doble-click accidental en un script.
const deleteBusinessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1_000 : 5,
  keyGenerator: (req: any) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de borrado. Espere 15 minutos antes de reintentar.' },
});

router.get('/stats', async (_req, res, next) => {
  try {
    const [totalBusinesses, totalUsers, freePlan, proPlan, posCount, contableCount, salesAgg, recentBusinesses] = await Promise.all([
      prisma.business.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, role: { not: 'SUPER_ADMIN' } } }),
      prisma.business.count({ where: { deletedAt: null, plan: 'free' } }),
      prisma.business.count({ where: { deletedAt: null, plan: 'pro' } }),
      prisma.business.count({ where: { deletedAt: null, type: 'pos' } }),
      prisma.business.count({ where: { deletedAt: null, type: 'contable' } }),
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
          id: true, name: true, type: true, plan: true, createdAt: true,
          owner: { select: { email: true, name: true } },
        },
      }),
    ]);

    // ── Métricas de negocio (suscripciones) ──
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [proActive, proExpiring7, consumedLinks] = await Promise.all([
      // Pro vigentes: plan pro y no vencidos (o sin fecha = vitalicio).
      prisma.business.count({ where: { deletedAt: null, plan: 'pro', OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }] } }),
      // Pro que vencen en los próximos 7 días (oportunidad de retención).
      prisma.business.count({ where: { deletedAt: null, plan: 'pro', planExpiresAt: { gte: now, lte: in7 } } }),
      // Pagos consumidos (para ingresos). El precio se deriva del periodo y el
      // tipo de negocio (contable = plan anual único).
      prisma.paymentLink.findMany({
        where: { consumedAt: { not: null } },
        select: { period: true, consumedAt: true, business: { select: { name: true, type: true } } },
        orderBy: { consumedAt: 'desc' },
      }),
    ]);

    const priceOf = (period: string, type: string) => type === 'contable' ? CONTABLE_ANNUAL_PRICE : (PLAN_PRICES[period] || 0);
    let revenueTotal = 0, revenueMonth = 0;
    for (const l of consumedLinks) {
      const amt = priceOf(l.period, l.business.type);
      revenueTotal += amt;
      if (l.consumedAt && l.consumedAt >= monthStart) revenueMonth += amt;
    }
    const recentPayments = consumedLinks.slice(0, 8).map((l) => ({
      business: l.business.name, type: l.business.type, period: l.period,
      amount: priceOf(l.period, l.business.type), date: l.consumedAt,
    }));

    const conversion = totalBusinesses > 0 ? Math.round((proActive / totalBusinesses) * 100) : 0;

    return success(res, {
      totalBusinesses,
      totalUsers,
      plans: { free: freePlan, pro: proPlan },
      types: { pos: posCount, contable: contableCount },
      sales: { total: salesAgg._sum.total || 0, count: salesAgg._count.id },
      recentBusinesses,
      subscriptions: {
        revenueTotal, revenueMonth, proActive, proExpiring7, conversion, recentPayments,
        payingCount: consumedLinks.length,
      },
    });
  } catch (err) { next(err); }
});

router.get('/businesses', async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { search, plan, type } = req.query;

    const where: any = { deletedAt: null };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (plan) where.plan = plan;
    if (type === 'pos' || type === 'contable') where.type = type;

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, type: true, plan: true, planExpiresAt: true,
          createdAt: true, city: true,
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { branches: true } },
        },
      }),
      prisma.business.count({ where }),
    ]);

    // Actividad por negocio (para ver cuáles se usan a diario y cuáles están
    // dormidas): última conexión de cualquier usuario + ventas de los últimos
    // 30 días. Se calcula en lote para la página actual (pocas consultas extra).
    const bizIds = businesses.map((b) => b.id);
    const branches = await prisma.branch.findMany({
      where: { businessId: { in: bizIds } },
      select: { id: true, businessId: true },
    });
    const branchToBiz = new Map(branches.map((br) => [br.id, br.businessId]));

    const users = await prisma.user.findMany({
      where: { branch: { businessId: { in: bizIds } }, lastLogin: { not: null } },
      select: { lastLogin: true, branch: { select: { businessId: true } } },
    });
    const lastLoginByBiz = new Map<string, Date>();
    for (const u of users) {
      const bid = u.branch?.businessId;
      if (!bid || !u.lastLogin) continue;
      const cur = lastLoginByBiz.get(bid);
      if (!cur || u.lastLogin > cur) lastLoginByBiz.set(bid, u.lastLogin);
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const salesGrouped = branches.length > 0
      ? await prisma.sale.groupBy({
          by: ['branchId'],
          where: { branchId: { in: branches.map((b) => b.id) }, createdAt: { gte: since }, deletedAt: null },
          _count: { id: true },
        })
      : [];
    const salesByBiz = new Map<string, number>();
    for (const s of salesGrouped) {
      const bid = branchToBiz.get(s.branchId);
      if (!bid) continue;
      salesByBiz.set(bid, (salesByBiz.get(bid) || 0) + s._count.id);
    }

    const enriched = businesses.map((b) => ({
      ...b,
      lastLogin: lastLoginByBiz.get(b.id) ?? null,
      salesLast30: salesByBiz.get(b.id) ?? 0,
    }));

    return paginated(res, enriched, total, page, limit);
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
router.delete('/businesses/:id', deleteBusinessLimiter, async (req: AuthRequest, res, next) => {
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

    // El dueño puede tener OTRO negocio (POS + Contable con el mismo login). Si es
    // así, no se borra su usuario: solo se le mueve la sucursal asignada al otro
    // negocio (para no violar el FK al borrar las sucursales de este) y conserva
    // su otra cuenta intacta.
    const ownerOtherBusiness = await prisma.business.findFirst({
      where: { ownerId: business.ownerId, id: { not: businessId }, deletedAt: null },
      select: { branches: { select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
    });

    await prisma.$transaction(async (tx) => {
      // 1. Pagos de créditos
      await tx.creditPayment.deleteMany({ where: { credit: { customer: { businessId } } } });
      // 2. Créditos
      await tx.credit.deleteMany({ where: { customer: { businessId } } });
      // 2.5. Cuentas por pagar (crédito a proveedor) — FK RESTRICT hacia suppliers/
      // businesses; van antes que proveedores y compras. Los pagos cascadean.
      await tx.supplierCreditPayment.deleteMany({ where: { supplierCredit: { businessId } } });
      await tx.supplierCredit.deleteMany({ where: { businessId } });
      // 3-5. Caja
      if (branchIds.length > 0) {
        await tx.cashMovement.deleteMany({ where: { cashRegister: { branchId: { in: branchIds } } } });
        await tx.cashRegister.deleteMany({ where: { branchId: { in: branchIds } } });
        await tx.saleNumberCounter.deleteMany({ where: { branchId: { in: branchIds } } });
      }
      // 6. Movimientos de inventario (FK productId requerido sin cascade)
      await tx.inventoryMovement.deleteMany({ where: { product: { businessId } } });
      // 6.5. Devoluciones (nota crédito) — FK RESTRICT hacia sales; deben irse antes
      // que las ventas. Sus return_details caen en cascada.
      if (branchIds.length > 0) {
        await tx.return.deleteMany({ where: { branchId: { in: branchIds } } });
      }
      // 7. Ventas (SaleDetail.productId FK requerido sin cascade → antes de productos)
      if (branchIds.length > 0) {
        await tx.saleDetail.deleteMany({ where: { sale: { branchId: { in: branchIds } } } });
        await tx.sale.deleteMany({ where: { branchId: { in: branchIds } } });
      }
      // 8. Compras (PurchaseDetail.productId FK requerido sin cascade → antes de productos)
      await tx.purchaseDetail.deleteMany({ where: { purchase: { businessId } } });
      await tx.purchase.deleteMany({ where: { businessId } });
      // 8.5. Transferencias entre bodegas y stock por bodega — ambas tienen FK
      // RESTRICT hacia products/branches (migración de bodegas del 2026-07-10):
      // sin este paso, el borrado de productos (9) y de sucursales (14) de abajo
      // fallaba para CUALQUIER negocio que hubiera comprado/vendido/ajustado
      // stock alguna vez (prácticamente todos desde esa fecha) — la transacción
      // completa hacía rollback y el superadmin no podía borrar ningún negocio real.
      await tx.stockTransfer.deleteMany({ where: { businessId } }); // cascada a stock_transfer_items
      await tx.productStock.deleteMany({ where: { product: { businessId } } });
      // 9. Productos (ahora sin referencias pendientes)
      await tx.product.deleteMany({ where: { businessId } });
      // 10. Gastos
      await tx.expense.deleteMany({ where: { businessId } });
      await tx.expenseCategory.deleteMany({ where: { businessId } });
      // 10.5. Medios de pago (PaymentAccount) — FK RESTRICT hacia businesses.
      // Los backfilleó una migración para TODOS los negocios, así que sin esto el
      // borrado fallaba (500) para prácticamente cualquier cuenta. Va DESPUÉS de
      // ventas/gastos/caja, que son los que referencian paymentAccountId.
      await tx.paymentAccount.deleteMany({ where: { businessId } });
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
      // 13.5. Si el dueño conserva otro negocio, mover su sucursal asignada a ese
      // otro (evita el FK users.branchId → branches al borrar las de este negocio).
      if (ownerOtherBusiness?.branches[0]) {
        await tx.user.update({ where: { id: business.ownerId }, data: { branchId: ownerOtherBusiness.branches[0].id } });
      }
      // 14. Sucursales
      await tx.branch.deleteMany({ where: { businessId } });
      // 14.5. Links de pago (Wompi) — FK RESTRICT hacia businesses.
      await tx.paymentLink.deleteMany({ where: { businessId } });
      // 14.6. Resúmenes semanales con IA — mismo FK RESTRICT.
      await tx.aiWeeklySummary.deleteMany({ where: { businessId } });
      // 14.7. Contable: clientes del contador — FK RESTRICT hacia businesses. Al
      // borrarlos, cascadean sus vencimientos, resoluciones, responsabilidades y
      // credenciales (onDelete: Cascade). Sin esto, NINGÚN negocio contable con
      // clientes se podía borrar (500).
      await tx.taxClient.deleteMany({ where: { businessId } });
      // 14.8. Cotizaciones — FK RESTRICT hacia businesses.
      await tx.quote.deleteMany({ where: { businessId } });
      // 15. Negocio (libera FK Business.ownerId → User)
      await tx.business.delete({ where: { id: businessId } });
      // 16. Owner — solo si NO conserva otro negocio bajo el mismo login.
      if (!ownerOtherBusiness) {
        await tx.user.delete({ where: { id: business.ownerId } });
      }
    }, {
      // El borrado hace ~25 operaciones en cadena; con el timeout por defecto
      // (5 s) una cuenta con historial —o algo de latencia hacia la base— hacía
      // rollback con P2028 ("Transaction already closed"). Se amplía el margen.
      timeout: 60_000,
      maxWait: 10_000,
    });

    return success(res, null, `Negocio "${business.name}" eliminado permanentemente`);
  } catch (err) { next(err); }
});

// ─── Vendedoras: cuánto vendió cada una y cuánto se le debe ───────────────────
// GET /superadmin/sellers?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Sin fechas, devuelve todo el histórico. Las comisiones se liquidan por mes, así
// que el filtro es sobre la FECHA DE CREACIÓN de la cuenta (cuando se vendió).
router.get('/sellers', async (req: AuthRequest, res, next) => {
  try {
    const desde = req.query.desde ? new Date(String(req.query.desde)) : null;
    const hasta = req.query.hasta ? new Date(String(req.query.hasta)) : null;
    if (hasta) hasta.setHours(23, 59, 59, 999);

    const rango = desde || hasta
      ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } }
      : {};

    const [vendedoras, negocios, compras] = await Promise.all([
      prisma.seller.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, phone: true, active: true },
      }),
      // Solo lo vendido por una vendedora: lo demás no genera comisión.
      prisma.business.findMany({
        where: { createdBySellerId: { not: null }, deletedAt: null, ...rango },
        select: {
          id: true, name: true, type: true, plan: true, createdAt: true,
          planExpiresAt: true, createdBySellerId: true,
          owner: { select: { name: true, email: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // El monto REAL pagado, cuando la venta entró por el link (compra sin
      // cuenta). Para las creadas a mano se deduce de la duración del plan.
      prisma.guestCheckout.findMany({
        where: { status: 'provisioned', businessId: { not: null } },
        select: { businessId: true, amount: true, productType: true },
      }),
    ]);

    const montoPorNegocio = new Map(compras.map((c) => [c.businessId!, c]));

    const ventasPorVendedora = new Map<string, Array<Record<string, unknown>>>();
    for (const b of negocios) {
      const compra = montoPorNegocio.get(b.id);
      const plan = compra
        ? planDesdeMonto(compra.amount, compra.productType)
        : planDesdeDuracion({ type: b.type, createdAt: b.createdAt, planExpiresAt: b.planExpiresAt });

      const lista = ventasPorVendedora.get(b.createdBySellerId!) ?? [];
      lista.push({
        businessId: b.id,
        negocio: b.name,
        producto: b.type === 'contable' ? 'Contable' : 'POS',
        cliente: b.owner?.name ?? '—',
        email: b.owner?.email ?? '',
        celular: b.owner?.phone ?? '',
        periodo: plan.periodo,
        precio: plan.precio,
        comision: plan.comision,
        // De dónde salió la cifra: del pago real o deducida de la duración.
        montoReal: !!compra,
        fecha: b.createdAt,
        plan: b.plan,
        planExpiresAt: b.planExpiresAt,
      });
      ventasPorVendedora.set(b.createdBySellerId!, lista);
    }

    const filas = vendedoras.map((v) => {
      const ventas = ventasPorVendedora.get(v.id) ?? [];
      const facturado = ventas.reduce((a, x) => a + (x.precio as number), 0);
      const comision = ventas.reduce((a, x) => a + (x.comision as number), 0);
      return {
        ...v,
        cuentas: ventas.length,
        facturado,
        comision,
        ultimaVenta: ventas.length ? ventas[0].fecha : null,
        ventas,
      };
    });

    return success(res, {
      vendedoras: filas.sort((a, b) => b.comision - a.comision),
      totales: {
        cuentas: filas.reduce((a, f) => a + f.cuentas, 0),
        facturado: filas.reduce((a, f) => a + f.facturado, 0),
        comision: filas.reduce((a, f) => a + f.comision, 0),
      },
      reglas: { porcentaje: COMMISSION_RATE, topeAnual: ANNUAL_CAP },
    });
  } catch (err) { next(err); }
});

export default router;
