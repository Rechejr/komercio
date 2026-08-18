import { sellerFetch } from './sellerApi';

// Avisos al celular de la vendedora (Web Push), con el portal cerrado. Es la
// misma mecánica de lib/push.ts, pero contra la sesión del portal (authSeller)
// en vez de la de usuarios: las vendedoras no son usuarios del sistema.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** En iPhone el push solo funciona con la app instalada en la pantalla de inicio. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches
    || (window.navigator as { standalone?: boolean }).standalone === true;
}

/** Suscribe ESTE dispositivo. Best-effort: devuelve false sin romper nada si el
 *  permiso está denegado, el navegador no soporta, o faltan las llaves VAPID. */
export async function subscribeSellerPush(): Promise<boolean> {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await sellerFetch<{ key: string | null }>('/push/vapid');
      if (!key) return false;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    }
    const json = sub.toJSON();
    await sellerFetch('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function unsubscribeSellerPush(): Promise<void> {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await sellerFetch('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch {
    /* best-effort */
  }
}
