'use client';

import { useState } from 'react';
import { useUpgradeStore } from '@/store/upgrade.store';
import { X, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Config ────────────────────────────────────────────────────────────────────
const WHATSAPP_NUMBER = '573102979527';
const BASE_PRICE      = 19900;

const PERIODS = [
  { key: 'monthly',   label: 'Mensual',    badge: null,   months: 1,  discount: 0    },
  { key: 'quarterly', label: 'Trimestral', badge: '-10%', months: 3,  discount: 0.10 },
  { key: 'annual',    label: 'Anual',      badge: '-25%', months: 12, discount: 0.25 },
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

const PRO_FEATURES = [
  'Productos, clientes y ventas ilimitadas',
  'Usuarios y sucursales ilimitadas',
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

  if (!isOpen) return null;

  const p          = PERIODS.find((x) => x.key === period)!;
  const monthly    = Math.round(BASE_PRICE * (1 - p.discount));
  const total      = Math.round(BASE_PRICE * p.months * (1 - p.discount));
  const saving     = Math.round(BASE_PRICE * p.months * p.discount);

  const periodLabel: Record<PeriodKey, string> = {
    monthly:   'mensual',
    quarterly: 'trimestral',
    annual:    'anual',
  };

  const waText = encodeURIComponent(
    `¡Hola! Quiero actualizar mi negocio al Plan Pro de Ventrix (facturación ${periodLabel[period]}). ¿Me puedes indicar cómo realizar el pago? (Nequi o transferencia BBVA)`,
  );
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${waText}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Cambiar plan</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 overflow-y-auto flex-1">
          {/* ── Period tabs ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-5">
            {PERIODS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPeriod(opt.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all',
                  period === opt.key
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200',
                )}
              >
                {opt.label}
                {opt.badge && (
                  <span className={cn(
                    'text-xs font-bold px-1.5 py-0.5 rounded-full',
                    period === opt.key
                      ? 'bg-white/20 text-white dark:bg-black/20 dark:text-gray-900'
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
                Ahorras {cop(saving)} al {periodLabel[period]}
              </span>
            </div>
          )}

          {/* ── Plan Pro card ─────────────────────────────────────────────── */}
          <div className="border-2 border-blue-500 rounded-2xl overflow-hidden mb-3">
            <div className="flex items-center gap-3 p-4">
              {/* Radio */}
              <div className="w-5 h-5 rounded-full border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900 dark:text-white">Plan Pro</span>
                  <span className="inline-flex items-center gap-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold px-2 py-0.5 rounded-full">
                    ⭐ Recomendado
                  </span>
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-full">
                    Web
                  </span>
                </div>
              </div>

              {/* Price */}
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900 dark:text-white text-sm leading-tight">
                  {cop(monthly)}
                  <span className="text-gray-400 font-normal"> / mes</span>
                </p>
                {period !== 'monthly' && (
                  <p className="text-xs text-gray-400 mt-0.5">Total {cop(total)}</p>
                )}
              </div>

              {/* Expand */}
              <button
                type="button"
                aria-label="Ver características del plan Pro"
                onClick={() => setExpanded((v) => !v)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 ml-1"
              >
                <ChevronDown size={18} className={cn('transition-transform duration-200', expanded && 'rotate-180')} />
              </button>
            </div>

            {/* Features expandable */}
            {expanded && (
              <div className="border-t border-blue-100 dark:border-blue-900/40 px-4 py-3 bg-blue-50/50 dark:bg-blue-900/10">
                <ul className="space-y-2">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <Check size={13} className="text-blue-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Free plan card (current) ──────────────────────────────────── */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex items-center gap-3 mb-6">
            <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Plan Gratuito</span>
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium px-2 py-0.5 rounded-full">
                Plan actual
              </span>
            </div>
            <span className="text-gray-400 text-sm font-medium flex-shrink-0">Gratis</span>
          </div>
        </div>

        {/* ── Sticky CTA ─────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-900">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full bg-gray-900 dark:bg-white hover:bg-gray-700 dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold py-4 px-5 rounded-xl transition-colors text-sm"
          >
            <div className="flex items-center gap-2.5">
              {/* WhatsApp icon */}
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current flex-shrink-0">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Actualizar plan
            </div>
            <span className="font-bold">{cop(monthly)} →</span>
          </a>
        </div>
      </div>
    </div>
  );
}
