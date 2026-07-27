import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { paymentMethodLabel } from '@/lib/utils';

export interface PaymentAccount {
  id: string;
  name: string;
  type: 'CASH' | 'BANK' | 'OTHER';
  legacyEnum: string | null;
  active: boolean;
  order: number;
}

/** Medios de pago del negocio. `active` es lo que se muestra en los selectores;
 *  `all` incluye los desactivados (para resolver nombres de movimientos viejos). */
export function usePaymentAccounts() {
  const { data } = useQuery<PaymentAccount[]>({
    queryKey: ['payment-accounts'],
    queryFn: () => api.get('/business/payment-accounts').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  // Memoizado por `data`: refs estables entre renders (importa para deps de efectos).
  return useMemo(() => {
    const all = data || [];
    return { all, active: all.filter((a) => a.active) };
  }, [data]);
}

/** Nombre a mostrar de un pago: el nombre del medio configurable si existe; si no
 *  (ventas mixtas o registros muy viejos), cae a la etiqueta del enum. */
export function labelPago(
  accounts: PaymentAccount[],
  paymentAccountId?: string | null,
  paymentMethod?: string | null,
): string {
  if (paymentAccountId) {
    const acct = accounts.find((a) => a.id === paymentAccountId);
    if (acct) return acct.name;
  }
  if (paymentMethod === 'MIXED') return 'Mixto';
  return paymentMethodLabel[paymentMethod || 'CASH'] || paymentMethod || '—';
}
