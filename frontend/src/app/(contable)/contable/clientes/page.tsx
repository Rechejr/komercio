'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Portal } from '@/components/ui/Portal';
import {
  CALIDADES, calcularDV, calidadBloqueada, formatNit, resumenCalidades,
  type TaxClient, type Calidad,
} from '@/lib/contable';
import { Plus, Search, Edit, Trash2, X, Loader2, Users, FileUp, FileDown, CheckCircle2, ArrowRight, CalendarClock, Paperclip } from 'lucide-react';
import { DocumentosCliente } from '@/components/contable/DocumentosCliente';

interface PreviewData {
  total: number;
  valid: number;
  toCreate: number;
  toUpdate: number;
  issues: { row: number; name: string; message: string; type: 'error' | 'warning' }[];
  detectedColumns: { field: string; header: string }[];
}
interface ImportResult {
  imported: number;
  updated: number;
  generados?: number;
  errors: { row: number; message: string }[];
}

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

interface FormState {
  razonSocial: string;
  nit: string;
  celular: string;
  direccion: string;
  tipoPersona: 'natural' | 'juridica';
  responsabilidades: Calidad[];
  ivaPeriodicidad: 'bimestral' | 'cuatrimestral' | '';
}

const FORM_VACIO: FormState = {
  razonSocial: '', nit: '', celular: '', direccion: '',
  tipoPersona: 'juridica', responsabilidades: [], ivaPeriodicidad: '',
};

export default function ClientesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const puedeEliminar = role === 'ADMIN'; // el AUXILIAR no elimina clientes
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaxClient | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [delTarget, setDelTarget] = useState<TaxClient | null>(null);
  const [docsCliente, setDocsCliente] = useState<TaxClient | null>(null);

  // ── Importación masiva desde Excel ──────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['contable-clients', page, search],
    queryFn: () => api.get(`/contable/clients?page=${page}&limit=20&search=${encodeURIComponent(search)}`).then((r) => r.data),
  });
  const clientes: TaxClient[] = data?.data ?? [];
  const pagination = data?.pagination;

  // Si borras el último cliente de la página actual (o cambia el total), la página
  // podría quedar por fuera del rango y mostrarse vacía sin botón para volver.
  // Reajustamos a la última página válida.
  useEffect(() => {
    const totalPages = pagination?.totalPages ?? 1;
    if (page > totalPages) setPage(totalPages);
  }, [pagination?.totalPages, page]);

  const saveMut = useMutation({
    mutationFn: (payload: any) =>
      editing
        ? api.put(`/contable/clients/${editing.id}`, payload)
        : api.post('/contable/clients', payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contable-clients'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      // Editar calidades ajusta los vencimientos automáticamente (agrega/quita
      // obligaciones), así que se refrescan las vistas de vencimientos y PILA.
      qc.invalidateQueries({ queryKey: ['contable-vencimientos'] });
      qc.invalidateQueries({ queryKey: ['contable-pila'] });
      setModalOpen(false);
      if (editing) {
        toast.success('Cliente actualizado');
        return;
      }
      // Cliente NUEVO → llevarlo directo a Vencimientos con el cliente listo para
      // generar su agenda (sin tener que buscarlo de nuevo).
      toast.success('Cliente creado');
      const nuevo = res.data?.data;
      if (nuevo?.id) {
        router.push(`/contable/vencimientos?cliente=${nuevo.id}&nombre=${encodeURIComponent(nuevo.razonSocial)}`);
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'No se pudo guardar'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contable/clients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contable-clients'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      toast.success('Cliente eliminado');
      setDelTarget(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'No se pudo eliminar'),
  });

  const previewMut = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/contable/clients/import?dryRun=true', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data.data as PreviewData);
    },
    onSuccess: (d) => setPreviewData(d),
    onError: (err: any) => {
      setPreviewOpen(false);
      setPendingFile(null);
      toast.error(err.response?.data?.error || 'No se pudo leer el archivo');
    },
  });

  const importMut = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/contable/clients/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data.data as ImportResult);
    },
    onSuccess: (result) => {
      setPreviewOpen(false);
      setPreviewData(null);
      setPendingFile(null);
      setImportResult(result);
      qc.invalidateQueries({ queryKey: ['contable-clients'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      // El import genera la agenda automáticamente → refrescar vencimientos/PILA.
      qc.invalidateQueries({ queryKey: ['contable-vencimientos'] });
      qc.invalidateQueries({ queryKey: ['contable-pila'] });
      toast.success(`${result.imported} creados, ${result.updated} actualizados`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al importar'),
  });

  function handleFile(file: File) {
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) { toast.error('Solo archivos .xlsx, .xls o .csv'); return; }
    setPendingFile(file);
    setPreviewData(null);
    setPreviewOpen(true);
    previewMut.mutate(file);
  }
  function closePreview() {
    setPreviewOpen(false);
    setPreviewData(null);
    setPendingFile(null);
  }

  function openNew() {
    setEditing(null);
    setForm(FORM_VACIO);
    setModalOpen(true);
  }
  function openEdit(c: TaxClient) {
    setEditing(c);
    setForm({
      razonSocial: c.razonSocial, nit: c.nit, celular: c.celular ?? '', direccion: c.direccion ?? '',
      tipoPersona: c.tipoPersona, responsabilidades: c.responsabilidades,
      ivaPeriodicidad: c.ivaPeriodicidad ?? '',
    });
    setModalOpen(true);
  }

  function toggleCalidad(codigo: Calidad) {
    setForm((f) => {
      const activa = f.responsabilidades.includes(codigo);
      const next = activa
        ? f.responsabilidades.filter((c) => c !== codigo)
        : [...f.responsabilidades, codigo];
      return { ...f, responsabilidades: next };
    });
  }

  const esResponsableIva = form.responsabilidades.includes('responsable_iva');
  const dvPreview = calcularDV(form.nit);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razonSocial.trim()) return toast.error('La razón social es requerida');
    if (!form.nit.replace(/\D/g, '')) return toast.error('El NIT es requerido');
    saveMut.mutate({
      razonSocial: form.razonSocial,
      nit: form.nit,
      celular: form.celular,
      direccion: form.direccion,
      tipoPersona: form.tipoPersona,
      responsabilidades: form.responsabilidades,
      ivaPeriodicidad: esResponsableIva && form.ivaPeriodicidad ? form.ivaPeriodicidad : null,
    });
  }

  return (
    <div
      className="space-y-4 animate-fade-up relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      {/* Overlay al arrastrar un archivo encima */}
      {isDragOver && (
        <div className="fixed inset-0 z-[60] bg-emerald-600/10 backdrop-blur-[2px] border-2 border-dashed border-emerald-500 flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-modal px-8 py-6 text-center">
            <FileUp size={30} className="mx-auto mb-2 text-emerald-500" />
            <p className="text-[15px] font-semibold text-slate-800 dark:text-white">Suelta para importar clientes</p>
            <p className="text-[13px] text-slate-400">.xlsx · .xls · .csv</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre o identificación..."
            className={cn(inputCls, 'pl-9')}
          />
        </div>
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/contable/clients/import-template`}
          title="Formato de ejemplo para empezar desde cero — si ya tienes tu propio Excel de clientes, no lo necesitas, solo súbelo en 'Importar Excel'"
          className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium px-3 py-2.5 rounded-xl text-sm transition-colors"
        >
          <FileDown size={15} /> Plantilla
        </a>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-medium px-3 py-2.5 rounded-xl text-sm transition-colors"
        >
          <FileUp size={15} /> Importar Excel
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        <button onClick={openNew} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Nombre / Razón social</th>
                <th className="px-4 py-3 font-semibold">Identificación</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Calidades</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>{[...Array(5)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : isError ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center">
                  <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                    {(error as any)?.response?.data?.error || 'No pudimos cargar los clientes'}
                  </p>
                  <button onClick={() => refetch()} className="text-sm text-emerald-600 hover:underline">Reintentar</button>
                </td></tr>
              ) : clientes.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <Users size={30} className="mx-auto mb-2" strokeWidth={1.5} />
                  {search ? (
                    <p className="text-sm">Sin resultados para &quot;{search}&quot;</p>
                  ) : (
                    <>
                      <p className="text-sm">Aún no tienes clientes.</p>
                      <p className="text-[13px] mt-1">Crea el primero o <button onClick={() => fileInputRef.current?.click()} className="text-emerald-600 hover:underline font-medium">importa tu Excel</button> de una sola vez.</p>
                    </>
                  )}
                </td></tr>
              ) : (
                clientes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.razonSocial}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular">{formatNit(c.nit, c.dv)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300 capitalize">
                        {c.tipoPersona === 'juridica' ? 'Jurídica' : 'Natural'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{resumenCalidades(c)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setDocsCliente(c)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20" aria-label="Documentos" title="Documentos">
                          <Paperclip size={15} />
                        </button>
                        <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20" aria-label="Editar">
                          <Edit size={15} />
                        </button>
                        {puedeEliminar && (
                          <button onClick={() => setDelTarget(c)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Eliminar">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-sm">
            <span className="text-slate-500 dark:text-slate-400">Página {pagination.page} de {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Anterior</button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal ficha de cliente ─────────────────────────────────────────── */}
      {modalOpen && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nombres o razón social *</label>
                <input value={form.razonSocial} onChange={(e) => setForm((f) => ({ ...f, razonSocial: e.target.value }))} placeholder="Comercializadora El Sol SAS" className={inputCls} />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Identificación (NIT / cédula) *</label>
                  <input value={form.nit} onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))} placeholder="900123456" inputMode="numeric" className={inputCls} />
                </div>
                <div className="pb-2.5">
                  <span className="text-[13px] text-slate-500 dark:text-slate-400">DV: </span>
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular">{dvPreview ?? '—'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Celular</label>
                  <input value={form.celular} onChange={(e) => setForm((f) => ({ ...f, celular: e.target.value }))} placeholder="300 000 0000" inputMode="tel" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tipo de persona</label>
                  <select value={form.tipoPersona} onChange={(e) => setForm((f) => ({ ...f, tipoPersona: e.target.value as any }))} className={inputCls}>
                    <option value="juridica">Jurídica</option>
                    <option value="natural">Natural</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Dirección</label>
                <input value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} placeholder="Cra 10 # 20-30" className={inputCls} />
              </div>

              {/* Calidades tributarias con la regla RST */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-2">Calidades tributarias</label>
                <div className="space-y-1.5">
                  {CALIDADES.map((cal) => {
                    const marcada = form.responsabilidades.includes(cal.codigo);
                    const bloqueada = !marcada && calidadBloqueada(cal.codigo, form.responsabilidades);
                    return (
                      <label
                        key={cal.codigo}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                          marcada ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/15' : 'border-slate-200 dark:border-slate-700',
                          bloqueada && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={marcada}
                          disabled={bloqueada}
                          onChange={() => toggleCalidad(cal.codigo)}
                          className="accent-emerald-600 w-4 h-4"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-200">{cal.label}</span>
                      </label>
                    );
                  })}
                </div>
                {form.responsabilidades.includes('rst') && (
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    El Régimen Simple es excluyente con declarante de renta y agente retenedor.
                  </p>
                )}
              </div>

              {/* Periodicidad de IVA — solo si es responsable */}
              {esResponsableIva && (
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Periodicidad de IVA</label>
                  <select value={form.ivaPeriodicidad} onChange={(e) => setForm((f) => ({ ...f, ivaPeriodicidad: e.target.value as any }))} className={inputCls}>
                    <option value="">Elegir…</option>
                    <option value="bimestral">Bimestral</option>
                    <option value="cuatrimestral">Cuatrimestral</option>
                  </select>
                </div>
              )}
            </form>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0 flex gap-2">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">Cancelar</button>
              <button onClick={handleSubmit} disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
                {editing ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Modal: vista previa de importación (dry-run) ────────────────────── */}
      {previewOpen && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={closePreview} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <FileUp size={16} className="text-emerald-500" /> Vista previa de importación
              </h2>
              <button type="button" aria-label="Cerrar" onClick={closePreview} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition">
                <X size={16} />
              </button>
            </div>

            {previewMut.isPending ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={32} className="animate-spin text-emerald-500" />
                <p className="text-[13px] text-slate-500 dark:text-slate-400">Analizando archivo...</p>
              </div>
            ) : previewData ? (
              <div className="p-6 space-y-5 overflow-y-auto min-h-0 flex-1">
                <p className="text-[13px] text-slate-600 dark:text-slate-400">
                  Se encontraron <span className="font-bold text-slate-800 dark:text-white">{previewData.total}</span> cliente{previewData.total !== 1 ? 's' : ''} en el archivo
                </p>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3 text-center">
                    <p className="text-[22px] font-bold text-emerald-700 dark:text-emerald-400 tabular">{previewData.valid}</p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5 uppercase tracking-wide font-medium">Válidos</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3 text-center">
                    <p className="text-[22px] font-bold text-emerald-700 dark:text-emerald-400 tabular">{previewData.toCreate}</p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5 uppercase tracking-wide font-medium">Nuevos</p>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-500/10 rounded-xl p-3 text-center">
                    <p className="text-[22px] font-bold text-violet-700 dark:text-violet-400 tabular">{previewData.toUpdate}</p>
                    <p className="text-[11px] text-violet-600 dark:text-violet-500 mt-0.5 uppercase tracking-wide font-medium">Actualizan</p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                    Columnas reconocidas ({previewData.detectedColumns.length})
                  </p>
                  {previewData.detectedColumns.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {previewData.detectedColumns.map(({ field, header }) => (
                        <span key={field} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] rounded-full font-medium">
                          <CheckCircle2 size={10} /> {header}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-slate-400">Ninguna — revisa que la primera fila tenga los títulos de columna.</p>
                  )}
                </div>

                {previewData.issues.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                      {previewData.issues.filter((i) => i.type === 'error').length > 0 && (
                        <span className="text-red-500">{previewData.issues.filter((i) => i.type === 'error').length} error{previewData.issues.filter((i) => i.type === 'error').length > 1 ? 'es' : ''}</span>
                      )}
                      {previewData.issues.filter((i) => i.type === 'error').length > 0 && previewData.issues.filter((i) => i.type === 'warning').length > 0 && ' · '}
                      {previewData.issues.filter((i) => i.type === 'warning').length > 0 && (
                        <span className="text-amber-500">{previewData.issues.filter((i) => i.type === 'warning').length} advertencia{previewData.issues.filter((i) => i.type === 'warning').length > 1 ? 's' : ''}</span>
                      )}
                    </p>
                    <div className="rounded-xl border border-slate-100 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04] max-h-44 overflow-y-auto text-[12px]">
                      {previewData.issues.map((issue, i) => (
                        <div key={i} className={`flex gap-2 items-start px-3 py-2 ${issue.type === 'error' ? 'bg-red-50 dark:bg-red-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
                          <span className={`flex-shrink-0 font-semibold ${issue.type === 'error' ? 'text-red-500' : 'text-amber-500'}`}>Fila {issue.row}</span>
                          <span className={`min-w-0 ${issue.type === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                            {issue.type === 'warning' ? '⚠ ' : '✕ '}
                            {issue.name && <span className="font-medium">{issue.name}</span>}{issue.name ? ' — ' : ''}{issue.message}
                          </span>
                        </div>
                      ))}
                    </div>
                    {previewData.issues.some((i) => i.type === 'error') && (
                      <p className="text-[11px] text-slate-400 mt-1.5">Las filas con error no se importan. Las advertencias sí se incluyen.</p>
                    )}
                  </div>
                )}

                {previewData.valid === 0 && (
                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-4 text-center">
                    <p className="text-[13px] text-red-700 dark:text-red-300 font-medium">No hay filas válidas para importar.</p>
                    <p className="text-[12px] text-red-500 mt-1">Revisa que cada fila tenga nombre y NIT.</p>
                  </div>
                )}
              </div>
            ) : null}

            {!previewMut.isPending && previewData && (
              <div className="flex gap-3 px-6 pb-5 pt-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0">
                <button type="button" onClick={closePreview} className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={previewData.valid === 0 || importMut.isPending}
                  onClick={() => pendingFile && importMut.mutate(pendingFile)}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-600/25 transition flex items-center justify-center gap-2"
                >
                  {importMut.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
                    : <><ArrowRight size={14} /> Importar {previewData.valid} cliente{previewData.valid !== 1 ? 's' : ''}</>}
                </button>
              </div>
            )}
          </div>
        </div>
        </Portal>
      )}

      {/* ── Modal: resultado de la importación ──────────────────────────────── */}
      {importResult && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setImportResult(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500" /> Importación completada
              </h2>
              <button type="button" aria-label="Cerrar" onClick={() => setImportResult(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto min-h-0 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-4 text-center">
                  <p className="text-[22px] font-bold text-emerald-700 dark:text-emerald-400 tabular">{importResult.imported}</p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5 uppercase tracking-wide font-medium">Creados</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-4 text-center">
                  <p className="text-[22px] font-bold text-emerald-700 dark:text-emerald-400 tabular">{importResult.updated}</p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5 uppercase tracking-wide font-medium">Actualizados</p>
                </div>
              </div>

              {!!importResult.generados && (
                <div className="flex items-center gap-2 rounded-xl bg-sky-50 dark:bg-sky-900/15 border border-sky-100 dark:border-sky-500/20 px-3 py-2.5 text-[12px] text-sky-700 dark:text-sky-300">
                  <CalendarClock size={15} className="flex-shrink-0" />
                  Se generaron automáticamente <b>{importResult.generados}</b> vencimientos en la agenda según las calidades.
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-red-600 mb-2 uppercase tracking-wide">
                    {importResult.errors.length} fila{importResult.errors.length > 1 ? 's' : ''} con error:
                  </p>
                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl divide-y divide-red-100 dark:divide-red-500/10 max-h-48 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 flex gap-2 text-[12px]">
                        <span className="text-red-400 flex-shrink-0">Fila {e.row}</span>
                        <span className="text-red-700 dark:text-red-300">{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResult.imported === 0 && importResult.updated === 0 && importResult.errors.length === 0 && (
                <p className="text-[13px] text-slate-400 text-center py-2">El archivo no contenía filas válidas.</p>
              )}
            </div>

            <div className="px-6 pb-5 flex-shrink-0">
              <button type="button" onClick={() => setImportResult(null)} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition">
                Entendido
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="¿Eliminar cliente?"
        description={delTarget ? `Se eliminará "${delTarget.razonSocial}" junto con sus vencimientos y resoluciones. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={delMut.isPending}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      />

      {docsCliente && (
        <DocumentosCliente
          taxClientId={docsCliente.id}
          clientName={docsCliente.razonSocial}
          onClose={() => setDocsCliente(null)}
        />
      )}
    </div>
  );
}
