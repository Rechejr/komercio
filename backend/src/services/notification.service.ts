import { prisma } from '../config/database';
import { emitToUser, socketEvents } from '../config/socket';
import { sendPushToUsers } from '../config/webpush';

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

// Depura (borra) las notificaciones de "Stock bajo" del usuario que ya no son
// ciertas: producto eliminado, o producto que ya se resurtió por encima del
// mínimo. Así la campanita se mantiene al día sin alertas de productos que ya no
// existen (al hacer clic daban "producto no encontrado"). Best-effort: se llama
// al listar notificaciones / contar no leídas.
export async function pruneStaleLowStockNotifications(userId: string): Promise<void> {
  const lowStock = await prisma.notification.findMany({
    where: { userId, data: { path: ['kind'], equals: 'LOW_STOCK' } },
    select: { id: true, data: true },
  });
  if (lowStock.length === 0) return;

  const notifsPorProducto = new Map<string, string[]>();
  for (const n of lowStock) {
    const productId = (n.data as { productId?: string } | null)?.productId;
    if (!productId) continue;
    const arr = notifsPorProducto.get(productId) ?? [];
    arr.push(n.id);
    notifsPorProducto.set(productId, arr);
  }
  const productIds = [...notifsPorProducto.keys()];
  if (productIds.length === 0) return;

  // Productos que aún justifican la alerta: existen (no borrados) y siguen bajo mínimo.
  const vigentes = await prisma.product.findMany({
    where: { id: { in: productIds }, deletedAt: null },
    select: { id: true, stock: true, minStock: true },
  });
  const sigueBajo = new Set(vigentes.filter((p) => p.stock < p.minStock).map((p) => p.id));

  const obsoletas = [...notifsPorProducto.entries()]
    .filter(([productId]) => !sigueBajo.has(productId))
    .flatMap(([, ids]) => ids);

  if (obsoletas.length > 0) {
    await prisma.notification.deleteMany({ where: { id: { in: obsoletas } } });
  }
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

// Notifica a los usuarios de una OFICINA CONTABLE (ADMIN/AUXILIAR) sobre
// vencimientos que ya vencieron o vencen pronto. Dedup: un vencimiento se notifica
// UNA sola vez (se salta si ya hay una notificación suya para esos usuarios).
export async function notifyContableVencimientos(
  businessId: string,
  vencimientos: Array<{ id: string; titulo: string; mensaje: string; href: string }>,
): Promise<number> {
  if (vencimientos.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: { branch: { businessId }, role: { in: ['ADMIN', 'AUXILIAR'] }, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (users.length === 0) return 0;
  const userIds = users.map((u) => u.id);

  const existentes = await prisma.notification.findMany({
    where: { userId: { in: userIds }, data: { path: ['kind'], equals: 'VENC_ALERTA' } },
    select: { data: true },
  });
  const yaNotificados = new Set(
    existentes.map((n) => (n.data as { vencimientoId?: string } | null)?.vencimientoId).filter(Boolean),
  );
  const nuevos = vencimientos.filter((v) => !yaNotificados.has(v.id));
  if (nuevos.length === 0) return 0;

  await prisma.notification.createMany({
    data: nuevos.flatMap((v) =>
      userIds.map((userId) => ({
        userId,
        title: v.titulo,
        message: v.mensaje,
        type: 'WARNING',
        data: { vencimientoId: v.id, kind: 'VENC_ALERTA', href: v.href } as any,
      })),
    ),
  });

  // El push en vivo por socket es "mejor esfuerzo": si falla, la notificación ya
  // quedó persistida (se ve al abrir la campanita), así que no debe romper nada.
  try {
    for (const v of nuevos) {
      const payload = { title: v.titulo, message: v.mensaje, type: 'WARNING', data: { vencimientoId: v.id, kind: 'VENC_ALERTA', href: v.href } };
      userIds.forEach((userId) => emitToUser(userId, socketEvents.NEW_NOTIFICATION, payload));
    }
  } catch { /* socket opcional */ }

  // Web Push: una notificación-resumen que llega al MÓVIL aunque la app esté
  // cerrada (best-effort, no lanza). Un solo push por corrida en vez de N para
  // no saturar; el detalle está en la campanita al abrir.
  const pushBody = nuevos.length === 1
    ? nuevos[0].mensaje
    : `${nuevos.length} obligaciones vencidas o por vencer requieren tu atención.`;
  await sendPushToUsers(userIds, {
    title: 'Ventrix Contable · Vencimientos',
    body: pushBody,
    url: '/contable/panel',
    tag: 'venc-alerta',
  });

  return nuevos.length;
}