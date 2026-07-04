'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Store, Lock, ImagePlus, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

const BIZ_FIELDS = [
  { name: 'name',      label: 'Nombre del negocio', col: 2 },
  { name: 'legalName', label: 'Razón social',        col: 2 },
  { name: 'nit',       label: 'NIT / RUT',           col: 1 },
  { name: 'phone',     label: 'Teléfono',            col: 1 },
  { name: 'email',     label: 'Correo',              col: 1, type: 'email' },
  { name: 'address',   label: 'Dirección',           col: 1 },
  { name: 'city',      label: 'Ciudad',              col: 1 },
  { name: 'currency',  label: 'Moneda',              col: 1 },
];

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
  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd, watch: watchPwd, formState: { isSubmitting: savingPwd } } = useForm();

  const businessMutation = useMutation({
    mutationFn: (data: any) => api.put('/business/me', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['business'] }); toast.success('Negocio actualizado'); },
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
    if (file.size > 2 * 1024 * 1024) { toast.error('La imagen no puede superar 2 MB'); return; }
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append('images', file);
      const upload = await api.post('/uploads/images', form, { headers: { 'Content-Type': 'multipart/form-data' } });
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
    <div className="max-w-2xl space-y-4 animate-fade-up">

      {/* ── Información del negocio (solo ADMIN) ─────────────────────────── */}
      {user?.role === 'ADMIN' && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Store size={14} className="text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Información del negocio</h2>
          </div>

          {/* Logo uploader */}
          <div className="px-6 pt-5 pb-5 border-b border-slate-50 dark:border-white/[0.04]">
            <p className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-3">Logo del negocio</p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0 bg-slate-50 dark:bg-slate-800">
                {uploadingLogo ? (
                  <Loader2 size={20} className="animate-spin text-blue-500" />
                ) : business?.logo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={business.logo} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <Store size={20} className="text-slate-300 dark:text-slate-600" />
                )}
              </div>
              <div className="space-y-2">
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
                  className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition disabled:opacity-50"
                >
                  <ImagePlus size={14} />
                  {business?.logo ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {business?.logo && (
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={handleRemoveLogo}
                    className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-red-500 dark:text-red-400 border border-red-100 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition disabled:opacity-50"
                  >
                    <X size={14} />
                    Quitar logo
                  </button>
                )}
                <p className="text-[11px] text-slate-400 dark:text-slate-500">JPG, PNG o WebP · máx. 2 MB</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleBusiness((d: any) => businessMutation.mutate(d))} className="p-6 grid grid-cols-2 gap-4">
            {BIZ_FIELDS.map((f) => (
              <div key={f.name} className={f.col === 2 ? 'col-span-2' : ''}>
                <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">{f.label}</label>
                <input {...regBusiness(f.name)} type={f.type || 'text'} className={inputCls} />
              </div>
            ))}
            <div className="col-span-2 flex justify-end border-t border-slate-100 dark:border-white/[0.06] pt-4">
              <button
                type="submit"
                disabled={businessMutation.isPending || savingBusiness}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-sm shadow-blue-600/25 flex items-center gap-2 transition"
              >
                {(businessMutation.isPending || savingBusiness) && <Loader2 size={14} className="animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Cambiar contraseña ────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2.5">
          <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
            <Lock size={14} className="text-slate-500 dark:text-slate-400" />
          </div>
          <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Cambiar contraseña</h2>
        </div>
        <form onSubmit={handlePwd((d: any) => { const { confirmNewPassword: _, ...body } = d; pwdMutation.mutate(body); })} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Contraseña actual</label>
            <input {...regPwd('currentPassword', { required: 'Campo requerido', minLength: { value: 1, message: 'Mínimo 1 carácter' } })} type="password" className={inputCls} />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Nueva contraseña</label>
            <input {...regPwd('newPassword', { required: 'Campo requerido', minLength: { value: 8, message: 'Mínimo 8 caracteres' } })} type="password" className={inputCls} />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Confirmar nueva contraseña</label>
            <input
              {...regPwd('confirmNewPassword', {
                required: 'Campo requerido',
                validate: (v: string) => v === watchPwd('newPassword') || 'Las contraseñas no coinciden',
              })}
              type="password"
              className={inputCls}
            />
          </div>
          <div className="flex justify-end border-t border-slate-100 dark:border-white/[0.06] pt-4">
            <button
              type="submit"
              disabled={pwdMutation.isPending || savingPwd}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-sm shadow-blue-600/25 flex items-center gap-2 transition"
            >
              {(pwdMutation.isPending || savingPwd) && <Loader2 size={14} className="animate-spin" />}
              Actualizar contraseña
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
