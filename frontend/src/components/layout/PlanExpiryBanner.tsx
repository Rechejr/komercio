'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useUpgradeStore } from '@/store/upgrade.store';
import { AlertTriangle, X } from 'lucide-react';

const DISMISS_KEY = 'plan-expiry-dismissed';

// Aviso de vencimiento de la suscripción Pro (solo POS). Se muestra desde 7 días
// antes hasta 30 días después de vencer, para que el cliente renueve a tiempo y
// no pierda las funciones Pro sin darse cuenta. Reusa el modal de planes/pago.
export function PlanExpiryBanner() {
  const openUpgrade = useUpgradeStore((s) => s.open);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1',
  );

  const { data: business } = useQuery({
    queryKey: ['business'],
    queryFn: () => api.get('/business/me').then((r) => r.data.data),
  });

  if (dismissed || !business) return null;
  // Solo POS y solo negocios Pro con fecha de vencimiento (los Pro sin fecha son
  // vitalicios/otorgados y no se deben molestar).
  if (business.type === 'contable') return null;
  if (business.plan !== 'pro' || !business.planExpiresAt) return null;

  const daysLeft = Math.ceil((new Date(business.planExpiresAt).getTime() - Date.now()) / 86400000);
  if (daysLeft > 7 || daysLeft < -30) return null;

  const vencido = daysLeft < 0;
  let msg: string;
  if (vencido) {
    const n = Math.abs(daysLeft);
    msg = `Tu Plan Pro venció hace ${n} día${n === 1 ? '' : 's'}. Renueva para reactivar las funciones Pro.`;
  } else if (daysLeft === 0) {
    msg = 'Tu Plan Pro vence hoy. Renueva para no perder tus funciones.';
  } else if (daysLeft === 1) {
    msg = 'Tu Plan Pro vence mañana. Renueva para no perder tus funciones.';
  } else {
    msg = `Tu Plan Pro vence en ${daysLeft} días. Renueva para no perder tus funciones.`;
  }

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const tone = vencido
    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300'
    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300';

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 mb-4 text-[13px] ${tone}`}>
      <AlertTriangle size={16} className="flex-shrink-0" />
      <p className="flex-1 font-medium leading-snug">{msg}</p>
      <button
        onClick={() => openUpgrade()}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition"
      >
        Renovar
      </button>
      <button onClick={dismiss} className="flex-shrink-0 p-1 opacity-60 hover:opacity-100 transition" aria-label="Cerrar aviso">
        <X size={15} />
      </button>
    </div>
  );
}
