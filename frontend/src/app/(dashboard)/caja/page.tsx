'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { PriceInput } from '@/components/ui/PriceInput';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Lock, Unlock, TrendingUp, TrendingDown, Loader2, ArrowUpCircle, ArrowDownCircle, Plus, X } from 'lucide-react';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

export default function CajaPage() {
  const qc = useQueryClient();
  const [showMovement, setShowMovement] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');

  const { data: cashRegister, isLoading } = useQuery({
    queryKey: ['cash-register-current'],
    queryFn: () => api.get('/cash-register/current').then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { register, handleSubmit, reset, control } = useForm();
  const { register: regMov, handleSubmit: handleMov, reset: resetMov, control: controlMov, formState: { isSubmitting: submittingMov } } = useForm();

  const openMutation = useMutation({
    mutationFn: (data: any) => api.post('/cash-register/open', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash-register-current'] }); toast.success('Caja abierta'); reset(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error'),
  });

  const closeMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.post(`/cash-register/${id}/close`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash-register-current'] }); toast.success('Caja cerrada'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error'),
  });

  const movementMutation = useMutation({
    mutationFn: ({ registerId, type, ...data }: any) =>
      api.post(`/cash-register/${registerId}/movement`, { ...data, type, amount: parseFloat(data.amount) }),
    onSuccess: (_res: any, { type }: any) => {
      qc.invalidateQueries({ queryKey: ['cash-register-current'] });
      toast.success(type === 'IN' ? 'Ingreso registrado' : 'Retiro registrado');
      setShowMovement(false);
      resetMov();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al registrar movimiento'),
  });

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (isLoading) return (
    <div className="space-y-4 max-w-2xl animate-fade-up">
      <div className="skeleton h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
      </div>
      <div className="skeleton h-40 w-full rounded-2xl" />
      <div className="skeleton h-32 w-full rounded-2xl" />
    </div>
  );

  /* ── Caja cerrada ─────────────────────────────────────────────────────── */
  if (!cashRegister) {
    return (
      <div className="max-w-sm mx-auto mt-12 animate-fade-up">
        <div className="card p-8 text-center space-y-5">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto">
            <Lock size={24} className="text-slate-400" />
          </div>
          <div>
            <h2 className="text-[17px] font-bold text-slate-800 dark:text-white">Caja cerrada</h2>
            <p className="text-[13px] text-slate-400 mt-1">Abre la caja para comenzar a registrar ventas</p>
          </div>
          <form onSubmit={handleSubmit((d: any) => openMutation.mutate(d))} className="space-y-3 pt-1">
            <div className="text-left">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Efectivo inicial ($)</label>
              <Controller control={control} name="openingAmount" render={({ field }) => (
                <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls + ' text-center text-lg font-semibold'} placeholder="0" />
              )} />
            </div>
            <button
              type="submit"
              disabled={openMutation.isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl shadow-sm shadow-emerald-600/25 transition flex items-center justify-center gap-2"
            >
              {openMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Unlock size={18} />}
              Abrir caja
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalIn  = cashRegister.totalIn  ?? cashRegister.movements?.filter((m: any) => m.type === 'IN').reduce((a: number, m: any) => a + Number(m.amount), 0) ?? 0;
  const totalOut = cashRegister.totalOut ?? cashRegister.movements?.filter((m: any) => m.type === 'OUT').reduce((a: number, m: any) => a + Number(m.amount), 0) ?? 0;
  const expected = cashRegister.expectedAmount ?? (cashRegister.openingAmount + totalIn - totalOut);

  return (
    <div className="space-y-4 max-w-2xl animate-fade-up">

      {/* ── Estado caja abierta ───────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Caja abierta</h2>
          </div>
          <span className="text-[12px] text-slate-400 dark:text-slate-500">Desde {formatDateTime(cashRegister.openedAt)}</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-3.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400 mb-1">Apertura</p>
            <p className="text-[17px] font-bold text-blue-700 dark:text-blue-300 tabular-nums">{formatCurrency(cashRegister.openingAmount)}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-3.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-1 flex items-center justify-center gap-1">
              <TrendingUp size={10} /> Ingresos
            </p>
            <p className="text-[17px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{formatCurrency(totalIn)}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 dark:text-red-400 mb-1 flex items-center justify-center gap-1">
              <TrendingDown size={10} /> Egresos
            </p>
            <p className="text-[17px] font-bold text-red-700 dark:text-red-300 tabular-nums">{formatCurrency(totalOut)}</p>
          </div>
        </div>

        <div className="mt-4 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-white/[0.06] rounded-xl flex justify-between items-center">
          <span className="text-[13px] text-slate-500 dark:text-slate-400">Efectivo esperado en caja</span>
          <span className="text-[20px] font-bold text-slate-900 dark:text-white tabular-nums">{formatCurrency(expected)}</span>
        </div>
      </div>

      {/* ── Movimiento manual ─────────────────────────────────────────────── */}
      <div className="card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">Movimiento manual</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setMovementType('IN'); setShowMovement(true); resetMov(); }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition font-semibold text-[13px]"
          >
            <ArrowUpCircle size={16} /> Ingresar dinero
          </button>
          <button
            type="button"
            onClick={() => { setMovementType('OUT'); setShowMovement(true); resetMov(); }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition font-semibold text-[13px]"
          >
            <ArrowDownCircle size={16} /> Retirar dinero
          </button>
        </div>
      </div>

      {/* ── Cerrar caja ───────────────────────────────────────────────────── */}
      <div className="card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-1.5">
          <Lock size={11} /> Cerrar caja
        </p>
        <form onSubmit={handleSubmit((d: any) => closeMutation.mutate({ id: cashRegister.id, data: d }))} className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Efectivo contado en caja ($)</label>
            <Controller control={control} name="closingAmount" rules={{ required: true }} render={({ field }) => (
              <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder={String(expected)} />
            )} />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Notas (opcional)</label>
            <input {...register('notes')} type="text" className={inputCls} placeholder="Observaciones del arqueo..." />
          </div>
          <button
            type="submit"
            disabled={closeMutation.isPending}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl shadow-sm shadow-red-600/20 transition flex items-center justify-center gap-2 text-[13px]"
          >
            {closeMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
            Cerrar y hacer arqueo
          </button>
        </form>
      </div>

      {/* ── Movimientos del día ───────────────────────────────────────────── */}
      {cashRegister.movements?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Movimientos del día</p>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
            {cashRegister.movements.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                <div>
                  <p className="text-[13px] text-slate-700 dark:text-slate-300">{m.description}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{formatDateTime(m.createdAt)}</p>
                </div>
                <span className={`text-[13px] font-bold tabular-nums ${m.type === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {m.type === 'IN' ? '+' : '−'}{formatCurrency(m.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal movimiento ──────────────────────────────────────────────── */}
      {showMovement && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                {movementType === 'IN'
                  ? <><ArrowUpCircle size={16} className="text-emerald-500" /> Ingresar dinero</>
                  : <><ArrowDownCircle size={16} className="text-red-500" /> Retirar dinero</>}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowMovement(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleMov((d: any) => movementMutation.mutate({ ...d, registerId: cashRegister?.id, type: movementType }))}
              className="p-6 space-y-4"
            >
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Monto ($) *</label>
                <Controller control={controlMov} name="amount" rules={{ required: true, min: 0.01 }} render={({ field }) => (
                  <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder="0" autoFocus />
                )} />
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Descripción *</label>
                <input
                  {...regMov('description', { required: true })}
                  type="text"
                  placeholder={movementType === 'IN' ? 'Ej: Préstamo, Ingreso extra...' : 'Ej: Pago transporte, Retiro dueño...'}
                  className={inputCls}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowMovement(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={movementMutation.isPending || submittingMov}
                  className={`flex-1 px-4 py-2.5 text-white rounded-xl text-[13px] font-semibold disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm transition ${
                    movementType === 'IN'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                  }`}
                >
                  {(movementMutation.isPending || submittingMov) && <Loader2 size={14} className="animate-spin" />}
                  <Plus size={14} /> Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}