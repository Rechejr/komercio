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

// Imprime el elemento como imagen, en una hoja aparte.
//
// Va dentro de un iframe propio a propósito: la hoja de impresión de la app
// está armada para el ticket térmico (@page 80mm) y un documento tamaño carta
// —una cotización, por ejemplo— saldría cortado si se usara window.print().
// El iframe trae su propio @page y no hereda nada.
export async function printImage(elementId: string): Promise<void> {
  const blob = await captureImage(elementId);
  if (!blob) { toast.error('No se pudo generar la imagen'); return; }

  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  // La impresión se dispara cuando la imagen ya cargó dentro del iframe; si se
  // hiciera al cargar el iframe saldría la hoja en blanco.
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: auto; margin: 12mm; }
    html, body { margin: 0; padding: 0; }
    img { width: 100%; display: block; }
  </style></head><body><img src="${url}" onload="window.focus();window.print();"></body></html>`;

  // Se limpia con retraso: el diálogo de impresión necesita el iframe vivo.
  window.setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60_000);
}
