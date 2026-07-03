'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, statusColor, statusLabel } from '@/lib/utils';
import toast from 'react-hot-toast';
import { CreditCard, X, Loader2, Plus, DollarSign, ChevronRight, Clock } from 'lucide-react';

export default function CreditosPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['credits', statusFilter, page],
    queryFn: () =>
      api.get(`/credits?status=${statusFilter}&page=${page}&limit=20`).then((r) => r.data),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['credit', selected?.id],
    queryFn: () => api.get(`/credits/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected?.id && showDetail,
  });

  const { register, handleSubmit, reset } = useForm();

  const paymentMutation = useMutation({
    mutationFn: ({ creditId, ...data }: any) => api.post(`/credits/${creditId}/payments`, data),
    onSuccess: (_res, { creditId }) => {
      qc.invalidateQueries({ queryKey: ['credits'] });
      qc.invalidateQueries({ queryKey: ['credit', creditId] });
      toast.success('Pago registrado');
      setShowPayment(false);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al registrar pago'),
  });

  const credits = data?.data || [];
  const pagination = data?.pagination;

  function openDetail(c: any) {
    setSelected(c);
    setShowDetail(true);
    setShowPayment(false);
  }

  function openPayment(c: any) {
    setSelected(c);
    setShowPayment(true);
    setShowDetail(false);
    reset();
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3">
        <select
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white dark:border-gray-600"
        >
          <option value="">Todos</option>
          <option value="PENDING">Pendientes</option>
          <option value="PARTIAL">Abonados</option>
          <option value="OVERDUE">Vencidos</option>
          <option value="PAID">Pagados</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Factura</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-right px-4 py-3 font-medium">Abonado</th>
                <th className="text-right px-4 py-3 font-medium">Saldo</th>
                <th className="text-left px-4 py-3 font-medium">Vencimiento</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="w-24 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(8)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>
                ))
              ) : credits.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">
                  <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No hay créditos</p>
                </td></tr>
              ) : credits.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition cursor-pointer" onClick={() => openDetail(c)}>
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{c.customer?.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600">{c.sale?.invoiceNumber || '-'}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(c.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{formatCurrency(c.paidAmount)}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(c.balance)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.dueDate ? formatDate(c.dueDate) : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(c.status)}`}>{statusLabel(c.status)}</span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {c.status !== 'PAID' && (
                        <button type="button"
                          onClick={() => openPayment(c)}
                          className="text-xs text-green-600 border border-green-200 rounded px-2 py-0.5 hover:bg-green-50 transition whitespace-nowrap"
                        >
                          <Plus size={12} className="inline mr-0.5" /> Abonar
                        </button>
                      )}
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500">
            <span>{pagination.total} créditos</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
              <span className="px-3 py-1">{page} / {pagination.totalPages}</span>
              <button type="button" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetail && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">{selected.customer?.name}</h2>
                <p className="text-xs text-gray-500">Factura: {selected.sale?.invoiceNumber || '-'}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status !== 'PAID' && (
                  <button type="button" onClick={() => { setShowDetail(false); setShowPayment(true); reset(); }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-green-600 border border-green-200 rounded-lg hover:bg-green-50 transition">
                    <Plus size={12} /> Abonar
                  </button>
                )}
                <button type="button" aria-label="Cerrar" onClick={() => { setShowDetail(false); setSelected(null); }} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Total fiado</p>
                  <p className="font-bold text-gray-800 dark:text-white">{formatCurrency(selected.totalAmount)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-green-600">Abonado</p>
                  <p className="font-bold text-green-700">{formatCurrency(selected.paidAmount)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-red-500">Saldo</p>
                  <p className="font-bold text-red-600">{formatCurrency(selected.balance)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(selected.status)}`}>{statusLabel(selected.status)}</span>
                {selected.dueDate && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock size={12} /> Vence: {formatDate(selected.dueDate)}
                  </span>
                )}
              </div>

              {/* Historial de pagos */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Historial de abonos</p>
                {loadingDetail ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
                  </div>
                ) : detail?.payments?.length > 0 ? (
                  <div className="space-y-2">
                    {detail.payments.map((p: any, i: number) => (
                      <div key={p.id || i} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2.5">
                        <div>
                          <p className="text-xs text-gray-400">{formatDateTime(p.createdAt)}</p>
                          {p.paymentMethod && (
                            <p className="text-xs text-gray-500 capitalize">{p.paymentMethod.toLowerCase()}</p>
                          )}
                          {p.notes && <p className="text-xs text-gray-400 italic">{p.notes}</p>}
                        </div>
                        <span className="font-semibold text-green-600">+{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">Sin abonos registrados</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-white">Registrar abono</h2>
              <button type="button" aria-label="Cerrar" onClick={() => { setShowPayment(false); setSelected(null); }}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Saldo pendiente de <span className="font-medium">{selected.customer?.name}</span></p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(selected.balance)}</p>
              </div>
              <form onSubmit={handleSubmit((d) => paymentMutation.mutate({ ...d, creditId: selected.id }))} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Monto del abono *</label>
                  <input {...register('amount', { required: true, min: 0.01 })} type="number" step="0.01" min="0.01"
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Método de pago</label>
                  <select {...register('paymentMethod')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="CASH">Efectivo</option>
                    <option value="NEQUI">Nequi</option>
                    <option value="DAVIPLATA">Daviplata</option>
                    <option value="TRANSFER">Transferencia</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Notas (opcional)</label>
                  <input {...register('notes')} type="text"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <button type="submit" disabled={paymentMutation.isPending}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2">
                  {paymentMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
                  Registrar pago
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}