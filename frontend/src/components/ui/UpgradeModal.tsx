'use client';

import { useState } from 'react';
import { useUpgradeStore } from '@/store/upgrade.store';
import { X, Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

// ─── Config ────────────────────────────────────────────────────────────────────
const BASE_PRICE = 29900;

const PERIODS = [
  { key: 'monthly',   label: 'Mensual',    badge: null,   months: 1,  discount: 0    },
  { key: 'quarterly', label: 'Trimestral', badge: '-10%', months: 3,  discount: 0.10 },
  { key: 'annual',    label: 'Anual',      badge: '-20%', months: 12, discount: 0.20 },
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

const PRO_FEATURES = [
  'Productos, clientes y ventas ilimitadas',
  'Usuarios ilimitados y hasta 2 bodegas',
  'Módulo de créditos y fiados',
  'Módulo de proveedores y compras',
  'Exportar reportes a Excel y PDF',
  'Reportes avanzados y estadísticas',
  'Soporte prioritario por WhatsApp',
];

function cop(n: number) {
  return `$ ${n.toLocaleString('es-CO')}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function UpgradeModal() {
  const { isOpen, close } = useUpgradeStore();
  const [period, setPeriod]     = useState<PeriodKey>('monthly');
  const [expanded, setExpanded] = useState(false);
  const [paying, setPaying]     = useState(false);
  const [payError, setPayError] = useState('');

  if (!isOpen) return null;

  const p       = PERIODS.find((x) => x.key === period)!;
  const monthly = Math.round(BASE_PRICE * (1 - p.discount));
  const total   = Math.round(BASE_PRICE * p.months * (1 - p.discount));
  const saving  = Math.round(BASE_PRICE * p.months * p.discount);

  async function handlePay() {
    setPayError('');
    setPaying(true);
    try {
      const { data } = await api.post<{ success: boolean; data: { url: string } }>('/payments/create-link', { period });
      window.location.href = data.data.url;
    } catch {
      setPayError('No se pudo iniciar el pago. Intenta de nuevo.');
      setPaying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

      <div
        className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Cambiar plan</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 overflow-y-auto flex-1 min-h-0">
          {/* ── Period tabs ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-5">
            {PERIODS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPeriod(opt.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all',
                  period === opt.key
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200',
                )}
              >
                {opt.label}
                {opt.badge && (
                  <span className={cn(
                    'text-xs font-bold px-1.5 py-0.5 rounded-full',
                    period === opt.key
                      ? 'bg-white/20 text-white dark:bg-black/20 dark:text-slate-900'
                      : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
                  )}>
                    {opt.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Saving chip ──────────────────────────────────────────────── */}
          {saving > 0 && (
            <div className="flex justify-center mb-4">
              <span className="inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-semibold px-3 py-1.5 rounded-full border border-green-200 dark:border-green-800">
                <Check size={12} strokeWidth={3} />
                Ahorras {cop(saving)} al {p.label.toLowerCase()}
              </span>
            </div>
          )}

          {/* ── Plan Pro card ─────────────────────────────────────────────── */}
          <div className="border-2 border-emerald-500 rounded-2xl overflow-hidden mb-3">
            <div className="flex items-center gap-3 p-4">
              {/* Radio */}
              <div className="w-5 h-5 rounded-full border-2 border-emerald-500 flex items-center justify-center flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 dark:text-white">Plan Pro</span>
                  <span className="inline-flex items-center gap-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold px-2 py-0.5 rounded-full">
                    ⭐ Recomendado
                  </span>
                  <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-full">
                    Web
                  </span>
                </div>
              </div>

              {/* Price */}
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-slate-900 dark:text-white text-sm leading-tight">
                  {cop(monthly)}
                  <span className="text-slate-400 font-normal"> / mes</span>
                </p>
                {period !== 'monthly' && (
                  <p className="text-xs text-slate-400 mt-0.5">Total {cop(total)}</p>
                )}
              </div>

              {/* Expand */}
              <button
                type="button"
                aria-label="Ver características del plan Pro"
                onClick={() => setExpanded((v) => !v)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0 ml-1"
              >
                <ChevronDown size={18} className={cn('transition-transform duration-200', expanded && 'rotate-180')} />
              </button>
            </div>

            {/* Features expandable */}
            {expanded && (
              <div className="border-t border-emerald-100 dark:border-emerald-900/40 px-4 py-3 bg-emerald-50/50 dark:bg-emerald-900/10">
                <ul className="space-y-2">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <Check size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Free plan card (current) ──────────────────────────────────── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3 mb-6">
            <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0" />
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Plan Gratuito</span>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium px-2 py-0.5 rounded-full">
                Plan actual
              </span>
            </div>
            <span className="text-slate-400 text-sm font-medium flex-shrink-0">Gratis</span>
          </div>
        </div>

        {/* ── Sticky CTA ─────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0 bg-white dark:bg-slate-900">
          {payError && (
            <p className="text-xs text-red-500 text-center mb-2">{payError}</p>
          )}
          <button
            type="button"
            onClick={handlePay}
            disabled={paying}
            className="flex items-center justify-between w-full bg-slate-900 dark:bg-white hover:bg-slate-700 dark:hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed text-white dark:text-slate-900 font-semibold py-4 px-5 rounded-xl transition-colors text-sm"
          >
            <div className="flex items-center gap-2.5">
              {paying ? (
                <Loader2 size={18} className="animate-spin flex-shrink-0" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 flex-shrink-0">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              )}
              {paying ? 'Redirigiendo a pago...' : 'Pagar ahora'}
            </div>
            <span className="font-bold">{cop(monthly)} →</span>
          </button>
          <p className="text-center text-xs text-slate-400 mt-2">
            Pago seguro con tarjeta, Nequi o PSE · Wompi
          </p>
        </div>
      </div>
    </div>
  );
}
