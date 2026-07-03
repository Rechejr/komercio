'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Store, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

export default function ConfiguracionPage() {
  const { user } = useAuthStore();

  const { data: business } = useQuery({
    queryKey: ['business'],
    queryFn: () => api.get('/business/me').then((r) => r.data.data),
  });

  const { register: regBusiness, handleSubmit: handleBusiness, formState: { isSubmitting: savingBusiness } } = useForm({ values: business });
  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd, formState: { isSubmitting: savingPwd } } = useForm();

  const businessMutation = useMutation({
    mutationFn: (data: any) => api.put('/business/me', data),
    onSuccess: () => toast.success('Negocio actualizado'),
    onError: () => toast.error('Error al actualizar'),
  });

  const pwdMutation = useMutation({
    mutationFn: (data: any) => api.patch('/auth/change-password', data),
    onSuccess: () => { toast.success('Contraseña actualizada'); resetPwd(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al cambiar contraseña'),
  });

  return (
    <div className="max-w-2xl space-y-6">
      {/* Business Settings */}
      {user?.role === 'ADMIN' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <Store size={18} className="text-blue-500" />
            <h2 className="font-semibold text-gray-800 dark:text-white">Información del negocio</h2>
          </div>
          <form onSubmit={handleBusiness((d) => businessMutation.mutate(d))} className="p-6 grid grid-cols-2 gap-4">
            {[
              { name: 'name', label: 'Nombre del negocio', col: 2 },
              { name: 'legalName', label: 'Razón social', col: 2 },
              { name: 'nit', label: 'NIT / RUT', col: 1 },
              { name: 'phone', label: 'Teléfono', col: 1 },
              { name: 'email', label: 'Correo', col: 1, type: 'email' },
              { name: 'address', label: 'Dirección', col: 1 },
              { name: 'city', label: 'Ciudad', col: 1 },
              { name: 'currency', label: 'Moneda', col: 1 },
            ].map((f) => (
              <div key={f.name} className={f.col === 2 ? 'col-span-2' : ''}>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{f.label}</label>
                <input
                  {...regBusiness(f.name)}
                  type={f.type || 'text'}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
            ))}
            <div className="col-span-2 flex justify-end">
              <button type="submit" disabled={businessMutation.isPending || savingBusiness}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {(businessMutation.isPending || savingBusiness) && <Loader2 size={14} className="animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change Password */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Lock size={18} className="text-blue-500" />
          <h2 className="font-semibold text-gray-800 dark:text-white">Cambiar contraseña</h2>
        </div>
        <form onSubmit={handlePwd((d) => pwdMutation.mutate(d))} className="p-6 space-y-4">
          {[
            { name: 'currentPassword', label: 'Contraseña actual', min: 1 },
            { name: 'newPassword', label: 'Nueva contraseña', min: 8 },
          ].map((f) => (
            <div key={f.name}>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{f.label}</label>
              <input
                {...regPwd(f.name, { required: 'Campo requerido', minLength: { value: f.min, message: `Mínimo ${f.min} caracteres` } })}
                type="password"
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          ))}
          <div className="flex justify-end">
            <button type="submit" disabled={pwdMutation.isPending || savingPwd}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {(pwdMutation.isPending || savingPwd) && <Loader2 size={14} className="animate-spin" />}
              Actualizar contraseña
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
