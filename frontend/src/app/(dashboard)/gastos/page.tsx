'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, paymentMethodLabel } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, X, Loader2, Receipt, Edit, Trash2, FileDown, Tag, Search, Building2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PriceInput } from '@/components/ui/PriceInput';
import { downloadExcel } from '@/lib/exportExcel';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

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
  const [showDescriptionDD, setShowDescriptionDD] = useState(false);
  const [showSupplierDD, setShowSupplierDD] = useState(false);
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupLegal, setNewSupLegal] = useState('');
  const [newSupDoc, setNewSupDoc] = useState('');

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

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=100').then((r) => r.data.data),
  });

  const { data: expenseHistory } = useQuery({
    queryKey: ['expenses-history'],
    queryFn: () => api.get('/expenses?limit=100').then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, control, watch, setValue, formState: { isSubmitting, errors } } = useForm();

  const recipientNameValue = watch('recipientName') || '';
  const filteredSuppliers = (suppliers || []).filter((s: any) =>
    !recipientNameValue || s.name.toLowerCase().includes(recipientNameValue.toLowerCase())
  );

  function selectSupplier(s: any) {
    setValue('supplierId', s.id);
    setValue('recipientName', s.name);
    setValue('recipientDocument', s.document || '');
    setValue('recipientPhone', s.mobile || s.phone || '');
    setShowSupplierDD(false);
  }

  const supplierIdValue = watch('supplierId');
  const recipientDocumentValue = watch('recipientDocument') || '';
  const recipientPhoneValue = watch('recipientPhone') || '';

  function openCreateSupplierModal() {
    setNewSupName(recipientNameValue);
    setNewSupDoc(recipientDocumentValue);
    setNewSupPhone(recipientPhoneValue);
    setShowSupplierDD(false);
    setShowCreateSupplier(true);
  }

  const { onChange: recipientNameOnChange, ...recipientNameField } = register('recipientName');

  const descriptionValue = watch('description') || '';
  const descriptionSuggestions = (() => {
    const seen = new Set<string>();
    const unique: any[] = [];
    for (const e of expenseHistory || []) {
      const key = e.description.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(e);
    }
    return unique;
  })();
  const filteredDescriptions = descriptionSuggestions.filter((e: any) =>
    !descriptionValue || e.description.toLowerCase().includes(descriptionValue.toLowerCase())
  );

  const supplierMatchesForDescription = descriptionValue
    ? (suppliers || []).filter((s: any) => s.name.toLowerCase().includes(descriptionValue.toLowerCase()))
    : [];

  function selectExpenseTemplate(e: any) {
    setValue('description', e.description);
    setValue('categoryId', e.categoryId || '');
    setValue('paymentMethod', e.paymentMethod || 'CASH');
    setValue('recipientName', e.recipientName || '');
    setValue('recipientDocument', e.recipientDocument || '');
    setValue('recipientPhone', e.recipientPhone || '');
    setValue('supplierId', e.supplierId || '');
    setShowDescriptionDD(false);
  }

  function selectSupplierFromDescription(s: any) {
    setValue('supplierId', s.id);
    setValue('recipientName', s.name);
    setValue('recipientDocument', s.document || '');
    setValue('recipientPhone', s.mobile || s.phone || '');
    // Si este proveedor ya tiene gastos anteriores, hereda categoría y método de pago del más reciente
    const lastExpense = (expenseHistory || []).find((e: any) => e.supplierId === s.id);
    if (lastExpense) {
      setValue('categoryId', lastExpense.categoryId || '');
      setValue('paymentMethod', lastExpense.paymentMethod || 'CASH');
    }
    setShowDescriptionDD(false);
  }

  const { onChange: descriptionOnChange, ...descriptionField } = register('description', { required: 'La descripción es obligatoria' });

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem
      ? api.put(`/expenses/${editItem.id}`, data)
      : api.post('/expenses', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses-history'] });
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
      qc.invalidateQueries({ queryKey: ['expenses-history'] });
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

  const createSupplierMutation = useMutation({
    mutationFn: (d: { name: string; legalName?: string; document?: string; phone?: string }) =>
      api.post('/suppliers', d).then((r) => r.data.data),
    onSuccess: (supplier) => {
      selectSupplier(supplier);
      setShowCreateSupplier(false);
      setNewSupName(''); setNewSupPhone(''); setNewSupLegal(''); setNewSupDoc('');
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      toast.success('Proveedor creado');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al crear proveedor'),
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
      supplierId: expense.supplierId || '',
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
      supplierId: '',
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
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition"
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
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
        />
        <span className="text-[12px] text-slate-400">hasta</span>
        <input
          type="date"
          aria-label="Fecha fin exportación"
          value={exportEnd}
          onChange={(e) => setExportEnd(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
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
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
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
                <div className="relative">
                  <input
                    {...descriptionField}
                    onChange={(e) => { descriptionOnChange(e); setShowDescriptionDD(true); }}
                    onFocus={() => setShowDescriptionDD(true)}
                    onBlur={() => setTimeout(() => setShowDescriptionDD(false), 150)}
                    className={inputCls}
                    placeholder="Ej: Pago arriendo local"
                    autoComplete="off"
                    autoFocus
                  />
                  {showDescriptionDD && (supplierMatchesForDescription.length > 0 || filteredDescriptions.length > 0) && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-modal z-20 max-h-52 overflow-y-auto">
                      {supplierMatchesForDescription.length > 0 && (
                        <>
                          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Proveedores</p>
                          {supplierMatchesForDescription.map((s: any) => (
                            <button
                              key={`sup-${s.id}`}
                              type="button"
                              onMouseDown={() => selectSupplierFromDescription(s)}
                              className="w-full flex items-center gap-1.5 text-left px-3 py-2.5 text-[13px] hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition"
                            >
                              <Building2 size={12} className="text-slate-400 flex-shrink-0" />
                              {s.name}
                            </button>
                          ))}
                        </>
                      )}
                      {filteredDescriptions.length > 0 && (
                        <>
                          {supplierMatchesForDescription.length > 0 && (
                            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-t border-slate-100 dark:border-white/[0.06]">Gastos anteriores</p>
                          )}
                          {filteredDescriptions.map((e: any) => (
                            <button
                              key={e.id}
                              type="button"
                              onMouseDown={() => selectExpenseTemplate(e)}
                              className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition"
                            >
                              <span className="font-medium">{e.description}</span>
                              {e.recipientName && <span className="text-slate-400"> · {e.recipientName}</span>}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {errors.description && <p className="text-[11px] text-red-500 mt-1">{errors.description.message as string}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400">Categoría</label>
                    <button type="button" onClick={() => setShowCategoryModal(true)}
                      className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline">
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
                  <input type="hidden" {...register('supplierId')} />
                  <div className="relative">
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        {...recipientNameField}
                        onChange={(e) => { recipientNameOnChange(e); setValue('supplierId', ''); setShowSupplierDD(true); }}
                        onFocus={() => setShowSupplierDD(true)}
                        onBlur={() => setTimeout(() => setShowSupplierDD(false), 150)}
                        placeholder="Nombre completo o buscar proveedor..."
                        autoComplete="off"
                        className={`${inputCls} pl-8`}
                      />
                    </div>
                    {showSupplierDD && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-modal z-20 max-h-44 overflow-y-auto">
                        {filteredSuppliers.map((s: any) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={() => selectSupplier(s)}
                            className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition"
                          >
                            {s.name}
                          </button>
                        ))}
                        {filteredSuppliers.length === 0 && (
                          <p className="px-3 py-2.5 text-[12px] text-slate-400">Sin proveedores</p>
                        )}
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); openCreateSupplierModal(); }}
                          className="w-full flex items-center gap-1.5 px-3 py-2.5 text-[13px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-700 border-t border-slate-100 dark:border-white/[0.06] transition"
                        >
                          <Plus size={13} /> Crear proveedor nuevo
                        </button>
                      </div>
                    )}
                  </div>
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
                  {recipientNameValue.trim() && !supplierIdValue && (
                    <button
                      type="button"
                      onClick={openCreateSupplierModal}
                      className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      <Plus size={11} /> Guardar como proveedor
                    </button>
                  )}
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
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/25 flex items-center gap-2 transition"
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
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-[13px] flex items-center justify-center gap-2 transition"
              >
                {categoryMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
                Crear categoría
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Crear proveedor Modal ────────────────────────────────────────────── */}
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
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
              />
              <input
                type="tel"
                placeholder="Celular / Teléfono"
                value={newSupPhone}
                onChange={(e) => setNewSupPhone(e.target.value)}
                maxLength={10}
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
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
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-600/25 transition"
              >
                {createSupplierMutation.isPending ? 'Guardando...' : 'Guardar'}
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