import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';
import { emitToBusinesss, socketEvents } from '../config/socket';
import { notifyLowStockBatch } from '../services/notification.service';

async function generateInvoiceNumber(tx: any, branchId: string | null): Promise<string> {
  // Lock per-branch: concurrent sales in different branches/businesses run in parallel.
  // Falls back to a single global lock if branchId is null (edge case — branchId is always set).
  if (branchId) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${branchId}))`;
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(74296518)`;
  }

  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const prefix = `FAC-${y}${m}${d}-`;

  // Scoped to this branch: each branch has its own independent daily sequence.
  // Invoice numbers are unique within a branch (@@unique([branchId, invoiceNumber]) in schema).
  const last = await tx.sale.findFirst({
    where: { invoiceNumber: { startsWith: prefix }, ...(branchId ? { branchId } : {}) },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  const lastSeq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) : 0;
  const seq = String(lastSeq + 1).padStart(6, '0');
  return `${prefix}${seq}`;
}

export const saleController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const search = getSearch(req);
      const { status, customerId, startDate, endDate, branchId } = req.query;

      const where: any = { deletedAt: null, branch: { businessId: req.user!.businessId } };
      if (search) {
        where.OR = [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }
      if (status) where.status = status;
      if (customerId) where.customerId = customerId;
      if (branchId) where.branchId = branchId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const [sales, total] = await Promise.all([
        prisma.sale.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: { select: { id: true, name: true } },
            user: { select: { id: true, name: true } },
            _count: { select: { details: true } },
            credit: { select: { status: true, balance: true } },
          },
        }),
        prisma.sale.count({ where }),
      ]);

      return paginated(res, sales, total, page, limit);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const sale = await prisma.sale.findFirst({
        where: { id: req.params.id, deletedAt: null, branch: { businessId: req.user!.businessId } },
        include: {
          customer: true,
          user: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          details: {
            include: { product: { select: { id: true, name: true, code: true, unit: true } } },
          },
          credit: true,
        },
      });
      if (!sale) throw new AppError('Venta no encontrada', 404);
      return success(res, sale);
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        customerId,
        branchId,
        items,
        paymentMethod,
        paymentDetails,
        discountAmount = 0,
        notes,
        isCredit = false,
        paidAmount,
      } = req.body;

      if (!items || items.length === 0) throw new AppError('La venta debe tener productos', 400);

      const productIds: string[] = items.map((i: any) => i.productId);

      // Early rejection before acquiring locks — also validates products belong to this business
      const validCount = await prisma.product.count({
        where: { id: { in: productIds }, deletedAt: null, isActive: true, businessId: req.user!.businessId },
      });
      if (validCount !== productIds.length) {
        throw new AppError('Uno o más productos no existen, están inactivos o no pertenecen a este negocio', 400);
      }

      // Validate caller-supplied branchId belongs to this business
      if (branchId && branchId !== req.user!.branchId) {
        const branch = await prisma.branch.findFirst({
          where: { id: branchId, businessId: req.user!.businessId },
          select: { id: true },
        });
        if (!branch) throw new AppError('Sucursal no válida para este negocio', 403);
      }

      const effectiveBranchId = branchId || req.user?.branchId || null;

      // Retry up to 3 times if a concurrent request collides on the invoice number.
      // This can happen under connection-pool transaction-mode (PgBouncer) where
      // session-level advisory locks may not persist across pool hops.
      let result: any;
      let attempt = 0;
      while (true) {
        try {
          result = await prisma.$transaction(async (tx) => {
        // SELECT FOR UPDATE locks these rows for the duration of the transaction.
        // Concurrent sales on the same products will block here until this tx commits,
        // eliminating the check-then-decrement race that allows overselling.
        // Timeout raised to 30s: Neon serverless adds ~200ms per round-trip, so
        // large sales (many products) need more headroom than the 5s default.
        interface LockedProduct {
          id: string; stock: number; name: string; allowNegativeStock: boolean;
          salePrice: number; costPrice: number; taxRate: number; minStock: number;
        }
        // Lock each row individually (sorted order prevents deadlocks).
        // Decimal columns (salePrice, costPrice, taxRate) are returned as strings by the pg
        // driver — ::float8 casts on NUMERIC(65,30) columns cause a Prisma type-resolution
        // error, so we skip the cast and convert with Number() after receiving.
        const lockedProducts: LockedProduct[] = [];
        for (const pid of [...productIds].sort()) {
          const rows = await tx.$queryRawUnsafe<any[]>(
            `SELECT id, stock, name, "allowNegativeStock",
                    "salePrice", "costPrice", "taxRate", "minStock"
             FROM products
             WHERE id::text = $1
               AND "deletedAt" IS NULL AND "isActive" = true
             FOR UPDATE`,
            pid,
          );
          if (rows[0]) {
            const r = rows[0];
            lockedProducts.push({
              id: r.id,
              stock: Number(r.stock),
              name: r.name,
              allowNegativeStock: r.allowNegativeStock,
              salePrice: Number(r.salePrice),
              costPrice: Number(r.costPrice),
              taxRate: Number(r.taxRate),
              minStock: Number(r.minStock),
            });
          }
        }

        // Re-check count: handles concurrent deletion between early check and lock acquisition
        if (lockedProducts.length !== productIds.length) {
          throw new AppError('Uno o más productos no existen o están inactivos', 400);
        }

        const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

        let subtotal = 0;
        let taxAmount = 0;

        const saleDetails = items.map((item: any) => {
          const product = productMap.get(item.productId)!;

          // Stock check uses locked (current) values — no race condition
          if (product.stock < item.quantity && !product.allowNegativeStock) {
            throw new AppError(`Stock insuficiente para: ${product.name}`, 400);
          }

          const lineSubtotal = product.salePrice * item.quantity;
          const lineDiscount = lineSubtotal * ((item.discountPct || 0) / 100);
          const lineNet = lineSubtotal - lineDiscount;
          const lineTax = lineNet * (product.taxRate / 100);

          subtotal += lineNet;
          taxAmount += lineTax;

          return {
            productId: product.id,
            quantity: item.quantity,
            unitPrice: product.salePrice,
            costPrice: product.costPrice,
            discountPct: item.discountPct || 0,
            taxRate: product.taxRate,
            subtotal: lineNet,
            total: lineNet + lineTax,
          };
        });

        const discAmt = parseFloat(discountAmount) || 0;
        if (discAmt < 0) throw new AppError('El descuento no puede ser negativo', 400);

        const total = subtotal + taxAmount - discAmt;
        if (total < 0) throw new AppError('El descuento no puede ser mayor al total de la venta', 400);

        const paid = (paidAmount != null && !isNaN(parseFloat(paidAmount))) ? parseFloat(paidAmount) : total;
        if (paid < 0) throw new AppError('El monto pagado no puede ser negativo', 400);

        const newSale = await tx.sale.create({
          data: {
            invoiceNumber: await generateInvoiceNumber(tx, effectiveBranchId),
            customerId: customerId || null,
            userId: req.user!.userId,
            branchId: effectiveBranchId,
            status: 'COMPLETED',
            subtotal,
            taxAmount,
            discountAmount: discAmt,
            total,
            paidAmount: paid,
            changeAmount: Math.max(0, paid - total),
            paymentMethod: paymentMethod || 'CASH',
            paymentDetails: paymentDetails || null,
            notes: notes || null,
            details: { create: saleDetails },
          },
          include: { details: true },
        });

        // Update stock and record movements
        const lowStockProducts: Array<{ id: string; name: string; stock: number; minStock: number }> = [];
        for (const item of items) {
          const product = productMap.get(item.productId)!;
          const newStock = product.stock - item.quantity;
          await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: item.quantity } } });
          await tx.inventoryMovement.create({
            data: {
              productId: product.id,
              type: 'OUT',
              quantity: item.quantity,
              previousStock: product.stock,
              newStock,
              reason: 'Venta',
              referenceId: newSale.id,
              referenceType: 'SALE',
              unitCost: product.costPrice,
              totalCost: product.costPrice * item.quantity,
            },
          });
          if (newStock <= product.minStock) {
            lowStockProducts.push({ id: product.id, name: product.name, stock: newStock, minStock: product.minStock });
          }
        }

        // Update customer debt if credit sale
        if (isCredit && customerId && total > paid) {
          const balance = total - paid;
          await tx.credit.create({
            data: {
              saleId: newSale.id,
              customerId,
              totalAmount: total,
              paidAmount: paid,
              balance,
              status: 'PENDING',
            },
          });
          await tx.customer.update({
            where: { id: customerId },
            data: { currentDebt: { increment: balance } },
          });
        }

          return { newSale, lowStockProducts };
          }, { timeout: 30000 });
          break; // success — exit retry loop
        } catch (err: any) {
          const isInvoiceCollision =
            err?.code === 'P2002' &&
            (err?.meta?.target as string[] | undefined)?.some((f: string) => f.includes('invoiceNumber'));
          if (isInvoiceCollision && attempt < 2) {
            attempt++;
            continue;
          }
          throw err;
        }
      }

      const { newSale: sale, lowStockProducts } = result;

      // Registrar ingreso en caja abierta para ventas en efectivo (best effort)
      try {
        if ((paymentMethod === 'CASH' || !paymentMethod) && sale.branchId) {
          const netCash = Number(sale.paidAmount) - Number(sale.changeAmount);
          if (netCash > 0) {
            const openRegister = await prisma.cashRegister.findFirst({
              where: { branchId: sale.branchId, status: 'OPEN' },
            });
            if (openRegister) {
              await prisma.cashMovement.create({
                data: {
                  cashRegisterId: openRegister.id,
                  type: 'IN',
                  amount: netCash,
                  description: `Venta ${sale.invoiceNumber}`,
                  referenceId: sale.id,
                },
              });
            }
          }
        }
      } catch {
        // El movimiento de caja no debe fallar la venta
      }

      const businessId = req.user?.businessId;
      if (businessId) {
        emitToBusinesss(businessId, socketEvents.NEW_SALE, { sale });
        for (const product of lowStockProducts) {
          emitToBusinesss(businessId, socketEvents.LOW_STOCK_ALERT, { product });
        }
        if (lowStockProducts.length > 0) {
          await notifyLowStockBatch(businessId, lowStockProducts).catch(() => {});
        }
        await cache.del(`dashboard:${businessId}`);
      }

      return created(res, sale, 'Venta registrada exitosamente');
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const sale = await prisma.sale.findFirst({
        where: { id, deletedAt: null, branch: { businessId: req.user!.businessId } },
        include: { details: true },
      });
      if (!sale) throw new AppError('Venta no encontrada', 404);
      if (sale.status === 'CANCELLED') throw new AppError('La venta ya fue anulada', 400);

      await prisma.$transaction(async (tx) => {
        await tx.sale.update({ where: { id }, data: { status: 'CANCELLED', notes: reason } });

        // 1. Revert stock
        interface CancelProductRow { id: string; stock: number; }
        for (const detail of sale.details) {
          // Lock row — ensures previousStock/newStock in the movement log reflects reality
          // even if a concurrent sale updated stock between the outer findFirst and now
          const [locked] = await tx.$queryRawUnsafe<CancelProductRow[]>(
            'SELECT id, stock FROM products WHERE id::text = $1 FOR UPDATE',
            detail.productId,
          );
          if (!locked) continue;
          const newStock = locked.stock + detail.quantity;
          await tx.product.update({ where: { id: detail.productId }, data: { stock: { increment: detail.quantity } } });
          await tx.inventoryMovement.create({
            data: {
              productId: detail.productId,
              type: 'IN',
              quantity: detail.quantity,
              previousStock: locked.stock,
              newStock,
              reason: `Anulación venta ${sale.invoiceNumber}`,
              referenceId: id,
              referenceType: 'SALE_CANCEL',
              // Restaura al costo histórico guardado en el detalle de la venta
              unitCost: detail.costPrice,
              totalCost: Number(detail.costPrice) * detail.quantity,
            },
          });
        }

        // 2. Revert credit if it was a credit sale — cancels phantom debt on customer
        const credit = await tx.credit.findUnique({ where: { saleId: id } });
        if (credit) {
          await tx.customer.update({
            where: { id: credit.customerId },
            data: { currentDebt: { decrement: credit.balance } },
          });
          await tx.credit.update({
            where: { id: credit.id },
            data: { status: 'PAID', balance: 0, paidAmount: credit.totalAmount },
          });
        }

        // 3. Revert cash movement only for CASH sales — other methods never created a movement
        if (sale.branchId && (sale.paymentMethod === 'CASH' || !sale.paymentMethod)) {
          const netCash = Number(sale.paidAmount) - Number(sale.changeAmount);
          if (netCash > 0) {
            const openRegister = await tx.cashRegister.findFirst({
              where: { branchId: sale.branchId, status: 'OPEN' },
            });
            if (openRegister) {
              await tx.cashMovement.create({
                data: {
                  cashRegisterId: openRegister.id,
                  type: 'OUT',
                  amount: netCash,
                  description: `Anulación venta ${sale.invoiceNumber}`,
                  referenceId: id,
                },
              });
            }
          }
        }
      }, { timeout: 30000 });

      await cache.del(`dashboard:${req.user!.businessId}`);

      return success(res, null, 'Venta anulada');
    } catch (err) {
      next(err);
    }
  },

  async permanentDelete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const sale = await prisma.sale.findFirst({
        where: { id, branch: { businessId: req.user!.businessId } },
      });
      if (!sale) throw new AppError('Venta no encontrada', 404);
      if (sale.status !== 'CANCELLED') {
        throw new AppError('Solo se pueden eliminar permanentemente ventas anuladas', 400);
      }
      await prisma.$transaction(async (tx) => {
        await tx.credit.deleteMany({ where: { saleId: id } });
        await tx.inventoryMovement.deleteMany({ where: { referenceId: id } });
        await tx.saleDetail.deleteMany({ where: { saleId: id } });
        await tx.sale.delete({ where: { id } });
      });
      return success(res, null, 'Venta eliminada permanentemente');
    } catch (err) { next(err); }
  },

  async getDailySummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const sales = await prisma.sale.aggregate({
        where: {
          createdAt: { gte: today, lt: tomorrow },
          status: 'COMPLETED',
          branch: { businessId: req.user!.businessId },
        },
        _sum: { total: true, taxAmount: true, discountAmount: true },
        _count: { id: true },
      });

      return success(res, {
        total: sales._sum.total || 0,
        count: sales._count.id || 0,
        taxes: sales._sum.taxAmount || 0,
        discounts: sales._sum.discountAmount || 0,
      });
    } catch (err) {
      next(err);
    }
  },
};
