import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';
import {
  permisosEfectivos, soloDiferencias, normalizarOverrides, permisosDeRol,
} from '../../config/permissions';

jest.mock('../../config/database', () => ({
  prisma: {
    user: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
    business: { findUnique: jest.fn(), findFirst: jest.fn() },
    cashRegister: { findMany: jest.fn(), count: jest.fn() },
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

function authHeader(role: string, userId = 'user-1') {
  mockJwt.verifyAccessToken.mockReturnValue({
    userId, email: 'x@test.com', role, businessId: 'biz-1', branchId: 'branch-1',
  } as any);
  return { Authorization: 'Bearer valid-token' };
}

/** Cómo se ve el usuario en la base para el middleware de permisos. */
function enLaBase(role: string, permissions: unknown = null, esDueno = false) {
  (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({
    role, permissions, businesses: esDueno ? [{ id: 'biz-1' }] : [],
  });
}

describe('permisos por usuario', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('cálculo', () => {
    it('sin marcas, una persona tiene exactamente lo de su rol', () => {
      expect([...permisosEfectivos('CASHIER', null)].sort()).toEqual([...permisosDeRol('CASHIER')].sort());
    });

    it('una marca en true agrega un permiso que el rol no traía', () => {
      expect(permisosDeRol('CASHIER')).not.toContain('reportes.ver');
      expect(permisosEfectivos('CASHIER', { 'reportes.ver': true })).toContain('reportes.ver');
    });

    it('una marca en false quita un permiso que el rol sí traía', () => {
      expect(permisosDeRol('SUPERVISOR')).toContain('ventas.anular');
      expect(permisosEfectivos('SUPERVISOR', { 'ventas.anular': false })).not.toContain('ventas.anular');
    });

    it('descarta llaves inventadas y valores que no son booleanos', () => {
      expect(normalizarOverrides({ 'no.existe': true, 'ventas.ver': 'si', 'ventas.anular': true }))
        .toEqual({ 'ventas.anular': true });
    });

    it('solo guarda lo que difiere del rol, para que cambiarle el rol después siga teniendo sentido', () => {
      // Para un cajero, "ventas.ver" ya viene con el rol: no hay nada que guardar.
      expect(soloDiferencias('CASHIER', { 'ventas.ver': true })).toEqual({});
      expect(soloDiferencias('CASHIER', { 'reportes.ver': true })).toEqual({ 'reportes.ver': true });
    });
  });

  describe('en las rutas', () => {
    it('un cajero no entra al historial de caja (su rol no lo trae)', async () => {
      enLaBase('CASHIER');
      const res = await request(app).get('/api/v1/cash-register/history').set(authHeader('CASHIER'));
      expect(res.status).toBe(403);
    });

    it('...pero sí entra si el dueño se lo marcó', async () => {
      enLaBase('CASHIER', { 'caja.historial': true });
      (mockPrisma.cashRegister.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.cashRegister.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app).get('/api/v1/cash-register/history').set(authHeader('CASHIER'));
      expect(res.status).not.toBe(403);
    });

    it('a un supervisor se le puede quitar la anulación de ventas', async () => {
      enLaBase('SUPERVISOR', { 'ventas.anular': false });
      const res = await request(app).patch('/api/v1/sales/abc/cancel').set(authHeader('SUPERVISOR'));
      expect(res.status).toBe(403);
    });

    it('el dueño pasa aunque le hayan dejado marcas en contra', async () => {
      enLaBase('ADMIN', { 'caja.historial': false }, true);
      (mockPrisma.cashRegister.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.cashRegister.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app).get('/api/v1/cash-register/history').set(authHeader('ADMIN'));
      expect(res.status).not.toBe(403);
    });
  });

  describe('PATCH /users/:id/permissions', () => {
    it('no deja recortarle permisos al dueño de la cuenta', async () => {
      enLaBase('ADMIN', null, true);
      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'owner-1', role: 'ADMIN', name: 'Dueño', businesses: [{ id: 'biz-1' }] });
      (mockPrisma.business.findFirst as jest.Mock).mockResolvedValue({ id: 'biz-1' });

      const res = await request(app)
        .patch('/api/v1/users/owner-1/permissions')
        .set(authHeader('ADMIN', 'admin-2'))
        .send({ permissions: { 'ventas.ver': false } });

      expect(res.status).toBe(400);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('guarda solo la diferencia contra el rol', async () => {
      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: 'emp-1', role: 'CASHIER', name: 'Ana', businesses: [{ id: 'biz-1' }],
      });
      (mockPrisma.business.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        id: 'emp-1', name: 'Ana', role: 'CASHIER', permissions: { 'reportes.ver': true },
      });

      const res = await request(app)
        .patch('/api/v1/users/emp-1/permissions')
        .set(authHeader('ADMIN', 'admin-1'))
        .send({ permissions: { 'reportes.ver': true, 'ventas.ver': true } });

      expect(res.status).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { permissions: { 'reportes.ver': true } },
      }));
    });
  });
});
