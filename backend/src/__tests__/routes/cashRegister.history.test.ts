import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

jest.mock('../../config/database', () => ({
  prisma: {
    branch: { findMany: jest.fn() },
    cashRegister: { findMany: jest.fn(), count: jest.fn() },
    user: { findMany: jest.fn() },
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
    userId: 'user-1', email: 'admin@test.com', role, businessId: 'biz-1', branchId: 'branch-1',
  } as any);
  return { Authorization: 'Bearer valid-token' };
}

describe('GET /api/v1/cash-register/history', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 403 para un CASHIER', async () => {
    const res = await request(app).get('/api/v1/cash-register/history').set(authHeader('CASHIER'));
    expect(res.status).toBe(403);
  });

  it('resuelve los nombres de openedBy/closedBy y arma la paginación', async () => {
    (mockPrisma.branch.findMany as jest.Mock).mockResolvedValue([{ id: 'branch-1' }]);
    (mockPrisma.cashRegister.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'reg-1', branchId: 'branch-1', openedBy: 'user-a', closedBy: 'user-b',
        openingAmount: 50000, closingAmount: 48000, expectedAmount: 50000, difference: -2000,
        status: 'CLOSED', openedAt: new Date(), closedAt: new Date(),
        branch: { id: 'branch-1', name: 'Sucursal Principal' },
      },
    ]);
    (mockPrisma.cashRegister.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'user-a', name: 'Vendedor A' },
      { id: 'user-b', name: 'Admin B' },
    ]);

    const res = await request(app).get('/api/v1/cash-register/history').set(authHeader('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data[0].openedByName).toBe('Vendedor A');
    expect(res.body.data[0].closedByName).toBe('Admin B');
    expect(res.body.pagination.total).toBe(1);
  });

  it('filtra por userId (openedBy) cuando se pasa el query param', async () => {
    (mockPrisma.branch.findMany as jest.Mock).mockResolvedValue([{ id: 'branch-1' }]);
    (mockPrisma.cashRegister.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.cashRegister.count as jest.Mock).mockResolvedValue(0);

    await request(app).get('/api/v1/cash-register/history?userId=user-a').set(authHeader('SUPERVISOR'));

    expect(mockPrisma.cashRegister.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ openedBy: 'user-a' }) }),
    );
  });
});
