'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Portal } from '@/components/ui/Portal';
import {
  OBLIGACIONES, OBLIGACION_LABEL, ESTADOS_MANUALES, ESTADO_COLOR, estadoManual,
  urgenciaVencimiento, diasHastaVencimiento, formatNit, formatFecha,
  type Obligacion, type EstadoVencimiento,
} from '@/lib/contable';
import { Plus, Search, Trash2, X, Loader2, CalendarClock, Sparkles, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

type SortKey = 'cliente' | 'obligacion' | 'periodo' | 'fecha' | 'situacion' | 'estado';
const ESTADO_ORDEN: Record<EstadoVencimiento, number> = {
  pendiente: 0, en_proceso: 1, presentada: 2, pagada: 3, vencida: 0,
};

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
  // Orden y filtros de la tabla (todo sobre los datos ya cargados).
  const [sortBy, setSortBy] = useState<SortKey>('fecha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoVencimiento>('todos');
  const [filtroSituacion, setFiltroSituacion] = useState<'todas' | 'vencidos' | 'por_vencer' | 'resueltos'>('todas');

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
  }

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

  const obligacionesConDatos = OBLIGACIONES.filter((o) => conteos[o.codigo]);

  // Filtrado (obligación por pestaña + estado + situación) y ordenamiento por la
  // columna elegida. Todo en memoria sobre la lista ya cargada.
  const visibles = useMemo(() => {
    const resuelto = (v: Vencimiento) => estadoManual(v.estado) === 'presentada' || estadoManual(v.estado) === 'pagada';

    let arr = tab === 'todas' ? vencimientos : vencimientos.filter((v) => v.obligacion === tab);

    if (filtroEstado !== 'todos') arr = arr.filter((v) => estadoManual(v.estado) === filtroEstado);

    if (filtroSituacion !== 'todas') {
      arr = arr.filter((v) => {
        if (filtroSituacion === 'resueltos') return resuelto(v);
        if (resuelto(v)) return false;
        const dias = diasHastaVencimiento(v.fecha);
        return filtroSituacion === 'vencidos' ? dias <= 0 : dias > 0;
      });
    }

    const val = (v: Vencimiento): string | number => {
      switch (sortBy) {
        case 'cliente':    return v.taxClient.razonSocial.toLowerCase();
        case 'obligacion': return OBLIGACION_LABEL[v.obligacion].toLowerCase();
        case 'periodo':    return v.periodo.toLowerCase();
        case 'fecha':      return v.fecha;
        // Situación: los resueltos van al final; el resto por días a vencer.
        case 'situacion':  return resuelto(v) ? Number.MAX_SAFE_INTEGER : diasHastaVencimiento(v.fecha);
        case 'estado':     return ESTADO_ORDEN[estadoManual(v.estado)];
      }
    };

    return [...arr].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'es');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [vencimientos, tab, filtroEstado, filtroSituacion, sortBy, sortDir]);

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

      {/* Filtros por estado y situación (la obligación se filtra con las pestañas) */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as any)}
          className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="todos">Estado: todos</option>
          {ESTADOS_MANUALES.map((s) => <option key={s.codigo} value={s.codigo}>{s.label}</option>)}
        </select>
        <select
          value={filtroSituacion}
          onChange={(e) => setFiltroSituacion(e.target.value as any)}
          className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="todas">Situación: todas</option>
          <option value="vencidos">Vencidos / vence hoy</option>
          <option value="por_vencer">Por vencer</option>
          <option value="resueltos">Resueltos (presentada/pagada)</option>
        </select>
        {(filtroEstado !== 'todos' || filtroSituacion !== 'todas') && (
          <button onClick={() => { setFiltroEstado('todos'); setFiltroSituacion('todas'); }} className="text-xs text-emerald-600 hover:underline">Limpiar filtros</button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{visibles.length} resultado{visibles.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Th label="Cliente"    sortKey="cliente"    sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Obligación" sortKey="obligacion" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Periodo"    sortKey="periodo"    sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Vence"      sortKey="fecha"      sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Situación"  sortKey="situacion"  sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Estado"     sortKey="estado"     sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
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
                  <p className="text-sm">
                    {tab !== 'todas' || filtroEstado !== 'todos' || filtroSituacion !== 'todas'
                      ? 'No hay vencimientos que coincidan con los filtros.'
                      : 'No hay vencimientos registrados.'}
                  </p>
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

// Encabezado de columna ordenable: clic para ordenar, la flecha indica el sentido.
function Th({ label, sortKey, sortBy, sortDir, onSort }: {
  label: string; sortKey: SortKey; sortBy: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
}) {
  const active = sortBy === sortKey;
  return (
    <th className="px-4 py-3 font-semibold">
      <button
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 uppercase tracking-wide transition-colors', active ? 'text-slate-700 dark:text-slate-200' : 'hover:text-slate-700 dark:hover:text-slate-200')}
      >
        {label}
        {active
          ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
          : <ChevronsUpDown size={12} className="opacity-30" />}
      </button>
    </th>
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

  // Registro manual de UN vencimiento (para ICA/exógena que no están en el
  // calendario). Las obligaciones con calendario (incl. PILA) se generan en lote.
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
    <Portal>
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
    </Portal>
  );
}
