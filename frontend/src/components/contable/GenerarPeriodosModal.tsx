'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatNit, formatFecha } from '@/lib/contable';
import { Portal } from '@/components/ui/Portal';
import toast from 'react-hot-toast';
import { X, Loader2, Sparkles, CheckSquare, Square } from 'lucide-react';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

type ClientePicker = { id: string; razonSocial: string; nit: string; dv: number };
type Periodo = { periodo: string; fecha: string };

// Hoy en Colombia como YYYY-MM-DD, para comparar contra las fechas (@db.Date, que
// llegan como ISO UTC). Comparar strings ISO evita líos de zona horaria.
function hoyBogota(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

// Modal reutilizable para generar la agenda de una obligación (nómina, PILA,
// exógena…) con SELECCIÓN de periodos: por defecto marca solo los que aún no han
// vencido, para no traer los meses que ya pasaron. El contador puede marcar o
// desmarcar cualquiera.
export function GenerarPeriodosModal({
  obligacion, titulo, nota, botonLabel, onClose, onDone,
}: {
  obligacion: string; titulo: string; nota?: string; botonLabel?: string;
  onClose: () => void; onDone: () => void;
}) {
  const [clienteSearch, setClienteSearch] = useState('');
  const [cliente, setCliente] = useState<ClientePicker | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const { data: clientes = [] } = useQuery({
    queryKey: ['contable-clients-picker', clienteSearch],
    queryFn: () => api.get(`/contable/clients?limit=8&search=${encodeURIComponent(clienteSearch)}`).then((r) => r.data.data),
    enabled: !cliente,
  });

  const { data: periodos = [], isFetching: cargando } = useQuery<Periodo[]>({
    queryKey: ['contable-periodos', cliente?.id, obligacion],
    queryFn: () => api.get(`/contable/calendario/periodos?taxClientId=${cliente!.id}&obligacion=${obligacion}`).then((r) => r.data.data),
    enabled: !!cliente,
  });

  const hoy = useMemo(() => hoyBogota(), []);
  const esPasado = (p: Periodo) => p.fecha.slice(0, 10) < hoy;

  // Al cargar los periodos, marca por defecto solo los que NO han vencido.
  useEffect(() => {
    setSel(new Set(periodos.filter((p) => !esPasado(p)).map((p) => p.periodo)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodos]);

  const toggle = (periodo: string) => setSel((prev) => {
    const n = new Set(prev);
    if (n.has(periodo)) n.delete(periodo); else n.add(periodo);
    return n;
  });
  const todos = () => setSel(new Set(periodos.map((p) => p.periodo)));
  const ninguno = () => setSel(new Set());
  const todosMarcados = periodos.length > 0 && sel.size === periodos.length;

  const generarMut = useMutation({
    mutationFn: () => api.post('/contable/vencimientos/generar', {
      taxClientId: cliente!.id, obligacion, periodos: Array.from(sel),
    }).then((r) => r.data),
    onSuccess: (res: any) => { onDone(); toast.success(res?.message || 'Agenda generada'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo generar'),
  });

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{titulo}</h2>
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
              ) : periodos.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">Este cliente no tiene periodos de calendario para generar.</p>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <Sparkles size={11} /> Elige los periodos a registrar{nota ? ` (${nota})` : ''}
                    </div>
                    <button
                      onClick={todosMarcados ? ninguno : todos}
                      className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      {todosMarcados ? <Square size={12} /> : <CheckSquare size={12} />}
                      {todosMarcados ? 'Ninguno' : 'Todos'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto">
                    {periodos.map((p) => {
                      const marcado = sel.has(p.periodo);
                      const pasado = esPasado(p);
                      return (
                        <button
                          key={p.periodo}
                          onClick={() => toggle(p.periodo)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition ${
                            marcado
                              ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/[0.08]'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {marcado ? <CheckSquare size={16} className="text-emerald-600 dark:text-emerald-400 flex-none" /> : <Square size={16} className="text-slate-300 dark:text-slate-600 flex-none" />}
                          <span className={`flex-1 ${marcado ? 'text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                            {p.periodo}
                            {pasado && <span className="ml-2 text-[10px] text-amber-500">ya venció</span>}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 tabular text-[13px]">{formatFecha(p.fecha)}</span>
                        </button>
                      );
                    })}
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
              disabled={!cliente || cargando || sel.size === 0 || generarMut.isPending}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {generarMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {cliente && !cargando ? `Registrar ${sel.size} ${sel.size === 1 ? 'periodo' : 'periodos'}` : `Registrar ${botonLabel || 'agenda'}`}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
