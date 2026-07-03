'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { api } from '@/lib/api';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  LayoutDashboard, Package, ShoppingCart, Users, Truck,
  Receipt, CreditCard, TrendingUp, Settings,
  ChevronLeft, ChevronRight, ShoppingBag, DollarSign,
  LogOut, Calculator, X, Zap,
} from 'lucide-react';

// ── Navigation groups ─────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'GESTIONA TU NEGOCIO',
    items: [
      { href: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',         roles: ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER', 'WAREHOUSE'], pro: false },
      { href: '/pos',          icon: Calculator,      label: 'Punto de Venta',    roles: ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'],              pro: false },
      { href: '/ventas',       icon: ShoppingCart,    label: 'Ventas',            roles: ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'],              pro: false },
      { href: '/inventario',   icon: Package,         label: 'Inventario',        roles: ['ADMIN', 'SUPERVISOR', 'WAREHOUSE'],                      pro: false },
      { href: '/compras',      icon: ShoppingBag,     label: 'Compras',           roles: ['ADMIN', 'SUPERVISOR', 'WAREHOUSE'],                      pro: false },
      { href: '/gastos',       icon: Receipt,         label: 'Gastos',            roles: ['ADMIN', 'SUPERVISOR'],                                   pro: false },
      { href: '/caja',         icon: DollarSign,      label: 'Caja',              roles: ['ADMIN', 'SUPERVISOR', 'CASHIER'],                        pro: false },
      { href: '/reportes',     icon: TrendingUp,      label: 'Reportes',          roles: ['ADMIN', 'SUPERVISOR'],                                   pro: true  },
    ],
  },
  {
    label: 'GESTIONA TUS CONTACTOS',
    items: [
      { href: '/clientes',     icon: Users,           label: 'Clientes',          roles: ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'],              pro: false },
      { href: '/creditos',     icon: CreditCard,      label: 'Créditos / Fiados', roles: ['ADMIN', 'SUPERVISOR', 'CASHIER'],                        pro: true  },
      { href: '/proveedores',  icon: Truck,           label: 'Proveedores',       roles: ['ADMIN', 'SUPERVISOR'],                                   pro: true  },
    ],
  },
  {
    label: null,
    items: [
      { href: '/configuracion', icon: Settings,       label: 'Configuración',     roles: ['ADMIN'],                                                 pro: false },
    ],
  },
] as const;

const ROLE_LABELS: Record<string, string> = {
  ADMIN:       'Propietario',
  SUPERVISOR:  'Supervisor',
  CASHIER:     'Cajero',
  SELLER:      'Vendedor',
  WAREHOUSE:   'Almacenista',
  SUPER_ADMIN: 'Super Admin',
};

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname    = usePathname();
  const { user, logout } = useAuthStore();
  const openUpgrade = useUpgradeStore((s) => s.open);

  const { data: business } = useQuery({
    queryKey: ['business'],
    queryFn: () => api.get('/business/me').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
    enabled: !!user?.businessId,
  });

  const isFree     = !user?.plan || user.plan === 'free';
  const roleLabel  = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? '';
  const bizName    = user?.businessName ?? 'Mi negocio';
  const bizInitial = bizName.charAt(0).toUpperCase();
  const bizLogo    = business?.logo as string | undefined;

  function handleNavClick(item: { pro: boolean }, e: React.MouseEvent) {
    if (item.pro && isFree) { e.preventDefault(); openUpgrade(); return; }
    onMobileClose();
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onMobileClose}
      />

      <aside
        className={cn(
          'bg-gray-900 text-white flex flex-col transition-all duration-300 ease-in-out',
          'fixed inset-y-0 left-0 z-50 w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:relative md:z-30 md:translate-x-0',
          collapsed ? 'md:w-16' : 'md:w-60',
        )}
      >
        {/* ── Logo ─────────────────────────────────────────────────────────── */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-4 border-b border-gray-700/50',
          collapsed && 'md:justify-center md:px-2',
        )}>
          <Tooltip content="Ventrix" side="right" disabled={!collapsed}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <img
                src="/ventrix-logo.svg"
                alt="Ventrix"
                width={32}
                height={32}
                className="w-8 h-8 flex-shrink-0 object-contain"
                draggable={false}
              />
              <span className={cn('font-bold text-lg tracking-tight truncate', collapsed && 'md:hidden')}>
                Ventrix
              </span>
            </div>
          </Tooltip>
          <button
            type="button"
            onClick={onMobileClose}
            className="md:hidden text-gray-400 hover:text-white p-1 rounded-lg flex-shrink-0"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Business info ─────────────────────────────────────────────────── */}
        <div className={cn(
          'border-b border-gray-700/50 px-3 py-3',
          collapsed && 'md:flex md:justify-center md:px-2',
        )}>
          <Tooltip content={`${bizName} · ${roleLabel}`} side="right" disabled={!collapsed}>
            <div className={cn('flex items-center gap-3', collapsed && 'md:justify-center')}>
              <div className="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden">
                {bizLogo ? (
                  <img src={bizLogo} alt={bizName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                    {bizInitial}
                  </div>
                )}
              </div>
              <div className={cn('flex-1 min-w-0', collapsed && 'md:hidden')}>
                <p className="text-sm font-semibold text-white truncate">{bizName}</p>
                <p className="text-xs text-gray-400 truncate">{roleLabel}</p>
              </div>
            </div>
          </Tooltip>
        </div>

        {/* ── Nav ──────────────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-2 px-2 space-y-0">
          {NAV_GROUPS.map((group, gi) => {
            const visible = group.items.filter((i) => user?.role && i.roles.includes(user.role as never));
            if (visible.length === 0) return null;

            return (
              <div key={gi} className={gi > 0 ? 'mt-1 pt-1 border-t border-gray-700/40' : ''}>
                {group.label && !collapsed && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visible.map((item) => {
                    const isLocked = item.pro && isFree;
                    const active   = !isLocked && (
                      pathname === item.href ||
                      (item.href !== '/dashboard' && pathname.startsWith(item.href))
                    );

                    return (
                      <Tooltip
                        key={item.href}
                        content={isLocked ? `${item.label} — Solo Plan Pro` : item.label}
                        side="right"
                        disabled={!collapsed}
                      >
                        <Link
                          href={item.href}
                          onClick={(e) => handleNavClick(item, e)}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                            active
                              ? 'bg-blue-600 text-white'
                              : isLocked
                                ? 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/50 cursor-pointer'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800',
                            collapsed && 'md:justify-center md:px-2',
                          )}
                        >
                          <item.icon size={18} className={cn('flex-shrink-0', isLocked && 'opacity-50')} />
                          <span className={cn('truncate flex-1', collapsed && 'md:hidden', isLocked && 'opacity-50')}>
                            {item.label}
                          </span>
                          {item.pro && !collapsed && (
                            <span className={cn(
                              'flex-shrink-0 flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full md:flex hidden',
                              isFree ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400',
                            )}>
                              <Zap size={9} className={isFree ? 'fill-amber-400' : 'fill-blue-400'} />
                              Pro
                            </span>
                          )}
                        </Link>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── Bottom bar ───────────────────────────────────────────────────── */}
        <div className="border-t border-gray-700/50 p-2 space-y-1">
          {/* Plan badge */}
          {!collapsed && (
            <div className="px-3 py-1">
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                user?.plan === 'pro'
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'bg-amber-500/20 text-amber-300',
              )}>
                <Zap size={10} />
                {user?.plan === 'pro' ? 'Plan Pro' : 'Plan Gratuito'}
              </span>
            </div>
          )}

          {/* Upgrade button */}
          {isFree && !collapsed && (
            <button
              type="button"
              onClick={openUpgrade}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-xs font-semibold transition-all"
            >
              <Zap size={12} className="fill-yellow-300 text-yellow-300" />
              Actualizar a Pro
            </button>
          )}

          {/* Logout */}
          <Tooltip content={collapsed ? `Cerrar sesión (${user?.name})` : 'Cerrar sesión'} side="right">
            <button
              type="button"
              onClick={logout}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors',
                collapsed && 'md:justify-center',
              )}
            >
              <LogOut size={16} />
              <span className={cn(collapsed && 'md:hidden')}>Cerrar sesión</span>
            </button>
          </Tooltip>

          {/* Collapse toggle */}
          <Tooltip content={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'} side="right">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="hidden md:flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors justify-center"
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              {!collapsed && <span className="text-xs">Colapsar</span>}
            </button>
          </Tooltip>
        </div>
      </aside>
    </>
  );
}
