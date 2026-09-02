'use client';

import { useState } from 'react';

import { formatCurrency } from '@/lib/utils';

export interface CotizacionItem {
  name: string;
  code?: string | null;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxRate?: number;
  variantLabel?: string | null;
}

export interface CotizacionNegocio {
  name: string;
  legalName?: string | null;
  nit?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  logo?: string | null;
}

export interface CotizacionData {
  numero: string;
  fecha: string;              // ya formateada
  validUntil?: string | null; // ya formateada
  cliente?: string | null;
  clienteTelefono?: string | null;
  items: CotizacionItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  notas?: string | null;
  negocio?: CotizacionNegocio | null;
}

const lineTotal = (it: CotizacionItem) =>
  it.unitPrice * it.quantity * (1 - (it.discountPct || 0) / 100) * (1 + (it.taxRate || 0) / 100);

/**
 * Cotización como documento, para enviar por WhatsApp o imprimir.
 *
 * Se renderiza FUERA de pantalla y html2canvas lo captura por su id — mismo
 * mecanismo que el estado de cuenta y el ticket de venta.
 *
 * Los colores van fijos en claro (sin variantes dark:) a propósito: la imagen
 * se ve igual la envíe quien la envíe, tenga el modo oscuro puesto o no. Con
 * clases dark: el cliente recibiría un documento negro.
 */
export function CotizacionImage({ data }: { data: CotizacionData }) {
  const n = data.negocio;
  // Si el logo no carga (CORS del hosting, imagen borrada), el documento sale
  // sin él en vez de con el ícono roto: vale más la cotización que el membrete.
  const [logoRoto, setLogoRoto] = useState(false);
  return (
    <div style={{ position: 'fixed', left: -99999, top: 0, zIndex: -1, pointerEvents: 'none' }} aria-hidden>
      <div id="cotizacion-content" style={{ width: 420 }} className="bg-white p-6 font-sans text-slate-800">

        {/* ── Encabezado: identidad del negocio ─────────────────────────────── */}
        <div className="text-center border-b border-slate-200 pb-3 mb-3">
          {n?.logo && !logoRoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={n.logo}
              alt=""
              crossOrigin="anonymous"
              onError={() => setLogoRoto(true)}
              style={{ width: 56, height: 56, objectFit: 'contain', margin: '0 auto 6px' }}
            />
          )}
          <p className="text-[16px] font-bold text-slate-900 leading-tight">{n?.legalName || n?.name || ''}</p>
          {n?.nit && <p className="text-[11px] text-slate-500 mt-0.5">NIT: {n.nit}</p>}
          {(n?.address || n?.city) && (
            <p className="text-[11px] text-slate-500">{[n?.address, n?.city].filter(Boolean).join(' · ')}</p>
          )}
          {n?.phone && <p className="text-[11px] text-slate-500">Tel: {n.phone}</p>}
        </div>

        {/* ── Tipo de documento: lo primero que debe leerse ─────────────────── */}
        <div className="text-center mb-3">
          <p className="text-[15px] font-bold tracking-[0.18em] text-emerald-600">COTIZACIÓN</p>
          <p className="text-[12px] font-semibold text-slate-700 mt-0.5">{data.numero}</p>
          <p className="text-[11px] text-slate-400">{data.fecha}</p>
        </div>

        {/* ── Cliente ───────────────────────────────────────────────────────── */}
        {(data.cliente || data.clienteTelefono) && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Cliente</p>
            <p className="text-[13px] font-semibold text-slate-900">{data.cliente || 'Consumidor final'}</p>
            {data.clienteTelefono && <p className="text-[11px] text-slate-500">Tel: {data.clienteTelefono}</p>}
          </div>
        )}

        {/* ── Productos ─────────────────────────────────────────────────────── */}
        <div className="border-t border-dashed border-slate-200 pt-2.5 mb-2.5">
          {data.items.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-slate-800 leading-snug">
                  {it.name}{it.variantLabel ? ` (${it.variantLabel})` : ''}
                </p>
                <p className="text-[11px] text-slate-400">
                  {it.quantity} × {formatCurrency(it.unitPrice)}
                  {it.discountPct ? ` · −${it.discountPct}%` : ''}
                  {it.taxRate ? ` · IVA ${it.taxRate}%` : ''}
                </p>
              </div>
              <p className="text-[12.5px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                {formatCurrency(lineTotal(it))}
              </p>
            </div>
          ))}
        </div>

        {/* ── Totales ───────────────────────────────────────────────────────── */}
        <div className="border-t border-dashed border-slate-200 pt-2.5 space-y-1">
          <div className="flex justify-between text-[12px] text-slate-500">
            <span>Subtotal</span><span className="tabular-nums">{formatCurrency(data.subtotal)}</span>
          </div>
          {data.discountAmount > 0 && (
            <div className="flex justify-between text-[12px] text-emerald-600">
              <span>Descuento</span><span className="tabular-nums">−{formatCurrency(data.discountAmount)}</span>
            </div>
          )}
          {data.taxAmount > 0 && (
            <div className="flex justify-between text-[12px] text-slate-500">
              <span>IVA</span><span className="tabular-nums">{formatCurrency(data.taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-200">
            <span className="text-[15px] font-bold text-slate-900">TOTAL</span>
            <span className="text-[17px] font-bold text-slate-900 tabular-nums">{formatCurrency(data.total)}</span>
          </div>
        </div>

        {/* ── Vigencia: lo que separa una cotización de una factura ─────────── */}
        {data.validUntil && (
          <div className="mt-3 border border-amber-300 rounded-lg px-3 py-2 text-center">
            <p className="text-[11px] text-amber-700">
              Precios válidos hasta <b>{data.validUntil}</b>
            </p>
          </div>
        )}

        {/* ── Observaciones ─────────────────────────────────────────────────── */}
        {data.notas && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Observaciones</p>
            <p className="text-[11.5px] text-slate-600 leading-snug whitespace-pre-line">{data.notas}</p>
          </div>
        )}

        {/* ── Pie: deja claro que NO es una venta ───────────────────────────── */}
        <div className="mt-4 pt-3 border-t border-dashed border-slate-200 text-center">
          <p className="text-[10.5px] text-slate-400 leading-snug">
            Este documento es una cotización y no constituye una venta ni una factura.
          </p>
          <p className="text-[10.5px] text-slate-400 mt-1">¡Gracias por su interés!</p>
        </div>
      </div>
    </div>
  );
}
