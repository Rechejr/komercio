import { Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { parseBogotaBoundary, bogotaDayStart, bogotaMonthStart } from '../utils/bogotaTime';
import { AuthRequest } from '../middlewares/auth';
import { emitToBusinesss, socketEvents } from '../config/socket';
import { notifyLowStockBatch } from '../services/notification.service';
import { getPlan } from '../config/plans';
import { acquirePlanLimitLock } from '../utils/planLimitLock';
import { logger } from '../config/logger';
import { resolveEffectiveBranchId } from '../utils/resolveBranch';
import { resolvePayment } from '../utils/paymentAccount';

// Checked once per process on first sale; avoids breaking when migration is pending.
let _counterTableReady: boolean | undefined;
async function counterTableReady(): Promise<boolean> {
  if (_counterTableReady !== undefined) return _counterTableReady;
  try {
    await prisma.$executeRaw`SELECT 1 FROM "sale_number_counters" LIMIT 0`;
    _counterTableReady = true;
  } catch {
    _counterTableReady = false;
  }
  return _counterTableReady;
}

// Suma únicamente los splits en efectivo (puede haber más de uno) para pagos MIXED;
// para CASH/sin método usa el neto recibido. Se comparte entre create() y cancel()
// para que el registro y la reversión de caja siempre queden en sincronía.
// El vuelto SIEMPRE sale del cajón de efectivo (no se puede "devolver" en tarjeta/
// transferencia), así que se resta del total en efectivo — sin esto, un pago mixto
// con sobrepago en efectivo (ej. $70.000 en efectivo para un total de $60.000, el
// POS sí permite y muestra "Cambio" en este caso) inflaba la caja en el valor del
// vuelto en cada venta así.
function computeCashAmount(
  paymentMethod: string | null | undefined,
  paidAmount: number,
  changeAmount: number,
  paymentDetails: any,
): number {
  if (paymentMethod === 'MIXED') {
    const splits: Array<{ method: string; amount: number }> = paymentDetails?.splits || [];
    const cashSplits = splits
      .filter((s) => s.method === 'CASH')
      .reduce((sum, s) => sum + Number(s.amount), 0);
    return Math.max(0, cashSplits - changeAmount);
  }
  if (paymentMethod === 'CASH' || !paymentMethod) {
    return paidAmount - changeAmount;
  }
  return 0;
}

const VALID_PAYMENT_METHODS = ['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD'];

// COP no maneja centavos en la práctica (formatCurrency ya muestra 0 decimales);
// redondear cada línea antes de sumar evita que el binario de punto flotante
// acumule diferencias de centavos entre varias líneas con IVA/descuento.
const roundCOP = (n: number) => Math.round(n);

async function generateInvoiceNumber(tx: any, branchId: string): Promise<string> {
  const coDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const y = coDate.getFullYear();
  const m = String(coDate.getMonth() + 1).padStart(2, '0');
  const d = String(coDate.getDate()).padStart(2, '0');
  const prefix = `FAC-${y}${m}${d}-`;

  if (await counterTableReady()) {
    // Atomic counter: INSERT ... ON CONFLICT ... DO UPDATE RETURNING is serialized
    // by PostgreSQL row-level locking; eliminates collisions even with Neon pooling.
    // Both INSERT and DO UPDATE use GREATEST(counter+1, max_existing_seq+1) so that
    // sales created via the advisory-lock fallback (before migration ran) never collide,
    // even if the counter already has a stale entry from a previous failed attempt.
    const prefixLen = prefix.length;
    const rows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
      INSERT INTO "sale_number_counters" ("branchId", "dayPrefix", "lastSeq")
      VALUES (
        ${branchId},
        ${prefix},
        COALESCE((
          SELECT MAX(CAST(SUBSTRING("invoiceNumber" FROM ${Prisma.raw(String(prefixLen + 1))}) AS INTEGER))
          FROM "sales"
          WHERE "invoiceNumber" LIKE ${prefix + '%'} AND "branchId" = ${branchId}
        ), 0) + 1
      )
      ON CONFLICT ("branchId", "dayPrefix")
      DO UPDATE SET "lastSeq" = GREATEST(
        "sale_number_counters"."lastSeq" + 1,
        COALESCE((
          SELECT MAX(CAST(SUBSTRING("invoiceNumber" FROM ${Prisma.raw(String(prefixLen + 1))}) AS INTEGER))
          FROM "sales"
          WHERE "invoiceNumber" LIKE ${prefix + '%'} AND "branchId" = ${branchId}
        ), 0) + 1
      )
      RETURNING "lastSeq"
    `;
    return `${prefix}${String(rows[0].lastSeq).padStart(6, '0')}`;
  }

  // Fallback while migration 20260705200000 is pending: scan committed sales.
  // Called with prisma (auto-commit) since generateInvoiceNumber runs outside any tx.
  // pg_advisory_xact_lock is omitted: it would release immediately in auto-commit mode
  // and offer no mutual exclusion. The retry loop in saleController.create handles P2002.
  const last = await tx.sale.findFirst({
    where: { invoiceNumber: { startsWith: prefix }, branchId },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastSeq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(6, '0')}`;
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
        // Rango por día de COLOMBIA (no UTC): con `new Date(fecha)` se colaban
        // ventas del día anterior/siguiente. parseBogotaBoundary alinea el corte a
        // medianoche/fin-de-día de Bogotá (antes 'end' ni siquiera llegaba al final
        // del día → excluía casi todo el último día).
        where.createdAt = {};
        const start = parseBogotaBoundary(startDate, 'start');
        const end = parseBogotaBoundary(endDate, 'end');
        if (start) where.createdAt.gte = start;
        if (end) where.createdAt.lte = end;
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
          returns: { include: { details: true }, orderBy: { createdAt: 'desc' } },
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
        priceList = 'retail',
      } = req.body;

      // Lista de precios de la venta: 'wholesale' usa el precio mayorista de cada
      // producto (si tiene y es > 0; si no, cae al precio de venta normal).
      const useWholesale = priceList === 'wholesale';

      if (!items || items.length === 0) throw new AppError('La venta debe tener productos', 400);
      if (isCredit && !customerId) throw new AppError('Se requiere un cliente para registrar una venta a crédito', 400);

      // Sin esto, un cliente de la API (o un bug de frontend) podía mandar splits que
      // no sumaran lo mismo que paidAmount — el movimiento de caja usa los splits, así
      // que quedaría completamente desconectado del dinero real recibido. Se valida
      // antes de tocar la base de datos (no depende del total, que se calcula más
      // adelante con los precios ya bloqueados).
      if (paymentMethod === 'MIXED') {
        const splits = paymentDetails?.splits;
        if (!Array.isArray(splits) || splits.length === 0) {
          throw new AppError('Un pago mixto requiere al menos un método de pago', 400);
        }
        let splitsSum = 0;
        for (const s of splits) {
          if (!VALID_PAYMENT_METHODS.includes(s?.method)) {
            throw new AppError('Método de pago inválido en el pago mixto', 400);
          }
          const amt = Number(s?.amount);
          if (!isFinite(amt) || amt <= 0) {
            throw new AppError('Monto inválido en el pago mixto', 400);
          }
          splitsSum += amt;
        }
        const declaredPaid = paidAmount != null ? parseFloat(paidAmount) : NaN;
        if (isNaN(declaredPaid)) {
          throw new AppError('Un pago mixto requiere indicar el monto pagado', 400);
        }
        // Redondeo de COP (sin centavos) — 1 de tolerancia por acumulación binaria.
        if (Math.abs(splitsSum - declaredPaid) > 1) {
          throw new AppError('La suma de los métodos de pago no coincide con el monto pagado', 400);
        }
      }

      // Medio de pago configurable (single-method). El MIXTO conserva su flujo
      // actual (splits por enum): paymentMethod = 'MIXED', sin paymentAccountId.
      let effectivePaymentMethod: string = paymentMethod || 'CASH';
      let effectivePaymentAccountId: string | null = null;
      if (paymentMethod !== 'MIXED') {
        const resolved = await resolvePayment(
          { paymentAccountId: req.body.paymentAccountId, paymentMethod },
          req.user!.businessId!,
        );
        effectivePaymentMethod = resolved.paymentMethod;
        effectivePaymentAccountId = resolved.paymentAccountId;
      }

      const productIds: string[] = items.map((i: any) => i.productId);

      // Early rejection before acquiring locks — also validates products belong to this business
      const validCount = await prisma.product.count({
        where: { id: { in: productIds }, deletedAt: null, isActive: true, businessId: req.user!.businessId },
      });
      if (validCount !== productIds.length) {
        throw new AppError('Uno o más productos no existen, están inactivos o no pertenecen a este negocio', 400);
      }

      const effectiveBranchId = await resolveEffectiveBranchId(prisma, req, branchId);

      // sale_number_counters guarantees uniqueness atomically; retry loop kept as
      // a safety net for unrelated P2002 collisions (e.g. concurrent product lock timeouts).
      let result: any;
      let attempt = 0;
      while (true) {
        try {
          // Reserve invoice number BEFORE the main transaction using prisma (auto-commit).
          // If the tx fails (P2002 or any other error) and rolls back, the counter stays
          // incremented — the next retry calls this again and gets a strictly higher seq.
          const invoiceNumber = await generateInvoiceNumber(prisma, effectiveBranchId);

          result = await prisma.$transaction(async (tx) => {
        // Recuento atómico de ventas del mes — el middleware planLimit.salesPerMonth()
        // ya rechazó el caso normal, pero su count()-then-allow no es atómico (ver
        // planLimitLock.ts). El advisory lock serializa esta sección contra otra
        // venta concurrente del mismo negocio antes de confiar en el conteo.
        await acquirePlanLimitLock(tx, req.user!.businessId!, 'salesPerMonth');
        const biz = await tx.business.findUnique({ where: { id: req.user!.businessId! }, select: { plan: true, planExpiresAt: true } });
        if (biz) {
          const effectivePlan = biz.plan === 'pro' && biz.planExpiresAt && biz.planExpiresAt < new Date() ? 'free' : biz.plan;
          const limits = getPlan(effectivePlan);
          if (limits.salesPerMonth !== Infinity) {
            const monthStart = bogotaMonthStart(new Date());
            const branchIds = (await tx.branch.findMany({ where: { businessId: req.user!.businessId! }, select: { id: true } })).map((b) => b.id);
            const salesCount = await tx.sale.count({
              where: { branchId: { in: branchIds }, createdAt: { gte: monthStart }, deletedAt: null },
            });
            if (salesCount >= limits.salesPerMonth) {
              throw new AppError(`Límite de ${limits.salesPerMonth} ventas por mes alcanzado en el plan gratuito. Actualiza a Pro para continuar.`, 403);
            }
          }
        }

        // SELECT FOR UPDATE locks these rows for the duration of the transaction.
        // Concurrent sales on the same products will block here until this tx commits,
        // eliminating the check-then-decrement race that allows overselling.
        // Timeout raised to 30s: Neon serverless adds ~200ms per round-trip, so
        // large sales (many products) need more headroom than the 5s default.
        interface LockedProduct {
          id: string; stock: number; name: string; allowNegativeStock: boolean;
          salePrice: number; wholesalePrice: number | null; costPrice: number; taxRate: number; minStock: number;
          lowStockNotifiedAt: Date | null; hasVariants: boolean;
        }
        // Lock each row individually (sorted order prevents deadlocks).
        // Decimal columns (salePrice, costPrice, taxRate) are returned as strings by the pg
        // driver — ::float8 casts on NUMERIC(65,30) columns cause a Prisma type-resolution
        // error, so we skip the cast and convert with Number() after receiving.
        const lockedProducts: LockedProduct[] = [];
        // Stock real por bodega — la fila puede no existir aún para este producto
        // en esta bodega (nunca se le asignó nada aquí); el INSERT ... ON CONFLICT
        // la crea en 0 y la bloquea en el mismo paso, mismo patrón de "contador
        // atómico" que ya usa generateInvoiceNumber() más arriba en este archivo.
        const branchStockByProduct = new Map<string, number>();
        for (const pid of [...productIds].sort()) {
          const rows = await tx.$queryRawUnsafe<any[]>(
            `SELECT id, stock, name, "allowNegativeStock",
                    "salePrice", "wholesalePrice", "costPrice", "taxRate", "minStock", "lowStockNotifiedAt", "hasVariants"
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
              wholesalePrice: r.wholesalePrice != null ? Number(r.wholesalePrice) : null,
              costPrice: Number(r.costPrice),
              taxRate: Number(r.taxRate),
              minStock: Number(r.minStock),
              lowStockNotifiedAt: r.lowStockNotifiedAt,
              hasVariants: r.hasVariants,
            });

            const [psRow] = await tx.$queryRawUnsafe<any[]>(
              `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, 0, now(), now())
               ON CONFLICT ("productId", "branchId") DO UPDATE SET "updatedAt" = product_stocks."updatedAt"
               RETURNING stock`,
              randomUUID(), pid, effectiveBranchId,
            );
            branchStockByProduct.set(pid, Number(psRow.stock));
          }
        }

        // Re-check count: handles concurrent deletion between early check and lock acquisition
        if (lockedProducts.length !== productIds.length) {
          throw new AppError('Uno o más productos no existen o están inactivos', 400);
        }

        const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

        // ─── Variantes (ropa) ──────────────────────────────────────────────────
        // En un producto con variantes, cada item debe traer un productVariantId
        // válido de ESE producto; el stock se chequea y descuenta por variante,
        // no a nivel de producto.
        const variantIds = [...new Set(items.filter((i: any) => i.productVariantId).map((i: any) => i.productVariantId))] as string[];
        const variantMap = new Map<string, { id: string; productId: string }>();
        if (variantIds.length > 0) {
          const vrows = await tx.productVariant.findMany({
            where: { id: { in: variantIds }, active: true, product: { businessId: req.user!.businessId! } },
            select: { id: true, productId: true },
          });
          for (const v of vrows) variantMap.set(v.id, v);
        }
        for (const item of items) {
          const product = productMap.get(item.productId)!;
          if (product.hasVariants) {
            if (!item.productVariantId) throw new AppError(`Elige la talla/color de: ${product.name}`, 400);
            const v = variantMap.get(item.productVariantId);
            if (!v || v.productId !== item.productId) throw new AppError(`Variante inválida para: ${product.name}`, 400);
          } else if (item.productVariantId) {
            item.productVariantId = null; // producto simple: se ignora una variante enviada por error
          }
        }
        // Bloquear/leer el stock por variante de la bodega (mismo patrón atómico que product_stocks).
        const branchStockByVariant = new Map<string, number>();
        for (const vid of [...variantIds].filter((v) => variantMap.has(v)).sort()) {
          const [row] = await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO product_variant_stocks (id, "variantId", "branchId", stock, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 0, now(), now())
             ON CONFLICT ("variantId", "branchId") DO UPDATE SET "updatedAt" = product_variant_stocks."updatedAt"
             RETURNING stock`,
            randomUUID(), vid, effectiveBranchId,
          );
          branchStockByVariant.set(vid, Number(row.stock));
        }
        const qtyByVariant = new Map<string, number>();
        for (const item of items) {
          if (item.productVariantId) qtyByVariant.set(item.productVariantId, (qtyByVariant.get(item.productVariantId) || 0) + item.quantity);
        }

        // Cantidad total por producto — un mismo producto puede venir repetido en
        // varias líneas (ej. llamada directa a la API); el chequeo de stock y el
        // descuento de inventario deben mirar el total combinado, no línea por línea,
        // o dos líneas de 3 unidades con solo 5 en stock pasarían cada una "por separado".
        const qtyByProduct = new Map<string, number>();
        for (const item of items) {
          qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
        }
        for (const [pid, qty] of qtyByProduct) {
          const product = productMap.get(pid)!;
          if (product.hasVariants) continue; // el stock se chequea por variante (abajo)
          // El chequeo mira el stock de LA BODEGA que está vendiendo, no el total
          // del negocio — otra bodega con stock de sobra no debe permitir vender
          // algo que físicamente no está ahí.
          const branchStock = branchStockByProduct.get(pid) ?? 0;
          if (branchStock < qty && !product.allowNegativeStock) {
            throw new AppError(`Stock insuficiente para: ${product.name}`, 400);
          }
        }
        // Chequeo de stock por variante (ropa) — cada talla/color por separado.
        for (const [vid, vqty] of qtyByVariant) {
          const v = variantMap.get(vid)!;
          const product = productMap.get(v.productId)!;
          const branchStock = branchStockByVariant.get(vid) ?? 0;
          if (branchStock < vqty && !product.allowNegativeStock) {
            throw new AppError(`Stock insuficiente para: ${product.name}`, 400);
          }
        }

        let subtotal = 0;
        let taxAmount = 0;

        const saleDetails = items.map((item: any) => {
          const product = productMap.get(item.productId)!;

          // Precio efectivo según la lista elegida (mayorista con fallback a detal).
          const unit = useWholesale && product.wholesalePrice != null && product.wholesalePrice > 0
            ? product.wholesalePrice
            : product.salePrice;

          const lineSubtotal = unit * item.quantity;
          const lineDiscount = lineSubtotal * ((item.discountPct || 0) / 100);
          const lineNet = roundCOP(lineSubtotal - lineDiscount);
          const lineTax = roundCOP(lineNet * (product.taxRate / 100));

          subtotal += lineNet;
          taxAmount += lineTax;

          return {
            productId: product.id,
            productVariantId: item.productVariantId || null,
            quantity: item.quantity,
            unitPrice: unit,
            costPrice: product.costPrice,
            discountPct: item.discountPct || 0,
            taxRate: product.taxRate,
            subtotal: lineNet,
            total: lineNet + lineTax,
          };
        });

        const discAmt = roundCOP(parseFloat(discountAmount) || 0);
        if (discAmt < 0) throw new AppError('El descuento no puede ser negativo', 400);

        const total = subtotal + taxAmount - discAmt;
        if (total < 0) throw new AppError('El descuento no puede ser mayor al total de la venta', 400);

        const paid = (paidAmount != null && !isNaN(parseFloat(paidAmount))) ? parseFloat(paidAmount) : total;
        if (paid < 0) throw new AppError('El monto pagado no puede ser negativo', 400);

        // Una venta que no se marca como fiado/crédito debe quedar cubierta por completo —
        // de lo contrario la diferencia no queda como deuda del cliente ni como error,
        // simplemente desaparece.
        if (!isCredit && paid < total) {
          throw new AppError('El monto pagado es menor al total. Marca la venta como fiado o completa el pago.', 400);
        }
        const changeAmt = Math.max(0, paid - total);

        const newSale = await tx.sale.create({
          data: {
            invoiceNumber,
            customerId: customerId || null,
            userId: req.user!.userId,
            branchId: effectiveBranchId,
            status: 'COMPLETED',
            subtotal,
            taxAmount,
            discountAmount: discAmt,
            total,
            paidAmount: paid,
            changeAmount: changeAmt,
            paymentMethod: effectivePaymentMethod as any,
            paymentAccountId: effectivePaymentAccountId,
            paymentDetails: paymentDetails || null,
            notes: notes || null,
            details: { create: saleDetails },
          },
          include: { details: true },
        });

        // Update stock and record movements — una sola vez por producto, con la
        // cantidad total combinada (ver qtyByProduct arriba).
        const lowStockProducts: Array<{ id: string; name: string; stock: number; minStock: number }> = [];
        for (const [pid, qty] of qtyByProduct) {
          const product = productMap.get(pid)!;
          const newStock = product.stock - qty;
          // Solo se notifica la primera vez que el stock cae al mínimo — si ya se
          // había notificado y sigue sin reabastecerse, las siguientes ventas no
          // deben volver a disparar la misma alerta (antes se avisaba en cada venta).
          const isNewLowStock = product.minStock > 0 && newStock <= product.minStock && !product.lowStockNotifiedAt;
          await tx.product.update({
            where: { id: pid },
            data: { stock: { decrement: qty }, ...(isNewLowStock ? { lowStockNotifiedAt: new Date() } : {}) },
          });
          // La fila product_stocks de esta bodega ya quedó creada/bloqueada arriba
          // (branchStockByProduct) — aquí solo se descuenta, el total en Product.stock
          // se mantiene sincronizado con el update de arriba. En productos con
          // variantes el stock granular vive en product_variant_stocks (se descuenta
          // aparte, abajo), así que aquí NO se toca product_stocks.
          if (!product.hasVariants) {
            await tx.productStock.update({
              where: { productId_branchId: { productId: pid, branchId: effectiveBranchId } },
              data: { stock: { decrement: qty } },
            });
          }
          await tx.inventoryMovement.create({
            data: {
              productId: pid,
              type: 'OUT',
              quantity: qty,
              previousStock: product.stock,
              newStock,
              reason: 'Venta',
              referenceId: newSale.id,
              referenceType: 'SALE',
              unitCost: product.costPrice,
              totalCost: product.costPrice * qty,
              branchId: effectiveBranchId,
            },
          });
          if (isNewLowStock) {
            lowStockProducts.push({ id: product.id, name: product.name, stock: newStock, minStock: product.minStock });
          }
        }

        // Descuento granular por variante (ropa). La fila ya quedó creada/bloqueada
        // arriba (branchStockByVariant); Product.stock ya se descontó en el loop de
        // arriba (por qtyByProduct, que suma las variantes de cada producto).
        for (const [vid, vqty] of qtyByVariant) {
          await tx.productVariantStock.update({
            where: { variantId_branchId: { variantId: vid, branchId: effectiveBranchId } },
            data: { stock: { decrement: vqty } },
          });
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

        // Registrar ingreso en caja abierta — dentro de la misma transacción que la
        // venta (antes corría después, "best effort": si el proceso caía justo en ese
        // instante, la venta quedaba completa pero el ingreso en caja se perdía sin dejar rastro).
        const cashAmount = computeCashAmount(effectivePaymentMethod, paid, changeAmt, paymentDetails);
        if (cashAmount > 0 && effectiveBranchId) {
          const openRegister = await tx.cashRegister.findFirst({
            where: { branchId: effectiveBranchId, status: 'OPEN' },
          });
          if (openRegister) {
            await tx.cashMovement.create({
              data: {
                cashRegisterId: openRegister.id,
                type: 'IN',
                amount: cashAmount,
                description: `Venta ${invoiceNumber}`,
                referenceId: newSale.id,
                createdById: req.user!.userId,
              },
            });
          }
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

      const businessId = req.user?.businessId;
      if (businessId) {
        emitToBusinesss(businessId, socketEvents.NEW_SALE, { sale });
        for (const product of lowStockProducts) {
          emitToBusinesss(businessId, socketEvents.LOW_STOCK_ALERT, { product });
        }
        if (lowStockProducts.length > 0) {
          await notifyLowStockBatch(businessId, lowStockProducts).catch((err) => {
            logger.error(`Fallo al notificar stock bajo (businessId=${businessId}): ${err?.message || err}`);
          });
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
        const cancelNotes = [sale.notes, reason].filter(Boolean).join(' | ') || reason;
        await tx.sale.update({ where: { id }, data: { status: 'CANCELLED', notes: cancelNotes } });

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
          // Devuelve el stock a la bodega donde se vendió (sale.branchId) — se usa
          // INSERT ... ON CONFLICT por si la venta es de antes de esta función y
          // nunca tuvo una fila de stock creada. En ventas de ropa el stock granular
          // vuelve a la VARIANTE; en las simples, a product_stocks. Product.stock
          // (total) se incrementa en ambos casos con el update de arriba.
          if (detail.productVariantId) {
            await tx.$executeRawUnsafe(
              `INSERT INTO product_variant_stocks (id, "variantId", "branchId", stock, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, now(), now())
               ON CONFLICT ("variantId", "branchId") DO UPDATE SET stock = product_variant_stocks.stock + $4, "updatedAt" = now()`,
              randomUUID(), detail.productVariantId, sale.branchId, detail.quantity,
            );
          } else {
            await tx.$executeRawUnsafe(
              `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, now(), now())
               ON CONFLICT ("productId", "branchId") DO UPDATE SET stock = product_stocks.stock + $4, "updatedAt" = now()`,
              randomUUID(), detail.productId, sale.branchId, detail.quantity,
            );
          }
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
              branchId: sale.branchId,
            },
          });
        }

        // 2. Revert credit if it was a credit sale — cancels the phantom debt on the
        // customer. Locked FOR UPDATE so this can't race with a concurrent payment
        // (credit.controller.ts addPayment locks the same row).
        const [credit] = await tx.$queryRawUnsafe<any[]>(
          'SELECT * FROM credits WHERE "saleId"::text = $1 FOR UPDATE',
          id,
        );
        if (credit) {
          await tx.customer.update({
            where: { id: credit.customerId },
            data: { currentDebt: { decrement: Number(credit.balance) } },
          });
          // Estado propio de "anulado" — no 'PAID': la venta se canceló, el cliente
          // no pagó nada. paidAmount se deja tal cual (los abonos reales ya hechos,
          // si los hubo, no se inventan como si cubrieran el total).
          await tx.credit.update({
            where: { id: credit.id },
            data: { status: 'CANCELLED', balance: 0 },
          });
        }

        // 3. Revert the cash portion of the sale — cubre tanto ventas 100% en
        // efectivo como la porción en efectivo de un pago MIXTO (antes solo
        // revertía CASH puro, dejando la caja descuadrada tras anular una mixta).
        const netCash = computeCashAmount(
          sale.paymentMethod, Number(sale.paidAmount), Number(sale.changeAmount), sale.paymentDetails,
        );
        if (sale.branchId && netCash > 0) {
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
                createdById: req.user!.userId,
              },
            });
          }
        }
      }, { timeout: 30000 });

      await cache.del(`dashboard:${req.user!.businessId}`);

      return success(res, null, 'Venta anulada');
    } catch (err) {
      next(err);
    }
  },

  // Devolución / nota crédito: revierte por la porción devuelta (total o parcial)
  // el stock, la caja y/o el crédito, siguiendo el mismo patrón que cancel().
  async createReturn(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { items, reason } = req.body;
      const restock = req.body.restock !== false; // por defecto se repone el inventario

      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError('Selecciona al menos un producto para devolver', 400);
      }

      const sale = await prisma.sale.findFirst({
        where: { id, deletedAt: null, branch: { businessId: req.user!.businessId } },
        include: {
          details: { include: { product: { select: { name: true } } } },
          returns: { include: { details: true } },
        },
      });
      if (!sale) throw new AppError('Venta no encontrada', 404);
      if (sale.status === 'CANCELLED') throw new AppError('No se puede devolver una venta anulada', 400);

      // Cantidad ya devuelta por cada línea de la venta (devoluciones previas).
      const returnedByDetail = new Map<string, number>();
      for (const r of sale.returns) {
        for (const d of r.details) {
          if (d.saleDetailId) returnedByDetail.set(d.saleDetailId, (returnedByDetail.get(d.saleDetailId) || 0) + d.quantity);
        }
      }

      const detailById = new Map(sale.details.map((d) => [d.id, d]));
      const lines: Array<{ detail: typeof sale.details[number]; qty: number; perUnit: number; lineTotal: number }> = [];
      for (const it of items) {
        const detail = detailById.get(it.saleDetailId);
        if (!detail) throw new AppError('Uno de los ítems no pertenece a esta venta', 400);
        const qty = Number(it.quantity);
        if (!(qty > 0)) throw new AppError('La cantidad a devolver debe ser mayor a 0', 400);
        const maxReturnable = detail.quantity - (returnedByDetail.get(detail.id) || 0);
        if (qty > maxReturnable + 1e-9) {
          throw new AppError(`No puedes devolver más de ${maxReturnable} de "${detail.product?.name ?? 'producto'}"`, 400);
        }
        // Precio efectivo por unidad = total de la línea (con su descuento/IVA) / cantidad.
        const perUnit = roundCOP(Number(detail.total) / detail.quantity);
        lines.push({ detail, qty, perUnit, lineTotal: roundCOP(perUnit * qty) });
      }
      const returnTotal = lines.reduce((s, l) => s + l.lineTotal, 0);

      // Reintentos por colisión del correlativo NC (unique [branchId, returnNumber]).
      let newReturn: Awaited<ReturnType<typeof prisma.return.create>> | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          newReturn = await prisma.$transaction(async (tx) => {
            const count = await tx.return.count({ where: { branchId: sale.branchId } });
            const returnNumber = `NC-${String(count + 1).padStart(4, '0')}`;

            // 1. Reponer stock a la bodega donde se vendió (si aplica).
            if (restock) {
              for (const { detail, qty } of lines) {
                const [locked] = await tx.$queryRawUnsafe<Array<{ id: string; stock: number }>>(
                  'SELECT id, stock FROM products WHERE id::text = $1 FOR UPDATE', detail.productId,
                );
                if (!locked) continue;
                const newStock = locked.stock + qty;
                await tx.product.update({ where: { id: detail.productId }, data: { stock: { increment: qty } } });
                if (detail.productVariantId) {
                  await tx.$executeRawUnsafe(
                    `INSERT INTO product_variant_stocks (id, "variantId", "branchId", stock, "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, now(), now())
                     ON CONFLICT ("variantId", "branchId") DO UPDATE SET stock = product_variant_stocks.stock + $4, "updatedAt" = now()`,
                    randomUUID(), detail.productVariantId, sale.branchId, qty,
                  );
                } else {
                  await tx.$executeRawUnsafe(
                    `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, now(), now())
                     ON CONFLICT ("productId", "branchId") DO UPDATE SET stock = product_stocks.stock + $4, "updatedAt" = now()`,
                    randomUUID(), detail.productId, sale.branchId, qty,
                  );
                }
                await tx.inventoryMovement.create({
                  data: {
                    productId: detail.productId, type: 'IN', quantity: qty,
                    previousStock: locked.stock, newStock,
                    reason: `Devolución ${returnNumber} (venta ${sale.invoiceNumber})`,
                    referenceId: id, referenceType: 'SALE_RETURN',
                    unitCost: detail.costPrice, totalCost: Number(detail.costPrice) * qty,
                    branchId: sale.branchId,
                  },
                });
              }
            }

            // 2. Reembolso: primero baja el saldo del fiado (si hay), el resto es efectivo.
            let creditReversal = 0;
            const [credit] = await tx.$queryRawUnsafe<Array<{ id: string; customerId: string; balance: string; paidAmount: string; status: string }>>(
              'SELECT * FROM credits WHERE "saleId"::text = $1 FOR UPDATE', id,
            );
            if (credit && credit.status !== 'CANCELLED' && Number(credit.balance) > 0) {
              creditReversal = Math.min(returnTotal, Number(credit.balance));
              const newBalance = Number(credit.balance) - creditReversal;
              await tx.customer.update({
                where: { id: credit.customerId },
                data: { currentDebt: { decrement: creditReversal } },
              });
              await tx.credit.update({
                where: { id: credit.id },
                data: {
                  balance: newBalance,
                  status: newBalance <= 0 ? (Number(credit.paidAmount) > 0 ? 'PAID' : 'CANCELLED') : credit.status as never,
                },
              });
            }
            const cashRefund = returnTotal - creditReversal;

            // 3. Salida de caja por la porción en efectivo (si hay caja abierta).
            let cashApplied = 0;
            if (sale.branchId && cashRefund > 0) {
              const openRegister = await tx.cashRegister.findFirst({ where: { branchId: sale.branchId, status: 'OPEN' } });
              if (openRegister) {
                await tx.cashMovement.create({
                  data: {
                    cashRegisterId: openRegister.id, type: 'OUT', amount: cashRefund,
                    description: `Devolución ${returnNumber} (venta ${sale.invoiceNumber})`,
                    referenceId: id, createdById: req.user!.userId,
                  },
                });
                cashApplied = cashRefund;
              }
            }

            const refundMethod = creditReversal > 0 && cashApplied > 0 ? 'MIXED'
              : creditReversal > 0 ? 'CREDIT'
              : cashApplied > 0 ? 'CASH' : 'NONE';

            // 4. Registrar la nota crédito con su detalle.
            const rec = await tx.return.create({
              data: {
                returnNumber, saleId: id, branchId: sale.branchId, userId: req.user!.userId,
                customerId: sale.customerId, total: returnTotal, reason: reason || null,
                refundMethod, restock,
                details: {
                  create: lines.map((l) => ({
                    saleDetailId: l.detail.id, productId: l.detail.productId,
                    productVariantId: l.detail.productVariantId, productName: l.detail.product?.name ?? 'Producto',
                    quantity: l.qty, unitPrice: l.perUnit, total: l.lineTotal,
                  })),
                },
              },
              include: { details: true },
            });

            // 5. Si con esta devolución se devolvió TODA la venta, marcarla REFUNDED.
            const afterReturned = new Map(returnedByDetail);
            for (const l of lines) afterReturned.set(l.detail.id, (afterReturned.get(l.detail.id) || 0) + l.qty);
            const fullyReturned = sale.details.every((d) => (afterReturned.get(d.id) || 0) >= d.quantity - 1e-9);
            if (fullyReturned && sale.status !== 'REFUNDED') {
              await tx.sale.update({ where: { id }, data: { status: 'REFUNDED' } });
            }

            return rec;
          }, { timeout: 30000 });
          break; // éxito
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) continue;
          throw e;
        }
      }

      await cache.del(`dashboard:${req.user!.businessId}`);
      return created(res, newReturn, 'Devolución registrada');
    } catch (err) {
      next(err);
    }
  },

  // Listado de devoluciones del negocio (para la vista de historial).
  async listReturns(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const where: Prisma.ReturnWhereInput = { sale: { branch: { businessId: req.user!.businessId } } };
      const [returns, total] = await Promise.all([
        prisma.return.findMany({
          where, skip, take: limit, orderBy: { createdAt: 'desc' },
          include: {
            details: true,
            sale: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
          },
        }),
        prisma.return.count({ where }),
      ]);
      return paginated(res, returns, total, page, limit);
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
      // "Hoy" en hora de Colombia (no UTC): el resumen del día debe cortar en la
      // medianoche de Bogotá, no del servidor (UTC).
      const now = new Date();
      const today = bogotaDayStart(now, 0);
      const tomorrow = bogotaDayStart(now, 1);

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
