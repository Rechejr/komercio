export type PlanName = 'free' | 'pro';

export interface PlanLimits {
  products: number;
  customers: number;
  salesPerMonth: number;
  users: number;
  branches: number;
  canExport: boolean;
  canUseCredits: boolean;
  canUseSuppliers: boolean;
  canBulkImport: boolean;
  canUseAIInsights: boolean;
}

export const PLANS: Record<PlanName, PlanLimits> = {
  free: {
    products: 50,
    customers: 50,
    salesPerMonth: 50,
    users: 1,
    branches: 1,
    canExport: false,
    canUseCredits: false,
    canUseSuppliers: false,
    canBulkImport: false,
    canUseAIInsights: false,
  },
  pro: {
    products: Infinity,
    customers: Infinity,
    salesPerMonth: Infinity,
    users: Infinity,
    // Tope duro a propósito (no ilimitado): una sucursal vive por completo dentro
    // del negocio del dueño, sin forma de "transferirla" — este límite evita que
    // el plan Pro se use para operar más de tres puntos de venta bajo una sola
    // suscripción, y deja espacio para un plan superior a futuro.
    branches: 3,
    canExport: true,
    canUseCredits: true,
    canUseSuppliers: true,
    canBulkImport: true,
    canUseAIInsights: true,
  },
};

export function getPlan(planName: string): PlanLimits {
  return PLANS[(planName as PlanName)] ?? PLANS.free;
}
