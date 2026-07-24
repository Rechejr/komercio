'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatNit, formatFecha } from '@/lib/contable';
import { Plus, Trash2, X, Loader2, FileText } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

const TIPOS = [
  { codigo: 'facturacion_numeracion', label: 'Facturación / Numeración' },
  { codigo: 'habilitacion_electronica', label: 'Habilitación electrónica' },
  { codigo: 'otra', label: 'Otra' },
];
const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.codigo, t.label]));

const ESTADO_COLOR: Record<string, string> = {
  vigente:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  por_vencer:'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  vencida:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  agotada:   'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
};

interface Resolucion {
  id: string; tipo: string; numero: string; fechaExpedicion: string; fechaVigencia: string;
  prefijo: string | null; estado: string;
  taxClient: { id: string; razonSocial: string };
}

export default function ResolucionesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Resolucion | null>(null);

  const { data: resoluciones = [], isLoading } = useQuery<Resolucion[]>({
    queryKey: ['contable-resoluciones'],
    queryFn: () => api.get('/contable/resoluciones').then((r) => r.data.data),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contable/resoluciones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-resoluciones'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      toast.success('Resolución eliminada');
      setDelTarget(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo eliminar'),
  });

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex justify-end">
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Nueva resolución
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Número</th>
                <th className="px-4 py-3 font-semibold">Vigencia</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : resoluciones.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <FileText size={30} className="mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm">Aún no hay resoluciones registradas.</p>
                </td></tr>
              ) : (
                resoluciones.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{r.taxClient.razonSocial}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {r.prefijo ? `${r.prefijo} · ` : ''}{r.numero}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200 tabular">{formatFecha(r.fechaVigencia)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full capitalize', ESTADO_COLOR[r.estado] ?? ESTADO_COLOR.agotada)}>
                        {r.estado.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDelTarget(r)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Eliminar">
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

      {modalOpen && <NuevaResolucionModal onClose={() => setModalOpen(false)} />}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="¿Eliminar resolución?"
        description={delTarget ? `Resolución ${delTarget.numero} de ${delTarget.taxClient.razonSocial}` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={delMut.isPending}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      />
    </div>
  );
}

function NuevaResolucionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [clienteSearch, setClienteSearch] = useState('');
  const [cliente, setCliente] = useState<{ id: string; razonSocial: string; nit: string; dv: number } | null>(null);
  const [form, setForm] = useState({
    tipo: 'facturacion_numeracion', numero: '', prefijo: '',
    fechaExpedicion: '', fechaVigencia: '', modalidad: '',
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['contable-clients-picker-reso', clienteSearch],
    queryFn: () => api.get(`/contable/clients?limit=8&search=${encodeURIComponent(clienteSearch)}`).then((r) => r.data.data),
    enabled: !cliente,
  });

  const saveMut = useMutation({
    mutationFn: () => api.post('/contable/resoluciones', { taxClientId: cliente!.id, ...form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-resoluciones'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      toast.success('Resolución registrada');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo registrar'),
  });

  function submit() {
    if (!cliente) return toast.error('Elige un cliente');
    if (!form.numero.trim()) return toast.error('Indica el número');
    if (!form.fechaExpedicion || !form.fechaVigencia) return toast.error('Indica las fechas');
    saveMut.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Nueva resolución</h2>
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
                    {clientes.length === 0 ? <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p> :
                      clientes.map((c: any) => (
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
            <>
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} className={inputCls}>
                  {TIPOS.map((t) => <option key={t.codigo} value={t.codigo}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Número</label>
                  <input value={form.numero} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} placeholder="18764..." className={inputCls} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Prefijo</label>
                  <input value={form.prefijo} onChange={(e) => setForm((f) => ({ ...f, prefijo: e.target.value }))} placeholder="FE, POS..." className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Expedición</label>
                  <input type="date" value={form.fechaExpedicion} onChange={(e) => setForm((f) => ({ ...f, fechaExpedicion: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Vigencia</label>
                  <input type="date" value={form.fechaVigencia} onChange={(e) => setForm((f) => ({ ...f, fechaVigencia: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">Cancelar</button>
          <button onClick={submit} disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Registrar
          </button>
        </div>
      </div>
    </div>
  );
}
