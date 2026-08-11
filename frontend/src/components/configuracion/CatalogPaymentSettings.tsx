'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { QrCode, Link2, Loader2, Trash2, Upload } from 'lucide-react';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

// Configura el pago del catálogo público: un link de pago (Wompi/Bold/Nequi…)
// y/o un QR (imagen). El cliente los ve al hacer el pedido. Se guarda al toque
// (mismo patrón que el logo).
export function CatalogPaymentSettings({ business }: { business: any }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState<string>(business?.catalogPaymentLink || '');
  const [uploading, setUploading] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['business'] });
    qc.invalidateQueries({ queryKey: ['business-me'] });
  };

  const saveLink = useMutation({
    mutationFn: () => api.put('/business/me', { catalogPaymentLink: link.trim() || '' }),
    onSuccess: () => { refresh(); toast.success('Link de pago guardado'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo guardar'),
  });

  async function handleQr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('La imagen no puede superar 2 MB'); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('images', file);
      const up = await api.post('/uploads/images', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await api.put('/business/me', { catalogPaymentQr: up.data.data.urls[0] });
      refresh();
      toast.success('QR de pago guardado');
    } catch {
      toast.error('No se pudo subir el QR');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeQr() {
    setUploading(true);
    try {
      await api.put('/business/me', { catalogPaymentQr: null });
      refresh();
      toast.success('QR eliminado');
    } catch {
      toast.error('No se pudo eliminar');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <QrCode size={17} className="text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Pago en el catálogo</h2>
      </div>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4">
        Para que tus clientes puedan pagarte al instante desde el catálogo. Pon tu link de pago y/o el QR; aparecerán al hacer el pedido.
      </p>

      {/* Link de pago */}
      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5"><Link2 size={13} /> Link de pago</label>
      <div className="flex gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://... (Wompi, Bold, Nequi, tu link)"
          className={inputCls}
        />
        <button
          onClick={() => saveLink.mutate()}
          disabled={saveLink.isPending || link.trim() === (business?.catalogPaymentLink || '')}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold disabled:opacity-50 flex-none flex items-center gap-1.5"
        >
          {saveLink.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Guardar
        </button>
      </div>

      {/* QR */}
      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mt-4 mb-1.5 flex items-center gap-1.5"><QrCode size={13} /> Código QR</label>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleQr} />
      {business?.catalogPaymentQr ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={business.catalogPaymentQr} alt="QR de pago" className="w-20 h-20 rounded-lg object-contain border border-slate-200 dark:border-slate-700 bg-white" />
          <div className="flex flex-col gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-[12px] font-medium text-emerald-600 hover:underline flex items-center gap-1.5">
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Cambiar QR
            </button>
            <button onClick={removeQr} disabled={uploading} className="text-[12px] font-medium text-red-500 hover:underline flex items-center gap-1.5">
              <Trash2 size={13} /> Quitar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition text-sm font-medium"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Subir imagen del QR (máx. 2 MB)
        </button>
      )}
    </div>
  );
}
