'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, Search, Edit, Trash2, Users, X, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PriceInput } from '@/components/ui/PriceInput';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

const FIELDS = [
  { name: 'name',        label: 'Nombre completo *',      col: 2 },
  { name: 'document',    label: 'Número de documento',     col: 1 },
  { name: 'phone',       label: 'Teléfono / WhatsApp',     col: 1 },
  { name: 'email',       label: 'Correo electrónico',      col: 2, type: 'email' },
  { name: 'address',     label: 'Dirección',               col: 2 },
  { name: 'city',        label: 'Ciudad',                  col: 1 },
  { name: 'creditLimit', label: 'Límite de crédito ($)',   col: 1 },
  { name: 'notes',       label: 'Observaciones',           col: 2 },
];

export default function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => api.get(`/customers?page=${page}&limit=20&search=${encodeURIComponent(search)}`).then((r) => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ['customer', selected?.id],
    queryFn: () => api.get(`/customers/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected?.id,
  });

  const { register, handleSubmit, reset, control } = useForm();

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem
      ? api.put(`/customers/${editItem.id}`, data)
      : api.post('/customers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(editItem ? 'Cliente actualizado' : 'Cliente creado');
      setShowForm(false); setEditItem(null); reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Cliente eliminado');
      setDeleteTarget(null);
      setSelected(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  const customers = data?.data || [];
  const pagination = data?.pagination;

  function openEdit(c: any) { setEditItem(c); reset(c); setShowForm(true); }

  return (
    <div className="space-y-4 animate-fade-up">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, documento o teléfono..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
          />
        </div>
        <button
          type="button"
          onClick={() => { setEditItem(null); reset({}); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition"
        >
          <Plus size={15} /> Nuevo cliente
        </button>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nombre</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Documento</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Teléfono</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Ciudad</th>
                <th className="hidden lg:table-cell text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Compras</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Deuda</th>
                <th className="w-20 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <Users size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">No hay clientes{search ? ` para "${search}"` : ''}</p>
                    </div>
                  </td>
                </tr>
              ) : customers.map((c: any) => (
                <tr
                  key={c.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => setSelected(c)}
                >
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-slate-800 dark:text-white">{c.name}</p>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-[12px] font-mono text-slate-500 dark:text-slate-400">
                    {c.document || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {c.phone || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {c.city || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-center text-[13px] text-slate-600 dark:text-slate-400 tabular-nums">
                    {c._count?.sales || 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.currentDebt > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-600 dark:text-red-400 tabular-nums">
                        <AlertCircle size={12} /> {formatCurrency(c.currentDebt)}
                      </span>
                    ) : (
                      <span className="badge badge-green">Al día</span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        aria-label="Editar cliente"
                        onClick={() => openEdit(c)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar cliente"
                        onClick={() => setDeleteTarget(c)}
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
            <span>{pagination.total} clientes</span>
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

      {/* ── Form Modal ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] sticky top-0 bg-white dark:bg-slate-900 z-10">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">
                {editItem ? 'Editar cliente' : 'Nuevo cliente'}
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

            <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="p-6 grid grid-cols-2 gap-4">
              {FIELDS.map((f) => (
                <div key={f.name} className={f.col === 2 ? 'col-span-2' : ''}>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">{f.label}</label>
                  {f.name === 'creditLimit' ? (
                    <Controller control={control} name="creditLimit" render={({ field }) => (
                      <PriceInput {...field} onChange={(n) => field.onChange(n ?? undefined)} className={inputCls} placeholder="0" />
                    )} />
                  ) : (
                    <input {...register(f.name)} type={f.type || 'text'} className={inputCls} />
                  )}
                </div>
              ))}
              <div className="col-span-2 flex justify-end gap-3 border-t border-slate-100 dark:border-white/[0.06] pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditItem(null); }}
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
                  {editItem ? 'Actualizar' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {selected && detail && !showForm && !deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] sticky top-0 bg-white dark:bg-slate-900 z-10">
              <h2 className="text-[16px] font-bold text-slate-800 dark:text-white">{detail.name}</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Editar"
                  onClick={() => { setSelected(null); openEdit(detail); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
                >
                  <Edit size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Eliminar"
                  onClick={() => { setSelected(null); setDeleteTarget(detail); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                >
                  <Trash2 size={14} />
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

            <div className="p-6 space-y-5">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Documento', detail.document || '—'],
                  ['Teléfono', detail.phone || '—'],
                  ['Email', detail.email || '—'],
                  ['Ciudad', detail.city || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">{k}</p>
                    <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{v}</p>
                  </div>
                ))}
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3.5 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 dark:text-red-400 mb-1">Deuda actual</p>
                  <p className="text-[20px] font-bold text-red-700 dark:text-red-300 tabular-nums">{formatCurrency(detail.currentDebt || 0)}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-3.5 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400 mb-1">Total compras</p>
                  <p className="text-[20px] font-bold text-blue-700 dark:text-blue-300 tabular-nums">{detail._count?.sales || 0}</p>
                </div>
              </div>

              {/* Últimas compras */}
              {detail.sales?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Últimas compras</p>
                  <div className="card overflow-hidden">
                    <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {detail.sales.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between px-3 py-2.5 text-[13px]">
                          <span className="font-mono text-[12px] text-blue-600 dark:text-blue-400">{s.invoiceNumber}</span>
                          <span className="font-semibold text-slate-800 dark:text-white tabular-nums">{formatCurrency(s.total)}</span>
                          <span className="text-[11px] text-slate-400">{formatDate(s.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Eliminar cliente"
        description={
          deleteTarget
            ? `¿Eliminar a "${deleteTarget.name}"?${deleteTarget.currentDebt > 0 ? ` Tiene una deuda pendiente de ${formatCurrency(deleteTarget.currentDebt)}.` : ''}`
            : undefined
        }
        confirmLabel="Eliminar"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        variant={deleteTarget?.currentDebt > 0 ? 'warning' : 'danger'}
      />
    </div>
  );
}