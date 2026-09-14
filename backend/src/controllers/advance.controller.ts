import { Response, NextFunction } from 'express';
import { Prisma, PaymentMethod } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError, success, created } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';
import { parseBogotaBoundary } from '../utils/bogotaTime';
import { resolvePayment } from '../utils/paymentAccount';
import { logger } from '../config/logger';

/**
 * Anticipos de cliente y de proveedor.
 *
 * El caso real: la mueblería cobra la mitad hoy y entrega en ocho días; o el
 * negocio le gira por adelantado al proveedor para que despache.
 *
 * La regla contable que manda todo este archivo: **recibir un anticipo no es una
 * venta**. Es plata a cuenta. Entra a la caja (si fue en efectivo) pero no suma
 * a los ingresos. La venta se registra completa el día de la entrega y ahí el
 * anticipo descuenta lo que el cliente paga ESE día, sin volver a entrar a la
 * caja: esa plata ya entró. Contarla dos veces inflaría las ventas del mes.
 */

const COP = (n: number) => Math.round(n);

/** Un anticipo con saldo sigue sirviendo; sin saldo ya se consumió. */
function estadoPorSaldo(amount: number, applied: number) {
  if (applied <= 0) return 'PENDING' as const;
  return applied >= amount ? ('APPLIED' as const) : ('PARTIAL' as const);
}

/**
 * Movimiento de caja del anticipo.
 *
 * Solo el efectivo toca la caja: una transferencia o un pago con Addi no pasan
 * por el cajón, igual que en las ventas. Nunca debe tumbar la operación — si la
 * caja está cerrada, el anticipo se registra lo mismo y queda el aviso en el log.
 */
async function moverCaja(
  req: AuthRequest,
  opciones: { method: PaymentMethod; amount: number; type: 'IN' | 'OUT'; description: string; referenceId: string },
) {
  if (opciones.method !== 'CASH' || opciones.amount <= 0) return;
  try {
    const branchId = req.user!.branchId;
    if (!branchId) return;
    const caja = await prisma.cashRegister.findFirst({ where: { branchId, status: 'OPEN' } });
    if (!caja) return;
    await prisma.cashMovement.create({
      data: {
        cashRegisterId: caja.id,
        type: opciones.type,
        amount: opciones.amount,
        description: opciones.description,
        referenceId: opciones.referenceId,
        createdById: req.user!.userId,
      },
    });
  } catch (err) {
    logger.error('No se pudo registrar el movimiento de caja del anticipo', { err, ref: opciones.referenceId });
  }
}

const INCLUIR = {
  customer: { select: { id: true, name: true, document: true, phone: true } },
  supplier: { select: { id: true, name: true, document: true, phone: true } },
  paymentAccount: { select: { id: true, name: true, type: true } },
  createdBy: { select: { id: true, name: true } },
};

export const advanceController = {
  /** Lista con los filtros con que la gente busca: tipo, estado, tercero y fechas. */
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { type, status, customerId, supplierId, search } = req.query as Record<string, string>;

      const where: Prisma.AdvanceWhereInput = { businessId, deletedAt: null };
      if (type === 'CUSTOMER' || type === 'SUPPLIER') where.type = type;
      if (status) where.status = status as Prisma.AdvanceWhereInput['status'];
      if (customerId) where.customerId = customerId;
      if (supplierId) where.supplierId = supplierId;
      // Se busca por número o por el nombre del tercero, que es como se recuerda
      // ("el anticipo de doña Marta", "el ANT-0012").
      if (search) {
        where.OR = [
          { number: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
          { supplier: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }
      // Día calendario colombiano: sin esto "del 1 al 30" deja por fuera lo del
      // día 1 antes de las 7 p.m. (medianoche UTC = 7 p.m. de acá).
      const gte = parseBogotaBoundary(req.query.startDate, 'start');
      const lte = parseBogotaBoundary(req.query.endDate, 'end');
      if (gte || lte) where.createdAt = { ...(gte && { gte }), ...(lte && { lte }) };

      const [items, total, disponibles] = await Promise.all([
        prisma.advance.findMany({
          where,
          include: INCLUIR,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.advance.count({ where }),
        // Cuánto hay pendiente de cruzar, por tipo: es lo que el negocio le debe
        // en mercancía a sus clientes y lo que los proveedores le deben a él.
        prisma.advance.groupBy({
          by: ['type'],
          where: { businessId, deletedAt: null, status: { in: ['PENDING', 'PARTIAL'] } },
          _sum: { balance: true },
        }),
      ]);

      const porTipo = { CUSTOMER: 0, SUPPLIER: 0 };
      for (const fila of disponibles) porTipo[fila.type] = Number(fila._sum.balance || 0);

      // Misma forma que el resto de listados (data + pagination) más el resumen
      // de saldos, que la pantalla muestra arriba sin pedir otra consulta.
      return res.status(200).json({
        success: true,
        message: 'OK',
        data: items,
        saldosPendientes: porTipo,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      });
    } catch (err) { next(err); }
  },

  /** Un anticipo con el detalle de contra qué facturas se cruzó. */
  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const anticipo = await prisma.advance.findFirst({
        where: { id: req.params.id, businessId: req.user!.businessId!, deletedAt: null },
        include: {
          ...INCLUIR,
          applications: {
            orderBy: { createdAt: 'desc' },
            include: {
              sale: { select: { id: true, invoiceNumber: true, total: true, createdAt: true } },
              purchase: { select: { id: true, invoiceNumber: true, total: true, purchaseDate: true } },
            },
          },
        },
      });
      if (!anticipo) throw new AppError('Anticipo no encontrado', 404);
      return success(res, anticipo);
    } catch (err) { next(err); }
  },

  /** Registrar el anticipo: entra (cliente) o sale (proveedor) la plata. */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { type, customerId, supplierId, amount, notes } = req.body as {
        type?: string; customerId?: string; supplierId?: string; amount?: number | string; notes?: string;
      };

      if (type !== 'CUSTOMER' && type !== 'SUPPLIER') {
        throw new AppError('Indique si el anticipo es de un cliente o de un proveedor', 400);
      }
      const monto = COP(Number(amount));
      if (!isFinite(monto) || monto <= 0) throw new AppError('El monto debe ser mayor a 0', 400);

      // El tercero es obligatorio: un anticipo sin dueño no se puede cruzar
      // contra ninguna factura después, que es todo el sentido de registrarlo.
      if (type === 'CUSTOMER') {
        if (!customerId) throw new AppError('Seleccione el cliente que deja el anticipo', 400);
        const cliente = await prisma.customer.findFirst({ where: { id: customerId, businessId, deletedAt: null } });
        if (!cliente) throw new AppError('Cliente no encontrado', 404);
      } else {
        if (!supplierId) throw new AppError('Seleccione el proveedor al que se le gira el anticipo', 400);
        const proveedor = await prisma.supplier.findFirst({ where: { id: supplierId, businessId, deletedAt: null } });
        if (!proveedor) throw new AppError('Proveedor no encontrado', 404);
      }

      const pago = await resolvePayment(
        { paymentAccountId: req.body.paymentAccountId, paymentMethod: req.body.paymentMethod },
        businessId,
      );

      // Numeración por tipo para que se distingan de un vistazo en el extracto:
      // ANT- los del cliente, ANTP- los del proveedor. Cuenta también los
      // borrados para no reutilizar un número ya impreso en un recibo.
      const prefijo = type === 'CUSTOMER' ? 'ANT' : 'ANTP';
      const cuantos = await prisma.advance.count({ where: { businessId, type } });
      const number = `${prefijo}-${String(cuantos + 1).padStart(4, '0')}`;

      const anticipo = await prisma.advance.create({
        data: {
          businessId,
          branchId: req.user!.branchId || null,
          number,
          type,
          customerId: type === 'CUSTOMER' ? customerId! : null,
          supplierId: type === 'SUPPLIER' ? supplierId! : null,
          amount: monto,
          applied: 0,
          balance: monto,
          status: 'PENDING',
          paymentMethod: pago.paymentMethod,
          paymentAccountId: pago.paymentAccountId,
          notes: notes?.trim() || null,
          createdById: req.user!.userId,
        },
        include: INCLUIR,
      });

      // Del cliente entra plata; al proveedor se le entrega.
      await moverCaja(req, {
        method: pago.paymentMethod,
        amount: monto,
        type: type === 'CUSTOMER' ? 'IN' : 'OUT',
        description: type === 'CUSTOMER'
          ? `Anticipo ${number} — ${anticipo.customer?.name ?? 'cliente'}`
          : `Anticipo a proveedor ${number} — ${anticipo.supplier?.name ?? 'proveedor'}`,
        referenceId: anticipo.id,
      });

      return created(res, anticipo, 'Anticipo registrado');
    } catch (err) { next(err); }
  },

  /**
   * Cruzar el anticipo contra una factura.
   *
   * No mueve la caja a propósito: la plata entró (o salió) cuando se registró el
   * anticipo. Aquí solo se descuenta del saldo disponible.
   */
  async apply(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { saleId, purchaseId, amount } = req.body as {
        saleId?: string; purchaseId?: string; amount?: number | string;
      };

      const resultado = await prisma.$transaction(async (tx) => {
        // Se bloquea la fila para que dos cajeros no puedan cruzar el mismo
        // saldo al tiempo y dejarlo en negativo.
        const filas = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM advances
           WHERE id = ${req.params.id} AND "businessId" = ${businessId} AND "deletedAt" IS NULL
           FOR UPDATE
        `;
        if (filas.length === 0) throw new AppError('Anticipo no encontrado', 404);

        const anticipo = await tx.advance.findUniqueOrThrow({ where: { id: req.params.id } });
        if (anticipo.status === 'REFUNDED') throw new AppError('Este anticipo ya fue devuelto', 400);
        if (anticipo.status === 'CANCELLED') throw new AppError('Este anticipo está anulado', 400);

        const saldo = Number(anticipo.balance);
        if (saldo <= 0) throw new AppError('Este anticipo ya no tiene saldo disponible', 400);

        // Sin monto, se cruza lo que alcance: es lo que uno quiere el 90% de las
        // veces y evita que el cajero tenga que sacar la cuenta.
        const pedido = amount == null ? saldo : COP(Number(amount));
        if (!isFinite(pedido) || pedido <= 0) throw new AppError('El monto a cruzar debe ser mayor a 0', 400);
        if (pedido > saldo) {
          throw new AppError(`El anticipo solo tiene $${saldo.toLocaleString('es-CO')} disponibles`, 400);
        }

        let porCruzar = pedido;

        if (anticipo.type === 'CUSTOMER') {
          if (!saleId) throw new AppError('Indique la venta contra la cual se cruza el anticipo', 400);
          const venta = await tx.sale.findFirst({
            where: { id: saleId, branch: { businessId }, deletedAt: null },
            select: { id: true, invoiceNumber: true, total: true, status: true, customerId: true },
          });
          if (!venta) throw new AppError('Venta no encontrada', 404);
          if (venta.status === 'CANCELLED') throw new AppError('Esa venta está anulada', 400);
          // El anticipo es de un cliente concreto: cruzarlo contra la factura de
          // otro le regalaría la plata a quien no la puso.
          if (venta.customerId !== anticipo.customerId) {
            throw new AppError('La venta es de otro cliente', 400);
          }
          // No se puede cruzar más de lo que vale la factura, descontando lo que
          // ya se le haya cruzado antes.
          const yaCruzado = await tx.advanceApplication.aggregate({
            where: { saleId }, _sum: { amount: true },
          });
          const disponibleEnFactura = Number(venta.total) - Number(yaCruzado._sum.amount || 0);
          if (disponibleEnFactura <= 0) throw new AppError('Esa factura ya está cubierta con anticipos', 400);
          porCruzar = Math.min(porCruzar, disponibleEnFactura);
        } else {
          if (!purchaseId) throw new AppError('Indique la compra contra la cual se cruza el anticipo', 400);
          const compra = await tx.purchase.findFirst({
            where: { id: purchaseId, businessId, deletedAt: null },
            select: { id: true, invoiceNumber: true, total: true, status: true, supplierId: true },
          });
          if (!compra) throw new AppError('Compra no encontrada', 404);
          if (compra.status === 'CANCELLED') throw new AppError('Esa compra está anulada', 400);
          if (compra.supplierId !== anticipo.supplierId) {
            throw new AppError('La compra es de otro proveedor', 400);
          }
          const yaCruzado = await tx.advanceApplication.aggregate({
            where: { purchaseId }, _sum: { amount: true },
          });
          const disponibleEnFactura = Number(compra.total) - Number(yaCruzado._sum.amount || 0);
          if (disponibleEnFactura <= 0) throw new AppError('Esa compra ya está cubierta con anticipos', 400);
          porCruzar = Math.min(porCruzar, disponibleEnFactura);
        }

        await tx.advanceApplication.create({
          data: {
            advanceId: anticipo.id,
            saleId: anticipo.type === 'CUSTOMER' ? saleId! : null,
            purchaseId: anticipo.type === 'SUPPLIER' ? purchaseId! : null,
            amount: porCruzar,
            createdById: req.user!.userId,
          },
        });

        const aplicado = COP(Number(anticipo.applied) + porCruzar);
        const monto = Number(anticipo.amount);
        return tx.advance.update({
          where: { id: anticipo.id },
          data: {
            applied: aplicado,
            balance: COP(monto - aplicado),
            status: estadoPorSaldo(monto, aplicado),
          },
          include: INCLUIR,
        });
      });

      return success(res, resultado, 'Anticipo cruzado con la factura');
    } catch (err) { next(err); }
  },

  /**
   * Devolverle la plata al tercero.
   *
   * Se devuelve el SALDO, no el total: si ya se cruzó una parte contra una
   * factura, esa mercancía ya se entregó y esa plata no se devuelve.
   */
  async refund(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const anticipo = await prisma.advance.findFirst({
        where: { id: req.params.id, businessId, deletedAt: null },
        include: INCLUIR,
      });
      if (!anticipo) throw new AppError('Anticipo no encontrado', 404);
      if (anticipo.status === 'REFUNDED') throw new AppError('Este anticipo ya fue devuelto', 400);
      if (anticipo.status === 'CANCELLED') throw new AppError('Este anticipo está anulado', 400);

      const saldo = Number(anticipo.balance);
      if (saldo <= 0) throw new AppError('Este anticipo ya se usó completo: no hay nada que devolver', 400);

      // Por defecto se devuelve por donde entró; el negocio puede decir otra cosa
      // (entró por transferencia pero se devuelve en efectivo, que pasa seguido).
      const metodo = (req.body?.refundMethod as PaymentMethod) || anticipo.paymentMethod;

      const actualizado = await prisma.advance.update({
        where: { id: anticipo.id },
        data: {
          balance: 0,
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundMethod: metodo,
          notes: req.body?.notes?.trim() || anticipo.notes,
        },
        include: INCLUIR,
      });

      // Al cliente se le devuelve (sale de la caja); el proveedor nos devuelve
      // (entra a la caja).
      await moverCaja(req, {
        method: metodo,
        amount: saldo,
        type: anticipo.type === 'CUSTOMER' ? 'OUT' : 'IN',
        description: `Devolución de anticipo ${anticipo.number} — ${anticipo.customer?.name ?? anticipo.supplier?.name ?? ''}`.trim(),
        referenceId: anticipo.id,
      });

      return success(res, actualizado, 'Anticipo devuelto');
    } catch (err) { next(err); }
  },

  /**
   * Anular un anticipo mal registrado.
   *
   * Distinto de devolver: aquí no hubo plata de por medio, fue un error de
   * digitación. Por eso revierte el movimiento de caja en vez de crear una
   * devolución, que en el arqueo del día se vería como una salida que nunca
   * ocurrió. Si el cliente sí dejó la plata y desiste, lo correcto es Devolver;
   * y si prefiere dejarla a favor para después, no hay que hacer nada: el
   * anticipo se queda con su saldo disponible.
   */
  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const anticipo = await prisma.advance.findFirst({
        where: { id: req.params.id, businessId, deletedAt: null },
      });
      if (!anticipo) throw new AppError('Anticipo no encontrado', 404);
      if (anticipo.status === 'REFUNDED') throw new AppError('Este anticipo ya fue devuelto', 400);
      if (anticipo.status === 'CANCELLED') throw new AppError('Este anticipo ya está anulado', 400);
      if (Number(anticipo.applied) > 0) {
        throw new AppError('Este anticipo ya se cruzó con una factura: no se puede anular', 400);
      }

      const actualizado = await prisma.advance.update({
        where: { id: anticipo.id },
        data: { balance: 0, status: 'CANCELLED', notes: req.body?.notes?.trim() || anticipo.notes },
        include: INCLUIR,
      });

      // Se deshace el movimiento original: si entró plata, sale; y al revés.
      await moverCaja(req, {
        method: anticipo.paymentMethod,
        amount: Number(anticipo.amount),
        type: anticipo.type === 'CUSTOMER' ? 'OUT' : 'IN',
        description: `Anulación de anticipo ${anticipo.number}`,
        referenceId: anticipo.id,
      });

      return success(res, actualizado, 'Anticipo anulado');
    } catch (err) { next(err); }
  },

  /**
   * Facturas del tercero contra las que se puede cruzar este anticipo.
   *
   * Para qué: el anticipo del proveedor se cruza cuando llega la mercancía, y
   * para entonces la compra ya está registrada. Sin esta lista, el cajero
   * tendría que copiar el id de la factura a mano.
   *
   * Solo trae las que todavía tienen algo por cubrir: una factura ya cubierta
   * con otros anticipos no debería siquiera ofrecerse.
   */
  async invoices(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const anticipo = await prisma.advance.findFirst({
        where: { id: req.params.id, businessId, deletedAt: null },
        select: { id: true, type: true, customerId: true, supplierId: true, balance: true },
      });
      if (!anticipo) throw new AppError('Anticipo no encontrado', 404);

      // Lo ya cruzado por factura, para no ofrecer las que están cubiertas.
      const cruzados = await prisma.advanceApplication.groupBy({
        by: anticipo.type === 'CUSTOMER' ? ['saleId'] : ['purchaseId'],
        _sum: { amount: true },
      });
      const yaCruzado = new Map<string, number>();
      for (const fila of cruzados as Array<Record<string, unknown>>) {
        const clave = (fila.saleId ?? fila.purchaseId) as string | null;
        if (clave) yaCruzado.set(clave, Number((fila as { _sum: { amount: unknown } })._sum.amount || 0));
      }

      const facturas = anticipo.type === 'CUSTOMER'
        ? (await prisma.sale.findMany({
            where: { customerId: anticipo.customerId!, status: 'COMPLETED', deletedAt: null, branch: { businessId } },
            select: { id: true, invoiceNumber: true, total: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 30,
          })).map((v) => ({ id: v.id, numero: v.invoiceNumber, total: Number(v.total), fecha: v.createdAt }))
        : (await prisma.purchase.findMany({
            where: { supplierId: anticipo.supplierId!, status: 'COMPLETED', deletedAt: null, businessId },
            select: { id: true, invoiceNumber: true, total: true, purchaseDate: true },
            orderBy: { purchaseDate: 'desc' },
            take: 30,
          })).map((c) => ({ id: c.id, numero: c.invoiceNumber || 'Sin número', total: Number(c.total), fecha: c.purchaseDate }));

      const disponibles = facturas
        .map((f) => ({ ...f, porCubrir: f.total - (yaCruzado.get(f.id) || 0) }))
        .filter((f) => f.porCubrir > 0);

      return success(res, { facturas: disponibles, saldo: Number(anticipo.balance) });
    } catch (err) { next(err); }
  },

  /**
   * Saldo disponible de un tercero, para el momento de facturar.
   *
   * Es lo que consulta el punto de venta: "este cliente tiene $500.000 a favor".
   */
  async available(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { customerId, supplierId } = req.query as Record<string, string>;
      if (!customerId && !supplierId) throw new AppError('Indique el cliente o el proveedor', 400);

      const anticipos = await prisma.advance.findMany({
        where: {
          businessId,
          deletedAt: null,
          status: { in: ['PENDING', 'PARTIAL'] },
          ...(customerId ? { type: 'CUSTOMER', customerId } : { type: 'SUPPLIER', supplierId }),
        },
        select: { id: true, number: true, amount: true, balance: true, createdAt: true, notes: true },
        orderBy: { createdAt: 'asc' }, // primero el más viejo: se consume en orden
      });

      const total = anticipos.reduce((suma, a) => suma + Number(a.balance), 0);
      return success(res, { anticipos, total });
    } catch (err) { next(err); }
  },
};
