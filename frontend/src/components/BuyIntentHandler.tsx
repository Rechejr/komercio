'use client';

import { useEffect, useRef } from 'react';
import { useUpgradeStore } from '@/store/upgrade.store';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const INTENT_KEY = 'ventrix-buy-intent';

// Cuando alguien toca "Comprar ahora" en /planes, lo mandamos a crear su cuenta
// con ?intent=pro. Ese intent se guarda (INTENT_KEY) y sobrevive a verificar el
// correo + iniciar sesión. Al entrar por primera vez a la app, este handler abre
// el pago — el MISMO flujo que "Activar Pro", que empareja el pago con el negocio
// y activa el plan de verdad (a diferencia de un link de Wompi suelto). Se ejecuta
// una sola vez y limpia la marca.
export function BuyIntentHandler() {
  const open = useUpgradeStore((s) => s.open);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!isAuthenticated || !user) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(INTENT_KEY) !== 'pro') return;

    fired.current = true;
    localStorage.removeItem(INTENT_KEY);

    // Ya tiene plan pagado → no hay nada que cobrar.
    if (user.plan === 'pro') return;

    if (user.businessType === 'contable') {
      // Contable: precio anual único → se inicia el pago directo (como el botón
      // "Activar plan"). El backend detecta el tipo y cobra $120.000/año.
      const t = toast.loading('Te llevamos al pago para activar tu plan…');
      api.post('/payments/create-link', { period: 'annual' })
        .then((r) => { window.location.href = r.data.data.url; })
        .catch(() => toast.error('No se pudo iniciar el pago. Usa el botón "Activar plan".', { id: t }));
    } else {
      // POS: abre el modal de pago (deja elegir el periodo y pagar).
      const timer = setTimeout(() => open(), 700);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, user, open]);

  return null;
}
