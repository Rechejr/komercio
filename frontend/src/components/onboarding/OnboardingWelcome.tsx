'use client';

import { Portal } from '@/components/ui/Portal';
import { useAuthStore } from '@/store/auth.store';
import { useOnboarding } from '@/lib/useOnboarding';
import { useTourStore } from '@/store/tour.store';
import { tourFor } from '@/lib/tourSteps';
import { Sparkles, ArrowRight, Package, ShoppingCart, DollarSign, Users, Calendar, FileText } from 'lucide-react';

// Modal de bienvenida para el PRIMER ingreso de un negocio nuevo. Se muestra una
// sola vez (se marca welcomeSeen en la BD). Los usuarios que ya existían quedaron
// marcados como vistos en la migración, así que no lo reciben.
export function OnboardingWelcome() {
  const name = useAuthStore((s) => s.user?.name);
  const { data, patchState } = useOnboarding();
  const startTour = useTourStore((s) => s.start);

  if (!data || data.state?.welcomeSeen) return null;
  // Si por alguna razón ya completó todo, no tiene sentido la bienvenida.
  const allDone = Object.values(data.steps || {}).every(Boolean);
  if (allDone) return null;

  const contable = data.productType === 'contable';
  const firstName = name?.split(' ')[0];

  const puntos = contable
    ? [
        { Icon: Users, txt: 'Agrega los clientes que asesoras' },
        { Icon: Calendar, txt: 'Arma su agenda de vencimientos' },
        { Icon: FileText, txt: 'Guarda sus documentos (RUT, cámara…)' },
      ]
    : [
        { Icon: Package, txt: 'Agrega tus productos' },
        { Icon: ShoppingCart, txt: 'Registra tus ventas' },
        { Icon: DollarSign, txt: 'Controla tu caja y tus reportes' },
      ];

  const seen = () => patchState({ welcomeSeen: true });
  const comenzar = () => {
    patchState({ welcomeSeen: true });
    // Pequeño delay para que el modal se cierre antes de arrancar el recorrido.
    setTimeout(() => startTour(tourFor(data.productType)), 250);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md overflow-hidden animate-scale-in">
          {/* Encabezado */}
          <div className="px-7 pt-7 pb-5 text-center bg-gradient-to-b from-emerald-50 to-transparent dark:from-emerald-500/[0.08]">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
              <Sparkles size={26} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-[19px] font-bold text-slate-900 dark:text-white">
              ¡Bienvenido a Ventrix{firstName ? `, ${firstName}` : ''}! 👋
            </h2>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5">
              {contable
                ? 'Vamos a dejar tu oficina lista en unos minutos. Te guiamos paso a paso.'
                : 'Vamos a configurar tu negocio en unos minutos. Te guiamos paso a paso.'}
            </p>
          </div>

          {/* Qué vas a hacer */}
          <div className="px-7 py-4 space-y-2.5">
            {puntos.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center flex-none">
                  <p.Icon size={16} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-[13px] text-slate-700 dark:text-slate-200">{p.txt}</span>
              </div>
            ))}
          </div>

          {/* Acciones */}
          <div className="px-7 pb-7 pt-2 flex flex-col gap-2">
            <button
              onClick={comenzar}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition"
            >
              Comenzar configuración <ArrowRight size={16} />
            </button>
            <button
              onClick={seen}
              className="w-full py-2 rounded-xl text-[13px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Omitir por ahora
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
