'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { CategorySelect } from '@/components/ui/CategorySelect';
import toast from 'react-hot-toast';
import {
  Plus, Search, Edit, Trash2, Package, AlertTriangle,
  X, Loader2, Barcode, FileUp, FileDown, CheckCircle2,
  ArrowRight, Lock, ArrowUpDown,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type PreviewData = {
  total: number;
  valid: number;
  toCreate: number;
  toUpdate: number;
  issues: { row: number; name: string; message: string; type: 'error' | 'warning' }[];
  detectedColumns: { field: string; header: string }[];
};

const fieldLabel: Record<string, string> = {
  name: 'Nombre',
  code: 'Código',
  salePrice: 'Precio Venta',
  costPrice: 'Costo',
  stock: 'Stock',
  minStock: 'Stock Mín.',
  category: 'Categoría',
  unit: 'Unidad',
  barcode: 'Cód. Barras',
  description: 'Descripción',
};

export default function InventarioPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const plan = useAuthStore((s) => s.user?.plan);
  const isFree = !plan || plan === 'free';
  const openUpgrade = useUpgradeStore((s) => s.open);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [stockTarget, setStockTarget] = useState<any>(null);
  const [stockForm, setStockForm] = useState({ quantity: '', reason: '' });
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; errors: { row: number; message: string }[] } | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDroppedFile(file: File) {
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) { toast.error('Solo archivos .xlsx, .xls o .csv'); return; }
    setPendingFile(file);
    setIsPreviewOpen(true);
    previewMutation.mutate(file);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => api.get(`/products?page=${page}&limit=20&search=${encodeURIComponent(search)}`).then((r) => r.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto eliminado');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Error al eliminar'),
  });

  const { register, handleSubmit, reset, control, formState: { isSubmitting } } = useForm();

  // Step 1: dry-run preview
  const previewMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/products/import?dryRun=true', fd, {
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

  // Step 2: actual import
  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/products/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data.data);
    },
    onSuccess: (result) => {
      setIsPreviewOpen(false);
      setPreviewData(null);
      setPendingFile(null);
      setImportResult(result);
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(`${result.imported} creados, ${result.updated} actualizados`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al importar'),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, type, quantity, reason }: { id: string; type: string; quantity: number; reason: string }) =>
      api.patch(`/products/${id}/adjust-stock`, { type, quantity, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Stock actualizado');
      setStockTarget(null);
      setStockForm({ quantity: '', reason: '' });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al ajustar stock'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem
      ? api.put(`/products/${editItem.id}`, data)
      : api.post('/products', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(editItem ? 'Producto actualizado' : 'Producto creado');
      setShowForm(false);
      setEditItem(null);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al guardar'),
  });

  function openEdit(item: any) {
    setEditItem(item);
    reset({
      ...item,
      categoryId: item.category?.id || item.categoryId || '',
      images: item.images || [],
    });
    setShowForm(true);
  }

  function closePreview() {
    setIsPreviewOpen(false);
    setPreviewData(null);
    setPendingFile(null);
  }

  // Open edit modal when arriving from a low-stock notification
  useEffect(() => {
    const productId = searchParams.get('productId');
    if (!productId) return;
    api.get(`/products/${productId}`)
      .then((r) => openEdit(r.data.data))
      .catch(() => toast.error('Producto no encontrado'))
      .finally(() => router.replace('/inventario'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const products = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div
      className="space-y-4 relative"
      onDragOver={(e) => { if (isFree) return; e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (isFree) { openUpgrade(); return; }
        const file = e.dataTransfer.files[0];
        if (file) handleDroppedFile(file);
      }}
    >
      {isDragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 border-4 border-dashed border-blue-400 bg-blue-50/30 dark:bg-blue-900/20 rounded-xl flex items-center justify-center animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl px-8 py-6 shadow-xl flex flex-col items-center gap-3">
            <FileUp size={36} className="text-blue-500" />
            <p className="text-lg font-bold text-gray-800 dark:text-white">Suelta el archivo para importar</p>
            <p className="text-sm text-gray-400">.xlsx · .xls · .csv</p>
          </div>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, código o código de barras..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
          />
        </div>
        {isFree ? (
          <button
            type="button"
            onClick={openUpgrade}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
          >
            <FileDown size={16} />
            Plantilla
            <span className="ml-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full leading-none">PRO</span>
          </button>
        ) : (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/products/import-template`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            <FileDown size={16} /> Plantilla
          </a>
        )}
        {isFree ? (
          <button
            type="button"
            onClick={openUpgrade}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
          >
            <Lock size={15} />
            Importar Excel
            <span className="ml-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full leading-none">PRO</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={previewMutation.isPending || importMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 border border-green-300 dark:border-green-700 rounded-lg text-sm font-semibold text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition disabled:opacity-60"
          >
            {(previewMutation.isPending || importMutation.isPending)
              ? <Loader2 size={16} className="animate-spin" />
              : <FileUp size={16} />}
            Importar Excel
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Seleccionar archivo Excel para importar productos"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPendingFile(file);
              setIsPreviewOpen(true);
              previewMutation.mutate(file);
            }
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => { setEditItem(null); reset({ images: [] }); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
        >
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="w-14 px-4 py-3 sr-only">Imagen</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-medium">Código</th>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="hidden md:table-cell text-left px-4 py-3 font-medium">Categoría</th>
                <th className="hidden md:table-cell text-right px-4 py-3 font-medium">Costo</th>
                <th className="text-right px-4 py-3 font-medium">Precio</th>
                <th className="hidden lg:table-cell text-right px-4 py-3 font-medium">Margen</th>
                <th className="text-center px-4 py-3 font-medium">Stock</th>
                <th className="hidden sm:table-cell text-center px-4 py-3 font-medium">Estado</th>
                <th className="w-20 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(10)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    <Package size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay productos</p>
                  </td>
                </tr>
              ) : products.map((p: any) => {
                const margin = p.costPrice > 0
                  ? (((p.salePrice - p.costPrice) / p.costPrice) * 100).toFixed(1)
                  : null;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-gray-100 dark:border-gray-600" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <Package size={16} className="text-gray-300 dark:text-gray-500" />
                        </div>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs text-gray-500">{p.code}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 dark:text-white">{p.name}</p>
                      {p.barcode && <p className="text-xs text-gray-400">{p.barcode}</p>}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-500">{p.category?.name || '-'}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-right text-gray-600">{formatCurrency(p.costPrice)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 dark:text-white">{formatCurrency(p.salePrice)}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right">
                      {margin !== null ? (
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${parseFloat(margin) >= 20 ? 'text-green-700 bg-green-50' : parseFloat(margin) >= 0 ? 'text-yellow-700 bg-yellow-50' : 'text-red-700 bg-red-50'}`}>
                          {margin}%
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.stock <= p.minStock ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {p.stock <= p.minStock && <AlertTriangle size={11} />}
                        {p.stock} {p.unit || ''}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {p.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button type="button" aria-label="Ajustar stock"
                          onClick={() => { setStockTarget(p); setStockForm({ quantity: String(p.stock), reason: '' }); }}
                          className="text-gray-400 hover:text-green-600 transition" title="Ajustar stock">
                          <ArrowUpDown size={15} />
                        </button>
                        <button type="button" aria-label="Editar producto" onClick={() => openEdit(p)} className="text-gray-400 hover:text-blue-600 transition"><Edit size={15} /></button>
                        <button type="button" aria-label="Eliminar producto" onClick={() => setDeleteTarget(p)} className="text-gray-400 hover:text-red-600 transition"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500">
            <span>{pagination.total} productos</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition">Anterior</button>
              <span className="px-3 py-1">{page} / {pagination.totalPages}</span>
              <button type="button" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Import Preview Modal ─────────────────────────────────────────────── */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <FileUp size={18} className="text-blue-500" />
                Vista previa de importación
              </h2>
              <button type="button" aria-label="Cerrar" onClick={closePreview}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            {previewMutation.isPending ? (
              /* Loading state */
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={36} className="animate-spin text-blue-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Analizando archivo...</p>
              </div>
            ) : previewData ? (
              <div className="p-6 space-y-5 overflow-y-auto">

                {/* Total */}
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Se encontraron{' '}
                  <span className="font-bold text-gray-800 dark:text-white">{previewData.total}</span>{' '}
                  producto{previewData.total !== 1 ? 's' : ''} en el archivo
                </p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{previewData.valid}</p>
                    <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">Válidos</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{previewData.toCreate}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">Nuevos</p>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-violet-700 dark:text-violet-400">{previewData.toUpdate}</p>
                    <p className="text-xs text-violet-600 dark:text-violet-500 mt-0.5">Actualizan</p>
                  </div>
                </div>

                {/* Detected columns */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Columnas reconocidas ({previewData.detectedColumns.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewData.detectedColumns.map(({ field, header }) => (
                      <span
                        key={field}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs rounded-full font-medium"
                        title={`Campo: ${fieldLabel[field] ?? field}`}
                      >
                        <CheckCircle2 size={10} />
                        {header}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Issues */}
                {previewData.issues.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      {previewData.issues.filter(i => i.type === 'error').length > 0 && (
                        <span className="text-red-500">{previewData.issues.filter(i => i.type === 'error').length} error{previewData.issues.filter(i => i.type === 'error').length > 1 ? 'es' : ''}</span>
                      )}
                      {previewData.issues.filter(i => i.type === 'error').length > 0 && previewData.issues.filter(i => i.type === 'warning').length > 0 && ' · '}
                      {previewData.issues.filter(i => i.type === 'warning').length > 0 && (
                        <span className="text-yellow-600">{previewData.issues.filter(i => i.type === 'warning').length} advertencia{previewData.issues.filter(i => i.type === 'warning').length > 1 ? 's' : ''}</span>
                      )}
                    </p>
                    <div className="rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 max-h-44 overflow-y-auto text-xs">
                      {previewData.issues.map((issue, i) => (
                        <div
                          key={i}
                          className={`flex gap-2 items-start px-3 py-2 ${
                            issue.type === 'error'
                              ? 'bg-red-50 dark:bg-red-900/10'
                              : 'bg-yellow-50 dark:bg-yellow-900/10'
                          }`}
                        >
                          <span className={`font-mono flex-shrink-0 font-semibold ${issue.type === 'error' ? 'text-red-500' : 'text-yellow-600'}`}>
                            Fila {issue.row}
                          </span>
                          <span className={`min-w-0 ${issue.type === 'error' ? 'text-red-700 dark:text-red-300' : 'text-yellow-700 dark:text-yellow-300'}`}>
                            {issue.type === 'warning' ? '⚠ ' : '✕ '}
                            <span className="font-medium">{issue.name}</span> — {issue.message}
                          </span>
                        </div>
                      ))}
                    </div>
                    {previewData.issues.some(i => i.type === 'error') && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        Las filas con error no se importarán. Las advertencias sí se incluyen.
                      </p>
                    )}
                  </div>
                )}

                {previewData.valid === 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                      No hay filas válidas para importar.
                    </p>
                    <p className="text-xs text-red-500 mt-1">Revisa los errores y corrige el archivo.</p>
                  </div>
                )}
              </div>
            ) : null}

            {/* Footer */}
            {!previewMutation.isPending && previewData && (
              <div className="flex gap-3 px-6 pb-5 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closePreview}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={previewData.valid === 0 || importMutation.isPending}
                  onClick={() => pendingFile && importMutation.mutate(pendingFile)}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition flex items-center justify-center gap-2"
                >
                  {importMutation.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
                    : <><ArrowRight size={14} /> Importar {previewData.valid} producto{previewData.valid !== 1 ? 's' : ''}</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Eliminar producto"
        description={deleteTarget ? `¿Eliminar "${deleteTarget.name}"? Esta acción no se puede deshacer.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        variant="danger"
      />

      {/* ── Product Form Modal ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                {editItem ? 'Editar producto' : 'Nuevo producto'}
              </h2>
              <button type="button" aria-label="Cerrar" onClick={() => { setShowForm(false); setEditItem(null); }} className="text-gray-400 hover:text-gray-600 transition">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">

              {/* ── Columna izquierda ──────────────────── */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">Datos del producto</h3>

                <Controller
                  name="images"
                  control={control}
                  defaultValue={[]}
                  render={({ field }) => (
                    <ImageUpload value={field.value || []} onChange={field.onChange} />
                  )}
                />

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Código *</label>
                  <div className="relative">
                    <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input
                      {...register('code')}
                      placeholder="Escanea o escribe el código del producto"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Código de barras</label>
                  <input
                    {...register('barcode')}
                    placeholder="7701234567890"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre del producto *</label>
                  <input
                    {...register('name')}
                    placeholder="Camiseta, perfume, aretes..."
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Cantidad disponible
                      {editItem && <span className="ml-1 text-amber-500">*</span>}
                    </label>
                    <input
                      {...register('stock')}
                      type="number"
                      placeholder="0"
                      readOnly={!!editItem}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none dark:text-white ${
                        editItem
                          ? 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                          : 'border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700'
                      }`}
                    />
                    {editItem && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                        <ArrowUpDown size={10} /> Usa el botón de ajuste en la fila del producto
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cantidad mínima</label>
                    <input
                      {...register('minStock')}
                      type="number"
                      placeholder="5"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio de venta *</label>
                    <input
                      {...register('salePrice')}
                      type="number"
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Costo</label>
                    <input
                      {...register('costPrice')}
                      type="number"
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio mayorista</label>
                    <input
                      {...register('wholesalePrice')}
                      type="number"
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Unidad</label>
                    <input
                      {...register('unit')}
                      placeholder="und, kg, lt..."
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* ── Columna derecha ──────────────────── */}
              <div className="space-y-4 md:border-l md:border-gray-100 md:dark:border-gray-700 md:pl-8">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">Información adicional</h3>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Categoría</label>
                  <Controller
                    name="categoryId"
                    control={control}
                    defaultValue=""
                    render={({ field }) => (
                      <CategorySelect value={field.value || ''} onChange={field.onChange} categories={categories || []} />
                    )}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    placeholder="Añadir una descripción ayudará a identificar mejor el producto"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-none"
                  />
                </div>

                <div>
                  <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Impuestos del producto</h4>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">IVA (%)</label>
                  <input
                    {...register('taxRate')}
                    type="number"
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <input type="checkbox" id="isActive" {...register('isActive')} className="w-4 h-4 accent-blue-600" defaultChecked />
                  <label htmlFor="isActive" className="text-sm text-gray-600 dark:text-gray-300">Producto activo</label>
                </div>

                <div className="flex items-center gap-3">
                  <input type="checkbox" id="allowNegativeStock" {...register('allowNegativeStock')} className="w-4 h-4 accent-blue-600" />
                  <label htmlFor="allowNegativeStock" className="text-sm text-gray-600 dark:text-gray-300">Permitir stock negativo</label>
                </div>
              </div>

              <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button type="button" onClick={() => { setShowForm(false); setEditItem(null); }}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting || saveMutation.isPending}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition flex items-center gap-2">
                  {(isSubmitting || saveMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
                  {editItem ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Ajustar Stock Modal ─────────────────────────────────────────────── */}
      {stockTarget && (() => {
        const newQty = stockForm.quantity === '' ? null : parseFloat(stockForm.quantity);
        const hasChange = newQty !== null && newQty !== stockTarget.stock;
        const isValid = newQty !== null && newQty >= 0;
        const REASONS = ['Error de conteo', 'Merma o daño', 'Pérdida', 'Edición masiva de unidades', 'Otro'];

        function handleConfirm(skipReason = false) {
          if (!isValid) return;
          adjustMutation.mutate({
            id: stockTarget.id,
            type: 'ADJUSTMENT',
            quantity: newQty!,
            reason: skipReason ? 'Ajuste manual' : stockForm.reason,
          });
        }

        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setStockTarget(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <h2 className="font-semibold text-gray-800 dark:text-white">Motivos de la edición</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Registra el motivo para tu historial de inventario</p>
                </div>
                <button type="button" aria-label="Cerrar" onClick={() => setStockTarget(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                  <X size={14} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Producto + indicador de cambio */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {stockTarget.image
                        ? <img src={stockTarget.image} alt="" className="w-full h-full object-cover" />
                        : <Package size={18} className="text-gray-400" />}
                    </div>
                    <span className="text-sm font-medium text-gray-800 dark:text-white truncate">{stockTarget.name}</span>
                  </div>
                  {hasChange && (
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-sm font-semibold">
                      <span className="text-gray-400 line-through tabular-nums">{stockTarget.stock}</span>
                      <ArrowRight size={13} className="text-gray-400" />
                      <span className={newQty! > stockTarget.stock ? 'text-green-600' : 'text-red-500'}>
                        {newQty}
                      </span>
                    </div>
                  )}
                </div>

                {/* Input cantidad */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Nueva cantidad
                    <span className="ml-1.5 text-gray-400 font-normal">— actual: {stockTarget.stock} {stockTarget.unit || ''}</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={stockForm.quantity}
                    onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:bg-gray-700 dark:text-white"
                    placeholder={String(stockTarget.stock)}
                    autoFocus
                  />
                </div>

                {/* Chips de motivo */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2.5">Selecciona un motivo</p>
                  <div className="flex flex-wrap gap-2">
                    {REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setStockForm((f) => ({ ...f, reason: f.reason === r ? '' : r }))}
                        className={`px-3 py-1.5 rounded-full border text-xs transition ${
                          stockForm.reason === r
                            ? 'border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900'
                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-3 px-6 pb-5">
                <button
                  type="button"
                  disabled={!isValid || adjustMutation.isPending}
                  onClick={() => handleConfirm(true)}
                  className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition"
                >
                  Omitir
                </button>
                <button
                  type="button"
                  disabled={!isValid || !stockForm.reason || adjustMutation.isPending}
                  onClick={() => handleConfirm(false)}
                  className="flex-1 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-40 transition flex items-center justify-center gap-2"
                >
                  {adjustMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Confirmar cambios
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Import Results Modal (post-import) ──────────────────────────────── */}
      {importResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setImportResult(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <CheckCircle2 size={18} className="text-green-500" /> Importación completada
              </h2>
              <button type="button" aria-label="Cerrar" onClick={() => setImportResult(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{importResult.imported}</p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">Productos creados</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{importResult.updated}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">Productos actualizados</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 mb-2">
                    {importResult.errors.length} fila{importResult.errors.length > 1 ? 's' : ''} con error:
                  </p>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg divide-y divide-red-100 dark:divide-red-800 max-h-48 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 flex gap-2 text-xs">
                        <span className="font-mono text-red-400 flex-shrink-0">Fila {e.row}</span>
                        <span className="text-red-700 dark:text-red-300">{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResult.imported === 0 && importResult.updated === 0 && importResult.errors.length === 0 && (
                <p className="text-sm text-gray-400 text-center">El archivo no contenía filas válidas.</p>
              )}
            </div>

            <div className="px-6 pb-5">
              <button type="button" onClick={() => setImportResult(null)}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}