'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, ShoppingBag, X, Loader2, Trash2, Edit, ChevronRight, FileDown, Search } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { downloadExcel } from '@/lib/exportExcel';

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
    queryFn: () => api.get('/products?limit=200&isActive=true').then((r) => r.data.data),
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
    mutationFn: (d: { name: string; phone?: string }) =>
      api.post('/suppliers', d).then((r) => r.data.data),
    onSuccess: (supplier) => {
      setValue('supplierId', supplier.id);
      setSelectedSupplierName(supplier.name);
      setSupplierSearch('');
      setShowCreateSupplier(false);
      setNewSupName('');
      setNewSupPhone('');
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => { setEditItem(null); reset({ supplierId: '', invoiceNumber: '', notes: '', purchaseDate: '', items: [{ productId: '', quantity: 1, unitCost: 0, taxRate: 0 }] }); setSelectedSupplierName(''); setSupplierSearch(''); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
        >
          <Plus size={16} /> Registrar compra
        </button>
      </div>

      {/* Exportar Excel */}
      <div className="flex items-center gap-2 flex-wrap bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3">
        <span className="text-xs font-medium text-gray-500 mr-1">Exportar Excel:</span>
        <input type="date" aria-label="Fecha inicio exportación" value={exportStart} onChange={(e) => setExportStart(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white" />
        <span className="text-xs text-gray-400">hasta</span>
        <input type="date" aria-label="Fecha fin exportación" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white" />
        <button type="button" onClick={() => downloadExcel('purchases', exportStart, exportEnd)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition">
          <FileDown size={14} /> Descargar
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50 dark:bg-gray-700/50">
                <th className="hidden sm:table-cell text-left px-4 py-3 font-medium">Factura proveedor</th>
                <th className="text-left px-4 py-3 font-medium">Proveedor</th>
                <th className="hidden md:table-cell text-center px-4 py-3 font-medium">Productos</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-medium">Fecha</th>
                <th className="w-24 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>
                ))
              ) : purchases.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400"><ShoppingBag size={40} className="mx-auto mb-3 opacity-30" /><p>No hay compras</p></td></tr>
              ) : purchases.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setSelected(p)}>
                  <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs text-blue-600">{p.invoiceNumber || '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{p.supplier?.name}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-center text-gray-600">{p._count?.details}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800 dark:text-white">{formatCurrency(p.total)}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-400 text-xs">{formatDate(p.purchaseDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => openEdit(p)} className="text-gray-400 hover:text-blue-600 transition" title="Editar" aria-label="Editar compra"><Edit size={15} /></button>
                      <button type="button" onClick={() => handleDelete(p)} className="text-gray-400 hover:text-red-600 transition" title="Eliminar" aria-label="Eliminar compra"><Trash2 size={15} /></button>
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>{pagination.total} compras</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40">Anterior</button>
              <span>{page} / {pagination.totalPages}</span>
              <button type="button" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal detalle */}
      {selected && detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">{detail.supplier?.name}</h2>
                <p className="text-xs text-gray-500">{detail.invoiceNumber ? `Factura: ${detail.invoiceNumber}` : 'Sin número de factura'} · {formatDate(detail.purchaseDate)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => openEdit(selected)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
                  <Edit size={12} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                >
                  <Trash2 size={12} /> Eliminar
                </button>
                <button type="button" aria-label="Cerrar" onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2">Producto</th>
                    <th className="text-center py-2">Cant.</th>
                    <th className="text-right py-2">Costo u.</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {detail.details?.map((d: any) => (
                    <tr key={d.id}>
                      <td className="py-2 text-gray-800 dark:text-white">{d.product?.name}</td>
                      <td className="py-2 text-center text-gray-600">{d.quantity}</td>
                      <td className="py-2 text-right text-gray-600">{formatCurrency(d.unitCost)}</td>
                      <td className="py-2 text-right font-semibold">{formatCurrency(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(detail.subtotal)}</span></div>
                {detail.taxAmount > 0 && <div className="flex justify-between text-gray-500"><span>IVA</span><span>{formatCurrency(detail.taxAmount)}</span></div>}
                <div className="flex justify-between font-bold text-lg text-gray-900 dark:text-white"><span>Total</span><span>{formatCurrency(detail.total)}</span></div>
              </div>
              {detail.notes && <p className="text-xs text-gray-400 border-t pt-3">{detail.notes}</p>}
            </div>
          </div>
        </div>
      )}

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

      {/* Modal formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-white">{editItem ? 'Editar compra' : 'Registrar compra'}</h2>
              <button type="button" aria-label="Cerrar" onClick={() => { setShowForm(false); setEditItem(null); setSelectedSupplierName(''); setSupplierSearch(''); }}><X size={20} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Proveedor *</label>
                  <input type="hidden" {...register('supplierId', { required: true })} />
                  <div className="relative">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder={selectedSupplierName || 'Buscar proveedor...'}
                        value={supplierSearch}
                        onChange={(e) => { setSupplierSearch(e.target.value); setShowSupplierDD(true); }}
                        onFocus={() => setShowSupplierDD(true)}
                        onBlur={() => setTimeout(() => setShowSupplierDD(false), 150)}
                        className="w-full pl-7 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    {selectedSupplierName && !supplierSearch && (
                      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400 font-medium truncate">{selectedSupplierName}</p>
                    )}
                    {showSupplierDD && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-20 max-h-44 overflow-y-auto">
                        {(suppliers?.filter((s: any) =>
                          !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase())
                        ) ?? []).map((s: any) => (
                          <button key={s.id} type="button"
                            onMouseDown={() => { setValue('supplierId', s.id); setSelectedSupplierName(s.name); setSupplierSearch(''); setShowSupplierDD(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white">
                            {s.name}
                          </button>
                        ))}
                        {suppliers?.length === 0 && (
                          <p className="px-3 py-2 text-xs text-gray-400">Sin proveedores</p>
                        )}
                        <button type="button"
                          onMouseDown={(e) => { e.preventDefault(); setShowSupplierDD(false); setShowCreateSupplier(true); }}
                          className="w-full flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700">
                          <Plus size={13} /> Crear proveedor nuevo
                        </button>
                      </div>
                    )}
                  </div>
                  {errors.supplierId && <p className="mt-1 text-xs text-red-500">Selecciona un proveedor</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">N° Factura proveedor</label>
                  <input {...register('invoiceNumber')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Opcional" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha de compra</label>
                  <input {...register('purchaseDate')} type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Notas</label>
                  <input {...register('notes')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Opcional" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">PRODUCTOS</label>
                  <button type="button" onClick={() => append({ productId: '', quantity: 1, unitCost: 0, taxRate: 0 })}
                    className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                    <Plus size={12} /> Agregar línea
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs text-gray-400 px-1">
                    <div className="col-span-5">Producto</div>
                    <div className="col-span-2 text-center">Cantidad</div>
                    <div className="col-span-3 text-right">Costo unit.</div>
                    <div className="col-span-1 text-center">%IVA</div>
                    <div className="col-span-1" />
                  </div>
                  {fields.map((field, i) => (
                    <div key={field.id} className="grid grid-cols-6 sm:grid-cols-12 gap-2 items-center">
                      {/* Producto — fila completa en móvil */}
                      <div className="col-span-5 sm:col-span-5">
                        <select {...register(`items.${i}.productId`, { required: true })} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                          <option value="">Producto...</option>
                          {products?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      {/* Eliminar — junto al producto en móvil */}
                      <div className="col-span-1 sm:hidden flex justify-center">
                        {fields.length > 1 && (
                          <button type="button" aria-label="Eliminar línea" onClick={() => remove(i)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                        )}
                      </div>
                      {/* Cant. / Costo / %IVA — segunda fila en móvil */}
                      <div className="col-span-2 sm:col-span-2">
                        <input {...register(`items.${i}.quantity`, { required: true, valueAsNumber: true, min: 0.001 })} type="number" step="any" min="0.001" placeholder="Cant." className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <input {...register(`items.${i}.unitCost`, { required: true, valueAsNumber: true })} type="number" step="0.01" min="0" placeholder="$ costo" className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <input {...register(`items.${i}.taxRate`, { valueAsNumber: true })} type="number" step="1" min="0" placeholder="0" className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                      </div>
                      {/* Eliminar — última columna en desktop */}
                      <div className="hidden sm:flex sm:col-span-1 justify-center">
                        {fields.length > 1 && (
                          <button type="button" aria-label="Eliminar línea" onClick={() => remove(i)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {total > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-2 flex justify-between items-center text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Total estimado</span>
                  <span className="font-bold text-blue-700 dark:text-blue-400">{formatCurrency(total)}</span>
                </div>
              )}

              {editItem && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-xs text-yellow-700">
                  Al actualizar, el stock anterior se revertirá y se aplicará el nuevo.
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={() => { setShowForm(false); setEditItem(null); setSelectedSupplierName(''); setSupplierSearch(''); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editItem ? 'Actualizar compra' : 'Registrar compra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline supplier creation modal */}
      {showCreateSupplier && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
          onClick={() => { setShowCreateSupplier(false); setNewSupName(''); setNewSupPhone(''); }}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 dark:text-white">Crear proveedor</h3>
            <input
              type="text"
              placeholder="Nombre *"
              value={newSupName}
              onChange={(e) => setNewSupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newSupName.trim() && createSupplierMutation.mutate({ name: newSupName.trim(), phone: newSupPhone.trim() || undefined })}
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <input
              type="text"
              placeholder="Teléfono (opcional)"
              value={newSupPhone}
              onChange={(e) => setNewSupPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newSupName.trim() && createSupplierMutation.mutate({ name: newSupName.trim(), phone: newSupPhone.trim() || undefined })}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <div className="flex gap-2 pt-1">
              <button type="button"
                onClick={() => { setShowCreateSupplier(false); setNewSupName(''); setNewSupPhone(''); }}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancelar
              </button>
              <button type="button"
                onClick={() => newSupName.trim() && createSupplierMutation.mutate({ name: newSupName.trim(), phone: newSupPhone.trim() || undefined })}
                disabled={!newSupName.trim() || createSupplierMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {createSupplierMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
