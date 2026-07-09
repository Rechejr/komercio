'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [seconds, setSeconds] = useState(5);

  const status = searchParams.get('status') ?? '';
  const approved = status === 'APPROVED';

  // Wompi llega aquí con una navegación de página completa desde afuera del
  // dominio, así que el accessToken en memoria se perdió — hay que restaurarlo
  // antes de poder llamar /auth/me. El webhook que activa el plan en el backend
  // es asíncrono (puede tardar unos segundos), así que se reintenta unas cuantas
  // veces en vez de una sola consulta: sin esto, el usuario vuelve al dashboard
  // viéndose todavía como "Plan Gratuito" hasta la próxima vez que inicie sesión,
  // aunque el pago ya haya sido aprobado.
  useEffect(() => {
    if (!approved) return;
    let cancelled = false;

    async function refreshPlan() {
      try {
        if (!useAuthStore.getState().accessToken) {
          const refreshed = await api.post('/auth/refresh-token');
          if (cancelled) return;
          useAuthStore.getState().setAccessToken(refreshed.data.data.accessToken);
        }
        const me = await api.get('/auth/me');
        if (cancelled) return;
        const userData = me.data.data;
        const current = useAuthStore.getState().user;
        useAuthStore.getState().setUser({
          ...(current as any),
          ...userData,
          businessId: userData.branch?.business?.id ?? current?.businessId,
          businessName: userData.branch?.business?.name ?? current?.businessName,
          plan: userData.branch?.business?.plan || current?.plan || 'free',
        });
      } catch {
        // se reintenta en el siguiente tick; si nunca se logra, el próximo login lo corrige
      }
    }

    refreshPlan();
    const poll = setInterval(refreshPlan, 1500);
    const stopPoll = setTimeout(() => clearInterval(poll), 8000);
    return () => { cancelled = true; clearInterval(poll); clearTimeout(stopPoll); };
  }, [approved]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(timer);
          router.push('/dashboard');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal max-w-sm w-full p-8 text-center">
        {approved ? (
          <>
            <CheckCircle size={56} className="text-green-500 mx-auto mb-4" strokeWidth={1.5} />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">¡Pago exitoso!</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Tu Plan Pro está siendo activado. En unos segundos verás todos los beneficios desbloqueados.
            </p>
          </>
        ) : (
          <>
            <XCircle size={56} className="text-red-500 mx-auto mb-4" strokeWidth={1.5} />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Pago no completado</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              {status === 'DECLINED'
                ? 'El pago fue rechazado. Verifica los datos de tu método de pago e intenta de nuevo.'
                : 'El pago fue cancelado o expiró. Puedes volver a intentarlo desde tu cuenta.'}
            </p>
          </>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Loader2 size={13} className="animate-spin" />
          Redirigiendo al inicio en {seconds}s…
        </div>

        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="mt-4 w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors"
        >
          Ir al inicio ahora
        </button>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense>
      <PaymentResultContent />
    </Suspense>
  );
}