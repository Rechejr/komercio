'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Users, UserPlus, Edit, ShieldCheck, Trash2, Loader2, X, Shield,
} from 'lucide-react';
import { Portal } from '@/components/ui/Portal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuthStore } from '@/store/auth.store';
import { ModalPermisos, type EmpleadoPermisos } from '@/components/equipo/ModalPermisos';

interface Empleado {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  permisosEfectivos?: string[];
  /** El dueño de la oficina manda siempre: no se le ajustan permisos. */
  isOwner?: boolean;
}

const ROL_LABEL: Record<string, string> = { ADMIN: 'Contador', AUXILIAR: 'Auxiliar' };

/**
 * El equipo de la oficina contable. Hasta ahora el rol AUXILIAR existía en el
 * sistema pero no había dónde crear uno: el contador tenía que pedir que se lo
 * metieran a mano. Aquí crea a su gente, le ajusta permisos y la desactiva.
 */
export function PanelEquipoContable() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Empleado | null>(null);
  const [permisosDe, setPermisosDe] = useState<EmpleadoPermisos | null>(null);
  const [aEliminar, setAEliminar] = useState<Empleado | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data: equipo = [], isLoading } = useQuery({
    queryKey: ['equipo'],
    queryFn: () => api.get('/users?limit=100').then((r) => r.data.data),
  });

  const guardar = useMutation({
    mutationFn: (datos: Record<string, unknown>) =>
      editando
        ? api.patch(`/users/${editando.id}`, { name: datos.name, role: datos.role }).then((r) => r.data)
        : api.post('/users', datos).then((r) => r.data),
    onSuccess: () => {
      toast.success(editando ? 'Usuario actualizado' : 'Usuario creado');
      qc.invalidateQueries({ queryKey: ['equipo'] });
      cerrarForm();
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || 'No se pudo guardar'),
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Usuario eliminado');
      qc.invalidateQueries({ queryKey: ['equipo'] });
      setAEliminar(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || 'No se pudo eliminar'),
  });

  function abrirNuevo() {
    setEditando(null);
    reset({ name: '', email: '', password: '', role: 'AUXILIAR' });
    setShowForm(true);
  }

  function abrirEditar(emp: Empleado) {
    setEditando(emp);
    reset({ name: emp.name, role: emp.role });
    setShowForm(true);
  }

  function cerrarForm() {
    setShowForm(false);
    setEditando(null);
  }

  const inputCls = 'w-full px-3 py-2.5 text-[16px] sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <>
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="p-5 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <Users size={17} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Equipo de la oficina</h2>
              <p className="text-[12px] text-slate-500">Tus auxiliares y qué puede hacer cada uno</p>
            </div>
          </div>
          <button
            type="button"
            onClick={abrirNuevo}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[13px] font-semibold transition flex-shrink-0"
          >
            <UserPlus size={14} /> Agregar
          </button>
        </div>

        <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
          {isLoading ? (
            [...Array(2)].map((_, i) => (
              <div key={i} className="px-5 py-4">
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
              </div>
            ))
          ) : equipo.length === 0 ? (
            <p className="text-center py-10 text-[13px] text-slate-400">
              Todavía no tienes auxiliares. Agrega uno para que te ayude con los vencimientos.
            </p>
          ) : equipo.map((emp: Empleado) => (
            <div key={emp.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-800 dark:text-white truncate">{emp.name}</p>
                <p className="text-[12px] text-slate-500 truncate">{emp.email}</p>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                  <Shield size={10} className="text-slate-300 dark:text-slate-600" />
                  {ROL_LABEL[emp.role] || emp.role}
                  {!emp.isActive && ' · Inactivo'}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!emp.isOwner && (
                  <button
                    type="button"
                    aria-label={`Permisos de ${emp.name}`}
                    title="Permisos"
                    onClick={() => setPermisosDe(emp)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
                  >
                    <ShieldCheck size={14} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Editar ${emp.name}`}
                  onClick={() => abrirEditar(emp)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
                >
                  <Edit size={14} />
                </button>
                {/* Uno no se puede borrar a sí mismo: si no, la oficina quedaría
                    sin nadie que la administre. */}
                {emp.id !== user?.id && (
                  <button
                    type="button"
                    aria-label={`Eliminar ${emp.name}`}
                    onClick={() => setAEliminar(emp)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Alta / edición ─────────────────────────────────────────────────── */}
      {showForm && (
        <Portal>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) cerrarForm(); }}
          >
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90dvh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">
                  {editando ? 'Editar usuario' : 'Nuevo usuario'}
                </h2>
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={cerrarForm}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <X size={14} />
                </button>
              </div>

              <form
                onSubmit={handleSubmit((d) => guardar.mutate(d as Record<string, unknown>))}
                className="flex flex-col min-h-0 flex-1"
              >
                <div className="px-5 overflow-y-auto min-h-0 flex-1 space-y-3">
                  <div>
                    <label htmlFor="eq-name" className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Nombre *</label>
                    <input id="eq-name" {...register('name', { required: 'El nombre es obligatorio' })} className={inputCls} />
                    {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name.message as string}</p>}
                  </div>

                  {!editando && (
                    <>
                      <div>
                        <label htmlFor="eq-email" className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Correo *</label>
                        <input
                          id="eq-email"
                          type="email"
                          autoComplete="off"
                          {...register('email', { required: 'El correo es obligatorio' })}
                          className={inputCls}
                        />
                        {errors.email && <p className="text-[11px] text-red-500 mt-1">{errors.email.message as string}</p>}
                      </div>
                      <div>
                        <label htmlFor="eq-pwd" className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Contraseña *</label>
                        <input
                          id="eq-pwd"
                          type="password"
                          autoComplete="new-password"
                          placeholder="Mínimo 8 caracteres"
                          {...register('password', { required: 'La contraseña es obligatoria', minLength: { value: 8, message: 'Mínimo 8 caracteres' } })}
                          className={inputCls}
                        />
                        {errors.password && <p className="text-[11px] text-red-500 mt-1">{errors.password.message as string}</p>}
                        <p className="text-[11px] text-slate-500 mt-1">Se la pasas a tu auxiliar; él la puede cambiar después.</p>
                      </div>
                    </>
                  )}

                  <div className="pb-1">
                    <label htmlFor="eq-role" className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Rol *</label>
                    <select id="eq-role" {...register('role', { required: true })} className={inputCls}>
                      <option value="AUXILIAR">Auxiliar</option>
                      <option value="ADMIN">Contador (acceso total)</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      El auxiliar ve clientes y vencimientos, pero no borra clientes ni toca la cuenta.
                      Con el botón del escudo le ajustas permisos uno por uno.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
                  <button
                    type="button"
                    onClick={cerrarForm}
                    className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardar.isPending}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-[13px] font-semibold transition flex items-center justify-center gap-2"
                  >
                    {guardar.isPending && <Loader2 size={13} className="animate-spin" />}
                    {editando ? 'Actualizar' : 'Crear usuario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Portal>
      )}

      {permisosDe && <ModalPermisos empleado={permisosDe} onClose={() => setPermisosDe(null)} />}

      <ConfirmDialog
        open={!!aEliminar}
        onOpenChange={(open) => { if (!open) setAEliminar(null); }}
        title="Eliminar usuario"
        description={aEliminar ? `¿Eliminar a "${aEliminar.name}"? Ya no podrá entrar, pero lo que registró se conserva.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={() => aEliminar && eliminar.mutate(aEliminar.id)}
        loading={eliminar.isPending}
        variant="danger"
      />
    </>
  );
}
