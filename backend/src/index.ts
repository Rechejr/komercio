import 'dotenv/config';
import app from './app';
import { createServer } from 'http';
import { initSocket } from './config/socket';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { redis } from './config/redis';

const PORT = process.env.PORT || 4000;

// DEBUG TEMPORAL — eliminar después de confirmar que las variables llegan
console.log('[ENV-CHECK]', JSON.stringify({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL ? 'SET(' + process.env.DATABASE_URL.slice(0, 20) + '...)' : 'MISSING',
  JWT_SECRET_LEN: process.env.JWT_SECRET?.length ?? 'UNDEFINED',
  JWT_REFRESH_LEN: process.env.JWT_REFRESH_SECRET?.length ?? 'UNDEFINED',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'UNDEFINED',
}));

async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    // Redis es opcional — si falla, la app sigue sin cache
    try {
      await redis.connect();
    } catch {
      logger.warn('Redis no disponible — corriendo sin cache');
      redis.disconnect();
    }

    const httpServer = createServer(app);
    initSocket(httpServer);

    httpServer.listen(PORT, () => {
      logger.info(`Komercio API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down...');
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

bootstrap();
