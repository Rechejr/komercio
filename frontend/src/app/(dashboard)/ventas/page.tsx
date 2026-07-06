'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime, statusColor, statusLabel, paymentMethodLabel } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Search, X, ShoppingCart, Ban, ChevronRight, FileDown, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import Link from 'next/link';
import { downloadExcel } from '@/lib/exportExcel';

const inputCls = 'px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

export default function VentasPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [selected, setSelected] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    const s = searchParams.get('status');
    if (s) setStatus(s);
  }, [searchParams]);

  const [exportStart, setExportStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [exportEnd, setExportEnd] = useState(() => new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales', page, search, status],
    queryFn: () => api.get(`/sales?page=${page}&limit=20&search=${encodeURIComponent(search)}&status=${status}`).then((r) => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ['sale', selected?.id],
    queryFn: () => api.get(`/sales/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected?.id,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/sales/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      toast.success('Venta anulada');
      setSelected(null);
      setShowCancelModal(false);
      setCancelReason('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al anular'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      toast.success('Venta eliminada permanentemente');
      setSelected(null);
      setShowDeleteModal(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  function openCancel() {
    setCancelReason('');
    setShowCancelModal(true);
  }

  function confirmCancel() {
    if (!detail) return;
    cancelMutation.mutate({ id: detail.id, reason: cancelReason || 'Sin motivo' });
  }

  const sales = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4 animate-fade-up">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por factura o cliente..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
          />
        </div>
        <select
          aria-label="Filtrar por estado"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm dark:bg-slate-800 dark:text-white dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
        >
          <option value="">Todos los estados</option>
          <option value="COMPLETED">Completadas</option>
          <option value="CANCELLED">Anuladas</option>
          <option value="REFUNDED">Devueltas</option>
        </select>
        <Link
          href="/pos"
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition"
        >
          <ShoppingCart size={15} /> Nueva venta
        </Link>
      </div>

      {/* ── Exportar Excel ────────────────────────────────────────────────────── */}
      <div className="card flex items-center gap-3 flex-wrap px-4 py-3">
        <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">Exportar Excel:</span>
        <input
          type="date"
          aria-label="Fecha inicio exportación"
          value={exportStart}
          onChange={(e) => setExportStart(e.target.value)}
          className={inputCls}
        />
        <span className="text-[12px] text-slate-400">hasta</span>
        <input
          type="date"
          aria-label="Fecha fin exportación"
          value={exportEnd}
          onChange={(e) => setExportEnd(e.target.value)}
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => downloadExcel('sales', exportStart, exportEnd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[12px] font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition"
        >
          <FileDown size={13} /> Descargar
        </button>
      </div>

      {/* ── Sales table ───────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Factura</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Cliente</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Vendedor</th>
                <th className="hidden sm:table-cell text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Items</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Pago</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Estado</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Fecha</th>
                <th className="w-8 sr-only">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <ShoppingCart size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">No hay ventas</p>
                    </div>
                  </td>
                </tr>
              ) : sales.map((s: any) => (
                <tr
                  key={s.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => setSelected(s)}
                >
                  <td className="px-4 py-3 font-mono text-[12px] text-blue-600 dark:text-blue-400 font-medium">{s.invoiceNumber}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-700 dark:text-slate-300">{s.customer?.name || <span className="text-slate-400">Mostrador</span>}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">{s.user?.name}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">{s._count?.details}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-semibold text-slate-900 dark:text-white tabular-nums">{formatCurrency(s.total)}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-[12px] text-slate-500 dark:text-slate-400">{paymentMethodLabel[s.paymentMethod] || s.paymentMethod}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`badge ${statusColor(s.status)}`}>{statusLabel(s.status)}</span>
                      {s.credit && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          s.credit.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                        }`}>
                          {s.credit.status === 'PAID' ? 'Fiado pagado' : 'Fiado'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-[12px] text-slate-400 dark:text-slate-500 tabular-nums">{formatDateTime(s.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-300 dark:text-slate-600"><ChevronRight size={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[13px] text-slate-500">
            <span>{pagination.total} ventas</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-[12px]"
              >
                Anterior
              </button>
              <span className="px-3 py-1.5 text-slate-400">{page} / {pagination.totalPages}</span>
              <button
                type="button"
                disabled={page === pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-[12px]"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {selected && detail && !showCancelModal && !showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0 bg-white dark:bg-slate-900">
              <div>
                <h2 className="text-[16px] font-bold text-slate-800 dark:text-white font-mono">{detail.invoiceNumber}</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">{formatDateTime(detail.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                {detail.status === 'COMPLETED' && (
                  <button
                    type="button"
                    onClick={openCancel}
                    className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-red-600 border border-red-200 dark:border-red-500/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                  >
                    <Ban size={12} /> Anular
                  </button>
                )}
                {detail.status === 'CANCELLED' && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition"
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => setSelected(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto min-h-0">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Cliente</p>
                  <p className="text-[13px] font-medium text-slate-800 dark:text-white">{detail.customer?.name || 'Mostrador'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Estado</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`badge ${statusColor(detail.status)}`}>{statusLabel(detail.status)}</span>
                    {detail.credit && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        detail.credit.status === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                      }`}>
                        {detail.credit.status === 'PAID' ? 'Fiado pagado' : `Fiado: ${formatCurrency(detail.credit.balance)}`}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Vendedor</p>
                  <p className="text-[13px] font-medium text-slate-800 dark:text-white">{detail.user?.name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Método de pago</p>
                  {detail.paymentMethod === 'MIXED' && detail.paymentDetails?.splits?.length > 0 ? (
                    <div className="space-y-0.5">
                      <p className="text-[13px] font-medium text-slate-800 dark:text-white">Mixto</p>
                      {detail.paymentDetails.splits.map((s: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-[12px] pl-2">
                          <span className="text-slate-500">{paymentMethodLabel[s.method] || s.method}</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">{formatCurrency(s.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] font-medium text-slate-800 dark:text-white">{paymentMethodLabel[detail.paymentMethod]}</p>
                  )}
                </div>
              </div>

              {/* Items table */}
              <div className="border-t border-slate-100 dark:border-white/[0.06] pt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                      <th className="text-left pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Producto</th>
                      <th className="text-center pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Cant.</th>
                      <th className="text-right pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Precio</th>
                      <th className="text-right pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {detail.details?.map((d: any) => (
                      <tr key={d.id}>
                        <td className="py-2.5 text-[13px] text-slate-700 dark:text-slate-300">{d.product?.name}</td>
                        <td className="py-2.5 text-center text-[13px] text-slate-500 tabular-nums">{d.quantity}</td>
                        <td className="py-2.5 text-right text-[13px] text-slate-500 tabular-nums">{formatCurrency(d.unitPrice)}</td>
                        <td className="py-2.5 text-right text-[13px] font-semibold text-slate-800 dark:text-white tabular-nums">{formatCurrency(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="border-t border-slate-100 dark:border-white/[0.06] pt-4 space-y-1.5">
                <div className="flex justify-between text-[13px] text-slate-500 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(detail.subtotal)}</span>
                </div>
                {detail.taxAmount > 0 && (
                  <div className="flex justify-between text-[13px] text-slate-500 dark:text-slate-400">
                    <span>IVA</span>
                    <span className="tabular-nums">{formatCurrency(detail.taxAmount)}</span>
                  </div>
                )}
                {detail.discountAmount > 0 && (
                  <div className="flex justify-between text-[13px] text-emerald-600 dark:text-emerald-400">
                    <span>Descuento</span>
                    <span className="tabular-nums">-{formatCurrency(detail.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[16px] font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-100 dark:border-white/[0.06]">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(detail.total)}</span>
                </div>
                {detail.changeAmount > 0 && (
                  <div className="flex justify-between text-[13px] text-emerald-600 dark:text-emerald-400">
                    <span>Cambio</span>
                    <span className="tabular-nums">{formatCurrency(detail.changeAmount)}</span>
                  </div>
                )}
              </div>

              {detail.notes && (
                <p className="text-[12px] text-slate-400 border-t border-slate-100 dark:border-white/[0.06] pt-3 italic">
                  Nota: {detail.notes}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Modal ─────────────────────────────────────────────────────── */}
      {showCancelModal && detail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-md animate-scale-in">
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-white">Anular venta</h3>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                    ¿Anular la factura{' '}
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{detail.invoiceNumber}</span>{' '}
                    por {formatCurrency(detail.total)}? El stock se devolverá automáticamente.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                  Motivo de anulación (opcional)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ej: Pedido duplicado, error en el cobro..."
                  rows={2}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-5">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-[13px] font-semibold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm shadow-red-600/25 transition"
              >
                {cancelMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Sí, anular venta
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteModal && !!detail}
        onOpenChange={(open) => { if (!open) setShowDeleteModal(false); }}
        title="Eliminar permanentemente"
        description={detail ? `La factura ${detail.invoiceNumber} por ${formatCurrency(detail.total)} será eliminada para siempre. Esta acción no se puede deshacer.` : undefined}
        confirmLabel="Eliminar definitivamente"
        onConfirm={() => detail && deleteMutation.mutate(detail.id)}
        loading={deleteMutation.isPending}
        variant="danger"
      />
    </div>
  );
}