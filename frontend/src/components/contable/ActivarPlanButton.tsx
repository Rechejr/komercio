'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Botón para activar/renovar el plan de Ventrix Contable.
 *
 * Reusa el mismo endpoint del POS (/payments/create-link): el backend detecta
 * que la cuenta es contable y cobra el precio anual correcto ($120.000) — el
 * frontend no necesita saber el precio. Al volver de Wompi, /payment-result
 * refresca el plan y lleva al contador a su panel.
 */
export function ActivarPlanButton({ variant = 'primary' }: { variant?: 'primary' | 'soft' }) {
  const [loading, setLoading] = useState(false);

  async function activar() {
    setLoading(true);
    try {
      const { data } = await api.post<{ data: { url: string } }>('/payments/create-link', { period: 'annual' });
      window.location.href = data.data.url;
    } catch {
      toast.error('No se pudo iniciar el pago. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={activar}
      disabled={loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm px-4 py-2 transition-colors disabled:opacity-60 flex-shrink-0',
        variant === 'primary'
          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
          : 'bg-white/70 dark:bg-white/10 hover:bg-white text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700',
      )}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : null}
      Activar plan — $120.000/año
    </button>
  );
}
