'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Loader2, Eye, EyeOff, Check, X, ArrowRight, ChevronDown, ArrowLeft } from 'lucide-react';
import '../auth.css';

// ── Business categories ───────────────────────────────────────────────────────
const CATEGORIES = [
  { emoji: '👕', label: 'Ropa y calzado' },
  { emoji: '🍔', label: 'Restaurante o comida rápida' },
  { emoji: '💄', label: 'Artículos de belleza' },
  { emoji: '🏪', label: 'Tienda de barrio' },
  { emoji: '🛒', label: 'Minimercado' },
  { emoji: '💻', label: 'Electrónica e informática' },
  { emoji: '⚙️', label: 'Industria o manufactura' },
  { emoji: '💊', label: 'Farmacia y droguería' },
  { emoji: '🐾', label: 'Tienda de mascotas' },
  { emoji: '💼', label: 'Servicios profesionales' },
  { emoji: '📚', label: 'Papelería y librería' },
  { emoji: '🔨', label: 'Construcción y ferretería' },
  { emoji: '🏬', label: 'Otro tipo de negocio' },
];

const STEPS = ['Tu cuenta', 'Tu negocio'];

// ── Step indicator (left panel) ───────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex flex-col gap-0">
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        const state  = done ? 'done' : active ? 'active' : 'pending';
        return (
          <div key={i} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div className={`auth-step-dot ${state}`}>
                {done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`auth-step-connector ${done ? 'done' : 'pending'}`} />
              )}
            </div>
            <div className="pt-1.5">
              <p className={`text-[13px] font-semibold leading-tight auth-step-label-${state}`}>
                {label}
              </p>
              <p className={cn('text-[11px] mt-0.5', active ? 'text-slate-400' : 'text-white/20')}>
                {i === 0 ? 'Nombre, email y contraseña' : 'Nombre y categoría'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Category modal ────────────────────────────────────────────────────────────
function CategoryModal({ value, onSelect, onClose }: {
  value: string; onSelect: (v: string) => void; onClose: () => void;
}) {
  const [temp, setTemp] = useState(value);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-modal overflow-hidden border border-slate-200 dark:border-white/[0.06] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
          <h3 className="font-semibold text-[15px] text-slate-900 dark:text-white">Categoría del negocio</h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[300px] px-2 py-2 scrollbar-thin">
          {CATEGORIES.map(({ emoji, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => setTemp(label)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[13px] transition-colors',
                temp === label
                  ? 'bg-[#0DA06A]/10 text-[#086B4A] dark:text-[#6EE7B7]'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]',
              )}
            >
              <span className="text-lg leading-none w-6 text-center">{emoji}</span>
              <span className="flex-1 font-medium">{label}</span>
              {temp === label && (
                <div className="w-5 h-5 rounded-full bg-[#0DA06A] flex items-center justify-center flex-shrink-0">
                  <Check size={10} strokeWidth={3} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="px-4 py-3.5 border-t border-slate-100 dark:border-white/[0.06]">
          <button
            type="button"
            disabled={!temp}
            onClick={() => { onSelect(temp); onClose(); }}
            className="w-full bg-[#0DA06A] hover:bg-[#10C07E] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-[14px] transition-colors"
          >
            Confirmar selección
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Input helper ──────────────────────────────────────────────────────────────
const inputCls = (hasError?: boolean) => [
  'w-full px-3.5 py-2.5 text-[14px] rounded-xl border transition-all duration-150',
  'bg-slate-50 dark:bg-slate-800/60',
  hasError
    ? 'border-red-400 dark:border-red-500/60 focus:ring-red-500/30 focus:border-red-500'
    : 'border-slate-200 dark:border-slate-700/60 focus:ring-[#0DA06A]/25 focus:border-[#0DA06A]',
  'text-slate-900 dark:text-slate-100',
  'placeholder:text-slate-400 dark:placeholder:text-slate-500',
  'focus:outline-none focus:ring-2',
].join(' ');

const btnPrimary = [
  'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold mt-1',
  'bg-[#0DA06A] hover:bg-[#10C07E] active:bg-[#086B4A] text-white',
  'transition-all duration-150 shadow-sm shadow-[#0DA06A]/30 hover:shadow-md hover:shadow-[#0DA06A]/30',
  'disabled:opacity-60 disabled:cursor-not-allowed',
].join(' ');

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 0
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);

  // Step 1
  const [businessName, setBusinessName]           = useState('');
  const [businessCategory, setBusinessCategory]   = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function validateStep0() {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2)              e.name     = 'Mínimo 2 caracteres';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email   = 'Email inválido';
    if (!password || password.length < 8)                    e.password = 'Mínimo 8 caracteres';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (validateStep0()) setStep(1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!businessName.trim() || businessName.trim().length < 2) errs.businessName = 'Mínimo 2 caracteres';
    if (!businessCategory) errs.businessCategory = 'Debes elegir una categoría';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    try {
      await api.post('/auth/register', { name, email, password, businessName, businessCategory });
      toast.success('¡Cuenta creada! Revisa tu correo para verificarla.');
      router.push('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  }

  const cat = CATEGORIES.find((c) => c.label === businessCategory);

  return (
    <>
      <div className="min-h-screen flex flex-col lg:flex-row">

        {/* ── Left panel — green brand ──────────────────────────────────── */}
        <div className="auth-left-panel hidden lg:flex flex-col w-[40%] relative overflow-hidden p-10">
          <div className="auth-left-dots" />
          <div className="auth-left-glow-tr" />
          <div className="auth-left-glow-bl" />

          {/* Logo */}
          <Link href="/" className="relative z-10 flex items-center gap-3">
            <div className="auth-logo-mark"><span>V</span></div>
            <span className="auth-brand-name">Ventrix</span>
          </Link>

          {/* Step progress */}
          <div className="relative z-10 my-auto auth-panel-content">
            <div className="auth-panel-badge">
              <span className="auth-badge-dot" />
              Paso {step + 1} de {STEPS.length}
            </div>

            <h2 className="auth-panel-headline">
              {step === 0 ? (
                <>Crea tu<br /><span className="auth-panel-headline-accent">cuenta</span></>
              ) : (
                <>Tu<br /><span className="auth-panel-headline-accent">negocio</span></>
              )}
            </h2>

            <p className="auth-panel-sub">
              {step === 0
                ? 'Empieza con tu información personal.'
                : 'Cuéntanos sobre tu negocio para personalizarlo.'}
            </p>

            <StepIndicator current={step} />
          </div>

          {/* Bottom benefits */}
          <div className="relative z-10 space-y-2">
            {['Gratis para siempre en el plan básico', 'Sin tarjeta de crédito requerida', 'Listo en menos de 2 minutos'].map((b) => (
              <div key={b} className="auth-benefit-item">
                <Check size={12} className="text-[#34D399] flex-shrink-0" strokeWidth={2.5} />
                {b}
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel ───────────────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-10 bg-white dark:bg-[#0d1117] min-h-screen lg:min-h-0">
          <div className="w-full max-w-[380px]">

            {/* Mobile header */}
            <div className="flex items-center justify-between mb-8 lg:hidden">
              <div className="flex items-center gap-2.5">
                <div className="auth-mobile-logo-mark"><span>V</span></div>
                <span className="font-semibold text-[16px] text-slate-900 dark:text-white tracking-tight">Ventrix</span>
              </div>
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <div key={i} className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === step ? 'bg-[#0DA06A] w-6' : i < step ? 'bg-[#34D399] w-4' : 'bg-slate-200 dark:bg-slate-700 w-4',
                  )} />
                ))}
              </div>
            </div>

            {/* ── Step 0 — Account ─────────────────────────────────────── */}
            {step === 0 && (
              <div className="animate-fade-up">
                <div className="mb-7">
                  <h1 className="text-[24px] font-bold text-slate-900 dark:text-white tracking-tight mb-1">
                    Crea tu cuenta
                  </h1>
                  <p className="text-[14px] text-slate-500 dark:text-slate-400">
                    Empieza con tu información personal
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300">¿Cuál es tu nombre?</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })); }}
                      placeholder="Juan Pérez"
                      className={inputCls(!!errors.name)}
                    />
                    {errors.name && <p className="text-red-500 dark:text-red-400 text-[12px]">{errors.name}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300">Correo electrónico</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); }}
                      placeholder="tu@correo.com"
                      autoComplete="email"
                      className={inputCls(!!errors.email)}
                    />
                    {errors.email && <p className="text-red-500 dark:text-red-400 text-[12px]">{errors.email}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300">Contraseña</label>
                    <div className="relative">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); }}
                        placeholder="Mínimo 8 caracteres"
                        autoComplete="new-password"
                        className={`${inputCls(!!errors.password)} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((p) => !p)}
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      >
                        {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {errors.password && <p className="text-red-500 dark:text-red-400 text-[12px]">{errors.password}</p>}
                  </div>

                  <button type="button" onClick={handleNext} className={btnPrimary}>
                    Continuar
                    <ArrowRight size={15} />
                  </button>
                </div>

                <p className="text-center text-[13px] text-slate-500 dark:text-slate-400 mt-6">
                  ¿Ya tienes cuenta?{' '}
                  <Link href="/login" className="text-[#0DA06A] font-semibold hover:underline">
                    Iniciar sesión
                  </Link>
                </p>
              </div>
            )}

            {/* ── Step 1 — Business ────────────────────────────────────── */}
            {step === 1 && (
              <form onSubmit={handleSubmit} className="animate-fade-up">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white mb-6 transition-colors"
                >
                  <ArrowLeft size={14} />
                  Volver
                </button>

                <div className="mb-7">
                  <h1 className="text-[24px] font-bold text-slate-900 dark:text-white tracking-tight mb-1">
                    Datos de tu negocio
                  </h1>
                  <p className="text-[14px] text-slate-500 dark:text-slate-400">
                    Cuéntanos sobre tu negocio
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300">
                      ¿Cuál es el nombre de tu negocio?
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => { setBusinessName(e.target.value); setErrors((p) => ({ ...p, businessName: '' })); }}
                      placeholder="Tienda El Sol"
                      className={inputCls(!!errors.businessName)}
                    />
                    {errors.businessName && <p className="text-red-500 dark:text-red-400 text-[12px]">{errors.businessName}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300">
                      ¿A qué categoría pertenece?
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(true)}
                      className={cn(
                        'w-full px-3.5 py-2.5 rounded-xl border text-[14px] text-left flex items-center justify-between transition-all duration-150',
                        'bg-slate-50 dark:bg-slate-800/60',
                        'focus:outline-none focus:ring-2',
                        errors.businessCategory
                          ? 'border-red-400 dark:border-red-500/60 focus:ring-red-500/30'
                          : 'border-slate-200 dark:border-slate-700/60 focus:ring-[#0DA06A]/25 focus:border-[#0DA06A]',
                        cat ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {cat && <span className="text-base">{cat.emoji}</span>}
                        {cat ? cat.label : 'Elige una categoría'}
                      </span>
                      <ChevronDown size={15} className="text-slate-400 flex-shrink-0" />
                    </button>
                    {errors.businessCategory && (
                      <p className="text-red-500 dark:text-red-400 text-[12px]">{errors.businessCategory}</p>
                    )}
                  </div>

                  <button type="submit" disabled={loading} className={btnPrimary}>
                    {loading
                      ? <><Loader2 size={15} className="animate-spin" /> Creando tu cuenta...</>
                      : <>Comenzar a usar Ventrix <ArrowRight size={15} /></>
                    }
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>

      </div>

      {showCategoryModal && (
        <CategoryModal
          value={businessCategory}
          onSelect={(v) => { setBusinessCategory(v); setErrors((p) => ({ ...p, businessCategory: '' })); }}
          onClose={() => setShowCategoryModal(false)}
        />
      )}
    </>
  );
}
