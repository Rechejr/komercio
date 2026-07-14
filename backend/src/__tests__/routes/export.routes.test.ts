import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

jest.mock('../../config/database', () => ({
  prisma: {
    business: { findUnique: jest.fn() },
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

describe('GET /api/v1/exports/financial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Plan Pro con branches — para que planLimit.exports() (que corre antes que
    // el authorize() de esta ruta) deje pasar la petición hasta el chequeo de rol.
    (mockPrisma.business.findUnique as jest.Mock).mockResolvedValue({
      id: 'biz-1', plan: 'pro', planExpiresAt: null, branches: [{ id: 'br-1' }],
    });
  });

  it('rechaza con 403 a un CASHIER — el reporte financiero (costos/utilidad/cartera) es solo para ADMIN/SUPERVISOR', async () => {
    const res = await request(app)
      .get('/api/v1/exports/financial')
      .set(authHeader('CASHIER'));

    expect(res.status).toBe(403);
  });

  it('rechaza con 403 a un SELLER', async () => {
    const res = await request(app)
      .get('/api/v1/exports/financial')
      .set(authHeader('SELLER'));

    expect(res.status).toBe(403);
  });
});
