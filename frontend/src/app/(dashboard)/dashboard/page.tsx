'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime, formatChartDate, statusColor, statusLabel } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ShoppingCart, CreditCard, TrendingUp, AlertTriangle,
  ArrowUpRight, Info, Package,
} from 'lucide-react';
import Link from 'next/link';
import { Tooltip as InfoTooltip } from '@/components/ui/Tooltip';
import { CountUp } from '@/components/ui/CountUp';

// ── Stat card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  value: React.ReactNode;
  sub: string;
  icon: React.ElementType;
  accent: string;
  iconBg: string;
  tooltip?: string;
}

function StatCard({ title, value, sub, icon: Icon, accent, iconBg, tooltip }: StatCardProps) {
  return (
    <div className="card p-5 flex items-start gap-4 card-hover">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon size={18} className={accent} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-1">
          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</p>
          {tooltip && (
            <InfoTooltip content={tooltip} side="top">
              <Info size={11} className="text-slate-300 dark:text-slate-600 cursor-help flex-shrink-0" />
            </InfoTooltip>
          )}
        </div>
        <p className="text-[22px] font-bold text-slate-900 dark:text-white tabular leading-none">{value}</p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">{sub}</p>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="card p-5 flex gap-4">
      <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-6 w-32 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
    </div>
  );
}

// ── Custom tooltip for chart ──────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-modal px-3 py-2.5">
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className="text-[14px] font-bold text-slate-900 dark:text-white">
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: summaryData, isLoading: loadingSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get('/dashboard/summary').then((r) => r.data.data),
    refetchInterval: 60000,
  });

  const { data: rawChart } = useQuery({
    queryKey: ['dashboard-chart'],
    queryFn: () => api.get('/dashboard/sales-chart?period=30d').then((r) => r.data.data),
  });

  // Fill gaps so every day in the last 30 days has a data point (0 if no sales)
  const chartData = (() => {
    if (!rawChart) return [];
    const byDay = new Map(rawChart.map((d: any) => [d.date, d]));
    const days: any[] = [];
    const end = new Date();
    const cur = new Date();
    cur.setDate(cur.getDate() - 29);
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10);
      days.push(byDay.get(key) ?? { date: key, total: 0, count: 0 });
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  })();

  const s = summaryData;

  // Top products max for relative bar
  const maxQty: number = s?.topProducts?.[0]?._sum?.quantity ?? 1;

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingSummary ? (
          [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Ventas hoy"
              value={<CountUp value={s?.sales?.today?.total || 0} />}
              sub={`${s?.sales?.today?.count || 0} transacciones`}
              icon={ShoppingCart}
              accent="text-emerald-600 dark:text-emerald-400"
              iconBg="bg-emerald-50 dark:bg-emerald-500/10"
            />
            <StatCard
              title="Ventas del mes"
              value={<CountUp value={s?.sales?.month?.total || 0} />}
              sub={`${s?.sales?.month?.count || 0} ventas`}
              icon={TrendingUp}
              accent="text-emerald-600 dark:text-emerald-400"
              iconBg="bg-emerald-50 dark:bg-emerald-500/10"
            />
            <StatCard
              title="Stock bajo"
              value={<CountUp value={s?.inventory?.lowStock || 0} bare />}
              sub={`de ${s?.inventory?.totalProducts || 0} productos`}
              icon={AlertTriangle}
              accent="text-amber-600 dark:text-amber-400"
              iconBg="bg-amber-50 dark:bg-amber-500/10"
              tooltip="Productos cuya cantidad disponible llegó al mínimo configurado."
            />
            <StatCard
              title="Créditos pendientes"
              value={<CountUp value={s?.credits?.totalBalance || 0} />}
              sub={`${s?.credits?.count || 0} clientes`}
              icon={CreditCard}
              accent="text-red-600 dark:text-red-400"
              iconBg="bg-red-50 dark:bg-red-500/10"
            />
          </>
        )}
      </div>

      {/* ── Chart + Top products ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Sales chart */}
        <div className="card lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white">Ventas últimos 30 días</h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Ingresos diarios acumulados</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={chartData || []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(148,163,184,0.12)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatChartDate}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={40}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(16,185,129,0.2)', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#10b981"
                fill="url(#salesGrad)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top products */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Package size={14} className="text-slate-400" />
            <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white">Más vendidos</h3>
          </div>
          {s?.topProducts?.length > 0 ? (
            <div className="space-y-3.5">
              {s.topProducts.slice(0, 5).map((p: any, i: number) => {
                const pct = Math.round(((p._sum?.quantity ?? 0) / maxQty) * 100);
                return (
                  <div key={p.productId}>
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 w-4 tabular">{i + 1}</span>
                      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 flex-1 truncate">
                        {p.product?.name || 'N/A'}
                      </p>
                      <span className="text-[12px] text-slate-500 dark:text-slate-400 tabular flex-shrink-0">
                        {p._sum?.quantity} uds
                      </span>
                    </div>
                    <div className="ml-6 h-1 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-600">
              <Package size={28} strokeWidth={1.5} className="mb-2" />
              <p className="text-[13px]">Sin datos aún</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent sales table ──────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white">Últimas ventas</h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Transacciones recientes</p>
          </div>
          <Link
            href="/ventas?status=CANCELLED"
            className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
          >
            Ver anuladas <ArrowUpRight size={13} />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                {['Factura', 'Cliente', 'Vendedor', 'Total', 'Estado', 'Fecha'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${i === 3 ? 'text-right' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {s?.recentSales?.map((sale: any) => (
                <tr key={sale.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 font-mono text-[12px] text-emerald-600 dark:text-emerald-400">
                    {sale.invoiceNumber}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-slate-700 dark:text-slate-300">
                    {sale.customer?.name || <span className="text-slate-400">Mostrador</span>}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {sale.user?.name}
                  </td>
                  <td className="px-5 py-3 text-right text-[13px] font-semibold text-slate-900 dark:text-white tabular">
                    {formatCurrency(sale.total)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`badge ${statusColor(sale.status)}`}>
                      {statusLabel(sale.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-slate-400 dark:text-slate-500 tabular">
                    {formatDateTime(sale.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(!s?.recentSales || s.recentSales.length === 0) && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-600">
              <ShoppingCart size={28} strokeWidth={1.5} className="mb-2" />
              <p className="text-[13px]">No hay ventas recientes</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}