import { PaymentMethod } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from './response';

/**
 * Resuelve el medio de pago de una transacción (venta/compra/gasto/abono).
 *
 * Acepta el nuevo `paymentAccountId` (medio de pago configurable). Si viene, valida
 * que pertenezca al negocio y deriva el `paymentMethod` enum de su `legacyEnum` —
 * así la lógica de caja (que mira paymentMethod === 'CASH') y los reportes siguen
 * funcionando sin cambios durante la transición. Si no viene, cae al `paymentMethod`
 * enum viejo (compatibilidad con clientes que aún no envían el medio).
 *
 * Devuelve ambos para guardarlos juntos: el id del medio y el enum derivado.
 */
export async function resolvePayment(
  body: { paymentAccountId?: string | null; paymentMethod?: string | null },
  businessId: string,
): Promise<{ paymentAccountId: string | null; paymentMethod: PaymentMethod }> {
  if (body.paymentAccountId) {
    const acct = await prisma.paymentAccount.findFirst({
      where: { id: body.paymentAccountId, businessId },
      select: { id: true, legacyEnum: true },
    });
    if (!acct) throw new AppError('Medio de pago no válido', 400);
    return {
      paymentAccountId: acct.id,
      paymentMethod: (acct.legacyEnum ?? 'TRANSFER') as PaymentMethod,
    };
  }
  return {
    paymentAccountId: null,
    paymentMethod: (body.paymentMethod as PaymentMethod) || 'CASH',
  };
}
