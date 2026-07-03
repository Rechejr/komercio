'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { api } from '@/lib/api';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  LayoutDashboard, Package, ShoppingCart, Users, Truck,
  Receipt, CreditCard, TrendingUp, Settings,
  ChevronLeft, ChevronRight, ShoppingBag, DollarSign,
  LogOut, Calculator, X, Sparkles, Zap,
} from 'lucide-react';

// ── Navigation ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Operaciones',
    items: [
      { href: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',        roles: ['ADMIN','SUPERVISOR','CASHIER','SELLER','WAREHOUSE'], pro: false },
      { href: '/pos',        icon: Calculator,      label: 'Punto de Venta',   roles: ['ADMIN','SUPERVISOR','CASHIER','SELLER'],             pro: false },
      { href: '/ventas',     icon: ShoppingCart,    label: 'Ventas',           roles: ['ADMIN','SUPERVISOR','CASHIER','SELLER'],             pro: false },
      { href: '/inventario', icon: Package,         label: 'Inventario',       roles: ['ADMIN','SUPERVISOR','WAREHOUSE'],                   pro: false },
      { href: '/compras',    icon: ShoppingBag,     label: 'Compras',          roles: ['ADMIN','SUPERVISOR','WAREHOUSE'],                   pro: false },
      { href: '/gastos',     icon: Receipt,         label: 'Gastos',           roles: ['ADMIN','SUPERVISOR'],                               pro: false },
      { href: '/caja',       icon: DollarSign,      label: 'Caja',             roles: ['ADMIN','SUPERVISOR','CASHIER'],                     pro: false },
      { href: '/reportes',   icon: TrendingUp,      label: 'Reportes',         roles: ['ADMIN','SUPERVISOR'],                               pro: true  },
    ],
  },
  {
    label: 'Contactos',
    items: [
      { href: '/clientes',    icon: Users,      label: 'Clientes',          roles: ['ADMIN','SUPERVISOR','CASHIER','SELLER'], pro: false },
      { href: '/creditos',    icon: CreditCard, label: 'Créditos / Fiados', roles: ['ADMIN','SUPERVISOR','CASHIER'],          pro: true  },
      { href: '/proveedores', icon: Truck,      label: 'Proveedores',       roles: ['ADMIN','SUPERVISOR'],                   pro: true  },
    ],
  },
  {
    label: null,
    items: [
      { href: '/configuracion', icon: Settings, label: 'Configuración', roles: ['ADMIN'], pro: false },
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
    queryFn:  () => api.get('/business/me').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
    enabled:   !!user?.businessId,
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
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 md:hidden"
            onClick={onMobileClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col z-50 select-none',
          'fixed inset-y-0 left-0 w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'transition-transform duration-300 ease-spring',
          'md:relative md:translate-x-0 md:z-30',
          collapsed ? 'md:w-[60px]' : 'md:w-[220px]',
          'transition-[width,transform] duration-300 ease-spring',
        )}
        style={{
          background: 'linear-gradient(180deg, #0d1117 0%, #0b0f1a 100%)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* ── Logo ─────────────────────────────────────────────────────────── */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-[14px] flex-shrink-0',
          collapsed && 'md:justify-center md:px-0',
        )}>
          <Tooltip content="Ventrix" side="right" disabled={!collapsed}>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <img
                src="/ventrix-logo.svg"
                alt="Ventrix"
                width={26}
                height={26}
                className="w-[26px] h-[26px] flex-shrink-0"
                draggable={false}
              />
              <span className={cn(
                'font-semibold text-[15px] text-white tracking-tight transition-all duration-300',
                collapsed && 'md:hidden md:opacity-0',
              )}>
                Ventrix
              </span>
            </div>
          </Tooltip>
          <button
            type="button"
            onClick={onMobileClose}
            className="md:hidden flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Business card ─────────────────────────────────────────────────── */}
        <div className={cn('px-2 pb-1 flex-shrink-0', collapsed && 'md:px-1.5')}>
          <Tooltip content={`${bizName} · ${roleLabel}`} side="right" disabled={!collapsed}>
            <div className={cn(
              'flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-default',
              'hover:bg-white/[0.04] transition-colors',
              collapsed && 'md:justify-center md:px-1.5',
            )}>
              <div className="w-[30px] h-[30px] rounded-md flex-shrink-0 overflow-hidden ring-1 ring-white/10">
                {bizLogo ? (
                  <img src={bizLogo} alt={bizName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                    {bizInitial}
                  </div>
                )}
              </div>
              <div className={cn('flex-1 min-w-0', collapsed && 'md:hidden')}>
                <p className="text-[13px] font-semibold text-white/90 truncate leading-tight">{bizName}</p>
                <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">{roleLabel}</p>
              </div>
            </div>
          </Tooltip>
        </div>

        {/* ── Divider ───────────────────────────────────────────────────────── */}
        <div className="mx-3 mb-1 h-px bg-white/[0.06] flex-shrink-0" />

        {/* ── Navigation ───────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-1.5 px-2 space-y-0">
          {NAV_GROUPS.map((group, gi) => {
            const visible = group.items.filter(
              (i) => user?.role && i.roles.includes(user.role as never),
            );
            if (visible.length === 0) return null;

            return (
              <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
                {/* Group label */}
                {group.label && !collapsed && (
                  <p className="px-2 pt-0.5 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                     style={{ color: 'rgba(148,163,184,0.45)' }}>
                    {group.label}
                  </p>
                )}
                {gi > 0 && collapsed && <div className="mx-1.5 mb-2 h-px bg-white/[0.06]" />}

                <div className="space-y-[2px]">
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
                            'group relative flex items-center gap-2.5 rounded-md text-[13px] font-medium',
                            'transition-all duration-150',
                            'px-2.5 py-[7px]',
                            active
                              ? 'text-white'
                              : isLocked
                                ? 'text-slate-700 cursor-pointer'
                                : 'text-slate-400 hover:text-slate-100',
                            !active && !isLocked && 'hover:bg-white/[0.05]',
                            collapsed && 'md:justify-center md:px-0 md:py-2',
                          )}
                          style={active ? {
                            background: 'linear-gradient(90deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.07) 100%)',
                          } : undefined}
                        >
                          {/* Active indicator bar */}
                          {active && (
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                              style={{ height: '16px', background: 'linear-gradient(180deg, #60a5fa, #6366f1)' }}
                            />
                          )}

                          <item.icon
                            size={15}
                            strokeWidth={active ? 2.2 : 1.8}
                            className={cn(
                              'flex-shrink-0 transition-colors duration-150',
                              active   ? 'text-blue-400'  : '',
                              isLocked ? 'text-slate-700' : !active ? 'text-slate-600 group-hover:text-slate-300' : '',
                            )}
                          />

                          <span className={cn(
                            'truncate flex-1',
                            collapsed && 'md:hidden',
                          )}>
                            {item.label}
                          </span>

                          {item.pro && !collapsed && (
                            <span
                              className={cn(
                                'flex-shrink-0 hidden md:inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                                isFree
                                  ? 'text-amber-500/80'
                                  : 'text-blue-400/80',
                              )}
                              style={{
                                background: isFree
                                  ? 'rgba(245,158,11,0.08)'
                                  : 'rgba(59,130,246,0.08)',
                              }}
                            >
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

        {/* ── Bottom actions ────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-2 pb-2 pt-1 space-y-[2px]" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Plan indicator */}
          {!collapsed && (
            <div className="px-2 py-1.5">
              <span className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md',
                user?.plan === 'pro'
                  ? 'text-blue-400'
                  : 'text-slate-600',
              )}
              style={{
                background: user?.plan === 'pro'
                  ? 'rgba(59,130,246,0.08)'
                  : 'rgba(255,255,255,0.03)',
              }}>
                <Zap size={10} className={user?.plan === 'pro' ? 'fill-blue-400' : 'fill-slate-600'} />
                {user?.plan === 'pro' ? 'Plan Pro' : 'Plan Gratuito'}
              </span>
            </div>
          )}

          {/* Upgrade CTA */}
          {isFree && !collapsed && (
            <button
              type="button"
              onClick={openUpgrade}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-semibold',
                'transition-all duration-200',
                'text-blue-400 hover:text-blue-300',
              )}
              style={{
                background: 'linear-gradient(90deg, rgba(59,130,246,0.12), rgba(99,102,241,0.12))',
                border: '1px solid rgba(59,130,246,0.2)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.4)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.2)';
              }}
            >
              <Sparkles size={12} className="flex-shrink-0" />
              Actualizar a Pro
            </button>
          )}

          {/* Logout */}
          <Tooltip content={collapsed ? 'Cerrar sesión' : ''} side="right">
            <button
              type="button"
              onClick={logout}
              className={cn(
                'flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-md text-[13px]',
                'text-slate-600 hover:text-red-400 transition-colors duration-150',
                'hover:bg-red-400/5',
                collapsed && 'md:justify-center md:px-0',
              )}
            >
              <LogOut size={14} className="flex-shrink-0" />
              <span className={cn(collapsed && 'md:hidden')}>Cerrar sesión</span>
            </button>
          </Tooltip>

          {/* Collapse toggle */}
          <Tooltip content={collapsed ? 'Expandir' : 'Colapsar'} side="right">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                'hidden md:flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-md text-[13px]',
                'text-slate-700 hover:text-slate-400 hover:bg-white/[0.04] transition-colors duration-150',
                collapsed ? 'justify-center px-0' : '',
              )}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              {!collapsed && <span className="text-[12px]">Colapsar</span>}
            </button>
          </Tooltip>
        </div>
      </aside>
    </>
  );
}