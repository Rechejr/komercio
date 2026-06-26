'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Search, Edit, Truck, X, Loader2 } from 'lucide-react';

export default function ProveedoresPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

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

  const suppliers = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar proveedor..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white dark:border-gray-600" />
        </div>
        <button onClick={() => { setEditItem(null); reset({}); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
          <Plus size={16} /> Nuevo proveedor
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium">Contacto</th>
                <th className="text-left px-4 py-3 font-medium">Teléfono</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-center px-4 py-3 font-medium">Productos</th>
                <th className="w-16 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {isLoading ? (
                [...Array(5)].map((_, i) => <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>)
              ) : suppliers.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400"><Truck size={40} className="mx-auto mb-3 opacity-30" /><p>No hay proveedores</p></td></tr>
              ) : suppliers.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500">{s.contactName || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.phone || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.email || '-'}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{s._count?.products || 0}</td>
                  <td className="px-4 py-3">
                    <button type="button" aria-label="Editar proveedor" onClick={() => { setEditItem(s); reset(s); setShowForm(true); }} className="text-gray-400 hover:text-blue-600 transition"><Edit size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-white">{editItem ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
              <button type="button" aria-label="Cerrar" onClick={() => { setShowForm(false); setEditItem(null); }}><X size={20} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="p-6 grid grid-cols-2 gap-4">
              {[
                { name: 'name', label: 'Nombre *', col: 2 },
                { name: 'document', label: 'NIT / Documento', col: 1 },
                { name: 'contactName', label: 'Persona de contacto', col: 1 },
                { name: 'phone', label: 'Teléfono', col: 1 },
                { name: 'email', label: 'Correo', col: 1, type: 'email' },
                { name: 'address', label: 'Dirección', col: 2 },
                { name: 'city', label: 'Ciudad', col: 1 },
                { name: 'notes', label: 'Notas', col: 1 },
              ].map((f) => (
                <div key={f.name} className={f.col === 2 ? 'col-span-2' : ''}>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{f.label}</label>
                  <input {...register(f.name)} type={f.type || 'text'}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                </div>
              ))}
              <div className="col-span-2 flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={() => { setShowForm(false); setEditItem(null); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
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
