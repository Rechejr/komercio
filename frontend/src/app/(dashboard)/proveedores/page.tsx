'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Plus, Search, Edit, Trash2, Truck, X, Loader2, Phone,
  FileUp, FileDown, CheckCircle2, ArrowRight, Lock,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

const FIELDS = [
  { name: 'name',        label: 'Nombre comercial *',  col: 2 },
  { name: 'legalName',   label: 'Razón social',         col: 2 },
  { name: 'document',    label: 'NIT / Documento',      col: 1 },
  { name: 'contactName', label: 'Persona de contacto',  col: 1 },
  { name: 'phone',       label: 'Teléfono',             col: 1, type: 'tel', maxLength: 10 },
  { name: 'mobile',      label: 'Celular',              col: 1, type: 'tel', maxLength: 10 },
  { name: 'email',       label: 'Correo',               col: 2, type: 'email' },
  { name: 'address',     label: 'Dirección',            col: 2 },
  { name: 'city',        label: 'Ciudad',               col: 1 },
  { name: 'notes',       label: 'Notas',                col: 1 },
];

type PreviewData = {
  total: number;
  valid: number;
  toCreate: number;
  toUpdate: number;
  issues: { row: number; name: string; message: string; type: 'error' | 'warning' }[];
  detectedColumns: { field: string; header: string }[];
};

export default function ProveedoresPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const plan = useAuthStore((s) => s.user?.plan);
  const isFree = !plan || plan === 'free';
  const openUpgrade = useUpgradeStore((s) => s.open);
  // El backend ya rechaza eliminar proveedores para Cajero/Supervisor
  // (supplier.routes.ts exige ADMIN) — esto solo evita mostrarle un botón que
  // de todas formas le va a fallar con un 403.
  const role = useAuthStore((s) => s.user?.role);
  const canDelete = role === 'ADMIN';

  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) setSearch(q);
  }, [searchParams]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; errors: { row: number; message: string }[] } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, search],
    queryFn: () => api.get(`/suppliers?page=${page}&limit=20&search=${encodeURIComponent(search)}`).then((r) => r.data),
  });

  const { register, handleSubmit, reset } = useForm();

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem ? api.put(`/suppliers/${editItem.id}`, data) : api.post('/suppliers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      toast.success(editItem ? 'Proveedor actualizado' : 'Proveedor creado');
      setShowForm(false); setEditItem(null); reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      toast.success('Proveedor eliminado');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  const previewMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/suppliers/import?dryRun=true', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data.data as PreviewData);
    },
    onSuccess: (data) => setPreviewData(data),
    onError: (err: any) => {
      setIsPreviewOpen(false);
      setPendingFile(null);
      toast.error(err.response?.data?.error || 'No se pudo leer el archivo');
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/suppliers/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data.data);
    },
    onSuccess: (result) => {
      setIsPreviewOpen(false);
      setPreviewData(null);
      setPendingFile(null);
      setImportResult(result);
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      toast.success(`${result.imported} creados, ${result.updated} actualizados`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al importar'),
  });

  function handleFile(file: File) {
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) { toast.error('Solo archivos .xlsx, .xls o .csv'); return; }
    setPendingFile(file);
    setIsPreviewOpen(true);
    previewMutation.mutate(file);
  }

  function closePreview() { setIsPreviewOpen(false); setPreviewData(null); setPendingFile(null); }

  const suppliers = data?.data || [];
  const pagination = data?.pagination;

  useEffect(() => {
    if (!showForm) return;
    const id = requestAnimationFrame(() => {
      if (formRef.current) formRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(id);
  }, [showForm]);

  return (
    <>
    <div
      className="space-y-4 animate-fade-up"
      onDragOver={(e) => { if (isFree) return; e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault(); setIsDragOver(false);
        if (isFree) { openUpgrade(); return; }
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      {isDragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 border-2 border-dashed border-emerald-400 bg-emerald-500/5 backdrop-blur-[2px] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded-2xl px-10 py-8 shadow-modal flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <FileUp size={26} className="text-emerald-500" />
            </div>
            <p className="text-[15px] font-semibold text-slate-800 dark:text-white">Suelta para importar</p>
            <p className="text-[13px] text-slate-400">.xlsx · .xls · .csv</p>
          </div>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar proveedor..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
          />
        </div>

        {isFree ? (
          <button type="button" onClick={openUpgrade}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            <FileDown size={15} /> Plantilla
            <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full leading-none">PRO</span>
          </button>
        ) : (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/suppliers/import-template`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <FileDown size={15} /> Plantilla
          </a>
        )}

        {isFree ? (
          <button type="button" onClick={openUpgrade}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            <Lock size={14} /> Importar Excel
            <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full leading-none">PRO</span>
          </button>
        ) : (
          <button type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={previewMutation.isPending || importMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 border border-emerald-200 dark:border-emerald-700/50 rounded-xl text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 transition">
            {(previewMutation.isPending || importMutation.isPending)
              ? <Loader2 size={15} className="animate-spin" />
              : <FileUp size={15} />}
            Importar Excel
          </button>
        )}

        <input ref={fileInputRef} type="file" aria-label="Seleccionar archivo Excel para importar proveedores"
          accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />

        <button
          type="button"
          onClick={() => { setEditItem(null); reset({}); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition"
        >
          <Plus size={15} /> Nuevo proveedor
        </button>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nombre</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Razón social</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Contacto</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Teléfonos</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Email</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Productos</th>
                <th className="w-16 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <Truck size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">No hay proveedores{search ? ` para "${search}"` : ''}</p>
                      {!isFree && (
                        <p className="text-[12px] text-slate-300 dark:text-slate-600">
                          Puedes importar proveedores desde un Excel con el botón &quot;Importar Excel&quot;
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : suppliers.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-slate-800 dark:text-white">{s.name}</p>
                    {s.document && <p className="text-[11px] text-slate-400 mt-0.5">NIT: {s.document}</p>}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {s.legalName || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {s.contactName || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.phone && (
                      <p className="flex items-center gap-1 text-[13px] text-slate-500 dark:text-slate-400">
                        <Phone size={11} className="text-slate-300 dark:text-slate-600" /> {s.phone}
                      </p>
                    )}
                    {s.mobile && (
                      <p className="flex items-center gap-1 text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <Phone size={11} className="text-emerald-400" /> {s.mobile}
                      </p>
                    )}
                    {!s.phone && !s.mobile && <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {s.email || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-[13px] text-slate-600 dark:text-slate-400 tabular-nums">
                    {s._count?.products || 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="Editar proveedor"
                        onClick={() => { setEditItem(s); reset(s); setShowForm(true); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition">
                        <Edit size={14} />
                      </button>
                      {canDelete && (
                        <button type="button" aria-label="Eliminar proveedor"
                          onClick={() => { if (window.confirm(`¿Eliminar a "${s.name}"?`)) deleteMutation.mutate(s.id); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[13px] text-slate-500">
            <span>{pagination.total} proveedores</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-[12px]">Anterior</button>
              <span className="px-3 py-1.5 text-slate-400">{page} / {pagination.totalPages}</span>
              <button type="button" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-[12px]">Siguiente</button>
            </div>
          </div>
        )}
      </div>

    </div>

      {/* ── Import Preview Modal ─────────────────────────────────────────────── */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-lg flex flex-col max-h-[90vh] animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <FileUp size={16} className="text-emerald-500" /> Vista previa — Proveedores
              </h2>
              <button type="button" aria-label="Cerrar" onClick={closePreview}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition">
                <X size={16} />
              </button>
            </div>

            {previewMutation.isPending ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={32} className="animate-spin text-emerald-500" />
                <p className="text-[13px] text-slate-500 dark:text-slate-400">Analizando archivo...</p>
              </div>
            ) : previewData ? (
              <div className="p-6 space-y-5 overflow-y-auto min-h-0">
                <p className="text-[13px] text-slate-600 dark:text-slate-400">
                  Se encontraron{' '}
                  <span className="font-bold text-slate-800 dark:text-white">{previewData.total}</span>{' '}
                  proveedor{previewData.total !== 1 ? 'es' : ''} en el archivo
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3 text-center">
                    <p className="text-[22px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{previewData.valid}</p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5 uppercase tracking-wide font-medium">Válidos</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3 text-center">
                    <p className="text-[22px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{previewData.toCreate}</p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5 uppercase tracking-wide font-medium">Nuevos</p>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-500/10 rounded-xl p-3 text-center">
                    <p className="text-[22px] font-bold text-violet-700 dark:text-violet-400 tabular-nums">{previewData.toUpdate}</p>
                    <p className="text-[11px] text-violet-600 dark:text-violet-500 mt-0.5 uppercase tracking-wide font-medium">Actualizan</p>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                    Columnas reconocidas ({previewData.detectedColumns.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewData.detectedColumns.map(({ field, header }) => (
                      <span key={field}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] rounded-full font-medium">
                        <CheckCircle2 size={10} /> {header}
                      </span>
                    ))}
                  </div>
                </div>
                {previewData.issues.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                      {previewData.issues.filter(i => i.type === 'error').length > 0 && (
                        <span className="text-red-500">{previewData.issues.filter(i => i.type === 'error').length} error{previewData.issues.filter(i => i.type === 'error').length > 1 ? 'es' : ''}</span>
                      )}
                      {previewData.issues.filter(i => i.type === 'error').length > 0 && previewData.issues.filter(i => i.type === 'warning').length > 0 && ' · '}
                      {previewData.issues.filter(i => i.type === 'warning').length > 0 && (
                        <span className="text-amber-500">{previewData.issues.filter(i => i.type === 'warning').length} advertencia{previewData.issues.filter(i => i.type === 'warning').length > 1 ? 's' : ''}</span>
                      )}
                    </p>
                    <div className="rounded-xl border border-slate-100 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04] max-h-44 overflow-y-auto text-[12px]">
                      {previewData.issues.map((issue, i) => (
                        <div key={i}
                          className={`flex gap-2 items-start px-3 py-2 ${issue.type === 'error' ? 'bg-red-50 dark:bg-red-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
                          <span className={`font-mono flex-shrink-0 font-semibold ${issue.type === 'error' ? 'text-red-500' : 'text-amber-500'}`}>Fila {issue.row}</span>
                          <span className={`min-w-0 ${issue.type === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                            {issue.type === 'warning' ? '⚠ ' : '✕ '}
                            <span className="font-medium">{issue.name}</span> — {issue.message}
                          </span>
                        </div>
                      ))}
                    </div>
                    {previewData.issues.some(i => i.type === 'error') && (
                      <p className="text-[11px] text-slate-400 mt-1.5">Las filas con error no se importarán. Las advertencias sí.</p>
                    )}
                  </div>
                )}
                {previewData.valid === 0 && (
                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-4 text-center">
                    <p className="text-[13px] text-red-700 dark:text-red-300 font-medium">No hay filas válidas para importar.</p>
                    <p className="text-[12px] text-red-500 mt-1">Revisa los errores y corrige el archivo.</p>
                  </div>
                )}
              </div>
            ) : null}

            {!previewMutation.isPending && previewData && (
              <div className="flex gap-3 px-6 pb-5 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
                <button type="button" onClick={closePreview}
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  Cancelar
                </button>
                <button type="button"
                  disabled={previewData.valid === 0 || importMutation.isPending}
                  onClick={() => pendingFile && importMutation.mutate(pendingFile)}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-600/25 transition flex items-center justify-center gap-2">
                  {importMutation.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
                    : <><ArrowRight size={14} /> Importar {previewData.valid} proveedor{previewData.valid !== 1 ? 'es' : ''}</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Import Results Modal ─────────────────────────────────────────────── */}
      {importResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
          onClick={() => setImportResult(null)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-md max-h-[80vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500" /> Importación completada
              </h2>
              <button type="button" aria-label="Cerrar" onClick={() => setImportResult(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto min-h-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-4 text-center">
                  <p className="text-[22px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{importResult.imported}</p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5 uppercase tracking-wide font-medium">Creados</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-4 text-center">
                  <p className="text-[22px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{importResult.updated}</p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5 uppercase tracking-wide font-medium">Actualizados</p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-red-600 mb-2 uppercase tracking-wide">
                    {importResult.errors.length} fila{importResult.errors.length > 1 ? 's' : ''} con error:
                  </p>
                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl divide-y divide-red-100 dark:divide-red-500/10 max-h-48 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 flex gap-2 text-[12px]">
                        <span className="font-mono text-red-400 flex-shrink-0">Fila {e.row}</span>
                        <span className="text-red-700 dark:text-red-300">{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-5">
              <button type="button" onClick={() => setImportResult(null)}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Form Modal ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0 bg-white dark:bg-slate-900">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">
                {editItem ? 'Editar proveedor' : 'Nuevo proveedor'}
              </h2>
              <button type="button" aria-label="Cerrar" onClick={() => { setShowForm(false); setEditItem(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition">
                <X size={16} />
              </button>
            </div>
            <form ref={formRef} onSubmit={handleSubmit((d: any) => saveMutation.mutate(d))} className="p-6 grid grid-cols-2 gap-4 overflow-y-auto min-h-0">
              {FIELDS.map((f) => (
                <div key={f.name} className={f.col === 2 ? 'col-span-2' : ''}>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">{f.label}</label>
                  <input {...register(f.name)} type={f.type || 'text'} maxLength={(f as any).maxLength} className={inputCls} />
                </div>
              ))}
              <div className="col-span-2 flex justify-end gap-3 border-t border-slate-100 dark:border-white/[0.06] pt-4">
                <button type="button" onClick={() => { setShowForm(false); setEditItem(null); }}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={saveMutation.isPending}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/25 flex items-center gap-2 transition">
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editItem ? 'Actualizar' : 'Crear proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
