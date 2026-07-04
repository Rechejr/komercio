'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Suspense } from 'react';

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [seconds, setSeconds] = useState(5);

  const status = searchParams.get('status') ?? '';
  const approved = status === 'APPROVED';

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