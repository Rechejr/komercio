import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';

// Los ítems de la cotización se guardan como JSON (snapshot). Se recalculan los
// totales en el servidor a partir de los ítems — nunca se confía en el total
// que mande el cliente.
interface QuoteItem {
  productId?: string;
  productVariantId?: string;
  name: string;
  code?: string;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxRate?: number;
  variantLabel?: string;
}

function computeTotals(items: QuoteItem[]) {
  let subtotal = 0, discountAmount = 0, taxAmount = 0, total = 0;
  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unitPrice) || 0;
    const disc = Number(it.discountPct) || 0;
    const tax = Number(it.taxRate) || 0;
    const lineSub = price * qty;
    const lineDisc = lineSub * (disc / 100);
    const afterDisc = lineSub - lineDisc;
    const lineTax = afterDisc * (tax / 100);
    subtotal += lineSub;
    discountAmount += lineDisc;
    taxAmount += lineTax;
    total += afterDisc + lineTax;
  }
  return { subtotal, discountAmount, taxAmount, total };
}

export const quoteController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { page, limit, skip } = getPagination(req);
      const status = req.query.status as string | undefined;

      const where: { businessId: string; deletedAt: null; status?: string } = { businessId, deletedAt: null };
      if (status) where.status = status;

      const [quotes, total] = await Promise.all([
        prisma.quote.findMany({
          where, skip, take: limit, orderBy: { createdAt: 'desc' },
          select: {
            id: true, number: true, customerName: true, total: true, status: true,
            validUntil: true, createdAt: true, items: true,
          },
        }),
        prisma.quote.count({ where }),
      ]);

      // En el listado no hace falta el detalle de ítems, solo cuántos son.
      const data = quotes.map(({ items, ...q }) => ({ ...q, itemCount: Array.isArray(items) ? (items as unknown[]).length : 0 }));
      return paginated(res, data, total, page, limit);
    } catch (err) { next(err); }
  },

  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const quote = await prisma.quote.findFirst({ where: { id: req.params.id, businessId, deletedAt: null } });
      if (!quote) throw new AppError('Cotización no encontrada', 404);
      // Teléfono del cliente (para el envío por WhatsApp). customerId es id suelto,
      // sin relación Prisma, así que se resuelve en un query aparte.
      let customerPhone: string | null = null;
      if (quote.customerId) {
        const cust = await prisma.customer.findFirst({ where: { id: quote.customerId, businessId }, select: { phone: true } });
        customerPhone = cust?.phone ?? null;
      }
      return success(res, { ...quote, customerPhone });
    } catch (err) { next(err); }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { customerId, customerName, items, notes, validUntil } = req.body as {
        customerId?: string; customerName?: string; items?: QuoteItem[]; notes?: string; validUntil?: string;
      };

      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError('La cotización debe tener al menos un producto', 400);
      }
      for (const it of items) {
        if (!it.name?.trim()) throw new AppError('Cada ítem debe tener un nombre', 400);
        if (Number(it.quantity) <= 0) throw new AppError('Las cantidades deben ser mayores a 0', 400);
        if (Number(it.unitPrice) < 0) throw new AppError('Los precios no pueden ser negativos', 400);
      }

      const totals = computeTotals(items);
      // Número correlativo por negocio (incluye borradas para no reutilizar).
      const count = await prisma.quote.count({ where: { businessId } });
      const number = `COT-${String(count + 1).padStart(4, '0')}`;

      const quote = await prisma.quote.create({
        data: {
          businessId,
          branchId: req.user!.branchId || null,
          number,
          customerId: customerId || null,
          customerName: customerName || null,
          items: items as never,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          notes: notes || null,
          validUntil: validUntil ? new Date(validUntil) : null,
          createdById: req.user!.userId,
        },
      });
      return created(res, quote, 'Cotización creada');
    } catch (err) { next(err); }
  },

  // Marca la cotización como convertida (la venta en sí se hace en el POS, que se
  // pre-llena con estos ítems desde el frontend).
  async markConverted(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { count } = await prisma.quote.updateMany({
        where: { id: req.params.id, businessId, deletedAt: null },
        data: { status: 'CONVERTED' },
      });
      if (count === 0) throw new AppError('Cotización no encontrada', 404);
      return success(res, null, 'Cotización marcada como convertida');
    } catch (err) { next(err); }
  },

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { count } = await prisma.quote.updateMany({
        where: { id: req.params.id, businessId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new AppError('Cotización no encontrada', 404);
      return success(res, null, 'Cotización eliminada');
    } catch (err) { next(err); }
  },
};
