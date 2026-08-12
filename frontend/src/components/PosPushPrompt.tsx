'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { pushSupported, subscribeToPush } from '@/lib/push';
import toast from 'react-hot-toast';
import { Bell, BellRing, X } from 'lucide-react';

// Activa las notificaciones del sistema (Web Push) para el POS: así las alertas
// de stock bajo y de cuentas por cobrar/pagar por vencer llegan al celular
// aunque la app esté cerrada. La suscripción es por usuario; este es el mismo
// mecanismo que el Contable, pero acá para los usuarios que solo usan el POS.
export function PosPushPrompt() {
  const [permiso, setPermiso] = useState<NotificationPermission>('default');
  const [soportado, setSoportado] = useState(false);
  const [probando, setProbando] = useState(false);
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    setSoportado(true);
    setPermiso(Notification.permission);
    // Si ya dio permiso antes, re-asegura la suscripción de este dispositivo
    // (celular nuevo, o suscripción perdida) para seguir recibiendo push.
    if (Notification.permission === 'granted') subscribeToPush();
  }, []);

  async function activar() {
    const p = await Notification.requestPermission();
    setPermiso(p);
    if (p === 'granted') {
      const ok = await subscribeToPush();
      toast[ok ? 'success' : 'error'](ok ? 'Avisos activados en este dispositivo' : 'No se pudieron activar los avisos');
    }
  }

  async function enviarPrueba() {
    setProbando(true);
    try {
      await subscribeToPush();
      const { data } = await api.post('/notifications/test', { product: 'pos' });
      toast.success(data?.message || 'Notificación de prueba enviada.');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo enviar la prueba.');
    } finally {
      setProbando(false);
    }
  }

  // No se muestra si el navegador no soporta push, si el usuario lo bloqueó, o si
  // ya lo activó y cerró el aviso de confirmación.
  if (!soportado || permiso === 'denied') return null;

  if (permiso === 'granted') {
    if (oculto) return null;
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/15 px-4 py-2.5">
        <BellRing size={15} className="text-emerald-600 dark:text-emerald-400 flex-none" />
        <p className="text-[13px] text-emerald-700 dark:text-emerald-300 flex-1">
          Avisos del sistema activos en este dispositivo.
        </p>
        <button onClick={enviarPrueba} disabled={probando} className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline disabled:opacity-50">
          {probando ? 'enviando…' : 'Enviar prueba'}
        </button>
        <button onClick={() => setOculto(true)} aria-label="Cerrar" className="text-emerald-500/70 hover:text-emerald-700 dark:hover:text-emerald-200 p-0.5">
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/15 px-4 py-3">
      <Bell size={17} className="text-amber-500 flex-none mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-300">Activa las notificaciones</p>
        <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-0.5">
          Recibe en tu celular —aunque la app esté cerrada— los avisos de <b>stock bajo</b> y de <b>cuentas por cobrar/pagar</b> próximas a vencer.
        </p>
      </div>
      <button
        onClick={activar}
        className="flex-none inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-semibold transition"
      >
        <Bell size={13} /> Activar avisos
      </button>
    </div>
  );
}
