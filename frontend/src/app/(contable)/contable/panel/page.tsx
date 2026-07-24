'use client';

import { useAuthStore } from '@/store/auth.store';
import { CalendarClock, Users, FileText } from 'lucide-react';
import Link from 'next/link';

/**
 * Panel de Ventrix Contable — versión inicial.
 *
 * Da la bienvenida y enlaza a las secciones. Los widgets reales (próximos
 * vencimientos, resoluciones por vencer) llegan cuando estén los modelos y
 * endpoints del dominio (pasos siguientes del plan). Se deja funcional para que
 * el flujo registro → login → tablero quede completo de punta a punta.
 */
export default function ContablePanelPage() {
  const user = useAuthStore((s) => s.user);

  const accesos = [
    { href: '/contable/clientes',     icon: Users,         title: 'Clientes',          desc: 'Tus empresas y personas a cargo' },
    { href: '/contable/vencimientos', icon: CalendarClock, title: 'Vencimientos',      desc: 'Fechas DIAN por obligación' },
    { href: '/contable/resoluciones', icon: FileText,      title: 'Resoluciones DIAN', desc: 'Numeración y vigencias' },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Hola{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Tu agenda tributaria en un solo lugar. Empieza registrando tus clientes.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {accesos.map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="card p-5 card-hover flex flex-col gap-3 group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <Icon size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {title}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="card p-5 border-dashed">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Pronto verás aquí tus próximos vencimientos y las resoluciones por vencer,
          calculados automáticamente con el calendario DIAN 2026.
        </p>
      </div>
    </div>
  );
}
