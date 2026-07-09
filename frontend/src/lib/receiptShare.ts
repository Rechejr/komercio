'use client';

import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';
import type { ReceiptItem } from '@/components/Receipt';

const PM_LABEL: Record<string, string> = {
  CASH: 'Efectivo', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata',
  TRANSFER: 'Transferencia', CARD: 'Tarjeta', MIXED: 'Mixto',
};

export function buildWhatsAppText(
  sale: any,
  items: ReceiptItem[],
  business: any,
  customerName: string | null,
): string {
  const date = new Date(sale.createdAt || Date.now());
  const dateStr = date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  const lines: string[] = [];
  lines.push(`🧾 *${business?.name || 'Ventrix'}*`);
  if (business?.city) lines.push(`📍 ${business.city}`);
  lines.push(`📅 ${dateStr} ${timeStr}  •  Factura #${sale.invoiceNumber}`);
  if (customerName) lines.push(`👤 ${customerName}`);
  lines.push('');
  lines.push('———————————————');
  for (const item of items) {
    const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
    lines.push(`• ${item.name}${qty}  →  ${formatCurrency(item.total)}`);
  }
  lines.push('———————————————');
  if (Number(sale.discountAmount) > 0) {
    lines.push(`Descuento: -${formatCurrency(Number(sale.discountAmount))}`);
  }
  lines.push(`*TOTAL: ${formatCurrency(Number(sale.total))}*`);
  lines.push(`Pago: ${PM_LABEL[sale.paymentMethod] || sale.paymentMethod}`);
  if (Number(sale.changeAmount) > 0) {
    lines.push(`Cambio: ${formatCurrency(Number(sale.changeAmount))}`);
  }
  lines.push('');
  if (sale.status === 'CANCELLED') {
    lines.push('⚠️ Esta venta fue ANULADA.');
  } else {
    lines.push('¡Gracias por su compra! 🙏');
  }
  return lines.join('\n');
}

async function captureReceiptImage(elementId = 'receipt-content'): Promise<Blob | null> {
  const node = document.getElementById(elementId);
  if (!node) return null;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(node, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    });
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  } catch {
    return null;
  }
}

function buildWaUrl(phone: string | null | undefined, text: string): string {
  const digits = phone?.replace(/\D/g, '') || '';
  const fullPhone = digits ? `57${digits.replace(/^57/, '')}` : '';
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Comparte una venta por WhatsApp como imagen (móvil, vía panel nativo de compartir)
 * o, si el navegador no soporta compartir archivos, descarga el PNG del ticket
 * y abre WhatsApp con el texto para que el usuario adjunte la imagen manualmente.
 */
export async function shareSaleViaWhatsApp(
  sale: any,
  items: ReceiptItem[],
  business: any,
  customerPhone?: string | null,
  customerName?: string | null,
): Promise<void> {
  const text = buildWhatsAppText(sale, items, business, customerName || null);
  const waUrl = buildWaUrl(customerPhone, text);
  const blob = await captureReceiptImage();

  if (!blob) {
    window.open(waUrl, '_blank');
    return;
  }

  const file = new File([blob], `${sale.invoiceNumber || 'ticket'}.png`, { type: 'image/png' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // el usuario cerró el panel de compartir
      // cualquier otro error cae al fallback de descarga + wa.me
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success('Imagen del ticket descargada. Adjúntala en el chat de WhatsApp.', { duration: 5000 });

  window.open(waUrl, '_blank');
}
