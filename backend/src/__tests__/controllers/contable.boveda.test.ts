import { Response, NextFunction } from 'express';
import { contableController } from '../../controllers/contable.controller';
import { prisma } from '../../config/database';
import { uploadDocument, deleteImage } from '../../config/cloudinary';
import { encrypt } from '../../utils/crypto';
import { AuthRequest } from '../../middlewares/auth';

// Bóveda de credenciales y documentos + panel. Lo sensible: las contraseñas de
// los portales (DIAN, bancos) se guardan CIFRADAS, nunca en claro, y ni ellas ni
// los documentos pueden alcanzarse desde otra oficina. El cifrado se usa real
// (AES-256-GCM sobre JWT_SECRET), no mockeado — es justo lo que hay que probar.

jest.mock('../../config/database', () => {
  const prismaMock: any = {
    taxClient: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    clientCredential: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    clientDocument: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    vencimiento: { findMany: jest.fn().mockResolvedValue([]) },
    resolucionDian: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((cb: any) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
  };
  return { prisma: prismaMock };
});

jest.mock('../../utils/pagination', () => ({
  getPagination: jest.fn().mockReturnValue({ page: 1, limit: 20, skip: 0 }),
  getSearch: jest.fn((req: any) => (req.query?.search as string) || undefined),
}));

jest.mock('../../config/cloudinary', () => ({
  uploadDocument: jest.fn().mockResolvedValue('https://cloudinary/doc.pdf'),
  deleteImage: jest.fn().mockResolvedValue(undefined),
}));

const mockPrisma = prisma as any;

const EN_UN_MES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function makeReq(overrides: Record<string, unknown> = {}): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'conta@x.com', role: 'ADMIN', businessId: 'ofi-1', branchId: 'br-1' },
    planExpiresAt: EN_UN_MES,
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as AuthRequest;
}

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json, status };
}

function makeNext() {
  return jest.fn() as unknown as NextFunction;
}

function errorDe(next: NextFunction) {
  const mock = next as unknown as jest.Mock;
  expect(mock).toHaveBeenCalledTimes(1);
  return mock.mock.calls[0][0] as { message: string; statusCode: number };
}

const cliente = { id: 'tc-1', businessId: 'ofi-1', razonSocial: 'Panadería El Trigo SAS', nit: '900123456' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.taxClient.findFirst.mockResolvedValue(cliente);
  mockPrisma.clientCredential.findMany.mockResolvedValue([]);
  mockPrisma.clientDocument.findMany.mockResolvedValue([]);
  mockPrisma.vencimiento.findMany.mockResolvedValue([]);
  mockPrisma.resolucionDian.findMany.mockResolvedValue([]);
  (uploadDocument as jest.Mock).mockResolvedValue('https://cloudinary/doc.pdf');
});

// ─── Credenciales ────────────────────────────────────────────────────────────

describe('contableController.createCredencial', () => {
  it('guarda la contraseña cifrada, nunca en texto plano', async () => {
    mockPrisma.clientCredential.create.mockResolvedValue({ id: 'cr-1' });
    const { res, status } = makeRes();

    await contableController.createCredencial(makeReq({
      body: { taxClientId: 'tc-1', entidad: 'DIAN', usuario1: '900123456', clave: 'SuperClave123*' },
    }), res, makeNext());

    const data = mockPrisma.clientCredential.create.mock.calls[0][0].data;
    expect(data.claveEnc).not.toContain('SuperClave123*');
    expect(data.claveEnc.split(':')).toHaveLength(3); // iv:tag:ciphertext
    expect(data).not.toHaveProperty('clave');
    expect(status).toHaveBeenCalledWith(201);
  });

  it('devuelve solo el id, sin eco de la contraseña', async () => {
    mockPrisma.clientCredential.create.mockResolvedValue({ id: 'cr-1', claveEnc: 'x:y:z' });
    const { res, json } = makeRes();

    await contableController.createCredencial(makeReq({
      body: { taxClientId: 'tc-1', entidad: 'DIAN', usuario1: '900123456', clave: 'SuperClave123*' },
    }), res, makeNext());

    expect(json.mock.calls[0][0].data).toEqual({ id: 'cr-1' });
  });

  it('404 si el cliente es de otra oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createCredencial(makeReq({
      body: { taxClientId: 'tc-ajeno', entidad: 'DIAN', usuario1: 'x', clave: 'y' },
    }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.clientCredential.create).not.toHaveBeenCalled();
  });

  it.each([
    ['sin entidad', { taxClientId: 'tc-1', entidad: ' ', usuario1: 'u', clave: 'c' }],
    ['sin usuario', { taxClientId: 'tc-1', entidad: 'DIAN', usuario1: '', clave: 'c' }],
    ['sin contraseña', { taxClientId: 'tc-1', entidad: 'DIAN', usuario1: 'u', clave: '' }],
  ])('rechaza la credencial %s', async (_caso, body) => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createCredencial(makeReq({ body }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.clientCredential.create).not.toHaveBeenCalled();
  });
});

describe('contableController.listCredenciales', () => {
  it('descifra la clave para que el contador la pueda copiar', async () => {
    mockPrisma.clientCredential.findMany.mockResolvedValue([
      { id: 'cr-1', entidad: 'DIAN', usuario1: '900123456', usuario2: null, claveEnc: encrypt('SuperClave123*'), link: null, taxClient: cliente },
    ]);
    const { res, json } = makeRes();

    await contableController.listCredenciales(makeReq(), res, makeNext());

    const fila = json.mock.calls[0][0].data[0];
    expect(fila.clave).toBe('SuperClave123*');
    expect(fila).not.toHaveProperty('claveEnc'); // el cifrado no se expone
  });

  it('devuelve vacío (no revienta) si la clave guardada no se puede descifrar', async () => {
    mockPrisma.clientCredential.findMany.mockResolvedValue([
      { id: 'cr-1', entidad: 'DIAN', usuario1: 'u', usuario2: null, claveEnc: 'basura-sin-formato', link: null, taxClient: cliente },
    ]);
    const { res, json } = makeRes();
    const next = makeNext();

    await contableController.listCredenciales(makeReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(json.mock.calls[0][0].data[0].clave).toBe('');
  });

  it('solo lista las credenciales vivas de la oficina', async () => {
    const { res } = makeRes();

    await contableController.listCredenciales(makeReq(), res, makeNext());

    expect(mockPrisma.clientCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, taxClient: { businessId: 'ofi-1' } } }),
    );
  });

  it('al buscar solo por letras no agrega el filtro de NIT', async () => {
    const { res } = makeRes();

    await contableController.listCredenciales(makeReq({ query: { search: 'dian' } }), res, makeNext());

    const or = mockPrisma.clientCredential.findMany.mock.calls[0][0].where.OR;
    // `contains: ''` traería TODO; por eso el filtro de NIT solo entra si hay dígitos.
    expect(or.some((c: any) => c.taxClient?.nit)).toBe(false);
    expect(or).toContainEqual({ entidad: { contains: 'dian', mode: 'insensitive' } });
  });

  it('al buscar con dígitos sí busca por NIT', async () => {
    const { res } = makeRes();

    await contableController.listCredenciales(makeReq({ query: { search: '900123' } }), res, makeNext());

    const or = mockPrisma.clientCredential.findMany.mock.calls[0][0].where.OR;
    expect(or).toContainEqual({ taxClient: { nit: { contains: '900123' } } });
  });
});

describe('contableController.updateCredencial', () => {
  it('404 si la credencial es de otra oficina', async () => {
    mockPrisma.clientCredential.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateCredencial(makeReq({ params: { id: 'cr-ajena' }, body: { entidad: 'DIAN' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.clientCredential.update).not.toHaveBeenCalled();
  });

  it('editar otros campos sin mandar clave conserva la contraseña guardada', async () => {
    mockPrisma.clientCredential.findFirst.mockResolvedValue({ id: 'cr-1' });
    const { res } = makeRes();

    await contableController.updateCredencial(makeReq({
      params: { id: 'cr-1' }, body: { entidad: 'DIAN actualizada' },
    }), res, makeNext());

    const data = mockPrisma.clientCredential.update.mock.calls[0][0].data;
    expect(data.entidad).toBe('DIAN actualizada');
    expect(data.claveEnc).toBeUndefined();
  });

  it('mandar la clave vacía tampoco la borra', async () => {
    mockPrisma.clientCredential.findFirst.mockResolvedValue({ id: 'cr-1' });
    const { res } = makeRes();

    await contableController.updateCredencial(makeReq({ params: { id: 'cr-1' }, body: { clave: '' } }), res, makeNext());

    expect(mockPrisma.clientCredential.update.mock.calls[0][0].data.claveEnc).toBeUndefined();
  });

  it('con una clave nueva la vuelve a cifrar', async () => {
    mockPrisma.clientCredential.findFirst.mockResolvedValue({ id: 'cr-1' });
    const { res } = makeRes();

    await contableController.updateCredencial(makeReq({ params: { id: 'cr-1' }, body: { clave: 'ClaveNueva456*' } }), res, makeNext());

    const claveEnc = mockPrisma.clientCredential.update.mock.calls[0][0].data.claveEnc;
    expect(claveEnc).not.toContain('ClaveNueva456*');
    expect(claveEnc.split(':')).toHaveLength(3);
  });

  it('no deja dejar la entidad en blanco', async () => {
    mockPrisma.clientCredential.findFirst.mockResolvedValue({ id: 'cr-1' });
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateCredencial(makeReq({ params: { id: 'cr-1' }, body: { entidad: '   ' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.clientCredential.update).not.toHaveBeenCalled();
  });
});

describe('contableController.deleteCredencial', () => {
  it('borra en suave, no elimina la fila', async () => {
    mockPrisma.clientCredential.findFirst.mockResolvedValue({ id: 'cr-1' });
    const { res } = makeRes();

    await contableController.deleteCredencial(makeReq({ params: { id: 'cr-1' } }), res, makeNext());

    expect(mockPrisma.clientCredential.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });

  it('404 si es de otra oficina', async () => {
    mockPrisma.clientCredential.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.deleteCredencial(makeReq({ params: { id: 'cr-ajena' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
  });
});

// ─── Documentos ──────────────────────────────────────────────────────────────

describe('contableController.uploadDocumento', () => {
  const archivo = { buffer: Buffer.from('PDF'), originalname: 'RUT.pdf', mimetype: 'application/pdf', size: 1234 };

  it('404 si el cliente es de otra oficina (no sube nada)', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.uploadDocumento(makeReq({ params: { id: 'tc-ajeno' }, file: archivo }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it('exige el archivo', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.uploadDocumento(makeReq({ params: { id: 'tc-1' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('guarda el documento con el nombre del archivo si no le ponen uno', async () => {
    mockPrisma.clientDocument.create.mockResolvedValue({ id: 'doc-1' });
    const { res, status } = makeRes();

    await contableController.uploadDocumento(makeReq({ params: { id: 'tc-1' }, file: archivo }), res, makeNext());

    const data = mockPrisma.clientDocument.create.mock.calls[0][0].data;
    expect(data.nombre).toBe('RUT.pdf');
    expect(data.url).toBe('https://cloudinary/doc.pdf');
    expect(data.taxClientId).toBe('tc-1');
    expect(status).toHaveBeenCalledWith(201);
  });

  it('recorta un nombre larguísimo a 120 caracteres', async () => {
    mockPrisma.clientDocument.create.mockResolvedValue({ id: 'doc-1' });
    const { res } = makeRes();

    await contableController.uploadDocumento(makeReq({
      params: { id: 'tc-1' }, file: archivo, body: { nombre: 'D'.repeat(300) },
    }), res, makeNext());

    expect(mockPrisma.clientDocument.create.mock.calls[0][0].data.nombre).toHaveLength(120);
  });

  it('502 con mensaje entendible si Cloudinary falla (y no guarda la fila)', async () => {
    (uploadDocument as jest.Mock).mockRejectedValue(new Error('timeout'));
    const { res } = makeRes();
    const next = makeNext();

    await contableController.uploadDocumento(makeReq({ params: { id: 'tc-1' }, file: archivo }), res, next);

    const err = errorDe(next);
    expect(err.statusCode).toBe(502);
    expect(mockPrisma.clientDocument.create).not.toHaveBeenCalled();
  });
});

describe('contableController.deleteDocumento', () => {
  it('404 si el documento es de otra oficina', async () => {
    mockPrisma.clientDocument.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.deleteDocumento(makeReq({ params: { id: 'doc-ajeno' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.clientDocument.delete).not.toHaveBeenCalled();
  });

  it('borra la fila y de paso el archivo en Cloudinary', async () => {
    mockPrisma.clientDocument.findFirst.mockResolvedValue({ id: 'doc-1', url: 'https://cloudinary/doc.pdf' });
    const { res } = makeRes();

    await contableController.deleteDocumento(makeReq({ params: { id: 'doc-1' } }), res, makeNext());

    expect(mockPrisma.clientDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    expect(deleteImage).toHaveBeenCalledWith('https://cloudinary/doc.pdf');
  });

  it('si Cloudinary falla al limpiar, el borrado igual responde bien', async () => {
    mockPrisma.clientDocument.findFirst.mockResolvedValue({ id: 'doc-1', url: 'https://cloudinary/doc.pdf' });
    (deleteImage as jest.Mock).mockRejectedValue(new Error('no existe'));
    const { res, json } = makeRes();
    const next = makeNext();

    await contableController.deleteDocumento(makeReq({ params: { id: 'doc-1' } }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('listDocumentos no deja ver los de otra oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.listDocumentos(makeReq({ params: { id: 'tc-ajeno' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.clientDocument.findMany).not.toHaveBeenCalled();
  });
});

// ─── Panel y prioritarios ────────────────────────────────────────────────────

describe('contableController.panel', () => {
  it('trae lo que vence pronto y el estado de la suscripción', async () => {
    mockPrisma.taxClient.count.mockResolvedValue(42);
    const { res, json } = makeRes();

    await contableController.panel(makeReq(), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.totalClientes).toBe(42);
    expect(data.suscripcion.activa).toBe(true);
    expect(data.suscripcion.diasRestantes).toBeGreaterThan(25);
    // Vencimientos: los próximos 15 días, sin los ya cumplidos.
    const whereVenc = mockPrisma.vencimiento.findMany.mock.calls[0][0].where;
    expect(whereVenc.taxClient).toEqual({ businessId: 'ofi-1' });
    expect(whereVenc.estado).toEqual({ notIn: ['presentada', 'pagada'] });
    // Resoluciones: las que vencen en 30 días.
    expect(mockPrisma.resolucionDian.findMany.mock.calls[0][0].where.taxClient).toEqual({ businessId: 'ofi-1' });
  });

  it('marca la suscripción como inactiva cuando ya venció', async () => {
    const { res, json } = makeRes();

    await contableController.panel(makeReq({ planExpiresAt: new Date('2020-01-01') }), res, makeNext());

    expect(json.mock.calls[0][0].data.suscripcion.activa).toBe(false);
  });

  it('sin fecha de plan no revienta: cero días y suscripción inactiva', async () => {
    const { res, json } = makeRes();

    await contableController.panel(makeReq({ planExpiresAt: null }), res, makeNext());

    expect(json.mock.calls[0][0].data.suscripcion).toEqual(
      expect.objectContaining({ activa: false, diasRestantes: 0, planExpiresAt: null }),
    );
  });
});

describe('contableController.prioritarios', () => {
  it('trae lo que vence dentro de 7 días y aún no se ha cumplido', async () => {
    const { res } = makeRes();

    await contableController.prioritarios(makeReq(), res, makeNext());

    const args = mockPrisma.vencimiento.findMany.mock.calls[0][0];
    expect(args.where.taxClient).toEqual({ businessId: 'ofi-1' });
    expect(args.where.estado).toEqual({ notIn: ['presentada', 'pagada'] });
    expect(args.orderBy).toEqual({ fecha: 'asc' });
    // La ventana incluye lo ya vencido (lte), que es lo que urge avisar.
    const corte = args.where.fecha.lte as Date;
    const dias = (corte.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(6);
    expect(dias).toBeLessThan(8);
  });
});
