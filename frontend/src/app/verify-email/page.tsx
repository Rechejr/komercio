'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Store, Loader2, CheckCircle2, AlertCircle, Mail } from 'lucide-react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  // React Strict Mode (dev) mounts effects twice — without this guard the
  // second call reuses the now-consumed token and overwrites the success
  // state with "token already verified".
  const didVerify = useRef(false);

  useEffect(() => {
    if (didVerify.current) return;
    didVerify.current = true;

    if (!token) {
      setStatus('error');
      setErrorMsg('Este enlace de verificación no es válido.');
      return;
    }
    api
      .get(`/auth/verify-email/${token}`)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.response?.data?.error || 'El enlace expiró o no es válido.');
      });
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail) return;
    setResending(true);
    try {
      await api.post('/auth/resend-verification', { email: resendEmail });
      setResent(true);
    } catch {
      setResent(true); // don't reveal whether the email exists
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="w-full max-w-sm text-center">
      {/* Mobile logo */}
      <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
          <Store size={18} className="text-white" />
        </div>
        <span className="font-bold text-xl text-gray-900 tracking-tight">Komercio</span>
      </div>

      {status === 'verifying' && (
        <>
          <Loader2 size={40} className="animate-spin text-blue-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-1">Verificando tu correo...</h1>
          <p className="text-gray-500 text-sm">Esto solo toma un segundo.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Correo verificado!</h1>
          <p className="text-gray-500 text-sm mb-6">
            Tu cuenta quedó activada. Ya puedes iniciar sesión y empezar a usar Komercio.
          </p>
          <Link
            href="/login"
            className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Iniciar sesión
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">No pudimos verificar tu correo</h1>
          <p className="text-gray-500 text-sm mb-6">{errorMsg}</p>

          {!resent ? (
            <form onSubmit={handleResend} className="space-y-3 text-left">
              <label className="block text-sm font-medium text-gray-700">
                Reenviar enlace de verificación
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="email"
                  required
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={resending}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {resending && <Loader2 size={15} className="animate-spin" />}
                {resending ? 'Enviando...' : 'Reenviar enlace'}
              </button>
            </form>
          ) : (
            <p className="text-sm text-green-600 bg-green-50 rounded-xl py-3 px-4">
              Si el correo existe y no está verificado, te enviamos un nuevo enlace.
            </p>
          )}

          <Link href="/login" className="inline-block text-sm text-gray-500 hover:text-gray-700 mt-6">
            Volver al inicio de sesión
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[45%] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-10 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-white/5 pointer-events-none" />

        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <Store size={22} className="text-blue-600" />
          </div>
          <span className="text-white font-bold text-2xl tracking-tight">Komercio</span>
        </Link>

        <div className="my-auto">
          <h2 className="text-3xl font-bold text-white mb-3 leading-tight">
            Ya casi estás<br />dentro
          </h2>
          <p className="text-blue-100 text-base leading-relaxed max-w-xs">
            Solo falta confirmar tu correo para activar tu cuenta y empezar a vender.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-white p-8 min-h-screen lg:min-h-0">
        <Suspense fallback={<Loader2 size={32} className="animate-spin text-blue-600" />}>
          <VerifyEmailContent />
        </Suspense>
      </div>

    </div>
  );
}
