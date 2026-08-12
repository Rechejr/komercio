'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const INTENT_KEY = 'ventrix-buy-intent';
const PERIOD_KEY = 'ventrix-buy-period';

// Cuando alguien toca "Comprar ahora" en /planes, lo mandamos a crear su cuenta
// con ?intent=pro (y ?periodo=). Esos datos se guardan y sobreviven a verificar
// el correo + iniciar sesión. Al entrar por primera vez, este handler lleva al
// pago con el periodo elegido usando /payments/create-link — el MISMO flujo que
// "Activar Pro", que empareja el pago con el negocio y activa el plan de verdad
// (a diferencia de un link de Wompi suelto). Se ejecuta una sola vez.
export function BuyIntentHandler() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!isAuthenticated || !user) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(INTENT_KEY) !== 'pro') return;

    fired.current = true;
    const period = localStorage.getItem(PERIOD_KEY);
    localStorage.removeItem(INTENT_KEY);
    localStorage.removeItem(PERIOD_KEY);

    // Ya tiene plan pagado → no hay nada que cobrar.
    if (user.plan === 'pro') return;

    // El Contable es anual único; el POS usa el periodo elegido en /planes
    // (mensual/trimestral/anual), con mensual por defecto. El backend valida el
    // precio según el tipo de negocio, así que aquí solo mandamos el periodo.
    const chosen = user.businessType === 'contable'
      ? 'annual'
      : (['monthly', 'quarterly', 'annual'].includes(period || '') ? period : 'monthly');

    const t = toast.loading('Te llevamos al pago para activar tu plan…');
    api.post('/payments/create-link', { period: chosen })
      .then((r) => { window.location.href = r.data.data.url; })
      .catch(() => toast.error('No se pudo iniciar el pago. Usa el botón "Activar Pro" cuando quieras.', { id: t }));
  }, [isAuthenticated, user]);

  return null;
}
