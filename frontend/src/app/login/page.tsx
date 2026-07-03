'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Eye, EyeOff, Loader2, ArrowRight, Zap, Shield, BarChart3 } from 'lucide-react';

// ── Schemas ───────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});
type LoginForm = z.infer<typeof loginSchema>;

const FEATURES = [
  { icon: Zap,       label: 'POS rápido',    desc: 'Vende en segundos desde cualquier dispositivo' },
  { icon: Shield,    label: 'Inventario',    desc: 'Stock en tiempo real con alertas automáticas'   },
  { icon: BarChart3, label: 'Reportes',      desc: 'Métricas y estadísticas de tu negocio'          },
];

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908C16.658 14.253 17.64 11.945 17.64 9.205Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953h-1.514c-1.491 0-1.956.93-1.956 1.886v2.286h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.19 1.28-2.17 3.81.03 3.02 2.65 4.03 2.68 4.04l-.06.27Zm-5.3-17.26c.73-.89 1.94-1.56 2.94-1.6.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.01Z"/>
    </svg>
  );
}

// ── Social button ─────────────────────────────────────────────────────────────
function SocialBtn({ onClick, disabled, loading, icon, label, faded }: {
  onClick: () => void; disabled?: boolean; loading?: boolean;
  icon: React.ReactNode; label: string; faded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        'flex items-center justify-center gap-2 w-full rounded-xl py-2.5 text-[13px] font-medium transition-all duration-150',
        'border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/50',
        'text-slate-700 dark:text-slate-300',
        'hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        faded ? 'opacity-50' : '',
      ].join(' ')}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

// ── Google btn ────────────────────────────────────────────────────────────────
function GoogleBtn({ onSuccess }: { onSuccess: (user: any, token: string) => void }) {
  const [loading, setLoading] = useState(false);
  const login = useGoogleLogin({
    onSuccess: async (res) => {
      setLoading(true);
      try {
        const r = await api.post('/auth/google', { accessToken: res.access_token });
        const { user, accessToken } = r.data.data;
        onSuccess(user, accessToken);
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'No se pudo iniciar sesión con Google');
      } finally {
        setLoading(false);
      }
    },
    onError: () => toast.error('No se pudo conectar con Google'),
  });
  return <SocialBtn onClick={() => login()} loading={loading} icon={<GoogleIcon />} label="Google" />;
}

// ── Input component ───────────────────────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {children}
      {error && <p className="text-red-500 dark:text-red-400 text-[12px] flex items-center gap-1">{error}</p>}
    </div>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { login }    = useAuthStore();
  const [showPwd, setShowPwd]       = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const handleAuthSuccess = (user: any, accessToken: string) => {
    login(user, accessToken, rememberMe);
    toast.success(`¡Bienvenido, ${user.name}!`);
    const dest = user.role === 'SUPER_ADMIN'
      ? '/superadmin'
      : (searchParams.get('redirect') || '/dashboard');
    router.replace(dest);
  };

  const onSubmit = async (data: LoginForm) => {
    try {
      const res = await api.post('/auth/login', data);
      const { user, accessToken } = res.data.data;
      handleAuthSuccess(user, accessToken);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al iniciar sesión');
    }
  };

  const inputCls = [
    'w-full px-3.5 py-2.5 text-[14px] rounded-xl border transition-all duration-150',
    'bg-slate-50 dark:bg-slate-800/60',
    'border-slate-200 dark:border-slate-700/60',
    'text-slate-900 dark:text-slate-100',
    'placeholder:text-slate-400 dark:placeholder:text-slate-500',
    'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500',
    'dark:focus:border-blue-400',
  ].join(' ');

  return (
    <div className="animate-fade-up">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Correo electrónico" error={errors.email?.message}>
          <input
            {...register('email')}
            type="email"
            placeholder="tu@correo.com"
            autoComplete="email"
            className={inputCls}
          />
        </Field>

        <Field label="Contraseña" error={errors.password?.message}>
          <div className="relative">
            <input
              {...register('password')}
              type={showPwd ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              className={`${inputCls} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPwd((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-[15px] h-[15px] rounded border-slate-300 accent-blue-600 cursor-pointer"
            />
            <span className="text-[13px] text-slate-600 dark:text-slate-400">Mantener sesión</span>
          </label>
          <Link href="/forgot-password" className="text-[13px] text-blue-600 dark:text-blue-400 hover:underline font-medium">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={[
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold',
            'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
            'text-white transition-all duration-150',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            'shadow-sm shadow-blue-600/25 hover:shadow-md hover:shadow-blue-600/25',
            'mt-1',
          ].join(' ')}
        >
          {isSubmitting ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ArrowRight size={15} />
          )}
          {isSubmitting ? 'Ingresando...' : 'Iniciar sesión'}
        </button>
      </form>

      {/* Social divider */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/60" />
        <span className="text-[12px] text-slate-400 dark:text-slate-500 whitespace-nowrap">O continúa con</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/60" />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {GOOGLE_CLIENT_ID ? (
          <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <GoogleBtn onSuccess={handleAuthSuccess} />
          </GoogleOAuthProvider>
        ) : (
          <SocialBtn
            onClick={() => toast('Configura NEXT_PUBLIC_GOOGLE_CLIENT_ID', { icon: '⚙️' })}
            icon={<GoogleIcon />}
            label="Google"
            faded
          />
        )}
        <SocialBtn
          onClick={() => toast('Facebook próximamente', { icon: '🚧' })}
          icon={<FacebookIcon />}
          label="Facebook"
          faded
        />
        <SocialBtn
          onClick={() => toast('Apple próximamente', { icon: '🚧' })}
          icon={<AppleIcon />}
          label="Apple"
          faded
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#080c14]">

      {/* ── Left panel — brand ───────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col w-[42%] relative overflow-hidden p-10"
        style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0f172a 40%, #1a1040 100%)' }}
      >
        {/* Glow orbs */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full opacity-20 pointer-events-none"
             style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', transform: 'translate(-30%, -30%)' }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-10 pointer-events-none"
             style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', transform: 'translate(30%, 30%)' }} />

        {/* Grid texture */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
             style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* Logo */}
        <div className="relative flex items-center gap-3 z-10">
          <img src="/ventrix-logo.svg" alt="Ventrix" width={32} height={32} className="w-8 h-8" draggable={false} />
          <span className="text-white font-semibold text-[18px] tracking-tight">Ventrix</span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 my-auto">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[12px] font-semibold px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Sistema POS · Versión 2026
          </div>

          <h2 className="text-[38px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Administra tu<br />
            <span style={{ background: 'linear-gradient(90deg, #60a5fa, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              negocio
            </span>{' '}
            completo
          </h2>

          <p className="text-slate-400 text-[15px] leading-relaxed mb-10 max-w-[300px]">
            Todo lo que necesitas para vender, controlar inventario y crecer.
          </p>

          {/* Feature cards */}
          <div className="space-y-3">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-500/15 border border-blue-500/20">
                  <Icon size={16} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white/90">{label}</p>
                  <p className="text-[12px] text-slate-500 leading-tight mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-slate-700 text-[11px] mt-auto">
          © 2026 Ventrix · Todos los derechos reservados
        </p>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10 bg-white dark:bg-[#0d1117] min-h-screen lg:min-h-0">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <img src="/ventrix-logo.svg" alt="Ventrix" width={30} height={30} className="w-[30px] h-[30px]" draggable={false} />
            <span className="font-semibold text-[17px] text-slate-900 dark:text-white tracking-tight">Ventrix</span>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-[24px] font-bold text-slate-900 dark:text-white tracking-tight mb-1">
              Bienvenido de vuelta
            </h1>
            <p className="text-[14px] text-slate-500 dark:text-slate-400">
              Ingresa tus credenciales para continuar
            </p>
          </div>

          <Suspense fallback={
            <div className="flex items-center justify-center py-12">
              <Loader2 size={22} className="animate-spin text-blue-500" />
            </div>
          }>
            <LoginForm />
          </Suspense>

          <p className="text-center text-[13px] text-slate-500 dark:text-slate-400 mt-6">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              Regístrate gratis
            </Link>
          </p>
        </div>
      </div>

    </div>
  );
}