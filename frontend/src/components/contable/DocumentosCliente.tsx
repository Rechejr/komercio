'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Portal } from '@/components/ui/Portal';
import { X, Upload, Trash2, FileText, ExternalLink, Loader2, Paperclip } from 'lucide-react';

interface Doc { id: string; nombre: string; categoria: string | null; url: string; mimeType: string | null; size: number | null; createdAt: string }

const CATEGORIAS = ['RUT', 'Cámara de comercio', 'Declaración', 'Certificado', 'Otro'];
const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';
const fmtSize = (b: number | null) => !b ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export function DocumentosCliente({ taxClientId, clientName, onClose }: { taxClientId: string; clientName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('RUT');

  const { data: docs = [], isLoading } = useQuery<Doc[]>({
    queryKey: ['contable-docs', taxClientId],
    queryFn: () => api.get(`/contable/clients/${taxClientId}/documentos`).then((r) => r.data.data),
  });

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file!);
      fd.append('nombre', nombre.trim() || file!.name);
      fd.append('categoria', categoria);
      return api.post(`/contable/clients/${taxClientId}/documentos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-docs', taxClientId] });
      toast.success('Documento subido');
      setFile(null); setNombre(''); if (fileRef.current) fileRef.current.value = '';
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo subir'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contable/documentos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contable-docs', taxClientId] }); toast.success('Documento eliminado'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo eliminar'),
  });

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast.error('El archivo no puede superar 8 MB'); return; }
    setFile(f);
    if (!nombre) setNombre(f.name.replace(/\.[^.]+$/, ''));
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <Paperclip size={17} className="text-emerald-600 dark:text-emerald-400" />
              <div>
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">Documentos</h2>
                <p className="text-[12px] text-slate-400">{clientName}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
          </div>

          {/* Subir */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] space-y-3 flex-shrink-0">
            <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={(e) => pickFile(e.target.files?.[0] || null)} className="hidden" />
            {!file ? (
              <button onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition text-sm font-medium">
                <Upload size={16} /> Elegir archivo (PDF o imagen, máx. 8 MB)
              </button>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-[13px] text-slate-700 dark:text-slate-200">
                  <FileText size={15} className="text-emerald-600 flex-none" />
                  <span className="truncate flex-1">{file.name}</span>
                  <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-slate-400 hover:text-red-500"><X size={15} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del documento" className={inputCls} />
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls}>
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={() => uploadMut.mutate()} disabled={uploadMut.isPending} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {uploadMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Subir documento
                </button>
              </div>
            )}
          </div>

          {/* Lista */}
          <div className="px-4 py-3 overflow-y-auto flex-1">
            {isLoading ? (
              <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : docs.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Aún no hay documentos de este cliente.</p>
            ) : (
              <div className="space-y-1.5">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-white/[0.06]">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-none">
                      <FileText size={16} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">{d.nombre}</p>
                      <p className="text-[11px] text-slate-400">{d.categoria || 'Sin categoría'}{d.size ? ` · ${fmtSize(d.size)}` : ''}</p>
                    </div>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" title="Abrir" className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20"><ExternalLink size={15} /></a>
                    <button onClick={() => delMut.mutate(d.id)} title="Eliminar" className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
