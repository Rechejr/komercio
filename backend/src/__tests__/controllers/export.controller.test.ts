import { Response, NextFunction } from 'express';
import { exportController } from '../../controllers/export.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

// ── ExcelJS mock ──────────────────────────────────────────────────────────────

const cellMock = { fill: {} as any, font: {} as any, numFmt: '', alignment: {} as any };

const rowMock = {
  commit:   jest.fn(),
  eachCell: jest.fn((cb: (c: typeof cellMock, i: number) => void) => cb(cellMock, 1)),
  getCell:  jest.fn().mockReturnValue(cellMock),
  font:     {} as any,
  fill:     {} as any,
  alignment: {} as any,
  height:   0,
  number:   1,
};

const wsMock = {
  columns:      [] as any[],
  addRow:       jest.fn().mockReturnValue(rowMock),
  getRow:       jest.fn().mockReturnValue(rowMock),
  getColumn:    jest.fn().mockReturnValue({ numFmt: '' }),
  mergeCells:   jest.fn(),
  eachCell:     jest.fn((cb: (c: typeof cellMock, i: number) => void) => cb(cellMock, 1)),
  commit:       jest.fn(),
};

const streamWbMock = {
  addWorksheet: jest.fn().mockReturnValue(wsMock),
  commit:       jest.fn().mockResolvedValue(undefined),
};

const inMemoryWbMock = {
  addWorksheet: jest.fn().mockReturnValue(wsMock),
  xlsx:         { write: jest.fn().mockResolvedValue(undefined) },
  creator:      '',
  created:      new Date(),
};

jest.mock('exceljs', () => ({
  stream: {
    xlsx: { WorkbookWriter: jest.fn().mockImplementation(() => streamWbMock) },
  },
  Workbook: jest.fn().mockImplementation(() => inMemoryWbMock),
}));

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../config/database', () => ({
  prisma: {
    sale:       { findMany: jest.fn(), aggregate: jest.fn() },
    purchase:   { findMany: jest.fn(), aggregate: jest.fn() },
    expense:    { findMany: jest.fn() },
    product:    { findMany: jest.fn() },
    customer:   { findMany: jest.fn() },
    saleDetail: { groupBy: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'a@b.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'br-1' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as AuthRequest;
}

function makeRes() {
  const end       = jest.fn();
  const setHeader = jest.fn();
  const json      = jest.fn();
  const status    = jest.fn().mockReturnThis();
  return { res: { json, status, end, setHeader } as unknown as Response, end, setHeader, json };
}

const next = jest.fn() as unknown as NextFunction;

function makeSale(overrides = {}) {
  return {
    id:             's1',
    invoiceNumber:  'FAC-001',
    createdAt:      new Date('2026-07-01'),
    total:          50000,
    subtotal:       45000,
    discountAmount: 5000,
    taxAmount:      0,
    paidAmount:     50000,
    paymentMethod:  'CASH',
    status:         'COMPLETED',
    customer:       { name: 'Juan García' },
    user:           { name: 'Vendedor 1' },
    details: [{
      productId:   'p1',
      quantity:    2,
      unitPrice:   22500,
      costPrice:   10000,
      discountPct: 0,
      total:       45000,
      product:     { name: 'Prod A', code: 'P001' },
    }],
    ...overrides,
  };
}

// ─── exportSales ──────────────────────────────────────────────────────────────

describe('exportController.exportSales', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 cuando el rango supera 366 días', async () => {
    await exportController.exportSales(
      makeReq({ query: { startDate: '2024-01-01', endDate: '2025-06-15' } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('establece headers Content-Disposition y Content-Type', async () => {
    (mockPrisma.sale.findMany as jest.Mock).mockResolvedValue([]);
    const { res, setHeader } = makeRes();
    await exportController.exportSales(makeReq(), res, next);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', expect.stringContaining('spreadsheetml'));
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('ventas-'));
  });

  it('crea las hojas Ventas y Detalle productos', async () => {
    (mockPrisma.sale.findMany as jest.Mock).mockResolvedValue([]);
    await exportController.exportSales(makeReq(), makeRes().res, next);
    expect(streamWbMock.addWorksheet).toHaveBeenCalledWith('Ventas');
    expect(streamWbMock.addWorksheet).toHaveBeenCalledWith('Detalle productos');
  });

  it('escribe filas de ventas y hace commit del workbook', async () => {
    const sale = makeSale();
    (mockPrisma.sale.findMany as jest.Mock)
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([]);

    await exportController.exportSales(makeReq(), makeRes().res, next);

    expect(wsMock.addRow).toHaveBeenCalledWith(expect.objectContaining({ invoice: 'FAC-001' }));
    expect(streamWbMock.commit).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('maneja venta sin cliente (mostrador) sin lanzar error', async () => {
    const sale = makeSale({ customer: null });
    (mockPrisma.sale.findMany as jest.Mock)
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([]);

    const { res } = makeRes();
    await exportController.exportSales(makeReq(), res, next);

    // El controller no debe llamar a next (error) cuando el cliente es null
    expect(next).not.toHaveBeenCalled();
    expect(streamWbMock.commit).toHaveBeenCalled();
  });

  it('hace commit del workbook aunque no haya ventas en el período', async () => {
    (mockPrisma.sale.findMany as jest.Mock).mockResolvedValue([]);
    const { res } = makeRes();
    await exportController.exportSales(makeReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(streamWbMock.commit).toHaveBeenCalled();
  });
});

// ─── exportPurchases ──────────────────────────────────────────────────────────

describe('exportController.exportPurchases', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 cuando el rango supera 366 días', async () => {
    await exportController.exportPurchases(
      makeReq({ query: { startDate: '2024-01-01', endDate: '2025-06-15' } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('establece headers y crea las hojas correctas', async () => {
    (mockPrisma.purchase.findMany as jest.Mock).mockResolvedValue([]);
    const { res, setHeader } = makeRes();
    await exportController.exportPurchases(makeReq(), res, next);
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('compras-'));
    expect(streamWbMock.addWorksheet).toHaveBeenCalledWith('Compras');
    expect(streamWbMock.addWorksheet).toHaveBeenCalledWith('Detalle productos');
  });

  it('escribe filas por cada compra del lote', async () => {
    const purchase = {
      id:            'pu1',
      invoiceNumber: 'PO-001',
      purchaseDate:  new Date('2026-07-01'),
      total:         120000,
      subtotal:      110000,
      taxAmount:     10000,
      notes:         'Pedido urgente',
      supplier:      { name: 'Proveedor S.A.' },
      details: [{
        product:  { name: 'Insumo A', code: 'I001' },
        quantity: 10,
        unitCost: 11000,
        taxRate:  10,
        total:    110000,
      }],
    };
    (mockPrisma.purchase.findMany as jest.Mock)
      .mockResolvedValueOnce([purchase])
      .mockResolvedValueOnce([]);

    await exportController.exportPurchases(makeReq(), makeRes().res, next);

    expect(wsMock.addRow).toHaveBeenCalledWith(expect.objectContaining({ invoice: 'PO-001', supplier: 'Proveedor S.A.' }));
    expect(streamWbMock.commit).toHaveBeenCalled();
  });
});

// ─── exportExpenses ───────────────────────────────────────────────────────────

describe('exportController.exportExpenses', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 cuando el rango supera 366 días', async () => {
    await exportController.exportExpenses(
      makeReq({ query: { startDate: '2024-01-01', endDate: '2025-06-15' } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('establece headers con nombre gastos-', async () => {
    (mockPrisma.expense.findMany as jest.Mock).mockResolvedValue([]);
    const { res, setHeader } = makeRes();
    await exportController.exportExpenses(makeReq(), res, next);
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('gastos-'));
  });

  it('escribe filas de gastos y agrega fila de total al final', async () => {
    const expense = {
      id:            'e1',
      date:          new Date('2026-07-01'),
      description:   'Arrendamiento',
      amount:        800000,
      paymentMethod: 'TRANSFER',
      notes:         '',
      category:      { name: 'Arriendo' },
    };
    (mockPrisma.expense.findMany as jest.Mock)
      .mockResolvedValueOnce([expense])
      .mockResolvedValueOnce([]);

    await exportController.exportExpenses(makeReq(), makeRes().res, next);

    expect(wsMock.addRow).toHaveBeenCalledWith(expect.objectContaining({ desc: 'Arrendamiento', amount: 800000 }));
    // Total row
    expect(wsMock.addRow).toHaveBeenCalledWith(expect.objectContaining({ desc: 'TOTAL', amount: 800000 }));
  });

  it('no agrega fila de total si no hay gastos', async () => {
    (mockPrisma.expense.findMany as jest.Mock).mockResolvedValue([]);
    await exportController.exportExpenses(makeReq(), makeRes().res, next);
    expect(wsMock.addRow).not.toHaveBeenCalledWith(expect.objectContaining({ desc: 'TOTAL' }));
  });
});

// ─── exportFinancialReport ────────────────────────────────────────────────────

describe('exportController.exportFinancialReport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 cuando el rango supera 366 días', async () => {
    await exportController.exportFinancialReport(
      makeReq({ query: { startDate: '2024-01-01', endDate: '2025-06-15' } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('genera el reporte con las 6 hojas esperadas', async () => {
    const sale = makeSale();
    (mockPrisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (mockPrisma.sale.aggregate as jest.Mock).mockResolvedValue({ _count: { id: 0 }, _sum: { total: 0 } });
    (mockPrisma.expense.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.purchase.aggregate as jest.Mock).mockResolvedValue({ _sum: { total: 0 }, _count: { id: 0 } });
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.customer.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.saleDetail.groupBy as jest.Mock).mockResolvedValue([]);

    const { res, setHeader, end } = makeRes();
    await exportController.exportFinancialReport(makeReq(), res, next);

    const sheets = ['Estado de Resultados', 'Ventas por día', 'Top productos', 'Gastos por categoría', 'Inventario valorizado', 'Cuentas por cobrar'];
    for (const s of sheets) {
      expect(inMemoryWbMock.addWorksheet).toHaveBeenCalledWith(s);
    }
    expect(inMemoryWbMock.xlsx.write).toHaveBeenCalled();
    expect(end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('establece Content-Disposition con estado-resultados- en el nombre', async () => {
    (mockPrisma.sale.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.sale.aggregate as jest.Mock).mockResolvedValue({ _count: { id: 0 }, _sum: { total: 0 } });
    (mockPrisma.expense.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.purchase.aggregate as jest.Mock).mockResolvedValue({ _sum: { total: 0 }, _count: { id: 0 } });
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.customer.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.saleDetail.groupBy as jest.Mock).mockResolvedValue([]);

    const { res, setHeader } = makeRes();
    await exportController.exportFinancialReport(makeReq(), res, next);

    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('estado-resultados-'));
  });

  it('incluye cuentas por cobrar cuando hay clientes con deuda', async () => {
    (mockPrisma.sale.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.sale.aggregate as jest.Mock).mockResolvedValue({ _count: { id: 0 }, _sum: { total: 0 } });
    (mockPrisma.expense.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.purchase.aggregate as jest.Mock).mockResolvedValue({ _sum: { total: 0 }, _count: { id: 0 } });
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.customer.findMany as jest.Mock).mockResolvedValue([
      { name: 'Pedro Ruiz', document: '123456', currentDebt: 150000, creditLimit: 500000 },
    ]);
    (mockPrisma.saleDetail.groupBy as jest.Mock).mockResolvedValue([]);

    await exportController.exportFinancialReport(makeReq(), makeRes().res, next);

    expect(wsMock.addRow).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pedro Ruiz', debt: 150000 }));
  });
});

// ─── exportProducts ───────────────────────────────────────────────────────────

describe('exportController.exportProducts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('establece headers Content-Disposition con nombre inventario-', async () => {
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([]);
    const { res, setHeader } = makeRes();
    await exportController.exportProducts(makeReq(), res, next);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', expect.stringContaining('spreadsheetml'));
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('inventario-'));
  });

  it('crea la hoja Productos con las mismas columnas que la plantilla de importación', async () => {
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([]);
    await exportController.exportProducts(makeReq(), makeRes().res, next);
    expect(streamWbMock.addWorksheet).toHaveBeenCalledWith('Productos');
  });

  it('escribe una fila por producto y hace commit del workbook', async () => {
    const product = {
      id: 'p1', name: 'Arroz Diana 1kg', code: 'P001',
      salePrice: 3200, costPrice: 2500, stock: 50, minStock: 10,
      unit: 'Und', barcode: '7701234567890', description: '',
      category: { name: 'Alimentos' },
    };
    (mockPrisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce([product])
      .mockResolvedValueOnce([]);

    await exportController.exportProducts(makeReq(), makeRes().res, next);

    expect(wsMock.addRow).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Arroz Diana 1kg', code: 'P001', salePrice: 3200, stock: 50, category: 'Alimentos',
    }));
    expect(streamWbMock.commit).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('solo trae productos del negocio del usuario y no eliminados', async () => {
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([]);
    await exportController.exportProducts(makeReq({ user: { userId: 'u-1', email: 'a@b.com', role: 'ADMIN', businessId: 'biz-2', branchId: 'br-1' } }), makeRes().res, next);
    expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: 'biz-2', deletedAt: null }) })
    );
  });

  it('hace commit del workbook aunque no haya productos', async () => {
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([]);
    await exportController.exportProducts(makeReq(), makeRes().res, next);
    expect(next).not.toHaveBeenCalled();
    expect(streamWbMock.commit).toHaveBeenCalled();
  });
});
