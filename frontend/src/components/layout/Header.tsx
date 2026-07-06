'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell, Sun, Moon, Menu, Sparkles, Search } from 'lucide-react';
import { useTheme } from 'next-themes';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { getInitials } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { NotificationPanel } from './NotificationPanel';
import { GlobalSearch } from '@/components/ui/GlobalSearch';

const PAGE_LABELS: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/pos':          'Punto de Venta',
  '/ventas':       'Ventas',
  '/inventario':   'Inventario',
  '/compras':      'Compras',
  '/clientes':     'Clientes',
  '/proveedores':  'Proveedores',
  '/gastos':       'Gastos',
  '/creditos':     'Créditos',
  '/caja':         'Caja',
  '/reportes':     'Reportes',
  '/configuracion':'Configuración',
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname    = usePathname();
  const { theme, setTheme } = useTheme();
  const { user }    = useAuthStore();
  const openUpgrade = useUpgradeStore((s) => s.open);
  const isFree      = !user?.plan || user.plan === 'free';
  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [notifAnchor, setNotifAnchor] = useState<DOMRect | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn:  () => api.get('/notifications/unread-count').then((r) => r.data.data),
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const title =
    Object.entries(PAGE_LABELS).find(
      ([k]) => pathname === k || pathname.startsWith(k + '/'),
    )?.[1] ?? 'Ventrix';

  return (
    <div className="flex flex-col flex-shrink-0">
      {/* ── Upgrade banner ──────────────────────────────────────────────────── */}
      {isFree && (
        <div className="relative overflow-hidden px-4 md:px-6 py-2.5 flex items-center justify-between gap-4 bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-700">
          {/* subtle texture */}
          <div className="upgrade-banner-texture absolute inset-0 opacity-10" />
          <div className="relative flex items-center gap-2 text-white/90 text-[12px]">
            <Sparkles size={13} className="text-emerald-200 flex-shrink-0" />
            <span>
              Actualiza al{' '}
              <strong className="text-white font-semibold">Plan Pro</strong>
              <span className="hidden md:inline text-emerald-200">
                {' '}— sin límites de productos, ventas ni usuarios
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={openUpgrade}
            className="relative flex-shrink-0 bg-white/15 hover:bg-white/25 border border-white/25 text-white font-semibold text-[11px] px-3 py-1.5 rounded-md transition-colors"
          >
            Ver planes →
          </button>
        </div>
      )}

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <header className="h-14 flex items-center gap-3 px-4 md:px-5 flex-shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/70 dark:border-white/[0.06]">
        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
          aria-label="Abrir menú"
        >
          <Menu size={18} />
        </button>

        {/* Page title */}
        <h1 className="text-[15px] font-semibold text-slate-900 dark:text-white tracking-[-0.01em] flex-1 truncate">
          {title}
        </h1>

        {/* Search button */}
        <Tooltip content="Buscar (Ctrl+K)" side="bottom">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 h-8 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors text-[12px]"
          >
            <Search size={14} />
            <span className="hidden md:inline">Buscar</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400">
              Ctrl K
            </kbd>
          </button>
        </Tooltip>

        {/* Right actions */}
        <div className="flex items-center gap-0.5">
          {/* Theme toggle */}
          <Tooltip content={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} side="bottom">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </Tooltip>

          {/* Notifications */}
          <div className="relative">
            <Tooltip content="Notificaciones" side="bottom">
              <button
                ref={bellRef}
                type="button"
                aria-label="Notificaciones"
                onClick={() => {
                  if (bellRef.current) setNotifAnchor(bellRef.current.getBoundingClientRect());
                  setNotifOpen((v) => !v);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors relative"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute top-[5px] right-[5px] w-[7px] h-[7px] bg-red-500 rounded-full ring-[1.5px] ring-white dark:ring-slate-900" />
                )}
              </button>
            </Tooltip>
            <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} anchorRect={notifAnchor} />
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-200 dark:bg-white/[0.08] mx-2" />

          {/* User avatar */}
          <Tooltip content={`${user?.name ?? ''}`} side="bottom">
            <div className="flex items-center gap-2.5 cursor-default">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-[11px] font-bold ring-2 ring-white dark:ring-slate-900 shadow-sm">
                {user?.name ? getInitials(user.name) : '?'}
              </div>
              <div className="hidden md:flex flex-col leading-none">
                <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                  {user?.name}
                </span>
              </div>
            </div>
          </Tooltip>
        </div>
      </header>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}