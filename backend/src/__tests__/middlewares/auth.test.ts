import { Response, NextFunction } from 'express';
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth';
import * as jwtUtils from '../../utils/jwt';
import { AppError } from '../../utils/response';

jest.mock('../../utils/jwt');

const mockVerify = jwtUtils.verifyAccessToken as jest.MockedFunction<typeof jwtUtils.verifyAccessToken>;

function makeCtx(authHeader?: string) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} } as AuthRequest;
  const res = {} as Response;
  const next = jest.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('authenticate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('llama next con AppError 401 cuando no hay header Authorization', () => {
    const { req, res, next } = makeCtx();
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(401);
  });

  it('llama next con AppError 401 cuando el header no empieza con Bearer', () => {
    const { req, res, next } = makeCtx('Basic dXNlcjpwYXNz');
    authenticate(req, res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(401);
  });

  it('llama next con AppError 401 cuando el token es inválido', () => {
    const { req, res, next } = makeCtx('Bearer token.invalido');
    mockVerify.mockImplementation(() => { throw new Error('jwt malformed'); });
    authenticate(req, res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(401);
  });

  it('adjunta user al request y llama next sin argumentos cuando el token es válido', () => {
    const payload = { userId: '1', email: 'a@b.com', role: 'CASHIER' };
    const { req, res, next } = makeCtx('Bearer tokenvalido');
    mockVerify.mockReturnValue(payload);
    authenticate(req, res, next);
    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('authorize', () => {
  beforeEach(() => jest.clearAllMocks());

  it('llama next con AppError 401 cuando no hay user en el request', () => {
    const { req, res, next } = makeCtx();
    authorize('ADMIN')(req, res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(401);
  });

  it('llama next con AppError 403 cuando el rol del usuario no está permitido', () => {
    const { req, res, next } = makeCtx();
    req.user = { userId: '1', email: 'a@b.com', role: 'CASHIER' };
    authorize('ADMIN', 'SUPERVISOR')(req, res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(403);
  });

  it('llama next sin argumentos cuando el rol del usuario está en la lista', () => {
    const { req, res, next } = makeCtx();
    req.user = { userId: '1', email: 'a@b.com', role: 'SUPERVISOR' };
    authorize('ADMIN', 'SUPERVISOR')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('acepta múltiples roles permitidos', () => {
    const roles = ['ADMIN', 'SUPERVISOR', 'WAREHOUSE'] as const;
    for (const role of roles) {
      const { req, res, next } = makeCtx();
      req.user = { userId: '1', email: 'a@b.com', role };
      authorize(...roles)(req, res, next);
      expect(next).toHaveBeenCalledWith();
      jest.clearAllMocks();
    }
  });
});
