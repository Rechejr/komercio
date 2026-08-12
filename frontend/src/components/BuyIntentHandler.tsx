'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { activarProducto, switchToAccount } from '@/lib/accounts';
import toast from 'react-hot-toast';

const INTENT_KEY = 'ventrix-buy-intent';
const PERIOD_KEY = 'ventrix-buy-period';
const PRODUCT_KEY = 'ventrix-buy-product';

// Cuando alguien toca "Comprar ahora" en /planes, lo mandamos a crear su cuenta
// (o a iniciar sesión si ya existe) con la intención guardada: qué PRODUCTO
// (pos/contable), qué periodo, y que quiere pagar. Al entrar por primera vez,
// este handler lo lleva al pago con el flujo interno (/payments/create-link) que
// SÍ activa el plan. Si el producto que quiere no es el de su cuenta activa
// (ej. tiene Contable y quiere comprar POS), primero ACTIVA ese producto bajo el
// mismo correo y CAMBIA a él; al recargar, este handler vuelve a correr en el
// tablero correcto y ahí sí cobra. Reusa las piezas ya existentes (activarProducto
// + switchToAccount, las mismas de "Activar otro producto").
export function BuyIntentHandler() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const accounts = useAuthStore((s) => s.accounts);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!isAuthenticated || !user) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(INTENT_KEY) !== 'pro') return;

    fired.current = true;
    const period = localStorage.getItem(PERIOD_KEY);
    const target = (localStorage.getItem(PRODUCT_KEY) as 'pos' | 'contable' | null) || (user.businessType as 'pos' | 'contable');

    // Caso normal: la cuenta activa YA es el producto que quiere → se paga aquí.
    if (user.businessType === target) {
      localStorage.removeItem(INTENT_KEY);
      localStorage.removeItem(PERIOD_KEY);
      localStorage.removeItem(PRODUCT_KEY);
      if (user.plan === 'pro') return; // ya tiene plan pagado
      const chosen = target === 'contable'
        ? 'annual'
        : (['monthly', 'quarterly', 'annual'].includes(period || '') ? period : 'monthly');
      const t = toast.loading('Te llevamos al pago para activar tu plan…');
      api.post('/payments/create-link', { period: chosen })
        .then((r) => { window.location.href = r.data.data.url; })
        .catch(() => toast.error('No se pudo iniciar el pago. Usa el botón "Activar Pro".', { id: t }));
      return;
    }

    // Quiere el OTRO producto (ej. tiene Contable, compra POS): se activa (si no lo
    // tiene) y se cambia a él. Los flags quedan en localStorage y sobreviven la
    // recarga, así este handler vuelve a correr en el tablero del producto correcto
    // y ahí cobra. NO borramos los flags aquí.
    (async () => {
      const t = toast.loading(`Activando tu ${target === 'contable' ? 'Contable' : 'POS'}…`);
      try {
        let acct = accounts.find((a) => a.businessType === target);
        if (!acct) {
          try {
            const nombre = target === 'contable' ? `Contabilidad de ${user.name}` : `Negocio de ${user.name}`;
            const creado = await activarProducto(nombre, target);
            acct = { businessId: creado.businessId, businessType: target };
          } catch {
            // 409 "ya tienes cuenta de X" con accounts desactualizado → releer y buscar.
            const me = await api.get('/auth/me');
            acct = (me.data?.data?.accounts || []).find((a: any) => a.businessType === target);
            if (!acct) throw new Error('no-account');
          }
        }
        toast.dismiss(t);
        await switchToAccount(acct.businessId); // recarga al tablero del producto → re-dispara y cobra
      } catch {
        localStorage.removeItem(INTENT_KEY);
        localStorage.removeItem(PERIOD_KEY);
        localStorage.removeItem(PRODUCT_KEY);
        toast.error('No se pudo activar el otro producto. Puedes hacerlo desde "Activar otro producto".', { id: t });
      }
    })();
  }, [isAuthenticated, user, accounts]);

  return null;
}
