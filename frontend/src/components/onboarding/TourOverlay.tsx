'use client';

import { useEffect, useState, useCallback } from 'react';
import { Portal } from '@/components/ui/Portal';
import { useTourStore } from '@/store/tour.store';
import { useOnboarding } from '@/lib/useOnboarding';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

interface Rect { top: number; left: number; width: number; height: number }

// Pinta el recorrido guiado: oscurece la pantalla y resalta el ítem del menú del
// paso actual (spotlight con box-shadow), con una tarjeta que lo explica. Si el
// elemento no está visible (p. ej. el menú lateral cerrado en móvil), muestra la
// tarjeta centrada. Al terminar o saltar, marca el tour como hecho en la BD.
export function TourOverlay() {
  const { active, index, steps, next, prev, stop } = useTourStore();
  const { patchState } = useOnboarding();
  const [rect, setRect] = useState<Rect | null>(null);

  const step = steps[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return;
      }
    }
    setRect(null); // no visible → tarjeta centrada
  }, [step]);

  useEffect(() => {
    if (!active) return;
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, index, measure]);

  if (!active || !step) return null;

  const isLast = index === steps.length - 1;
  const finish = () => { patchState({ tourDone: true }); stop(); };
  const onNext = () => { if (isLast) finish(); else next(); };

  const pad = 6;
  // Posición de la tarjeta: a la derecha del elemento (el menú está a la izquierda);
  // si no hay elemento visible, centrada.
  const cardStyle: React.CSSProperties = rect
    ? { top: Math.max(12, Math.min(rect.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220)), left: rect.left + rect.width + 16 }
    : {};

  return (
    <Portal>
      <div className="fixed inset-0 z-[80]">
        {rect ? (
          <>
            {/* Spotlight: el recorte iluminado + oscurecido alrededor */}
            <div
              className="absolute rounded-xl ring-2 ring-emerald-400 transition-all duration-300 pointer-events-none"
              style={{
                top: rect.top - pad, left: rect.left - pad,
                width: rect.width + pad * 2, height: rect.height + pad * 2,
                boxShadow: '0 0 0 9999px rgba(2,6,23,0.65)',
              }}
            />
            {/* Tarjeta al lado del elemento resaltado (en móvil cae centrada abajo) */}
            <div
              className="absolute w-[280px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-modal p-4 animate-scale-in max-sm:left-1/2 max-sm:!top-auto max-sm:bottom-4 max-sm:-translate-x-1/2"
              style={cardStyle}
            >
              <TourCard step={step} index={index} total={steps.length} isLast={isLast} onNext={onNext} onPrev={prev} onSkip={finish} />
            </div>
          </>
        ) : (
          // Sin elemento visible: overlay oscuro + tarjeta centrada.
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4">
            <div className="w-[300px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-modal p-4 animate-scale-in">
              <TourCard step={step} index={index} total={steps.length} isLast={isLast} onNext={onNext} onPrev={prev} onSkip={finish} />
            </div>
          </div>
        )}
      </div>
    </Portal>
  );
}

function TourCard({ step, index, total, isLast, onNext, onPrev, onSkip }: {
  step: { title: string; body: string }; index: number; total: number; isLast: boolean;
  onNext: () => void; onPrev: () => void; onSkip: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">{step.title}</h3>
        <button onClick={onSkip} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 -mt-1 -mr-1 p-1" aria-label="Cerrar recorrido"><X size={16} /></button>
      </div>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">{step.body}</p>
      <div className="flex items-center justify-between mt-4">
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-emerald-500' : 'w-1.5 bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {index > 0 && (
            <button onClick={onPrev} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Anterior"><ArrowLeft size={15} /></button>
          )}
          <button onClick={onNext} className="flex items-center gap-1 px-3 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold">
            {isLast ? 'Entendido' : 'Siguiente'} {!isLast && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </>
  );
}
