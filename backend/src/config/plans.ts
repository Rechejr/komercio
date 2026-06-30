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
  },
  pro: {
    products: Infinity,
    customers: Infinity,
    salesPerMonth: Infinity,
    users: Infinity,
    branches: Infinity,
    canExport: true,
    canUseCredits: true,
    canUseSuppliers: true,
  },
};

export function getPlan(planName: string): PlanLimits {
  return PLANS[(planName as PlanName)] ?? PLANS.free;
}
