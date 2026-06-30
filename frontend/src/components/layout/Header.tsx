'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell, Sun, Moon, Menu, Zap } from 'lucide-react';
import { useTheme } from 'next-themes';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { getInitials } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { NotificationPanel } from './NotificationPanel';

const pageLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pos': 'Punto de Venta',
  '/ventas': 'Ventas',
  '/inventario': 'Inventario',
  '/compras': 'Compras',
  '/clientes': 'Clientes',
  '/proveedores': 'Proveedores',
  '/gastos': 'Gastos',
  '/creditos': 'Créditos',
  '/caja': 'Caja',
  '/reportes': 'Reportes',
  '/configuracion': 'Configuración',
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user } = useAuthStore();
  const openUpgrade = useUpgradeStore((s) => s.open);
  const isFree = !user?.plan || user.plan === 'free';
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data.data),
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.count || 0;

  const title =
    Object.entries(pageLabels).find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1] ||
    'Komercio';

  return (
    <div className="flex flex-col">
      {isFree && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 md:px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white text-xs md:text-sm">
            <Zap size={14} className="text-yellow-300 fill-yellow-300 flex-shrink-0" />
            <span>
              <span className="font-semibold">Actualiza al Plan Pro</span>
              <span className="hidden md:inline text-blue-100">
                {' '}— Productos, ventas y usuarios ilimitados
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={openUpgrade}
            className="flex-shrink-0 bg-white text-blue-700 font-semibold text-xs px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Ver planes
          </button>
        </div>
      )}

      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-3 flex items-center gap-2 md:gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold text-gray-800 dark:text-white flex-1">{title}</h1>

        <div className="flex items-center gap-2">
          <Tooltip content={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'} side="bottom">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </Tooltip>

          <div className="relative">
            <Tooltip content="Notificaciones" side="bottom">
              <button
                type="button"
                aria-label="Notificaciones"
                onClick={() => setNotifOpen((v) => !v)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition relative"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </Tooltip>
            <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
          </div>

          <Tooltip content={`${user?.name} · ${user?.role}`} side="bottom">
            <div className="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700 cursor-default">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                {user?.name ? getInitials(user.name) : '?'}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium text-gray-800 dark:text-white leading-none">{user?.name}</p>
                <p className="text-xs text-gray-500 leading-none mt-0.5">{user?.role}</p>
              </div>
            </div>
          </Tooltip>
        </div>
      </header>
    </div>
  );
}
