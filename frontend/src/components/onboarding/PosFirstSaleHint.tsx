'use client';

import { useState } from 'react';
import { useOnboarding } from '@/lib/useOnboarding';
import { Lightbulb, X } from 'lucide-react';

// Pista breve dentro del POS para quien ya tiene productos pero no ha vendido:
// explica en una línea cómo registrar la venta. Descartable; desaparece sola al
// hacer la primera venta.
export function PosFirstSaleHint() {
  const { data } = useOnboarding();
  const [hidden, setHidden] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('pos-firstsale-hint') === '1',
  );

  if (hidden || !data) return null;
  if (data.productType !== 'pos' || !data.steps?.product || data.steps?.sale) return null;

  const close = () => { if (typeof window !== 'undefined') sessionStorage.setItem('pos-firstsale-hint', '1'); setHidden(true); };

  return (
    <div className="flex items-center gap-2.5 mb-3 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-[12.5px] text-emerald-800 dark:text-emerald-300">
      <Lightbulb size={15} className="flex-none text-emerald-500" />
      <span className="flex-1"><b>Tu primera venta:</b> toca los productos para agregarlos, elige el medio de pago y confirma.</span>
      <button onClick={close} className="flex-none text-emerald-500 hover:text-emerald-700 p-0.5" aria-label="Ocultar"><X size={14} /></button>
    </div>
  );
}
