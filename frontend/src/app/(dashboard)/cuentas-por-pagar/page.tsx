'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { PriceInput } from '@/components/ui/PriceInput';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, statusColor, statusLabel } from '@/lib/utils';
import { usePaymentAccounts, labelPago } from '@/lib/usePaymentAccounts';
import toast from 'react-hot-toast';
import { HandCoins, X, Loader2, DollarSign, ChevronRight, Search } from 'lucide-react';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';
const filterCls = 'px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

export default function CuentasPorPagarPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const { active: paymentAccounts, all: allAccounts } = usePaymentAccounts();
  const { register, handleSubmit, reset, control, formState: { errors: payErrors } } = useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-credits', statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      return api.get(`/supplier-credits?${params}`).then((r) => r.data);
    },
  });

  const { data: detail } = useQuery({
    queryKey: ['supplier-credit', selected?.id],
    queryFn: () => api.get(`/supplier-credits/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected?.id && showDetail,
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => api.post(`/supplier-credits/${id}/payments`, d),
    onSuccess: (_res: any, { id }: any) => {
      qc.invalidateQueries({ queryKey: ['supplier-credits'] });
      qc.invalidateQueries({ queryKey: ['supplier-credit', id] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Pago registrado');
      setShowPayment(false);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al registrar el pago'),
  });

  const rows = (data?.data || []).filter((c: any) =>
    !search || c.supplier?.name?.toLowerCase().includes(search.toLowerCase()) || c.purchase?.invoiceNumber?.toLowerCase().includes(search.toLowerCase()),
  );
  const pagination = data?.pagination;

  const openDetail = (c: any) => { setSelected(c); setShowDetail(true); setShowPayment(false); };
  const openPayment = (c: any) => { setSelected(c); setShowPayment(true); setShowDetail(false); reset(); };

  return (
    <>
    <div className="space-y-4 animate-fade-up">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3">
        <select aria-label="Filtrar por estado" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={filterCls}>
          <option value="">Todas</option>
          <option value="PENDING">Pendientes</option>
          <option value="PARTIAL">Con abonos</option>
          <option value="OVERDUE">Vencidas</option>
          <option value="PAID">Pagadas</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por proveedor o factura…" className={`${inputCls} pl-9`} />
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Proveedor</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Factura</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</th>
                <th className="hidden sm:table-cell text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Abonado</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Saldo</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" /></td>)}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                    <HandCoins size={36} strokeWidth={1.5} />
                    <p className="text-[13px]">No hay cuentas por pagar</p>
                  </div>
                </td></tr>
              ) : rows.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => openDetail(c)}>
                  <td className="px-4 py-3 text-[13px] font-medium text-slate-800 dark:text-white">{c.supplier?.name}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-[12px] text-slate-500 dark:text-slate-400 font-mono">{c.purchase?.invoiceNumber || '—'}</td>
                  <td className="px-4 py-3 text-right text-[13px] text-slate-600 dark:text-slate-300 tabular-nums">{formatCurrency(c.totalAmount)}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-right text-[13px] text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(c.paidAmount)}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(c.balance)}</td>
                  <td className="px-4 py-3"><span className={`badge ${statusColor(c.status)}`}>{statusLabel(c.status)}</span></td>
                  <td className="px-4 py-3 text-right">
                    {c.status !== 'PAID' && c.status !== 'CANCELLED' && (
                      <button onClick={(e) => { e.stopPropagation(); openPayment(c); }} className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">Abonar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[13px] text-slate-500">
            <span>{pagination.total} cuentas</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 text-[12px]">Anterior</button>
              <span className="px-3 py-1.5 text-slate-400">{page} / {pagination.totalPages}</span>
              <button disabled={page === pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 text-[12px]">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Abonar */}
    {showPayment && selected && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setShowPayment(false)}>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Pagar al proveedor</h2>
            <button aria-label="Cerrar" onClick={() => setShowPayment(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><X size={16} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl px-4 py-3 text-center">
              <p className="text-[12px] text-red-500 dark:text-red-400 mb-1">Saldo con <span className="font-semibold">{selected.supplier?.name}</span></p>
              <p className="text-[24px] font-bold text-red-700 dark:text-red-300 tabular-nums">{formatCurrency(selected.balance)}</p>
            </div>
            <form onSubmit={handleSubmit((d: any) => paymentMutation.mutate({ ...d, id: selected.id }))} className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Monto del abono *</label>
                <Controller
                  control={control}
                  name="amount"
                  rules={{ required: 'El monto es obligatorio', min: { value: 0.01, message: 'El monto debe ser mayor a 0' }, max: { value: Number(selected?.balance) ?? Infinity, message: 'No puede superar el saldo' } }}
                  render={({ field }) => <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder="0" autoFocus />}
                />
                {payErrors.amount && <p className="text-[11px] text-red-500 mt-1">{payErrors.amount.message as string}</p>}
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Medio de pago</label>
                <select {...register('paymentAccountId')} className={inputCls}>
                  {paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Notas (opcional)</label>
                <input {...register('notes')} type="text" className={inputCls} />
              </div>
              <button type="submit" disabled={paymentMutation.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl shadow-sm shadow-emerald-600/20 transition flex items-center justify-center gap-2 text-[13px]">
                {paymentMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <DollarSign size={15} />} Registrar pago
              </button>
            </form>
          </div>
        </div>
      </div>
    )}

    {/* Detalle */}
    {showDetail && selected && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => { setShowDetail(false); setSelected(null); }}>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
            <div>
              <h2 className="text-[15px] font-bold text-slate-800 dark:text-white">{(detail || selected).supplier?.name}</h2>
              <p className="text-[12px] text-slate-400">{(detail || selected).purchase?.invoiceNumber ? `Factura ${(detail || selected).purchase.invoiceNumber}` : 'Compra a crédito'}</p>
            </div>
            <button aria-label="Cerrar" onClick={() => { setShowDetail(false); setSelected(null); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><X size={16} /></button>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto min-h-0 flex-1">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] py-2.5"><p className="text-[10px] uppercase text-slate-400">Total</p><p className="text-[14px] font-bold text-slate-800 dark:text-white tabular-nums">{formatCurrency((detail || selected).totalAmount)}</p></div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 py-2.5"><p className="text-[10px] uppercase text-emerald-500">Abonado</p><p className="text-[14px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{formatCurrency((detail || selected).paidAmount)}</p></div>
              <div className="rounded-xl bg-red-50 dark:bg-red-500/10 py-2.5"><p className="text-[10px] uppercase text-red-500">Saldo</p><p className="text-[14px] font-bold text-red-700 dark:text-red-300 tabular-nums">{formatCurrency((detail || selected).balance)}</p></div>
            </div>

            {(detail || selected).dueDate && (
              <p className="text-[12px] text-slate-500 dark:text-slate-400">Fecha de pago acordada: <b>{formatDate((detail || selected).dueDate)}</b></p>
            )}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Abonos</p>
              {(detail?.payments || []).length === 0 ? (
                <p className="text-[12px] text-slate-400 py-3 text-center">Aún no hay abonos.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.payments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-[12px]">
                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(p.amount)}</p>
                        <p className="text-[11px] text-slate-400">{formatDateTime(p.createdAt)} · {labelPago(allAccounts, p.paymentAccountId, p.paymentMethod)}</p>
                      </div>
                      {p.notes && <span className="text-[11px] text-slate-400 italic truncate max-w-[120px]">{p.notes}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selected.status !== 'PAID' && selected.status !== 'CANCELLED' && (
              <button onClick={() => openPayment(selected)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-[13px] flex items-center justify-center gap-2">
                <DollarSign size={15} /> Pagar al proveedor
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
