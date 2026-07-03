'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Store, Lock, ImagePlus, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

export default function ConfiguracionPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const { data: business } = useQuery({
    queryKey: ['business'],
    queryFn: () => api.get('/business/me').then((r) => r.data.data),
  });

  const { register: regBusiness, handleSubmit: handleBusiness, formState: { isSubmitting: savingBusiness } } = useForm({ values: business });
  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd, formState: { isSubmitting: savingPwd } } = useForm();

  const businessMutation = useMutation({
    mutationFn: (data: any) => api.put('/business/me', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business'] });
      toast.success('Negocio actualizado');
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const pwdMutation = useMutation({
    mutationFn: (data: any) => api.patch('/auth/change-password', data),
    onSuccess: () => { toast.success('Contraseña actualizada'); resetPwd(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al cambiar contraseña'),
  });

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no puede superar 2 MB');
      return;
    }
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append('images', file);
      const upload = await api.post('/uploads/images', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const logoUrl: string = upload.data.data.urls[0];
      await api.put('/business/me', { logo: logoUrl });
      qc.invalidateQueries({ queryKey: ['business'] });
      toast.success('Logo actualizado');
    } catch {
      toast.error('Error al subir el logo');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveLogo() {
    setUploadingLogo(true);
    try {
      await api.put('/business/me', { logo: null });
      qc.invalidateQueries({ queryKey: ['business'] });
      toast.success('Logo eliminado');
    } catch {
      toast.error('Error al eliminar el logo');
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Business Settings */}
      {user?.role === 'ADMIN' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <Store size={18} className="text-blue-500" />
            <h2 className="font-semibold text-gray-800 dark:text-white">Información del negocio</h2>
          </div>

          {/* Logo uploader */}
          <div className="px-6 pt-5 pb-2 border-b border-gray-50 dark:border-gray-700/60">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3">Logo del negocio</p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-gray-700">
                {uploadingLogo ? (
                  <Loader2 size={22} className="animate-spin text-blue-500" />
                ) : business?.logo ? (
                  <img src={business.logo} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <Store size={22} className="text-gray-300" />
                )}
              </div>
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Subir logo del negocio"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition disabled:opacity-50"
                >
                  <ImagePlus size={15} />
                  {business?.logo ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {business?.logo && (
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={handleRemoveLogo}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-500 border border-red-100 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                  >
                    <X size={15} />
                    Quitar logo
                  </button>
                )}
                <p className="text-xs text-gray-400">JPG, PNG o WebP · máx. 2 MB</p>
              </div>
            </div>
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