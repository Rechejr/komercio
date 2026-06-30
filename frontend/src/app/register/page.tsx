'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Loader2, Store, Eye, EyeOff, Check, X } from 'lucide-react';

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

// ── Step progress ─────────────────────────────────────────────────────────────
const STEPS = ['Tu cuenta', 'Tu negocio'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex flex-col gap-0">
      {STEPS.map((label, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <div key={i} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all',
                done   && 'bg-white text-blue-600',
                active && 'bg-white text-blue-600 ring-4 ring-white/30',
                !done && !active && 'bg-white/20 text-white/60',
              )}>
                {done ? <Check size={15} strokeWidth={3} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('w-0.5 h-8 mt-1', done ? 'bg-white' : 'bg-white/25')} />
              )}
            </div>
            <div className="pt-1.5">
              <p className={cn(
                'text-sm font-semibold',
                active || done ? 'text-white' : 'text-white/50',
              )}>
                {label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Category modal ────────────────────────────────────────────────────────────
function CategoryModal({
  value,
  onSelect,
  onClose,
}: {
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const [temp, setTemp] = useState(value);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Selecciona una categoría</h3>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto max-h-72 px-2 py-2">
          {CATEGORIES.map(({ emoji, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => setTemp(label)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm transition-colors',
                temp === label ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50',
              )}
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className="flex-1 font-medium">{label}</span>
              {temp === label && (
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <Check size={11} strokeWidth={3} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            disabled={!temp}
            onClick={() => { onSelect(temp); onClose(); }}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 0 fields
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);

  // Step 1 fields
  const [businessName, setBusinessName]         = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // ── Validation ─────────────────────────────────────────────────────────────
  function validateStep0() {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = 'Mínimo 2 caracteres';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Email inválido';
    if (!password || password.length < 8) e.password = 'Mínimo 8 caracteres';
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

        {/* ── Left panel ────────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col w-[40%] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-10 relative overflow-hidden">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-white/5 pointer-events-none" />

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
              <Store size={22} className="text-blue-600" />
            </div>
            <span className="text-white font-bold text-2xl tracking-tight">Komercio</span>
          </Link>

          {/* Steps */}
          <div className="my-auto">
            <p className="text-blue-100 text-sm mb-8 font-medium uppercase tracking-wider">
              Crea tu cuenta
            </p>
            <StepIndicator current={step} />
          </div>

          {/* Benefits */}
          <div className="space-y-2 mt-auto">
            {['Gratis para siempre en el plan básico', 'Sin tarjeta de crédito requerida', 'Listo en menos de 2 minutos'].map((b) => (
              <div key={b} className="flex items-center gap-2 text-blue-100 text-xs">
                <Check size={13} className="text-white flex-shrink-0" />
                {b}
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel ───────────────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center bg-white p-8 min-h-screen lg:min-h-0">
          <div className="w-full max-w-sm">

            {/* Mobile header */}
            <div className="flex items-center justify-between mb-8 lg:hidden">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Store size={16} className="text-white" />
                </div>
                <span className="font-bold text-gray-900">Komercio</span>
              </div>
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <div key={i} className={cn(
                    'h-1 rounded-full transition-all',
                    i === step ? 'bg-blue-600 w-6' : i < step ? 'bg-blue-400 w-4' : 'bg-gray-200 w-4',
                  )} />
                ))}
              </div>
            </div>

            {/* ── Step 0: Account info ──────────────────────────────────── */}
            {step === 0 && (
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Crea tu cuenta</h1>
                <p className="text-gray-500 text-sm mb-7">Empieza con tu información personal</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">¿Cuál es tu nombre?</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })); }}
                      placeholder="Juan Pérez"
                      className={cn(
                        'w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50/50',
                        errors.name ? 'border-red-300' : 'border-gray-200',
                      )}
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Correo electrónico</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); }}
                      placeholder="tu@correo.com"
                      className={cn(
                        'w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50/50',
                        errors.email ? 'border-red-300' : 'border-gray-200',
                      )}
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                    <div className="relative">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); }}
                        placeholder="Mínimo 8 caracteres"
                        className={cn(
                          'w-full px-4 py-3 pr-10 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50/50',
                          errors.password ? 'border-red-300' : 'border-gray-200',
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                  </div>

                  <button
                    type="button"
                    onClick={handleNext}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors mt-2"
                  >
                    Continuar
                  </button>
                </div>

                <p className="text-center text-sm text-gray-500 mt-6">
                  ¿Ya tienes cuenta?{' '}
                  <Link href="/login" className="text-blue-600 font-medium hover:underline">
                    Iniciar sesión
                  </Link>
                </p>
              </div>
            )}

            {/* ── Step 1: Business info ─────────────────────────────────── */}
            {step === 1 && (
              <form onSubmit={handleSubmit}>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
                >
                  ← Volver
                </button>

                <h1 className="text-2xl font-bold text-gray-900 mb-1">Datos de tu negocio</h1>
                <p className="text-gray-500 text-sm mb-7">Cuéntanos sobre tu negocio</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      ¿Cuál es el nombre de tu negocio?
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => { setBusinessName(e.target.value); setErrors((p) => ({ ...p, businessName: '' })); }}
                      placeholder="Tienda El Sol"
                      className={cn(
                        'w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50/50',
                        errors.businessName ? 'border-red-300' : 'border-gray-200',
                      )}
                    />
                    {errors.businessName && <p className="text-red-500 text-xs mt-1">{errors.businessName}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      ¿A qué categoría pertenece tu negocio?
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(true)}
                      className={cn(
                        'w-full px-4 py-3 border rounded-xl text-sm text-left flex items-center justify-between transition',
                        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                        errors.businessCategory ? 'border-red-300' : 'border-gray-200',
                        cat ? 'bg-gray-50/50 text-gray-900' : 'bg-gray-50/50 text-gray-400',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {cat && <span>{cat.emoji}</span>}
                        {cat ? cat.label : 'Elige una categoría'}
                      </span>
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {errors.businessCategory && (
                      <p className="text-red-500 text-xs mt-1">{errors.businessCategory}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 mt-2"
                  >
                    {loading && <Loader2 size={16} className="animate-spin" />}
                    {loading ? 'Creando tu cuenta...' : 'Comenzar a usar Komercio'}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>

      </div>

      {/* Category modal */}
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
