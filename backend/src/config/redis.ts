import Redis from 'ioredis';
import { logger } from './logger';

let redisAvailable = false;

// En las pruebas Redis se comporta como antes: un solo intento y listo. Si
// reintentara, Jest quedaría con un temporizador abierto y la suite del CI se
// colgaría (ya pasó: ~20 minutos de espera por esto).
const enPruebas = process.env.NODE_ENV === 'test';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  // Ningún request espera por Redis: si no hay conexión, el comando falla al
  // instante y el cache devuelve null. Con la cola de espera activada (el
  // comportamiento por omisión de ioredis) cada consulta se quedaría esperando
  // a que Redis volviera, y una caída del cache se sentiría como una caída del
  // sistema.
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  enableReadyCheck: false,
  lazyConnect: true,
  // Esto devolvía null, que en ioredis significa "no reintentes nunca": al
  // primer fallo la conexión quedaba cerrada para siempre y la instancia
  // seguía sin cache hasta el siguiente despliegue, aunque Redis hubiera
  // vuelto a los dos segundos. Ahora reintenta con espera creciente (1s, 2s,
  // 3s… con techo de 30s), así una caída corta se cura sola.
  retryStrategy: enPruebas ? () => null : (intentos) => Math.min(intentos * 1_000, 30_000),
});

redis.on('error', () => {
  // Un aviso por caída, no uno por comando: si no, un Redis apagado llena el
  // log de líneas idénticas.
  if (redisAvailable) {
    redisAvailable = false;
    logger.warn('Redis desconectado — se sigue operando sin cache');
  }
});

redis.on('connect', () => {
  if (!redisAvailable) {
    redisAvailable = true;
    logger.info('Redis conectado');
  }
});

// Se conecta al arrancar en vez de esperar la primera consulta, para que el
// estado de la conexión (y el /health/ready) diga la verdad desde el minuto uno
// y no dependa de que alguien haya pedido un reporte.
if (!enPruebas) {
  redis.connect().catch(() => {
    // El propio retryStrategy se encarga de volver a intentar.
  });
}

// Redis is optional (see redisAvailable above) — every method fails silently
// so the app keeps working without cache when Redis isn't reachable.
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // no-op — cache is best-effort
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch {
      // no-op — cache is best-effort
    }
  },

  async delPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      const keys: string[] = [];
      do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // no-op — cache is best-effort
    }
  },
};
