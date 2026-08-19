'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { HorarioAvisos } from '@/components/contable/HorarioAvisos';
import { Loader2, Building2, Lock, ImagePlus, Trash2, CalendarClock } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

// Campos de la oficina contable. Reutiliza el mismo Business (PUT /business/me)
// que el POS, pero con etiquetas propias del contexto contable.
type OficinaField = { name: string; label: string; col: 1 | 2; type?: string; required?: boolean };
const OFICINA_FIELDS: OficinaField[] = [
  { name: 'name',    label: 'Nombre de la oficina', col: 2, required: true },
  { name: 'nit',     label: 'NIT',                  col: 1 },
  { name: 'phone',   label: 'Teléfono / WhatsApp',  col: 1 },
  { name: 'email',   label: 'Correo',               col: 1, type: 'email' },
  { name: 'city',    label: 'Ciudad',               col: 1 },
  { name: 'address', label: 'Dirección',            col: 2 },
];

export default function ConfiguracionContablePage() {
  const { user, setUser } = useAuthStore();
  const qc = useQueryClient();
  const esAdmin = user?.role === 'ADMIN';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const regenMut = useMutation({
    mutationFn: () => api.post('/contable/vencimientos/regenerar-todos').then((r) => r.data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['contable-vencimientos'] });
      qc.invalidateQueries({ queryKey: ['contable-panel'] });
      toast.success(res?.message || 'Agenda regenerada');
      setConfirmRegen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'No se pudo regenerar la agenda'),
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

  const { data: business } = useQuery({
    queryKey: ['business'],
    queryFn: () => api.get('/business/me').then((r) => r.data.data),
    enabled: esAdmin,
  });

  const {
    register: regBiz, handleSubmit: handleBiz,
    formState: { errors: bizErrors, isSubmitting: savingBiz },
  } = useForm({ values: business });

  const {
    register: regPwd, handleSubmit: handlePwd, reset: resetPwd, watch: watchPwd,
  } = useForm();

  const bizMut = useMutation({
    mutationFn: (data: any) => api.put('/business/me', data),
    onSuccess: (_res, vars: any) => {
      qc.invalidateQueries({ queryKey: ['business'] });
      // Refresca el nombre que muestra el sidebar/tarjeta de la oficina sin recargar.
      if (user && vars?.name) setUser({ ...user, businessName: vars.name });
      toast.success('Oficina actualizada');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'No se pudo actualizar'),
  });

  const pwdMut = useMutation({
    mutationFn: (data: any) => api.patch('/auth/change-password', data),
    onSuccess: () => { toast.success('Contraseña actualizada'); resetPwd(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'No se pudo cambiar la contraseña'),
  });

  return (
    <div className="space-y-4 animate-fade-up max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Configuración</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
          Administra los datos de tu oficina y tu contraseña.
        </p>
      </div>

      {/* ── Información de la oficina (solo el Contador/ADMIN) ─────────────── */}
      {esAdmin && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2.5">
            <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <Building2 size={14} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Información de la oficina</h2>
          </div>
          <form onSubmit={handleBiz((d: any) => bizMut.mutate(d))} className="p-6 space-y-4">
            {/* Logo de la oficina */}
            <div className="flex items-center gap-4 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0">
                {business?.logo
                  ? <img src={business.logo} alt="Logo" className="w-full h-full object-cover" />
                  : <Building2 size={22} className="text-slate-300 dark:text-slate-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Logo de la oficina</p>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-2">PNG o JPG, máximo 2 MB.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition"
                  >
                    {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Subir logo
                  </button>
                  {business?.logo && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={uploadingLogo}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 transition"
                    >
                      <Trash2 size={13} /> Quitar
                    </button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {OFICINA_FIELDS.map((f) => (
                <div key={f.name} className={f.col === 2 ? 'sm:col-span-2' : ''}>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {f.label}{f.required && ' *'}
                  </label>
                  <input
                    {...regBiz(f.name as any, f.required ? { required: 'Este campo es obligatorio', minLength: { value: 2, message: 'Mínimo 2 caracteres' } } : {})}
                    type={f.type || 'text'}
                    className={inputCls}
                  />
                  {(bizErrors as any)[f.name] && (
                    <p className="text-[11px] text-red-500 mt-1">{(bizErrors as any)[f.name]?.message}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-slate-100 dark:border-white/[0.06] pt-4">
              <button
                type="submit"
                disabled={bizMut.isPending || savingBiz}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/25 flex items-center gap-2 transition"
              >
                {(bizMut.isPending || savingBiz) && <Loader2 size={14} className="animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Horario de los avisos de vencimientos ──────────────────────────
          Vivía en el Panel, pero ahí competía con la agenda del día: es algo
          que se configura una vez, no que se mira a diario. Lo ve cualquiera
          (ADMIN y AUXILIAR), porque cada quien elige cuándo le suena a él. */}
      <HorarioAvisos />

      {/* ── Agenda del año: regenerar vencimientos de todos los clientes ───── */}
      {esAdmin && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2.5">
            <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <CalendarClock size={14} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Agenda del año</h2>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Genera la agenda tributaria del año en curso para <b>todos tus clientes activos</b>,
              según sus responsabilidades (renta, IVA, retención, etc.). Útil al iniciar un nuevo año
              (tras cargar el calendario nuevo) o después de agregar varios clientes.
              No duplica ni borra lo que ya esté registrado.
            </p>
            <button
              onClick={() => setConfirmRegen(true)}
              disabled={regenMut.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[13px] font-semibold disabled:opacity-60 transition"
            >
              {regenMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={15} />}
              Regenerar agenda del año
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={(o) => !o && setConfirmRegen(false)}
        title="¿Regenerar la agenda del año?"
        description="Se generarán los vencimientos del año en curso para todos tus clientes activos, según sus responsabilidades. No se duplica ni se borra nada de lo ya registrado."
        confirmLabel="Regenerar"
        loading={regenMut.isPending}
        onConfirm={() => regenMut.mutate()}
      />

      {/* ── Cambiar contraseña (todos los roles: es su propia clave) ───────── */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2.5">
          <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
            <Lock size={14} className="text-slate-500 dark:text-slate-400" />
          </div>
          <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Cambiar contraseña</h2>
        </div>
        <form
          onSubmit={handlePwd((d: any) => { const { confirmNewPassword: _omit, ...body } = d; pwdMut.mutate(body); })}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Contraseña actual</label>
            <input {...regPwd('currentPassword', { required: 'Campo requerido' })} type="password" className={inputCls} />
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
              disabled={pwdMut.isPending}
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/25 flex items-center gap-2 transition"
            >
              {pwdMut.isPending && <Loader2 size={14} className="animate-spin" />}
              Actualizar contraseña
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
