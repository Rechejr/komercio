'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Store, Lock, ImagePlus, X, Users, UserPlus, Edit, Shield, UserX, Volume2, VolumeX, Building2, MapPin, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useSoundStore } from '@/store/sound.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { sounds } from '@/lib/sounds';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

const BIZ_FIELDS = [
  {
    name: 'name', label: 'Nombre del negocio', col: 2,
    validation: { required: 'El nombre del negocio es obligatorio', minLength: { value: 2, message: 'Mínimo 2 caracteres' } },
  },
  {
    name: 'legalName', label: 'Razón social', col: 2,
    validation: { minLength: { value: 2, message: 'Mínimo 2 caracteres' } },
  },
  {
    name: 'nit', label: 'NIT / RUT', col: 1,
    validation: { pattern: { value: /^[0-9\-]{5,20}$/, message: 'Solo dígitos y guiones (5-20 caracteres)' } },
  },
  {
    name: 'phone', label: 'Teléfono', col: 1, maxLength: 10,
    validation: { maxLength: { value: 10, message: 'Máximo 10 dígitos' }, pattern: { value: /^[0-9+\s\-()]{7,10}$/, message: 'Teléfono inválido (máx. 10 dígitos)' } },
  },
  {
    name: 'email', label: 'Correo', col: 1, type: 'email',
    validation: { pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Correo inválido' } },
  },
  { name: 'address', label: 'Dirección', col: 1, validation: {} },
  { name: 'city',    label: 'Ciudad',    col: 1, validation: {} },
  { name: 'currency', label: 'Moneda',  col: 1, validation: {} },
] satisfies { name: string; label: string; col: number; type?: string; maxLength?: number; validation: object }[];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  CASHIER: 'Cajero',
};

// Debe reflejar backend/src/config/plans.ts — solo se usa para el aviso previo
// en el frontend; el límite real siempre lo aplica el servidor.
const BRANCH_LIMIT: Record<string, number> = { free: 1, pro: 2 };

export default function ConfiguracionPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const { enabled: soundEnabled, toggle: toggleSound } = useSoundStore();
  const openUpgrade = useUpgradeStore((s) => s.open);

  // Employee form state
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editEmp, setEditEmp] = useState<any>(null);
  const [deleteEmpTarget, setDeleteEmpTarget] = useState<any>(null);

  // Branch form state
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [editBranch, setEditBranch] = useState<any>(null);

  const { data: business } = useQuery({
    queryKey: ['business'],
    queryFn: () => api.get('/business/me').then((r) => r.data.data),
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=50').then((r) => r.data),
    enabled: user?.role === 'ADMIN',
  });

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/business/branches').then((r) => r.data.data),
    enabled: user?.role === 'ADMIN',
  });

  const employees = usersData?.data || [];
  const branches: any[] = branchesData || [];

  const { register: regBusiness, handleSubmit: handleBusiness, formState: { isSubmitting: savingBusiness, errors: bizErrors } } = useForm({ values: business });
  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd, watch: watchPwd, formState: { isSubmitting: savingPwd } } = useForm();
  const { register: regEmp, handleSubmit: handleEmp, reset: resetEmp, formState: { errors: empErrors } } = useForm();
  const { register: regBranch, handleSubmit: handleBranchSubmit, reset: resetBranch, formState: { errors: branchErrors } } = useForm();

  const businessMutation = useMutation({
    mutationFn: (data: any) => api.put('/business/me', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['business'] }); toast.success('Negocio actualizado'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al actualizar'),
  });

  const pwdMutation = useMutation({
    mutationFn: (data: any) => api.patch('/auth/change-password', data),
    onSuccess: () => { toast.success('Contraseña actualizada'); resetPwd(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al cambiar contraseña'),
  });

  const saveEmpMutation = useMutation({
    mutationFn: (data: any) => editEmp
      ? api.patch(`/users/${editEmp.id}`, data)
      : api.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(editEmp ? 'Empleado actualizado' : 'Empleado creado');
      setShowEmpForm(false);
      setEditEmp(null);
      resetEmp();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al guardar'),
  });

  const toggleEmpMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/users/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Estado actualizado');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error'),
  });

  const deleteEmpMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Empleado eliminado');
      setDeleteEmpTarget(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  });

  const saveBranchMutation = useMutation({
    mutationFn: (data: any) => editBranch
      ? api.put(`/business/branches/${editBranch.id}`, data)
      : api.post('/business/branches', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success(editBranch ? 'Bodega actualizada' : 'Bodega creada');
      setShowBranchForm(false);
      setEditBranch(null);
      resetBranch();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al guardar la bodega'),
  });

  function openNewBranch() {
    const limit = BRANCH_LIMIT[user?.plan || 'free'] ?? 1;
    if (branches.length >= limit) {
      if ((user?.plan || 'free') === 'free') { openUpgrade(); return; }
      toast.error(`Límite de ${limit} bodegas alcanzado en el plan Pro`);
      return;
    }
    setEditBranch(null);
    resetBranch({ name: '', address: '', phone: '' });
    setShowBranchForm(true);
  }

  function openEditBranch(branch: any) {
    setEditBranch(branch);
    resetBranch({ name: branch.name, address: branch.address || '', phone: branch.phone || '' });
    setShowBranchForm(true);
  }

  function openNewEmp() {
    setEditEmp(null);
    resetEmp({ name: '', email: '', password: '', role: 'CASHIER', branchId: branches[0]?.id || '' });
    setShowEmpForm(true);
  }

  function openEditEmp(emp: any) {
    setEditEmp(emp);
    resetEmp({ name: emp.name, role: emp.role, branchId: emp.branchId || '' });
    setShowEmpForm(true);
  }

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
    <>
    <div className="max-w-2xl space-y-4 animate-fade-up">

      {/* ── Información del negocio (solo ADMIN) ─────────────────────────── */}
      {user?.role === 'ADMIN' && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2.5">
            <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <Store size={14} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Información del negocio</h2>
          </div>

          {/* Logo uploader */}
          <div className="px-6 pt-5 pb-5 border-b border-slate-50 dark:border-white/[0.04]">
            <p className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-3">Logo del negocio</p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0 bg-slate-50 dark:bg-slate-800">
                {uploadingLogo ? (
                  <Loader2 size={20} className="animate-spin text-emerald-500" />
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
                  className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition disabled:opacity-50"
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
            {BIZ_FIELDS.map((f) => {
              const err = (bizErrors as Record<string, { message?: string } | undefined>)[f.name];
              return (
                <div key={f.name} className={f.col === 2 ? 'col-span-2' : ''}>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">{f.label}</label>
                  <input
                    {...regBusiness(f.name, f.validation)}
                    type={f.type || 'text'}
                    maxLength={f.maxLength}
                    className={`${inputCls} ${err ? 'border-red-400 focus:border-red-400 focus:ring-red-500/20' : ''}`}
                    aria-invalid={err ? 'true' : 'false'}
                    aria-describedby={err ? `${f.name}-error` : undefined}
                  />
                  {err && (
                    <p id={`${f.name}-error`} className="mt-1 text-[11px] text-red-500 dark:text-red-400">
                      {err.message as string}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="col-span-2 flex justify-end border-t border-slate-100 dark:border-white/[0.06] pt-4">
              <button
                type="submit"
                disabled={businessMutation.isPending || savingBusiness}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/25 flex items-center gap-2 transition"
              >
                {(businessMutation.isPending || savingBusiness) && <Loader2 size={14} className="animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Gestión de empleados (solo ADMIN) ───────────────────────────────── */}
      {user?.role === 'ADMIN' && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-violet-50 dark:bg-violet-500/10 rounded-lg flex items-center justify-center">
                <Users size={14} className="text-violet-600 dark:text-violet-400" />
              </div>
              <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Empleados</h2>
            </div>
            <button
              type="button"
              onClick={openNewEmp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[12px] font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition"
            >
              <UserPlus size={13} /> Nuevo empleado
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nombre</th>
                  <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Correo</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Rol</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Estado</th>
                  <th className="w-20 sr-only">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                {loadingUsers ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(5)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-[13px] text-slate-400">
                      No hay empleados registrados
                    </td>
                  </tr>
                ) : employees.map((emp: any) => (
                  <tr key={emp.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-slate-800 dark:text-white">{emp.name}</p>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">{emp.email}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400">
                        <Shield size={11} className="text-slate-300 dark:text-slate-600" />
                        {ROLE_LABEL[emp.role] || emp.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${emp.isActive ? 'badge-green' : 'badge-slate'}`}>
                        {emp.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          aria-label="Editar empleado"
                          onClick={() => openEditEmp(emp)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
                        >
                          <Edit size={13} />
                        </button>
                        {/* No puedes desactivarte ni eliminarte a ti mismo — mismo freno
                            que ya exige el backend (bloquea quedarse sin ningún admin). */}
                        {emp.id !== user?.id && (
                          <>
                            <button
                              type="button"
                              aria-label={emp.isActive ? 'Desactivar' : 'Activar'}
                              disabled={toggleEmpMutation.isPending}
                              onClick={() => toggleEmpMutation.mutate({ id: emp.id, isActive: !emp.isActive })}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 disabled:opacity-40 transition"
                            >
                              <UserX size={13} />
                            </button>
                            <button
                              type="button"
                              aria-label="Eliminar empleado"
                              onClick={() => setDeleteEmpTarget(emp)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Bodegas (solo ADMIN) ──────────────────────────────────────────── */}
      {user?.role === 'ADMIN' && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-sky-50 dark:bg-sky-500/10 rounded-lg flex items-center justify-center">
                <Building2 size={14} className="text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Bodegas</h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {branches.length} de {BRANCH_LIMIT[user?.plan || 'free'] ?? 1} · plan {user?.plan === 'pro' ? 'Pro' : 'Gratis'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openNewBranch}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[12px] font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition"
            >
              <Plus size={13} /> Nueva bodega
            </button>
          </div>

          <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
            {branches.length === 0 ? (
              <p className="text-center py-8 text-[13px] text-slate-400">No hay bodegas registradas</p>
            ) : branches.map((b: any) => (
              <div key={b.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-800 dark:text-white truncate">{b.name}</p>
                  {b.address && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                      <MapPin size={11} className="flex-shrink-0" /> {b.address}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Editar bodega"
                  onClick={() => openEditBranch(b)}
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
                >
                  <Edit size={13} />
                </button>
              </div>
            ))}
          </div>
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
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/25 flex items-center gap-2 transition"
            >
              {(pwdMutation.isPending || savingPwd) && <Loader2 size={14} className="animate-spin" />}
              Actualizar contraseña
            </button>
          </div>
        </form>
      </div>
    </div>

      {/* ── Preferencias de sonido ───────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2.5">
          <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <Volume2 size={14} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Sonidos</h2>
        </div>
        <div className="px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Efectos de sonido</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
              Ka-ching al completar ventas, beep al escanear, pop al agregar productos
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled ? 'true' : 'false'}
            onClick={() => {
              toggleSound();
              if (!soundEnabled) { try { sounds.add(); } catch { /* blocked */ } }
            }}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
              soundEnabled ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 flex items-center justify-center ${
              soundEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}>
              {soundEnabled
                ? <Volume2 size={10} className="text-emerald-500" />
                : <VolumeX size={10} className="text-slate-400" />
              }
            </span>
          </button>
        </div>
      </div>

      {/* ── Employee Form Modal ──────────────────────────────────────────────── */}
      {showEmpForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">
                {editEmp ? 'Editar empleado' : 'Nuevo empleado'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => { setShowEmpForm(false); setEditEmp(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleEmp((d: any) => saveEmpMutation.mutate(d))} className="p-6 space-y-4">
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Nombre completo *</label>
                <input
                  {...regEmp('name', { required: 'El nombre es obligatorio' })}
                  className={inputCls}
                  placeholder="Ej: Juan García"
                />
                {empErrors.name && <p className="text-[11px] text-red-500 mt-1">{empErrors.name.message as string}</p>}
              </div>

              {!editEmp && (
                <>
                  <div>
                    <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Correo *</label>
                    <input
                      {...regEmp('email', { required: 'El correo es obligatorio' })}
                      type="email"
                      autoComplete="off"
                      // El navegador reconoce este campo como un login del mismo sitio y
                      // sugiere las credenciales guardadas del administrador — este es un
                      // formulario para crear a OTRA persona, así que se bloquea el autofill.
                      data-lpignore="true"
                      className={inputCls}
                      placeholder="correo@ejemplo.com"
                    />
                    {empErrors.email && <p className="text-[11px] text-red-500 mt-1">{empErrors.email.message as string}</p>}
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Contraseña *</label>
                    <input
                      {...regEmp('password', { required: 'La contraseña es obligatoria', minLength: { value: 8, message: 'Mínimo 8 caracteres' } })}
                      type="password"
                      autoComplete="new-password"
                      data-lpignore="true"
                      className={inputCls}
                      placeholder="Mínimo 8 caracteres"
                    />
                    {empErrors.password && <p className="text-[11px] text-red-500 mt-1">{empErrors.password.message as string}</p>}
                  </div>
                </>
              )}

              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Rol *</label>
                <select {...regEmp('role', { required: true })} className={inputCls}>
                  <option value="CASHIER">Cajero</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              {branches.length > 1 && (
                <div>
                  <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Bodega</label>
                  <select {...regEmp('branchId')} className={inputCls}>
                    <option value="">Sin bodega asignada</option>
                    {branches.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEmpForm(false); setEditEmp(null); }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveEmpMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/25 flex items-center justify-center gap-2 transition"
                >
                  {saveEmpMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editEmp ? 'Actualizar' : 'Crear empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Branch Form Modal ────────────────────────────────────────────────── */}
      {showBranchForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">
                {editBranch ? 'Editar bodega' : 'Nueva bodega'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => { setShowBranchForm(false); setEditBranch(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleBranchSubmit((d: any) => saveBranchMutation.mutate(d))} className="p-6 space-y-4">
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Nombre *</label>
                <input
                  {...regBranch('name', { required: 'El nombre es obligatorio' })}
                  className={inputCls}
                  placeholder="Ej: Bodega Norte"
                />
                {branchErrors.name && <p className="text-[11px] text-red-500 mt-1">{branchErrors.name.message as string}</p>}
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Dirección</label>
                <input {...regBranch('address')} className={inputCls} placeholder="Opcional" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Teléfono</label>
                <input {...regBranch('phone')} className={inputCls} placeholder="Opcional" />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowBranchForm(false); setEditBranch(null); }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveBranchMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/25 flex items-center justify-center gap-2 transition"
                >
                  {saveBranchMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editBranch ? 'Actualizar' : 'Crear bodega'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Eliminar empleado ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteEmpTarget}
        onOpenChange={(open) => { if (!open) setDeleteEmpTarget(null); }}
        title="Eliminar empleado"
        description={deleteEmpTarget ? `¿Eliminar a "${deleteEmpTarget.name}"? Ya no podrá iniciar sesión, pero sus ventas anteriores se conservan.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={() => deleteEmpTarget && deleteEmpMutation.mutate(deleteEmpTarget.id)}
        loading={deleteEmpMutation.isPending}
        variant="danger"
      />
    </>
  );
}