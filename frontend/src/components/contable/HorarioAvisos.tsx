'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Clock, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

// A qué horas quiere el contador sus avisos de vencimientos. Por defecto tres,
// y cada una dice algo distinto: la primera da el panorama del día, las de en
// medio recuerdan lo que sigue pendiente, y la última prepara el día siguiente.
// Repetir el mismo texto tres veces es lo que hace que la gente apague las
// notificaciones, así que el contenido cambia según la franja.

const OPCIONES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

const etiqueta = (h: number) => {
  const ampm = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${ampm}`;
};

/** Qué hace cada aviso según su posición: primero panorama, último cierre. */
function rolDe(horas: number[], h: number): string {
  const orden = [...horas].sort((a, b) => a - b);
  if (orden.length <= 1) return 'Resumen del día';
  if (h === orden[0]) return 'Panorama del día';
  if (h === orden[orden.length - 1]) return 'Cierre y lo de mañana';
  return 'Lo que sigue pendiente';
}

export function HorarioAvisos() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<number[] | null>(null);

  const { data } = useQuery<{ horas: number[] }>({
    queryKey: ['contable-avisos'],
    queryFn: () => api.get('/contable/avisos').then((r) => r.data.data),
  });

  const guardar = useMutation({
    mutationFn: (horas: number[]) => api.patch('/contable/avisos', { horas }),
    onSuccess: () => {
      toast.success('Horario actualizado');
      qc.invalidateQueries({ queryKey: ['contable-avisos'] });
      setEditando(null);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || 'No se pudo guardar');
    },
  });

  const horas = editando ?? data?.horas ?? [];
  const hayCambios = editando !== null && JSON.stringify([...editando].sort()) !== JSON.stringify([...(data?.horas ?? [])].sort());

  function alternar(h: number) {
    const actuales = editando ?? data?.horas ?? [];
    const nuevas = actuales.includes(h) ? actuales.filter((x) => x !== h) : [...actuales, h].sort((a, b) => a - b);
    if (nuevas.length === 0) { toast.error('Deja al menos una hora'); return; }
    if (nuevas.length > 4) { toast.error('Máximo 4 avisos al día'); return; }
    setEditando(nuevas);
  }

  if (!data) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2.5">
        <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
          <Clock size={14} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">Horario de los avisos</h2>
      </div>

      <div className="p-6">
      <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
        Elige a qué horas quieres que te avisemos de los vencimientos. Hasta 4 al día, y cada
        uno te dice algo distinto: el primero da el panorama de la jornada, los de en medio
        recuerdan lo que sigue sin presentar, y el último prepara el día siguiente.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {OPCIONES.map((h) => {
          const activa = horas.includes(h);
          return (
            <button
              key={h} type="button" onClick={() => alternar(h)}
              className={`text-[12px] font-medium px-2.5 py-1.5 rounded-lg border transition ${
                activa
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
              }`}
            >
              {etiqueta(h)}
            </button>
          );
        })}
      </div>

      {horas.length > 0 && (
        <ul className="space-y-1 mb-3">
          {[...horas].sort((a, b) => a - b).map((h) => (
            <li key={h} className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span className="tabular font-semibold text-slate-700 dark:text-slate-300">{etiqueta(h)}</span>
              · {rolDe(horas, h)}
            </li>
          ))}
        </ul>
      )}

      {hayCambios && (
        <div className="flex gap-2">
          <button
            onClick={() => guardar.mutate(editando!)} disabled={guardar.isPending}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[13px] font-semibold px-3.5 py-2 rounded-lg transition"
          >
            {guardar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar
          </button>
          <button
            onClick={() => setEditando(null)}
            className="text-[13px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-3 py-2"
          >
            Cancelar
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
