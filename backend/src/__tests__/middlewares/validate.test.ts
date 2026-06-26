import { Request, Response, NextFunction } from 'express';
import { validate } from '../../middlewares/validate';
import { validationResult } from 'express-validator';

jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
}));

const mockValidationResult = validationResult as jest.MockedFunction<typeof validationResult>;

function makeCtx() {
  const req = {} as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('validate middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('llama next() cuando no hay errores de validación', () => {
    const { req, res, next } = makeCtx();
    mockValidationResult.mockReturnValue({ isEmpty: () => true } as any);
    validate(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it('responde con 422 y los detalles cuando hay errores', () => {
    const { req, res, next } = makeCtx();
    mockValidationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [
        { path: 'email', msg: 'Email inválido' },
        { path: 'password', msg: 'Mínimo 8 caracteres' },
      ],
    } as any);

    validate(req, res, next);

    expect((res as any).status).toHaveBeenCalledWith(422);
    expect((res as any).json).toHaveBeenCalledWith({
      success: false,
      error: 'Datos inválidos',
      details: [
        { field: 'email', message: 'Email inválido' },
        { field: 'password', message: 'Mínimo 8 caracteres' },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('no llama next() cuando hay errores', () => {
    const { req, res, next } = makeCtx();
    mockValidationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [{ path: 'name', msg: 'Requerido' }],
    } as any);
    validate(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
