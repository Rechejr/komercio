import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../config/database', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

jest.mock('../../config/redis', () => ({
  redis: { ping: jest.fn() },
  cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
}));

const mockPrisma = prisma as unknown as { $queryRaw: jest.Mock };
const mockRedis = redis as unknown as { ping: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  mockRedis.ping.mockResolvedValue('PONG');
});

// ─── Liveness ─────────────────────────────────────────────────────────────────

describe('GET /health (liveness)', () => {
  it('responde 200 sin consultar la base de datos', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('Ventrix API');
    // Clave: reiniciar el contenedor no arregla una caida de Neon, asi que la
    // liveness no debe depender de la base de datos.
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reporta el tiempo que lleva arriba', async () => {
    const res = await request(app).get('/health');

    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

// ─── Readiness ────────────────────────────────────────────────────────────────

describe('GET /health/ready (readiness)', () => {
  it('responde 200 y status ok cuando base de datos y cache responden', async () => {
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.ok).toBe(true);
    expect(res.body.checks.cache.ok).toBe(true);
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });

  it('responde 503 cuando la base de datos no responde', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.checks.database.ok).toBe(false);
    expect(res.body.checks.database.error).toContain('connection refused');
  });

  it('responde 200 y status degraded cuando solo falla Redis', async () => {
    // Redis es opcional por diseno: el cache falla en silencio y la app sigue
    // operando. Devolver 503 aqui seria una falsa alarma para el monitor.
    mockRedis.ping.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.ok).toBe(true);
    expect(res.body.checks.cache.ok).toBe(false);
  });

  it('marca la base de datos como requerida y el cache como opcional', async () => {
    const res = await request(app).get('/health/ready');

    expect(res.body.checks.database.required).toBe(true);
    expect(res.body.checks.cache.required).toBe(false);
  });
});
