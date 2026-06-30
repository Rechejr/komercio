'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { CategorySelect } from '@/components/ui/CategorySelect';
import toast from 'react-hot-toast';
import {
  Plus, Search, Edit, Trash2, Package, AlertTriangle,
  X, Loader2, Barcode,
} from 'lucide-react';


export default function InventarioPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

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

  const products = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
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

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={18} className="text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-white">Eliminar producto</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    ¿Eliminar <span className="font-semibold text-gray-700 dark:text-gray-200">{deleteTarget.name}</span>? Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button type="button" onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2 transition">
                {deleteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Form Modal */}
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

              {/* ── Columna izquierda: Datos del producto ──────────────────── */}
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
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cantidad disponible</label>
                    <input
                      {...register('stock')}
                      type="number"
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
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

              {/* ── Columna derecha: Información adicional ──────────────────── */}
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
    </div>
  );
}