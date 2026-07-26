'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  OBLIGACIONES, OBLIGACION_LABEL, ESTADOS_MANUALES, ESTADO_COLOR, estadoManual,
  urgenciaVencimiento, formatNit, formatFecha,
  type Obligacion, type EstadoVencimiento,
} from '@/lib/contable';
import { Plus, Search, Trash2, X, Loader2, CalendarClock, Sparkles } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

interface Vencimiento {
  id: string; obligacion: Obligacion; periodo: string; fecha: string;
  estado: EstadoVencimiento; monto: string | null;
  taxClient: { id: string; razonSocial: string; nit: string; dv: number };
}

export default function VencimientosPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Obligacion | 'todas'>('todas');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Vencimiento | null>(null);
  const [clienteInicial, setClienteInicial] = useState<{ id: string; razonSocial: string; nit: string; dv: number } | null>(null);

  // Al llegar desde "crear cliente" (?cliente=&nombre=), abrir el modal con ese
  // cliente ya seleccionado y filtrar la lista por él. Se limpia la URL para que
  // un refresh no vuelva a abrir el modal.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('cliente');
    const nombre = params.get('nombre');
    if (id && nombre) {
      setClienteInicial({ id, razonSocial: nombre, nit: '', dv: 0 });
      setSearch(nombre);
      setModalOpen(true);
      window.history.replaceState({}, '', '/contable/vencimientos');
    }
  }, []);

  const { data: vencimientos = [], isLoading } = useQuery<Vencimiento[]>({
    queryKey: ['contable-vencimientos', search],
    queryFn: () => api.get(`/contable/vencimientos?search=${encodeURIComponent(search)}`).then((r) => r.data.data),
  });

  // Contador por obligación para las pestañas.
  const conteos = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of vencimientos) c[v.obligacion] = (c[v.obligacion] || 0) + 1;
    return c;
  }, [vencimientos]);

  const visibles = tab === 'todas' ? vencimientos : vencimientos.filter((v) => v.obligacion === tab);
  const obligacionesConDatos = OBLIGACIONES.filter((o) => conteos[o.codigo]);

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      api.patch(`/contable/vencimientos/${id}/estado`, { estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-vencimientos'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo actualizar'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contable/vencimientos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-vencimientos'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      toast.success('Vencimiento eliminado');
      setDelTarget(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo eliminar'),
  });

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente o identificación..." className={cn(inputCls, 'pl-9')} />
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Nuevo vencimiento
        </button>
      </div>

      {/* Pestañas por obligación */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
        <TabBtn active={tab === 'todas'} onClick={() => setTab('todas')} label="Todas" count={vencimientos.length} />
        {obligacionesConDatos.map((o) => (
          <TabBtn key={o.codigo} active={tab === o.codigo} onClick={() => setTab(o.codigo)} label={o.label} count={conteos[o.codigo]} />
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Obligación</th>
                <th className="px-4 py-3 font-semibold">Periodo</th>
                <th className="px-4 py-3 font-semibold">Vence</th>
                <th className="px-4 py-3 font-semibold">Situación</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : visibles.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <CalendarClock size={30} className="mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm">No hay vencimientos {tab !== 'todas' ? `de ${OBLIGACION_LABEL[tab as Obligacion]}` : 'registrados'}.</p>
                </td></tr>
              ) : (
                visibles.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{v.taxClient.razonSocial}</p>
                      <p className="text-xs text-slate-400 tabular">{formatNit(v.taxClient.nit, v.taxClient.dv)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{OBLIGACION_LABEL[v.obligacion]}</td>
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

      {modalOpen && (
        <NuevoVencimientoModal
          clienteInicial={clienteInicial}
          onClose={() => { setModalOpen(false); setClienteInicial(null); }}
        />
      )}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="¿Eliminar vencimiento?"
        description={delTarget ? `${OBLIGACION_LABEL[delTarget.obligacion]} · ${delTarget.periodo} de ${delTarget.taxClient.razonSocial}` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={delMut.isPending}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      />
    </div>
  );
}

function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={cn(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
      active ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
    )}>
      {label}
      <span className={cn('text-[11px] px-1.5 rounded-full', active ? 'bg-white/25' : 'bg-slate-200 dark:bg-slate-700')}>{count}</span>
    </button>
  );
}

// ─── Modal: nuevo vencimiento con fecha automática por NIT ─────────────────────
type ClientePicker = { id: string; razonSocial: string; nit: string; dv: number };
function NuevoVencimientoModal({ onClose, clienteInicial }: { onClose: () => void; clienteInicial?: ClientePicker | null }) {
  const qc = useQueryClient();
  const [clienteSearch, setClienteSearch] = useState('');
  const [cliente, setCliente] = useState<ClientePicker | null>(clienteInicial ?? null);
  const [obligacion, setObligacion] = useState<Obligacion | ''>('');
  const [periodo, setPeriodo] = useState('');
  const [fecha, setFecha] = useState('');

  const { data: clientes = [] } = useQuery({
    queryKey: ['contable-clients-picker', clienteSearch],
    queryFn: () => api.get(`/contable/clients?limit=8&search=${encodeURIComponent(clienteSearch)}`).then((r) => r.data.data),
    enabled: !cliente,
  });

  // La joya: al elegir cliente + obligación, la API devuelve los periodos con la
  // fecha ya resuelta según el NIT. El usuario elige periodo y la fecha se llena
  // sola (pero puede editarla).
  const { data: periodos = [], isFetching: cargandoPeriodos } = useQuery<{ periodo: string; fecha: string }[]>({
    queryKey: ['contable-periodos', cliente?.id, obligacion],
    queryFn: () => api.get(`/contable/calendario/periodos?taxClientId=${cliente!.id}&obligacion=${obligacion}`).then((r) => r.data.data),
    enabled: !!cliente && !!obligacion,
  });
  const sinCalendario = !!cliente && !!obligacion && !cargandoPeriodos && periodos.length === 0;
  const conCalendario = !!cliente && !!obligacion && periodos.length > 0;

  // Registro manual de UN vencimiento (para ICA/PILA/exógena que no están en el
  // calendario). Las obligaciones con calendario se generan en lote.
  const saveMut = useMutation({
    mutationFn: () => api.post('/contable/vencimientos', { taxClientId: cliente!.id, obligacion, periodo, fecha }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-vencimientos'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      toast.success('Vencimiento registrado');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo registrar'),
  });

  // Generación en lote: agenda completa (sin obligación) o todos los periodos de
  // una obligación con calendario.
  const generarMut = useMutation({
    mutationFn: (body: { taxClientId: string; obligacion?: Obligacion }) =>
      api.post('/contable/vencimientos/generar', body).then((r) => r.data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['contable-vencimientos'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      toast.success(res?.message || 'Agenda generada');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo generar la agenda'),
  });

  const trabajando = saveMut.isPending || generarMut.isPending;

  function submitManual() {
    if (!cliente) return toast.error('Elige un cliente');
    if (!obligacion) return toast.error('Elige la obligación');
    if (!periodo.trim()) return toast.error('Indica el periodo');
    if (!fecha) return toast.error('Indica la fecha');
    saveMut.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Nuevo vencimiento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
          {/* Cliente */}
          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cliente</label>
            {cliente ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800">
                <span className="text-sm font-medium text-slate-900 dark:text-white">{cliente.razonSocial}</span>
                <button onClick={() => { setCliente(null); setObligacion(''); setPeriodo(''); setFecha(''); }} className="text-xs text-emerald-600 hover:underline">Cambiar</button>
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

          {/* Obligación */}
          {cliente && (
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Obligación</label>
              <select value={obligacion} onChange={(e) => { setObligacion(e.target.value as Obligacion); setPeriodo(''); setFecha(''); }} className={inputCls}>
                <option value="">Todas — agenda completa del cliente</option>
                {OBLIGACIONES.map((o) => <option key={o.codigo} value={o.codigo}>{o.label}</option>)}
              </select>
            </div>
          )}

          {/* Agenda completa: no se eligió obligación → se generan todas según calidades */}
          {cliente && !obligacion && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/15 p-4">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                <Sparkles size={14} /> Generar agenda completa
              </div>
              <p className="text-[12px] text-slate-600 dark:text-slate-400">
                Crea de una vez todos los vencimientos del cliente (todas las obligaciones de sus calidades × todos los periodos del año), con la fecha ya calculada según el NIT.
              </p>
              <p className="text-[11px] text-slate-400 mt-1.5">ICA, PILA e información exógena se agregan aparte (dependen del municipio/empleados).</p>
            </div>
          )}

          {/* Obligación con calendario → se listan TODOS los periodos y se registran en lote */}
          {cliente && obligacion && (
            cargandoPeriodos ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 size={14} className="animate-spin" /> Calculando fechas…</div>
            ) : conCalendario ? (
              <div>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 mb-1.5">
                  <Sparkles size={11} /> Se registrarán estos {periodos.length} periodos (fecha automática según el NIT)
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {periodos.map((p) => (
                    <div key={p.periodo} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{p.periodo}</span>
                      <span className="text-slate-500 dark:text-slate-400 tabular">{formatFecha(p.fecha)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Los que ya existan no se duplican.</p>
              </div>
            ) : sinCalendario ? (
              // ICA, PILA, exógena: no están en el calendario → periodo y fecha manual.
              <>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Periodo</label>
                  <input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Ej. Enero, 2026-05, Año 2025..." className={inputCls} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Fecha de vencimiento</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
                </div>
              </>
            ) : null
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">Cancelar</button>
          {sinCalendario ? (
            <button onClick={submitManual} disabled={trabajando} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Registrar
            </button>
          ) : conCalendario ? (
            <button onClick={() => generarMut.mutate({ taxClientId: cliente!.id, obligacion: obligacion as Obligacion })} disabled={trabajando} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {generarMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Registrar {periodos.length} periodos
            </button>
          ) : (
            <button onClick={() => cliente && generarMut.mutate({ taxClientId: cliente.id })} disabled={!cliente || trabajando} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {generarMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Generar agenda completa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
