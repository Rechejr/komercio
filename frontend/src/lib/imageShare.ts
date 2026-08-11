'use client';

import toast from 'react-hot-toast';

// Captura un elemento del DOM como PNG (fondo blanco, alta resolución). Reusa el
// mismo enfoque que el ticket de venta (html2canvas, carga diferida).
async function captureImage(elementId: string): Promise<Blob | null> {
  const node = document.getElementById(elementId);
  if (!node) return null;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(node, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  } catch {
    return null;
  }
}

function buildWaUrl(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, '') || '';
  if (!digits) return null;
  return `https://wa.me/57${digits.replace(/^57/, '')}`;
}

// Descarga el elemento como imagen PNG.
export async function downloadImage(elementId: string, filename: string): Promise<void> {
  const blob = await captureImage(elementId);
  if (!blob) { toast.error('No se pudo generar la imagen'); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success('Imagen descargada');
}

// Comparte el elemento como imagen por WhatsApp: en móvil usa el panel nativo de
// compartir (adjunta la imagen directo al chat); si no se puede, descarga el PNG
// y abre el chat del cliente para adjuntarla a mano.
export async function shareImageWhatsApp(elementId: string, filename: string, phone?: string | null): Promise<void> {
  const blob = await captureImage(elementId);
  if (!blob) { toast.error('No se pudo generar la imagen'); return; }

  const name = filename.endsWith('.png') ? filename : `${filename}.png`;
  const file = new File([blob], name, { type: 'image/png' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      // cualquier otro error cae al fallback de descarga
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success('Imagen descargada. Adjúntala en el chat de WhatsApp.', { duration: 5000 });

  const waUrl = buildWaUrl(phone);
  if (waUrl) window.open(waUrl, '_blank');
}
