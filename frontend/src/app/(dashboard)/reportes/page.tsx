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

// Fills gaps in the daily series with zero-value days so the chart line
// reflects reality instead of smoothly interpolating across days with no sales.
function fillDailySeries(chart: any[], startDate: Date, endDate: Date) {
  const byDay = new Map(chart.map((c: any) => [c.period, c]));
  const days: any[] = [];
  const cur = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    days.push(byDay.get(key) || { period: key, revenue: 0, count: 0, taxes: 0, discounts: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export default function ReportesPage() {
  const [period, setPeriod] = useState('30d');
  const [tab, setTab] = useState<'sales' | 'products' | 'customers' | 'profit'>('sales');

  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    if (period === '7d') start.setDate(start.getDate() - 7);
    else if (period === '30d') start.setDate(start.getDate() - 30);
    else if (period === '90d') start.setDate(start.getDate() - 90);
    else start.setFullYear(start.getFullYear() - 1);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  };

  const dates = getDateRange();

  const { data: salesData } = useQuery({
    queryKey: ['report-sales', period],
    queryFn: () => api.get(`/reports/sales?${new URLSearchParams(dates)}`).then((r) => r.data.data),
  });

  const { data: topProducts } = useQuery({
    queryKey: ['report-products', period],
    queryFn: () => api.get(`/reports/top-products?${new URLSearchParams(dates)}&limit=10`).then((r) => r.data.data),
  });

  const { data: topCustomers } = useQuery({
    queryKey: ['report-customers', period],
    queryFn: () => api.get(`/reports/top-customers?${new URLSearchParams(dates)}&limit=10`).then((r) => r.data.data),
  });

  const { data: profitData } = useQuery({
    queryKey: ['report-profit', period],
    queryFn: () => api.get(`/reports/profit?${new URLSearchParams(dates)}`).then((r) => r.data.data),
  });

  const periods = [
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
    { value: '365d', label: '1 año' },
  ];

  const tabs = [
    { id: 'sales', label: 'Ventas', icon: ShoppingCart },
    { id: 'products', label: 'Productos', icon: Package },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'profit', label: 'Utilidades', icon: TrendingUp },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex flex-wrap items-center gap-2">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              period === p.value
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      {profitData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Ingresos', value: formatCurrency(profitData.revenue), icon: DollarSign, color: 'text-blue-600 bg-blue-50' },
            { label: 'Costo mercancía', value: formatCurrency(profitData.cogs), icon: TrendingDown, color: 'text-red-600 bg-red-50' },
            { label: 'Utilidad bruta', value: formatCurrency(profitData.grossProfit), icon: TrendingUp, color: 'text-green-600 bg-green-50' },
            { label: 'Utilidad neta', value: formatCurrency(profitData.netProfit), icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
          ].map((k) => (
            <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 flex gap-3 items-center">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${k.color}`}>
                <k.icon size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="font-bold text-gray-800 dark:text-white text-sm">{k.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'sales' && salesData && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Ventas en el período</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={fillDailySeries(salesData.chart || [], new Date(dates.startDate), new Date(dates.endDate))}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} tickFormatter={formatChartDate} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revenueGrad)" strokeWidth={2} name="Ingresos" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="text-center">
              <p className="text-xs text-gray-400">Total ingresos</p>
              <p className="font-bold text-gray-800 dark:text-white">{formatCurrency(salesData.totals?.revenue || 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Número de ventas</p>
              <p className="font-bold text-gray-800 dark:text-white">{formatNumber(salesData.totals?.count || 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Ticket promedio</p>
              <p className="font-bold text-gray-800 dark:text-white">
                {salesData.totals?.count > 0 ? formatCurrency(salesData.totals.revenue / salesData.totals.count) : '$0'}
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'products' && topProducts && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Top 10 productos más vendidos</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topProducts.map((p: any) => ({ name: p.product?.name?.slice(0, 20) || 'N/A', ingresos: p.totalRevenue, unidades: p.totalQty }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, name) => [name === 'ingresos' ? formatCurrency(v) : v, name]} />
              <Legend />
              <Bar dataKey="ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Ingresos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === 'customers' && topCustomers && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-800 dark:text-white">Top 10 clientes</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-5 py-3">#</th>
                <th className="text-left px-5 py-3">Cliente</th>
                <th className="text-center px-5 py-3">Visitas</th>
                <th className="text-right px-5 py-3">Total compras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {topCustomers.map((c: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-gray-800 dark:text-white">{c.customer?.name || 'Mostrador'}</td>
                  <td className="px-5 py-3 text-center text-gray-500">{c.visitCount}</td>
                  <td className="px-5 py-3 text-right font-bold text-blue-600">{formatCurrency(c.totalPurchases)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'profit' && profitData && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Análisis de utilidades</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              {[
                { label: 'Ingresos totales', value: profitData.revenue, color: 'bg-blue-500' },
                { label: 'Costo de ventas (CMV)', value: profitData.cogs, color: 'bg-red-400' },
                { label: 'Utilidad bruta', value: profitData.grossProfit, color: 'bg-green-500' },
                { label: 'Gastos operacionales', value: profitData.expenses, color: 'bg-yellow-500' },
                { label: 'Utilidad neta', value: profitData.netProfit, color: 'bg-purple-500' },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${row.color} flex-shrink-0`} />
                  <span className="flex-1 text-sm text-gray-600 dark:text-gray-300">{row.label}</span>
                  <span className={`font-bold text-sm ${row.value < 0 ? 'text-red-600' : 'text-gray-800 dark:text-white'}`}>
                    {formatCurrency(row.value)}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Margen bruto</p>
                <p className="text-3xl font-bold text-green-600">{profitData.grossMargin}%</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Margen neto</p>
                <p className={`text-3xl font-bold ${parseFloat(profitData.netMargin) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{profitData.netMargin}%</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
