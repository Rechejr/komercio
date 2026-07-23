import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../config/database', () => ({
  prisma: {
    inventoryMovement: { findMany: jest.fn(), count: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  redis: { ping: jest.fn() },
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

beforeEach(() => {
  jest.clearAllMocks();
  (mockPrisma.inventoryMovement.findMany as jest.Mock).mockResolvedValue([]);
  (mockPrisma.inventoryMovement.count as jest.Mock).mockResolvedValue(0);
  (mockPrisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([
    { total_cost: 1000, total_sale: 1800, count: BigInt(5) },
  ]);
});

// Estos endpoints revelan el costo de la mercancía: /valuation devuelve
// totalCostValue y potentialProfit, y /movements devuelve filas completas de
// inventory_movements, que incluyen unitCost y totalCost. El margen del negocio
// no debe quedar expuesto a roles operativos.

describe('GET /api/v1/inventory/valuation — control de acceso', () => {
  it.each(['CASHIER', 'SELLER', 'WAREHOUSE'])(
    'rechaza con 403 al rol %s (revelaría el margen del negocio)',
    async (role) => {
      const res = await request(app)
        .get('/api/v1/inventory/valuation')
        .set(authHeader(role));

      expect(res.status).toBe(403);
      // No debe filtrarse ningún dato de costo junto con el rechazo.
      expect(JSON.stringify(res.body)).not.toMatch(/totalCostValue|potentialProfit/);
    },
  );

  it.each(['ADMIN', 'SUPERVISOR'])('permite el acceso al rol %s', async (role) => {
    const res = await request(app)
      .get('/api/v1/inventory/valuation')
      .set(authHeader(role));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalCostValue');
    expect(res.body.data).toHaveProperty('potentialProfit');
  });
});

describe('GET /api/v1/inventory/movements — control de acceso', () => {
  it.each(['CASHIER', 'SELLER', 'WAREHOUSE'])(
    'rechaza con 403 al rol %s (las filas incluyen unitCost y totalCost)',
    async (role) => {
      const res = await request(app)
        .get('/api/v1/inventory/movements')
        .set(authHeader(role));

      expect(res.status).toBe(403);
      // La consulta ni siquiera debe ejecutarse si el rol no tiene permiso.
      expect(mockPrisma.inventoryMovement.findMany).not.toHaveBeenCalled();
    },
  );

  it.each(['ADMIN', 'SUPERVISOR'])('permite el acceso al rol %s', async (role) => {
    const res = await request(app)
      .get('/api/v1/inventory/movements')
      .set(authHeader(role));

    expect(res.status).toBe(200);
    expect(mockPrisma.inventoryMovement.findMany).toHaveBeenCalled();
  });
});

describe('GET /api/v1/inventory/* — sin autenticar', () => {
  it('rechaza con 401 si no hay token', async () => {
    const res = await request(app).get('/api/v1/inventory/valuation');
    expect(res.status).toBe(401);
  });
});
