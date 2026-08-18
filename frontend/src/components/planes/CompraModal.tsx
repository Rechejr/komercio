'use client';

import { useState } from 'react';
import { X, Loader2, ShieldCheck } from 'lucide-react';
import type { PlanTier, ProductPlan, BillingPeriod } from '@/lib/planesData';

// Compra sin cuenta: el cliente elige plan, deja cuatro datos y se va derecho a
// pagar en Wompi. Cuando el pago se confirma, el sistema le crea la cuenta y le
// manda usuario y contraseña por correo — no tiene que registrarse antes.
//
// Antes se le mandaba a /register y ahí se caían las ventas: el registro es
// justo la fricción que la vendedora necesita quitar del medio.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface Props {
  product: ProductPlan;
  tier: PlanTier;
  period?: BillingPeriod;
  sellerSlug: string | null;
  onClose: () => void;
}

const money = (n: number) => `$${n.toLocaleString('es-CO')}`;

export function CompraModal({ product, tier, period, sellerSlug, onClose }: Props) {
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [documento, setDocumento] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const total = period ? period.total : tier.price;
  const unidad = period ? period.unit : tier.period;

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`${API}/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productType: product.key,
          period: period?.key,
          name: name.trim(),
          lastName: lastName.trim(),
          document: documento.trim(),
          email: email.trim(),
          sellerSlug,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No pudimos abrir el pago. Intenta de nuevo.');
      // Se va a Wompi. Al volver, /payment-result le dice que revise su correo.
      window.location.href = data.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos abrir el pago.');
      setBusy(false);
    }
  }

  return (
    <div className="planes-modal-overlay" onClick={onClose}>
      <div className="planes-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 430 }}>
        <button className="planes-modal-close" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>

        <div className="planes-quote-head">
          <p className="planes-quote-kicker">Estás comprando</p>
          <h3>{product.label} · Plan {tier.name}{period ? ` · ${period.label}` : ''}</h3>
        </div>
        <div className="planes-quote-price">{money(total)}<small> {unidad}</small></div>

        <form onSubmit={pagar} style={{ marginTop: '1.25rem', display: 'grid', gap: '.7rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
            <input className="planes-input" placeholder="Nombres" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            <input className="planes-input" placeholder="Apellidos" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <input className="planes-input" placeholder="Número de cédula" value={documento} inputMode="numeric"
            onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))} required />
          <input className="planes-input" placeholder="Correo electrónico" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
          <p style={{ fontSize: 12, color: '#64748b', margin: '.1rem 0 .2rem' }}>
            A este correo te enviamos tu usuario y contraseña apenas confirmemos el pago.
          </p>

          {error && (
            <p style={{ fontSize: 13, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '.6rem .75rem', margin: 0 }}>
              {error}
            </p>
          )}

          <button type="submit" className="lp-btn lp-btn-primary" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? <><Loader2 size={15} className="planes-spin" /> Abriendo el pago…</> : `Pagar ${money(total)}`}
          </button>
        </form>

        <p style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontSize: 12, color: '#64748b', marginTop: '.9rem' }}>
          <ShieldCheck size={14} /> Pago seguro con Wompi · No guardamos tus datos de tarjeta
        </p>
      </div>
    </div>
  );
}
