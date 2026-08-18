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

  // Web Push al móvil aunque la app esté cerrada (best-effort; no-op sin VAPID o
  // sin suscripciones). Un solo push-resumen por lote para no saturar.
  const pushBody = products.length === 1
    ? `${products[0].name} tiene ${products[0].stock} unidades — por debajo del mínimo.`
    : `${products.length} productos están por debajo de su stock mínimo.`;
  await sendPushToUsers(managerIds, {
    title: 'Ventrix · Stock bajo',
    body: pushBody,
    url: '/inventario',
    tag: 'low-stock',
  });
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

// Avisa a los administradores del POS que una cuenta por COBRAR (fiado de
// cliente) o por PAGAR (a proveedor) está próxima a vencer. Deduplica por
// refId+kind: como el job corre a diario, un mismo crédito/cuenta se avisa UNA
// sola vez (al entrar a la ventana de 3 días), no todos los días.
export async function notifyDueSoonBatch(
  businessId: string,
  kind: 'CREDIT_DUE_SOON' | 'PAYABLE_DUE_SOON',
  items: Array<{ refId: string; title: string; message: string; href: string }>,
): Promise<number> {
  if (items.length === 0) return 0;

  const managers = await prisma.user.findMany({
    where: { branch: { businessId }, role: { in: ['ADMIN', 'SUPERVISOR'] }, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (managers.length === 0) return 0;
  const managerIds = managers.map((m) => m.id);

  const existentes = await prisma.notification.findMany({
    where: { userId: { in: managerIds }, data: { path: ['kind'], equals: kind } },
    select: { data: true },
  });
  const yaAvisados = new Set(
    existentes.map((n) => (n.data as { refId?: string } | null)?.refId).filter(Boolean),
  );
  const nuevos = items.filter((it) => !yaAvisados.has(it.refId));
  if (nuevos.length === 0) return 0;

  await prisma.notification.createMany({
    data: nuevos.flatMap((it) =>
      managerIds.map((userId) => ({
        userId,
        title: it.title,
        message: it.message,
        type: 'WARNING',
        data: { kind, refId: it.refId, href: it.href } as any,
      })),
    ),
  });

  // Socket en vivo (best-effort): si falla, ya quedó en la campanita.
  try {
    for (const it of nuevos) {
      const payload = { title: it.title, message: it.message, type: 'WARNING', data: { kind, refId: it.refId, href: it.href } };
      managerIds.forEach((userId) => emitToUser(userId, socketEvents.NEW_NOTIFICATION, payload));
    }
  } catch { /* socket opcional */ }

  // Web Push al móvil aunque la app esté cerrada (best-effort; no-op si no hay
  // suscripciones o VAPID). Un solo push-resumen por corrida para no saturar.
  const pushBody = nuevos.length === 1
    ? nuevos[0].message
    : `${nuevos.length} cuentas están próximas a vencer.`;
  await sendPushToUsers(managerIds, {
    title: kind === 'CREDIT_DUE_SOON' ? 'Ventrix · Fiados por vencer' : 'Ventrix · Cuentas por pagar',
    body: pushBody,
    url: nuevos.length === 1 ? nuevos[0].href : (kind === 'CREDIT_DUE_SOON' ? '/creditos' : '/cuentas-por-pagar'),
    tag: `due-soon-${kind}`,
  });

  return nuevos.length;
}

// Notifica a los usuarios de una OFICINA CONTABLE (ADMIN/AUXILIAR) sobre
// vencimientos que ya vencieron o vencen pronto. Dedup: un vencimiento se notifica
// UNA sola vez (se salta si ya hay una notificación suya para esos usuarios).
export async function notifyContableVencimientos(
  businessId: string,
  // `hito` marca EN QUÉ MOMENTO de la cuenta regresiva está el vencimiento
  // (previo → cerca → hoy → vencido). Antes se avisaba una sola vez en la vida
  // del vencimiento: al contador le llegaba el aviso a 5 días y nunca más, ni el
  // día que vencía. Ahora se avisa una vez POR HITO.
  vencimientos: Array<{ id: string; titulo: string; mensaje: string; href: string; hito: string }>,
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
  // La llave del dedup es vencimiento + hito: el mismo vencimiento vuelve a
  // avisar cuando cambia de etapa, pero no repite la misma etapa dos veces.
  const yaNotificados = new Set(
    existentes
      .map((n) => n.data as { vencimientoId?: string; hito?: string } | null)
      .filter((d): d is { vencimientoId: string; hito?: string } => !!d?.vencimientoId)
      // Las notificaciones creadas antes de que existieran los hitos no tienen
      // el campo: cuentan como el hito 'previo' para no repetirle al contador un
      // aviso que ya vio.
      .map((d) => `${d.vencimientoId}:${d.hito || 'previo'}`),
  );
  const nuevos = vencimientos.filter((v) => !yaNotificados.has(`${v.id}:${v.hito}`));

  if (nuevos.length > 0) {
    await prisma.notification.createMany({
      data: nuevos.flatMap((v) =>
        userIds.map((userId) => ({
          userId,
          title: v.titulo,
          message: v.mensaje,
          type: 'WARNING',
          data: { vencimientoId: v.id, kind: 'VENC_ALERTA', hito: v.hito, href: v.href } as any,
        })),
      ),
    });
  }

  // El push en vivo por socket es "mejor esfuerzo": si falla, la notificación ya
  // quedó persistida (se ve al abrir la campanita), así que no debe romper nada.
  try {
    for (const v of nuevos) {
      const payload = { title: v.titulo, message: v.mensaje, type: 'WARNING', data: { vencimientoId: v.id, kind: 'VENC_ALERTA', href: v.href } };
      userIds.forEach((userId) => emitToUser(userId, socketEvents.NEW_NOTIFICATION, payload));
    }
  } catch { /* socket opcional */ }

  // ── Web Push al móvil, con la app cerrada ───────────────────────────────────
  // Se manda TODOS los días mientras queden obligaciones sin presentar, no solo
  // cuando hay un aviso nuevo: una declaración vencida sigue vencida mañana, y el
  // contador necesita que se lo recuerden hasta que la presente. Una sola vez al
  // día (lastVencPushAt), para que un reinicio del servidor no vuelva a sonar.
  const hoyBogota = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const negocio = await prisma.business.findUnique({
    where: { id: businessId },
    select: { lastVencPushAt: true },
  });
  const ultimoPush = negocio?.lastVencPushAt
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(negocio.lastVencPushAt)
    : null;

  if (ultimoPush !== hoyBogota) {
    const vencidas = vencimientos.filter((v) => v.hito === 'vencido').length;
    const porVencer = vencimientos.length - vencidas;
    let body: string;
    if (vencimientos.length === 1) {
      body = vencimientos[0].mensaje;
    } else if (vencidas > 0 && porVencer > 0) {
      body = `${vencidas} obligación${vencidas === 1 ? '' : 'es'} vencida${vencidas === 1 ? '' : 's'} y ${porVencer} por vencer. Toca para revisarlas.`;
    } else if (vencidas > 0) {
      body = `${vencidas} obligaciones vencidas sin presentar. Toca para revisarlas.`;
    } else {
      body = `${porVencer} obligaciones están por vencer. Toca para revisarlas.`;
    }

    await sendPushToUsers(userIds, {
      title: 'Ventrix Contable · Vencimientos',
      body,
      url: '/contable/panel',
      tag: 'venc-alerta',
    });
    await prisma.business.update({ where: { id: businessId }, data: { lastVencPushAt: new Date() } });
  }

  return nuevos.length;
}