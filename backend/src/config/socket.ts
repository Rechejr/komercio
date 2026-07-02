import { Server as HTTPServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { logger } from './logger';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from './database';

let io: SocketServer;

export function initSocket(httpServer: HTTPServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
        const allowed = process.env.CORS_ORIGIN?.split(',') || [];
        callback(allowed.includes(origin) ? null : new Error('CORS'), allowed.includes(origin));
      },
      credentials: true,
    },
    pingTimeout: 60000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyAccessToken(token);
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as any).user;
    logger.info(`Socket connected: ${socket.id} | User: ${user?.userId}`);

    socket.join(`user:${user?.userId}`);
    if (user?.businessId) socket.join(`business:${user.businessId}`);
    if (user?.branchId) socket.join(`branch:${user.branchId}`);

    // Revalidate user every 60 s — forces disconnect if deactivated or deleted
    const revalidateInterval = setInterval(async () => {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user?.userId },
          select: { isActive: true, deletedAt: true },
        });
        if (!dbUser || !dbUser.isActive || dbUser.deletedAt) {
          socket.disconnect(true);
        }
      } catch {
        // best-effort — don't disconnect on transient DB error
      }
    }, 60_000);

    socket.on('disconnect', () => {
      clearInterval(revalidateInterval);
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

export const socketEvents = {
  NEW_SALE: 'new_sale',
  SALE_UPDATED: 'sale_updated',
  INVENTORY_UPDATED: 'inventory_updated',
  NEW_CUSTOMER: 'new_customer',
  LOW_STOCK_ALERT: 'low_stock_alert',
  PAYMENT_RECEIVED: 'payment_received',
  CASH_REGISTER_OPENED: 'cash_register_opened',
  CASH_REGISTER_CLOSED: 'cash_register_closed',
  NEW_NOTIFICATION: 'new_notification',
};

export function emitToBusinesss(businessId: string, event: string, data: unknown) {
  getIO().to(`business:${businessId}`).emit(event, data);
}

export function emitToUser(userId: string, event: string, data: unknown) {
  getIO().to(`user:${userId}`).emit(event, data);
}
