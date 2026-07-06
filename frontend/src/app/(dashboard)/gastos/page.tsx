'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, paymentMethodLabel } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, X, Loader2, Receipt, Edit, Trash2, FileDown, Tag } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PriceInput } from '@/components/ui/PriceInput';
import { downloadExcel } from '@/lib/exportExcel';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

const PAYMENT_BADGE: Record<string, string> = {
  CASH: 'badge-green',
  TRANSFER: 'badge-indigo',
  NEQUI: 'badge-blue',
  DAVIPLATA: 'badge-amber',
  CARD: 'badge-slate',
};

export default function GastosPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [exportStart, setExportStart] = useState(firstOfMonth);
  const [exportEnd, setExportEnd] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', page],
    queryFn: () => api.get(`/expenses?page=${page}&limit=20`).then((r) => r.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/expenses/categories').then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, control, formState: { isSubmitting, errors } } = useForm();

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem
      ? api.put(`/expenses/${editItem.id}`, data)
      : api.post('/expenses', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(editItem ? 'Gasto actualizado' : 'Gasto registrado');
      setShowForm(false);
      setEditItem(null);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setDeleteTarget(null);
      toast.success('Gasto eliminado');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  const categoryMutation = useMutation({
    mutationFn: (name: string) => api.post('/expenses/categories', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría creada');
      setShowCategoryModal(false);
      setNewCategoryName('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al crear categoría'),
  });

  function openEdit(expense: any) {
    setEditItem(expense);
    reset({
      description: expense.description,
      categoryId: expense.categoryId || '',
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      date: expense.date ? expense.date.split('T')[0] : today,
      notes: expense.notes || '',
      recipientName: expense.recipientName || '',
      recipientDocument: expense.recipientDocument || '',
      recipientPhone: expense.recipientPhone || '',
    });
    setShowForm(true);
  }

  function openNew() {
    setEditItem(null);
    reset({
      description: '',
      categoryId: '',
      amount: '',
      paymentMethod: 'CASH',
      date: today,
      notes: '',
      recipientName: '',
      recipientDocument: '',
      recipientPhone: '',
    });
    setShowForm(true);
  }

  const expenses = data?.data || [];
  const pagination = data?.pagination;

  return (
    <>
    <div className="space-y-4 animate-fade-up">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition"
        >
          <Plus size={15} /> Registrar gasto
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
          onClick={() => downloadExcel('expenses', exportStart, exportEnd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[12px] font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition"
        >
          <FileDown size={13} /> Descargar
        </button>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Descripción</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Categoría</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Método</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Monto</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Fecha</th>
                <th className="w-20 sr-only">Acciones</th>
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
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <Receipt size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">No hay gastos registrados</p>
                    </div>
                  </td>
                </tr>
              ) : expenses.map((e: any) => (
                <tr key={e.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-slate-800 dark:text-white">{e.description}</p>
                    {e.recipientName && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{e.recipientName}</p>
                    )}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {e.category?.name
                      ? <span className="badge badge-slate">{e.category.name}</span>
                      : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    <span className={`badge ${PAYMENT_BADGE[e.paymentMethod] || 'badge-slate'}`}>
                      {paymentMethodLabel[e.paymentMethod] || e.paymentMethod}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {formatCurrency(e.amount)}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                    {formatDate(e.date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
                        aria-label="Editar gasto"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(e)}
                        aria-label="Eliminar gasto"
                        disabled={deleteMutation.isPending}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40 transition"
                      >
                        <Trash2 size={14} />
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
            <span>{pagination.total} gastos</span>
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

      {/* ── Form Modal ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] flex flex-col animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0 bg-white dark:bg-slate-900">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">
                {editItem ? 'Editar gasto' : 'Registrar gasto'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => { setShowForm(false); setEditItem(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="p-6 space-y-4 overflow-y-auto min-h-0">

              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Descripción *</label>
                <input
                  {...register('description', { required: 'La descripción es obligatoria' })}
                  className={inputCls}
                  placeholder="Ej: Pago arriendo local"
                  autoFocus
                />
                {errors.description && <p className="text-[11px] text-red-500 mt-1">{errors.description.message as string}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400">Categoría</label>
                    <button type="button" onClick={() => setShowCategoryModal(true)}
                      className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
                      <Tag size={11} /> Nueva
                    </button>
                  </div>
                  <select {...register('categoryId')} className={inputCls}>
                    <option value="">Sin categoría</option>
                    {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Monto ($) *</label>
                  <Controller control={control} name="amount" rules={{ required: 'El monto es obligatorio', min: { value: 0.01, message: 'El monto debe ser mayor a 0' } }} render={({ field }) => (
                    <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder="0" />
                  )} />
                  {errors.amount && <p className="text-[11px] text-red-500 mt-1">{errors.amount.message as string}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Método de pago</label>
                  <select {...register('paymentMethod')} className={inputCls}>
                    <option value="CASH">Efectivo</option>
                    <option value="TRANSFER">Transferencia</option>
                    <option value="NEQUI">Nequi</option>
                    <option value="DAVIPLATA">Daviplata</option>
                    <option value="CARD">Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Fecha *</label>
                  <input
                    {...register('date', { required: 'La fecha es obligatoria', validate: (v) => !v || v <= new Date().toISOString().slice(0, 10) || 'La fecha no puede ser futura' })}
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    className={inputCls}
                  />
                  {errors.date && <p className="text-[11px] text-red-500 mt-1">{errors.date.message as string}</p>}
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Notas</label>
                <input {...register('notes')} className={inputCls} placeholder="Opcional" />
              </div>

              {/* Sección destinatario */}
              <div className="border-t border-slate-100 dark:border-white/[0.06] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">
                  A quién se le paga (opcional)
                </p>
                <div className="space-y-3">
                  <input
                    {...register('recipientName')}
                    placeholder="Nombre completo"
                    className={inputCls}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      {...register('recipientDocument')}
                      placeholder="Cédula / NIT"
                      className={inputCls}
                    />
                    <input
                      {...register('recipientPhone')}
                      type="tel"
                      placeholder="Celular"
                      maxLength={10}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-white/[0.06] pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditItem(null); }}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending || isSubmitting}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-sm shadow-blue-600/25 flex items-center gap-2 transition"
                >
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editItem ? 'Actualizar' : 'Guardar gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Nueva categoría Modal ────────────────────────────────────────────── */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-xs animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Nueva categoría</h2>
              <button type="button" aria-label="Cerrar" onClick={() => { setShowCategoryModal(false); setNewCategoryName(''); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nombre de la categoría"
                className={inputCls}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newCategoryName.trim()) categoryMutation.mutate(newCategoryName.trim()); } }}
              />
              <button
                type="button"
                disabled={!newCategoryName.trim() || categoryMutation.isPending}
                onClick={() => categoryMutation.mutate(newCategoryName.trim())}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-[13px] flex items-center justify-center gap-2 transition"
              >
                {categoryMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
                Crear categoría
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Eliminar gasto"
        description={deleteTarget ? `¿Eliminar "${deleteTarget.description}"? Esta acción no se puede deshacer.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        variant="danger"
      />
    </>
  );
}