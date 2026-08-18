'use client';

import { useEffect, useState } from 'react';
import { Bell, BellRing, Loader2, Send, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { sellerFetch } from '@/lib/sellerApi';
import { pushSupported, subscribeSellerPush, isIOS, isStandalone } from '@/lib/sellerPush';

// Aviso al celular cuando un cliente compra por su link, con el portal cerrado.
// Muestra el estado REAL (soportado / permiso / suscrito) y guía según el
// dispositivo: en iPhone hay que instalar la app antes de que el permiso exista.
export function AvisosVendedora() {
  const [soportado, setSoportado] = useState<boolean | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission>('default');
  const [activo, setActivo] = useState(false);
  const [iosFaltaInstalar, setIosFaltaInstalar] = useState(false);
  const [busy, setBusy] = useState<'activar' | 'prueba' | null>(null);

  useEffect(() => {
    const sup = pushSupported();
    setSoportado(sup);
    if (isIOS() && !isStandalone()) setIosFaltaInstalar(true);
    if (!sup) return;
    setPermiso(Notification.permission);
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        // Si el permiso ya está dado, se re-registra en silencio: así la
        // suscripción sobrevive a un cambio de dispositivo o de vendedora.
        .then((s) => { setActivo(!!s); if (s) subscribeSellerPush(); })
        .catch(() => {});
    }
  }, []);

  async function activar() {
    setBusy('activar');
    try {
      const p = await Notification.requestPermission();
      setPermiso(p);
      if (p !== 'granted') { toast.error('No diste el permiso de notificaciones'); return; }
      const ok = await subscribeSellerPush();
      setActivo(ok);
      toast[ok ? 'success' : 'error'](ok ? '¡Avisos activados en este celular! 🔔' : 'No se pudieron activar. Intenta de nuevo.');
    } finally { setBusy(null); }
  }

  async function prueba() {
    setBusy('prueba');
    try {
      await subscribeSellerPush();
      const r = await sellerFetch<{ sent: number }>('/push/test', { method: 'POST' });
      toast.success(r?.sent ? 'Enviado. Revisa tu celular en unos segundos 📲' : 'Activa los avisos primero');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar la prueba');
    } finally { setBusy(null); }
  }

  if (soportado === false) return null;

  return (
    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
      <h2 className="text-[15px] font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-1">
        {activo ? <BellRing size={17} className="text-emerald-600" /> : <Bell size={17} className="text-slate-400" />}
        Avisos de ventas en tu celular
      </h2>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
        {activo
          ? 'Activados. Cuando alguien compre por tu link te avisamos al instante, aunque tengas esto cerrado.'
          : 'Actívalos y te avisamos apenas un cliente compre por tu link, para que le escribas de una.'}
      </p>

      {iosFaltaInstalar ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/15 px-4 py-3">
          <Smartphone size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700 dark:text-amber-300 leading-relaxed">
            En iPhone primero instala el portal: toca <b>Compartir</b> y luego <b>Agregar a inicio</b>.
            Ábrelo desde ahí y vuelve a esta pantalla para activar los avisos.
          </p>
        </div>
      ) : permiso === 'denied' ? (
        <p className="text-[12px] text-red-600 dark:text-red-400">
          Bloqueaste las notificaciones para esta página. Habilítalas en los ajustes del navegador y recarga.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {!activo && (
            <button
              onClick={activar} disabled={busy !== null}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold px-4 py-2.5 rounded-xl text-[13px] transition"
            >
              {busy === 'activar' ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />} Activar avisos
            </button>
          )}
          <button
            onClick={prueba} disabled={busy !== null}
            className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition"
          >
            {busy === 'prueba' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar prueba
          </button>
        </div>
      )}
    </div>
  );
}
