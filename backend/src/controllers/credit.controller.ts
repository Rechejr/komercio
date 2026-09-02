import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';
import { emitToBusinesss, socketEvents } from '../config/socket';
import { resolvePayment } from '../utils/paymentAccount';
import { parseBogotaBoundary } from '../utils/bogotaTime';
import { estadoCuota, aNumero } from '../utils/cuotas';

export const creditController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const { status, customerId, startDate, endDate } = req.query;

      const businessId = req.user!.businessId;

      const where: any = { deletedAt: null, customer: { businessId } };
      if (status) where.status = status;
      if (customerId) where.customerId = customerId;

      // Rango de fechas por día calendario colombiano (sobre la fecha de creación
      // del crédito), para descargar/filtrar "del X al Y" sin el corrimiento UTC.
      const gte = parseBogotaBoundary(startDate, 'start');
      const lte = parseBogotaBoundary(endDate, 'end');
      if (gte || lte) where.createdAt = { ...(gte && { gte }), ...(lte && { lte }) };

      const [credits, total] = await Promise.all([
        prisma.credit.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            sale: { select: { invoiceNumber: true } },
            _count: { select: { payments: true } },
          },
        }),
        prisma.credit.count({ where }),
      ]);

      return paginated(res, credits, total, page, limit);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const credit = await prisma.credit.findFirst({
        where: { id: req.params.id, deletedAt: null, customer: { businessId: req.user!.businessId } },
        include: {
          customer: true,
          sale: { select: { invoiceNumber: true, details: { include: { product: { select: { name: true } } } } } },
          payments: { orderBy: { createdAt: 'desc' } },
          // Plan de cuotas (vacío en los fiados sin plazos). Va ordenado por
          // número, que es como lo lee el vendedor al cobrar.
          installments: { orderBy: { numero: 'asc' } },
        },
      });
      if (!credit) throw new AppError('Crédito no encontrado', 404);
      return success(res, credit);
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { customerId, totalAmount, dueDate, notes } = req.body;

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, businessId: req.user!.businessId, deletedAt: null },
      });
      if (!customer) throw new AppError('Cliente no encontrado', 404);

      const credit = await prisma.$transaction(async (tx) => {
        const newCredit = await tx.credit.create({
          data: {
            customerId,
            totalAmount: parseFloat(totalAmount),
            paidAmount: 0,
            balance: parseFloat(totalAmount),
            status: 'PENDING',
            dueDate: dueDate ? new Date(dueDate) : null,
            notes,
          },
        });

        await tx.customer.update({
          where: { id: customerId },
          data: { currentDebt: { increment: parseFloat(totalAmount) } },
        });

        return newCredit;
      });

      await cache.del(`dashboard:${req.user!.businessId}`).catch(() => {});
      return created(res, credit, 'Crédito registrado');
    } catch (err) {
      next(err);
    }
  },

  async addPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, paymentAccountId, notes, installmentId } = req.body;

      const paymentAmount = parseFloat(amount);
      if (!paymentAmount || paymentAmount <= 0) throw new AppError('El monto debe ser mayor a 0', 400);

      const businessId = req.user!.businessId;
      const pay = await resolvePayment({ paymentAccountId, paymentMethod }, businessId!);

      const [newBalance, newStatus, customerName] = await prisma.$transaction(async (tx) => {
        // Lock the row to prevent concurrent payment race conditions
        const [locked] = await tx.$queryRaw<any[]>`
          SELECT c.id, c."totalAmount", c."paidAmount", c.balance, c.status, c."customerId"
          FROM credits c
          JOIN customers cu ON c."customerId" = cu.id
          WHERE c.id::text = ${id}
            AND c."deletedAt" IS NULL
            AND cu."businessId" = ${businessId}
          FOR UPDATE
        `;
        if (!locked) throw new AppError('Crédito no encontrado', 404);
        if (locked.status === 'PAID') throw new AppError('Este crédito ya está saldado', 400);

        const currentBalance = Number(locked.balance);
        if (paymentAmount > currentBalance) throw new AppError('El pago supera el saldo pendiente', 400);

        const newPaid = Number(locked.paidAmount) + paymentAmount;
        const balance = Number(locked.totalAmount) - newPaid;
        // Un abono parcial a un crédito ya vencido no lo "pone al día" — sigue
        // vencido hasta que se salde por completo; antes bajaba a PARTIAL y
        // desaparecía del filtro de vencidos hasta el próximo tick del cron horario.
        const status = balance <= 0
          ? 'PAID'
          : locked.status === 'OVERDUE'
            ? 'OVERDUE'
            : newPaid > 0 ? 'PARTIAL' : 'PENDING';

        await tx.creditPayment.create({
          data: {
            creditId: id, amount: paymentAmount, paymentMethod: pay.paymentMethod,
            paymentAccountId: pay.paymentAccountId, notes,
            installmentId: installmentId || null,
          },
        });

        // ── Aplicar el abono a las cuotas ────────────────────────────────────
        // El cliente elige a cuál cuota abona (installmentId). Si el abono
        // alcanza para más, el excedente sigue por las siguientes cuotas sin
        // pagar, en orden: dejar dinero "flotando" sin asignar haría que la
        // suma de las cuotas no cuadrara nunca con el saldo del fiado.
        const cuotas = await tx.creditInstallment.findMany({
          where: { creditId: id, status: { not: 'PAID' } },
          orderBy: { numero: 'asc' },
          select: { id: true, numero: true, monto: true, paidAmount: true },
        });

        if (cuotas.length > 0) {
          // La elegida primero; el resto en orden de vencimiento.
          const elegida = installmentId ? cuotas.find((c) => c.id === installmentId) : undefined;
          if (installmentId && !elegida) throw new AppError('Esa cuota no es de este fiado', 400);
          const orden = elegida
            ? [elegida, ...cuotas.filter((c) => c.id !== elegida.id)]
            : cuotas;

          let restante = paymentAmount;
          for (const cuota of orden) {
            if (restante <= 0) break;
            const monto = aNumero(cuota.monto);
            const yaPago = aNumero(cuota.paidAmount);
            const falta = Math.max(0, monto - yaPago);
            if (falta <= 0) continue;
            const aplicado = Math.min(restante, falta);
            const nuevoPagado = yaPago + aplicado;
            await tx.creditInstallment.update({
              where: { id: cuota.id },
              data: { paidAmount: nuevoPagado, status: estadoCuota(monto, nuevoPagado) },
            });
            restante -= aplicado;
          }

          // La fecha del fiado apunta SIEMPRE a la próxima cuota sin pagar: de
          // ahí salen los avisos, el estado "En mora" y la columna Vencimiento,
          // que así siguen funcionando sin saber que hay cuotas debajo.
          const siguiente = await tx.creditInstallment.findFirst({
            where: { creditId: id, status: { not: 'PAID' } },
            orderBy: { dueDate: 'asc' },
            select: { dueDate: true },
          });
          await tx.credit.update({ where: { id }, data: { dueDate: siguiente?.dueDate ?? null } });
        }

        await tx.credit.update({
          where: { id },
          data: { paidAmount: newPaid, balance, status: status as any },
        });

        const customer = await tx.customer.findUnique({ where: { id: locked.customerId }, select: { currentDebt: true, name: true } });
        const safeDecrement = Math.min(paymentAmount, Math.max(0, Number(customer?.currentDebt ?? paymentAmount)));
        await tx.customer.update({
          where: { id: locked.customerId },
          data: { currentDebt: { decrement: safeDecrement } },
        });

        return [balance, status, customer?.name];
      });

      // Registrar ingreso en caja abierta cuando el abono es en efectivo (best
      // effort) — sin esto, el dinero entra físicamente a la caja pero el
      // arqueo nunca lo espera, así que un cajero podría quedárselo sin que
      // el cierre de turno muestre ningún faltante.
      if (pay.paymentMethod === 'CASH') {
        try {
          const branchId = req.user!.branchId;
          if (branchId) {
            const openRegister = await prisma.cashRegister.findFirst({ where: { branchId, status: 'OPEN' } });
            if (openRegister) {
              await prisma.cashMovement.create({
                data: {
                  cashRegisterId: openRegister.id,
                  type: 'IN',
                  amount: paymentAmount,
                  description: `Abono de crédito${customerName ? ` — ${customerName}` : ''}`,
                  referenceId: id,
                  createdById: req.user!.userId,
                },
              });
            }
          }
        } catch { /* no debe fallar el abono */ }
      }

      if (businessId) {
        emitToBusinesss(businessId, socketEvents.PAYMENT_RECEIVED, { creditId: id, amount: paymentAmount });
        await cache.del(`dashboard:${businessId}`).catch(() => {});
      }

      return success(res, { newBalance, status: newStatus }, 'Pago registrado');
    } catch (err) {
      next(err);
    }
  },

  // Un crédito manual (fiado sin venta, "POST /credits") no tenía forma de
  // corregirse: si se registraba con el cliente o el monto equivocado, el
  // incremento en customer.currentDebt quedaba atrapado para siempre — solo
  // intervención directa en la base de datos. Los créditos LIGADOS a una venta
  // ya se revierten al anular la venta (sale.controller.cancel); este endpoint
  // cubre el caso que faltaba.
  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const businessId = req.user!.businessId;

      await prisma.$transaction(async (tx) => {
        // Lock — misma fila que addPayment()/sale.controller.cancel() bloquean,
        // para no correr contra un abono o una anulación de venta concurrente.
        const [locked] = await tx.$queryRaw<any[]>`
          SELECT c.id, c.status, c.balance, c."customerId", c."saleId"
          FROM credits c
          JOIN customers cu ON c."customerId" = cu.id
          WHERE c.id::text = ${id}
            AND c."deletedAt" IS NULL
            AND cu."businessId" = ${businessId}
          FOR UPDATE
        `;
        if (!locked) throw new AppError('Crédito no encontrado', 404);
        if (locked.status === 'CANCELLED') throw new AppError('Este crédito ya está anulado', 400);
        if (locked.status === 'PAID') throw new AppError('No se puede anular un crédito ya saldado', 400);
        if (locked.saleId) {
          throw new AppError('Este crédito está ligado a una venta — anula la venta para revertirlo', 400);
        }

        // Se revierte el SALDO pendiente, no el monto total — los abonos ya
        // hechos ya descontaron su parte de currentDebt cuando se registraron
        // (ver addPayment), y esos pagos reales se conservan en el historial.
        await tx.customer.update({
          where: { id: locked.customerId },
          data: { currentDebt: { decrement: Number(locked.balance) } },
        });
        await tx.credit.update({
          where: { id },
          data: { status: 'CANCELLED', balance: 0 },
        });
      });

      await cache.del(`dashboard:${businessId}`).catch(() => {});
      return success(res, null, 'Crédito anulado');
    } catch (err) {
      next(err);
    }
  },

  /** Cambia la fecha en que el cliente se compromete a pagar.
   *
   *  Hace falta para dos cosas: ponérsela a los fiados viejos, que nacieron sin
   *  fecha y por eso nunca entraron en mora ni avisaron nada; y para cuando el
   *  cliente pide un plazo nuevo, que en un negocio de barrio pasa a diario.
   *  Enviar la fecha vacía la quita (vuelve a ser un fiado sin plazo). */
  async updateDueDate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const businessId = req.user!.businessId;
      const { dueDate } = req.body;

      let fecha: Date | null = null;
      if (dueDate) {
        const d = new Date(dueDate);
        if (isNaN(d.getTime())) throw new AppError('La fecha de vencimiento no es válida', 400);
        fecha = d;
      }

      // El crédito tiene que ser de ESTE negocio: se comprueba por el cliente,
      // que es quien lleva el businessId.
      const credito = await prisma.credit.findFirst({
        where: { id, deletedAt: null, customer: { businessId } },
        select: { id: true, status: true, _count: { select: { installments: true } } },
      });
      if (!credito) throw new AppError('Crédito no encontrado', 404);
      // En un fiado a cuotas la fecha NO se toca a mano: la maneja el sistema,
      // que la mantiene apuntando a la próxima cuota sin pagar. Cambiarla aquí
      // la dejaría diciendo una cosa y las cuotas otra.
      if (credito._count.installments > 0) {
        throw new AppError('Este fiado se pagó a cuotas: la fecha la define la próxima cuota pendiente', 400);
      }
      if (credito.status === 'CANCELLED') throw new AppError('Este crédito está anulado', 400);
      if (credito.status === 'PAID') throw new AppError('Este crédito ya está saldado', 400);

      // Si estaba marcado en mora y le dan un plazo nuevo hacia adelante, deja de
      // estarlo: el estado lo vuelve a calcular el proceso de cada hora según la
      // fecha. Sin esto, quedaría "En mora" con una fecha futura, que no tiene
      // sentido y además le seguiría saliendo en los avisos.
      const yaNoEstaEnMora = credito.status === 'OVERDUE' && fecha && fecha > new Date();

      const actualizado = await prisma.credit.update({
        where: { id },
        data: {
          dueDate: fecha,
          ...(yaNoEstaEnMora ? { status: 'PENDING' as const } : {}),
        },
        select: { id: true, dueDate: true, status: true },
      });

      await cache.del(`dashboard:${businessId}`).catch(() => {});
      return success(res, actualizado, fecha ? 'Fecha de pago actualizada' : 'Se quitó la fecha de pago');
    } catch (err) {
      next(err);
    }
  },
};

