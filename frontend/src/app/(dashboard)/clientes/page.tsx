'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, Search, Edit, Trash2, Users, X, Loader2, AlertCircle } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => api.get(`/customers?page=${page}&limit=20&search=${encodeURIComponent(search)}`).then((r) => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ['customer', selected?.id],
    queryFn: () => api.get(`/customers/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected?.id,
  });

  const { register, handleSubmit, reset } = useForm();

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem
      ? api.put(`/customers/${editItem.id}`, data)
      : api.post('/customers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(editItem ? 'Cliente actualizado' : 'Cliente creado');
      setShowForm(false); setEditItem(null); reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Cliente eliminado');
      setDeleteTarget(null);
      setSelected(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  const customers = data?.data || [];
  const pagination = data?.pagination;

  function openEdit(c: any) { setEditItem(c); reset(c); setShowForm(true); }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, documento o teléfono..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white dark:border-gray-600"
          />
        </div>
        <button type="button"
          onClick={() => { setEditItem(null); reset({}); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
        >
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-medium">Documento</th>
                <th className="hidden md:table-cell text-left px-4 py-3 font-medium">Teléfono</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 font-medium">Ciudad</th>
                <th className="hidden lg:table-cell text-center px-4 py-3 font-medium">Compras</th>
                <th className="text-right px-4 py-3 font-medium">Deuda</th>
                <th className="w-20 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>
                ))
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400"><Users size={40} className="mx-auto mb-3 opacity-30" /><p>No hay clientes</p></td></tr>
              ) : customers.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition cursor-pointer" onClick={() => setSelected(c)}>
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{c.name}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-500 font-mono text-xs">{c.document || '-'}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500">{c.phone || '-'}</td>
                  <td className="hidden lg:table-cell px-4 py-3 text-gray-500">{c.city || '-'}</td>
                  <td className="hidden lg:table-cell px-4 py-3 text-center text-gray-600">{c._count?.sales || 0}</td>
                  <td className="px-4 py-3 text-right">
                    {c.currentDebt > 0 ? (
                      <span className="text-red-600 font-semibold flex items-center justify-end gap-1">
                        <AlertCircle size={13} /> {formatCurrency(c.currentDebt)}
                      </span>
                    ) : <span className="text-green-600 text-xs">Al día</span>}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      <button type="button" aria-label="Editar cliente" onClick={() => openEdit(c)} className="text-gray-400 hover:text-blue-600 transition"><Edit size={15} /></button>
                      <button type="button" aria-label="Eliminar cliente" onClick={() => setDeleteTarget(c)} className="text-gray-400 hover:text-red-600 transition"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>{pagination.total} clientes</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
              <span>{page} / {pagination.totalPages}</span>
              <button type="button" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Eliminar cliente"
        description={
          deleteTarget
            ? `¿Eliminar a "${deleteTarget.name}"?${deleteTarget.currentDebt > 0 ? ` Tiene una deuda pendiente de ${formatCurrency(deleteTarget.currentDebt)}.` : ''}`
            : undefined
        }
        confirmLabel="Eliminar"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        variant={deleteTarget?.currentDebt > 0 ? 'warning' : 'danger'}
      />

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">{editItem ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button type="button" aria-label="Cerrar" onClick={() => { setShowForm(false); setEditItem(null); }}><X size={20} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="p-6 grid grid-cols-2 gap-4">
              {[
                { name: 'name', label: 'Nombre completo *', col: 2 },
                { name: 'document', label: 'Número de documento', col: 1 },
                { name: 'phone', label: 'Teléfono / WhatsApp', col: 1 },
                { name: 'email', label: 'Correo electrónico', col: 2, type: 'email' },
                { name: 'address', label: 'Dirección', col: 2 },
                { name: 'city', label: 'Ciudad', col: 1 },
                { name: 'creditLimit', label: 'Límite de crédito ($)', col: 1, type: 'number' },
                { name: 'notes', label: 'Observaciones', col: 2 },
              ].map((f) => (
                <div key={f.name} className={f.col === 2 ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input
                    {...register(f.name)}
                    type={f.type || 'text'}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              ))}
              <div className="col-span-2 flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={() => { setShowForm(false); setEditItem(null); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editItem ? 'Actualizar' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && detail && !showForm && !deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">{detail.name}</h2>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Editar" onClick={() => { setSelected(null); openEdit(detail); }} className="text-gray-400 hover:text-blue-600 transition"><Edit size={16} /></button>
                <button type="button" aria-label="Eliminar" onClick={() => { setSelected(null); setDeleteTarget(detail); }} className="text-gray-400 hover:text-red-600 transition"><Trash2 size={16} /></button>
                <button type="button" aria-label="Cerrar" onClick={() => setSelected(null)}><X size={20} className="text-gray-400" /></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[['Documento', detail.document || '-'], ['Teléfono', detail.phone || '-'], ['Email', detail.email || '-'], ['Ciudad', detail.city || '-']].map(([k, v]) => (
                  <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-medium">{v}</p></div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-red-500">Deuda actual</p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(detail.currentDebt || 0)}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-blue-500">Total compras</p>
                  <p className="text-xl font-bold text-blue-600">{detail._count?.sales || 0}</p>
                </div>
              </div>

              {detail.sales?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">ÚLTIMAS COMPRAS</p>
                  <div className="space-y-2">
                    {detail.sales.map((s: any) => (
                      <div key={s.id} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                        <span className="font-mono text-xs text-blue-600">{s.invoiceNumber}</span>
                        <span className="font-semibold">{formatCurrency(s.total)}</span>
                        <span className="text-gray-400 text-xs">{formatDate(s.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}