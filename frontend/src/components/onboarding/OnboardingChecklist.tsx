'use client';

import Link from 'next/link';
import { useOnboarding } from '@/lib/useOnboarding';
import { Check, X, Package, ShoppingCart, Users, DollarSign, Settings, Calendar, FileText, Sparkles, ArrowRight } from 'lucide-react';

type StepDef = { key: string; title: string; desc: string; href: string; cta: string; Icon: typeof Package };

// Pasos del POS — en lenguaje sencillo, cada uno lleva directo a donde se hace.
const POS_STEPS: StepDef[] = [
  { key: 'product',      title: 'Agrega tu primer producto', desc: 'Eso que vendes en tu negocio',          href: '/inventario',    cta: 'Agregar',    Icon: Package },
  { key: 'sale',         title: 'Haz tu primera venta',      desc: 'Cobra desde el Punto de Venta',          href: '/pos',           cta: 'Ir al POS',  Icon: ShoppingCart },
  { key: 'customer',     title: 'Agrega un cliente',         desc: 'Para fiar o llevar su historial',        href: '/clientes',      cta: 'Agregar',    Icon: Users },
  { key: 'cashRegister', title: 'Abre la caja',              desc: 'Lleva el control del efectivo del día',  href: '/caja',          cta: 'Abrir caja', Icon: DollarSign },
  { key: 'branding',     title: 'Personaliza tu negocio',    desc: 'Pon tu logo y datos en el recibo',       href: '/configuracion', cta: 'Configurar', Icon: Settings },
];

// Pasos de Contable — la agenda y los documentos se hacen desde cada cliente.
const CONTABLE_STEPS: StepDef[] = [
  { key: 'client',      title: 'Agrega tu primer cliente',       desc: 'La empresa o persona que asesoras',          href: '/contable/clientes', cta: 'Agregar',      Icon: Users },
  { key: 'vencimiento', title: 'Arma su agenda de vencimientos', desc: 'Fechas de IVA, renta y más, automáticas',    href: '/contable/clientes', cta: 'Crear agenda', Icon: Calendar },
  { key: 'document',    title: 'Guarda un documento',            desc: 'RUT, cámara de comercio, declaraciones…',    href: '/contable/clientes', cta: 'Subir',        Icon: FileText },
];

// Guía de "primeros pasos". Cada paso se marca solo con los datos reales del
// negocio (endpoint /onboarding); no se persiste nada. Se puede ocultar y, al
// completarse todo, felicita una vez. Sirve para POS y Contable.
export function OnboardingChecklist() {
  const { data, patchState } = useOnboarding();

  // Se oculta cuando el usuario la cierra (guardado en la BD, cross-device).
  if (!data || data.state?.dismissed) return null;

  const steps = data.productType === 'contable' ? CONTABLE_STEPS : POS_STEPS;
  const isDone = (k: string) => !!data.steps?.[k];
  const doneCount = steps.filter((s) => isDone(s.key)).length;
  const total = steps.length;
  const allDone = doneCount === total;

  const dismiss = () => patchState({ dismissed: true });

  if (allDone) {
    return (
      <div className="card p-5 flex items-center gap-4 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/[0.06]">
        <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center flex-none">
          <Sparkles size={20} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-slate-900 dark:text-white">¡Listo! Ya diste tus primeros pasos 🎉</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Ya conoces lo básico. Cualquier cosa, aquí seguimos.</p>
        </div>
        <button onClick={dismiss} className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold flex-none">Entendido</button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-500" /> Primeros pasos
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Completa esta guía rápida para empezar. Te toma un par de minutos.</p>
        </div>
        <button onClick={dismiss} title="Ocultar guía" className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 p-1 flex-none"><X size={18} /></button>
      </div>

      {/* Barra de progreso */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${(doneCount / total) * 100}%` }} />
        </div>
        <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums flex-none">{doneCount} de {total}</span>
      </div>

      {/* Pasos */}
      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const done = isDone(s.key);
          return (
            <div key={s.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${done ? 'opacity-60' : 'bg-slate-50 dark:bg-white/[0.03]'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-none text-[12px] font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400'}`}>
                {done ? <Check size={15} /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-medium ${done ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>{s.title}</p>
                {!done && <p className="text-[11px] text-slate-400 truncate">{s.desc}</p>}
              </div>
              {!done && (
                <Link href={s.href} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold flex-none transition">
                  {s.cta} <ArrowRight size={13} />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
