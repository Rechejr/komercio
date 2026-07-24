'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  CALIDADES, calcularDV, calidadBloqueada, formatNit, resumenCalidades,
  type TaxClient, type Calidad,
} from '@/lib/contable';
import { Plus, Search, Edit, Trash2, X, Loader2, Users } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

interface FormState {
  razonSocial: string;
  nit: string;
  celular: string;
  direccion: string;
  tipoPersona: 'natural' | 'juridica';
  responsabilidades: Calidad[];
  ivaPeriodicidad: 'bimestral' | 'cuatrimestral' | '';
}

const FORM_VACIO: FormState = {
  razonSocial: '', nit: '', celular: '', direccion: '',
  tipoPersona: 'juridica', responsabilidades: [], ivaPeriodicidad: '',
};

export default function ClientesPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const puedeEliminar = role === 'ADMIN'; // el AUXILIAR no elimina clientes
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaxClient | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [delTarget, setDelTarget] = useState<TaxClient | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['contable-clients', page, search],
    queryFn: () => api.get(`/contable/clients?page=${page}&limit=20&search=${encodeURIComponent(search)}`).then((r) => r.data),
  });
  const clientes: TaxClient[] = data?.data ?? [];
  const pagination = data?.pagination;

  const saveMut = useMutation({
    mutationFn: (payload: any) =>
      editing
        ? api.put(`/contable/clients/${editing.id}`, payload)
        : api.post('/contable/clients', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-clients'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      toast.success(editing ? 'Cliente actualizado' : 'Cliente creado');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'No se pudo guardar'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contable/clients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-clients'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      toast.success('Cliente eliminado');
      setDelTarget(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'No se pudo eliminar'),
  });

  function openNew() {
    setEditing(null);
    setForm(FORM_VACIO);
    setModalOpen(true);
  }
  function openEdit(c: TaxClient) {
    setEditing(c);
    setForm({
      razonSocial: c.razonSocial, nit: c.nit, celular: c.celular ?? '', direccion: c.direccion ?? '',
      tipoPersona: c.tipoPersona, responsabilidades: c.responsabilidades,
      ivaPeriodicidad: c.ivaPeriodicidad ?? '',
    });
    setModalOpen(true);
  }

  function toggleCalidad(codigo: Calidad) {
    setForm((f) => {
      const activa = f.responsabilidades.includes(codigo);
      const next = activa
        ? f.responsabilidades.filter((c) => c !== codigo)
        : [...f.responsabilidades, codigo];
      return { ...f, responsabilidades: next };
    });
  }

  const esResponsableIva = form.responsabilidades.includes('responsable_iva');
  const dvPreview = calcularDV(form.nit);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razonSocial.trim()) return toast.error('La razón social es requerida');
    if (!form.nit.replace(/\D/g, '')) return toast.error('El NIT es requerido');
    saveMut.mutate({
      razonSocial: form.razonSocial,
      nit: form.nit,
      celular: form.celular,
      direccion: form.direccion,
      tipoPersona: form.tipoPersona,
      responsabilidades: form.responsabilidades,
      ivaPeriodicidad: esResponsableIva && form.ivaPeriodicidad ? form.ivaPeriodicidad : null,
    });
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre o identificación..."
            className={cn(inputCls, 'pl-9')}
          />
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Nombre / Razón social</th>
                <th className="px-4 py-3 font-semibold">Identificación</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Calidades</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>{[...Array(5)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : isError ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center">
                  <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                    {(error as any)?.response?.data?.error || 'No pudimos cargar los clientes'}
                  </p>
                  <button onClick={() => refetch()} className="text-sm text-emerald-600 hover:underline">Reintentar</button>
                </td></tr>
              ) : clientes.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <Users size={30} className="mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm">{search ? `Sin resultados para "${search}"` : 'Aún no tienes clientes. Crea el primero.'}</p>
                </td></tr>
              ) : (
                clientes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.razonSocial}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular">{formatNit(c.nit, c.dv)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300 capitalize">
                        {c.tipoPersona === 'juridica' ? 'Jurídica' : 'Natural'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{resumenCalidades(c)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20" aria-label="Editar">
                          <Edit size={15} />
                        </button>
                        {puedeEliminar && (
                          <button onClick={() => setDelTarget(c)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Eliminar">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-sm">
            <span className="text-slate-500 dark:text-slate-400">Página {pagination.page} de {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Anterior</button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal ficha de cliente ─────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nombres o razón social *</label>
                <input value={form.razonSocial} onChange={(e) => setForm((f) => ({ ...f, razonSocial: e.target.value }))} placeholder="Comercializadora El Sol SAS" className={inputCls} />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Identificación (NIT / cédula) *</label>
                  <input value={form.nit} onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))} placeholder="900123456" inputMode="numeric" className={inputCls} />
                </div>
                <div className="pb-2.5">
                  <span className="text-[13px] text-slate-500 dark:text-slate-400">DV: </span>
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular">{dvPreview ?? '—'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Celular</label>
                  <input value={form.celular} onChange={(e) => setForm((f) => ({ ...f, celular: e.target.value }))} placeholder="300 000 0000" inputMode="tel" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tipo de persona</label>
                  <select value={form.tipoPersona} onChange={(e) => setForm((f) => ({ ...f, tipoPersona: e.target.value as any }))} className={inputCls}>
                    <option value="juridica">Jurídica</option>
                    <option value="natural">Natural</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Dirección</label>
                <input value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} placeholder="Cra 10 # 20-30" className={inputCls} />
              </div>

              {/* Calidades tributarias con la regla RST */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-2">Calidades tributarias</label>
                <div className="space-y-1.5">
                  {CALIDADES.map((cal) => {
                    const marcada = form.responsabilidades.includes(cal.codigo);
                    const bloqueada = !marcada && calidadBloqueada(cal.codigo, form.responsabilidades);
                    return (
                      <label
                        key={cal.codigo}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                          marcada ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/15' : 'border-slate-200 dark:border-slate-700',
                          bloqueada && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={marcada}
                          disabled={bloqueada}
                          onChange={() => toggleCalidad(cal.codigo)}
                          className="accent-emerald-600 w-4 h-4"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-200">{cal.label}</span>
                      </label>
                    );
                  })}
                </div>
                {form.responsabilidades.includes('rst') && (
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    El Régimen Simple es excluyente con declarante de renta y agente retenedor.
                  </p>
                )}
              </div>

              {/* Periodicidad de IVA — solo si es responsable */}
              {esResponsableIva && (
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Periodicidad de IVA</label>
                  <select value={form.ivaPeriodicidad} onChange={(e) => setForm((f) => ({ ...f, ivaPeriodicidad: e.target.value as any }))} className={inputCls}>
                    <option value="">Elegir…</option>
                    <option value="bimestral">Bimestral</option>
                    <option value="cuatrimestral">Cuatrimestral</option>
                  </select>
                </div>
              )}
            </form>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0 flex gap-2">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">Cancelar</button>
              <button onClick={handleSubmit} disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
                {editing ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="¿Eliminar cliente?"
        description={delTarget ? `Se eliminará "${delTarget.razonSocial}" junto con sus vencimientos y resoluciones. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={delMut.isPending}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      />
    </div>
  );
}
