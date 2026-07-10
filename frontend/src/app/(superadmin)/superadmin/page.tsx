'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Building2, Users, ShoppingCart, Zap, Search,
  ChevronLeft, ChevronRight, X, CheckCircle, Ban, Loader2, Trash2, AlertTriangle, KeyRound,
} from 'lucide-react';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Business {
  id: string;
  name: string;
  city?: string;
  plan: 'free' | 'pro';
  planExpiresAt?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  owner: { name: string; email: string };
  _count: { branches: number };
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
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

// ── Modal cambiar plan ────────────────────────────────────────────────────────
function PlanModal({ business, onClose }: { business: Business; onClose: () => void }) {
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
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al actualizar'),
  });

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
            <Zap size={15} className="text-amber-400" /> Cambiar plan
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-800 rounded-xl text-sm">
          <p className="font-semibold text-white">{business.name}</p>
          <p className="text-gray-400 text-xs mt-0.5">{business.owner.email}</p>
          <p className="text-gray-500 text-xs mt-1">
            Plan actual:{' '}
            <span className={business.plan === 'pro' ? 'text-emerald-400 font-semibold' : 'text-gray-400'}>
              {business.plan.toUpperCase()}
            </span>
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nuevo plan</label>
          <div className="grid grid-cols-2 gap-2">
            {(['free', 'pro'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                  plan === p
                    ? p === 'pro'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-gray-500 bg-gray-700 text-gray-200'
                    : 'border-gray-700 text-gray-500 hover:border-gray-600'
                }`}
              >
                {p === 'pro' ? '⚡ Pro' : 'Free'}
              </button>
            ))}
          </div>
        </div>

        {plan === 'pro' && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Fecha de expiración (opcional)
            </label>
            <input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="w-full px-3 py-2.5 text-[16px] sm:text-sm rounded-xl border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-gray-600 mt-1">Dejar vacío = sin expiración</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate({
              plan,
              planExpiresAt: plan === 'pro' && expires ? new Date(expires).toISOString() : null,
            })}
            disabled={mutation.isPending}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal eliminar cuenta ─────────────────────────────────────────────────────
function DeleteModal({ business, onClose }: { business: Business; onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.delete(`/superadmin/businesses/${business.id}`, { data: { password } }).then((r) => r.data),
    onSuccess: () => {
      toast.success(`"${business.name}" eliminado permanentemente`);
      qc.invalidateQueries({ queryKey: ['sa-businesses'] });
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-red-900/60 rounded-2xl w-full max-w-sm p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-red-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={17} className="text-red-400" />
            </div>
            <h2 className="text-[15px] font-bold text-white">Eliminar cuenta</h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mb-4 p-3 bg-red-500/5 border border-red-900/40 rounded-xl text-sm">
          <p className="font-semibold text-white">{business.name}</p>
          <p className="text-gray-400 text-xs mt-0.5">{business.owner.email}</p>
          <p className="text-red-400 text-xs mt-2 leading-relaxed">
            Esta acción es <strong>irreversible</strong>. Se eliminarán todos los datos: ventas,
            productos, clientes, usuarios y bodegas.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Contraseña del superadmin
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ingresa tu contraseña"
            autoFocus
            autoComplete="new-password"
            className="w-full px-3 py-2.5 text-[16px] sm:text-sm rounded-xl border border-gray-700 bg-gray-800 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500"
            onKeyDown={(e) => { if (e.key === 'Enter' && password) mutation.mutate(); }}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!password || mutation.isPending}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal cambiar contraseña superadmin ───────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch('/auth/change-password', { currentPassword: current, newPassword: next }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Contraseña actualizada correctamente');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al cambiar contraseña'),
  });

  const valid = current && next.length >= 8 && next === confirm;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
            <KeyRound size={15} className="text-emerald-400" /> Cambiar contraseña
          </h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Contraseña actual</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
              placeholder="Tu contraseña actual"
              className="w-full px-3 py-2.5 text-[16px] sm:text-sm rounded-xl border border-gray-700 bg-gray-800 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nueva contraseña</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full px-3 py-2.5 text-[16px] sm:text-sm rounded-xl border border-gray-700 bg-gray-800 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Confirmar nueva contraseña</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repite la nueva contraseña"
              className={`w-full px-3 py-2.5 text-[16px] sm:text-sm rounded-xl border bg-gray-800 text-white placeholder-gray-600 focus:outline-none focus:ring-2 transition-colors ${
                confirm && next !== confirm ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-emerald-500'
              }`} />
            {confirm && next !== confirm && <p className="text-red-400 text-xs mt-1">Las contraseñas no coinciden</p>}
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-300 transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);
  const [planModal, setPlanModal] = useState<Business | null>(null);
  const [deleteModal, setDeleteModal] = useState<Business | null>(null);
  const [changePwdModal, setChangePwdModal] = useState(false);
  const [searchSnapshot, setSearchSnapshot] = useState('');
  const LIMIT = 15;

  const { data: stats } = useQuery({
    queryKey: ['sa-stats'],
    queryFn: () => api.get('/superadmin/stats').then((r) => r.data.data),
  });

  const { data: bizData, isLoading } = useQuery({
    queryKey: ['sa-businesses', page, search, planFilter],
    queryFn: () =>
      api.get('/superadmin/businesses', {
        params: { page, limit: LIMIT, search: search || undefined, plan: planFilter || undefined },
      }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

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

  const businesses: Business[] = bizData?.data ?? [];
  const totalCount = bizData?.pagination?.total ?? bizData?.meta?.total ?? 0;
  const totalPages = Math.ceil(totalCount / LIMIT);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Panel de Administración</h1>
          <p className="text-gray-500 text-sm mt-1">Gestión global de negocios y planes</p>
        </div>
        <button
          type="button"
          onClick={() => { setSearchSnapshot(search); setChangePwdModal(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm text-gray-300 transition-colors flex-shrink-0"
        >
          <KeyRound size={14} className="text-emerald-400" />
          Cambiar contraseña
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Negocios activos" value={stats?.totalBusinesses ?? '—'} sub="registrados"
          icon={Building2} color="bg-emerald-600"
        />
        <StatCard
          label="Usuarios totales" value={stats?.totalUsers ?? '—'} sub="sin contar super admins"
          icon={Users} color="bg-violet-600"
        />
        <StatCard
          label="Ventas totales" value={stats ? fmt(stats.sales.total) : '—'}
          sub={`${stats?.sales.count ?? 0} transacciones`}
          icon={ShoppingCart} color="bg-emerald-600"
        />
        <StatCard
          label="Plan Pro activos" value={stats?.plans.pro ?? '—'}
          sub={`${stats?.plans.free ?? 0} en plan gratuito`}
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
              autoComplete="off"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
            aria-label="Filtrar por plan"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                <th className="text-left px-4 py-3 font-medium">Bodegas</th>
                <th className="text-left px-4 py-3 font-medium">Registrado</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : businesses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {search || planFilter ? 'Sin resultados para los filtros aplicados' : 'No hay negocios registrados'}
                  </td>
                </tr>
              ) : (
                businesses.map((b) => {
                  const isActive = !b.deletedAt;
                  return (
                    <tr key={b.id} className={`hover:bg-gray-800/50 transition-colors ${!isActive ? 'opacity-50' : ''}`}>
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
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          <Zap size={10} />
                          {b.plan === 'pro' ? 'Pro' : 'Gratuito'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {b.planExpiresAt
                          ? new Date(b.planExpiresAt).toLocaleDateString('es-CO')
                          : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-center">
                        {b._count?.branches ?? 1}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(b.createdAt).toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-4 py-3">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400">
                            <CheckCircle size={10} /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400">
                            <Ban size={10} /> Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setSearchSnapshot(search); setPlanModal(b); }}
                            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors font-medium"
                          >
                            Plan
                          </button>
                          <button
                            type="button"
                            onClick={() => statusMutation.mutate({ id: b.id, active: !isActive })}
                            disabled={statusMutation.isPending}
                            className={`px-2.5 py-1 text-xs rounded-lg transition-colors font-medium disabled:opacity-50 ${
                              isActive
                                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {isActive ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSearchSnapshot(search); setDeleteModal(b); }}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded-lg transition-colors"
                            title="Eliminar cuenta permanentemente"
                          >
                            <Trash2 size={13} />
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

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between text-sm text-gray-500">
            <span>{totalCount} negocios en total · Página {page} de {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Página anterior"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-white font-medium">{page} / {totalPages}</span>
              <button
                type="button"
                aria-label="Página siguiente"
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

      {planModal && <PlanModal business={planModal} onClose={() => { setPlanModal(null); setSearch(searchSnapshot); setPage(1); }} />}
      {deleteModal && <DeleteModal business={deleteModal} onClose={() => { setDeleteModal(null); setSearch(searchSnapshot); setPage(1); }} />}
      {changePwdModal && <ChangePasswordModal onClose={() => { setChangePwdModal(false); setSearch(searchSnapshot); }} />}
    </div>
  );
}
