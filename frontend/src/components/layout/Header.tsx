'use client';

import { usePathname } from 'next/navigation';
import { Bell, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/store/auth.store';
import { getInitials } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

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

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user } = useAuthStore();

  const title = Object.entries(pageLabels).find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1] || 'Komercio';

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-3 flex items-center gap-4">
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

        <Tooltip content="Notificaciones" side="bottom">
          <button
            type="button"
            aria-label="Notificaciones"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition relative"
          >
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
        </Tooltip>

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
  );
}
