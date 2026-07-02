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

  // Sync URL param on navigation (e.g. dashboard "Ver anuladas")
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
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por factura o cliente..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          aria-label="Filtrar por estado"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          <option value="COMPLETED">Completadas</option>
          <option value="CANCELLED">Anuladas</option>
          <option value="REFUNDED">Devueltas</option>
        </select>
        <Link
          href="/pos"
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
        >
          <ShoppingCart size={16} /> Nueva venta
        </Link>
      </div>

      {/* Exportar Excel */}
      <div className="flex items-center gap-2 flex-wrap bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3">
        <span className="text-xs font-medium text-gray-500 mr-1">Exportar Excel:</span>
        <input type="date" aria-label="Fecha inicio exportación" value={exportStart} onChange={(e) => setExportStart(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white" />
        <span className="text-xs text-gray-400">hasta</span>
        <input type="date" aria-label="Fecha fin exportación" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white" />
        <button type="button" onClick={() => downloadExcel('sales', exportStart, exportEnd)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition">
          <FileDown size={14} /> Descargar
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-3 font-medium">Factura</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="hidden md:table-cell text-left px-4 py-3 font-medium">Vendedor</th>
                <th className="hidden sm:table-cell text-center px-4 py-3 font-medium">Items</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="hidden md:table-cell text-left px-4 py-3 font-medium">Pago</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-medium">Fecha</th>
                <th className="w-8 sr-only">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>{[...Array(9)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td>)}</tr>
                ))
              ) : sales.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400"><ShoppingCart size={40} className="mx-auto mb-3 opacity-30" /><p>No hay ventas</p></td></tr>
              ) : sales.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition cursor-pointer" onClick={() => setSelected(s)}>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600 font-medium">{s.invoiceNumber}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.customer?.name || 'Mostrador'}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500">{s.user?.name}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-center">{s._count?.details}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800 dark:text-white">{formatCurrency(s.total)}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500 text-xs">{paymentMethodLabel[s.paymentMethod] || s.paymentMethod}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(s.status)}`}>{statusLabel(s.status)}</span>
                      {s.credit && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.credit.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {s.credit.status === 'PAID' ? 'Fiado pagado' : 'Fiado'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-400 text-xs">{formatDateTime(s.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-400"><ChevronRight size={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500">
            <span>{pagination.total} ventas</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
              <span className="px-3 py-1">{page} / {pagination.totalPages}</span>
              <button type="button" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && detail && !showCancelModal && !showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">{detail.invoiceNumber}</h2>
                <p className="text-xs text-gray-500">{formatDateTime(detail.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                {detail.status === 'COMPLETED' && (
                  <button type="button" onClick={openCancel}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">
                    <Ban size={12} /> Anular
                  </button>
                )}
                {detail.status === 'CANCELLED' && (
                  <button type="button" onClick={() => setShowDeleteModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-700 border border-red-300 bg-red-50 rounded-lg hover:bg-red-100 transition">
                    <Trash2 size={12} /> Eliminar
                  </button>
                )}
                <button type="button" aria-label="Cerrar" onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-gray-400 text-xs">Cliente</p><p className="font-medium">{detail.customer?.name || 'Mostrador'}</p></div>
                <div>
                  <p className="text-gray-400 text-xs">Estado</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(detail.status)}`}>{statusLabel(detail.status)}</span>
                    {detail.credit && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${detail.credit.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {detail.credit.status === 'PAID' ? 'Fiado pagado' : `Fiado: ${formatCurrency(detail.credit.balance)}`}
                      </span>
                    )}
                  </div>
                </div>
                <div><p className="text-gray-400 text-xs">Vendedor</p><p className="font-medium">{detail.user?.name}</p></div>
                <div>
                  <p className="text-gray-400 text-xs">Método de pago</p>
                  {detail.paymentMethod === 'MIXED' && detail.paymentDetails?.splits?.length > 0 ? (
                    <div className="mt-0.5 space-y-0.5">
                      <p className="font-medium text-sm">Mixto</p>
                      {detail.paymentDetails.splits.map((s: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-xs pl-2">
                          <span className="text-gray-500">{paymentMethodLabel[s.method] || s.method}</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(s.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-medium">{paymentMethodLabel[detail.paymentMethod]}</p>
                  )}
                </div>
              </div>

              <table className="w-full text-sm border-t border-gray-100 dark:border-gray-700 pt-4">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2">Producto</th>
                    <th className="text-center py-2">Cant.</th>
                    <th className="text-right py-2">Precio</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {detail.details?.map((d: any) => (
                    <tr key={d.id}>
                      <td className="py-2">{d.product?.name}</td>
                      <td className="py-2 text-center">{d.quantity}</td>
                      <td className="py-2 text-right">{formatCurrency(d.unitPrice)}</td>
                      <td className="py-2 text-right font-semibold">{formatCurrency(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(detail.subtotal)}</span></div>
                {detail.taxAmount > 0 && <div className="flex justify-between text-gray-500"><span>IVA</span><span>{formatCurrency(detail.taxAmount)}</span></div>}
                {detail.discountAmount > 0 && <div className="flex justify-between text-green-600"><span>Descuento</span><span>-{formatCurrency(detail.discountAmount)}</span></div>}
                <div className="flex justify-between font-bold text-lg text-gray-900 dark:text-white"><span>Total</span><span>{formatCurrency(detail.total)}</span></div>
                {detail.changeAmount > 0 && <div className="flex justify-between text-green-600"><span>Cambio</span><span>{formatCurrency(detail.changeAmount)}</span></div>}
              </div>

              {detail.notes && (
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">Nota: {detail.notes}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && detail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={20} className="text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800 dark:text-white text-base">Anular venta</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    ¿Estás seguro de anular la factura <span className="font-mono font-semibold text-blue-600">{detail.invoiceNumber}</span> por {formatCurrency(detail.total)}? El stock se devolverá automáticamente.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                  Motivo de anulación (opcional)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ej: Pedido duplicado, error en el cobro..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 dark:bg-gray-700 dark:text-white resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button type="button" onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button type="button" onClick={confirmCancel} disabled={cancelMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2 transition">
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