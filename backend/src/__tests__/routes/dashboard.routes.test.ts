import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

jest.mock('../../config/database', () => ({
  prisma: {
    business: { findUnique: jest.fn() },
    aiWeeklySummary: { findFirst: jest.fn() },
  },
}));

jest.mock('../../config/redis', () => ({
  cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
}));

jest.mock('../../utils/jwt', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockJwt = jwtUtils as jest.Mocked<typeof jwtUtils>;

function authHeader(role: string) {
  mockJwt.verifyAccessToken.mockReturnValue({
    userId: 'user-1', email: 'a@b.com', role, businessId: 'biz-1', branchId: 'br-1',
  } as any);
  return { Authorization: 'Bearer valid-token' };
}

describe('GET /api/v1/dashboard/ai-summary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rechaza con 403 en plan gratuito — el resumen con IA es solo Pro', async () => {
    (mockPrisma.business.findUnique as jest.Mock).mockResolvedValue({
      id: 'biz-1', plan: 'free', planExpiresAt: null, branches: [{ id: 'br-1' }],
    });

    const res = await request(app)
      .get('/api/v1/dashboard/ai-summary')
      .set(authHeader('ADMIN'));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/plan Pro/);
  });

  it('deja pasar en plan Pro y devuelve el resumen ya generado esta semana', async () => {
    (mockPrisma.business.findUnique as jest.Mock).mockResolvedValue({
      id: 'biz-1', plan: 'pro', planExpiresAt: null, branches: [{ id: 'br-1' }],
    });
    (mockPrisma.aiWeeklySummary.findFirst as jest.Mock).mockResolvedValue({
      summary: 'Resumen de prueba', createdAt: new Date(),
    });

    const res = await request(app)
      .get('/api/v1/dashboard/ai-summary')
      .set(authHeader('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBe('Resumen de prueba');
  });
});
