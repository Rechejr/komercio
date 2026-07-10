import { prisma } from '../config/database';
import { emitToUser, socketEvents } from '../config/socket';

interface NotifyOptions {
  title: string;
  message: string;
  type?: string;
  data?: Record<string, unknown>;
}

async function notifyUsers(userIds: string[], opts: NotifyOptions) {
  if (userIds.length === 0) return;

  // createMany: 1 INSERT for all users instead of N individual inserts in $transaction
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      title: opts.title,
      message: opts.message,
      type: opts.type || 'INFO',
      data: (opts.data || undefined) as any,
    })),
  });

  const payload = { title: opts.title, message: opts.message, type: opts.type || 'INFO', data: opts.data };
  userIds.forEach((userId) => emitToUser(userId, socketEvents.NEW_NOTIFICATION, payload));
}

// Batch variant: queries managers ONCE and creates all notifications in a single INSERT.
// Use this when notifying about multiple low-stock products at once (e.g. after a sale).
export async function notifyLowStockBatch(
  businessId: string,
  products: Array<{ id: string; name: string; stock: number; minStock: number }>,
) {
  if (products.length === 0) return;

  const managers = await prisma.user.findMany({
    where: { branch: { businessId }, role: { in: ['ADMIN', 'SUPERVISOR'] }, deletedAt: null, isActive: true },
    select: { id: true },
  });

  if (managers.length === 0) return;
  const managerIds = managers.map((m) => m.id);

  // One createMany for all (manager × product) combinations
  await prisma.notification.createMany({
    data: products.flatMap((product) =>
      managerIds.map((userId) => ({
        userId,
        title: 'Stock bajo',
        message: `${product.name} tiene ${product.stock} unidades — por debajo del mínimo (${product.minStock}).`,
        type: 'WARNING',
        data: { productId: product.id, kind: 'LOW_STOCK' } as any,
      })),
    ),
  });

  for (const product of products) {
    const payload = {
      title: 'Stock bajo',
      message: `${product.name} tiene ${product.stock} unidades — por debajo del mínimo (${product.minStock}).`,
      type: 'WARNING',
      data: { productId: product.id, kind: 'LOW_STOCK' },
    };
    managerIds.forEach((userId) => emitToUser(userId, socketEvents.NEW_NOTIFICATION, payload));
  }
}

export async function notifyLowStock(businessId: string, product: { id: string; name: string; stock: number; minStock: number }) {
  await notifyLowStockBatch(businessId, [product]);
}

// Batch variant para créditos recién marcados como vencidos — mismo patrón que
// notifyLowStockBatch: una sola consulta de administradores y un solo INSERT.
export async function notifyCreditsOverdueBatch(
  businessId: string,
  credits: Array<{ id: string; customerName: string; balance: number }>,
) {
  if (credits.length === 0) return;

  const managers = await prisma.user.findMany({
    where: { branch: { businessId }, role: { in: ['ADMIN', 'SUPERVISOR'] }, deletedAt: null, isActive: true },
    select: { id: true },
  });

  if (managers.length === 0) return;
  const managerIds = managers.map((m) => m.id);

  await prisma.notification.createMany({
    data: credits.flatMap((credit) =>
      managerIds.map((userId) => ({
        userId,
        title: 'Fiado vencido',
        message: `El fiado de ${credit.customerName} venció — saldo pendiente de $${credit.balance.toLocaleString('es-CO')}.`,
        type: 'WARNING',
        data: { creditId: credit.id, kind: 'CREDIT_OVERDUE' } as any,
      })),
    ),
  });

  for (const credit of credits) {
    const payload = {
      title: 'Fiado vencido',
      message: `El fiado de ${credit.customerName} venció — saldo pendiente de $${credit.balance.toLocaleString('es-CO')}.`,
      type: 'WARNING',
      data: { creditId: credit.id, kind: 'CREDIT_OVERDUE' },
    };
    managerIds.forEach((userId) => emitToUser(userId, socketEvents.NEW_NOTIFICATION, payload));
  }
}