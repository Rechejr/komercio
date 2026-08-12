// Flujo de compra: "Comprar ahora" lleva a crear la cuenta (POS o Contable) y,
// al entrar, se activa el plan pagando por Wompi DENTRO de la app (endpoint
// /payments/create-link), que es el único flujo que empareja el pago con el
// negocio y activa el plan de verdad. Por eso aquí ya no hay links sueltos de
// Wompi: el pago se dispara adentro (ver BuyIntentHandler).

// ─────────────────────────────────────────────────────────────────────────────
// VENDEDORES  ← AGREGA AQUÍ A CADA VENDEDOR
// Cada vendedor comparte su propio link: ventrix.lat/planes?v=<slug>. Cuando un
// prospecto toca "WhatsApp" en la cotización, se abre el chat con ESE vendedor
// (con el plan ya escrito). Si el link no trae ?v= (o el slug no existe), cae al
// vendedor por defecto (el dueño). El teléfono va con código de país: 57 + celular.
// ─────────────────────────────────────────────────────────────────────────────
export interface Seller { name: string; phone: string }

export const DEFAULT_SELLER: Seller = { name: 'Ventrix', phone: '573102979527' };

export const SELLERS: Record<string, Seller> = {
  franklin: { name: 'Franklin Vargas', phone: '573225338424' }, // ventrix.lat/planes?v=franklin
  lina:     { name: 'Lina Pantoja',    phone: '573156132525' }, // ventrix.lat/planes?v=lina
  viviana:  { name: 'Viviana Ortega',  phone: '573152393608' }, // ventrix.lat/planes?v=viviana
};

export function resolveSeller(slug?: string | null): Seller {
  const key = (slug || '').trim().toLowerCase();
  return (key && SELLERS[key]) || DEFAULT_SELLER;
}

// Periodo de facturación (para planes con mensual/trimestral/anual).
export interface BillingPeriod {
  key: 'monthly' | 'quarterly' | 'annual';
  label: string;          // 'Mensual', 'Trimestral', 'Anual'
  total: number;          // lo que se cobra en ese periodo (COP)
  unit: string;           // '/mes', '/trimestre', '/año'
  perMonth?: string;      // 'Equivale a $26.900/mes'
  save?: number;          // % de ahorro vs mensual (para el badge)
}

export interface PlanTier {
  name: string;
  price: number;          // COP; 0 = gratis (precio por defecto / mensual)
  period: string;         // '/mes', '/año', '/siempre', 'por 7 días'
  note?: string;          // línea pequeña bajo el precio
  features: string[];
  featured?: boolean;     // resalta la tarjeta ("Recomendado")
  cta: 'register' | 'buy';
  periods?: BillingPeriod[]; // si existe, la tarjeta muestra un selector de periodo
}

export interface ProductPlan {
  key: 'pos' | 'contable';
  label: string;
  tagline: string;
  registerHref: string;
  tiers: PlanTier[];
}

export const PLANS: ProductPlan[] = [
  {
    key: 'pos',
    label: 'Ventrix POS',
    tagline: 'Para tu negocio',
    registerHref: '/register',
    tiers: [
      {
        name: 'Gratis',
        price: 0,
        period: '/siempre',
        note: 'Ideal para empezar y probar',
        cta: 'register',
        features: [
          'Hasta 50 ventas al mes',
          'Hasta 50 productos y 50 clientes',
          '1 usuario y 1 bodega',
          'Recibos e inventario incluidos',
          'Sin tarjeta de crédito',
        ],
      },
      {
        name: 'Pro',
        price: 29900,
        period: '/mes',
        note: 'Todo lo de Gratis SIN límites, y las herramientas para crecer',
        featured: true,
        cta: 'buy',
        periods: [
          { key: 'monthly',   label: 'Mensual',    total: 29900,  unit: '/mes' },
          { key: 'quarterly', label: 'Trimestral', total: 80700,  unit: '/trimestre', perMonth: 'Equivale a $26.900/mes', save: 10 },
          { key: 'annual',    label: 'Anual',      total: 287000, unit: '/año',       perMonth: 'Equivale a $23.917/mes', save: 20 },
        ],
        features: [
          'Ventas, productos y clientes ILIMITADOS',
          'Varios cajeros, cada uno con su usuario y permisos',
          'Fiados y créditos con recordatorio por WhatsApp',
          'Compras, proveedores y cuentas por pagar',
          'Reportes de ganancias y exportación a Excel',
          'Hasta 3 bodegas con transferencias de stock',
          'Importar tus productos desde Excel',
          'Resumen semanal de tu negocio con IA',
          'Soporte prioritario',
        ],
      },
    ],
  },
  {
    key: 'contable',
    label: 'Ventrix Contable',
    tagline: 'Para contadores',
    registerHref: '/register',
    tiers: [
      {
        name: 'Prueba',
        price: 0,
        period: 'por 7 días',
        note: 'Sin tarjeta de crédito',
        cta: 'register',
        features: [
          'Acceso completo por 7 días',
          'Agenda tributaria DIAN 2026',
          'Vencimientos calculados por NIT',
        ],
      },
      {
        name: 'Anual',
        price: 120000,
        period: '/año',
        note: 'Una oficina: contador + hasta 3 auxiliares',
        featured: true,
        cta: 'buy',
        features: [
          'Agenda tributaria DIAN 2026 completa',
          'La fecha de cada obligación se calcula sola por el NIT',
          'Alertas de vencimiento (app y celular)',
          'Bóveda de documentos y credenciales por cliente',
          'Contador + hasta 3 auxiliares incluidos',
        ],
      },
    ],
  },
];

// Franja de confianza (se muestra bajo los planes).
export const TRUST_POINTS = [
  'Sin tarjeta para empezar',
  'Tus datos protegidos',
  'Soporte por WhatsApp',
  'Hecho en Colombia',
];

export const PLANES_FAQ = [
  { q: '¿Necesito tarjeta de crédito para empezar?', a: 'No. Puedes empezar gratis (POS) o con 7 días de prueba (Contable) sin poner ninguna tarjeta.' },
  { q: '¿Puedo cambiar de plan después?', a: 'Sí. Empiezas en el plan que quieras y subes o bajas cuando lo necesites, sin perder tu información.' },
  { q: '¿El pago es seguro?', a: 'Sí. El pago se hace por Wompi, la pasarela de pagos de Bancolombia, con todos sus estándares de seguridad.' },
  { q: '¿Qué pasa cuando termina la prueba?', a: 'Te avisamos antes. Si decides continuar, activas tu plan; si no, tu cuenta simplemente queda en pausa sin cobros.' },
];
