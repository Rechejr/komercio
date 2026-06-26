'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime, statusColor, statusLabel } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ShoppingCart, CreditCard,
  TrendingUp, AlertTriangle, ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';

interface StatCardProps {
  title: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  color: string;
}

function StatCard({ title, value, sub, icon: Icon, color }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5 flex gap-4">
      <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: summaryData, isLoading: loadingSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get('/dashboard/summary').then((r) => r.data.data),
    refetchInterval: 60000,
  });

  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart'],
    queryFn: () => api.get('/dashboard/sales-chart?period=30d').then((r) => r.data.data),
  });

  if (loadingSummary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5 h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  const s = summaryData;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Ventas hoy"
          value={formatCurrency(s?.sales?.today?.total || 0)}
          sub={`${s?.sales?.today?.count || 0} transacciones`}
          icon={ShoppingCart}
          color="bg-blue-500"
        />
        <StatCard
          title="Ventas del mes"
          value={formatCurrency(s?.sales?.month?.total || 0)}
          sub={`${s?.sales?.month?.count || 0} ventas`}
          icon={TrendingUp}
          color="bg-green-500"
        />
        <StatCard
          title="Stock bajo"
          value={String(s?.inventory?.lowStock || 0)}
          sub={`de ${s?.inventory?.totalProducts || 0} productos`}
          icon={AlertTriangle}
          color="bg-yellow-500"
        />
        <StatCard
          title="Créditos pendientes"
          value={formatCurrency(s?.credits?.totalBalance || 0)}
          sub={`${s?.credits?.count || 0} clientes`}
          icon={CreditCard}
          color="bg-red-500"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Ventas últimos 30 días</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData || []}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                labelFormatter={(l) => `Fecha: ${l}`}
              />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="url(#salesGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Productos más vendidos</h3>
          {s?.topProducts?.length > 0 ? (
            <div className="space-y-3">
              {s.topProducts.slice(0, 5).map((p: any, i: number) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                      {p.product?.name || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500">{p._sum?.quantity} uds</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
          )}
        </div>
      </div>

      {/* Recent Sales */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-white">Últimas ventas</h3>
          <Link href="/ventas?status=CANCELLED" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            Ver anuladas <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3 font-medium">Factura</th>
                <th className="text-left px-5 py-3 font-medium">Cliente</th>
                <th className="text-left px-5 py-3 font-medium">Vendedor</th>
                <th className="text-right px-5 py-3 font-medium">Total</th>
                <th className="text-left px-5 py-3 font-medium">Estado</th>
                <th className="text-left px-5 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {s?.recentSales?.map((sale: any) => (
                <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                  <td className="px-5 py-3 font-mono text-xs text-blue-600">{sale.invoiceNumber}</td>
                  <td className="px-5 py-3">{sale.customer?.name || 'Mostrador'}</td>
                  <td className="px-5 py-3 text-gray-500">{sale.user?.name}</td>
                  <td className="px-5 py-3 text-right font-semibold">{formatCurrency(sale.total)}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(sale.status)}`}>
                      {statusLabel(sale.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{formatDateTime(sale.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!s?.recentSales || s.recentSales.length === 0) && (
            <p className="text-center text-gray-400 py-8 text-sm">No hay ventas recientes</p>
          )}
        </div>
      </div>
    </div>
  );
}
