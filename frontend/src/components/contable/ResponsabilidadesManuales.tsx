'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatNit, formatFecha, situacionPorFecha } from '@/lib/contable';
import { Plus, Search, Edit, Trash2, X, Loader2, ClipboardList } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

type EstadoResp = 'pendiente' | 'presentado';
type ClientePicker = { id: string; razonSocial: string; nit: string; dv: number };

interface RespManual {
  id: string;
  tipo: 'exogena' | 'otra';
  concepto: string;
  fecha: string;
  estado: EstadoResp;
  taxClient: ClientePicker;
}

const ESTADO_RESP_COLOR: Record<EstadoResp, string> = {
  pendiente:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  presentado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

interface Props {
  tipo: 'exogena' | 'otra';
  conceptoLabel: string;        // "Concepto" | "Actividad"
  conceptoPlaceholder: string;
  emptyHint: string;
  nota?: string;                // aviso superior (p. ej. auto-borrado)
}

export function ResponsabilidadesManuales({ tipo, conceptoLabel, conceptoPlaceholder, emptyHint, nota }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RespManual | null>(null);
  const [delTarget, setDelTarget] = useState<RespManual | null>(null);

  const [cliente, setCliente] = useState<ClientePicker | null>(null);
  const [clienteSearch, setClienteSearch] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState('');
  const [estado, setEstado] = useState<EstadoResp>('pendiente');

  const { data: items = [], isLoading, isError, error, refetch } = useQuery<RespManual[]>({
    queryKey: ['contable-resp', tipo],
    queryFn: () => api.get(`/contable/responsabilidades?tipo=${tipo}`).then((r) => r.data.data),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['contable-clients-picker', clienteSearch],
    queryFn: () => api.get(`/contable/clients?limit=8&search=${encodeURIComponent(clienteSearch)}`).then((r) => r.data.data),
    enabled: modalOpen && !cliente,
  });

  const visibles = items.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    // OJO: solo comparar el NIT si el texto trae dígitos. Con letras, replace(/\D/g,'')
    // da "" y `nit.includes("")` es SIEMPRE true → dejaba pasar todos los registros.
    const soloDigitos = search.replace(/\D/g, '');
    return r.taxClient.razonSocial.toLowerCase().includes(q)
      || r.concepto.toLowerCase().includes(q)
      || (soloDigitos.length > 0 && r.taxClient.nit.includes(soloDigitos));
  });

  const saveMut = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/contable/responsabilidades/${editing.id}`, { concepto, fecha, estado })
        : api.post('/contable/responsabilidades', { taxClientId: cliente!.id, tipo, concepto, fecha, estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-resp', tipo] });
      toast.success(editing ? 'Registro actualizado' : 'Registro creado');
      setModalOpen(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo guardar'),
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoResp }) =>
      api.patch(`/contable/responsabilidades/${id}`, { estado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contable-resp', tipo] }),
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo actualizar'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contable/responsabilidades/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-resp', tipo] });
      toast.success('Registro eliminado');
      setDelTarget(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo eliminar'),
  });

  function openNew() {
    setEditing(null);
    setCliente(null);
    setClienteSearch('');
    setConcepto('');
    setFecha('');
    setEstado('pendiente');
    setModalOpen(true);
  }
  function openEdit(r: RespManual) {
    setEditing(r);
    setCliente(r.taxClient);
    setConcepto(r.concepto);
    setFecha(r.fecha.slice(0, 10));
    setEstado(r.estado);
    setModalOpen(true);
  }

  function submit() {
    if (!editing && !cliente) return toast.error('Elige un cliente');
    if (!concepto.trim()) return toast.error(`Indica ${conceptoLabel.toLowerCase()}`);
    if (!fecha) return toast.error('Indica la fecha de vencimiento');
    saveMut.mutate();
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {nota && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/15 px-4 py-2.5 text-[12px] text-amber-700 dark:text-amber-300">
          {nota}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente o concepto..." className={cn(inputCls, 'pl-9')} />
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Nuevo registro
        </button>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">{conceptoLabel}</th>
                <th className="px-4 py-3 font-semibold">Fecha de vencimiento</th>
                <th className="px-4 py-3 font-semibold">Situación</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : isError ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center">
                  <p className="text-sm text-red-600 dark:text-red-400 mb-2">{(error as any)?.response?.data?.error || 'No pudimos cargar los registros'}</p>
                  <button onClick={() => refetch()} className="text-sm text-emerald-600 hover:underline">Reintentar</button>
                </td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <ClipboardList size={30} className="mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm">{search ? `Sin resultados para "${search}"` : emptyHint}</p>
                </td></tr>
              ) : (
                visibles.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{r.taxClient.razonSocial}</p>
                      <p className="text-xs text-slate-400 tabular">{formatNit(r.taxClient.nit, r.taxClient.dv)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.concepto}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200 tabular">{formatFecha(r.fecha)}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const u = situacionPorFecha(r.fecha, r.estado === 'presentado');
                        return u
                          ? <span className={cn('inline-block text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap', u.className)}>{u.label}</span>
                          : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={r.estado}
                        onChange={(e) => estadoMut.mutate({ id: r.id, estado: e.target.value as EstadoResp })}
                        className={cn('text-xs font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:ring-2 focus:ring-emerald-500/30', ESTADO_RESP_COLOR[r.estado])}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="presentado">Presentado</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20" aria-label="Editar"><Edit size={15} /></button>
                        <button onClick={() => setDelTarget(r)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Eliminar"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear/editar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editing ? 'Editar registro' : 'Nuevo registro'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
            </div>

            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              {/* Cliente */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cliente</label>
                {cliente ? (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{cliente.razonSocial}</span>
                    {!editing && <button onClick={() => setCliente(null)} className="text-xs text-emerald-600 hover:underline">Cambiar</button>}
                  </div>
                ) : (
                  <>
                    <input value={clienteSearch} onChange={(e) => setClienteSearch(e.target.value)} placeholder="Buscar cliente..." className={inputCls} autoFocus />
                    {clienteSearch && (
                      <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-white/[0.06] max-h-40 overflow-y-auto">
                        {clientes.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p>
                        ) : clientes.map((c: any) => (
                          <button key={c.id} onClick={() => setCliente(c)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">
                            <span className="font-medium text-slate-900 dark:text-white">{c.razonSocial}</span>
                            <span className="text-xs text-slate-400 ml-2 tabular">{formatNit(c.nit, c.dv)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Concepto / actividad */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">{conceptoLabel}</label>
                <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder={conceptoPlaceholder} className={inputCls} />
              </div>

              {/* Fecha */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Fecha de vencimiento</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
              </div>

              {/* Estado */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Estado</label>
                <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoResp)} className={inputCls}>
                  <option value="pendiente">Pendiente</option>
                  <option value="presentado">Presentado</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0 flex gap-2">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">Cancelar</button>
              <button onClick={submit} disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
                {editing ? 'Guardar cambios' : 'Crear registro'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="¿Eliminar registro?"
        description={delTarget ? `${delTarget.concepto} · ${delTarget.taxClient.razonSocial}` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={delMut.isPending}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      />
    </div>
  );
}
