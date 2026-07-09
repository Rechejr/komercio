'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { PriceInput } from '@/components/ui/PriceInput';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, statusColor, statusLabel } from '@/lib/utils';
import toast from 'react-hot-toast';
import { CreditCard, X, Loader2, Plus, DollarSign, ChevronRight, Clock, Search } from 'lucide-react';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

export default function CreditosPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [customerFilterId, setCustomerFilterId] = useState('');
  const [page, setPage] = useState(1);

  // Créditos no tiene un `search` de texto libre propio — filtra por cliente
  // resuelto a un id (ver el combobox de abajo) — así que llegar desde la
  // búsqueda global con "?search=Nombre" reutiliza ese mismo mecanismo en vez
  // de mandarlo directo al backend (que no soporta ese parámetro aquí).
  useEffect(() => {
    const q = searchParams.get('search');
    if (!q) return;
    api.get(`/customers?search=${encodeURIComponent(q)}&limit=1`).then((r) => {
      const c = r.data.data?.[0];
      if (c) { setCustomerFilter(c.name); setCustomerFilterId(c.id); }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [selected, setSelected] = useState<any>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showNewCredit, setShowNewCredit] = useState(false);

  const { data: filterCustomers } = useQuery({
    queryKey: ['customers-filter', customerFilter],
    queryFn: () => api.get(`/customers?limit=10&search=${encodeURIComponent(customerFilter)}`).then((r) => r.data.data),
    enabled: customerFilter.length > 1,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['credits', statusFilter, customerFilterId, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (customerFilterId) params.set('customerId', customerFilterId);
      return api.get(`/credits?${params}`).then((r) => r.data);
    },
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['credit', selected?.id],
    queryFn: () => api.get(`/credits/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected?.id && showDetail,
  });

  const { register, handleSubmit, reset, control, formState: { errors: payErrors } } = useForm();
  const { register: regNew, handleSubmit: handleNew, reset: resetNew, control: controlNew, formState: { errors: newErrors } } = useForm();

  const [customerSearch, setCustomerSearch] = useState('');
  const { data: customersData } = useQuery({
    queryKey: ['customers-list', customerSearch],
    queryFn: () => api.get(`/customers?limit=20&search=${encodeURIComponent(customerSearch)}`).then((r) => r.data),
  });
  const customerList = customersData?.data || [];

  const paymentMutation = useMutation({
    mutationFn: ({ creditId, ...data }: any) => api.post(`/credits/${creditId}/payments`, data),
    onSuccess: (_res: any, { creditId }: any) => {
      qc.invalidateQueries({ queryKey: ['credits'] });
      qc.invalidateQueries({ queryKey: ['credit', creditId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Pago registrado');
      setShowPayment(false);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al registrar pago'),
  });

  const newCreditMutation = useMutation({
    mutationFn: (data: any) => api.post('/credits', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credits'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Crédito creado');
      setShowNewCredit(false);
      resetNew();
      setCustomerSearch('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al crear crédito'),
  });

  const credits = data?.data || [];
  const pagination = data?.pagination;

  function openDetail(c: any) { setSelected(c); setShowDetail(true); setShowPayment(false); }
  function openPayment(c: any) { setSelected(c); setShowPayment(true); setShowDetail(false); reset(); }

  return (
    <>
    <div className="space-y-4 animate-fade-up">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendientes</option>
          <option value="PARTIAL">Abonados</option>
          <option value="OVERDUE">Vencidos</option>
          <option value="PAID">Pagados</option>
          <option value="CANCELLED">Anulados</option>
        </select>

        {/* Customer filter */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={customerFilter}
            onChange={(e) => { setCustomerFilter(e.target.value); if (!e.target.value) { setCustomerFilterId(''); setPage(1); } }}
            placeholder="Filtrar por cliente..."
            className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
          />
          {customerFilter.length > 1 && filterCustomers && filterCustomers.length > 0 && !customerFilterId && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-lg z-20 overflow-hidden">
              {filterCustomers.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCustomerFilterId(c.id); setCustomerFilter(c.name); setPage(1); }}
                  className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-white/[0.04] text-slate-700 dark:text-slate-300 transition"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {customerFilterId && (
            <button
              type="button"
              aria-label="Limpiar filtro de cliente"
              onClick={() => { setCustomerFilter(''); setCustomerFilterId(''); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => { setShowNewCredit(true); resetNew(); setCustomerSearch(''); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition"
        >
          <Plus size={15} /> Nuevo crédito
        </button>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Cliente</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Factura</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</th>
                <th className="hidden md:table-cell text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Abonado</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Saldo</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Vencimiento</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Estado</th>
                <th className="w-24 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : credits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <CreditCard size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">No hay créditos{statusFilter ? ' con ese estado' : ''}</p>
                    </div>
                  </td>
                </tr>
              ) : credits.map((c: any) => (
                <tr
                  key={c.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => openDetail(c)}
                >
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-slate-800 dark:text-white">{c.customer?.name}</p>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 font-mono text-[12px] text-emerald-600 dark:text-emerald-400">
                    {c.sale?.invoiceNumber || '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] text-slate-600 dark:text-slate-300 tabular-nums">
                    {formatCurrency(c.totalAmount)}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-right text-[13px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(c.paidAmount)}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {formatCurrency(c.balance)}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                    {c.dueDate ? formatDate(c.dueDate) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${statusColor(c.status)}`}>{statusLabel(c.status)}</span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {c.status !== 'PAID' && (
                        <button
                          type="button"
                          onClick={() => openPayment(c)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition whitespace-nowrap"
                        >
                          <Plus size={11} /> Abonar
                        </button>
                      )}
                      <ChevronRight size={14} className="text-slate-300 dark:text-slate-600" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[13px] text-slate-500">
            <span>{pagination.total} créditos</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-[12px]">
                Anterior
              </button>
              <span className="px-3 py-1.5 text-slate-400">{page} / {pagination.totalPages}</span>
              <button type="button" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-[12px]">
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

    </div>

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {showDetail && selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0 bg-white dark:bg-slate-900">
              <div>
                <h2 className="text-[16px] font-bold text-slate-800 dark:text-white">{selected.customer?.name}</h2>
                <p className="text-[12px] text-slate-400 mt-0.5 font-mono">{selected.sale?.invoiceNumber || '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status !== 'PAID' && (
                  <button
                    type="button"
                    onClick={() => { setShowDetail(false); setShowPayment(true); reset(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
                  >
                    <Plus size={12} /> Abonar
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => { setShowDetail(false); setSelected(null); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto min-h-0">
              {/* KPI cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/[0.06] rounded-xl p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Total fiado</p>
                  <p className="text-[15px] font-bold text-slate-700 dark:text-white tabular-nums">{formatCurrency(selected.totalAmount)}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500 mb-1">Abonado</p>
                  <p className="text-[15px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{formatCurrency(selected.paidAmount)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 mb-1">Saldo</p>
                  <p className="text-[15px] font-bold text-red-700 dark:text-red-300 tabular-nums">{formatCurrency(selected.balance)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className={`badge ${statusColor(selected.status)}`}>{statusLabel(selected.status)}</span>
                {selected.dueDate && (
                  <span className="text-[12px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <Clock size={12} /> Vence: {formatDate(selected.dueDate)}
                  </span>
                )}
              </div>

              {/* Historial de abonos */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">Historial de abonos</p>
                {loadingDetail ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}
                  </div>
                ) : detail?.payments?.length > 0 ? (
                  <div className="card overflow-hidden">
                    <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {detail.payments.map((p: any, i: number) => (
                        <div key={p.id || i} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="text-[12px] text-slate-500 dark:text-slate-400">{formatDateTime(p.createdAt)}</p>
                            {p.paymentMethod && (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 capitalize mt-0.5">{p.paymentMethod.toLowerCase()}</p>
                            )}
                            {p.notes && <p className="text-[11px] text-slate-400 italic">{p.notes}</p>}
                          </div>
                          <span className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+{formatCurrency(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-slate-400 text-center py-6">Sin abonos registrados</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Credit Modal ─────────────────────────────────────────────────── */}
      {showNewCredit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Nuevo crédito manual</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => { setShowNewCredit(false); resetNew(); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleNew((d: any) => newCreditMutation.mutate(d))} className="p-6 space-y-4">
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Cliente *</label>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Buscar cliente..."
                    className={`${inputCls} pl-8`}
                  />
                </div>
                <select
                  {...regNew('customerId', { required: 'Selecciona un cliente' })}
                  className={inputCls}
                  size={4}
                >
                  {customerList.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {newErrors.customerId && <p className="text-[11px] text-red-500 mt-1">{newErrors.customerId.message as string}</p>}
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Monto total *</label>
                <Controller
                  control={controlNew}
                  name="totalAmount"
                  rules={{ required: 'El monto es obligatorio', min: { value: 0.01, message: 'Debe ser mayor a 0' } }}
                  render={({ field }) => (
                    <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder="0" />
                  )}
                />
                {newErrors.totalAmount && <p className="text-[11px] text-red-500 mt-1">{newErrors.totalAmount.message as string}</p>}
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Fecha de vencimiento</label>
                <input {...regNew('dueDate')} type="date" className={inputCls} />
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Notas</label>
                <input {...regNew('notes')} type="text" className={inputCls} placeholder="Descripción del crédito..." />
              </div>
              <button
                type="submit"
                disabled={newCreditMutation.isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl shadow-sm shadow-emerald-600/20 transition flex items-center justify-center gap-2 text-[13px]"
              >
                {newCreditMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                Crear crédito
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Payment Modal ────────────────────────────────────────────────────── */}
      {showPayment && selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Registrar abono</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => { setShowPayment(false); setSelected(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl px-4 py-3 text-center">
                <p className="text-[12px] text-red-500 dark:text-red-400 mb-1">
                  Saldo pendiente de <span className="font-semibold">{selected.customer?.name}</span>
                </p>
                <p className="text-[24px] font-bold text-red-700 dark:text-red-300 tabular-nums">{formatCurrency(selected.balance)}</p>
              </div>

              <form onSubmit={handleSubmit((d: any) => paymentMutation.mutate({ ...d, creditId: selected.id }))} className="space-y-3">
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Monto del abono *</label>
                  <Controller
                    control={control}
                    name="amount"
                    rules={{ required: 'El monto es obligatorio', min: { value: 0.01, message: 'El monto debe ser mayor a 0' }, max: { value: selected?.balance ?? Infinity, message: 'No puede superar el saldo pendiente' } }}
                    render={({ field }) => (
                      <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder="0" autoFocus />
                    )}
                  />
                  {payErrors.amount && <p className="text-[11px] text-red-500 mt-1">{payErrors.amount.message as string}</p>}
                </div>
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Método de pago</label>
                  <select {...register('paymentMethod')} className={inputCls}>
                    <option value="CASH">Efectivo</option>
                    <option value="NEQUI">Nequi</option>
                    <option value="DAVIPLATA">Daviplata</option>
                    <option value="TRANSFER">Transferencia</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Notas (opcional)</label>
                  <input {...register('notes')} type="text" className={inputCls} />
                </div>
                <button
                  type="submit"
                  disabled={paymentMutation.isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl shadow-sm shadow-emerald-600/20 transition flex items-center justify-center gap-2 text-[13px]"
                >
                  {paymentMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <DollarSign size={15} />}
                  Registrar pago
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}