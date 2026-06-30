'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Building2, Users, ShoppingCart, Zap, Search, ChevronLeft, ChevronRight } from 'lucide-react';

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex gap-4">
      <div className={`w-11 h-11 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

export default function SuperAdminPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({
    queryKey: ['sa-stats'],
    queryFn: () => api.get('/superadmin/stats').then((r) => r.data.data),
  });

  const { data: bizData, isLoading } = useQuery({
    queryKey: ['sa-businesses', page, search, planFilter],
    queryFn: () =>
      api.get('/superadmin/businesses', {
        params: { page, limit: 10, search: search || undefined, plan: planFilter || undefined },
      }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const changePlan = useMutation({
    mutationFn: ({ id, plan, planExpiresAt }: { id: string; plan: string; planExpiresAt?: string }) =>
      api.patch(`/superadmin/businesses/${id}/plan`, { plan, planExpiresAt }),
    onSuccess: (_, vars) => {
      toast.success(`Plan actualizado a ${vars.plan}`);
      qc.invalidateQueries({ queryKey: ['sa-businesses'] });
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al actualizar'),
  });

  const businesses = bizData?.data || [];
  const total = bizData?.meta?.total || 0;
  const totalPages = Math.ceil(total / 10);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Panel de Administración</h1>
        <p className="text-gray-500 text-sm mt-1">Gestión global de negocios y planes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Negocios activos" value={stats?.totalBusinesses ?? '—'} sub="registrados"
          icon={Building2} color="bg-blue-600"
        />
        <StatCard
          label="Usuarios totales" value={stats?.totalUsers ?? '—'} sub="sin contar super admins"
          icon={Users} color="bg-violet-600"
        />
        <StatCard
          label="Ventas totales" value={stats ? fmt(stats.sales.total) : '—'} sub={`${stats?.sales.count ?? 0} transacciones`}
          icon={ShoppingCart} color="bg-emerald-600"
        />
        <StatCard
          label="Plan Pro activos" value={stats?.plans.pro ?? '—'} sub={`${stats?.plans.free ?? 0} en plan gratuito`}
          icon={Zap} color="bg-amber-600"
        />
      </div>

      {/* Businesses table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar negocio..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los planes</option>
            <option value="free">Gratuito</option>
            <option value="pro">Pro</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-3 font-medium">Negocio</th>
                <th className="text-left px-4 py-3 font-medium">Propietario</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-left px-4 py-3 font-medium">Vence</th>
                <th className="text-left px-4 py-3 font-medium">Registrado</th>
                <th className="text-left px-4 py-3 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : businesses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No hay negocios registrados
                  </td>
                </tr>
              ) : (
                businesses.map((b: any) => (
                  <tr key={b.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{b.name}</p>
                      {b.city && <p className="text-xs text-gray-500">{b.city}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white">{b.owner?.name}</p>
                      <p className="text-xs text-gray-500">{b.owner?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        b.plan === 'pro'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        <Zap size={10} />
                        {b.plan === 'pro' ? 'Pro' : 'Gratuito'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {b.planExpiresAt
                        ? new Date(b.planExpiresAt).toLocaleDateString('es-CO')
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(b.createdAt).toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-4 py-3">
                      {b.plan === 'free' ? (
                        <button
                          onClick={() => changePlan.mutate({
                            id: b.id,
                            plan: 'pro',
                            planExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                          })}
                          disabled={changePlan.isPending}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                        >
                          Activar Pro
                        </button>
                      ) : (
                        <button
                          onClick={() => changePlan.mutate({ id: b.id, plan: 'free' })}
                          disabled={changePlan.isPending}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-xs rounded-lg transition-colors"
                        >
                          Bajar a Free
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between text-sm text-gray-500">
            <span>{total} negocios en total</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-white">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page === totalPages}
                className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
