'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { usePaymentAccounts } from '@/lib/usePaymentAccounts';
import { descargarExcel } from '@/lib/exportExcel';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Portal } from '@/components/ui/Portal';
import { PriceInput } from '@/components/ui/PriceInput';
import {
  HandCoins, Plus, Search, X, Loader2, Users, Truck, Eye, Undo2, Ban, FileText, Link2, FileSpreadsheet,
} from 'lucide-react';

// Anticipos: plata que se mueve ANTES de la factura.
//
// El cliente deja una parte para apartar la mercancía, o el negocio le gira por
// adelantado al proveedor. La pantalla tiene que dejar claras tres cosas de un
// vistazo: cuánto hay pendiente de entregar, a quién, y cuánto saldo le queda a
// cada anticipo.

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

interface Tercero { id: string; name: string; document?: string | null; phone?: string | null }
interface Aplicacion {
  id: string; amount: string; createdAt: string;
  sale?: { id: string; invoiceNumber: string; total: string; createdAt: string } | null;
  purchase?: { id: string; invoiceNumber: string | null; total: string; purchaseDate: string } | null;
}
interface Anticipo {
  id: string; number: string; type: 'CUSTOMER' | 'SUPPLIER';
  amount: string; applied: string; balance: string; status: string;
  paymentMethod: string; notes: string | null; createdAt: string;
  refundedAt: string | null;
  customer?: Tercero | null; supplier?: Tercero | null;
  paymentAccount?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  applications?: Aplicacion[];
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: 'Disponible', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  PARTIAL:   { label: 'Usado en parte', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  APPLIED:   { label: 'Aplicado', cls: 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300' },
  REFUNDED:  { label: 'Devuelto', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  CANCELLED: { label: 'Anulado', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' },
};

export default function AnticiposPage() {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [estado, setEstado] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [detalle, setDetalle] = useState<Anticipo | null>(null);
  const [devolver, setDevolver] = useState<Anticipo | null>(null);
  const [anular, setAnular] = useState<Anticipo | null>(null);
  const [cruzar, setCruzar] = useState<Anticipo | null>(null);

  // Los mismos filtros van a la lista y al Excel: lo que se descarga es
  // exactamente lo que se está mirando.
  const params = new URLSearchParams({ type: tipo });
  if (search.trim()) params.set('search', search.trim());
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (estado) params.set('status', estado);
  const filtros = params.toString();
  params.set('limit', '100');

  const { data, isLoading } = useQuery({
    queryKey: ['advances', tipo, search, startDate, endDate, estado],
    queryFn: () => api.get(`/advances?${params.toString()}`).then((r) => r.data),
    placeholderData: (prev) => prev, // la tabla no parpadea mientras se escribe
  });
  const anticipos: Anticipo[] = data?.data || [];
  const saldos = data?.saldosPendientes || { CUSTOMER: 0, SUPPLIER: 0 };

  const devolucion = useMutation({
    mutationFn: (id: string) => api.post(`/advances/${id}/refund`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['advances'] });
      toast.success('Anticipo devuelto');
      setDevolver(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo devolver'),
  });

  const anulacion = useMutation({
    mutationFn: (id: string) => api.post(`/advances/${id}/cancel`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['advances'] });
      toast.success('Anticipo anulado');
      setAnular(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo anular'),
  });

  const esCliente = tipo === 'CUSTOMER';

  return (
    <div className="space-y-4 animate-fade-up">

      {/* Lo pendiente, que es la pregunta que uno le hace a esta pantalla:
          ¿cuánta mercancía tengo comprometida y cuánta me deben despachar? */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <Users size={17} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-[11.5px] text-slate-400 dark:text-slate-500">Anticipos de clientes por entregar</p>
            <p className="text-[18px] font-bold text-slate-800 dark:text-white tabular-nums">
              {formatCurrency(Number(saldos.CUSTOMER || 0))}
            </p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center flex-shrink-0">
            <Truck size={17} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-[11.5px] text-slate-400 dark:text-slate-500">Girado a proveedores sin recibir</p>
            <p className="text-[18px] font-bold text-slate-800 dark:text-white tabular-nums">
              {formatCurrency(Number(saldos.SUPPLIER || 0))}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex border-b border-slate-200 dark:border-white/[0.08]">
          {([['CUSTOMER', 'De clientes', Users], ['SUPPLIER', 'A proveedores', Truck]] as const).map(([valor, label, Icono]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setTipo(valor)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition ${
                tipo === valor
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <Icono size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* Nunca deshabilitado: un botón gris sin explicación se lee como
              "está dañado". Si no hay nada que bajar, lo dice al pulsarlo. */}
          <button
            type="button"
            onClick={() => {
              if (anticipos.length === 0) {
                toast('No hay anticipos para descargar con estos filtros');
                return;
              }
              descargarExcel(
                `/advances/export?${filtros}`,
                `anticipos-${esCliente ? 'clientes' : 'proveedores'}${startDate ? `-${startDate}` : ''}${endDate ? `-${endDate}` : ''}`,
              );
            }}
            title="Descarga lo que se está viendo, con los mismos filtros"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition"
          >
            <FileSpreadsheet size={15} /> Descargar Excel
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            <Plus size={16} /> {esCliente ? 'Recibir anticipo' : 'Girar anticipo'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={esCliente ? 'Buscar por nombre, cédula o número (ANT-0001)…' : 'Buscar por nombre, NIT o número (ANTP-0001)…'}
            className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition"
          />
        </div>
        <div className="flex items-center gap-2">
          <input type="date" aria-label="Desde" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition" />
          <span className="text-slate-400 text-sm">→</span>
          <input type="date" aria-label="Hasta" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition" />
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            aria-label="Estado"
            className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition"
          >
            <option value="">Todos los estados</option>
            <option value="PENDING">Disponibles</option>
            <option value="PARTIAL">Usados en parte</option>
            <option value="APPLIED">Aplicados</option>
            <option value="REFUNDED">Devueltos</option>
            <option value="CANCELLED">Anulados</option>
          </select>
          {(search || startDate || endDate || estado) && (
            <button type="button" aria-label="Limpiar filtros"
              onClick={() => { setSearch(''); setStartDate(''); setEndDate(''); setEstado(''); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Número</th>
                <th className="px-4 py-3 font-semibold">{esCliente ? 'Cliente' : 'Proveedor'}</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold text-right">Monto</th>
                <th className="px-4 py-3 font-semibold text-right">Saldo</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  <Loader2 size={18} className="animate-spin inline" />
                </td></tr>
              )}
              {!isLoading && anticipos.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-[13px]">
                  {esCliente
                    ? 'Aún no hay anticipos de clientes. Se usan cuando alguien abona para apartar mercancía.'
                    : 'Aún no hay anticipos a proveedores. Se usan cuando toca pagar por adelantado para que despachen.'}
                </td></tr>
              )}
              {anticipos.map((a) => {
                const tercero = a.customer || a.supplier;
                const estado = ESTADO[a.status] || ESTADO.PENDING;
                const tieneSaldo = Number(a.balance) > 0 && (a.status === 'PENDING' || a.status === 'PARTIAL');
                return (
                  <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-[12.5px] text-slate-500 dark:text-slate-400">{a.number}</td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-slate-800 dark:text-white">{tercero?.name || '—'}</p>
                      {tercero?.document && (
                        <p className="text-[11.5px] text-slate-400 dark:text-slate-500">{tercero.document}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-slate-500 dark:text-slate-400">{formatDate(a.createdAt)}</td>
                    <td className="px-4 py-3 text-right text-[13px] text-slate-600 dark:text-slate-300 tabular-nums">
                      {formatCurrency(Number(a.amount))}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-bold tabular-nums text-slate-800 dark:text-white">
                      {formatCurrency(Number(a.balance))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-medium ${estado.cls}`}>{estado.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setDetalle(a)} aria-label="Ver detalle"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition">
                          <Eye size={15} />
                        </button>
                        {tieneSaldo && (
                          <>
                            <button onClick={() => setCruzar(a)} aria-label="Cruzar con una factura"
                              className="px-2.5 h-8 flex items-center gap-1.5 rounded-lg text-[12px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition">
                              <Link2 size={13} /> Cruzar
                            </button>
                            <button onClick={() => setDevolver(a)} aria-label="Devolver"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition">
                              <Undo2 size={15} />
                            </button>
                            {Number(a.applied) === 0 && (
                              <button onClick={() => setAnular(a)} aria-label="Anular"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition">
                                <Ban size={15} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11.5px] text-slate-400 dark:text-slate-500 px-1">
        Un anticipo no es una venta: entra a la caja pero no suma a los ingresos. La venta se registra
        completa el día de la entrega y ahí el anticipo descuenta lo que el cliente paga ese día.
      </p>

      {showNew && <ModalNuevo tipo={tipo} onClose={() => setShowNew(false)} />}
      {detalle && <ModalDetalle id={detalle.id} onClose={() => setDetalle(null)} />}
      {cruzar && <ModalCruzar anticipo={cruzar} onClose={() => setCruzar(null)} />}

      <ConfirmDialog
        open={!!devolver}
        onOpenChange={(abierto) => { if (!abierto) setDevolver(null); }}
        title="Devolver el anticipo"
        description={devolver
          ? `Se le devuelven ${formatCurrency(Number(devolver.balance))} a ${devolver.customer?.name || devolver.supplier?.name || 'el tercero'}${devolver.paymentMethod === 'CASH' ? ' y la plata sale de la caja' : ''}. Lo que ya se cruzó con facturas no se devuelve.`
          : ''}
        confirmLabel="Devolver"
        variant="warning"
        onConfirm={() => devolver && devolucion.mutate(devolver.id)}
        loading={devolucion.isPending}
      />

      <ConfirmDialog
        open={!!anular}
        onOpenChange={(abierto) => { if (!abierto) setAnular(null); }}
        title="Anular el anticipo"
        description="Úselo solo si el anticipo se registró por error: revierte el movimiento de caja como si nunca hubiera existido. Si el cliente sí dejó la plata y desiste, use Devolver."
        confirmLabel="Anular"
        variant="danger"
        onConfirm={() => anular && anulacion.mutate(anular.id)}
        loading={anulacion.isPending}
      />
    </div>
  );
}

// ── Registrar un anticipo ────────────────────────────────────────────────────
function ModalNuevo({ tipo, onClose }: { tipo: 'CUSTOMER' | 'SUPPLIER'; onClose: () => void }) {
  const qc = useQueryClient();
  const esCliente = tipo === 'CUSTOMER';
  const { active: medios } = usePaymentAccounts();
  const [busqueda, setBusqueda] = useState('');
  const [tercero, setTercero] = useState<Tercero | null>(null);
  const [monto, setMonto] = useState<number | undefined>();
  const [medio, setMedio] = useState('');
  const [notas, setNotas] = useState('');

  const ruta = esCliente ? 'customers' : 'suppliers';
  const { data: encontrados = [] } = useQuery<Tercero[]>({
    queryKey: [ruta, 'busqueda-anticipo', busqueda],
    queryFn: () => api.get(`/${ruta}?limit=8&search=${encodeURIComponent(busqueda)}`).then((r) => r.data.data),
    enabled: busqueda.trim().length > 1 && !tercero,
  });

  const crear = useMutation({
    mutationFn: () => api.post('/advances', {
      type: tipo,
      ...(esCliente ? { customerId: tercero?.id } : { supplierId: tercero?.id }),
      amount: monto,
      paymentAccountId: medio || medios[0]?.id,
      notes: notas.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['advances'] });
      toast.success(esCliente ? 'Anticipo recibido' : 'Anticipo girado');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo registrar'),
  });

  const listo = !!tercero && !!monto && monto > 0;

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md max-h-[90dvh] overflow-hidden flex flex-col shadow-2xl">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between flex-shrink-0">
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <HandCoins size={17} className="text-emerald-600" />
              {esCliente ? 'Recibir anticipo' : 'Girar anticipo a proveedor'}
            </h3>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 transition">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3.5 overflow-y-auto min-h-0 flex-1">
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {esCliente ? 'Cliente' : 'Proveedor'} *
              </label>
              {tercero ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl">
                  <div>
                    <p className="text-[13px] font-medium text-slate-800 dark:text-white">{tercero.name}</p>
                    {tercero.document && <p className="text-[11.5px] text-slate-500">{tercero.document}</p>}
                  </div>
                  <button type="button" onClick={() => { setTercero(null); setBusqueda(''); }}
                    className="text-slate-400 hover:text-slate-600" aria-label="Cambiar">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    autoFocus
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder={esCliente ? 'Nombre o cédula del cliente…' : 'Nombre o NIT del proveedor…'}
                    className={inputCls}
                  />
                  {encontrados.length > 0 && (
                    <div className="mt-1.5 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                      {encontrados.map((t) => (
                        <button key={t.id} type="button" onClick={() => setTercero(t)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition border-b last:border-0 border-slate-100 dark:border-white/[0.06]">
                          <p className="text-[13px] text-slate-800 dark:text-white">{t.name}</p>
                          {t.document && <p className="text-[11.5px] text-slate-400">{t.document}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Monto *</label>
              <PriceInput value={monto} onChange={setMonto} placeholder="0" className={inputCls} />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {esCliente ? 'Cómo pagó' : 'Con qué se giró'}
              </label>
              <select value={medio} onChange={(e) => setMedio(e.target.value)} className={inputCls}>
                {medios.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Solo el efectivo mueve la caja; lo demás queda registrado igual.
              </p>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Nota (opcional)</label>
              <input value={notas} onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej: abono sala en L, entrega en 8 días" className={inputCls} />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-slate-100 dark:border-white/[0.06] flex gap-2 flex-shrink-0">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              Cancelar
            </button>
            <button
              onClick={() => crear.mutate()}
              disabled={!listo || crear.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition flex items-center justify-center gap-2"
            >
              {crear.isPending ? <Loader2 size={15} className="animate-spin" /> : <HandCoins size={15} />}
              {esCliente ? 'Recibir' : 'Girar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ── Detalle: en qué se fue el anticipo ───────────────────────────────────────
function ModalDetalle({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: a, isLoading } = useQuery<Anticipo>({
    queryKey: ['advance', id],
    queryFn: () => api.get(`/advances/${id}`).then((r) => r.data.data),
  });

  const tercero = a?.customer || a?.supplier;

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-hidden flex flex-col shadow-2xl">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between flex-shrink-0">
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-white">
              Anticipo {a?.number ?? ''}
            </h3>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 transition">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4 overflow-y-auto min-h-0 flex-1">
            {isLoading && <div className="py-8 text-center text-slate-400"><Loader2 size={18} className="animate-spin inline" /></div>}
            {a && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Monto', valor: Number(a.amount) },
                    { label: 'Cruzado', valor: Number(a.applied) },
                    { label: 'Saldo', valor: Number(a.balance) },
                  ].map((x) => (
                    <div key={x.label} className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3">
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">{x.label}</p>
                      <p className="text-[14px] font-bold text-slate-800 dark:text-white tabular-nums">{formatCurrency(x.valor)}</p>
                    </div>
                  ))}
                </div>

                <dl className="text-[13px] space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{a.type === 'CUSTOMER' ? 'Cliente' : 'Proveedor'}</dt>
                    <dd className="text-slate-800 dark:text-white font-medium text-right">{tercero?.name || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Recibido el</dt>
                    <dd className="text-slate-800 dark:text-white text-right">{formatDate(a.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Medio</dt>
                    <dd className="text-slate-800 dark:text-white text-right">{a.paymentAccount?.name || a.paymentMethod}</dd>
                  </div>
                  {a.createdBy?.name && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">Registrado por</dt>
                      <dd className="text-slate-800 dark:text-white text-right">{a.createdBy.name}</dd>
                    </div>
                  )}
                  {a.notes && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">Nota</dt>
                      <dd className="text-slate-800 dark:text-white text-right">{a.notes}</dd>
                    </div>
                  )}
                </dl>

                <div>
                  <p className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    Facturas contra las que se cruzó
                  </p>
                  {(a.applications || []).length === 0 ? (
                    <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
                      Todavía no se ha usado. El saldo se descuenta solo al facturar.
                    </p>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-white/[0.06]">
                      {(a.applications || []).map((ap) => {
                        const doc = ap.sale || ap.purchase;
                        const numero = ap.sale?.invoiceNumber || ap.purchase?.invoiceNumber || 'Sin número';
                        return (
                          <div key={ap.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText size={14} className="text-slate-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[13px] text-slate-800 dark:text-white truncate">{numero}</p>
                                <p className="text-[11.5px] text-slate-400">
                                  {formatDate(ap.createdAt)}
                                  {doc && ` · factura de ${formatCurrency(Number(doc.total))}`}
                                </p>
                              </div>
                            </div>
                            <span className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums flex-shrink-0">
                              {formatCurrency(Number(ap.amount))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ── Cruzar el anticipo con una factura ya registrada ─────────────────────────
//
// El caso del proveedor: se le giró por adelantado, llegó la mercancía y la
// compra ya quedó registrada. Aquí se descuenta el anticipo de esa factura. En
// ventas el camino normal es aplicarlo desde el punto de venta al facturar, pero
// esto sirve para las que ya se registraron sin acordarse del anticipo.
function ModalCruzar({ anticipo, onClose }: { anticipo: Anticipo; onClose: () => void }) {
  const qc = useQueryClient();
  const esCliente = anticipo.type === 'CUSTOMER';

  const { data, isLoading } = useQuery<{ facturas: Array<{ id: string; numero: string; total: number; fecha: string; porCubrir: number }>; saldo: number }>({
    queryKey: ['advance-invoices', anticipo.id],
    queryFn: () => api.get(`/advances/${anticipo.id}/invoices`).then((r) => r.data.data),
  });

  const cruzar = useMutation({
    mutationFn: (facturaId: string) => api.post(`/advances/${anticipo.id}/apply`, {
      ...(esCliente ? { saleId: facturaId } : { purchaseId: facturaId }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['advances'] });
      toast.success('Anticipo cruzado con la factura');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo cruzar'),
  });

  const facturas = data?.facturas || [];

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-hidden flex flex-col shadow-2xl">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-white">Cruzar {anticipo.number}</h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                Saldo disponible: <span className="font-semibold">{formatCurrency(Number(anticipo.balance))}</span>
              </p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 transition">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-4 overflow-y-auto min-h-0 flex-1">
            {isLoading && <div className="py-8 text-center text-slate-400"><Loader2 size={18} className="animate-spin inline" /></div>}
            {!isLoading && facturas.length === 0 && (
              <p className="py-6 text-center text-[13px] text-slate-400 dark:text-slate-500">
                {esCliente
                  ? 'Este cliente no tiene facturas pendientes de cubrir. Al facturar en el punto de venta, el anticipo se aplica solo.'
                  : 'Este proveedor no tiene compras pendientes de cubrir. Registre la compra y vuelva aquí para cruzarla.'}
              </p>
            )}
            <div className="space-y-2">
              {facturas.map((f) => {
                const seCruza = Math.min(f.porCubrir, Number(anticipo.balance));
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => cruzar.mutate(f.id)}
                    disabled={cruzar.isPending}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500/50 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/[0.06] disabled:opacity-50 transition text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-slate-800 dark:text-white">{f.numero}</p>
                      <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
                        {formatDate(f.fecha)} · factura de {formatCurrency(f.total)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        − {formatCurrency(seCruza)}
                      </p>
                      <p className="text-[11px] text-slate-400">por cubrir {formatCurrency(f.porCubrir)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
