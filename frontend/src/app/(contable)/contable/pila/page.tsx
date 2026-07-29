'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Portal } from '@/components/ui/Portal';
import {
  ESTADOS_MANUALES, ESTADO_COLOR, estadoManual, urgenciaVencimiento,
  formatNit, formatFecha, type EstadoVencimiento,
} from '@/lib/contable';
import { Plus, Search, Trash2, X, Loader2, ShieldCheck, Sparkles } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

interface VencPila {
  id: string; periodo: string; fecha: string;
  estado: EstadoVencimiento;
  taxClient: { id: string; razonSocial: string; nit: string; dv: number };
}

export default function PilaPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<VencPila | null>(null);

  // Solo PILA: el backend filtra por obligación (listVencimientos acepta ?obligacion).
  const { data: items = [], isLoading } = useQuery<VencPila[]>({
    queryKey: ['contable-pila', search],
    queryFn: () =>
      api.get(`/contable/vencimientos?obligacion=pila&search=${encodeURIComponent(search)}`).then((r) => r.data.data),
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['contable-pila'] });
    qc.invalidateQueries({ queryKey: ['contable-vencimientos'] });
    qc.invalidateQueries({ queryKey: ['contable-panel'] });
  };

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      api.patch(`/contable/vencimientos/${id}/estado`, { estado }),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo actualizar'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contable/vencimientos/${id}`),
    onSuccess: () => { invalidar(); toast.success('Vencimiento eliminado'); setDelTarget(null); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo eliminar'),
  });

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Explicación breve del módulo */}
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-900/10 px-4 py-3">
        <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Aportes a seguridad social (salud, pensión, riesgos y parafiscales). La fecha de cada mes
          se calcula sola según los dos últimos dígitos del documento — no hay que buscarla.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente o identificación..." className={cn(inputCls, 'pl-9')} />
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Generar PILA
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Mes</th>
                <th className="px-4 py-3 font-semibold">Vence</th>
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
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <ShieldCheck size={30} className="mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm">
                    {search ? 'No hay PILA que coincida con la búsqueda.' : 'Aún no has generado PILA. Usa “Generar PILA”.'}
                  </p>
                </td></tr>
              ) : (
                items.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{v.taxClient.razonSocial}</p>
                      <p className="text-xs text-slate-400 tabular">{formatNit(v.taxClient.nit, v.taxClient.dv)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{v.periodo}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200 tabular">{formatFecha(v.fecha)}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const u = urgenciaVencimiento(v.fecha, v.estado);
                        return u
                          ? <span className={cn('inline-block text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap', u.className)}>{u.label}</span>
                          : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={estadoManual(v.estado)}
                        onChange={(e) => estadoMut.mutate({ id: v.id, estado: e.target.value })}
                        className={cn('text-xs font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:ring-2 focus:ring-emerald-500/30', ESTADO_COLOR[estadoManual(v.estado)])}
                      >
                        {ESTADOS_MANUALES.map((s) => <option key={s.codigo} value={s.codigo}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDelTarget(v)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Eliminar">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && <GenerarPilaModal onClose={() => setModalOpen(false)} onDone={invalidar} />}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="¿Eliminar este mes de PILA?"
        description={delTarget ? `${delTarget.periodo} de ${delTarget.taxClient.razonSocial}` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={delMut.isPending}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      />
    </div>
  );
}

// ─── Modal: generar los 12 meses de PILA de un cliente ─────────────────────────
type ClientePicker = { id: string; razonSocial: string; nit: string; dv: number };

function GenerarPilaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [clienteSearch, setClienteSearch] = useState('');
  const [cliente, setCliente] = useState<ClientePicker | null>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ['contable-clients-picker', clienteSearch],
    queryFn: () => api.get(`/contable/clients?limit=8&search=${encodeURIComponent(clienteSearch)}`).then((r) => r.data.data),
    enabled: !cliente,
  });

  const { data: periodos = [], isFetching: cargando } = useQuery<{ periodo: string; fecha: string }[]>({
    queryKey: ['contable-periodos', cliente?.id, 'pila'],
    queryFn: () => api.get(`/contable/calendario/periodos?taxClientId=${cliente!.id}&obligacion=pila`).then((r) => r.data.data),
    enabled: !!cliente,
  });

  const generarMut = useMutation({
    mutationFn: () => api.post('/contable/vencimientos/generar', { taxClientId: cliente!.id, obligacion: 'pila' }).then((r) => r.data),
    onSuccess: (res: any) => { onDone(); toast.success(res?.message || 'PILA generada'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo generar la PILA'),
  });

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Generar PILA</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cliente</label>
            {cliente ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800">
                <span className="text-sm font-medium text-slate-900 dark:text-white">{cliente.razonSocial}</span>
                <button onClick={() => setCliente(null)} className="text-xs text-emerald-600 hover:underline">Cambiar</button>
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

          {cliente && (
            cargando ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 size={14} className="animate-spin" /> Calculando fechas…</div>
            ) : (
              <div>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 mb-1.5">
                  <Sparkles size={11} /> Se registrarán estos {periodos.length} meses (fecha automática según el documento)
                </div>
                <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto">
                  {periodos.map((p) => (
                    <div key={p.periodo} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{p.periodo}</span>
                      <span className="text-slate-500 dark:text-slate-400 tabular">{formatFecha(p.fecha)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Los que ya existan no se duplican.</p>
              </div>
            )
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">Cancelar</button>
          <button
            onClick={() => generarMut.mutate()}
            disabled={!cliente || cargando || generarMut.isPending}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {generarMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Registrar {cliente && !cargando ? `${periodos.length} meses` : 'PILA'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
