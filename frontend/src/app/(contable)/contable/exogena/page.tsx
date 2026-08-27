'use client';

import { useState, useMemo } from 'react';
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
import { Plus, Search, Trash2, X, Loader2, FileSpreadsheet, Sparkles } from 'lucide-react';
import { GenerarPeriodosModal } from '@/components/contable/GenerarPeriodosModal';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';
const filterCls =
  'px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

interface VencExogena {
  id: string; periodo: string; fecha: string;
  estado: EstadoVencimiento;
  taxClient: { id: string; razonSocial: string; nit: string; dv: number };
}

export default function ExogenaPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fSituacion, setFSituacion] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<VencExogena | null>(null);

  // Solo exógena: el backend filtra por obligación (listVencimientos acepta ?obligacion).
  const { data: items = [], isLoading } = useQuery<VencExogena[]>({
    queryKey: ['contable-exogena', search],
    queryFn: () =>
      api.get(`/contable/vencimientos?obligacion=exogena&search=${encodeURIComponent(search)}`).then((r) => r.data.data),
  });

  // Estado (dato) y Situación (por vencer/vencida, calculada de la fecha) se
  // filtran en el cliente sobre lo que ya trajo el backend.
  const visibles = useMemo(() => items.filter((v) => {
    if (fEstado && estadoManual(v.estado) !== fEstado) return false;
    if (fSituacion) {
      const u = urgenciaVencimiento(v.fecha, v.estado);
      if (fSituacion === 'vencida' && !(u && u.vencido)) return false;
      if (fSituacion === 'por_vencer' && !(u && !u.vencido)) return false;
    }
    return true;
  }), [items, fEstado, fSituacion]);

  const hayFiltros = !!(search.trim() || fEstado || fSituacion);
  const limpiarFiltros = () => { setSearch(''); setFEstado(''); setFSituacion(''); };

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['contable-exogena'] });
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
        <FileSpreadsheet size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Información exógena (formatos 1001, 1005, 1007…). La fecha límite se calcula sola según los
          dos últimos dígitos del NIT — aplica igual a personas jurídicas y naturales.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/15 px-4 py-2.5 text-[12px] text-amber-700 dark:text-amber-300">
        Los registros marcados como Presentada, Pagada o No aplica se borran automáticamente 2 meses después de su fecha de vencimiento. Los pendientes se conservan.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente o identificación..." className={cn(inputCls, 'pl-9')} />
        </div>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={filterCls}>
          <option value="">Todo estado</option>
          {ESTADOS_MANUALES.map((s) => <option key={s.codigo} value={s.codigo}>{s.label}</option>)}
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
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Generar exógena
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Cliente</th>
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
                  <tr key={i}>{[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : visibles.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <FileSpreadsheet size={30} className="mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm">
                    {hayFiltros ? 'No hay exógena que coincida con los filtros.' : 'Aún no has generado exógena. Usa “Generar exógena”.'}
                  </p>
                </td></tr>
              ) : (
                visibles.map((v) => (
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

      {modalOpen && <GenerarExogenaModal onClose={() => setModalOpen(false)} onDone={invalidar} />}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="¿Eliminar esta exógena?"
        description={delTarget ? `${delTarget.periodo} de ${delTarget.taxClient.razonSocial}` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={delMut.isPending}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      />
    </div>
  );
}

// ─── Modal: generar la exógena de un cliente (un vencimiento anual) ────────────
type ClientePicker = { id: string; razonSocial: string; nit: string; dv: number };

// Usa el modal reutilizable con SELECCIÓN de periodos.
function GenerarExogenaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  return (
    <GenerarPeriodosModal
      obligacion="exogena"
      titulo="Generar exógena"
      nota="fecha automática según el documento"
      botonLabel="exógena"
      onClose={onClose}
      onDone={onDone}
    />
  );
}
