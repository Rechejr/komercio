// Flujo de compra: "Comprar ahora" lleva a crear la cuenta (POS o Contable) y,
// al entrar, se activa el plan pagando por Wompi DENTRO de la app (endpoint
// /payments/create-link), que es el único flujo que empareja el pago con el
// negocio y activa el plan de verdad. Por eso aquí ya no hay links sueltos de
// Wompi: el pago se dispara adentro (ver BuyIntentHandler).

export interface PlanTier {
  name: string;
  price: number;          // COP; 0 = gratis
  period: string;         // '/mes', '/año', '/siempre', 'por 7 días'
  note?: string;          // línea pequeña bajo el precio
  features: string[];
  featured?: boolean;     // resalta la tarjeta ("Recomendado")
  cta: 'register' | 'buy';
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
        cta: 'register',
        features: [
          'Ventas y recibos ilimitados',
          'Control de inventario',
          'Registro de clientes',
          'Sin tarjeta de crédito',
        ],
      },
      {
        name: 'Pro',
        price: 29900,
        period: '/mes',
        featured: true,
        cta: 'buy',
        features: [
          'Todo lo del plan Gratis',
          'Reportes de ventas y ganancias',
          'Varios usuarios / cajeros',
          'Compras y cuentas por pagar',
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
