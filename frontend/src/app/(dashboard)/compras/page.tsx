'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, ShoppingBag, X, Loader2, Trash2, Edit, ChevronRight, FileDown, Search } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { downloadExcel } from '@/lib/exportExcel';
import { PriceInput } from '@/components/ui/PriceInput';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';
const inputSmCls = 'w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

export default function ComprasPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDD, setShowSupplierDD] = useState(false);
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupLegal, setNewSupLegal] = useState('');
  const [newSupDoc, setNewSupDoc] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', page],
    queryFn: () => api.get(`/purchases?page=${page}&limit=20`).then((r) => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ['purchase', selected?.id],
    queryFn: () => api.get(`/purchases/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected?.id,
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=100').then((r) => r.data.data),
  });

  const { data: products } = useQuery({
    queryKey: ['products-list'],
    queryFn: () => api.get('/products?limit=500&isActive=true').then((r) => r.data.data),
  });

  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { supplierId: '', invoiceNumber: '', notes: '', purchaseDate: '', items: [{ productId: '', quantity: 1, unitCost: 0, taxRate: 0 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const watchItems = watch('items');
  const total = watchItems?.reduce((acc: number, item: any) => {
    const sub = (parseFloat(item.unitCost) || 0) * (parseFloat(item.quantity) || 0);
    return acc + sub + sub * ((parseFloat(item.taxRate) || 0) / 100);
  }, 0);

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem
      ? api.put(`/purchases/${editItem.id}`, data)
      : api.post('/purchases', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-list'] });
      toast.success(editItem ? 'Compra actualizada' : 'Compra registrada y stock actualizado');
      setShowForm(false);
      setEditItem(null);
      reset();
      setSelectedSupplierName('');
      setSupplierSearch('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/purchases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setSelected(null);
      setDeleteTarget(null);
      toast.success('Compra eliminada y stock revertido');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  const createSupplierMutation = useMutation({
    mutationFn: (d: { name: string; legalName?: string; document?: string; phone?: string }) =>
      api.post('/suppliers', d).then((r) => r.data.data),
    onSuccess: (supplier) => {
      setValue('supplierId', supplier.id);
      setSelectedSupplierName(supplier.name);
      setSupplierSearch('');
      setShowCreateSupplier(false);
      setNewSupName(''); setNewSupPhone(''); setNewSupLegal(''); setNewSupDoc('');
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      toast.success('Proveedor creado');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al crear proveedor'),
  });

  function openEdit(purchase: any) {
    setSelected(null);
    api.get(`/purchases/${purchase.id}`).then((r) => {
      const p = r.data.data;
      setEditItem(p);
      setSelectedSupplierName(p.supplier?.name || '');
      setSupplierSearch('');
      reset({
        supplierId: p.supplierId,
        invoiceNumber: p.invoiceNumber || '',
        notes: p.notes || '',
        purchaseDate: p.purchaseDate ? p.purchaseDate.split('T')[0] : '',
        items: p.details.map((d: any) => ({
          productId: d.productId,
          quantity: d.quantity,
          unitCost: d.unitCost,
          taxRate: d.taxRate,
        })),
      });
      setShowForm(true);
    }).catch((err: any) => toast.error(err.response?.data?.error || 'No se pudo cargar la compra'));
  }

  function handleDelete(purchase: any) {
    setDeleteTarget(purchase);
    setSelected(null);
  }

  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [exportStart, setExportStart] = useState(firstOfMonth);
  const [exportEnd, setExportEnd] = useState(today);

  const purchases = data?.data || [];
  const pagination = data?.pagination;

  return (
    <>
    <div className="space-y-4 animate-fade-up">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setEditItem(null);
            reset({ supplierId: '', invoiceNumber: '', notes: '', purchaseDate: '', items: [{ productId: '', quantity: 1, unitCost: 0, taxRate: 0 }] });
            setSelectedSupplierName('');
            setSupplierSearch('');
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition"
        >
          <Plus size={15} /> Registrar compra
        </button>
      </div>

      {/* ── Exportar Excel ────────────────────────────────────────────────────── */}
      <div className="card flex items-center gap-3 flex-wrap px-4 py-3">
        <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">Exportar Excel:</span>
        <input
          type="date"
          aria-label="Fecha inicio exportación"
          value={exportStart}
          onChange={(e) => setExportStart(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
        />
        <span className="text-[12px] text-slate-400">hasta</span>
        <input
          type="date"
          aria-label="Fecha fin exportación"
          value={exportEnd}
          onChange={(e) => setExportEnd(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
        />
        <button
          type="button"
          onClick={() => downloadExcel('purchases', exportStart, exportEnd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[12px] font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition"
        >
          <FileDown size={13} /> Descargar
        </button>
      </div>

      {/* ── Purchases table ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Factura proveedor</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Proveedor</th>
                <th className="hidden md:table-cell text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Productos</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Fecha</th>
                <th className="w-24 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <ShoppingBag size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">No hay compras registradas</p>
                    </div>
                  </td>
                </tr>
              ) : purchases.map((p: any) => (
                <tr
                  key={p.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => setSelected(p)}
                >
                  <td className="hidden sm:table-cell px-4 py-3 font-mono text-[12px] text-blue-600 dark:text-blue-400">{p.invoiceNumber || '—'}</td>
                  <td className="px-4 py-3 text-[13px] font-medium text-slate-800 dark:text-white">{p.supplier?.name}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">{p._count?.details}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-semibold text-slate-900 dark:text-white tabular-nums">{formatCurrency(p.total)}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-[12px] text-slate-400 dark:text-slate-500">{formatDate(p.purchaseDate)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        aria-label="Editar compra"
                        onClick={() => openEdit(p)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar compra"
                        onClick={() => handleDelete(p)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                      >
                        <Trash2 size={14} />
                      </button>
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
            <span>{pagination.total} compras</span>
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
    </div>

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {selected && detail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
              <div>
                <h2 className="text-[16px] font-bold text-slate-800 dark:text-white">{detail.supplier?.name}</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">
                  {detail.invoiceNumber ? `Factura: ${detail.invoiceNumber}` : 'Sin número de factura'} · {formatDate(detail.purchaseDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(selected)}
                  className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
                >
                  <Edit size={12} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                >
                  <Trash2 size={12} /> Eliminar
                </button>
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

            <div className="p-6 space-y-4 overflow-y-auto min-h-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                    <th className="text-left pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Producto</th>
                    <th className="text-center pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Cant.</th>
                    <th className="text-right pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Costo u.</th>
                    <th className="text-right pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                  {detail.details?.map((d: any) => (
                    <tr key={d.id}>
                      <td className="py-2.5 text-[13px] text-slate-800 dark:text-white">{d.product?.name}</td>
                      <td className="py-2.5 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">{d.quantity}</td>
                      <td className="py-2.5 text-right text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">{formatCurrency(d.unitCost)}</td>
                      <td className="py-2.5 text-right text-[13px] font-semibold text-slate-800 dark:text-white tabular-nums">{formatCurrency(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-slate-100 dark:border-white/[0.06] pt-4 space-y-1.5 text-sm">
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
                <div className="flex justify-between text-[16px] font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-100 dark:border-white/[0.06]">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(detail.total)}</span>
                </div>
              </div>

              {detail.notes && (
                <p className="text-[12px] text-slate-400 border-t border-slate-100 dark:border-white/[0.06] pt-3 italic">{detail.notes}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Eliminar compra"
        description={deleteTarget ? `¿Eliminar la compra de "${deleteTarget.supplier?.name}"? El stock se revertirá automáticamente.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        variant="danger"
      />

      {/* ── Form Modal ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0 bg-white dark:bg-slate-900">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">
                {editItem ? 'Editar compra' : 'Registrar compra'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => { setShowForm(false); setEditItem(null); setSelectedSupplierName(''); setSupplierSearch(''); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="p-6 space-y-5 overflow-y-auto min-h-0">
              <div className="grid grid-cols-2 gap-4">
                {/* Proveedor */}
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Proveedor *</label>
                  <input type="hidden" {...register('supplierId', { required: true })} />
                  <div className="relative">
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder={selectedSupplierName || 'Buscar proveedor...'}
                        value={supplierSearch}
                        onChange={(e) => { setSupplierSearch(e.target.value); setShowSupplierDD(true); }}
                        onFocus={() => setShowSupplierDD(true)}
                        onBlur={() => setTimeout(() => setShowSupplierDD(false), 150)}
                        className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
                      />
                    </div>
                    {selectedSupplierName && !supplierSearch && (
                      <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium truncate pl-1">{selectedSupplierName}</p>
                    )}
                    {showSupplierDD && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-modal z-20 max-h-44 overflow-y-auto">
                        {(suppliers?.filter((s: any) =>
                          !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase())
                        ) ?? []).map((s: any) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={() => { setValue('supplierId', s.id); setSelectedSupplierName(s.name); setSupplierSearch(''); setShowSupplierDD(false); }}
                            className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition"
                          >
                            {s.name}
                          </button>
                        ))}
                        {suppliers?.length === 0 && (
                          <p className="px-3 py-2.5 text-[12px] text-slate-400">Sin proveedores</p>
                        )}
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setShowSupplierDD(false); setShowCreateSupplier(true); }}
                          className="w-full flex items-center gap-1.5 px-3 py-2.5 text-[13px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 border-t border-slate-100 dark:border-white/[0.06] transition"
                        >
                          <Plus size={13} /> Crear proveedor nuevo
                        </button>
                      </div>
                    )}
                  </div>
                  {errors.supplierId && <p className="mt-1 text-[11px] text-red-500">Selecciona un proveedor</p>}
                </div>

                {/* N° Factura */}
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">N° Factura proveedor</label>
                  <input {...register('invoiceNumber')} className={inputCls} placeholder="Opcional" />
                </div>

                {/* Fecha */}
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Fecha de compra</label>
                  <input {...register('purchaseDate')} type="date" className={inputCls} />
                </div>

                {/* Notas */}
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Notas</label>
                  <input {...register('notes')} className={inputCls} placeholder="Opcional" />
                </div>
              </div>

              {/* ── Líneas de producto ────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Productos</p>
                  <button
                    type="button"
                    onClick={() => append({ productId: '', quantity: 1, unitCost: 0, taxRate: 0 })}
                    className="flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Plus size={12} /> Agregar línea
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1">
                    <div className="col-span-5">Producto</div>
                    <div className="col-span-2 text-center">Cantidad</div>
                    <div className="col-span-3 text-right">Costo unit.</div>
                    <div className="col-span-1 text-center">%IVA</div>
                    <div className="col-span-1" />
                  </div>

                  {fields.map((field: any, i: number) => (
                    <div key={field.id} className="grid grid-cols-6 sm:grid-cols-12 gap-2 items-center">
                      <div className="col-span-5 sm:col-span-5">
                        <select
                          {...register(`items.${i}.productId`, { required: true })}
                          className={inputSmCls}
                        >
                          <option value="">Producto...</option>
                          {products?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-1 sm:hidden flex justify-center">
                        {fields.length > 1 && (
                          <button
                            type="button"
                            aria-label="Eliminar línea"
                            onClick={() => remove(i)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <div className="col-span-2 sm:col-span-2">
                        <input
                          {...register(`items.${i}.quantity`, { required: true, valueAsNumber: true, min: 0.001 })}
                          type="number"
                          step="any"
                          min="0.001"
                          placeholder="Cant."
                          className={inputSmCls}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <Controller
                          control={control}
                          name={`items.${i}.unitCost`}
                          render={({ field }) => (
                            <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputSmCls} placeholder="$ costo" />
                          )}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <input
                          {...register(`items.${i}.taxRate`, { valueAsNumber: true })}
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0"
                          className={inputSmCls}
                        />
                      </div>
                      <div className="hidden sm:flex sm:col-span-1 justify-center">
                        {fields.length > 1 && (
                          <button
                            type="button"
                            aria-label="Eliminar línea"
                            onClick={() => remove(i)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total preview */}
              {total > 0 && (
                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl px-4 py-3 flex justify-between items-center">
                  <span className="text-[13px] text-slate-600 dark:text-slate-400">Total estimado</span>
                  <span className="text-[15px] font-bold text-blue-700 dark:text-blue-400 tabular-nums">{formatCurrency(total)}</span>
                </div>
              )}

              {editItem && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl px-4 py-2.5 text-[12px] text-amber-700 dark:text-amber-400">
                  Al actualizar, el stock anterior se revertirá y se aplicará el nuevo.
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-white/[0.06] pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditItem(null); setSelectedSupplierName(''); setSupplierSearch(''); }}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-sm shadow-blue-600/25 flex items-center gap-2 transition"
                >
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editItem ? 'Actualizar compra' : 'Registrar compra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create Supplier Modal (z-[60] sobre el form modal) ───────────────── */}
      {showCreateSupplier && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4"
          onClick={() => { setShowCreateSupplier(false); setNewSupName(''); setNewSupPhone(''); setNewSupLegal(''); setNewSupDoc(''); }}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm p-6 space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-white">Crear proveedor</h3>

            <input
              type="text"
              placeholder="Nombre comercial *"
              value={newSupName}
              onChange={(e) => setNewSupName(e.target.value)}
              autoFocus
              className={inputCls}
            />
            <input
              type="text"
              placeholder="Razón social (opcional)"
              value={newSupLegal}
              onChange={(e) => setNewSupLegal(e.target.value)}
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="NIT / Documento"
                value={newSupDoc}
                onChange={(e) => setNewSupDoc(e.target.value)}
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
              />
              <input
                type="tel"
                placeholder="Celular / Teléfono"
                value={newSupPhone}
                onChange={(e) => setNewSupPhone(e.target.value)}
                maxLength={10}
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setShowCreateSupplier(false); setNewSupName(''); setNewSupPhone(''); setNewSupLegal(''); setNewSupDoc(''); }}
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => newSupName.trim() && createSupplierMutation.mutate({
                  name: newSupName.trim(),
                  legalName: newSupLegal.trim() || undefined,
                  document: newSupDoc.trim() || undefined,
                  phone: newSupPhone.trim() || undefined,
                })}
                disabled={!newSupName.trim() || createSupplierMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-50 shadow-sm shadow-blue-600/25 transition"
              >
                {createSupplierMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}