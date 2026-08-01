'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Portal } from '@/components/ui/Portal';
import { formatNit, formatFecha, situacionPorFecha } from '@/lib/contable';
import { Plus, Search, Trash2, X, Loader2, FileText } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';
const filterCls =
  'px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

// Normaliza para buscar sin distinguir tildes ("pena" encuentra "Peña").
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const TIPOS = [
  { codigo: 'factura_electronica', label: 'Factura Electrónica' },
  { codigo: 'documento_soporte', label: 'Documento Soporte' },
  { codigo: 'otra', label: 'Otra' },
];
const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.codigo, t.label]));

const CLASES = [
  { codigo: 'autorizacion', label: 'Autorización' },
  { codigo: 'habilitacion', label: 'Habilitación' },
];
const CLASE_LABEL: Record<string, string> = Object.fromEntries(CLASES.map((c) => [c.codigo, c.label]));

interface Resolucion {
  id: string; tipo: string; clase: string | null; numero: string; fechaExpedicion: string; fechaVigencia: string;
  prefijo: string | null;
  taxClient: { id: string; razonSocial: string; nit: string; dv: number };
}

export default function ResolucionesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Resolucion | null>(null);

  // Filtros (del lado del cliente: el volumen por oficina es pequeño).
  const [search, setSearch] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fClase, setFClase] = useState('');
  const [fSituacion, setFSituacion] = useState('');

  const { data: resoluciones = [], isLoading } = useQuery<Resolucion[]>({
    queryKey: ['contable-resoluciones'],
    queryFn: () => api.get('/contable/resoluciones').then((r) => r.data.data),
  });

  const visibles = useMemo(() => resoluciones.filter((r) => {
    if (fTipo && r.tipo !== fTipo) return false;
    if (fClase && r.clase !== fClase) return false;
    if (fSituacion) {
      const u = situacionPorFecha(r.fechaVigencia, false);
      if (fSituacion === 'vencida' && !(u && u.vencido)) return false;
      if (fSituacion === 'por_vencer' && !(u && !u.vencido)) return false;
    }
    if (search.trim()) {
      const q = norm(search);
      const soloDigitos = search.replace(/\D/g, '');
      const numeroFull = `${r.prefijo ?? ''} ${r.numero}`;
      const ok = norm(r.taxClient.razonSocial).includes(q)
        || norm(numeroFull).includes(q)
        || (soloDigitos.length > 0 && r.taxClient.nit.includes(soloDigitos));
      if (!ok) return false;
    }
    return true;
  }), [resoluciones, search, fTipo, fClase, fSituacion]);

  const hayFiltros = !!(search.trim() || fTipo || fClase || fSituacion);
  const limpiarFiltros = () => { setSearch(''); setFTipo(''); setFClase(''); setFSituacion(''); };

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/15 px-4 py-2.5 text-[12px] text-amber-700 dark:text-amber-300">
          Las resoluciones vencidas se borran automáticamente 2 meses después de expirar su vigencia.
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Nueva resolución
        </button>
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, cédula/NIT o número..." className={cn(inputCls, 'pl-9')} />
        </div>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className={filterCls}>
          <option value="">Todo tipo</option>
          {TIPOS.map((t) => <option key={t.codigo} value={t.codigo}>{t.label}</option>)}
        </select>
        <select value={fClase} onChange={(e) => setFClase(e.target.value)} className={filterCls}>
          <option value="">Toda clase</option>
          {CLASES.map((c) => <option key={c.codigo} value={c.codigo}>{c.label}</option>)}
        </select>
        <select value={fSituacion} onChange={(e) => setFSituacion(e.target.value)} className={filterCls}>
          <option value="">Toda situación</option>
          <option value="por_vencer">Por vencer</option>
          <option value="vencida">Vencidas</option>
        </select>
        {hayFiltros && (
          <button onClick={limpiarFiltros} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline underline-offset-2">
            Limpiar
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Clase</th>
                <th className="px-4 py-3 font-semibold">Número</th>
                <th className="px-4 py-3 font-semibold">Vigencia</th>
                <th className="px-4 py-3 font-semibold">Situación</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : visibles.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <FileText size={30} className="mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm">{hayFiltros ? 'Sin resultados para los filtros.' : 'Aún no hay resoluciones registradas.'}</p>
                </td></tr>
              ) : (
                visibles.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{r.taxClient.razonSocial}</p>
                      <p className="text-xs text-slate-400 tabular">{formatNit(r.taxClient.nit, r.taxClient.dv)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                    <td className="px-4 py-3">
                      {r.clase
                        ? <span className="inline-block text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{CLASE_LABEL[r.clase] ?? r.clase}</span>
                        : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {r.prefijo ? `${r.prefijo} · ` : ''}{r.numero}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200 tabular">{formatFecha(r.fechaVigencia)}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const u = situacionPorFecha(r.fechaVigencia, false);
                        return u
                          ? <span className={cn('inline-block text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap', u.className)}>{u.label}</span>
                          : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>;
                      })()}
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
    tipo: 'factura_electronica', clase: 'autorizacion', numero: '', prefijo: '',
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
    <Portal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0 border-b border-slate-100 dark:border-white/[0.06]">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tipo</label>
                  <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} className={inputCls}>
                    {TIPOS.map((t) => <option key={t.codigo} value={t.codigo}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Clase</label>
                  <select value={form.clase} onChange={(e) => setForm((f) => ({ ...f, clase: e.target.value }))} className={inputCls}>
                    {CLASES.map((c) => <option key={c.codigo} value={c.codigo}>{c.label}</option>)}
                  </select>
                </div>
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

        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">Cancelar</button>
          <button onClick={submit} disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Registrar
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
