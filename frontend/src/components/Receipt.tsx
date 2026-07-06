'use client';

import { motion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils';
import { fadeUp, EASE, DUR } from '@/lib/motion';

const PM_LABEL: Record<string, string> = {
  CASH: 'Efectivo', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata',
  TRANSFER: 'Transferencia', CARD: 'Tarjeta', MIXED: 'Mixto',
};

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  total: number;
}

export interface ReceiptBusiness {
  name: string;
  legalName?: string | null;
  nit?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  logo?: string | null;
  settings?: Record<string, unknown> | null;
}

interface ReceiptProps {
  invoiceNumber: string;
  createdAt: string | Date;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: string;
  customerName?: string | null;
  cashierName?: string | null;
  business?: ReceiptBusiness | null;
  /** Cuando es true anima los items y el sello COBRADO */
  animated?: boolean;
}

function Dash() {
  return <div className="border-t border-dashed border-slate-200 my-2.5" />;
}

export function Receipt({
  invoiceNumber, createdAt, items, subtotal, discountAmount, taxAmount,
  total, paidAmount, changeAmount, paymentMethod,
  customerName, cashierName, business, animated = false,
}: ReceiptProps) {
  const date     = new Date(createdAt);
  const dateStr  = date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr  = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const footer   = (business?.settings?.receiptMessage as string) || '¡Gracias por su compra!';
  const isFiado  = paidAmount < total;

  // Delay del sello: después de que todos los items hacen stagger
  const stampDelay = items.length * 0.07 + 0.3;

  return (
    <div
      id="receipt-content"
      className="receipt-paper mx-auto bg-white text-slate-900"
      style={{ maxWidth: '320px', padding: '20px 24px', fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className="text-center mb-3">
        {business?.logo && (
          <img
            src={business.logo}
            alt="logo"
            style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: '50%', margin: '0 auto 8px' }}
          />
        )}
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0, color: '#0f172a' }}>
          {business?.name || 'Mi Negocio'}
        </h1>
        {(business?.address || business?.city) && (
          <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
            {[business?.address, business?.city].filter(Boolean).join(' · ')}
          </p>
        )}
        {business?.nit && (
          <p style={{ fontSize: 11, color: '#64748b', margin: '1px 0 0' }}>NIT: {business.nit}</p>
        )}
        {business?.phone && (
          <p style={{ fontSize: 11, color: '#64748b', margin: '1px 0 0' }}>Tel: {business.phone}</p>
        )}
      </div>

      <Dash />

      {/* ── Meta ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: '#334155' }}>VENTA #{invoiceNumber}</span>
        <span style={{ color: '#0ea5e9', fontWeight: 600 }}>{timeStr}</span>
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>{dateStr}</p>
      {cashierName && (
        <p style={{ fontSize: 11, color: '#64748b', margin: '1px 0 0' }}>Cajero: {cashierName}</p>
      )}
      {customerName && (
        <p style={{ fontSize: 11, color: '#334155', fontWeight: 600, margin: '2px 0 0' }}>
          Cliente: {customerName}
        </p>
      )}

      <Dash />

      {/* ── Items ──────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        {items.map((item, i) => {
          const itemContent = (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>
                  {item.name}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {formatCurrency(item.total)}
                </span>
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0' }}>
                {item.quantity} × {formatCurrency(item.unitPrice)}
                {item.discountPct > 0 ? ` · ${item.discountPct}% dto.` : ''}
              </p>
            </>
          );

          if (animated) {
            return (
              <motion.div
                key={i}
                initial="hidden"
                animate="show"
                variants={fadeUp}
                transition={{
                  delay: i * 0.07,
                  duration: DUR.md,
                  ease: EASE.spring,
                }}
                style={{ marginBottom: 8 }}
              >
                {itemContent}
              </motion.div>
            );
          }

          return (
            <div key={i} style={{ marginBottom: 8 }}>
              {itemContent}
            </div>
          );
        })}
      </div>

      <Dash />

      {/* ── Totals ─────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
          <span>Subtotal</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#d97706', marginBottom: 4 }}>
            <span>Descuento</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>− {formatCurrency(discountAmount)}</span>
          </div>
        )}
        {taxAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            <span>IVA</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(taxAmount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 900, color: '#0f172a', paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
          <span>TOTAL</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(total)}</span>
        </div>
      </div>

      {/* ── Payment ────────────────────────────────────── */}
      {!isFiado ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 3 }}>
            <span>Recibido</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>$ {formatCurrency(paidAmount)}</span>
          </div>
          {changeAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
              <span>Cambio</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>$ {formatCurrency(changeAmount)}</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span style={{
            display: 'inline-block',
            border: '2px solid #f59e0b',
            color: '#d97706',
            fontWeight: 900,
            fontSize: 13,
            padding: '3px 16px',
            borderRadius: 20,
            letterSpacing: '0.12em',
          }}>
            FIADO
          </span>
          {paidAmount > 0 && (
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Abono: {formatCurrency(paidAmount)}</p>
          )}
        </div>
      )}

      {/* ── Stamp ──────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        {animated ? (
          <motion.span
            initial={{ opacity: 0, scale: 1.4, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: -2 }}
            transition={{
              delay: stampDelay,
              duration: DUR.hero,
              ease: EASE.spring,
            }}
            style={{
              display: 'inline-block',
              border: '2.5px solid #dc2626',
              color: '#dc2626',
              fontWeight: 900,
              fontSize: 14,
              padding: '5px 20px',
              borderRadius: 8,
              letterSpacing: '0.12em',
            }}
          >
            ✓ COBRADO
          </motion.span>
        ) : (
          <span style={{
            display: 'inline-block',
            border: '2.5px solid #dc2626',
            color: '#dc2626',
            fontWeight: 900,
            fontSize: 14,
            padding: '5px 20px',
            borderRadius: 8,
            letterSpacing: '0.12em',
            transform: 'rotate(-2deg)',
          }}>
            ✓ COBRADO
          </span>
        )}
      </div>

      {/* ── Payment method ─────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <span style={{
          display: 'inline-block',
          background: '#f1f5f9',
          color: '#64748b',
          fontSize: 11,
          padding: '3px 12px',
          borderRadius: 20,
        }}>
          {PM_LABEL[paymentMethod] || paymentMethod}
        </span>
      </div>

      <Dash />

      {/* ── Barcode ────────────────────────────────────── */}
      <div
        className="receipt-barcode"
        style={{ height: 36, margin: '8px 0 4px', borderRadius: 2 }}
      />
      <p style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', margin: '0 0 12px' }}>
        {invoiceNumber}
      </p>

      <Dash />

      {/* ── Footer ─────────────────────────────────────── */}
      <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
        {footer}
      </p>
    </div>
  );
}
