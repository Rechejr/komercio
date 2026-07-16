import { prisma } from '../config/database';
import { gemini, GEMINI_MODEL } from '../config/gemini';
import { logger } from '../config/logger';
import { bogotaDayStart } from '../utils/bogotaTime';

const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

interface WeeklyMetrics {
  semana_actual: { total: number; moneda: 'COP' };
  semana_anterior: { total: number };
  producto_mas_rentable: { nombre: string; ganancia: number } | null;
  producto_mas_vendido: { nombre: string; unidades: number } | null;
  stock_bajo: Array<{ nombre: string; stock: number; minimo: number }>;
  clientes_con_deuda: { cantidad: number; monto: number };
}

const SYSTEM_PROMPT = `Eres un asistente que redacta resúmenes semanales breves para el dueño de un
negocio pequeño en Colombia (tienda de barrio, minimarket, restaurante, etc).

Recibirás un JSON con los números reales de ESTA semana de negocio. Con eso,
escribe un resumen de EXACTAMENTE 2 a 4 frases, en español, hablándole directo
al dueño ("vendiste", "te estás quedando sin"), cubriendo — solo si el dato lo
respalda — la comparación de ventas contra la semana anterior, el producto que
más se destacó (por ganancia o por unidades, el que sea más notable), y una
alerta accionable si hay stock bajo o deuda de clientes pendiente.

Reglas estrictas:
- Nunca inventes una cifra que no esté en el JSON de entrada.
- Nunca digas que eres una IA ni menciones que generaste el texto.
- Sin saludo ni despedida, sin markdown, texto plano.
- Si un dato viene en null o vacío, simplemente no lo menciones.`;

function isFresh(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() < FRESHNESS_MS;
}

async function gatherMetrics(businessId: string): Promise<WeeklyMetrics> {
  const now = new Date();
  const weekStart = bogotaDayStart(now, -7);
  const prevWeekStart = bogotaDayStart(now, -14);

  const [salesRaw, profitRaw, topByQtyRaw, lowStockRaw, debtAgg] = await Promise.all([
    prisma.$queryRaw<any[]>`
      SELECT
        COALESCE(SUM(CASE WHEN s."createdAt" >= ${weekStart} AND s.status = 'COMPLETED' THEN s.total END), 0) AS current_total,
        COALESCE(SUM(CASE WHEN s."createdAt" >= ${prevWeekStart} AND s."createdAt" < ${weekStart} AND s.status = 'COMPLETED' THEN s.total END), 0) AS prev_total
      FROM sales s
      JOIN branches br ON s."branchId" = br.id
      WHERE br."businessId" = ${businessId}
        AND s."deletedAt" IS NULL
    `,
    prisma.$queryRaw<any[]>`
      SELECT p.name,
             SUM(sd.quantity * (sd."unitPrice" - sd."costPrice")) AS profit
      FROM sale_details sd
      JOIN products p ON sd."productId" = p.id
      JOIN sales s ON sd."saleId" = s.id
      JOIN branches br ON s."branchId" = br.id
      WHERE s."createdAt" >= ${weekStart}
        AND s.status = 'COMPLETED'
        AND s."deletedAt" IS NULL
        AND br."businessId" = ${businessId}
      GROUP BY p.id, p.name
      ORDER BY profit DESC
      LIMIT 1
    `,
    prisma.$queryRaw<any[]>`
      SELECT p.name, SUM(sd.quantity) AS qty
      FROM sale_details sd
      JOIN products p ON sd."productId" = p.id
      JOIN sales s ON sd."saleId" = s.id
      JOIN branches br ON s."branchId" = br.id
      WHERE s."createdAt" >= ${weekStart}
        AND s.status = 'COMPLETED'
        AND s."deletedAt" IS NULL
        AND br."businessId" = ${businessId}
      GROUP BY p.id, p.name
      ORDER BY qty DESC
      LIMIT 1
    `,
    prisma.$queryRaw<any[]>`
      SELECT name, stock, "minStock"
      FROM products
      WHERE stock <= "minStock"
        AND "deletedAt" IS NULL
        AND "isActive" = true
        AND "businessId" = ${businessId}
      ORDER BY (stock - "minStock") ASC
      LIMIT 3
    `,
    prisma.credit.aggregate({
      where: {
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        customer: { businessId, deletedAt: null },
      },
      _sum: { balance: true },
      _count: { id: true },
    }),
  ]);

  const s = salesRaw[0] || {};
  const profit = profitRaw[0];
  const topQty = topByQtyRaw[0];

  return {
    semana_actual: { total: Number(s.current_total || 0), moneda: 'COP' },
    semana_anterior: { total: Number(s.prev_total || 0) },
    producto_mas_rentable: profit ? { nombre: profit.name, ganancia: Number(profit.profit) } : null,
    producto_mas_vendido: topQty ? { nombre: topQty.name, unidades: Number(topQty.qty) } : null,
    stock_bajo: lowStockRaw.map((r) => ({ nombre: r.name, stock: Number(r.stock), minimo: Number(r.minStock) })),
    clientes_con_deuda: { cantidad: debtAgg._count.id, monto: Number(debtAgg._sum.balance || 0) },
  };
}

export async function generateWeeklySummaryForBusiness(businessId: string): Promise<string | null> {
  try {
    logger.info(`AI weekly summary: keyConfigured=${!!process.env.GEMINI_API_KEY} businessId=${businessId}`);
    if (!process.env.GEMINI_API_KEY) {
      logger.error(`AI weekly summary: GEMINI_API_KEY no configurada, no se genera para businessId=${businessId}`);
      return null;
    }

    const metrics = await gatherMetrics(businessId);

    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: JSON.stringify(metrics),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 400,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: { resumen: { type: 'string' } },
          required: ['resumen'],
        },
      },
    });

    const text = response.text;
    if (!text) {
      logger.error(`AI weekly summary: respuesta vacía para businessId=${businessId}`);
      return null;
    }
    const parsed = JSON.parse(text);
    const summary: string = parsed.resumen;
    if (!summary) return null;

    await prisma.aiWeeklySummary.create({
      data: { businessId, summary, metrics: metrics as any, model: GEMINI_MODEL },
    });

    return summary;
  } catch (err: any) {
    logger.error(`AI weekly summary falló para businessId=${businessId}: ${err.message}`);
    return null;
  }
}

export async function getOrGenerateAiSummary(businessId: string): Promise<{ summary: string; createdAt: Date } | null> {
  const existing = await prisma.aiWeeklySummary.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  });

  if (existing && isFresh(existing.createdAt)) {
    return { summary: existing.summary, createdAt: existing.createdAt };
  }

  const summary = await generateWeeklySummaryForBusiness(businessId);
  if (!summary) {
    // Si falla la generación y había una versión vieja, mejor mostrar algo
    // desactualizado que nada — solo si no hay ninguna, se rinde con null.
    if (existing) return { summary: existing.summary, createdAt: existing.createdAt };
    return null;
  }
  return { summary, createdAt: new Date() };
}
