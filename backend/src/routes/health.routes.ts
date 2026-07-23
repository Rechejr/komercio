import { Router } from 'express';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

const router = Router();

const startedAt = Date.now();

// Si una dependencia no responde en este tiempo, se da por caída. Sin esto, una
// base de datos colgada (que no rechaza, simplemente nunca contesta) dejaría el
// health check esperando para siempre y el monitor no sabría distinguir "lento"
// de "muerto".
const CHECK_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`sin respuesta tras ${ms}ms`)), ms);
    // unref para que este temporizador no impida que el proceso termine.
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

async function check(fn: () => Promise<unknown>) {
  const t0 = Date.now();
  try {
    await withTimeout(fn(), CHECK_TIMEOUT_MS);
    return { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: (err as Error).message };
  }
}

/**
 * Liveness: ¿el proceso está vivo?
 *
 * A propósito NO consulta la base de datos. Railway usa esto para decidir si
 * reinicia el contenedor, y reiniciar no arregla una caída de Neon — solo
 * produciría un ciclo de reinicios mientras el problema está afuera.
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Ventrix API',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  });
});

/**
 * Readiness: ¿la aplicación puede atender de verdad?
 *
 * Este es el endpoint que debe vigilar el monitor de uptime, porque comprueba
 * las dependencias en lugar de confiar en que el proceso responde.
 *
 * Postgres es esencial: si no responde, la app no sirve para nada y se devuelve
 * 503. Redis es opcional por diseño (ver config/redis.ts: el cache falla en
 * silencio y la app sigue operando sin él), así que su caída se reporta como
 * "degraded" pero no marca la instancia como no disponible — alertar por eso
 * sería una falsa alarma.
 */
router.get('/health/ready', async (_req, res) => {
  const [database, cache] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`),
    check(() => redis.ping()),
  ]);

  const status = !database.ok ? 'unhealthy' : !cache.ok ? 'degraded' : 'ok';
  const httpStatus = database.ok ? 200 : 503;

  if (!database.ok) {
    logger.error('Health check: base de datos no responde', { error: database.error });
  }

  res.status(httpStatus).json({
    status,
    service: 'Ventrix API',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    checks: {
      database: { ...database, required: true },
      cache: { ...cache, required: false },
    },
  });
});

export default router;
