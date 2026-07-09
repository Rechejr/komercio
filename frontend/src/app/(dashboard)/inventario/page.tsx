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
  ArrowRight, Lock, ArrowUpDown, Share2, ScanLine,
} from 'lucide-react';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StaggerList, StaggerItem } from '@/components/ui/StaggerList';
import { PriceInput } from '@/components/ui/PriceInput';

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

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

export default function InventarioPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const plan       = useAuthStore((s) => s.user?.plan);
  const businessId = useAuthStore((s) => s.user?.businessId);
  const isFree     = !plan || plan === 'free';
  const openUpgrade = useUpgradeStore((s) => s.open);

  function shareCatalog() {
    if (!businessId) return;
    const url = `${window.location.origin}/catalogo/${businessId}`;
    navigator.clipboard.writeText(url).then(() => toast.success('¡Link del catálogo copiado!'));
  }
  function shareCatalogWhatsApp() {
    if (!businessId) return;
    const url = `${window.location.origin}/catalogo/${businessId}`;
    const text = `¡Mira nuestro catálogo de productos! 🛒\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }
  const [search, setSearch]         = useState(() => searchParams.get('search') || '');
  const [showScanner, setShowScanner] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const formScrollRef = useRef<HTMLFormElement>(null);
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
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  const { register, handleSubmit, reset, control, formState: { isSubmitting, errors } } = useForm();

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

  useEffect(() => {
    if (!showForm) return;
    // rAF corre DESPUÉS del autofocus del browser, que haría scroll al primer input.
    // Así el reset gana siempre.
    const id = requestAnimationFrame(() => {
      if (formScrollRef.current) {
        formScrollRef.current.scrollTop = 0;
        formScrollRef.current.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [showForm]);

  useEffect(() => {
    const productId = searchParams.get('productId');
    if (!productId) return;
    api.get(`/products/${productId}`)
      .then((r) => openEdit(r.data.data))
      .catch(() => toast.error('Producto no encontrado'))
      .finally(() => router.replace('/inventario'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) setSearch(q);
  }, [searchParams]);

  const products = data?.data || [];
  const pagination = data?.pagination;

  return (
    <>
    <div
      className="space-y-5 animate-fade-up relative"
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
      {/* Drag overlay */}
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
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por nombre, código o código de barras..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            title="Escanear código de barras"
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm shadow-emerald-600/20"
          >
            <ScanLine size={16} />
          </button>
        </div>

        {showScanner && (
          <BarcodeScanner
            onScan={(code) => { setSearch(code); setPage(1); setShowScanner(false); }}
            onClose={() => setShowScanner(false)}
          />
        )}

        {isFree ? (
          <button
            type="button"
            onClick={openUpgrade}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <FileDown size={15} />
            Plantilla
            <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full leading-none">PRO</span>
          </button>
        ) : (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/products/import-template`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <FileDown size={15} /> Plantilla
          </a>
        )}

        {isFree ? (
          <button
            type="button"
            onClick={openUpgrade}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <Lock size={14} />
            Importar Excel
            <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full leading-none">PRO</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={previewMutation.isPending || importMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 border border-emerald-200 dark:border-emerald-700/50 rounded-xl text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 transition"
          >
            {(previewMutation.isPending || importMutation.isPending)
              ? <Loader2 size={15} className="animate-spin" />
              : <FileUp size={15} />}
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

        {/* Compartir catálogo */}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={shareCatalog}
            title="Copiar link del catálogo"
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <Share2 size={15} /> Compartir catálogo
          </button>
          <button
            type="button"
            onClick={shareCatalogWhatsApp}
            title="Compartir catálogo por WhatsApp"
            className="flex items-center justify-center w-10 py-2.5 bg-[#25D366] text-white rounded-xl hover:bg-[#1ebe5d] transition"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.116.554 4.103 1.523 5.824L.057 23.885a.5.5 0 0 0 .611.61l6.101-1.466A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.883 9.883 0 0 1-5.036-1.374l-.36-.214-3.733.897.915-3.638-.235-.374A9.861 9.861 0 0 1 2.106 12C2.106 6.527 6.527 2.106 12 2.106S21.894 6.527 21.894 12 17.473 21.894 12 21.894z"/>
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={() => { setEditItem(null); reset({ images: [], isActive: true }); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition"
        >
          <Plus size={15} /> Nuevo producto
        </button>
      </div>

      {/* ── Products table ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="w-14 px-4 py-3 sr-only">Imagen</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Código</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nombre</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Categoría</th>
                <th className="hidden md:table-cell text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Costo</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Precio</th>
                <th className="hidden lg:table-cell text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Margen</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Stock</th>
                <th className="hidden sm:table-cell text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Estado</th>
                <th className="w-24 sr-only">Acciones</th>
              </tr>
            </thead>
            <StaggerList as="tbody" className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(10)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <Package size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">No hay productos</p>
                    </div>
                  </td>
                </tr>
              ) : products.map((p: any, idx: number) => {
                const margin = p.costPrice > 0
                  ? (((p.salePrice - p.costPrice) / p.costPrice) * 100).toFixed(1)
                  : null;
                const isLowStock = p.stock <= p.minStock;
                return (
                  <StaggerItem as="tr" key={p.id} index={idx} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} className="w-10 h-10 rounded-xl object-cover border border-slate-100 dark:border-white/[0.06]" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <Package size={16} className="text-slate-300 dark:text-slate-600" />
                        </div>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 font-mono text-[12px] text-slate-400 dark:text-slate-500">{p.code}</td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-slate-800 dark:text-white">{p.name}</p>
                      {p.barcode && <p className="text-[11px] text-slate-400 mt-0.5">{p.barcode}</p>}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">{p.category?.name || '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-right text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">{formatCurrency(p.costPrice)}</td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-slate-900 dark:text-white tabular-nums">{formatCurrency(p.salePrice)}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right">
                      {margin !== null ? (
                        <span className={`badge ${
                          parseFloat(margin) >= 20
                            ? 'badge-green'
                            : parseFloat(margin) >= 0
                            ? 'badge-amber'
                            : 'badge-red'
                        }`}>
                          {margin}%
                        </span>
                      ) : <span className="text-slate-300 dark:text-slate-600 text-[12px]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        isLowStock
                          ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                      }`}>
                        {isLowStock && <AlertTriangle size={10} />}
                        {p.stock} {p.unit || ''}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center">
                      <span className={`badge ${p.isActive ? 'badge-green' : 'badge-slate'}`}>
                        {p.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          aria-label="Ajustar stock"
                          onClick={() => { setStockTarget(p); setStockForm({ quantity: String(p.stock), reason: '' }); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
                          title="Ajustar stock"
                        >
                          <ArrowUpDown size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Editar producto"
                          onClick={() => openEdit(p)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Eliminar producto"
                          onClick={() => setDeleteTarget(p)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </StaggerItem>
                );
              })}
            </StaggerList>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[13px] text-slate-500">
            <span>{pagination.total} productos</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-[12px]"
              >
                Anterior
              </button>
              <span className="px-3 py-1.5 text-slate-400">{page} / {pagination.totalPages}</span>
              <button
                type="button"
                disabled={page === pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-[12px]"
              >
                Siguiente
              </button>
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
                <FileUp size={16} className="text-emerald-500" />
                Vista previa de importación
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={closePreview}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
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
                  producto{previewData.total !== 1 ? 's' : ''} en el archivo
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
                      <span
                        key={field}
                        title={`Campo: ${fieldLabel[field] ?? field}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] rounded-full font-medium"
                      >
                        <CheckCircle2 size={10} />
                        {header}
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
                        <div
                          key={i}
                          className={`flex gap-2 items-start px-3 py-2 ${
                            issue.type === 'error'
                              ? 'bg-red-50 dark:bg-red-500/10'
                              : 'bg-amber-50 dark:bg-amber-500/10'
                          }`}
                        >
                          <span className={`font-mono flex-shrink-0 font-semibold ${issue.type === 'error' ? 'text-red-500' : 'text-amber-500'}`}>
                            Fila {issue.row}
                          </span>
                          <span className={`min-w-0 ${issue.type === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                            {issue.type === 'warning' ? '⚠ ' : '✕ '}
                            <span className="font-medium">{issue.name}</span> — {issue.message}
                          </span>
                        </div>
                      ))}
                    </div>
                    {previewData.issues.some(i => i.type === 'error') && (
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Las filas con error no se importarán. Las advertencias sí se incluyen.
                      </p>
                    )}
                  </div>
                )}

                {previewData.valid === 0 && (
                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-4 text-center">
                    <p className="text-[13px] text-red-700 dark:text-red-300 font-medium">
                      No hay filas válidas para importar.
                    </p>
                    <p className="text-[12px] text-red-500 mt-1">Revisa los errores y corrige el archivo.</p>
                  </div>
                )}
              </div>
            ) : null}

            {!previewMutation.isPending && previewData && (
              <div className="flex gap-3 px-6 pb-5 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={closePreview}
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={previewData.valid === 0 || importMutation.isPending}
                  onClick={() => pendingFile && importMutation.mutate(pendingFile)}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-600/25 transition flex items-center justify-center gap-2"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div tabIndex={-1} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-4xl max-h-[90vh] flex flex-col animate-scale-in outline-none">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0 bg-white dark:bg-slate-900">
              <h2 className="text-[16px] font-semibold text-slate-800 dark:text-white">
                {editItem ? 'Editar producto' : 'Nuevo producto'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => { setShowForm(false); setEditItem(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={16} />
              </button>
            </div>

            <form ref={formScrollRef} tabIndex={-1} onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 overflow-y-auto min-h-0 outline-none">

              {/* ── Columna izquierda ──────────────────── */}
              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Datos del producto</h3>

                <Controller
                  name="images"
                  control={control}
                  defaultValue={[]}
                  render={({ field }) => (
                    <ImageUpload value={field.value || []} onChange={field.onChange} />
                  )}
                />

                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Código *</label>
                  <div className="relative">
                    <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      {...register('code', { required: 'El código es obligatorio' })}
                      placeholder="Escanea o escribe el código"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition"
                    />
                  </div>
                  {errors.code && <p className="text-[11px] text-red-500 mt-1">{errors.code.message as string}</p>}
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Código de barras</label>
                  <input {...register('barcode')} placeholder="7701234567890" className={inputCls} />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Nombre del producto *</label>
                  <input {...register('name', { required: 'El nombre es obligatorio' })} placeholder="Camiseta, perfume, aretes..." className={inputCls} />
                  {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name.message as string}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Cantidad disponible
                      {editItem && <span className="ml-1 text-amber-500">*</span>}
                    </label>
                    <input
                      {...register('stock', { valueAsNumber: true })}
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      readOnly={!!editItem}
                      className={`w-full px-3 py-2.5 border rounded-xl text-[16px] sm:text-sm focus:outline-none dark:text-white transition ${
                        editItem
                          ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                          : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700'
                      }`}
                    />
                    {editItem && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                        <ArrowUpDown size={10} /> Usa el botón de ajuste en la fila
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Cantidad mínima</label>
                    <input
                      {...register('minStock', { valueAsNumber: true, min: { value: 0, message: 'No puede ser negativo' } })}
                      type="number" inputMode="numeric" min="0" placeholder="5" className={inputCls}
                    />
                    {errors.minStock && <p className="text-[11px] text-red-500 mt-1">{errors.minStock.message as string}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Precio de venta *</label>
                    <Controller control={control} name="salePrice" rules={{ required: 'El precio es obligatorio', min: { value: 1, message: 'El precio debe ser mayor a 0' } }} render={({ field }) => (
                      <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder="0" />
                    )} />
                    {errors.salePrice && <p className="text-[11px] text-red-500 mt-1">{errors.salePrice.message as string}</p>}
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Costo</label>
                    <Controller control={control} name="costPrice" render={({ field }) => (
                      <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder="0" />
                    )} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Precio mayorista</label>
                    <Controller control={control} name="wholesalePrice" render={({ field }) => (
                      <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder="0" />
                    )} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Unidad</label>
                    <input {...register('unit')} placeholder="und, kg, lt..." className={inputCls} />
                  </div>
                </div>

              </div>

              {/* ── Columna derecha ──────────────────── */}
              <div className="space-y-4 md:border-l md:border-slate-100 md:dark:border-white/[0.06] md:pl-8">
                <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Información adicional</h3>

                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Categoría</label>
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
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Descripción</label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    placeholder="Añadir una descripción ayudará a identificar mejor el producto"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition resize-none"
                  />
                </div>

                <div>
                  <h4 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">Impuestos</h4>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">IVA (%)</label>
                  <input
                    {...register('taxRate', {
                      valueAsNumber: true,
                      min: { value: 0, message: 'No puede ser negativo' },
                      max: { value: 100, message: 'No puede ser mayor a 100' },
                    })}
                    type="number" inputMode="numeric" min="0" max="100" placeholder="0" className={inputCls}
                  />
                  {errors.taxRate && <p className="text-[11px] text-red-500 mt-1">{errors.taxRate.message as string}</p>}
                </div>

                <div className="space-y-3 pt-1">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" id="isActive" {...register('isActive')} defaultChecked className="w-4 h-4 accent-emerald-600 rounded" />
                    <span className="text-[13px] text-slate-600 dark:text-slate-300">Producto activo</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" id="allowNegativeStock" {...register('allowNegativeStock')} className="w-4 h-4 accent-emerald-600 rounded" />
                    <span className="text-[13px] text-slate-600 dark:text-slate-300">Permitir stock negativo</span>
                  </label>
                </div>
              </div>

              <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditItem(null); }}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || saveMutation.isPending}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-600/25 transition flex items-center gap-2"
                >
                  {(isSubmitting || saveMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
                  {editItem ? 'Actualizar' : 'Crear producto'}
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
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
            onClick={() => setStockTarget(null)}
          >
            <div
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Ajustar stock</h2>
                  <p className="text-[12px] text-slate-400 mt-0.5">Registra el motivo en tu historial</p>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => setStockTarget(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {stockTarget.image
                        ? <img src={stockTarget.image} alt="" className="w-full h-full object-cover" />
                        : <Package size={18} className="text-slate-400" />}
                    </div>
                    <span className="text-[13px] font-medium text-slate-800 dark:text-white truncate">{stockTarget.name}</span>
                  </div>
                  {hasChange && (
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-[13px] font-semibold">
                      <span className="text-slate-400 line-through tabular-nums">{stockTarget.stock}</span>
                      <ArrowRight size={12} className="text-slate-400" />
                      <span className={newQty! > stockTarget.stock ? 'text-emerald-600' : 'text-red-500'}>
                        {newQty}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Nueva cantidad
                    <span className="ml-1.5 text-slate-400 font-normal">— actual: {stockTarget.stock} {stockTarget.unit || ''}</span>
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={stockForm.quantity}
                    onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))}
                    className={inputCls}
                    placeholder={String(stockTarget.stock)}
                    autoFocus
                  />
                </div>

                <div>
                  <p className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-2.5">Selecciona un motivo</p>
                  <div className="flex flex-wrap gap-2">
                    {REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setStockForm((f) => ({ ...f, reason: f.reason === r ? '' : r }))}
                        className={`px-3 py-1.5 rounded-full border text-[12px] transition ${
                          stockForm.reason === r
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 px-6 pb-5">
                <button
                  type="button"
                  disabled={!isValid || adjustMutation.isPending}
                  onClick={() => handleConfirm(true)}
                  className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition"
                >
                  Omitir motivo
                </button>
                <button
                  type="button"
                  disabled={!isValid || !stockForm.reason || adjustMutation.isPending}
                  onClick={() => handleConfirm(false)}
                  className="flex-1 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[13px] font-semibold hover:bg-slate-700 dark:hover:bg-slate-100 disabled:opacity-40 transition flex items-center justify-center gap-2"
                >
                  {adjustMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Import Results Modal ─────────────────────────────────────────────── */}
      {importResult && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
          onClick={() => setImportResult(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-md max-h-[80vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500" /> Importación completada
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setImportResult(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
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

              {importResult.imported === 0 && importResult.updated === 0 && importResult.errors.length === 0 && (
                <p className="text-[13px] text-slate-400 text-center py-2">El archivo no contenía filas válidas.</p>
              )}
            </div>

            <div className="px-6 pb-5">
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}