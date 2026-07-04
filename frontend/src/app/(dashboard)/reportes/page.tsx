'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatNumber, formatChartDate } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Users } from 'lucide-react';

function fillDailySeries(chart: any[], startDate: Date, endDate: Date) {
  const byDay = new Map(chart.map((c: any) => [c.period, c]));
  const days: any[] = [];
  const cur = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    days.push(byDay.get(key) || { period: key, grossRevenue: 0, netRevenue: 0, count: 0, taxes: 0, discounts: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

const PERIODS = [
  { value: '7d',   label: '7 días'  },
  { value: '30d',  label: '30 días' },
  { value: '90d',  label: '90 días' },
  { value: '365d', label: '1 año'   },
];

const TABS = [
  { id: 'sales',     label: 'Ventas',     icon: ShoppingCart },
  { id: 'products',  label: 'Productos',  icon: Package      },
  { id: 'customers', label: 'Clientes',   icon: Users        },
  { id: 'profit',    label: 'Utilidades', icon: TrendingUp   },
] as const;

export default function ReportesPage() {
  const [period, setPeriod] = useState('30d');
  const [tab, setTab]   = useState<'sales' | 'products' | 'customers' | 'profit'>('sales');

  const getDateRange = () => {
    const end   = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if      (period === '7d')   start.setDate(start.getDate() - 6);
    else if (period === '30d')  start.setDate(start.getDate() - 29);
    else if (period === '90d')  start.setDate(start.getDate() - 89);
    else                        start.setDate(start.getDate() - 364);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  };

  const dates = getDateRange();
  const dateKey = dates.startDate.slice(0, 10);

  const { data: salesData    } = useQuery({ queryKey: ['report-sales',     period, dateKey], queryFn: () => api.get(`/reports/sales?${new URLSearchParams(dates)}`).then((r) => r.data.data) });
  const { data: topProducts  } = useQuery({ queryKey: ['report-products',  period, dateKey], queryFn: () => api.get(`/reports/top-products?${new URLSearchParams(dates)}&limit=10`).then((r) => r.data.data) });
  const { data: topCustomers } = useQuery({ queryKey: ['report-customers', period, dateKey], queryFn: () => api.get(`/reports/top-customers?${new URLSearchParams(dates)}&limit=10`).then((r) => r.data.data) });
  const { data: profitData   } = useQuery({ queryKey: ['report-profit',    period, dateKey], queryFn: () => api.get(`/reports/profit?${new URLSearchParams(dates)}`).then((r) => r.data.data) });

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── Selector de período ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition ${
              period === p.value
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                : 'card text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500/40'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      {profitData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Ingresos netos',   value: formatCurrency(profitData.revenue),     icon: DollarSign,  bg: 'bg-blue-50 dark:bg-blue-500/10',   ic: 'text-blue-600 dark:text-blue-400'   },
            { label: 'Costo mercancía', value: formatCurrency(profitData.cogs),        icon: TrendingDown, bg: 'bg-red-50 dark:bg-red-500/10',     ic: 'text-red-600 dark:text-red-400'     },
            { label: 'Utilidad bruta',  value: formatCurrency(profitData.grossProfit), icon: TrendingUp,   bg: 'bg-emerald-50 dark:bg-emerald-500/10', ic: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Utilidad neta',   value: formatCurrency(profitData.netProfit),   icon: DollarSign,  bg: 'bg-indigo-50 dark:bg-indigo-500/10', ic: 'text-indigo-600 dark:text-indigo-400' },
          ].map((k) => (
            <div key={k.label} className="card p-4 flex gap-3 items-center">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${k.bg}`}>
                <k.icon size={16} className={k.ic} />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">{k.label}</p>
                <p className="text-[14px] font-bold text-slate-800 dark:text-white tabular-nums">{k.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 dark:border-white/[0.08]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Ventas ───────────────────────────────────────────────────── */}
      {tab === 'sales' && salesData && (
        <div className="card p-5">
          <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white mb-4">Ventas en el período</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={fillDailySeries(salesData.chart || [], new Date(dates.startDate), new Date(dates.endDate))}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-100 dark:text-white/[0.06]" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} tickFormatter={formatChartDate} stroke="currentColor" className="text-slate-400" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="currentColor" className="text-slate-400" />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="grossRevenue" stroke="#3b82f6" fill="url(#revenueGrad)" strokeWidth={2} name="Ingresos" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
            {[
              { label: 'Total ingresos',  value: formatCurrency(salesData.totals?.grossRevenue || 0) },
              { label: 'Número de ventas', value: formatNumber(salesData.totals?.count || 0) },
              { label: 'Ticket promedio',  value: salesData.totals?.count > 0 ? formatCurrency(salesData.totals.grossRevenue / salesData.totals.count) : '$0' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-[11px] text-slate-400 dark:text-slate-500">{s.label}</p>
                <p className="text-[14px] font-bold text-slate-800 dark:text-white tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Productos ────────────────────────────────────────────────── */}
      {tab === 'products' && topProducts && (
        <div className="card p-5">
          <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white mb-4">Top 10 productos más vendidos</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topProducts.map((p: any) => ({ name: p.product?.name?.slice(0, 20) || 'N/A', ingresos: p.totalRevenue, unidades: p.totalQty }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-100 dark:text-white/[0.06]" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, name) => [name === 'ingresos' ? formatCurrency(v) : v, name]}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Legend />
              <Bar dataKey="ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Ingresos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tab: Clientes ─────────────────────────────────────────────────── */}
      {tab === 'customers' && topCustomers && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06]">
            <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white">Top 10 clientes</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">#</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Cliente</th>
                <th className="text-center px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Visitas</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total compras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {topCustomers.map((c: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 text-slate-400 font-mono text-[12px]">{i + 1}</td>
                  <td className="px-5 py-3 text-[13px] font-medium text-slate-800 dark:text-white">{c.customer?.name || 'Mostrador'}</td>
                  <td className="px-5 py-3 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">{c.visitCount}</td>
                  <td className="px-5 py-3 text-right text-[13px] font-bold text-blue-600 dark:text-blue-400 tabular-nums">{formatCurrency(c.totalPurchases)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Utilidades ───────────────────────────────────────────────── */}
      {tab === 'profit' && profitData && (
        <div className="card p-5">
          <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white mb-5">Análisis de utilidades</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              {[
                { label: 'Ingresos totales',      value: profitData.revenue,     dot: 'bg-blue-500'    },
                { label: 'Costo de ventas (CMV)', value: profitData.cogs,        dot: 'bg-red-400'     },
                { label: 'Utilidad bruta',        value: profitData.grossProfit, dot: 'bg-emerald-500' },
                { label: 'Gastos operacionales',  value: profitData.expenses,    dot: 'bg-amber-500'   },
                { label: 'Utilidad neta',         value: profitData.netProfit,   dot: 'bg-indigo-500'  },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${row.dot} flex-shrink-0`} />
                  <span className="flex-1 text-[13px] text-slate-600 dark:text-slate-300">{row.label}</span>
                  <span className={`text-[13px] font-bold tabular-nums ${row.value < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
                    {formatCurrency(row.value)}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500 dark:text-emerald-400 mb-1">Margen bruto</p>
                <p className="text-[32px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{profitData.grossMargin}%</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400 mb-1">Margen neto</p>
                <p className={`text-[32px] font-bold tabular-nums ${parseFloat(profitData.netMargin) >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}`}>
                  {profitData.netMargin}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
