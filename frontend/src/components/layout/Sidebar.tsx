'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  LayoutDashboard, Package, ShoppingCart, Users, Truck,
  Receipt, CreditCard, TrendingUp, Settings, Store,
  ChevronLeft, ChevronRight, ShoppingBag, DollarSign,
  LogOut, Calculator,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER', 'WAREHOUSE'] },
  { href: '/pos', icon: Calculator, label: 'Punto de Venta', roles: ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'] },
  { href: '/ventas', icon: ShoppingCart, label: 'Ventas', roles: ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'] },
  { href: '/inventario', icon: Package, label: 'Inventario', roles: ['ADMIN', 'SUPERVISOR', 'WAREHOUSE'] },
  { href: '/compras', icon: ShoppingBag, label: 'Compras', roles: ['ADMIN', 'SUPERVISOR', 'WAREHOUSE'] },
  { href: '/clientes', icon: Users, label: 'Clientes', roles: ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'] },
  { href: '/proveedores', icon: Truck, label: 'Proveedores', roles: ['ADMIN', 'SUPERVISOR'] },
  { href: '/gastos', icon: Receipt, label: 'Gastos', roles: ['ADMIN', 'SUPERVISOR'] },
  { href: '/creditos', icon: CreditCard, label: 'Créditos / Fiados', roles: ['ADMIN', 'SUPERVISOR', 'CASHIER'] },
  { href: '/caja', icon: DollarSign, label: 'Caja', roles: ['ADMIN', 'SUPERVISOR', 'CASHIER'] },
  { href: '/reportes', icon: TrendingUp, label: 'Reportes', roles: ['ADMIN', 'SUPERVISOR'] },
  { href: '/configuracion', icon: Settings, label: 'Configuración', roles: ['ADMIN'] },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const visibleItems = navItems.filter((i) => user?.role && i.roles.includes(user.role));

  return (
    <aside
      className={cn(
        'bg-gray-900 text-white flex flex-col transition-all duration-300 ease-in-out z-30',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <Tooltip content="Komercio" side="right" disabled={!collapsed}>
        <div className={cn('flex items-center gap-3 px-4 py-4 border-b border-gray-700/50', collapsed && 'justify-center px-2')}>
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Store size={18} />
          </div>
          {!collapsed && <span className="font-bold text-lg tracking-tight">Komercio</span>}
        </div>
      </Tooltip>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Tooltip key={item.href} content={item.label} side="right" disabled={!collapsed}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800',
                  collapsed && 'justify-center px-2',
                )}
              >
                <item.icon size={18} className="flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      {/* User + Collapse */}
      <div className="border-t border-gray-700/50 p-2 space-y-1">
        {!collapsed && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.role}</p>
          </div>
        )}
        <Tooltip content={collapsed ? `Cerrar sesión (${user?.name})` : 'Cerrar sesión'} side="right">
          <button
            type="button"
            onClick={logout}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors',
              collapsed && 'justify-center',
            )}
          >
            <LogOut size={16} />
            {!collapsed && 'Cerrar sesión'}
          </button>
        </Tooltip>
        <Tooltip content={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'} side="right">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors justify-center"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span className="text-xs">Colapsar</span>}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
