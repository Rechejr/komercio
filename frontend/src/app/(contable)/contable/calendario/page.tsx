'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  OBLIGACION_LABEL, estadoManual, diasHastaVencimiento, formatNit, formatFecha,
  type EstadoVencimiento, type Obligacion,
} from '@/lib/contable';
import { ChevronLeft, ChevronRight, CalendarDays, X } from 'lucide-react';

interface Venc {
  id: string; obligacion: Obligacion; periodo: string; fecha: string; estado: EstadoVencimiento;
  taxClient: { id: string; razonSocial: string; nit: string; dv: number };
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const pad = (n: number) => String(n).padStart(2, '0');

// Clave de día por las partes UTC de la fecha (los vencimientos se guardan como
// @db.Date = medianoche UTC; usar UTC evita correr el día por zona horaria).
const keyFromVenc = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const keyFromCell = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function resuelto(v: Venc) {
  const e = estadoManual(v.estado);
  return e === 'presentada' || e === 'pagada';
}
function chipColor(v: Venc) {
  if (resuelto(v)) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  const dias = diasHastaVencimiento(v.fecha);
  if (dias < 0) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  if (dias <= 3) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

export default function CalendarioPage() {
  const hoy = new Date();
  const [cursor, setCursor] = useState({ y: hoy.getFullYear(), m: hoy.getMonth() });
  const [dayDetail, setDayDetail] = useState<{ label: string; items: Venc[] } | null>(null);

  const { data: vencs = [], isLoading } = useQuery<Venc[]>({
    queryKey: ['contable-calendario'],
    queryFn: () => api.get('/contable/vencimientos').then((r) => r.data.data),
  });

  const porDia = useMemo(() => {
    const map = new Map<string, Venc[]>();
    for (const v of vencs) {
      const k = keyFromVenc(v.fecha);
      const arr = map.get(k) ?? [];
      arr.push(v);
      map.set(k, arr);
    }
    return map;
  }, [vencs]);

  // Cuadrícula de 6 semanas (42 celdas), semana de lunes a domingo.
  const celdas = useMemo(() => {
    const primero = new Date(cursor.y, cursor.m, 1);
    const inicioSemana = (primero.getDay() + 6) % 7; // 0=lunes
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) out.push(new Date(cursor.y, cursor.m, 1 - inicioSemana + i));
    return out;
  }, [cursor]);

  const hoyKey = keyFromCell(hoy);
  const tituloMes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date(cursor.y, cursor.m, 1));
  const mover = (delta: number) => setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-lg font-bold capitalize text-slate-900 dark:text-white">{tituloMes}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => mover(-1)} aria-label="Mes anterior" className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition"><ChevronLeft size={16} /></button>
          <button onClick={() => setCursor({ y: hoy.getFullYear(), m: hoy.getMonth() })} className="px-3 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">Hoy</button>
          <button onClick={() => mover(1)} aria-label="Mes siguiente" className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition"><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Vencido</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Próximo (≤3 días)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600" /> Más adelante</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Presentado / pagado</span>
      </div>

      {/* Cuadrícula */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-slate-800/50">
          {DIAS.map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {celdas.map((fecha, i) => {
            const k = keyFromCell(fecha);
            const items = porDia.get(k) ?? [];
            const inMonth = fecha.getMonth() === cursor.m;
            const esHoy = k === hoyKey;
            return (
              <button
                key={i}
                type="button"
                onClick={() => items.length && setDayDetail({ label: formatFecha(fecha.toISOString()), items })}
                className={cn(
                  'min-h-[92px] border-b border-r border-slate-100 dark:border-white/[0.06] p-1.5 text-left align-top transition',
                  (i + 1) % 7 === 0 && 'border-r-0',
                  !inMonth && 'bg-slate-50/50 dark:bg-slate-900/40',
                  items.length ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer' : 'cursor-default',
                )}
              >
                <div className={cn(
                  'inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-semibold mb-1',
                  esHoy ? 'bg-emerald-600 text-white' : inMonth ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600',
                )}>{fecha.getDate()}</div>
                <div className="space-y-0.5">
                  {items.slice(0, 3).map((v) => (
                    <div key={v.id} className={cn('truncate rounded px-1 py-0.5 text-[10px] font-medium', chipColor(v))} title={`${v.taxClient.razonSocial} · ${OBLIGACION_LABEL[v.obligacion]}`}>
                      {v.taxClient.razonSocial}
                    </div>
                  ))}
                  {items.length > 3 && <div className="px-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">+{items.length - 3} más</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && <p className="text-center text-sm text-slate-400 py-4">Cargando vencimientos…</p>}
      {!isLoading && vencs.length === 0 && <p className="text-center text-sm text-slate-400 py-4">Aún no hay vencimientos registrados.</p>}

      {/* Detalle del día */}
      {dayDetail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setDayDetail(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">{dayDetail.label} · {dayDetail.items.length} vencimiento{dayDetail.items.length === 1 ? '' : 's'}</h2>
              <button onClick={() => setDayDetail(null)} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
            </div>
            <div className="px-4 py-3 overflow-y-auto space-y-1.5">
              {dayDetail.items.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-white/[0.06]">
                  <span className={cn('w-2.5 h-2.5 rounded-full flex-none', chipColor(v).split(' ')[0])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">{v.taxClient.razonSocial}</p>
                    <p className="text-[11px] text-slate-400 tabular">{formatNit(v.taxClient.nit, v.taxClient.dv)}</p>
                  </div>
                  <div className="text-right flex-none">
                    <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{OBLIGACION_LABEL[v.obligacion]}</p>
                    <p className="text-[11px] text-slate-400">{v.periodo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
