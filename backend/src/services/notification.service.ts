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

  const notifications = await prisma.$transaction(
    userIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          title: opts.title,
          message: opts.message,
          type: opts.type || 'INFO',
          data: (opts.data || undefined) as any,
        },
      }),
    ),
  );

  notifications.forEach((n) => emitToUser(n.userId, socketEvents.NEW_NOTIFICATION, n));
}

export async function notifyLowStock(businessId: string, product: { id: string; name: string; stock: number; minStock: number }) {
  const managers = await prisma.user.findMany({
    where: { branch: { businessId }, role: { in: ['ADMIN', 'SUPERVISOR'] }, deletedAt: null, isActive: true },
    select: { id: true },
  });

  await notifyUsers(managers.map((m) => m.id), {
    title: 'Stock bajo',
    message: `${product.name} tiene ${product.stock} unidades — por debajo del mínimo (${product.minStock}).`,
    type: 'WARNING',
    data: { productId: product.id, kind: 'LOW_STOCK' },
  });
}
