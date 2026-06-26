import { Response } from 'express';
import { success, created, paginated, AppError } from '../../utils/response';

function mockRes(): jest.Mocked<Pick<Response, 'status' | 'json'>> {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res as any);
  res.json.mockReturnValue(res as any);
  return res as any;
}

describe('success', () => {
  it('responde con 200 y el shape correcto', () => {
    const res = mockRes();
    success(res as unknown as Response, { id: 1 }, 'OK');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'OK', data: { id: 1 } });
  });

  it('permite un statusCode personalizado', () => {
    const res = mockRes();
    success(res as unknown as Response, null, 'Parcial', 206);
    expect(res.status).toHaveBeenCalledWith(206);
  });
});

describe('created', () => {
  it('responde con 201 y success true', () => {
    const res = mockRes();
    created(res as unknown as Response, { id: 'abc' });
    expect(res.status).toHaveBeenCalledWith(201);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 'abc' });
  });
});

describe('paginated', () => {
  it('calcula totalPages y hasNext correctamente', () => {
    const res = mockRes();
    paginated(res as unknown as Response, [1, 2, 3], 30, 1, 10);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.pagination.total).toBe(30);
    expect(body.pagination.totalPages).toBe(3);
    expect(body.pagination.hasNext).toBe(true);
    expect(body.pagination.hasPrev).toBe(false);
  });

  it('hasPrev es true en páginas > 1', () => {
    const res = mockRes();
    paginated(res as unknown as Response, [1], 30, 2, 10);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.pagination.hasPrev).toBe(true);
  });

  it('hasNext es false en la última página', () => {
    const res = mockRes();
    paginated(res as unknown as Response, [1], 10, 1, 10);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.pagination.hasNext).toBe(false);
  });
});

describe('AppError', () => {
  it('crea un error con el statusCode indicado', () => {
    const err = new AppError('No encontrado', 404);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('No encontrado');
    expect(err.statusCode).toBe(404);
    expect(err.isOperational).toBe(true);
  });

  it('usa 400 como statusCode por defecto', () => {
    const err = new AppError('Error de validación');
    expect(err.statusCode).toBe(400);
  });

  it('permite sobrescribir isOperational', () => {
    const err = new AppError('Fatal', 500, false);
    expect(err.isOperational).toBe(false);
  });
});
