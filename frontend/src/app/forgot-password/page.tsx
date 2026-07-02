'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Store, ArrowLeft, Loader2, Mail, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Ingresa un correo válido');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      // Even on error, show success to avoid email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[45%] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-10 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-white/5 pointer-events-none" />

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <Store size={22} className="text-blue-600" />
          </div>
          <span className="text-white font-bold text-2xl tracking-tight">Ventrix</span>
        </div>

        <div className="my-auto">
          <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mb-6">
            <Mail size={32} className="text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3 leading-tight">
            ¿Olvidaste tu<br />contraseña?
          </h2>
          <p className="text-blue-100 text-base leading-relaxed max-w-xs">
            No te preocupes. Te enviamos un enlace para que puedas crear una nueva contraseña de forma segura.
          </p>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-white p-8 min-h-screen lg:min-h-0">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Store size={18} className="text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900 tracking-tight">Ventrix</span>
          </div>

          {sent ? (
            /* ── Success state ─────────────────────────────────────────── */
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Revisa tu correo</h1>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Si el correo <span className="font-medium text-gray-700">{email}</span> está registrado,
                recibirás un enlace para restablecer tu contraseña en los próximos minutos.
              </p>
              <p className="text-xs text-gray-400 mb-6">
                ¿No llegó? Revisa la carpeta de spam o{' '}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="text-blue-600 hover:underline"
                >
                  intenta de nuevo
                </button>
                .
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft size={15} />
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            /* ── Form ──────────────────────────────────────────────────── */
            <>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
              >
                <ArrowLeft size={15} />
                Volver
              </Link>

              <h1 className="text-2xl font-bold text-gray-900 mb-1">Recuperar contraseña</h1>
              <p className="text-gray-500 text-sm mb-7">
                Ingresa tu correo y te enviaremos un enlace de recuperación.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="tu@correo.com"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50/50"
                    autoFocus
                  />
                  {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
