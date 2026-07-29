'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { OBLIGACION_LABEL, ESTADO_COLOR, formatNit, formatFecha, diasHastaVencimiento, type EstadoVencimiento, type Obligacion } from '@/lib/contable';
import { CalendarClock, FileText, Users, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { ActivarPlanButton } from '@/components/contable/ActivarPlanButton';

interface PanelData {
  proximosVencimientos: Array<{
    id: string; obligacion: Obligacion; periodo: string; fecha: string; estado: EstadoVencimiento;
    taxClient: { id: string; razonSocial: string; nit: string; dv: number };
  }>;
  resolucionesPorVencer: Array<{
    id: string; numero: string; fechaVigencia: string; estado: string;
    taxClient: { id: string; razonSocial: string };
  }>;
  totalClientes: number;
  suscripcion: { activa: boolean; diasRestantes: number; planExpiresAt: string | null };
}

export default function ContablePanelPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery<PanelData>({
    queryKey: ['contable-panel'],
    queryFn: () => api.get('/contable/panel').then((r) => r.data.data),
  });

  const sus = data?.suscripcion;
  // Heurística de aviso de prueba: activa pero con pocos días restantes.
  const enPrueba = sus?.activa && sus.diasRestantes <= 8;

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Hola{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Tu agenda tributaria al día.</p>
      </div>

      {/* Aviso de suscripción / prueba */}
      {sus && !sus.activa && (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">Tu acceso está en solo lectura</p>
            <p className="text-sm text-red-700/90 dark:text-red-400/90">
              Tu prueba o plan venció. Puedes consultar tus datos, pero para crear o editar necesitas activar tu plan.
            </p>
          </div>
          <ActivarPlanButton />
        </div>
      )}
      {enPrueba && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <Clock size={18} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
            Te {sus!.diasRestantes === 1 ? 'queda' : 'quedan'}{' '}
            <strong>{sus!.diasRestantes} {sus!.diasRestantes === 1 ? 'día' : 'días'}</strong> de prueba gratis.
          </p>
          <ActivarPlanButton variant="soft" />
        </div>
      )}

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatLink href="/contable/clientes" icon={Users} label="Clientes" value={data?.totalClientes ?? 0} />
        <StatLink href="/contable/vencimientos" icon={CalendarClock} label="Próximos vencimientos" value={data?.proximosVencimientos.length ?? 0} />
        <StatLink href="/contable/resoluciones" icon={FileText} label="Resoluciones por vencer" value={data?.resolucionesPorVencer.length ?? 0} />
      </div>

      {/* Próximos vencimientos */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarClock size={16} className="text-emerald-500" /> Próximos 15 días
          </h2>
          <Link href="/contable/vencimientos" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
            Ver todos <ArrowRight size={13} />
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
        ) : !data?.proximosVencimientos.length ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
            No hay vencimientos en los próximos 15 días. 🎉
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {data.proximosVencimientos.map((v) => {
              const dias = diasHastaVencimiento(v.fecha);
              const urgente = dias <= 3;
              return (
                <div key={v.id} className="flex items-center gap-3 py-2.5">
                  <div className={cn('w-1.5 h-10 rounded-full flex-shrink-0', urgente ? 'bg-red-500' : 'bg-amber-400')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{v.taxClient.razonSocial}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {OBLIGACION_LABEL[v.obligacion]} · {v.periodo} · {formatNit(v.taxClient.nit, v.taxClient.dv)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn('text-sm font-semibold', urgente ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300')}>
                      {formatFecha(v.fecha)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {dias < 0 ? `hace ${-dias} d` : dias === 0 ? 'hoy' : `en ${dias} d`}
                    </p>
                  </div>
                  <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize', ESTADO_COLOR[v.estado])}>
                    {v.estado.replace('_', ' ')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Resoluciones por vencer */}
      {!!data?.resolucionesPorVencer.length && (
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <FileText size={16} className="text-emerald-500" /> Resoluciones por vencer (30 días)
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {data.resolucionesPorVencer.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.taxClient.razonSocial}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Resolución {r.numero}</p>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 flex-shrink-0">{formatFecha(r.fechaVigencia)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatLink({ href, icon: Icon, label, value }: { href: string; icon: React.ElementType; label: string; value: number }) {
  return (
    <Link href={href} className="card p-5 card-hover flex items-center gap-4 group">
      <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white tabular leading-none">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{label}</p>
      </div>
    </Link>
  );
}
