'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Package, ShoppingCart, Check, Store } from 'lucide-react';
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
    <div className="bg-white rounded-2xl shadow-2xl p-4 w-full max-w-[280px]">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold text-gray-800 text-sm">Venta #0042</span>
        <span className="text-xs text-gray-400">hoy 2:32 pm</span>
      </div>
      {[
        { name: 'Coca Cola 350ml', qty: 2, price: '$4.600' },
        { name: 'Pan Tajado Grande', qty: 1, price: '$7.200' },
        { name: 'Leche Entera 1L', qty: 2, price: '$6.800' },
      ].map((item) => (
        <div key={item.name} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
          <span className="text-gray-500 text-xs">{item.qty}× {item.name}</span>
          <span className="font-semibold text-gray-800 text-xs">{item.price}</span>
        </div>
      ))}
      <div className="flex justify-between mt-3 pt-1">
        <span className="font-bold text-gray-900 text-sm">Total</span>
        <span className="font-bold text-blue-600 text-base">$18.600</span>
      </div>
      <div className="mt-3 bg-blue-600 text-white text-center rounded-xl py-2 text-sm font-semibold">
        Cobrar ✓
      </div>
    </div>
  );
}

function InventoryMockup() {
  const items = [
    { name: 'Arroz Diana 1kg', stock: 45, status: 'ok' as const },
    { name: 'Aceite Girasol 1L', stock: 7, status: 'low' as const },
    { name: 'Azúcar Riopaila 1kg', stock: 0, status: 'out' as const },
    { name: 'Frijol Cargamanto', stock: 22, status: 'ok' as const },
  ];
  return (
    <div className="bg-white rounded-2xl shadow-2xl p-4 w-full max-w-[280px]">
      <div className="font-bold text-gray-800 text-sm mb-3">Inventario</div>
      {items.map((item) => (
        <div key={item.name} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <span className="text-xs text-gray-500">{item.name}</span>
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            item.status === 'ok'  && 'bg-green-100 text-green-700',
            item.status === 'low' && 'bg-amber-100 text-amber-700',
            item.status === 'out' && 'bg-red-100 text-red-700',
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

const BAR_HEIGHTS = [
  'h-[40%]', 'h-[65%]', 'h-[45%]',
  'h-[80%]', 'h-[55%]', 'h-[90%]', 'h-[72%]',
];

function ReportsMockup() {
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  return (
    <div className="bg-white rounded-2xl shadow-2xl p-4 w-full max-w-[280px]">
      <div className="font-bold text-gray-800 text-sm mb-0.5">Ventas esta semana</div>
      <div className="text-2xl font-bold text-blue-600 mb-3">$842.500</div>
      <div className="flex items-end gap-1 h-14 mb-1">
        {BAR_HEIGHTS.map((hClass, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className={cn('w-full rounded-sm bg-blue-500', hClass)} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mb-3">
        {days.map((d) => (
          <div key={d} className="flex-1 text-center text-xs text-gray-400">{d}</div>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="flex-1 bg-green-50 rounded-xl p-2 text-center">
          <div className="text-xs text-gray-400">Hoy</div>
          <div className="font-bold text-green-600 text-sm">$142K</div>
        </div>
        <div className="flex-1 bg-blue-50 rounded-xl p-2 text-center">
          <div className="text-xs text-gray-400">Productos</div>
          <div className="font-bold text-blue-600 text-sm">38</div>
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
  const [fading, setFading] = useState(false);

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

  const slide = SLIDES[current];
  const Mockup = MOCKUPS[current];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left panel ────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[56%] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 relative overflow-hidden p-10">
        {/* Decorative circles */}
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute top-1/2 right-8 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <Store size={22} className="text-blue-600" />
          </div>
          <span className="text-white font-bold text-2xl tracking-tight">Komercio</span>
        </div>

        {/* Carousel content */}
        <div
          className={cn(
            'flex flex-col gap-5 my-auto relative z-10 transition-opacity duration-300',
            fading ? 'opacity-0' : 'opacity-100',
          )}
        >
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 w-fit">
            <slide.Icon size={15} className="text-white" />
            <span className="text-white/90 text-sm font-medium">{slide.label}</span>
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight max-w-md">{slide.title}</h2>
          <p className="text-blue-100 text-base leading-relaxed max-w-sm">{slide.description}</p>
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
              onClick={() => { setFading(true); setTimeout(() => { setCurrent(i); setFading(false); }, 300); }}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === current ? 'bg-white w-8' : 'bg-white/40 w-4 hover:bg-white/60',
              )}
            />
          ))}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white p-8 min-h-screen lg:min-h-0">
        {/* Mobile logo */}
        <div className="flex items-center gap-2 mb-10 lg:hidden">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Store size={18} className="text-white" />
          </div>
          <span className="font-bold text-xl text-gray-900 tracking-tight">Komercio</span>
        </div>

        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-3">
            Gestiona tu negocio de forma inteligente
          </h1>
          <p className="text-gray-500 text-base mb-8 leading-relaxed">
            Ventas, inventario y clientes en un solo lugar. Empieza gratis hoy.
          </p>

          <div className="flex flex-col gap-3 mb-10">
            <Link
              href="/register"
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl text-center text-sm transition-colors shadow-sm shadow-blue-200"
            >
              Crear cuenta gratis
            </Link>
            <Link
              href="/login"
              className="w-full border-2 border-gray-200 hover:border-gray-300 text-gray-700 hover:text-gray-900 font-semibold py-3.5 rounded-xl text-center text-sm transition-colors"
            >
              Ya tengo cuenta — Iniciar sesión
            </Link>
          </div>

          <div className="space-y-3.5">
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-center gap-3 text-sm text-gray-600">
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Check size={11} className="text-blue-600" strokeWidth={2.5} />
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
