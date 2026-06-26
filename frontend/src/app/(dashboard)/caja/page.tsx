'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Lock, Unlock, TrendingUp, TrendingDown, Loader2, ArrowUpCircle, ArrowDownCircle, Plus, X } from 'lucide-react';

export default function CajaPage() {
  const qc = useQueryClient();
  const [showMovement, setShowMovement] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');

  const { data: cashRegister, isLoading } = useQuery({
    queryKey: ['cash-register-current'],
    queryFn: () => api.get('/cash-register/current').then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { register, handleSubmit, reset } = useForm();
  const { register: regMov, handleSubmit: handleMov, reset: resetMov, formState: { isSubmitting: submittingMov } } = useForm();

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
    mutationFn: (data: any) =>
      api.post(`/cash-register/${cashRegister.id}/movement`, { ...data, type: movementType, amount: parseFloat(data.amount) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-register-current'] });
      toast.success(movementType === 'IN' ? 'Ingreso registrado' : 'Retiro registrado');
      setShowMovement(false);
      resetMov();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al registrar movimiento'),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  if (!cashRegister) {
    return (
      <div className="max-w-sm mx-auto mt-12">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
            <Lock size={28} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Caja cerrada</h2>
          <p className="text-sm text-gray-500">Abre la caja para comenzar a registrar ventas</p>
          <form onSubmit={handleSubmit((d) => openMutation.mutate(d))} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block text-left">Efectivo inicial ($)</label>
              <input
                {...register('openingAmount')}
                type="number" step="0.01" placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
              />
            </div>
            <button type="submit" disabled={openMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2">
              {openMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Unlock size={18} />}
              Abrir caja
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Usar totales calculados en el servidor (incluye TODOS los movimientos, no solo los 50 del display)
  const totalIn  = cashRegister.totalIn  ?? cashRegister.movements?.filter((m: any) => m.type === 'IN').reduce((a: number, m: any)  => a + Number(m.amount), 0) ?? 0;
  const totalOut = cashRegister.totalOut ?? cashRegister.movements?.filter((m: any) => m.type === 'OUT').reduce((a: number, m: any) => a + Number(m.amount), 0) ?? 0;
  const expected = cashRegister.expectedAmount ?? (cashRegister.openingAmount + totalIn - totalOut);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <h2 className="font-semibold text-gray-800 dark:text-white">Caja abierta</h2>
          </div>
          <span className="text-xs text-gray-400">Desde {formatDateTime(cashRegister.openedAt)}</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-500">Apertura</p>
            <p className="font-bold text-blue-700 dark:text-blue-400 text-lg">{formatCurrency(cashRegister.openingAmount)}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
            <p className="text-xs text-green-500 flex items-center justify-center gap-1"><TrendingUp size={11} /> Ingresos</p>
            <p className="font-bold text-green-700 dark:text-green-400 text-lg">{formatCurrency(totalIn)}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
            <p className="text-xs text-red-500 flex items-center justify-center gap-1"><TrendingDown size={11} /> Egresos</p>
            <p className="font-bold text-red-700 dark:text-red-400 text-lg">{formatCurrency(totalOut)}</p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl flex justify-between items-center">
          <span className="text-sm text-gray-600 dark:text-gray-300">Efectivo esperado en caja</span>
          <span className="font-bold text-xl text-gray-800 dark:text-white">{formatCurrency(expected)}</span>
        </div>
      </div>

      {/* Manual movements */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-white">Movimiento manual</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button"
            onClick={() => { setMovementType('IN'); setShowMovement(true); resetMov(); }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400 transition font-semibold text-sm">
            <ArrowUpCircle size={18} /> Ingresar dinero
          </button>
          <button type="button"
            onClick={() => { setMovementType('OUT'); setShowMovement(true); resetMov(); }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400 transition font-semibold text-sm">
            <ArrowDownCircle size={18} /> Retirar dinero
          </button>
        </div>
      </div>

      {/* Close */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><Lock size={16} /> Cerrar caja</h3>
        <form onSubmit={handleSubmit((d) => closeMutation.mutate({ id: cashRegister.id, data: d }))} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Efectivo contado en caja ($)</label>
            <input
              {...register('closingAmount', { required: true })}
              type="number" step="0.01" placeholder={String(expected)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notas (opcional)</label>
            <input {...register('notes')} type="text"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
          </div>
          <button type="submit" disabled={closeMutation.isPending}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2">
            {closeMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            Cerrar y hacer arqueo
          </button>
        </form>
      </div>

      {/* Movements list */}
      {cashRegister.movements?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-800 dark:text-white">Movimientos del día</h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {cashRegister.movements.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="text-gray-700 dark:text-gray-300">{m.description}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(m.createdAt)}</p>
                </div>
                <span className={`font-semibold ${m.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                  {m.type === 'IN' ? '+' : '-'}{formatCurrency(m.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {showMovement && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                {movementType === 'IN'
                  ? <><ArrowUpCircle size={18} className="text-green-500" /> Ingresar dinero</>
                  : <><ArrowDownCircle size={18} className="text-red-500" /> Retirar dinero</>}
              </h2>
              <button type="button" aria-label="Cerrar" onClick={() => setShowMovement(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleMov((d) => movementMutation.mutate(d))} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Monto ($) *</label>
                <input
                  {...regMov('amount', { required: true, min: 0.01 })}
                  type="number" step="0.01" min="0.01" placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Descripción *</label>
                <input
                  {...regMov('description', { required: true })}
                  type="text"
                  placeholder={movementType === 'IN' ? 'Ej: Préstamo, Ingreso extra...' : 'Ej: Pago transporte, Retiro dueño...'}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowMovement(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={movementMutation.isPending || submittingMov}
                  className={`flex-1 px-4 py-2.5 text-white rounded-lg text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition ${
                    movementType === 'IN' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}>
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