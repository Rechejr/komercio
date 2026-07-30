'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, ArrowLeftRight, X, Loader2, Trash2, Edit, ChevronRight, Package } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';
const inputSmCls = 'w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[16px] sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

export default function TransferenciasPage() {
  const qc = useQueryClient();
  // El backend exige ADMIN/SUPERVISOR para crear, editar y anular
  // (stockTransfer.routes.ts) — esto solo evita mostrar botones que de todas
  // formas fallarían con un 403.
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === 'ADMIN' || role === 'SUPERVISOR';
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-transfers', page],
    queryFn: () => api.get(`/stock-transfers?page=${page}&limit=20`).then((r) => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ['stock-transfer', selected?.id],
    queryFn: () => api.get(`/stock-transfers/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected?.id,
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/business/branches').then((r) => r.data.data),
  });

  const { data: products } = useQuery({
    queryKey: ['products-list'],
    queryFn: () => api.get('/products?limit=500&isActive=true').then((r) => r.data.data),
  });

  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm({
    defaultValues: { fromBranchId: '', toBranchId: '', notes: '', items: [{ productId: '', quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const fromBranchId = watch('fromBranchId');
  const toBranchId = watch('toBranchId');

  function invalidateStock() {
    qc.invalidateQueries({ queryKey: ['stock-transfers'] });
    qc.invalidateQueries({ queryKey: ['stock-transfer'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['product-stock-by-branch'] });
  }

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem
      ? api.put(`/stock-transfers/${editItem.id}`, data)
      : api.post('/stock-transfers', data),
    onSuccess: () => {
      invalidateStock();
      toast.success(editItem ? 'Transferencia actualizada' : 'Transferencia registrada');
      setShowForm(false);
      setEditItem(null);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al guardar la transferencia'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/stock-transfers/${id}`),
    onSuccess: () => {
      invalidateStock();
      toast.success('Transferencia eliminada y stock revertido');
      setDeleteTarget(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar la transferencia'),
  });

  // Se relee el detalle completo (la fila de la tabla solo trae el conteo de
  // líneas, no los productos) antes de abrir el formulario en modo edición.
  function openEdit(transfer: any) {
    setSelected(null);
    api.get(`/stock-transfers/${transfer.id}`).then((r) => {
      const t = r.data.data;
      setEditItem(t);
      reset({
        fromBranchId: t.fromBranchId,
        toBranchId: t.toBranchId,
        notes: t.notes || '',
        items: t.items.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
      });
      setShowForm(true);
    }).catch((err: any) => toast.error(err.response?.data?.error || 'No se pudo cargar la transferencia'));
  }

  function handleDelete(transfer: any) {
    setDeleteTarget(transfer);
    setSelected(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditItem(null);
    reset();
  }

  // La lista del <select> solo trae productos activos: si uno se desactivó
  // después de la transferencia, al editarla su línea aparecería en blanco y
  // perdería el producto en silencio. Se agrega como opción extra.
  const productOptions: any[] = useMemo(() => {
    const base: any[] = products || [];
    if (!editItem?.items?.length) return base;
    const known = new Set(base.map((p: any) => p.id));
    const missing = editItem.items
      .filter((i: any) => !known.has(i.productId))
      .map((i: any) => ({ id: i.productId, name: i.product?.name || 'Producto no disponible' }));
    return missing.length ? [...base, ...missing] : base;
  }, [products, editItem]);

  const branchList: any[] = branches || [];
  const transfers = data?.data || [];
  const pagination = data?.pagination;
  const hasMultipleBranches = branchList.length > 1;

  return (
    <>
    <div className="space-y-4 animate-fade-up">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setEditItem(null);
            reset({ fromBranchId: '', toBranchId: '', notes: '', items: [{ productId: '', quantity: 1 }] });
            setShowForm(true);
          }}
          disabled={!hasMultipleBranches}
          title={!hasMultipleBranches ? 'Necesitas al menos 2 bodegas para transferir' : undefined}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-600/25 transition"
        >
          <Plus size={15} /> Nueva transferencia
        </button>
      </div>

      {!hasMultipleBranches && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl px-4 py-3 text-[13px] text-amber-700 dark:text-amber-400">
          Necesitas al menos 2 bodegas para mover mercancía entre ellas. Crea una bodega adicional en Configuración.
        </div>
      )}

      {/* ── Transfers table ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Origen</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Destino</th>
                <th className="hidden md:table-cell text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Productos</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Creado por</th>
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
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <ArrowLeftRight size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">No hay transferencias registradas</p>
                    </div>
                  </td>
                </tr>
              ) : transfers.map((t: any) => (
                <tr
                  key={t.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => setSelected(t)}
                >
                  <td className="px-4 py-3 text-[13px] font-medium text-slate-800 dark:text-white">{t.fromBranch?.name}</td>
                  <td className="px-4 py-3 text-[13px] font-medium text-slate-800 dark:text-white">{t.toBranch?.name}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">{t._count?.items}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">{t.createdBy?.name}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-[12px] text-slate-400 dark:text-slate-500">{formatDateTime(t.createdAt)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 justify-end">
                      {canManage && (
                        <>
                          <button
                            type="button"
                            aria-label="Editar transferencia"
                            title="Editar"
                            onClick={() => openEdit(t)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label="Eliminar transferencia"
                            title="Eliminar"
                            onClick={() => handleDelete(t)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        aria-label="Ver detalle"
                        onClick={() => setSelected(t)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[13px] text-slate-500">
            <span>{pagination.total} transferencias</span>
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
              <div>
                <h2 className="text-[16px] font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  {detail.fromBranch?.name} <ArrowLeftRight size={14} className="text-emerald-500" /> {detail.toBranch?.name}
                </h2>
                <p className="text-[12px] text-slate-400 mt-0.5">
                  Por {detail.createdBy?.name} · {formatDateTime(detail.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => openEdit(selected)}
                      className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
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
                  </>
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

            <div className="p-6 space-y-4 overflow-y-auto min-h-0 flex-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                    <th className="text-left pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Producto</th>
                    <th className="text-right pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                  {detail.items?.map((it: any) => (
                    <tr key={it.id}>
                      <td className="py-2.5 text-[13px] text-slate-800 dark:text-white flex items-center gap-2">
                        <Package size={13} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                        {it.product?.name}
                      </td>
                      <td className="py-2.5 text-right text-[13px] font-semibold text-slate-800 dark:text-white tabular-nums">{it.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

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
        title="Eliminar transferencia"
        description={deleteTarget
          ? `¿Eliminar la transferencia de ${deleteTarget.fromBranch?.name} a ${deleteTarget.toBranch?.name}? La mercancía volverá a la bodega de origen.`
          : undefined}
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
                {editItem ? 'Editar transferencia' : 'Nueva transferencia'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={closeForm}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="p-6 space-y-5 overflow-y-auto min-h-0 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Bodega de origen *</label>
                  <select {...register('fromBranchId', { required: true })} className={inputCls}>
                    <option value="">Selecciona...</option>
                    {branchList.map((b: any) => <option key={b.id} value={b.id} disabled={b.id === toBranchId}>{b.name}</option>)}
                  </select>
                  {errors.fromBranchId && <p className="mt-1 text-[11px] text-red-500">Selecciona la bodega de origen</p>}
                </div>
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Bodega de destino *</label>
                  <select {...register('toBranchId', { required: true })} className={inputCls}>
                    <option value="">Selecciona...</option>
                    {branchList.map((b: any) => <option key={b.id} value={b.id} disabled={b.id === fromBranchId}>{b.name}</option>)}
                  </select>
                  {errors.toBranchId && <p className="mt-1 text-[11px] text-red-500">Selecciona la bodega de destino</p>}
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Notas</label>
                <input {...register('notes')} className={inputCls} placeholder="Opcional" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Productos</p>
                  <button
                    type="button"
                    onClick={() => append({ productId: '', quantity: 1 })}
                    className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <Plus size={12} /> Agregar línea
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1">
                    <div className="col-span-8">Producto</div>
                    <div className="col-span-3 text-center">Cantidad</div>
                    <div className="col-span-1" />
                  </div>

                  {fields.map((field: any, i: number) => (
                    <div key={field.id} className="grid grid-cols-6 sm:grid-cols-12 gap-2 items-center">
                      <div className="col-span-5 sm:col-span-8">
                        <select {...register(`items.${i}.productId`, { required: true })} className={inputSmCls}>
                          <option value="">Producto...</option>
                          {productOptions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                      <div className="col-span-4 sm:col-span-3">
                        <input
                          {...register(`items.${i}.quantity`, { required: true, valueAsNumber: true, min: 0.001 })}
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0.001"
                          placeholder="Cant."
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

              <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-white/[0.06] pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/25 flex items-center gap-2 transition"
                >
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editItem ? 'Guardar cambios' : 'Registrar transferencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
