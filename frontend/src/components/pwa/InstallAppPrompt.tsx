'use client';

import { useEffect, useState } from 'react';
import { Share, SquarePlus, X, Download } from 'lucide-react';

// Aviso "Instala Ventrix como app". En Android/PC (Chrome) dispara el instalador
// nativo con un clic; en iPhone —donde Apple NO ofrece botón automático— muestra
// el instructivo (Compartir → Agregar a inicio). Se oculta si ya está instalada
// (modo standalone) y es descartable por sesión.

function isStandalone() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

const DISMISS_KEY = 'install-prompt-dismissed';

export function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<{ prompt: () => void; userChoice: Promise<unknown> } | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;

    const onBip = (e: Event) => { e.preventDefault(); setDeferred(e as never); setVisible(true); };
    window.addEventListener('beforeinstallprompt', onBip);

    // iOS no dispara beforeinstallprompt → se detecta y se muestra el instructivo.
    if (isIOS()) { setIos(true); setVisible(true); }

    const onInstalled = () => setVisible(false);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => { sessionStorage.setItem(DISMISS_KEY, '1'); setVisible(false); };
  const onInstall = async () => {
    if (deferred) {
      deferred.prompt();
      await Promise.resolve(deferred.userChoice).catch(() => {});
      setDeferred(null);
      dismiss();
    } else {
      setShowHelp(true); // iOS → mostrar pasos
    }
  };

  const stepBadge = 'flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-100 text-[12px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 dark:border-emerald-800/60 dark:bg-emerald-900/15">
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Download size={16} />
        </div>
        <p className="flex-1 text-[13px] font-medium leading-snug text-emerald-900 dark:text-emerald-200">
          Instala Ventrix como app en tu {ios ? 'iPhone' : 'dispositivo'} — acceso rápido y pantalla completa.
        </p>
        <button
          onClick={onInstall}
          className="flex-none rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-emerald-700"
        >
          {ios ? 'Cómo instalar' : 'Instalar'}
        </button>
        <button onClick={dismiss} aria-label="Cerrar aviso" className="flex-none p-1 text-emerald-700/50 transition hover:text-emerald-700 dark:text-emerald-300/50 dark:hover:text-emerald-200">
          <X size={16} />
        </button>
      </div>

      {showHelp && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center" onClick={() => setShowHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-modal dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">Instalar en tu iPhone</h3>
              <button onClick={() => setShowHelp(false)} aria-label="Cerrar" className="p-1 text-slate-400 transition hover:text-slate-600"><X size={18} /></button>
            </div>
            <p className="mb-4 text-[13px] text-slate-500 dark:text-slate-400">Desde <strong>Safari</strong>, en 3 pasos:</p>
            <ol className="space-y-3.5 text-[13.5px] text-slate-700 dark:text-slate-200">
              <li className="flex items-center gap-3">
                <span className={stepBadge}>1</span>
                <span className="flex-1">Toca el botón <strong>Compartir</strong> <Share size={15} className="mx-0.5 inline align-text-bottom text-emerald-600 dark:text-emerald-400" /> (barra de abajo).</span>
              </li>
              <li className="flex items-center gap-3">
                <span className={stepBadge}>2</span>
                <span className="flex-1">Desliza y toca <strong>“Agregar a inicio”</strong> <SquarePlus size={15} className="mx-0.5 inline align-text-bottom text-emerald-600 dark:text-emerald-400" />.</span>
              </li>
              <li className="flex items-center gap-3">
                <span className={stepBadge}>3</span>
                <span className="flex-1">Toca <strong>“Agregar”</strong> y listo — el ícono de Ventrix queda en tu pantalla de inicio.</span>
              </li>
            </ol>
            <button onClick={() => { setShowHelp(false); dismiss(); }} className="mt-6 w-full rounded-xl bg-emerald-600 py-2.5 text-[13px] font-semibold text-white transition hover:bg-emerald-700">
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
