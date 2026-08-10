'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Portal } from '@/components/ui/Portal';
import { useOnboarding } from '@/lib/useOnboarding';
import { useTourStore } from '@/store/tour.store';
import { tourFor } from '@/lib/tourSteps';
import { HelpCircle, X, Compass, ListChecks, Search, ChevronDown } from 'lucide-react';

const FAQ: Record<string, Array<{ q: string; a: string }>> = {
  pos: [
    { q: '¿Cómo registro una venta?', a: 'Entra a Punto de Venta, toca los productos que vas vendiendo, elige el medio de pago y confirma. La venta y el stock se actualizan solos.' },
    { q: '¿Cómo agrego un producto?', a: 'En Inventario toca "Nuevo producto" y pon el nombre, el precio de venta y el stock. También puedes ponerle el costo para ver tu ganancia.' },
    { q: '¿Qué es el margen de ganancia?', a: 'Es la diferencia entre lo que te cuesta un producto y el precio al que lo vendes. Ventrix lo calcula por ti.' },
    { q: '¿Cómo sé cuánto vendí?', a: 'En Reportes ves tus ventas por día, semana o mes, y qué productos se venden más.' },
  ],
  contable: [
    { q: '¿Cómo agrego un cliente?', a: 'En Clientes toca "Nuevo cliente" y pon su nombre y NIT. Con el NIT, Ventrix propone las fechas de sus obligaciones.' },
    { q: '¿Cómo armo la agenda de un cliente?', a: 'Desde el cliente, genera sus vencimientos: Ventrix crea las fechas de IVA, renta y demás según su calendario.' },
    { q: '¿Dónde guardo el RUT o la cámara de comercio?', a: 'En cada cliente hay una bóveda de documentos donde adjuntas RUT, cámara, declaraciones y más.' },
  ],
};

// Centro de Ayuda: botón flotante "?" con acceso a reiniciar el recorrido, volver
// a ver los primeros pasos, buscar una función y un mini FAQ. Discreto y no
// invasivo; se puede cerrar. Sirve para POS y Contable.
export function HelpCenter() {
  const router = useRouter();
  const { data, patchState } = useOnboarding();
  const startTour = useTourStore((s) => s.start);
  const [open, setOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const productType = data?.productType || 'pos';
  const contable = productType === 'contable';

  const reiniciarTour = () => { setOpen(false); setTimeout(() => startTour(tourFor(productType)), 200); };
  const verPasos = () => {
    patchState({ dismissed: false });
    setOpen(false);
    router.push(contable ? '/contable/panel' : '/dashboard');
  };
  const buscar = () => {
    setOpen(false);
    // Reusa el buscador global del Header (Ctrl+K).
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ayuda"
        className="fixed bottom-4 right-4 z-40 w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center transition hover:scale-105 print:hidden"
      >
        <HelpCircle size={22} />
      </button>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-[75] flex items-end sm:items-center sm:justify-end p-0 sm:p-4" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="relative bg-white dark:bg-slate-900 w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-modal max-h-[85vh] overflow-hidden flex flex-col animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-white flex items-center gap-2"><HelpCircle size={17} className="text-emerald-600 dark:text-emerald-400" /> Ayuda</h2>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={19} /></button>
              </div>

              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                <button onClick={reiniciarTour} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-white/[0.06] hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-white/[0.04] transition text-left">
                  <Compass size={18} className="text-emerald-600 dark:text-emerald-400 flex-none" />
                  <div><p className="text-[13px] font-medium text-slate-900 dark:text-white">Recorrido guiado</p><p className="text-[11px] text-slate-400">Un tour rápido por el menú</p></div>
                </button>
                <button onClick={verPasos} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-white/[0.06] hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-white/[0.04] transition text-left">
                  <ListChecks size={18} className="text-emerald-600 dark:text-emerald-400 flex-none" />
                  <div><p className="text-[13px] font-medium text-slate-900 dark:text-white">Primeros pasos</p><p className="text-[11px] text-slate-400">Vuelve a ver la guía de configuración</p></div>
                </button>
                {!contable && (
                  <button onClick={buscar} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-white/[0.06] hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-white/[0.04] transition text-left">
                    <Search size={18} className="text-emerald-600 dark:text-emerald-400 flex-none" />
                    <div><p className="text-[13px] font-medium text-slate-900 dark:text-white">Buscar una función</p><p className="text-[11px] text-slate-400">Encuentra rápido lo que necesitas (Ctrl + K)</p></div>
                  </button>
                )}

                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-3 pb-1 px-1">Preguntas frecuentes</p>
                {(FAQ[productType] || FAQ.pos).map((item, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 dark:border-white/[0.06] overflow-hidden">
                    <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
                      <span className="text-[13px] font-medium text-slate-800 dark:text-white">{item.q}</span>
                      <ChevronDown size={15} className={`text-slate-400 flex-none transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} />
                    </button>
                    {faqOpen === i && <p className="px-3 pb-3 text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">{item.a}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
