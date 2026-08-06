'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  OBLIGACION_LABEL, urgenciaVencimiento, diasHastaVencimiento,
  type Obligacion, type EstadoVencimiento,
} from '@/lib/contable';
import { Bell, BellRing, AlertTriangle, X, ArrowRight } from 'lucide-react';
import { subscribeToPush } from '@/lib/push';
import toast from 'react-hot-toast';

interface Prioritario {
  id: string; obligacion: Obligacion; periodo: string; fecha: string;
  estado: EstadoVencimiento;
  taxClient: { id: string; razonSocial: string; nit: string; dv: number };
}

// Avisos "al abrir la agenda": un banner dentro de la app (siempre) + toasts del
// sistema operativo (con permiso del navegador, como la app de escritorio vieja).
export function AgendaAlertas() {
  const [oculto, setOculto] = useState(false);
  const [permiso, setPermiso] = useState<NotificationPermission>('default');
  const [probando, setProbando] = useState(false);
  const yaDisparado = useRef(false);

  // Manda un push de prueba a este dispositivo para confirmar que llega al móvil.
  async function enviarPrueba() {
    setProbando(true);
    try {
      // Asegura que este dispositivo esté suscrito antes de pedir la prueba.
      await subscribeToPush();
      const { data } = await api.post('/notifications/test');
      toast.success(data?.message || 'Notificación de prueba enviada.');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo enviar la prueba.');
    } finally {
      setProbando(false);
    }
  }

  const { data: items = [] } = useQuery<Prioritario[]>({
    queryKey: ['contable-prioritarios'],
    queryFn: () => api.get('/contable/prioritarios').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermiso(Notification.permission);
      // Si ya dio permiso antes, aseguramos que este dispositivo esté suscrito a
      // Web Push (nuevo celular, o suscripción perdida) para recibir las alertas
      // con la app cerrada.
      if (Notification.permission === 'granted') subscribeToPush();
    }
  }, []);

  const { vencidos, porVencer } = useMemo(() => {
    let v = 0, p = 0;
    for (const it of items) {
      if (diasHastaVencimiento(it.fecha) <= 0) v++; else p++;
    }
    return { vencidos: v, porVencer: p };
  }, [items]);

  function dispararToasts(lista: Prioritario[]) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const top = lista.slice(0, 5);
    top.forEach((v) => {
      const u = urgenciaVencimiento(v.fecha, v.estado);
      try {
        // eslint-disable-next-line no-new
        new Notification(`${u?.label ?? 'Vencimiento'} — vencimiento`, {
          body: `${v.taxClient.razonSocial} — ${OBLIGACION_LABEL[v.obligacion]} · periodo ${v.periodo}`,
          tag: `venc-${v.id}`,
          icon: '/ventrix-logo.svg',
        });
      } catch { /* algunos navegadores exigen service worker; el banner igual avisa */ }
    });
    if (lista.length > 5) {
      try {
        // eslint-disable-next-line no-new
        new Notification('Ventrix Contable', {
          body: `Y ${lista.length - 5} vencimiento(s) prioritario(s) más.`,
          tag: 'venc-mas',
        });
      } catch { /* noop */ }
    }
  }

  // Dispara los toasts UNA vez por sesión, al abrir la agenda, si hay permiso.
  useEffect(() => {
    if (yaDisparado.current || items.length === 0) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (sessionStorage.getItem('agenda-toasts-fired')) { yaDisparado.current = true; return; }
    yaDisparado.current = true;
    sessionStorage.setItem('agenda-toasts-fired', '1');
    dispararToasts(items);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function activarNotificaciones() {
    if (!('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setPermiso(p);
    if (p === 'granted') {
      // Suscribe el dispositivo para recibir avisos con la app cerrada (push).
      subscribeToPush();
      if (items.length > 0) {
        sessionStorage.setItem('agenda-toasts-fired', '1');
        yaDisparado.current = true;
        dispararToasts(items);
      }
    }
  }

  if (oculto || items.length === 0) return null;

  const hayVencidos = vencidos > 0;

  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 ${
      hayVencidos
        ? 'border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-900/15'
        : 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/15'
    }`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className={`flex-shrink-0 mt-0.5 ${hayVencidos ? 'text-red-500' : 'text-amber-500'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${hayVencidos ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {hayVencidos && `${vencidos} vencido${vencidos !== 1 ? 's' : ''}`}
            {hayVencidos && porVencer > 0 && ' · '}
            {porVencer > 0 && `${porVencer} vence${porVencer !== 1 ? 'n' : ''} esta semana`}
          </p>

          <ul className="mt-1.5 space-y-0.5">
            {items.slice(0, 3).map((v) => {
              const u = urgenciaVencimiento(v.fecha, v.estado);
              return (
                <li key={v.id} className="text-[12px] text-slate-600 dark:text-slate-400 truncate">
                  <span className={`font-medium ${hayVencidos ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>{u?.label}</span>
                  {' — '}{v.taxClient.razonSocial} · {OBLIGACION_LABEL[v.obligacion]} · {v.periodo}
                </li>
              );
            })}
            {items.length > 3 && (
              <li className="text-[12px] text-slate-400">y {items.length - 3} más…</li>
            )}
          </ul>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Link href="/contable/vencimientos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
              Ver vencimientos <ArrowRight size={13} />
            </Link>
            {permiso === 'default' && (
              <button onClick={activarNotificaciones} className="inline-flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <Bell size={13} /> Activar avisos del sistema
              </button>
            )}
            {permiso === 'granted' && (
              <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                <BellRing size={13} /> Avisos del sistema activos
                <button
                  onClick={enviarPrueba}
                  disabled={probando}
                  className="ml-1 text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline disabled:opacity-50"
                >
                  {probando ? 'enviando…' : 'Enviar prueba'}
                </button>
              </span>
            )}
            {permiso === 'denied' && (
              <span className="text-[12px] text-slate-400">Avisos del sistema bloqueados en el navegador</span>
            )}
          </div>
        </div>

        <button onClick={() => setOculto(true)} className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1" aria-label="Cerrar aviso">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
