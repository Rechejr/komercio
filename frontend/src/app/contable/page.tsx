import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingReveal } from '@/components/contable/LandingReveal';
import { LEGAL_READY } from '@/lib/legal';
import '../landing.css';

export const metadata: Metadata = {
  title: 'Ventrix Contable — Agenda tributaria para contadores',
  description:
    'Todos tus clientes, sus calidades del RUT y sus vencimientos DIAN en un solo lugar, con la fecha de cada obligación calculada automáticamente por el NIT. Prueba 7 días gratis, sin tarjeta.',
  keywords: [
    'agenda tributaria', 'software para contadores', 'calendario DIAN 2026',
    'vencimientos DIAN', 'contadores Colombia', 'calendario tributario', 'RUT', 'NIT',
  ],
  alternates: { canonical: 'https://www.ventrix.lat/contable' },
  openGraph: {
    title: 'Ventrix Contable — Nunca más una declaración tarde',
    description:
      'La agenda tributaria que calcula sola la fecha de cada vencimiento DIAN según el NIT. Prueba 7 días gratis.',
    url: 'https://www.ventrix.lat/contable',
    type: 'website',
  },
};

// Precio anual por oficina (contador + hasta 3 auxiliares incluidos). Precio de
// lanzamiento agresivo (~$10k/mes): un "no-brainer" frente a una sanción por
// extemporaneidad (~$520k) y horas de Excel, y fácil de decir "sí" en la primera
// prueba. Con espacio para subir con grandfathering cuando haya tracción.
const PRECIO_ANUAL = 120000;
const precioFmt = `$${PRECIO_ANUAL.toLocaleString('es-CO')}`;

const BENEFITS = [
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>,
    title: 'La fecha se calcula sola',
    body: 'El calendario DIAN 2026 ya viene cargado. Eliges cliente, obligación y periodo, y la fecha de vencimiento aparece según el último dígito del NIT. Se acabó el BUSCARV en Excel.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
    title: 'Ni una sanción por extemporaneidad',
    body: 'El panel te muestra qué vence en los próximos días, por cliente y obligación, con lo urgente en rojo. Ves lo que se viene antes de que sea tarde.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    title: 'Todos tus clientes, ordenados',
    body: 'Cada cliente con su NIT (y dígito de verificación automático), sus calidades del RUT y sus resoluciones DIAN. La cartera completa de tu oficina en un solo tablero.',
  },
];

const FEATURES = [
  'Calendario DIAN 2026', 'Dígito de verificación automático', 'Vencimientos por obligación',
  'Resoluciones DIAN', 'Régimen Simple (RST)', 'IVA bimestral y cuatrimestral',
  'Retención en la fuente', 'Renta personas naturales', 'Usuarios auxiliares',
  'En la nube', 'Datos aislados y seguros',
];

const STEPS = [
  { n: '01', title: 'Crea tu cuenta', body: '7 días de prueba gratis, sin tarjeta de crédito.' },
  { n: '02', title: 'Carga tus clientes', body: 'NIT y calidades del RUT. El dígito de verificación se calcula solo.' },
  { n: '03', title: 'Registra vencimientos', body: 'Eliges cliente y obligación, y la fecha DIAN aparece sola.' },
];

const PLAN_FTS = [
  'Clientes ilimitados', 'Calendario DIAN 2026 automático',
  'Vencimientos y resoluciones', 'Hasta 3 usuarios auxiliares', 'Soporte por WhatsApp',
];

const FAQ = [
  { q: '¿De dónde salen las fechas de vencimiento?', a: 'Del calendario tributario oficial de la DIAN para 2026, ya cargado y verificado. La app aplica el último dígito del NIT (o los dos últimos en renta de personas naturales) para proponerte la fecha exacta. Siempre puedes editarla si hay una prórroga.' },
  { q: '¿Qué obligaciones cubre la fecha automática?', a: 'IVA (bimestral y cuatrimestral), retención en la fuente, renta de personas jurídicas y naturales, y el anticipo del Régimen Simple. ICA, PILA e información exógena se registran con fecha manual, porque dependen del municipio, los empleados y los topes.' },
  { q: '¿Puedo tener ayudantes en la cuenta?', a: 'Sí. Puedes invitar auxiliares que gestionan el día a día (clientes y vencimientos) con permisos limitados. Solo tú, como dueño, administras la cuenta.' },
  { q: '¿Mis datos y los de mis clientes están seguros?', a: 'Sí. La información de tu oficina es solo tuya: ninguna otra oficina puede verla. Todo viaja cifrado y se respalda en la nube.' },
  { q: '¿Necesito instalar algo?', a: 'No. Entras desde el navegador de tu computador, tablet o celular. Nada que descargar ni actualizar.' },
];

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0DA06A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function ContableLanding() {
  return (
    <div className="lp-page">
      <LandingReveal />
      {/* Sin JS, los .lp-reveal quedarían invisibles: se fuerzan visibles. */}
      <noscript><style>{'.lp-reveal{opacity:1 !important;transform:none !important;}'}</style></noscript>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <Link href="/contable" className="lp-logo">
            <span className="lp-logo-mark">V</span> Ventrix <span className="lp-accent">Contable</span>
          </Link>
          <nav className="lp-nav-actions">
            <Link href="/planes" className="lp-nav-login">Planes y precios</Link>
            <Link href="/" className="lp-nav-login">Para comercios</Link>
            <Link href="/login?tipo=contable" className="lp-nav-login">Ya tengo cuenta</Link>
            <span className="lp-nav-sep" aria-hidden="true" />
            <Link href="/register?tipo=contable" className="lp-btn lp-btn-primary">Empieza gratis</Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-reveal">
            <span className="lp-eyebrow">
              <span className="lp-dot" />
              Agenda tributaria · Para contadores en Colombia
            </span>
            <h1>Nunca más una <span className="lp-accent">declaración tarde.</span></h1>
            <p className="lp-lead">
              Ventrix Contable reúne a todos tus clientes, sus calidades del RUT y sus
              vencimientos DIAN en un solo lugar — con la fecha de cada obligación
              calculada automáticamente por el NIT.
            </p>
            <div className="lp-hero-cta">
              <Link href="/register?tipo=contable" className="lp-btn lp-btn-primary lp-btn-lg">
                Empieza gratis 7 días
              </Link>
              <span className="lp-reassure">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0DA06A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Sin tarjeta · 7 días de prueba
              </span>
            </div>
            <p className="lp-hero-login">
              ¿Ya tienes cuenta? <Link href="/login?tipo=contable">Iniciar sesión</Link>
            </p>
          </div>

          {/* Mock del panel de vencimientos */}
          <div className="lp-receipt-stage lp-reveal">
            <div className="lp-receipt" style={{ transform: 'rotate(-1.4deg)' }}>
              <div className="lp-r-head">
                <div className="lp-r-brand">PRÓXIMOS VENCIMIENTOS</div>
                <div className="lp-r-sub">Contabilidad Pérez · 3 esta semana</div>
              </div>
              <div className="lp-r-rule" />
              {[
                { c: 'Comercializadora El Sol SAS', o: 'IVA · Ene-Feb', f: '17 mar', urg: true },
                { c: 'Distribuciones Andes', o: 'Retención · Feb', f: '19 mar', urg: true },
                { c: 'Juan Pérez', o: 'Renta natural', f: '12 ago', urg: false },
                { c: 'Panadería La 45', o: 'Simple · Mar-Abr', f: '10 jun', urg: false },
              ].map((v) => (
                <div key={v.c} className="lp-r-line" style={{ opacity: 1, transform: 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: v.urg ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                    <span>
                      {v.c}
                      <br />
                      <small style={{ opacity: 0.55 }}>{v.o}</small>
                    </span>
                  </span>
                  <span style={{ color: v.urg ? '#ef4444' : undefined, fontWeight: 700 }}>{v.f}</span>
                </div>
              ))}
              <div className="lp-r-rule" />
              <div className="lp-r-foot">Calculado automáticamente por el NIT</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Benefits ─────────────────────────────────────────────────────── */}
      <section className="lp-block">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-reveal">
            <div className="lp-sec-eyebrow">Por qué Ventrix Contable</div>
            <h2>Deja el Excel. La agenda se lleva sola.</h2>
            <p>Sin planillas por cliente, sin buscar fechas en el PDF de la DIAN, sin el miedo a que se pase un vencimiento.</p>
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
            <h2>Pensado para el día a día del contador</h2>
          </div>
        </div>
        <div className="lp-feature-viewport">
          <div className="lp-feature-track">
            {[...FEATURES, ...FEATURES].map((f, i) => (
              <div key={`${f}-${i}`} className="lp-feature-item">
                <span className="lp-feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
                <span>{f}</span>
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
              <h2>Tu agenda lista en 3 pasos</h2>
              <p>Lo que hacías en Excel, ahora en minutos.</p>
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

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section className="lp-block">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-reveal" style={{ marginInline: 'auto', textAlign: 'center' }}>
            <div className="lp-sec-eyebrow">Precio claro</div>
            <h2>Pruébalo gratis. Págalo cuando te convenza.</h2>
            <p style={{ marginInline: 'auto' }}>7 días completos sin tarjeta. Si no lo usas, no pagas nada.</p>
          </div>
          <div className="lp-pricing">
            <div className="lp-plan lp-reveal">
              <h3>Prueba</h3>
              <div className="lp-price">Gratis<small> /7 días</small></div>
              <ul>
                <li><CheckIcon />Acceso completo a todo</li>
                <li><CheckIcon />Sin tarjeta de crédito</li>
                <li><CheckIcon />Tus datos quedan guardados</li>
              </ul>
              <Link href="/register?tipo=contable" className="lp-btn lp-btn-ghost">Empezar prueba</Link>
            </div>
            <div className="lp-plan lp-featured lp-reveal">
              <span className="lp-plan-tag">Plan completo</span>
              <h3>Anual</h3>
              <div className="lp-price">{precioFmt}<small> /año</small></div>
              <ul>{PLAN_FTS.map((f) => <li key={f}><CheckIcon />{f}</li>)}</ul>
              <Link href="/register?tipo=contable" className="lp-btn lp-btn-primary">Empezar gratis</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="lp-block" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-sec-head lp-reveal" style={{ marginInline: 'auto', textAlign: 'center' }}>
            <div className="lp-sec-eyebrow">Dudas frecuentes</div>
            <h2>Lo que todo contador pregunta</h2>
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
            <h2>Empieza tu prueba gratis</h2>
            <p>El próximo vencimiento de tus clientes puede estar bajo control hoy mismo.</p>
            <Link href="/register?tipo=contable" className="lp-btn lp-btn-primary lp-btn-lg">
              Empieza gratis 7 días
            </Link>
            <span className="lp-fine">Sin tarjeta · Sin instalación · Cancela cuando quieras</span>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-foot-inner">
          <Link href="/contable" className="lp-logo" style={{ fontSize: '1.1rem' }}>
            <span className="lp-logo-mark" style={{ width: 26, height: 26, fontSize: '.9rem' }}>V</span>
            Ventrix Contable
          </Link>
          <nav className="lp-foot-links">
            <Link href="/">Para comercios</Link>
            <Link href="/register?tipo=contable">Crear cuenta</Link>
            <Link href="/login?tipo=contable">Iniciar sesión</Link>
            {LEGAL_READY && (
              <>
                <Link href="/terminos">Términos</Link>
                <Link href="/privacidad">Privacidad</Link>
              </>
            )}
          </nav>
          <span>© 2026 Ventrix · Agenda tributaria</span>
        </div>
      </footer>
    </div>
  );
}
