'use client';

import toast from 'react-hot-toast';

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

function buildWaUrl(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, '') || '';
  if (!digits) return null;
  const fullPhone = `57${digits.replace(/^57/, '')}`;
  return `https://wa.me/${fullPhone}`;
}

/**
 * Comparte el ticket de una venta por WhatsApp como imagen (sin ningún texto):
 * en móvil usa el panel nativo de compartir, adjuntando la imagen directo al chat.
 * Si el navegador no soporta compartir archivos, descarga el PNG y abre el chat
 * de WhatsApp del cliente para que el usuario la adjunte manualmente.
 */
export async function shareSaleViaWhatsApp(
  invoiceNumber: string,
  customerPhone?: string | null,
): Promise<void> {
  const blob = await captureReceiptImage();
  if (!blob) {
    toast.error('No se pudo generar la imagen del ticket');
    return;
  }

  const file = new File([blob], `${invoiceNumber || 'ticket'}.png`, { type: 'image/png' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // el usuario cerró el panel de compartir
      // cualquier otro error cae al fallback de descarga
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

  const waUrl = buildWaUrl(customerPhone);
  if (waUrl) window.open(waUrl, '_blank');
}
