'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Portal } from '@/components/ui/Portal';
import toast from 'react-hot-toast';
import { Loader2, ShieldCheck, X, RotateCcw } from 'lucide-react';

interface PermisoCatalogo {
  key: string;
  label: string;
  hint?: string;
  modulo: string;
}

interface RolCatalogo {
  value: string;
  label: string;
  hint: string;
  permisos: string[];
}

export interface EmpleadoPermisos {
  id: string;
  name: string;
  role: string;
  /** Permisos que realmente tiene hoy (rol + marcas). */
  permisosEfectivos?: string[];
}

interface Props {
  empleado: EmpleadoPermisos;
  onClose: () => void;
}

/**
 * Casillas de "qué puede hacer esta persona". Parte de lo que trae su rol y el
 * dueño ajusta lo que quiera; se guarda solo la diferencia contra el rol.
 */
export function ModalPermisos({ empleado, onClose }: Props) {
  const qc = useQueryClient();
  const [marcados, setMarcados] = useState<Set<string>>(new Set(empleado.permisosEfectivos ?? []));

  const { data: catalogo, isLoading } = useQuery({
    queryKey: ['permisos-catalogo'],
    queryFn: () => api.get('/users/permissions/catalog').then((r) => r.data.data),
    staleTime: 10 * 60 * 1000,
  });

  const permisos: PermisoCatalogo[] = useMemo(() => catalogo?.permisos ?? [], [catalogo]);
  const rol: RolCatalogo | undefined = useMemo(
    () => (catalogo?.roles ?? []).find((r: RolCatalogo) => r.value === empleado.role),
    [catalogo, empleado.role],
  );

  // Si el empleado no traía permisos calculados (lista vieja en caché), se parte
  // de lo que da su rol en cuanto llega el catálogo.
  useEffect(() => {
    if (!empleado.permisosEfectivos && rol) setMarcados(new Set(rol.permisos));
  }, [rol, empleado.permisosEfectivos]);

  const modulos = useMemo(() => {
    const grupos = new Map<string, PermisoCatalogo[]>();
    for (const p of permisos) {
      const lista = grupos.get(p.modulo) ?? [];
      lista.push(p);
      grupos.set(p.modulo, lista);
    }
    return Array.from(grupos.entries());
  }, [permisos]);

  const guardar = useMutation({
    mutationFn: () => {
      const permissions: Record<string, boolean> = {};
      for (const p of permisos) permissions[p.key] = marcados.has(p.key);
      return api.patch(`/users/${empleado.id}/permissions`, { permissions }).then((r) => r.data);
    },
    onSuccess: (r: { message?: string }) => {
      toast.success(r?.message || 'Permisos actualizados');
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['equipo'] });
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || 'No se pudieron guardar los permisos'),
  });

  function alternar(key: string) {
    setMarcados((prev) => {
      const copia = new Set(prev);
      if (copia.has(key)) copia.delete(key);
      else copia.add(key);
      return copia;
    });
  }

  // Cuántas casillas difieren del rol: es lo que hace especial a esta persona.
  const diferencias = rol
    ? permisos.filter((p: PermisoCatalogo) => rol.permisos.includes(p.key) !== marcados.has(p.key)).length
    : 0;

  return (
    <Portal>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90dvh] overflow-hidden flex flex-col">
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0">
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-500" /> Permisos
              </h2>
              <p className="text-[12px] text-slate-500 mt-0.5 truncate">
                {empleado.name} · {rol?.label ?? empleado.role}
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          {/* Casillas */}
          <div className="px-5 overflow-y-auto min-h-0 flex-1">
            {isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                {rol?.hint && (
                  <p className="text-[12px] text-slate-500 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 mb-4 leading-relaxed">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{rol.label}:</span> {rol.hint}
                    {' '}Marca o desmarca lo que quieras cambiarle solo a esta persona.
                  </p>
                )}

                <div className="space-y-4 pb-2">
                  {modulos.map(([modulo, lista]) => (
                    <div key={modulo}>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{modulo}</p>
                      <div className="space-y-1">
                        {lista.map((p) => {
                          const activo = marcados.has(p.key);
                          const distinto = rol ? rol.permisos.includes(p.key) !== activo : false;
                          return (
                            <label
                              key={p.key}
                              className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                                distinto ? 'bg-amber-50 dark:bg-amber-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={activo}
                                onChange={() => alternar(p.key)}
                                className="mt-0.5 w-4 h-4 accent-emerald-500 flex-shrink-0"
                              />
                              <span className="min-w-0">
                                <span className="block text-[13px] text-slate-800 dark:text-slate-200 leading-tight">{p.label}</span>
                                {p.hint && <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{p.hint}</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Pie */}
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
            {rol && (
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-[11px] text-slate-500">
                  {diferencias === 0
                    ? `Igual que un ${rol.label.toLowerCase()}`
                    : `${diferencias} cambio${diferencias === 1 ? '' : 's'} frente a su rol`}
                </p>
                {diferencias > 0 && (
                  <button
                    type="button"
                    onClick={() => setMarcados(new Set(rol.permisos))}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw size={11} /> Volver a lo del rol
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => guardar.mutate()}
                disabled={guardar.isPending || isLoading}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-[13px] font-semibold transition flex items-center justify-center gap-2"
              >
                {guardar.isPending && <Loader2 size={13} className="animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
