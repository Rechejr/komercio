'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Portal } from '@/components/ui/Portal';
import { formatNit } from '@/lib/contable';
import {
  Plus, Search, Trash2, X, Loader2, Edit, Eye, EyeOff, Copy, ExternalLink, KeyRound,
} from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

// Entidades frecuentes de un contador — se eligen de la lista y rellenan el link.
// En orden alfabético. La opción "Otra" permite escribir una nueva.
const PORTALES = [
  { nombre: 'Alcaldía Municipal', link: 'https://mocoa-putumayo.gov.co/Paginas/Inicio.aspx' },
  { nombre: 'Aportes en Línea',   link: 'https://www.aportesenlinea.com/' },
  { nombre: 'Asopagos',           link: 'https://www.asopagos.com/' },
  { nombre: 'Cámara de Comercio', link: 'https://www.rues.org.co/' },
  { nombre: 'DIAN',               link: 'https://muisca.dian.gov.co/WebArquitectura/DefLogin.faces' },
  { nombre: 'Gmail',              link: 'https://mail.google.com/' },
  { nombre: 'MiPlanilla',         link: 'https://www.miplanilla.com/' },
  { nombre: 'Outlook',            link: 'https://outlook.live.com/' },
  { nombre: 'Positiva',           link: 'https://www.positiva.gov.co/' },
  { nombre: 'Siigo',              link: 'https://www.siigo.com/' },
  { nombre: 'SOI',                link: 'https://www.nuevosoi.com.co/' },
];
const OTRA = '__otra';

interface Credencial {
  id: string; entidad: string; usuario1: string; usuario2: string | null;
  clave: string; link: string | null;
  taxClient: { id: string; razonSocial: string; nit: string; dv: number };
}

async function copiar(texto: string, etiqueta: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${etiqueta} copiado`);
  } catch {
    toast.error('No se pudo copiar');
  }
}

export default function CredencialesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Credencial | null>(null);
  const [delTarget, setDelTarget] = useState<Credencial | null>(null);
  const [revelados, setRevelados] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading } = useQuery<Credencial[]>({
    queryKey: ['contable-credenciales', search],
    queryFn: () => api.get(`/contable/credenciales?search=${encodeURIComponent(search)}`).then((r) => r.data.data),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['contable-credenciales'] });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contable/credenciales/${id}`),
    onSuccess: () => { invalidar(); toast.success('Credencial eliminada'); setDelTarget(null); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo eliminar'),
  });

  const toggleRevelar = (id: string) =>
    setRevelados((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function abrirNueva() { setEditing(null); setModalOpen(true); }
  function abrirEditar(c: Credencial) { setEditing(c); setModalOpen(true); }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Explicación */}
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-900/10 px-4 py-3">
        <KeyRound size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Guarda los accesos a los portales de cada cliente (DIAN, Aportes en Línea…). La contraseña
          se guarda <b>cifrada</b>; aquí la ves y copias en un clic, y abres el portal directo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, identificación, entidad o usuario..." className={cn(inputCls, 'pl-9')} />
        </div>
        <button onClick={abrirNueva} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Agregar credencial
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <div key={i} className="card h-44 animate-pulse bg-slate-50 dark:bg-slate-800/40" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card py-16 text-center text-slate-400 dark:text-slate-500">
          <KeyRound size={32} className="mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-sm">{search ? 'No hay credenciales que coincidan.' : 'Aún no has guardado credenciales. Usa “Agregar credencial”.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((c) => {
            const visible = revelados.has(c.id);
            return (
              <div key={c.id} className="card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{c.taxClient.razonSocial}</p>
                    <p className="text-xs text-slate-400 tabular">{formatNit(c.taxClient.nit, c.taxClient.dv)}</p>
                  </div>
                  <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">{c.entidad}</span>
                </div>

                <div className="space-y-1.5 text-sm">
                  <CampoCopiable etiqueta="Usuario 1" valor={c.usuario1} />
                  {c.usuario2 && <CampoCopiable etiqueta="Usuario 2" valor={c.usuario2} />}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-16 flex-shrink-0">Clave</span>
                    <span className="flex-1 font-mono text-slate-700 dark:text-slate-200 truncate">{visible ? c.clave : '•'.repeat(Math.min(10, c.clave.length || 6))}</span>
                    <button onClick={() => toggleRevelar(c.id)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={visible ? 'Ocultar' : 'Ver'}>
                      {visible ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button onClick={() => copiar(c.clave, 'Clave')} className="p-1 text-slate-400 hover:text-emerald-600" aria-label="Copiar clave"><Copy size={15} /></button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-white/[0.06] mt-1">
                  {c.link ? (
                    <a href={c.link} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg py-2 transition-colors">
                      <ExternalLink size={13} /> Abrir portal
                    </a>
                  ) : <span className="flex-1 text-[12px] text-slate-300 dark:text-slate-600 text-center py-2">Sin link</span>}
                  <button onClick={() => abrirEditar(c)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Editar"><Edit size={15} /></button>
                  <button onClick={() => setDelTarget(c)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Eliminar"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && <CredencialModal editing={editing} onClose={() => setModalOpen(false)} onDone={invalidar} />}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="¿Eliminar esta credencial?"
        description={delTarget ? `${delTarget.entidad} de ${delTarget.taxClient.razonSocial}` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={delMut.isPending}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      />
    </div>
  );
}

function CampoCopiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 w-16 flex-shrink-0">{etiqueta}</span>
      <span className="flex-1 text-slate-700 dark:text-slate-200 truncate">{valor}</span>
      <button onClick={() => copiar(valor, etiqueta)} className="p-1 text-slate-400 hover:text-emerald-600" aria-label={`Copiar ${etiqueta}`}><Copy size={15} /></button>
    </div>
  );
}

// ─── Modal: agregar / editar credencial ───────────────────────────────────────
type ClientePicker = { id: string; razonSocial: string; nit: string; dv: number };

function CredencialModal({ editing, onClose, onDone }: { editing: Credencial | null; onClose: () => void; onDone: () => void }) {
  const esEdicion = !!editing;
  const [clienteSearch, setClienteSearch] = useState('');
  const [cliente, setCliente] = useState<ClientePicker | null>(editing ? editing.taxClient : null);
  const [entidad, setEntidad] = useState(editing?.entidad || '');
  // Valor del desplegable: el nombre de un portal de la lista, o OTRA si es una
  // entidad personalizada (al editar, si no coincide con la lista → "Otra").
  const [entidadSel, setEntidadSel] = useState(
    editing ? (PORTALES.some((p) => p.nombre === editing.entidad) ? editing.entidad : OTRA) : '',
  );
  const [usuario1, setUsuario1] = useState(editing?.usuario1 || '');
  const [usuario2, setUsuario2] = useState(editing?.usuario2 || '');
  const [clave, setClave] = useState(editing?.clave || '');
  const [link, setLink] = useState(editing?.link || '');
  const [verClave, setVerClave] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ['contable-clients-picker', clienteSearch],
    queryFn: () => api.get(`/contable/clients?limit=8&search=${encodeURIComponent(clienteSearch)}`).then((r) => r.data.data),
    enabled: !esEdicion && !cliente,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { taxClientId: cliente!.id, entidad, usuario1, usuario2: usuario2 || null, clave, link: link || null };
      return esEdicion
        ? api.put(`/contable/credenciales/${editing!.id}`, payload)
        : api.post('/contable/credenciales', payload);
    },
    onSuccess: () => { onDone(); toast.success(esEdicion ? 'Credencial actualizada' : 'Credencial guardada'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo guardar'),
  });

  function submit() {
    if (!cliente) return toast.error('Elige un cliente');
    if (!entidad.trim()) return toast.error('Indica la entidad / portal');
    if (!usuario1.trim()) return toast.error('Indica el usuario');
    if (!clave) return toast.error('Indica la contraseña');
    saveMut.mutate();
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{esEdicion ? 'Editar credencial' : 'Nueva credencial'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
          {/* Cliente */}
          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cliente</label>
            {cliente ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800">
                <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{cliente.razonSocial}</span>
                {!esEdicion && <button onClick={() => setCliente(null)} className="text-xs text-emerald-600 hover:underline flex-shrink-0 ml-2">Cambiar</button>}
              </div>
            ) : (
              <>
                <input value={clienteSearch} onChange={(e) => setClienteSearch(e.target.value)} placeholder="Buscar cliente..." className={inputCls} autoFocus />
                {clienteSearch && (
                  <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-white/[0.06] max-h-40 overflow-y-auto">
                    {clientes.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p>
                    ) : clientes.map((c: any) => (
                      <button key={c.id} onClick={() => setCliente(c)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">
                        <span className="font-medium text-slate-900 dark:text-white">{c.razonSocial}</span>
                        <span className="text-xs text-slate-400 ml-2 tabular">{formatNit(c.nit, c.dv)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Entidad: lista desplegable + "Otra" para agregar una nueva */}
          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Entidad *</label>
            <select
              value={entidadSel}
              onChange={(e) => {
                const val = e.target.value;
                setEntidadSel(val);
                if (val === OTRA) {
                  setEntidad('');
                } else {
                  const p = PORTALES.find((x) => x.nombre === val);
                  if (p) { setEntidad(p.nombre); if (p.link) setLink(p.link); }
                }
              }}
              className={inputCls}
            >
              <option value="">Elige una entidad…</option>
              {PORTALES.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
              <option value={OTRA}>Otra (agregar)…</option>
            </select>
          </div>

          {entidadSel === OTRA && (
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nombre de la entidad *</label>
              <input value={entidad} onChange={(e) => setEntidad(e.target.value)} placeholder="Escribe la entidad" className={inputCls} autoFocus />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Usuario 1 *</label>
              <input value={usuario1} onChange={(e) => setUsuario1(e.target.value)} placeholder="Usuario" className={inputCls} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Usuario 2</label>
              <input value={usuario2} onChange={(e) => setUsuario2(e.target.value)} placeholder="Opcional" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Contraseña *</label>
            <div className="relative">
              <input type={verClave ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} placeholder={esEdicion ? 'Escribe para cambiarla' : 'Contraseña del portal'} className={cn(inputCls, 'pr-10')} />
              <button type="button" onClick={() => setVerClave((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={verClave ? 'Ocultar' : 'Ver'}>
                {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Link del portal <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={inputCls} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">Cancelar</button>
          <button onClick={submit} disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
            {esEdicion ? 'Guardar cambios' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
