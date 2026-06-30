import Redis from 'ioredis';
import { logger } from './logger';

let redisAvailable = false;

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 0,
  retryStrategy() {
    // No reintentar — Redis es opcional
    return null;
  },
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', () => {
  // Solo loguear una vez cuando Redis no está disponible
  if (redisAvailable) {
    redisAvailable = false;
    logger.warn('Redis desconectado — continuando sin cache');
  }
});

redis.on('connect', () => {
  redisAvailable = true;
  logger.info('Redis connected');
});

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
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // no-op — cache is best-effort
    }
  },
};
