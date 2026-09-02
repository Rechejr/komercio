'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { api } from '@/lib/api';
import { useAuthStore, type Account } from '@/store/auth.store';
import { switchToAccount, homeForBusinessType } from '@/lib/accounts';
import { Eye, EyeOff, Loader2, ArrowRight, Zap, Shield, BarChart3, Store, Calculator, MailWarning } from 'lucide-react';
import '../auth.css';

// ── Schemas ───────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});
type LoginForm = z.infer<typeof loginSchema>;

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

const RECEIPT_ITEMS = [
  { name: 'Arroz 500g',  price: '2.800' },
  { name: 'Leche 1L',    price: '3.900' },
  { name: 'Pan tajado',  price: '4.200' },
];

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

// ── Social button ─────────────────────────────────────────────────────────────
function SocialBtn({ onClick, disabled, loading, icon, label }: {
  onClick: () => void; disabled?: boolean; loading?: boolean;
  icon: React.ReactNode; label: string;
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
      ].join(' ')}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

// ── Google btn ────────────────────────────────────────────────────────────────
function GoogleBtn({ onSuccess }: { onSuccess: (user: any, token: string, accounts?: Account[]) => void }) {
  const [loading, setLoading] = useState(false);
  const login = useGoogleLogin({
    onSuccess: async (res) => {
      setLoading(true);
      try {
        const r = await api.post('/auth/google', { accessToken: res.access_token });
        // `accounts` importa cuando el correo tiene POS y Contable: sin pasarlo,
        // no aparece el selector y entra siempre al producto por defecto.
        const { user, accessToken, accounts } = r.data.data;
        onSuccess(user, accessToken, accounts);
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'No se pudo iniciar sesión con Google');
      } finally {
        setLoading(false);
      }
    },
    onError: () => toast.error('No se pudo conectar con Google'),
  });
  return <SocialBtn onClick={() => login()} loading={loading} icon={<GoogleIcon />} label="Continuar con Google" />;
}

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {children}
      {error && <p className="text-red-500 dark:text-red-400 text-[12px]">{error}</p>}
    </div>
  );
}

// ── Mini receipt (left panel) ─────────────────────────────────────────────────
function MiniReceipt() {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const start = setTimeout(() => setPlaying(true), 600);
    const cycle = setInterval(() => {
      setPlaying(false);
      setTimeout(() => setPlaying(true), 350);
    }, 5500);
    return () => { clearTimeout(start); clearInterval(cycle); };
  }, []);

  return (
    <div className={`auth-receipt${playing ? ' play' : ''}`}>
      <div className="auth-r-head">
        <div className="auth-r-brand">VENTRIX</div>
        <div className="auth-r-sub">Tienda Doña Marta · Mocoa</div>
      </div>
      <div className="auth-r-meta"><span>VENTA #0042</span><span>14:32</span></div>

      {RECEIPT_ITEMS.map((item, i) => (
        <div
          key={item.name}
          className="auth-r-line"
          style={playing ? { animationDelay: `${0.18 + i * 0.2}s` } : undefined}
        >
          <span>{item.name}</span>
          <span>{item.price}</span>
        </div>
      ))}

      <div className="auth-r-rule" />
      <div className="auth-r-total"><span>TOTAL</span><span>$ 10.900</span></div>
      <div
        className="auth-r-stamp"
        style={playing ? { animationDelay: '1.2s' } : undefined}
      >
        ✓ COBRADO
      </div>
      <div className="auth-r-barcode" />
    </div>
  );
}

// Versión contable del mock del panel izquierdo: en vez del recibo del POS,
// muestra "próximos vencimientos" para que un contador que va a entrar reconozca
// su producto (y no crea que lo mandaron al comercio).
const AGENDA_ITEMS = [
  { c: 'Comercializadora El Sol', o: 'IVA · Ene-Feb', f: '17 mar' },
  { c: 'Distribuciones Andes',    o: 'Retención · Feb', f: '19 mar' },
  { c: 'Juan Pérez',              o: 'Renta natural', f: '12 ago' },
];

function MiniAgenda() {
  return (
    <div className="auth-receipt">
      <div className="auth-r-head">
        <div className="auth-r-brand">PRÓXIMOS VENCIMIENTOS</div>
        <div className="auth-r-sub">Contabilidad Pérez · DIAN 2026</div>
      </div>
      <div className="auth-r-rule" />
      {AGENDA_ITEMS.map((v) => (
        // opacity:1 explícito: auth-r-line arranca invisible esperando la
        // animación del recibo POS, que aquí no corre.
        <div key={v.c} className="auth-r-line" style={{ opacity: 1, transform: 'none' }}>
          <span>{v.c}<br /><small style={{ opacity: 0.55 }}>{v.o}</small></span>
          <span>{v.f}</span>
        </div>
      ))}
      <div className="auth-r-rule" />
      <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.6, marginTop: 8 }}>
        Calculado automáticamente por el NIT
      </div>
    </div>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { login, setAccessToken } = useAuthStore();
  const [showPwd, setShowPwd]       = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  // Reenvío de verificación: si el login falla porque el correo no está
  // verificado, guardamos ese correo para ofrecer reenviar el enlace. El cooldown
  // (segundos) evita que se manden muchos correos seguidos.
  const [needsVerify, setNeedsVerify]     = useState<string | null>(null);
  const [resending, setResending]         = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  // Si el usuario marcó "mantener sesión" en un login anterior, al abrir /login
  // (o la app instalada, cuyo start_url es /login) intentamos revivir la sesión
  // con la cookie de refresh y entrar directo, sin pedirle la clave otra vez.
  const [checkingSession, setCheckingSession] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('ventrix-remember') === 'true',
  );

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('ventrix-remember') !== 'true') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post('/auth/refresh-token');
        const token = data.data.accessToken;
        // Fijar el token ANTES de /me: si no, /me sale sin Authorization, da 401
        // y dispara un segundo refresh por el interceptor (frágil). Con esto es
        // un solo refresh.
        setAccessToken(token);
        const me = await api.get('/auth/me');
        const u = me.data.data;
        if (cancelled) return;
        const user = {
          ...u,
          businessId: u.branch?.business?.id,
          businessName: u.branch?.business?.name,
          plan: u.branch?.business?.plan || 'free',
          businessType: u.branch?.business?.type || 'pos',
        };
        login(user, token, true, u.accounts);
        const home = homeForBusinessType(user.businessType);
        const raw = searchParams.get('redirect') || home;
        const safe = raw.startsWith('/') && !raw.startsWith('//') ? raw : home;
        router.replace(user.role === 'SUPER_ADMIN' ? '/superadmin' : safe);
      } catch {
        // Sesión no válida (cookie vencida/ausente): mostramos el formulario.
        // Se borra la marca de "mantener sesión" para no volver a intentarlo en
        // cada carga de esta pantalla: reintentar algo que ya se sabe vencido
        // solo gasta el tope de peticiones y termina bloqueando a la persona.
        localStorage.removeItem('ventrix-remember');
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuenta regresiva del cooldown de reenvío (1s a 1s hasta 0).
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Correo con acceso a POS y Contable a la vez: se muestra el selector antes de
  // redirigir. La sesión ya quedó abierta en la cuenta por defecto.
  const [chooser, setChooser] = useState<{ user: any; accounts: Account[] } | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  const enterAccount = (user: any, accessToken: string, accounts?: Account[]) => {
    login(user, accessToken, rememberMe, accounts);
    toast.success(`¡Bienvenido, ${user.name}!`);
    // El tablero por defecto depende del producto de la cuenta. Un contador va a
    // /contable; un comercio a /dashboard, como siempre. Si venía de una ruta
    // protegida (?redirect=), se respeta — las guardas de cada grupo rebotan si
    // el destino no corresponde a su tipo de cuenta.
    const home = homeForBusinessType(user.businessType);
    const raw = searchParams.get('redirect') || home;
    const safeRedirect = raw.startsWith('/') && !raw.startsWith('//') ? raw : home;
    const dest = user.role === 'SUPER_ADMIN' ? '/superadmin' : safeRedirect;
    router.replace(dest);
  };

  const handleAuthSuccess = (user: any, accessToken: string, accounts?: Account[]) => {
    // Si el correo tiene los dos productos, dejar elegir a cuál entrar.
    if (user.role !== 'SUPER_ADMIN' && accounts && accounts.length > 1) {
      login(user, accessToken, rememberMe, accounts); // sesión en la cuenta por defecto
      setChooser({ user, accounts });
      return;
    }
    enterAccount(user, accessToken, accounts);
  };

  const pickAccount = async (acc: Account) => {
    if (!chooser) return;
    // La cuenta por defecto ya tiene su sesión activa: solo redirige.
    if (acc.businessType === chooser.user.businessType) {
      router.replace(homeForBusinessType(acc.businessType));
      return;
    }
    setSwitching(acc.businessId);
    try {
      await switchToAccount(acc.businessId); // reemite token y redirige con recarga
    } catch {
      toast.error('No se pudo entrar a esa cuenta');
      setSwitching(null);
    }
  };

  const onSubmit = async (data: LoginForm) => {
    setNeedsVerify(null);
    try {
      const res = await api.post('/auth/login', data);
      const { user, accessToken, accounts } = res.data.data;
      handleAuthSuccess(user, accessToken, accounts);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Error al iniciar sesión';
      // Caso "correo sin verificar" → mostramos la tarjeta para reenviar el enlace
      // en vez de solo un aviso rojo que no da salida.
      if (err.response?.status === 403 && /verifica tu correo/i.test(msg)) {
        setNeedsVerify(data.email);
        return;
      }
      toast.error(msg);
    }
  };

  // Reenvía el correo de verificación al correo con el que se intentó entrar.
  // Reusa el endpoint existente; su respuesta es neutra (no revela si el correo
  // existe), así que el mensaje al usuario es siempre el mismo.
  const resendVerification = async () => {
    if (!needsVerify || resending || resendCooldown > 0) return;
    setResending(true);
    try {
      await api.post('/auth/resend-verification', { email: needsVerify });
      toast.success('Te reenviamos el correo. Revisa tu bandeja y la carpeta de spam.');
      setResendCooldown(60);
    } catch {
      toast.error('No se pudo reenviar. Intenta de nuevo en un momento.');
    } finally {
      setResending(false);
    }
  };

  const inputCls = [
    'w-full px-3.5 py-2.5 text-[16px] sm:text-[14px] rounded-xl border transition-all duration-150',
    'bg-slate-50 dark:bg-slate-800/60',
    'border-slate-200 dark:border-slate-700/60',
    'text-slate-900 dark:text-slate-100',
    'placeholder:text-slate-400 dark:placeholder:text-slate-500',
    'focus:outline-none focus:ring-2 focus:ring-[#0DA06A]/25 focus:border-[#0DA06A]',
  ].join(' ');

  // Mientras intenta revivir la sesión guardada, no mostramos el formulario.
  if (checkingSession) {
    return (
      <div className="animate-fade-up flex flex-col items-center justify-center gap-3 py-10 text-slate-500 dark:text-slate-400">
        <Loader2 size={30} className="animate-spin text-[#0DA06A]" />
        <p className="text-sm">Reanudando tu sesión…</p>
      </div>
    );
  }

  if (chooser) {
    const productMeta = (t: string) => t === 'contable'
      ? { label: 'Ventrix Contable', desc: 'Agenda tributaria', Icon: Calculator }
      : { label: 'Ventrix POS', desc: 'Punto de venta', Icon: Store };
    return (
      <div className="animate-fade-up">
        <div className="mb-5 text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Hola, {chooser.user.name.split(' ')[0]}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">¿A cuál cuenta quieres entrar?</p>
        </div>
        <div className="space-y-2.5">
          {chooser.accounts.map((acc) => {
            const m = productMeta(acc.businessType);
            const busy = switching === acc.businessId;
            return (
              <button
                key={acc.businessId}
                onClick={() => pickAccount(acc)}
                disabled={!!switching}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-[#0DA06A] hover:bg-[#0DA06A]/[0.04] transition text-left disabled:opacity-60"
              >
                <div className="w-11 h-11 rounded-xl bg-[#0DA06A]/10 flex items-center justify-center flex-none">
                  <m.Icon size={20} className="text-[#0DA06A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{acc.businessName || m.label}</p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">{m.label} · {m.desc}</p>
                </div>
                {busy
                  ? <Loader2 size={18} className="animate-spin text-[#0DA06A] flex-none" />
                  : <ArrowRight size={18} className="text-slate-300 dark:text-slate-600 flex-none" />}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-[12px] text-slate-400">Podrás cambiar de cuenta cuando quieras desde el menú.</p>
      </div>
    );
  }

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
              className="w-[15px] h-[15px] rounded border-slate-300 accent-[#0DA06A] cursor-pointer"
            />
            <span className="text-[13px] text-slate-600 dark:text-slate-400">Mantener sesión</span>
          </label>
          <Link href="/forgot-password" className="text-[13px] text-[#0DA06A] hover:underline font-medium">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={[
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold mt-1',
            'bg-[#0DA06A] hover:bg-[#10C07E] active:bg-[#086B4A]',
            'text-white transition-all duration-150',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            'shadow-sm shadow-[#0DA06A]/30 hover:shadow-md hover:shadow-[#0DA06A]/30',
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

      {/* Correo sin verificar → reenviar el enlace de verificación */}
      {needsVerify && (
        <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-900/15 p-4">
          <div className="flex items-start gap-2.5">
            <MailWarning size={18} className="text-amber-500 flex-none mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-300">Tu correo no está verificado</p>
              <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-0.5">
                Te enviamos un enlace a <b className="break-all">{needsVerify}</b>. Revisa tu bandeja de entrada y la carpeta de spam.
              </p>
              <button
                type="button"
                onClick={resendVerification}
                disabled={resending || resendCooldown > 0}
                className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {resending && <Loader2 size={13} className="animate-spin" />}
                {resendCooldown > 0 ? `Espera ${resendCooldown}s…` : 'Reenviar correo de verificación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entrar con Google. Si no hay client id configurado, la sección entera no
          se muestra: es preferible que no exista a que el cliente vea un botón
          que no funciona. Basta con definir NEXT_PUBLIC_GOOGLE_CLIENT_ID para
          que aparezca. */}
      {GOOGLE_CLIENT_ID && (
        <>
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/60" />
            <span className="text-[12px] text-slate-400 dark:text-slate-500 whitespace-nowrap">O continúa con</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/60" />
          </div>

          <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <GoogleBtn onSuccess={handleAuthSuccess} />
          </GoogleOAuthProvider>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function LoginContent() {
  const searchParams = useSearchParams();
  // Producto desde el que se llega al login (lo pasa el landing/registro contable
  // como ?tipo=contable). Solo cambia la CARA del panel izquierdo; el login es
  // el mismo y el destino tras entrar lo decide el businessType de la cuenta.
  const esContable = searchParams.get('tipo') === 'contable';

  // El título de la pestaña lo pone el layout raíz como POS; en el flujo contable
  // se corrige a "Ventrix Contable" para que no diga "punto de venta".
  useEffect(() => {
    if (esContable) document.title = 'Iniciar sesión | Ventrix Contable';
  }, [esContable]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left panel — green brand ─────────────────────────────────────── */}
      <div className="auth-left-panel hidden lg:flex flex-col w-[44%] relative overflow-hidden p-10">
        <div className="auth-left-dots" />
        <div className="auth-left-glow-tr" />
        <div className="auth-left-glow-bl" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="auth-logo-mark"><span>V</span></div>
          <span className="auth-brand-name">Ventrix{esContable ? ' Contable' : ''}</span>
        </div>

        {/* Hero content */}
        <div className="relative z-10 my-auto">
          <div className="auth-panel-badge">
            <span className="auth-badge-dot" />
            {esContable ? 'Agenda tributaria · DIAN 2026' : 'Sistema POS · Versión 2026'}
          </div>

          <h2 className="auth-panel-headline">
            Bienvenido<br />
            <span className="auth-panel-headline-accent">de vuelta</span>
          </h2>

          <p className="auth-panel-sub">
            {esContable
              ? <>Tus clientes y sus vencimientos DIAN<br />te esperan al día.</>
              : <>Tu negocio te espera. Cada venta, cada cliente,<br />cada peso — todo aquí.</>}
          </p>

          {esContable ? <MiniAgenda /> : <MiniReceipt />}
        </div>

        <p className="relative z-10 auth-panel-footer">
          © 2026 Ventrix · Todos los derechos reservados
        </p>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10 bg-white dark:bg-[#064e3b] min-h-screen lg:min-h-0">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="auth-mobile-logo-mark"><span>V</span></div>
            <span className="font-semibold text-[17px] text-slate-900 dark:text-white tracking-tight">Ventrix{esContable ? ' Contable' : ''}</span>
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

          <LoginForm />

          <p className="text-center text-[13px] text-slate-500 dark:text-slate-400 mt-6">
            ¿No tienes cuenta?{' '}
            <Link href={esContable ? '/register?tipo=contable' : '/register'} className="text-[#0DA06A] font-semibold hover:underline">
              Regístrate gratis
            </Link>
          </p>
        </div>
      </div>

    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#064e3b]">
        <Loader2 size={22} className="animate-spin text-[#0DA06A]" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
