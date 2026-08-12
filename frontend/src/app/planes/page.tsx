'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from 'next/font/google';
import { Download, Loader2, FileText, X } from 'lucide-react';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { downloadImage } from '@/lib/imageShare';
import { PLANS, TRUST_POINTS, PLANES_FAQ, resolveSeller, type PlanTier, type ProductPlan, type Seller, type BillingPeriod } from '@/lib/planesData';
import '../landing.css';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bric', weight: ['500', '600', '700', '800'], display: 'swap', preload: false });
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-inst', weight: ['400', '500', '600'], display: 'swap', preload: false });
const mono = Space_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '700'], display: 'swap', preload: false });

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
);

const money = (n: number) => `$${n.toLocaleString('es-CO')}`;

// "Comprar ahora" → crear la cuenta con intención de comprar. Al entrar por
// primera vez, la app abre el pago (que sí activa el plan). Ver BuyIntentHandler.
function buyHref(product: ProductPlan, periodKey?: string): string {
  const tipo = product.key === 'contable' ? 'contable' : 'pos';
  const per = periodKey ? `&periodo=${periodKey}` : '';
  return `/register?tipo=${tipo}&intent=pro${per}`;
}

interface CotizarState { product: ProductPlan; tier: PlanTier; period?: BillingPeriod; fecha: string; validez: string }

export default function PlanesPage() {
  const [productKey, setProductKey] = useState<'pos' | 'contable'>('pos');
  const [cotizar, setCotizar] = useState<CotizarState | null>(null);
  const [busy, setBusy] = useState(false);
  // Vendedor según ?v=<slug> en el link que compartió. Se lee en el cliente para
  // que la página siga siendo estática (sin useSearchParams / Suspense).
  const [seller, setSeller] = useState<Seller>(() => resolveSeller());
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('v');
    setSeller(resolveSeller(slug));
  }, []);

  const product = PLANS.find((p) => p.key === productKey)!;

  // Periodo de facturación elegido (para planes con mensual/trimestral/anual).
  const [posPeriod, setPosPeriod] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const periodOf = (tier: PlanTier): BillingPeriod | undefined =>
    tier.periods?.find((p) => p.key === posPeriod) ?? tier.periods?.[0];

  // Chat de WhatsApp con el vendedor, con mensaje ya escrito. `waHref` usa el
  // vendedor ya resuelto (para el href inicial). `liveWaUrl` RE-lee el ?v= en el
  // momento del clic — así siempre abre el número correcto aunque el JS aún no
  // haya terminado de hidratar (antes podía quedarse con el número por defecto).
  const GENERAL_MSG = 'Hola 👋 Vi los planes de Ventrix y quiero más información.';
  function cotizarMsg(c: CotizarState): string {
    const total = c.period ? c.period.total : c.tier.price;
    const unit = c.period ? c.period.unit : c.tier.period;
    const precio = total === 0 ? '' : ` (${money(total)}${unit})`;
    return `Hola 👋 Vi los planes de Ventrix y me interesa el ${c.product.label} · Plan ${c.tier.name}${precio}. ¿Me ayudas a activarlo?`;
  }
  function waHref(msg: string): string {
    return `https://wa.me/${seller.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
  }
  function liveWaUrl(msg: string): string {
    const slug = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('v') : null;
    return `https://wa.me/${resolveSeller(slug).phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
  }

  function abrirCotizar(p: ProductPlan, tier: PlanTier, period?: BillingPeriod) {
    const hoy = new Date();
    const vence = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
    setCotizar({ product: p, tier, period, fecha: fmt(hoy), validez: fmt(vence) });
  }

  async function descargar() {
    setBusy(true);
    try { await downloadImage('cotizacion-img', `cotizacion-ventrix-${cotizar?.product.key}-${cotizar?.tier.name}`.toLowerCase()); }
    finally { setBusy(false); }
  }

  return (
    <div className={`lp-page ${bricolage.variable} ${instrument.variable} ${mono.variable}`}>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <Link href="/" className="lp-logo"><span className="lp-logo-mark">V</span> Ventrix</Link>
          <nav className="lp-nav-actions">
            <Link href="/login" className="lp-nav-login">Ya tengo cuenta</Link>
            <span className="lp-nav-sep" aria-hidden="true" />
            <Link href="/register" className="lp-btn lp-btn-primary">Crear cuenta</Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="lp-block" style={{ paddingBottom: '1.5rem' }}>
        <div className="lp-wrap">
          <div className="lp-sec-head" style={{ marginInline: 'auto', textAlign: 'center' }}>
            <div className="lp-sec-eyebrow">Planes y precios</div>
            <h2>Elige tu plan de Ventrix</h2>
            <p style={{ marginInline: 'auto' }}>Dos productos, precios claros y sin letra chiquita. Empieza gratis y paga solo cuando lo necesites.</p>
            <div style={{ marginTop: '1rem' }}>
              <a
                href={waHref(GENERAL_MSG)}
                onClick={(e) => { e.currentTarget.href = liveWaUrl(GENERAL_MSG); }}
                target="_blank" rel="noopener noreferrer" className="lp-btn planes-btn-wa" style={{ display: 'inline-flex' }}
              >
                <WhatsAppIcon /> ¿Dudas? Escríbenos por WhatsApp
              </a>
            </div>
          </div>

          {/* Selector de producto (POS / Contable) */}
          <div className="planes-tabs" role="tablist" aria-label="Producto">
            {PLANS.map((p) => (
              <button
                key={p.key}
                role="tab"
                aria-selected={productKey === p.key}
                onClick={() => setProductKey(p.key)}
                className={`planes-tab${productKey === p.key ? ' is-active' : ''}`}
              >
                <span className="planes-tab-label">{p.label}</span>
                <span className="planes-tab-tag">{p.tagline}</span>
              </button>
            ))}
          </div>

          {product.hook && <p className="planes-hook">{product.hook}</p>}

          {/* Tarjetas de plan */}
          <div className="lp-pricing" style={{ marginTop: '1.75rem' }}>
            {product.tiers.map((tier) => {
              const bp = periodOf(tier);
              const price = bp ? bp.total : tier.price;
              const unit = bp ? bp.unit : tier.period;
              return (
              <div key={tier.name} className={`lp-plan${tier.featured ? ' lp-featured' : ''}`}>
                {tier.featured && <span className="lp-plan-tag">Recomendado</span>}
                <h3>{tier.name}</h3>

                {/* Selector de periodo (mensual / trimestral / anual) */}
                {tier.periods && (
                  <div className="planes-period" role="tablist" aria-label="Periodo de pago">
                    {tier.periods.map((p) => (
                      <button
                        key={p.key}
                        role="tab"
                        aria-selected={posPeriod === p.key}
                        onClick={() => setPosPeriod(p.key)}
                        className={`planes-period-btn${posPeriod === p.key ? ' is-active' : ''}`}
                      >
                        {p.label}
                        {p.save ? <span className="planes-period-save">-{p.save}%</span> : null}
                      </button>
                    ))}
                  </div>
                )}

                <div className="lp-price">{price === 0 ? 'Gratis' : money(price)}<small> {unit}</small></div>
                {bp?.perMonth && <p className="planes-permonth">{bp.perMonth}</p>}
                {tier.note && <p className="planes-note">{tier.note}</p>}
                <ul>{tier.features.map((f) => <li key={f}><CheckIcon />{f}</li>)}</ul>

                {tier.cta === 'buy' ? (
                  <div className="planes-cta-group">
                    <Link href={buyHref(product, bp?.key)} className="lp-btn lp-btn-primary">Comprar ahora</Link>
                    <button type="button" onClick={() => abrirCotizar(product, tier, bp)} className="lp-btn lp-btn-ghost planes-btn-cotizar">
                      <FileText size={15} /> Cotizar
                    </button>
                  </div>
                ) : (
                  <Link href={product.registerHref} className="lp-btn lp-btn-ghost">Empezar gratis</Link>
                )}
              </div>
              );
            })}
          </div>

          {/* Franja de confianza */}
          <div className="planes-trust">
            {TRUST_POINTS.map((t) => (
              <span key={t} className="planes-trust-item"><CheckIcon /> {t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="lp-block" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-sec-head" style={{ marginInline: 'auto', textAlign: 'center' }}>
            <div className="lp-sec-eyebrow">Dudas frecuentes</div>
            <h2>Lo que todos preguntan</h2>
          </div>
          <div className="lp-faq">
            {PLANES_FAQ.map(({ q, a }) => (
              <details key={q}><summary>{q} <span className="lp-plus" /></summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-foot-inner">
          <Link href="/" className="lp-logo" style={{ fontSize: '1.1rem' }}>
            <span className="lp-logo-mark" style={{ width: 26, height: 26, fontSize: '.9rem' }}>V</span> Ventrix
          </Link>
          <nav className="lp-foot-links">
            <Link href="/">Inicio</Link>
            <Link href="/contable">Para contadores</Link>
            <Link href="/login">Iniciar sesión</Link>
            <Link href="/register">Crear cuenta</Link>
          </nav>
        </div>
      </footer>

      {/* ── Modal Cotizar (resumen + descargar/compartir imagen) ─────────── */}
      {cotizar && (
        <div className="planes-modal-overlay" onClick={() => setCotizar(null)}>
          <div className="planes-modal" onClick={(e) => e.stopPropagation()}>
            <button className="planes-modal-close" aria-label="Cerrar" onClick={() => setCotizar(null)}><X size={18} /></button>

            {/* Resumen visible */}
            <div className="planes-quote-head">
              <p className="planes-quote-kicker">Cotización</p>
              <h3>{cotizar.product.label} · Plan {cotizar.tier.name}{cotizar.period ? ` · ${cotizar.period.label}` : ''}</h3>
            </div>
            <div className="planes-quote-price">
              {(cotizar.period ? cotizar.period.total : cotizar.tier.price) === 0 ? 'Gratis' : money(cotizar.period ? cotizar.period.total : cotizar.tier.price)}<small> {cotizar.period ? cotizar.period.unit : cotizar.tier.period}</small>
            </div>
            {cotizar.period?.perMonth && <p className="planes-permonth" style={{ textAlign: 'center' }}>{cotizar.period.perMonth}</p>}
            {cotizar.tier.note && <p className="planes-note" style={{ textAlign: 'center' }}>{cotizar.tier.note}</p>}
            <ul className="planes-quote-list">{cotizar.tier.features.map((f) => <li key={f}><CheckIcon />{f}</li>)}</ul>
            <p className="planes-quote-valid">Cotización válida hasta el {cotizar.validez}</p>

            <div className="planes-cta-group" style={{ marginTop: '1rem' }}>
              <Link href={buyHref(cotizar.product, cotizar.period?.key)} className="lp-btn lp-btn-primary">Comprar ahora</Link>
              <a
                href={waHref(cotizarMsg(cotizar))}
                onClick={(e) => { e.currentTarget.href = liveWaUrl(cotizarMsg(cotizar)); }}
                target="_blank" rel="noopener noreferrer" className="lp-btn planes-btn-wa"
              >
                <WhatsAppIcon /> Escribir por WhatsApp
              </a>
              <button type="button" onClick={descargar} disabled={busy} className="lp-btn lp-btn-ghost planes-btn-cotizar">
                {busy ? <Loader2 size={15} className="planes-spin" /> : <Download size={15} />} Descargar
              </button>
            </div>

            {/* Documento oculto que se captura como imagen (marca Ventrix) */}
            <div aria-hidden="true" style={{ position: 'fixed', left: -9999, top: 0, width: 420 }}>
              <div id="cotizacion-img" style={{ width: 420, background: '#ffffff', color: '#0f172a', padding: 28, fontFamily: 'system-ui, sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: '#0DA06A', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>V</div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '.14em' }}>VENTRIX</div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>{cotizar.fecha}</div>
                </div>
                <p style={{ fontSize: 11, letterSpacing: '.16em', color: '#0DA06A', fontWeight: 700, margin: '0 0 4px' }}>COTIZACIÓN</p>
                <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 2px' }}>{cotizar.product.label}</h2>
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px' }}>Plan {cotizar.tier.name}{cotizar.period ? ` · ${cotizar.period.label}` : ''} · {cotizar.product.tagline}</p>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#065f46' }}>{(cotizar.period ? cotizar.period.total : cotizar.tier.price) === 0 ? 'Gratis' : money(cotizar.period ? cotizar.period.total : cotizar.tier.price)} <span style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{cotizar.period ? cotizar.period.unit : cotizar.tier.period}</span></div>
                  {cotizar.period?.perMonth && <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>{cotizar.period.perMonth}</div>}
                  {cotizar.tier.note && <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>{cotizar.tier.note}</div>}
                </div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#334155', margin: '0 0 8px' }}>Incluye:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
                  {cotizar.tier.features.map((f) => (
                    <div key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#334155' }}>
                      <span style={{ color: '#0DA06A', fontWeight: 800 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, fontSize: 11, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Válida hasta el {cotizar.validez}</span>
                  <span>ventrix.lat</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
