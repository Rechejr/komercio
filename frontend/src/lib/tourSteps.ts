import type { TourStep } from '@/store/tour.store';

// Pasos del recorrido guiado. `target` = data-tour del ítem del menú a resaltar.
export const POS_TOUR: TourStep[] = [
  { target: 'dashboard',  title: '👋 Tu Dashboard',    body: 'Aquí ves el estado de tu negocio de un vistazo: ventas del día, caja y alertas.' },
  { target: 'pos',        title: '🛒 Punto de Venta',  body: 'Aquí registras tus ventas: eliges los productos, cobras y listo.' },
  { target: 'inventario', title: '📦 Inventario',      body: 'Administra tu catálogo: productos, precios y el stock disponible.' },
  { target: 'reportes',   title: '📊 Reportes',        body: 'Analiza cómo va tu negocio: lo que más vendes, tus ganancias y tendencias.' },
];

export const CONTABLE_TOUR: TourStep[] = [
  { target: 'panel',        title: '👋 Tu Panel',        body: 'El estado de tu agenda tributaria de un vistazo: lo urgente y lo que vence pronto.' },
  { target: 'clientes',     title: '👥 Clientes',        body: 'Aquí agregas y administras las empresas y personas que asesoras.' },
  { target: 'vencimientos', title: '🗓️ Vencimientos',    body: 'La agenda con las fechas de IVA, renta y demás obligaciones de cada cliente.' },
];

export function tourFor(productType: string): TourStep[] {
  return productType === 'contable' ? CONTABLE_TOUR : POS_TOUR;
}
