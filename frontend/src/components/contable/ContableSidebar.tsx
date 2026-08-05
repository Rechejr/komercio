'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  LayoutDashboard, Users, CalendarClock, FileText, FileSpreadsheet, ClipboardList,
  ShieldCheck, ChevronLeft, ChevronRight, LogOut, X, KeyRound, Settings, Receipt,
} from 'lucide-react';

// Navegación de Ventrix Contable. Solo dos roles la ven: ADMIN (el contador,
// dueño) y AUXILIAR (su ayudante). El AUXILIAR no gestiona la cuenta.
const NAV_ITEMS = [
  { href: '/contable/panel',        icon: LayoutDashboard, label: 'Panel',            roles: ['ADMIN', 'AUXILIAR'] },
  { href: '/contable/clientes',     icon: Users,           label: 'Clientes',         roles: ['ADMIN', 'AUXILIAR'] },
  { href: '/contable/vencimientos', icon: CalendarClock,   label: 'Vencimientos',     roles: ['ADMIN', 'AUXILIAR'] },
  { href: '/contable/pila',         icon: ShieldCheck,     label: 'PILA',             roles: ['ADMIN', 'AUXILIAR'] },
  { href: '/contable/nomina',       icon: Receipt,         label: 'Nómina',           roles: ['ADMIN', 'AUXILIAR'] },
  { href: '/contable/resoluciones', icon: FileText,        label: 'Resoluciones DIAN', roles: ['ADMIN', 'AUXILIAR'] },
  { href: '/contable/exogena',      icon: FileSpreadsheet, label: 'Información Exógena', roles: ['ADMIN', 'AUXILIAR'] },
  { href: '/contable/otras-responsabilidades', icon: ClipboardList, label: 'Otras Responsabilidades', roles: ['ADMIN', 'AUXILIAR'] },
  { href: '/contable/credenciales',            icon: KeyRound,      label: 'Usuarios y Contraseñas', roles: ['ADMIN', 'AUXILIAR'] },
  { href: '/contable/configuracion',           icon: Settings,      label: 'Configuración',          roles: ['ADMIN', 'AUXILIAR'] },
] as const;

interface ContableSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function ContableSidebar({ mobileOpen, onMobileClose }: ContableSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  // Etiqueta cosmética: en una cuenta contable, el dueño (ADMIN) se muestra como
  // "Contador"; su ayudante como "Auxiliar". No es un rol nuevo (decisión: se
  // deriva del producto, no se toca el backend).
  const roleLabel = user?.role === 'AUXILIAR' ? 'Auxiliar' : 'Contador';
  const bizName = user?.businessName ?? 'Mi oficina';
  const bizInitial = bizName.charAt(0).toUpperCase();

  const visibleItems = NAV_ITEMS.filter(
    (i) => user?.role && i.roles.includes(user.role as never),
  );

  return (
    <>
      {/* Backdrop móvil */}
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

      <aside
        className={cn(
          'sidebar-bg flex flex-col z-50 select-none',
          'fixed inset-y-0 left-0 w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'transition-transform duration-300 ease-spring',
          'md:relative md:translate-x-0 md:z-30',
          collapsed ? 'md:w-[60px]' : 'md:w-[220px]',
          'transition-[width,transform] duration-300 ease-spring',
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center gap-3 px-4 py-[14px] flex-shrink-0', collapsed && 'md:justify-center md:px-0')}>
          <Tooltip content="Ventrix Contable" side="right" disabled={!collapsed}>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <img src="/ventrix-logo.svg" alt="Ventrix" width={26} height={26} className="w-[26px] h-[26px] flex-shrink-0" draggable={false} />
              <span className={cn('font-semibold text-[15px] text-white tracking-tight transition-all duration-300', collapsed && 'md:hidden md:opacity-0')}>
                Ventrix <span className="text-emerald-400">Contable</span>
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

        {/* Tarjeta de la oficina */}
        <div className={cn('px-2 pb-1 flex-shrink-0', collapsed && 'md:px-1.5')}>
          <Tooltip content={`${bizName} · ${roleLabel}`} side="right" disabled={!collapsed}>
            <div className={cn('flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-default hover:bg-white/[0.04] transition-colors', collapsed && 'md:justify-center md:px-1.5')}>
              <div className="w-[30px] h-[30px] rounded-md flex-shrink-0 overflow-hidden ring-1 ring-white/10">
                <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                  {bizInitial}
                </div>
              </div>
              <div className={cn('flex-1 min-w-0', collapsed && 'md:hidden')}>
                <p className="text-[13px] font-semibold text-white/90 truncate leading-tight">{bizName}</p>
                <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">{roleLabel}</p>
              </div>
            </div>
          </Tooltip>
        </div>

        <div className="mx-3 mb-1 h-px bg-white/[0.06] flex-shrink-0" />

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-1.5 px-2 space-y-[2px]">
          {visibleItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <Tooltip key={item.href} content={item.label} side="right" disabled={!collapsed}>
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-all duration-150 px-2.5 py-[7px]',
                    active ? 'text-white nav-item-active' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]',
                    collapsed && 'md:justify-center md:px-0 md:py-2',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="contable-active-bar"
                      className="sidebar-active-bar absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <item.icon
                    size={15}
                    strokeWidth={active ? 2.2 : 1.8}
                    className={cn('flex-shrink-0 transition-colors duration-150', active ? 'text-emerald-400' : 'text-slate-600 group-hover:text-slate-300')}
                  />
                  <span className={cn('truncate flex-1', collapsed && 'md:hidden')}>{item.label}</span>
                </Link>
              </Tooltip>
            );
          })}
        </nav>

        {/* Acciones inferiores. El estado de la prueba/suscripción se muestra en
            el Panel, no aquí, para no repetir con lenguaje del POS. */}
        <div className="sidebar-bottom-border flex-shrink-0 px-2 pb-2 pt-1 space-y-[2px]">
          <Tooltip content={collapsed ? 'Cerrar sesión' : ''} side="right">
            <button
              type="button"
              onClick={logout}
              className={cn(
                'flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-md text-[13px] text-slate-600 hover:text-red-400 transition-colors duration-150 hover:bg-red-400/5',
                collapsed && 'md:justify-center md:px-0',
              )}
            >
              <LogOut size={14} className="flex-shrink-0" />
              <span className={cn(collapsed && 'md:hidden')}>Cerrar sesión</span>
            </button>
          </Tooltip>

          <Tooltip content={collapsed ? 'Expandir' : 'Colapsar'} side="right">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                'hidden md:flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-md text-[13px] text-slate-700 hover:text-slate-400 hover:bg-white/[0.04] transition-colors duration-150',
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
