'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Package, ShoppingCart, Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Feature slides ────────────────────────────────────────────────────────────
const SLIDES = [
  {
    Icon: ShoppingCart,
    label: 'Punto de Venta',
    title: 'Cobra rápido y sin errores',
    description: 'Registra ventas en segundos con tu catálogo de productos y genera recibos al instante.',
  },
  {
    Icon: Package,
    label: 'Inventario',
    title: 'Nunca te quedes sin stock',
    description: 'Controla cantidades en tiempo real con alertas automáticas cuando un producto esté por agotarse.',
  },
  {
    Icon: BarChart3,
    label: 'Reportes',
    title: 'Conoce tu negocio a fondo',
    description: 'Visualiza ventas diarias, ganancias y productos más vendidos con reportes fáciles de entender.',
  },
];

// ── Mini mockup components ────────────────────────────────────────────────────
function POSMockup() {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-[270px] border border-slate-100">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold text-slate-800 text-[13px]">Venta #0042</span>
        <span className="text-[11px] text-slate-400">hoy 2:32 pm</span>
      </div>
      {[
        { name: 'Coca Cola 350ml', qty: 2, price: '$4.600' },
        { name: 'Pan Tajado Grande', qty: 1, price: '$7.200' },
        { name: 'Leche Entera 1L', qty: 2, price: '$6.800' },
      ].map((item) => (
        <div key={item.name} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
          <span className="text-slate-500 text-[12px]">{item.qty}× {item.name}</span>
          <span className="font-semibold text-slate-800 text-[12px]">{item.price}</span>
        </div>
      ))}
      <div className="flex justify-between mt-3 pt-1">
        <span className="font-bold text-slate-900 text-[13px]">Total</span>
        <span className="font-bold text-blue-600 text-[15px]">$18.600</span>
      </div>
      <div className="mt-3 bg-blue-600 text-white text-center rounded-xl py-2 text-[13px] font-semibold">
        Cobrar ✓
      </div>
    </div>
  );
}

function InventoryMockup() {
  const items = [
    { name: 'Arroz Diana 1kg',      stock: 45, status: 'ok'  as const },
    { name: 'Aceite Girasol 1L',    stock: 7,  status: 'low' as const },
    { name: 'Azúcar Riopaila 1kg',  stock: 0,  status: 'out' as const },
    { name: 'Frijol Cargamanto',    stock: 22, status: 'ok'  as const },
  ];
  return (
    <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-[270px] border border-slate-100">
      <div className="font-bold text-slate-800 text-[13px] mb-3">Inventario</div>
      {items.map((item) => (
        <div key={item.name} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
          <span className="text-[12px] text-slate-500">{item.name}</span>
          <span className={cn(
            'text-[11px] px-2 py-0.5 rounded-full font-semibold',
            item.status === 'ok'  && 'bg-green-50 text-green-700',
            item.status === 'low' && 'bg-amber-50 text-amber-700',
            item.status === 'out' && 'bg-red-50 text-red-600',
          )}>
            {item.status === 'ok'  && `${item.stock} uds`}
            {item.status === 'low' && `¡Bajo! ${item.stock}`}
            {item.status === 'out' && 'Agotado'}
          </span>
        </div>
      ))}
    </div>
  );
}

const BAR_HEIGHTS = ['h-[40%]','h-[65%]','h-[45%]','h-[80%]','h-[55%]','h-[90%]','h-[72%]'];

function ReportsMockup() {
  const days = ['L','M','X','J','V','S','D'];
  return (
    <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-[270px] border border-slate-100">
      <div className="font-bold text-slate-800 text-[13px] mb-0.5">Ventas esta semana</div>
      <div className="text-[22px] font-bold text-blue-600 mb-3">$842.500</div>
      <div className="flex items-end gap-1 h-12 mb-1">
        {BAR_HEIGHTS.map((hClass, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div className={cn('w-full rounded-sm bg-blue-500/80', hClass)} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mb-3">
        {days.map((d) => (
          <div key={d} className="flex-1 text-center text-[10px] text-slate-400">{d}</div>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="flex-1 bg-green-50 rounded-xl p-2 text-center">
          <div className="text-[10px] text-slate-400">Hoy</div>
          <div className="font-bold text-green-600 text-[13px]">$142K</div>
        </div>
        <div className="flex-1 bg-blue-50 rounded-xl p-2 text-center">
          <div className="text-[10px] text-slate-400">Productos</div>
          <div className="font-bold text-blue-600 text-[13px]">38</div>
        </div>
      </div>
    </div>
  );
}

const MOCKUPS = [POSMockup, InventoryMockup, ReportsMockup];

const BENEFITS = [
  'Plan gratuito, sin tarjeta de crédito',
  'Configura tu negocio en menos de 2 minutos',
  'Ventas, inventario y clientes en un solo lugar',
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [current, setCurrent] = useState(0);
  const [fading, setFading]   = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrent((c) => (c + 1) % SLIDES.length);
        setFading(false);
      }, 300);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const slide  = SLIDES[current];
  const Mockup = MOCKUPS[current];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#080c14]">

      {/* ── Left panel — brand / carousel ───────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col w-[54%] relative overflow-hidden p-10"
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
        <div className="relative z-10 flex items-center gap-3">
          <img src="/ventrix-logo.svg" alt="Ventrix" width={30} height={30} className="w-[30px] h-[30px]" draggable={false} />
          <span className="text-white font-semibold text-[18px] tracking-tight">Ventrix</span>
        </div>

        {/* Carousel content */}
        <div
          className={cn(
            'flex flex-col gap-5 my-auto relative z-10 transition-opacity duration-300',
            fading ? 'opacity-0' : 'opacity-100',
          )}
        >
          {/* Feature chip */}
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[12px] font-semibold px-3 py-1.5 rounded-full w-fit">
            <slide.Icon size={13} />
            {slide.label}
          </div>

          <h2 className="text-[34px] font-bold text-white leading-[1.2] tracking-tight max-w-[380px]">
            {slide.title}
          </h2>
          <p className="text-slate-400 text-[14px] leading-relaxed max-w-[320px]">
            {slide.description}
          </p>

          {/* Mockup card */}
          <div className="mt-2">
            <Mockup />
          </div>
        </div>

        {/* Dot navigation */}
        <div className="flex gap-2 relative z-10 mt-auto">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir a diapositiva ${i + 1}`}
              onClick={() => {
                setFading(true);
                setTimeout(() => { setCurrent(i); setFading(false); }, 300);
              }}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === current ? 'bg-white w-8' : 'bg-white/20 w-4 hover:bg-white/40',
              )}
            />
          ))}
        </div>
      </div>

      {/* ── Right panel — CTA ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10 bg-white dark:bg-[#0d1117] min-h-screen lg:min-h-0">
        <div className="w-full max-w-[360px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <img src="/ventrix-logo.svg" alt="Ventrix" width={30} height={30} className="w-[30px] h-[30px]" draggable={false} />
            <span className="font-semibold text-[17px] text-slate-900 dark:text-white tracking-tight">Ventrix</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-[26px] font-bold text-slate-900 dark:text-white leading-[1.2] tracking-tight mb-2.5">
              Gestiona tu negocio<br />de forma inteligente
            </h1>
            <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Ventas, inventario y clientes en un solo lugar.<br />
              Empieza gratis hoy.
            </p>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col gap-2.5 mb-8">
            <Link
              href="/register"
              className={[
                'w-full flex items-center justify-center gap-2',
                'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
                'text-white font-semibold py-3 rounded-xl text-[14px]',
                'transition-all duration-150 shadow-sm shadow-blue-600/25 hover:shadow-md hover:shadow-blue-600/25',
              ].join(' ')}
            >
              Crear cuenta gratis
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/login"
              className={[
                'w-full flex items-center justify-center',
                'border border-slate-200 dark:border-slate-700/60',
                'text-slate-700 dark:text-slate-300 font-semibold py-3 rounded-xl text-[14px]',
                'hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600',
                'transition-all duration-150',
              ].join(' ')}
            >
              Ya tengo cuenta — Iniciar sesión
            </Link>
          </div>

          {/* Benefits */}
          <div className="space-y-3">
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-center gap-2.5 text-[13px] text-slate-600 dark:text-slate-400">
                <div className="w-[18px] h-[18px] rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0 border border-blue-100 dark:border-blue-500/20">
                  <Check size={10} className="text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
                </div>
                {b}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}