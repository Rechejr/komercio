'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Sparkles, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';

export function AiSummaryCard() {
  const { user } = useAuthStore();
  const openUpgrade = useUpgradeStore((s) => s.open);
  const isFree = !user?.plan || user.plan === 'free';

  const { data, isLoading } = useQuery({
    queryKey: ['ai-weekly-summary'],
    queryFn: () => api.get('/dashboard/ai-summary').then((r) => r.data.data),
    enabled: !isFree,
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={15} className="text-emerald-500 dark:text-emerald-400" />
        <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white">Resumen semanal con IA</h3>
      </div>

      {isFree ? (
        <div className="relative">
          <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed blur-sm select-none pointer-events-none">
            Vendiste más que la semana pasada. Tu producto más rentable fue uno de tus favoritos y hay
            productos con poco stock que vale la pena revisar antes de que se agoten.
          </p>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 dark:bg-slate-900/70">
            <Lock size={18} className="text-slate-400 dark:text-slate-500" />
            <p className="text-[12px] text-slate-500 dark:text-slate-400 text-center">
              Análisis con IA — disponible en el plan Pro
            </p>
            <button
              type="button"
              onClick={openUpgrade}
              className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Actualizar a Pro
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-5/6 rounded" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>
      ) : data?.summary ? (
        <>
          <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">{data.summary}</p>
          {data.createdAt && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              Generado el {formatDateTime(data.createdAt)}
            </p>
          )}
        </>
      ) : (
        <p className="text-[13px] text-slate-400 dark:text-slate-500">
          No pudimos generar tu resumen esta semana.
        </p>
      )}
    </div>
  );
}
