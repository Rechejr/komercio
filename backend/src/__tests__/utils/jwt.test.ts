import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  TokenPayload,
} from '../../utils/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-jest-at-least-32-chars';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-jest-at-least-32-chars';
});

const payload: TokenPayload = {
  userId: 'user-123',
  email: 'test@example.com',
  role: 'ADMIN',
};

describe('generateAccessToken / verifyAccessToken', () => {
  it('genera un token válido y lo verifica correctamente', () => {
    const token = generateAccessToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  it('incluye campos opcionales cuando se pasan', () => {
    const payloadConBranch: TokenPayload = { ...payload, branchId: 'branch-456', businessId: 'biz-789' };
    const token = generateAccessToken(payloadConBranch);
    const decoded = verifyAccessToken(token);
    expect(decoded.branchId).toBe('branch-456');
    expect(decoded.businessId).toBe('biz-789');
  });

  it('lanza error al verificar con el secret incorrecto', () => {
    const tokenInvalido = jwt.sign(payload, 'wrong-secret');
    expect(() => verifyAccessToken(tokenInvalido)).toThrow();
  });

  it('lanza error al verificar un token malformado', () => {
    expect(() => verifyAccessToken('no.es.un.token')).toThrow();
  });
});

describe('generateRefreshToken / verifyRefreshToken', () => {
  it('genera un refresh token válido y lo verifica correctamente', () => {
    const token = generateRefreshToken(payload);
    expect(typeof token).toBe('string');

    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
  });

  it('lanza error al verificar un refresh token con el secret incorrecto', () => {
    const tokenInvalido = jwt.sign(payload, 'wrong-refresh-secret');
    expect(() => verifyRefreshToken(tokenInvalido)).toThrow();
  });

  it('access token y refresh token usan distintos secrets', () => {
    const accessToken = generateAccessToken(payload);
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });
});
