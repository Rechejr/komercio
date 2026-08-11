'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { EyeOff, Loader2 } from 'lucide-react';

// Arqueo a ciegas: cuando está activo, los CAJEROS no ven el efectivo esperado
// ni los movimientos/totales al cerrar la caja — cuentan el efectivo físico "a
// ciegas" y el sistema calcula el faltante/sobrante real. El dueño y los
// supervisores siempre ven todo. Se guarda dentro de business.settings (sin
// migración). Solo el dueño (ADMIN) ve este ajuste.
export function BlindCashCountSettings({ business }: { business: any }) {
  const qc = useQueryClient();
  const activo = !!business?.settings?.blindCashCount;

  const toggle = useMutation({
    mutationFn: (value: boolean) =>
      api.put('/business/me', { settings: { ...(business?.settings || {}), blindCashCount: value } }),
    onSuccess: (_res, value) => {
      qc.invalidateQueries({ queryKey: ['business'] });
      qc.invalidateQueries({ queryKey: ['business-me'] });
      toast.success(value ? 'Arqueo a ciegas activado' : 'Arqueo a ciegas desactivado');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo guardar'),
  });

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <EyeOff size={17} className="text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Arqueo a ciegas</h2>
          </div>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Al activarlo, tus <b>cajeros</b> no verán el efectivo esperado ni los movimientos al cerrar la
            caja: contarán el dinero físico sin pistas, y el sistema calculará el faltante o sobrante real.
            Tú (dueño) y los supervisores siguen viendo todo.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={activo}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(!activo)}
          className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition disabled:opacity-60 ${
            activo ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          {toggle.isPending ? (
            <Loader2 size={12} className="animate-spin text-white mx-auto" />
          ) : (
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${activo ? 'translate-x-6' : 'translate-x-1'}`} />
          )}
        </button>
      </div>
    </div>
  );
}
