'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Building2, Users, TrendingUp, ShoppingCart,
  Search, ChevronLeft, ChevronRight, X,
  Loader2, Shield, Ban, CheckCircle, Zap,
} from 'lucide-react';

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Business {
  id: string;
  name: string;
  city?: string;
  plan: 'free' | 'pro';
  planExpiresAt?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  owner: { id: string; name: string; email: string };
  _count: { branches: number };
}

interface Stats {
  totalBusinesses: number;
  totalUsers: number;
  plans: { free: number; pro: number };
  sales: { total: number; count: number };
  recentBusinesses: Business[];
}

// ── Tile de estadística ───────────────────────────────────────────────────────
function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', accent ?? 'bg-emerald-500/10')}>
        <Icon size={16} className={accent ? 'text-white' : 'text-emerald-500'} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
        <p className="text-[22px] font-black tabular text-slate-900 dark:text-white leading-none">{value}</p>
        {sub && <p className="text-[12px] text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Modal cambiar plan ────────────────────────────────────────────────────────
function PlanModal({
  business,
  onClose,
}: {
  business: Business;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [plan, setPlan] = useState<'free' | 'pro'>(business.plan);
  const [expires, setExpires] = useState(
    business.planExpiresAt ? business.planExpiresAt.split('T')[0] : '',
  );

  const mutation = useMutation({
    mutationFn: (data: { plan: string; planExpiresAt?: string | null }) =>
      api.patch(`/superadmin/businesses/${business.id}/plan`, data).then((r) => r.data),
    onSuccess: () => {
      toast.success(`Plan de "${business.name}" actualizado a ${plan.toUpperCase()}`);
      qc.invalidateQueries({ queryKey: ['sa-businesses'] });
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al actualizar el plan'),
  });

  function handleSubmit() {
    mutation.mutate({
      plan,
      planExpiresAt: plan === 'pro' && expires ? new Date(expires).toISOString() : null,
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-xl w-full max-w-sm p-5 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Zap size={15} className="text-amber-500" /> Cambiar plan
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mb-4 p-3 bg-slate-50 dark:bg-white/[0.03] rounded-xl text-[13px]">
          <p className="font-semibold text-slate-800 dark:text-white">{business.name}</p>
          <p className="text-slate-400">{business.owner.email}</p>
          <p className="text-slate-400 mt-0.5">
            Plan actual:{' '}
            <span className={cn('font-semibold', business.plan === 'pro' ? 'text-emerald-500' : 'text-slate-500')}>
              {business.plan.toUpperCase()}
            </span>
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Nuevo plan
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['free', 'pro'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                className={cn(
                  'py-2.5 rounded-xl border-2 text-[13px] font-semibold transition-all',
                  plan === p
                    ? p === 'pro'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-slate-400 bg-slate-50 dark:bg-white/[0.05] text-slate-700 dark:text-slate-300'
                    : 'border-slate-200 dark:border-slate-700/60 text-slate-500 hover:border-slate-300',
                )}
              >
                {p === 'pro' ? '⚡ Pro' : 'Free'}
              </button>
            ))}
          </div>
        </div>

        {plan === 'pro' && (
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Fecha de expiración (opcional)
            </label>
            <input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">Dejar vacío = sin expiración</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Protección de ruta: solo SUPER_ADMIN
  if (user && user.role !== 'SUPER_ADMIN') {
    router.replace('/dashboard');
    return null;
  }

  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);
  const [planModal, setPlanModal] = useState<Business | null>(null);
  const limit = 15;

  const { data: stats, isLoading: loadingStats } = useQuery<Stats>({
    queryKey: ['sa-stats'],
    queryFn: () => api.get('/superadmin/stats').then((r) => r.data.data),
    staleTime: 30_000,
  });

  const { data: bizData, isLoading: loadingBiz } = useQuery({
    queryKey: ['sa-businesses', search, planFilter, page],
    queryFn: () =>
      api
        .get(`/superadmin/businesses?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&plan=${planFilter}`)
        .then((r) => r.data),
    staleTime: 20_000,
  });

  const businesses: Business[] = bizData?.data ?? [];
  const totalPages = Math.ceil((bizData?.pagination?.total ?? 0) / limit);

  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/superadmin/businesses/${id}/status`, { active }).then((r) => r.data),
    onSuccess: (_, { active }) => {
      toast.success(active ? 'Negocio activado' : 'Negocio desactivado');
      qc.invalidateQueries({ queryKey: ['sa-businesses'] });
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al cambiar estado'),
  });

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <Shield size={16} className="text-violet-500" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-slate-900 dark:text-white leading-tight">Panel de Super Admin</h1>
          <p className="text-[12px] text-slate-400">Gestión global de negocios registrados en Ventrix</p>
        </div>
      </div>

      {/* ── Stats ── */}
      {loadingStats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4"><div className="skeleton h-16 rounded-lg" /></div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile icon={Building2} label="Negocios" value={stats.totalBusinesses} />
          <StatTile icon={Users}     label="Usuarios"  value={stats.totalUsers} />
          <StatTile
            icon={Zap}
            label="Plan Free"
            value={stats.plans.free}
            sub={`${Math.round((stats.plans.free / (stats.totalBusinesses || 1)) * 100)}% del total`}
          />
          <StatTile
            icon={Zap}
            label="Plan Pro"
            value={stats.plans.pro}
            accent="bg-emerald-500"
            sub={`${Math.round((stats.plans.pro / (stats.totalBusinesses || 1)) * 100)}% del total`}
          />
          <StatTile icon={ShoppingCart} label="Ventas"   value={stats.sales.count.toLocaleString('es-CO')} />
          <StatTile icon={TrendingUp}   label="Volumen"  value={formatCurrency(Number(stats.sales.total))} />
        </div>
      ) : null}

      {/* ── Filtros ── */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar negocio por nombre..."
            className="w-full pl-9 pr-3 py-2 text-[13px] rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { value: '',     label: 'Todos' },
            { value: 'free', label: 'Free'  },
            { value: 'pro',  label: 'Pro'   },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setPlanFilter(f.value); setPage(1); }}
              className={cn(
                'px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all border',
                planFilter === f.value
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/60 dark:bg-white/[0.02]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Negocio</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Propietario</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Plan</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sucursales</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Registrado</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Estado</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {loadingBiz ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="skeleton h-4 rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : businesses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    {search || planFilter ? 'Sin resultados para los filtros aplicados' : 'No hay negocios registrados'}
                  </td>
                </tr>
              ) : (
                businesses.map((biz) => {
                  const isActive = !biz.deletedAt;
                  return (
                    <tr key={biz.id} className={cn('hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors', !isActive && 'opacity-50')}>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{biz.name}</p>
                        {biz.city && <p className="text-[11px] text-slate-400">{biz.city}</p>}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-slate-700 dark:text-slate-300">{biz.owner.name}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{biz.owner.email}</p>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span className={cn(
                          'badge',
                          biz.plan === 'pro' ? 'badge-green' : 'badge-slate',
                        )}>
                          {biz.plan === 'pro' ? '⚡ Pro' : 'Free'}
                        </span>
                        {biz.plan === 'pro' && biz.planExpiresAt && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            Vence {formatDate(biz.planExpiresAt)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-center tabular text-slate-600 dark:text-slate-400">
                        {biz._count.branches}
                      </td>
                      <td className="px-4 py-3.5 text-slate-400 text-[12px]">
                        {formatDate(biz.createdAt)}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        {isActive ? (
                          <span className="badge badge-green">
                            <CheckCircle size={10} /> Activo
                          </span>
                        ) : (
                          <span className="badge badge-red">
                            <Ban size={10} /> Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPlanModal(biz)}
                            className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                          >
                            Plan
                          </button>
                          <button
                            type="button"
                            onClick={() => statusMutation.mutate({ id: biz.id, active: !isActive })}
                            disabled={statusMutation.isPending}
                            className={cn(
                              'px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-colors',
                              isActive
                                ? 'border-red-200 dark:border-red-500/20 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'border-emerald-200 dark:border-emerald-500/20 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
                            )}
                          >
                            {isActive ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
            <p className="text-[12px] text-slate-400">
              Página {page} de {totalPages} · {bizData?.pagination?.total ?? 0} negocios
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700/60 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700/60 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal plan */}
      {planModal && <PlanModal business={planModal} onClose={() => setPlanModal(null)} />}
    </div>
  );
}
