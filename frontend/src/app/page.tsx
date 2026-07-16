'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from 'next/font/google';
import './landing.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bric',
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  preload: false,
});
const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-inst',
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: false,
});
const mono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
});

// ── Data ─────────────────────────────────────────────────────────────────────

const RECEIPT_ITEMS = [
  { name: 'Coca-Cola 400ml', price: '3.500' },
  { name: 'Pan tajado',      price: '4.200' },
  { name: 'Leche 1L',        price: '3.900' },
  { name: 'Arroz 500g',      price: '2.800' },
  { name: 'Huevos x6',       price: '4.200' },
];

const CHIPS    = ['Tiendas de barrio','Minimarkets','Restaurantes','Cafeterías','Papelerías','Licoreras','Fruver'];
const FREE_FTS = ['Ventas y recibos ilimitados','Control de inventario','Registro de clientes','Sin tarjeta de crédito'];
const PRO_FTS  = ['Todo lo del plan Gratis','Reportes de ventas y ganancias','Varios usuarios / cajeros','Soporte prioritario'];

const BENEFITS = [
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M7 14h4"/></svg>,
    title: 'Cobra sin equivocarte',
    body:  'Registra la venta, suma solo y entrega el recibo al instante. Se acabó el error de cálculo mental.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2M3 8h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zM9 12h6"/></svg>,
    title: 'Nunca te quedes sin stock',
    body:  'Tu inventario se actualiza en cada venta. Mira qué se está acabando antes de que se acabe.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    title: 'Conoce a tus clientes',
    body:  'Sabe quién te compra, qué se lleva y cada cuánto vuelve, para venderles más y mejor.',
  },
];

const FEATURES = [
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>, label: 'Módulo de Inventario' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>, label: 'Reportes Inteligentes' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: 'Multiusuario' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>, label: 'Compatible con Celular' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>, label: 'En la Nube' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label: 'Seguridad Avanzada' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>, label: 'Gestión de Compras' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M6 2h9l5 5v15H6z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>, label: 'Contabilidad' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>, label: 'Control de Pagos' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M22 12h-4l-3 9-6-18-3 9H2"/></svg>, label: 'Dashboard en Tiempo Real' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/></svg>, label: 'Bodegas y Transferencias' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>, label: 'Recibos por WhatsApp' },
];

const STEPS = [
  { n: '01', title: 'Crea tu cuenta gratis', body: 'En menos de 2 minutos y sin tarjeta de crédito.' },
  { n: '02', title: 'Carga tus productos',   body: 'Agrega tus productos y precios una sola vez.' },
  { n: '03', title: 'Empieza a cobrar',      body: 'Vende, controla tu inventario y lleva las cuentas al día.' },
];

const FAQ = [
  { q: '¿Necesito tarjeta de crédito?',     a: 'No. Empiezas gratis y sin ingresar ningún dato de pago. El plan gratis no tiene fecha de vencimiento.' },
  { q: '¿Es difícil de configurar?',         a: 'Para nada. Creas tu cuenta y cargas tus productos en un par de minutos. No hay que instalar ni descargar nada.' },
  { q: '¿Funciona en mi celular?',           a: 'Sí. Entras desde el navegador de tu celular, tablet o computador. Donde estés, tu negocio está contigo.' },
  { q: '¿Y si no sé mucho de tecnología?',   a: 'Ventrix está pensado para que cualquiera lo use. Si sabes usar WhatsApp, sabes usar Ventrix.' },
  { q: '¿Mis datos están seguros?',          a: 'Sí. Tu información es solo tuya y está protegida. Nadie más ve las ventas ni los datos de tu negocio.' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="#0DA06A" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: 3 }}
    >
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const receiptRef = useRef<HTMLDivElement>(null);
  const receiptStageRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const reveals = document.querySelectorAll<HTMLElement>('.lp-reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(el => io.observe(el));

    if (receiptRef.current) {
      const ro = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          setTimeout(() => setPlaying(true), 250);
          ro.disconnect();
        }
      }, { threshold: 0.35 });
      ro.observe(receiptRef.current);
    }

    return () => io.disconnect();
  }, []);

  // Parallax leve del recibo del hero al mover el mouse — solo en pantallas
  // con puntero fino y si el usuario no pidió reducir el movimiento.
  useEffect(() => {
    const stage = receiptStageRef.current;
    const receipt = receiptRef.current;
    if (!stage || !receipt) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    function handleMove(e: MouseEvent) {
      const rect = stage!.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      receipt!.style.transform = `rotate(${-1.4 + px * 5}deg) rotateX(${py * -6}deg) translateY(${py * -4}px)`;
    }
    function handleLeave() {
      receipt!.style.transform = 'rotate(-1.4deg)';
    }
    stage.addEventListener('mousemove', handleMove);
    stage.addEventListener('mouseleave', handleLeave);
    return () => {
      stage.removeEventListener('mousemove', handleMove);
      stage.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return (
    <div className={`lp-page ${bricolage.variable} ${instrument.variable} ${mono.variable}`}>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <Link href="/" className="lp-logo">
            <span className="lp-logo-mark">V</span> Ventrix
          </Link>
          <nav className="lp-nav-actions">
            <Link href="/login" className="lp-nav-login">Ya tengo cuenta</Link>
            <Link href="/register" className="lp-btn lp-btn-primary">Crear cuenta gratis</Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">

          <div className="lp-reveal">
            <span className="lp-eyebrow">
              <span className="lp-dot" />
              Punto de venta · Hecho para tu negocio
            </span>
            <h1>Deja el cuaderno. <span className="lp-accent">Cobra en segundos.</span></h1>
            <p className="lp-lead">
              Ventrix es el punto de venta gratis para registrar ventas, controlar tu
              inventario y conocer a tus clientes — todo desde el celular.
            </p>
            <div className="lp-hero-cta">
              <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">
                Crear cuenta gratis
              </Link>
              <span className="lp-reassure">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0DA06A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Sin tarjeta · Listo en 2 minutos
              </span>
            </div>
            <p className="lp-hero-login">
              ¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link>
            </p>
          </div>

          <div className="lp-receipt-stage lp-reveal" ref={receiptStageRef}>
            <div ref={receiptRef} className={`lp-receipt${playing ? ' play' : ''}`}>
              <div className="lp-r-head">
                <div className="lp-r-brand">VENTRIX</div>
                <div className="lp-r-sub">Tienda Doña Marta · Mocoa</div>
              </div>
              <div className="lp-r-meta"><span>VENTA #0042</span><span>14:32</span></div>

              {RECEIPT_ITEMS.map((item, i) => (
                <div
                  key={item.name}
                  className="lp-r-line"
                  style={playing ? { animationDelay: `${0.2 + i * 0.18}s` } : undefined}
                >
                  <span>{item.name}</span>
                  <span>{item.price}</span>
                </div>
              ))}

              <div className="lp-r-rule" />
              <div className="lp-r-total"><span>TOTAL</span><span>$ 18.600</span></div>
              <div className="lp-r-pay"><span>Recibido</span><span>$ 20.000</span></div>
              <div className="lp-r-pay"><span>Cambio</span><span>$ 1.400</span></div>

              <div
                className="lp-r-stamp"
                style={playing ? { animationDelay: '1.5s' } : undefined}
              >
                ✓ COBRADO
              </div>
              <div className="lp-r-barcode" />
              <div className="lp-r-foot">¡Gracias por su compra!</div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Trust strip ──────────────────────────────────────────────────── */}
      <section className="lp-trust">
        <div className="lp-wrap lp-trust-inner lp-reveal">
          <p>Negocios de todo el país ya cobran mejor con Ventrix</p>
        </div>
        <div className="lp-marquee-viewport">
          <div className="lp-marquee-track">
            {/* 3 repeticiones reales (dobladas a 6 para el loop sin costura) — con
                solo 7 rubros, 2 copias caben casi enteras en una pantalla ancha y
                se ve repetir el mismo nombre casi de inmediato cerca del centro. */}
            {[...CHIPS, ...CHIPS, ...CHIPS, ...CHIPS, ...CHIPS, ...CHIPS].map((c, i) => (
              <span key={`${c}-${i}`} className="lp-chip">{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ─────────────────────────────────────────────────────── */}
      <section className="lp-block">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-reveal">
            <div className="lp-sec-eyebrow">Por qué Ventrix</div>
            <h2>Todo tu negocio en un solo lugar</h2>
            <p>Sin planillas sueltas, sin cuentas en el cuaderno, sin adivinar cuánto ganaste.</p>
          </div>
          <div className="lp-benefits">
            {BENEFITS.map(({ icon, title, body }) => (
              <div key={title} className="lp-bcard lp-reveal">
                <div className="lp-bicon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ticker ──────────────────────────────────────────────── */}
      <section className="lp-features">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-reveal" style={{ marginInline: 'auto', textAlign: 'center' }}>
            <div className="lp-sec-eyebrow">Todo incluido</div>
            <h2>Un sistema completo, no un cuaderno digital</h2>
          </div>
        </div>
        <div className="lp-feature-viewport">
          <div className="lp-feature-track">
            {[...FEATURES, ...FEATURES].map((f, i) => (
              <div key={`${f.label}-${i}`} className="lp-feature-item">
                <span className="lp-feature-icon">{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Steps ────────────────────────────────────────────────────────── */}
      <section className="lp-block" style={{ paddingTop: 0 }}>
        <div className="lp-steps-block lp-reveal">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <div className="lp-sec-eyebrow">Cómo funciona</div>
              <h2>Listo para vender en 3 pasos</h2>
              <p>Si sabes usar WhatsApp, sabes usar Ventrix.</p>
            </div>
            <div className="lp-steps">
              {STEPS.map(({ n, title, body }) => (
                <div key={n} className="lp-step">
                  <span className="lp-step-num">{n}</span>
                  <div><h3>{title}</h3><p>{body}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Quote ────────────────────────────────────────────────────────── */}
      <section className="lp-quote-block">
        <div className="lp-wrap">
          <div className="lp-quote-bg lp-reveal">
            <span className="lp-quote-blob" aria-hidden="true" />
            <span className="lp-quote-blob b2" aria-hidden="true" />
            <div className="lp-quote">
              <div className="lp-stars" aria-hidden="true">★★★★★</div>
              <blockquote>
                &ldquo;Antes cuadraba la caja con calculadora y a veces no me daba.
                Con Ventrix cierro el día en un minuto.&rdquo;
              </blockquote>
              {/* TODO: cambiar por un cliente real con su permiso — por ahora
                  queda genérico (sin nombre inventado) para no simular una
                  reseña que no existe. */}
              <cite>— Tendero en Mocoa</cite>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section className="lp-block">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-reveal" style={{ marginInline: 'auto', textAlign: 'center' }}>
            <div className="lp-sec-eyebrow">Precios claros</div>
            <h2>Empieza gratis. Crece cuando quieras.</h2>
            <p style={{ marginInline: 'auto' }}>Sin letra chiquita. El plan gratis es gratis de verdad.</p>
          </div>
          <div className="lp-pricing">
            <div className="lp-plan lp-reveal">
              <h3>Gratis</h3>
              <div className="lp-price">$0<small> /siempre</small></div>
              <ul>{FREE_FTS.map(f => <li key={f}><CheckIcon />{f}</li>)}</ul>
              <Link href="/register" className="lp-btn lp-btn-ghost">Empezar gratis</Link>
            </div>
            <div className="lp-plan lp-featured lp-reveal">
              <span className="lp-plan-tag">Recomendado</span>
              <h3>Pro</h3>
              <div className="lp-price">$29.900<small> /mes</small></div>
              <ul>{PRO_FTS.map(f => <li key={f}><CheckIcon />{f}</li>)}</ul>
              <Link href="/register" className="lp-btn lp-btn-primary">Probar Pro</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="lp-block" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-sec-head lp-reveal" style={{ marginInline: 'auto', textAlign: 'center' }}>
            <div className="lp-sec-eyebrow">Dudas frecuentes</div>
            <h2>Lo que todos preguntan</h2>
          </div>
          <div className="lp-faq lp-reveal">
            {FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q} <span className="lp-plus" /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="lp-final">
        <div className="lp-wrap">
          <div className="lp-final-card lp-reveal">
            <span className="lp-final-glow" aria-hidden="true" />
            <h2>Empieza gratis hoy</h2>
            <p>Tu próxima venta puede quedar registrada en Ventrix.</p>
            <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">
              Crear cuenta gratis
            </Link>
            <span className="lp-fine">Sin tarjeta · Sin instalación · Cancela cuando quieras</span>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-foot-inner">
          <Link href="/" className="lp-logo" style={{ fontSize: '1.1rem' }}>
            <span className="lp-logo-mark" style={{ width: 26, height: 26, fontSize: '.9rem' }}>V</span>
            Ventrix
          </Link>
          <nav className="lp-foot-links">
            <Link href="/register">Crear cuenta</Link>
            <Link href="/login">Iniciar sesión</Link>
          </nav>
          <span>© 2026 Ventrix · Punto de venta</span>
        </div>
      </footer>

    </div>
  );
}
