import { prisma } from '../../config/database';
import { gemini } from '../../config/gemini';
import { generateWeeklySummaryForBusiness, getOrGenerateAiSummary } from '../../services/aiSummary.service';

jest.mock('../../config/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    credit: { aggregate: jest.fn() },
    aiWeeklySummary: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

jest.mock('../../config/gemini', () => ({
  gemini: { models: { generateContent: jest.fn() } },
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateContent = gemini.models.generateContent as jest.Mock;

const BUSINESS_ID = 'biz-1';

function mockMetricsQueries() {
  (mockPrisma.$queryRaw as unknown as jest.Mock)
    .mockResolvedValueOnce([{ current_total: 150000, prev_total: 100000 }]) // sales
    .mockResolvedValueOnce([{ name: 'Café Molido', profit: 30000 }]) // profit
    .mockResolvedValueOnce([{ name: 'Pan Tajado', qty: 40 }]) // top qty
    .mockResolvedValueOnce([{ name: 'Leche 1L', stock: 2, minStock: 5 }]) // low stock
    .mockResolvedValueOnce([{ name: 'Leche 1L', qty: 15 }]) // producto a reabastecer
    .mockResolvedValueOnce([{ name: 'Doña Marta', balance: 45000, dias_mora: 10 }]); // cliente en riesgo
  mockPrisma.credit.aggregate = jest.fn().mockResolvedValue({
    _sum: { balance: 20000 },
    _count: { id: 2 },
  }) as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GEMINI_API_KEY = 'test-gemini-key';
});

describe('aiSummary.service — generateWeeklySummaryForBusiness', () => {
  it('arma las queries filtrando solo por el businessId recibido (sin cruzar tenants)', async () => {
    mockMetricsQueries();
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ resumen: 'Vendiste más esta semana.' }),
    });
    (mockPrisma.aiWeeklySummary.create as jest.Mock).mockResolvedValue({});

    await generateWeeklySummaryForBusiness(BUSINESS_ID);

    const queryCalls = (mockPrisma.$queryRaw as unknown as jest.Mock).mock.calls;
    expect(queryCalls.length).toBe(6);
    // Cada llamada es un tagged template — los valores interpolados (incluido
    // businessId) llegan como argumentos posicionales después del array de strings.
    for (const call of queryCalls) {
      const values = call.slice(1);
      expect(values).toContain(BUSINESS_ID);
    }
    const aggregateArgs = (mockPrisma.credit.aggregate as jest.Mock).mock.calls[0][0];
    expect(aggregateArgs.where.customer.businessId).toBe(BUSINESS_ID);
  });

  it('guarda el resumen cuando la respuesta del modelo es válida', async () => {
    mockMetricsQueries();
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ resumen: 'Vendiste 50% más que la semana pasada.' }),
    });
    (mockPrisma.aiWeeklySummary.create as jest.Mock).mockResolvedValue({});

    const result = await generateWeeklySummaryForBusiness(BUSINESS_ID);

    expect(result).toBe('Vendiste 50% más que la semana pasada.');
    expect(mockPrisma.aiWeeklySummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: BUSINESS_ID,
          summary: 'Vendiste 50% más que la semana pasada.',
          model: 'gemini-3.1-flash-lite',
        }),
      }),
    );
  });

  it('devuelve null y loguea si la llamada al modelo falla, sin lanzar', async () => {
    mockMetricsQueries();
    mockGenerateContent.mockRejectedValue(new Error('boom'));

    const result = await generateWeeklySummaryForBusiness(BUSINESS_ID);

    expect(result).toBeNull();
    expect(mockPrisma.aiWeeklySummary.create).not.toHaveBeenCalled();
  });

  it('devuelve null sin llamar al modelo si GEMINI_API_KEY no está configurada', async () => {
    delete process.env.GEMINI_API_KEY;

    const result = await generateWeeklySummaryForBusiness(BUSINESS_ID);

    expect(result).toBeNull();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe('aiSummary.service — getOrGenerateAiSummary', () => {
  it('devuelve el resumen existente si tiene menos de 7 días', async () => {
    const recent = new Date();
    (mockPrisma.aiWeeklySummary.findFirst as jest.Mock).mockResolvedValue({
      summary: 'Resumen reciente', createdAt: recent,
    });

    const result = await getOrGenerateAiSummary(BUSINESS_ID);

    expect(result).toEqual({ summary: 'Resumen reciente', createdAt: recent });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('regenera si el resumen mas reciente tiene mas de 7 dias', async () => {
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    (mockPrisma.aiWeeklySummary.findFirst as jest.Mock).mockResolvedValue({
      summary: 'Resumen viejo', createdAt: stale,
    });
    mockMetricsQueries();
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ resumen: 'Resumen nuevo' }),
    });
    (mockPrisma.aiWeeklySummary.create as jest.Mock).mockResolvedValue({});

    const result = await getOrGenerateAiSummary(BUSINESS_ID);

    expect(result?.summary).toBe('Resumen nuevo');
  });
});
