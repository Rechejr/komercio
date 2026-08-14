'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { pushSupported, subscribeToPush } from '@/lib/push';
import { Bell, BellRing, Loader2, Smartphone, Send } from 'lucide-react';
import toast from 'react-hot-toast';

function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

// Control siempre visible para activar las notificaciones al celular (Web Push)
// aunque la app esté cerrada. Muestra el ESTADO real y guía según el dispositivo
// (en iPhone hay que instalar la app primero). Antes esto solo aparecía en el
// banner de la agenda cuando había vencimientos, y no avisaba si quedó activo.
export function NotificationsSetup() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  const [busy, setBusy] = useState<'activar' | 'prueba' | null>(null);

  useEffect(() => {
    const sup = pushSupported();
    setSupported(sup);
    if (isIOS() && !isStandalone()) setIosNeedsInstall(true);
    if (sup) {
      setPermiso(Notification.permission);
      if (Notification.permission === 'granted') {
        navigator.serviceWorker.ready
          .then((reg) => reg.pushManager.getSubscription())
          .then((s) => { setSubscribed(!!s); if (s) subscribeToPush(); })
          .catch(() => {});
      }
    }
  }, []);

  async function activar() {
    setBusy('activar');
    try {
      const p = await Notification.requestPermission();
      setPermiso(p);
      if (p !== 'granted') { toast.error('No se dio el permiso de notificaciones'); return; }
      const ok = await subscribeToPush();
      setSubscribed(ok);
      toast[ok ? 'success' : 'error'](ok ? '¡Notificaciones activadas en este dispositivo! 🔔' : 'No se pudieron activar. Intenta de nuevo.');
    } finally { setBusy(null); }
  }

  async function prueba() {
    setBusy('prueba');
    try {
      await subscribeToPush();
      const { data } = await api.post('/notifications/test');
      toast.success(data?.message || 'Enviada. Revisa tu celular en unos segundos 📲');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || 'No se pudo enviar la prueba.');
    } finally { setBusy(null); }
  }

  if (supported === null) return null;

  const card = 'rounded-xl border px-4 py-3.5';

  // iPhone sin instalar la app → no se puede recibir push; se explica cómo.
  if (iosNeedsInstall) {
    return (
      <div className={`${card} border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/15`}>
        <div className="flex items-start gap-3">
          <Smartphone size={18} className="text-amber-500 flex-none mt-0.5" />
          <div className="text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed">
            <b className="text-amber-700 dark:text-amber-300">Para recibir avisos en tu iPhone</b>, primero instala la app:
            toca el botón <b>Compartir</b> ⬆️ en Safari → <b>“Añadir a pantalla de inicio”</b>, y abre Ventrix desde ese ícono.
            Luego vuelve aquí y activa las notificaciones.
          </div>
        </div>
      </div>
    );
  }

  if (!supported) return null; // navegador sin soporte: no mostramos nada

  if (permiso === 'denied') {
    return (
      <div className={`${card} border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40`}>
        <div className="flex items-start gap-3">
          <Bell size={18} className="text-slate-400 flex-none mt-0.5" />
          <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
            Las notificaciones están <b>bloqueadas</b> en este dispositivo. Actívalas en los ajustes del navegador
            (o del celular, en la app instalada) y recarga.
          </p>
        </div>
      </div>
    );
  }

  if (permiso === 'granted' && subscribed) {
    return (
      <div className={`${card} border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/15 flex items-center gap-3`}>
        <BellRing size={17} className="text-emerald-600 dark:text-emerald-400 flex-none" />
        <p className="text-[13px] text-emerald-800 dark:text-emerald-300 flex-1">
          Notificaciones <b>activas</b> en este dispositivo. Te avisaremos de tus vencimientos aunque cierres la app.
        </p>
        <button onClick={prueba} disabled={busy !== null} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline disabled:opacity-50 flex-none">
          {busy === 'prueba' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar prueba
        </button>
      </div>
    );
  }

  // Soportado, aún no activadas (permiso 'default' o sin suscripción).
  return (
    <div className={`${card} border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/15`}>
      <div className="flex items-center gap-3">
        <Bell size={18} className="text-emerald-600 dark:text-emerald-400 flex-none" />
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-emerald-800 dark:text-emerald-300">Activa las notificaciones</p>
          <p className="text-[12.5px] text-slate-600 dark:text-slate-400">Recibe tus vencimientos en el celular, aunque la app esté cerrada.</p>
        </div>
        <button onClick={activar} disabled={busy !== null} className="flex-none inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-semibold transition disabled:opacity-60">
          {busy === 'activar' ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Activar
        </button>
      </div>
    </div>
  );
}
