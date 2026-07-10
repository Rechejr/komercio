'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

const inputCls = 'px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

function DifferenceBadge({ status, difference }: { status: string; difference: number | null }) {
  if (status === 'OPEN' || difference === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Clock size={10} /> Turno abierto
      </span>
    );
  }
  const diff = Number(difference);
  if (Math.abs(diff) < 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
        <CheckCircle2 size={10} /> Cuadrado
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400">
        <AlertTriangle size={10} /> Faltante {formatCurrency(Math.abs(diff))}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
      <AlertTriangle size={10} /> Sobrante {formatCurrency(diff)}
    </span>
  );
}

export function HistorialTurnos() {
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['users-filter'],
    queryFn: () => api.get('/users?limit=50').then((r) => r.data.data),
  });
  const employees: any[] = usersData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['cash-register-history', page, userId, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (userId) params.set('userId', userId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return api.get(`/cash-register/history?${params}`).then((r) => r.data);
    },
  });

  const registers: any[] = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center gap-2">
        <select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">Todos los empleados</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className={inputCls} aria-label="Desde" />
        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className={inputCls} aria-label="Hasta" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/[0.06]">
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Bodega</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Vendedor</th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Apertura</th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Cierre</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Esperado</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Contado</th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}>
                  {[...Array(7)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : registers.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-[13px] text-slate-400">No hay turnos registrados</td>
              </tr>
            ) : registers.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 text-[13px] text-slate-700 dark:text-slate-300">{r.branch?.name}</td>
                <td className="px-4 py-3 text-[13px] font-medium text-slate-800 dark:text-white">{r.openedByName}</td>
                <td className="hidden sm:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">{formatDateTime(r.openedAt)}</td>
                <td className="hidden sm:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                  {r.closedAt ? formatDateTime(r.closedAt) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-[13px] tabular-nums text-slate-600 dark:text-slate-400">
                  {r.expectedAmount != null ? formatCurrency(r.expectedAmount) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-[13px] tabular-nums text-slate-600 dark:text-slate-400">
                  {r.closingAmount != null ? formatCurrency(r.closingAmount) : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <DifferenceBadge status={r.status} difference={r.difference != null ? Number(r.difference) : null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[13px] text-slate-500">
          <span>Página {pagination.page} de {pagination.totalPages}</span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <ChevronLeft size={14} />
            </button>
            <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
