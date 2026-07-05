'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Search, Edit, Trash2, Truck, X, Loader2, Phone } from 'lucide-react';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

const FIELDS = [
  { name: 'name',        label: 'Nombre comercial *',  col: 2 },
  { name: 'legalName',   label: 'Razón social',         col: 2 },
  { name: 'document',    label: 'NIT / Documento',      col: 1 },
  { name: 'contactName', label: 'Persona de contacto',  col: 1 },
  { name: 'phone',       label: 'Teléfono',             col: 1, type: 'tel', maxLength: 10 },
  { name: 'mobile',      label: 'Celular',              col: 1, type: 'tel', maxLength: 10 },
  { name: 'email',       label: 'Correo',               col: 2, type: 'email' },
  { name: 'address',     label: 'Dirección',            col: 2 },
  { name: 'city',        label: 'Ciudad',               col: 1 },
  { name: 'notes',       label: 'Notas',                col: 1 },
];

export default function ProveedoresPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, search],
    queryFn: () => api.get(`/suppliers?page=${page}&limit=20&search=${encodeURIComponent(search)}`).then((r) => r.data),
  });

  const { register, handleSubmit, reset } = useForm();

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem ? api.put(`/suppliers/${editItem.id}`, data) : api.post('/suppliers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      toast.success(editItem ? 'Proveedor actualizado' : 'Proveedor creado');
      setShowForm(false); setEditItem(null); reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      toast.success('Proveedor eliminado');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  const suppliers = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4 animate-fade-up">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar proveedor..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
          />
        </div>
        <button
          type="button"
          onClick={() => { setEditItem(null); reset({}); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition"
        >
          <Plus size={15} /> Nuevo proveedor
        </button>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nombre</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Razón social</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Contacto</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Teléfonos</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Email</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Productos</th>
                <th className="w-16 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <Truck size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">No hay proveedores{search ? ` para "${search}"` : ''}</p>
                    </div>
                  </td>
                </tr>
              ) : suppliers.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-slate-800 dark:text-white">{s.name}</p>
                    {s.document && <p className="text-[11px] text-slate-400 mt-0.5">NIT: {s.document}</p>}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {s.legalName || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {s.contactName || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.phone && (
                      <p className="flex items-center gap-1 text-[13px] text-slate-500 dark:text-slate-400">
                        <Phone size={11} className="text-slate-300 dark:text-slate-600" /> {s.phone}
                      </p>
                    )}
                    {s.mobile && (
                      <p className="flex items-center gap-1 text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <Phone size={11} className="text-blue-400" /> {s.mobile}
                      </p>
                    )}
                    {!s.phone && !s.mobile && <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {s.email || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-[13px] text-slate-600 dark:text-slate-400 tabular-nums">
                    {s._count?.products || 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Editar proveedor"
                        onClick={() => { setEditItem(s); reset(s); setShowForm(true); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar proveedor"
                        onClick={() => { if (window.confirm(`¿Eliminar a "${s.name}"?`)) deleteMutation.mutate(s.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
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
            <span>{pagination.total} proveedores</span>
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] flex flex-col animate-scale-in">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0 bg-white dark:bg-slate-900">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">
                {editItem ? 'Editar proveedor' : 'Nuevo proveedor'}
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

            <form onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="p-6 grid grid-cols-2 gap-4 overflow-y-auto">
              {FIELDS.map((f) => (
                <div key={f.name} className={f.col === 2 ? 'col-span-2' : ''}>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">{f.label}</label>
                  <input {...register(f.name)} type={f.type || 'text'} maxLength={(f as any).maxLength} className={inputCls} />
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
                  {editItem ? 'Actualizar' : 'Crear proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}