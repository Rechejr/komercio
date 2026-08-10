'use client';

import { useEffect, useState } from 'react';
import { Portal } from '@/components/ui/Portal';
import { useOnboarding } from '@/lib/useOnboarding';
import { PartyPopper } from 'lucide-react';

// Celebra la PRIMERA venta de un negocio nuevo (solo POS). Se dispara cuando el
// paso "venta" pasa a completado y aún no se había marcado firstSale. Los
// negocios que ya existían al migrar quedan marcados (legacy) → no la reciben.
export function FirstSaleCelebration() {
  const { data, patchState } = useOnboarding();
  const [show, setShow] = useState(false);

  const eligible = !!data && data.productType === 'pos' && !!data.steps?.sale && !data.state?.firstSale;

  useEffect(() => {
    if (eligible) {
      setShow(true);
      patchState({ firstSale: true }); // marca en la BD para que no se repita
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible]);

  if (!show) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setShow(false)}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-sm p-7 text-center animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <PartyPopper size={30} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-[19px] font-bold text-slate-900 dark:text-white">¡Tu primera venta! 🎉</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Acabas de registrar tu primera venta en Ventrix. Ya tienes lo básico para empezar a administrar tu negocio.
          </p>
          <button
            onClick={() => setShow(false)}
            className="mt-5 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] font-semibold transition"
          >
            ¡Seguir vendiendo!
          </button>
        </div>
      </div>
    </Portal>
  );
}
