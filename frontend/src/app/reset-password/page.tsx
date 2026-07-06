'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

function ResetForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';

  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [showConf, setShowConf]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);
  const [errors, setErrors]         = useState<Record<string, string>>({});

  if (!token) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Enlace inválido</h2>
        <p className="text-gray-500 text-sm mb-6">
          Este enlace de recuperación no es válido o ya expiró.
        </p>
        <Link href="/forgot-password" className="text-emerald-600 text-sm hover:underline">
          Solicitar un nuevo enlace
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (password.length < 8) errs.password = 'Mínimo 8 caracteres';
    if (password !== confirm)  errs.confirm  = 'Las contraseñas no coinciden';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => router.replace('/login'), 3000);
    } catch (err: any) {
      setErrors({ password: err.response?.data?.error || 'El enlace expiró o no es válido. Solicita uno nuevo.' });
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">¡Contraseña actualizada!</h2>
        <p className="text-gray-500 text-sm mb-1">Tu contraseña fue cambiada exitosamente.</p>
        <p className="text-gray-400 text-xs">Redirigiendo al inicio de sesión...</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nueva contraseña</h1>
      <p className="text-gray-500 text-sm mb-7">Elige una contraseña segura para tu cuenta.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); }}
              placeholder="Mínimo 8 caracteres"
              className={cn(
                'w-full px-4 py-3 pr-10 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition bg-gray-50/50',
                errors.password ? 'border-red-300' : 'border-gray-200',
              )}
              autoFocus
            />
            <button
              type="button"
              aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Confirmar contraseña
          </label>
          <div className="relative">
            <input
              type={showConf ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: '' })); }}
              placeholder="Repite tu contraseña"
              className={cn(
                'w-full px-4 py-3 pr-10 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition bg-gray-50/50',
                errors.confirm ? 'border-red-300' : 'border-gray-200',
              )}
            />
            <button
              type="button"
              aria-label={showConf ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              onClick={() => setShowConf((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.confirm && <p className="text-red-500 text-xs mt-1">{errors.confirm}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 mt-2"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
        </button>
      </form>

      <p className="text-center text-xs text-gray-400 mt-6">
        ¿El enlace no funciona?{' '}
        <Link href="/forgot-password" className="text-emerald-600 hover:underline">
          Solicitar uno nuevo
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[45%] bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 p-10 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-white/5 pointer-events-none" />

        <div className="flex items-center gap-3">
          <img src="/ventrix-logo.svg" alt="Ventrix" width={40} height={40} className="w-10 h-10 drop-shadow-lg" draggable={false} />
          <span className="text-white font-bold text-2xl tracking-tight">Ventrix</span>
        </div>

        <div className="my-auto">
          <h2 className="text-3xl font-bold text-white mb-3 leading-tight">
            Crea una<br />nueva contraseña
          </h2>
          <p className="text-emerald-100 text-base leading-relaxed max-w-xs">
            Elige una contraseña segura de al menos 8 caracteres. Todos tus datos y configuraciones se mantienen intactos.
          </p>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-white p-8 min-h-screen lg:min-h-0">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <img src="/ventrix-logo.svg" alt="Ventrix" width={36} height={36} className="w-9 h-9" draggable={false} />
            <span className="font-bold text-xl text-gray-900 tracking-tight">Ventrix</span>
          </div>

          <Suspense fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-emerald-600" />
            </div>
          }>
            <ResetForm />
          </Suspense>

        </div>
      </div>

    </div>
  );
}
