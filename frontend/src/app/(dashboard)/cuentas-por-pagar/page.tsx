'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { PriceInput } from '@/components/ui/PriceInput';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, statusColor, statusLabel, cn } from '@/lib/utils';
import { usePaymentAccounts, labelPago } from '@/lib/usePaymentAccounts';
import toast from 'react-hot-toast';
import { HandCoins, X, Loader2, DollarSign, ChevronRight, Search, Download, FileDown, FileUp, Lock, ListChecks, Truck } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { downloadCsv } from '@/lib/exportCsv';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';
const filterCls = 'px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

// Vencida solo si todavía se debe: una factura pagada tarde ya no es un
// problema, y pintarla de rojo para siempre sería ruido.
function vencida(c: { dueDate?: string | null; balance?: number | string; status?: string }): boolean {
  if (!c.dueDate || Number(c.balance) <= 0 || c.status === 'PAID' || c.status === 'CANCELLED') return false;
  // Se compara por día calendario, no por hora: una factura que vence hoy no
  // está vencida a las 8 de la mañana.
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return new Date(c.dueDate) < hoy;
}

export default function CuentasPorPagarPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  // Dos formas de ver la misma deuda: factura por factura, o cuánto se le debe a
  // cada proveedor en total. Los filtros son los mismos para las dos a propósito:
  // lo acumulado es la suma de lo detallado, nunca dos cifras distintas.
  const [vista, setVista] = useState<'detalle' | 'acumulado'>('detalle');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const { active: paymentAccounts, all: allAccounts } = usePaymentAccounts();
  const { register, handleSubmit, reset, control, formState: { errors: payErrors } } = useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-credits', statusFilter, startDate, endDate, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return api.get(`/supplier-credits?${params}`).then((r) => r.data);
    },
  });

  // Saldos acumulados: una fila por proveedor. Solo se pide al abrir esa vista.
  const { data: saldos, isLoading: cargandoSaldos } = useQuery({
    queryKey: ['supplier-credits-saldos', statusFilter, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return api.get(`/supplier-credits/saldos?${params}`).then((r) => r.data.data);
    },
    enabled: vista === 'acumulado',
  });

  // Descarga TODAS las cuentas por pagar que cumplen los filtros (estado, rango
  // y el texto de búsqueda) como CSV para Excel — no solo la página visible.
  async function handleDownload() {
    if (startDate && endDate && startDate > endDate) {
      toast.error('La fecha "desde" no puede ser mayor que la de "hasta"');
      return;
    }
    setDownloading(true);
    const tId = toast.loading('Generando archivo...');
    try {
      // Se descarga lo que se está viendo: en acumulado, una fila por proveedor.
      if (vista === 'acumulado') {
        const paramsAcum = new URLSearchParams();
        if (statusFilter) paramsAcum.set('status', statusFilter);
        if (startDate) paramsAcum.set('startDate', startDate);
        if (endDate) paramsAcum.set('endDate', endDate);
        const acum = await api.get(`/supplier-credits/saldos?${paramsAcum}`).then((r) => r.data.data);
        const filas = filtrarAcumulado(acum?.proveedores || []);
        if (filas.length === 0) { toast.error('No hay saldos en ese rango', { id: tId }); return; }
        const suf = startDate || endDate ? `-${startDate || 'inicio'}-${endDate || 'hoy'}` : `-${new Date().toISOString().slice(0, 10)}`;
        downloadCsv(
          `saldos-por-proveedor${suf}`,
          ['Proveedor', 'Identificación', 'Teléfono', 'Facturas', 'Total', 'Abonado', 'Saldo', 'Próximo vencimiento'],
          filas.map((f: any) => [
            f.supplier?.name || '',
            f.supplier?.document || '',
            f.supplier?.mobile || f.supplier?.phone || '',
            f.facturas,
            Math.round(Number(f.totalAmount) || 0),
            Math.round(Number(f.paidAmount) || 0),
            Math.round(Number(f.balance) || 0),
            f.proximoVencimiento ? formatDate(f.proximoVencimiento) : '',
          ]),
        );
        toast.success(`${filas.length} proveedores descargados`, { id: tId });
        return;
      }

      const params = new URLSearchParams({ page: '1', limit: '5000' });
      if (statusFilter) params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const all = await api.get(`/supplier-credits?${params}`).then((r) => r.data.data || []);
      const list = all.filter((c: any) =>
        !search || c.supplier?.name?.toLowerCase().includes(search.toLowerCase()) || c.purchase?.invoiceNumber?.toLowerCase().includes(search.toLowerCase()),
      );
      if (list.length === 0) { toast.error('No hay cuentas en ese rango', { id: tId }); return; }
      const suffix = startDate || endDate ? `-${startDate || 'inicio'}-${endDate || 'hoy'}` : `-${new Date().toISOString().slice(0, 10)}`;
      downloadCsv(
        `cuentas-por-pagar${suffix}`,
        ['Proveedor', 'Identificación', 'Factura', 'Total', 'Abonado', 'Saldo', 'Estado', 'Vencimiento', 'Fecha'],
        list.map((c: any) => [
          c.supplier?.name || '',
          c.supplier?.document || '',
          // En las importadas no hay compra: el número viene del archivo. Antes
          // solo se leía el de la compra y esas salían con la columna vacía.
          c.purchase?.invoiceNumber || c.invoiceNumber || '',
          Math.round(Number(c.totalAmount) || 0),
          Math.round(Number(c.paidAmount) || 0),
          Math.round(Number(c.balance) || 0),
          statusLabel(c.status),
          c.dueDate ? formatDate(c.dueDate) : '',
          c.createdAt ? formatDate(c.createdAt) : '',
        ]),
      );
      toast.success(`${list.length} cuentas descargadas`, { id: tId });
    } catch {
      toast.error('No se pudo generar el archivo', { id: tId });
    } finally {
      setDownloading(false);
    }
  }

  const { data: detail } = useQuery({
    queryKey: ['supplier-credit', selected?.id],
    queryFn: () => api.get(`/supplier-credits/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected?.id && showDetail,
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => api.post(`/supplier-credits/${id}/payments`, d),
    onSuccess: (_res: any, { id }: any) => {
      qc.invalidateQueries({ queryKey: ['supplier-credits'] });
      qc.invalidateQueries({ queryKey: ['supplier-credit', id] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Pago registrado');
      setShowPayment(false);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al registrar el pago'),
  });

  // Buscar por NIT es lo más seguro cuando hay proveedores de nombre parecido.
  // Se comparan solo los dígitos/letras, así da igual si lo escriben con puntos,
  // guiones o el dígito de verificación pegado.
  const soloAlfanum = (v: string) => (v || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
  const buscado = search.trim().toLowerCase();
  const buscadoId = soloAlfanum(search);
  const rows = (data?.data || []).filter((c: any) => {
    if (!buscado) return true;
    return c.supplier?.name?.toLowerCase().includes(buscado)
      || c.purchase?.invoiceNumber?.toLowerCase().includes(buscado)
      || c.invoiceNumber?.toLowerCase().includes(buscado)
      || (!!buscadoId && soloAlfanum(c.supplier?.document || '').includes(buscadoId));
  });
  const pagination = data?.pagination;

  // El mismo buscador sirve para las dos vistas: por nombre, por NIT y también
  // por número de factura — el backend manda los números de cada proveedor
  // justo para que buscar una factura aquí encuentre a quien se le debe.
  function filtrarAcumulado(lista: any[]) {
    if (!buscado) return lista;
    return lista.filter((f: any) =>
      f.supplier?.name?.toLowerCase().includes(buscado)
      || (!!buscadoId && soloAlfanum(f.supplier?.document || '').includes(buscadoId))
      || (f.numeros || []).some((n: string) => n?.toLowerCase().includes(buscado)),
    );
  }
  const filasAcumuladas = filtrarAcumulado(saldos?.proveedores || []);

  // ── Importar desde Excel ───────────────────────────────────────────────────
  // Sirve para cargar de una lo que el negocio ya debe a sus proveedores, en vez
  // de teclear factura por factura al empezar a usar Ventrix.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const plan = useAuthStore((st) => st.user?.plan);
  const isFree = plan !== 'pro';
  const openUpgrade = useUpgradeStore((st) => st.open);

  const subirArchivo = (file: File, dryRun: boolean) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/supplier-credits/import${dryRun ? '?dryRun=true' : ''}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.data);
  };

  const previewMut = useMutation({
    mutationFn: (file: File) => subirArchivo(file, true),
    onSuccess: (d) => setPreviewData(d),
    onError: (err: any) => {
      setPendingFile(null);
      toast.error(err.response?.data?.error || 'No se pudo leer el archivo');
    },
  });

  const importMut = useMutation({
    mutationFn: (file: File) => subirArchivo(file, false),
    onSuccess: (r: any) => {
      setPreviewData(null);
      setPendingFile(null);
      qc.invalidateQueries({ queryKey: ['supplier-credits'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(`${r.imported} cuenta(s) importada(s)${r.proveedoresCreados ? ` y ${r.proveedoresCreados} proveedor(es) nuevo(s)` : ''}`);
      if (r.errors?.length) toast.error(`${r.errors.length} fila(s) con error`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al importar'),
  });

  function handleFile(file: File) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) { toast.error('Solo archivos .xlsx, .xls o .csv'); return; }
    setPendingFile(file);
    previewMut.mutate(file);
  }

  const openDetail = (c: any) => { setSelected(c); setShowDetail(true); setShowPayment(false); };
  const openPayment = (c: any) => { setSelected(c); setShowPayment(true); setShowDetail(false); reset(); };

  return (
    <>
    <div className="space-y-4 animate-fade-up">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3">
        <select aria-label="Filtrar por estado" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={filterCls}>
          <option value="">Todas</option>
          <option value="PENDING">Pendientes</option>
          <option value="PARTIAL">Con abonos</option>
          <option value="OVERDUE">Vencidas</option>
          <option value="PAID">Pagadas</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por proveedor, NIT o factura…" className={`${inputCls} pl-9`} />
        </div>

        {/* Detallado o acumulado. Al pagar la pregunta no es "¿qué dice la
            factura 3?" sino "¿cuánto le debo a este proveedor?". */}
        <div role="radiogroup" aria-label="Cómo ver las cuentas por pagar"
          className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/60 flex-shrink-0">
          {([
            ['detalle', 'Detallado', ListChecks, 'Una fila por factura'],
            ['acumulado', 'Saldos acumulados', Truck, 'Una fila por proveedor: cuánto se le debe en total'],
          ] as const).map(([valor, etiqueta, Icono, ayuda]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={vista === valor ? 'true' : 'false'}
              title={ayuda}
              onClick={() => { setVista(valor); setPage(1); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150 whitespace-nowrap',
                vista === valor
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              )}
            >
              <Icono size={14} />
              <span className="hidden lg:inline">{etiqueta}</span>
            </button>
          ))}
        </div>

        {/* Rango de fechas */}
        <div className="flex items-center gap-2">
          <input type="date" aria-label="Desde" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className={filterCls} />
          <span className="text-slate-400 text-sm">→</span>
          <input type="date" aria-label="Hasta" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className={filterCls} />
          {(startDate || endDate) && (
            <button type="button" aria-label="Limpiar rango de fechas" onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-[13px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition"
        >
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Descargar
        </button>

        {/* Plantilla e importación. La plantilla es un archivo en blanco (no
            lleva datos), pero se muestra bloqueada en el plan gratuito para no
            ofrecer algo que después no se va a poder importar. */}
        {isFree ? (
          <button type="button" onClick={openUpgrade}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-semibold text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            <FileDown size={15} /> Plantilla
            <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full leading-none">PRO</span>
          </button>
        ) : (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/supplier-credits/import-template`}
            target="_blank" rel="noopener noreferrer"
            title="Archivo de ejemplo con las columnas que espera el sistema"
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-[13px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <FileDown size={15} /> Plantilla
          </a>
        )}

        {isFree ? (
          <button type="button" onClick={openUpgrade}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-semibold text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            <Lock size={14} /> Importar Excel
            <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full leading-none">PRO</span>
          </button>
        ) : (
          <button type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={previewMut.isPending || importMut.isPending}
            className="flex items-center gap-2 px-4 py-2 border border-emerald-200 dark:border-emerald-700/50 rounded-xl text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 transition">
            {(previewMut.isPending || importMut.isPending)
              ? <Loader2 size={15} className="animate-spin" />
              : <FileUp size={15} />}
            Importar Excel
          </button>
        )}

        <input ref={fileInputRef} type="file" aria-label="Seleccionar archivo Excel para importar cuentas por pagar"
          accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </div>

      {/* ── Saldos acumulados: una fila por proveedor ───────────────────────── */}
      {vista === 'acumulado' ? (
        <div className="card overflow-hidden">
          {/* Lo primero es el total de la deuda: la cifra que se busca al abrir
              esta vista. */}
          {saldos?.totals && (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px]">
              <span className="text-slate-500 dark:text-slate-400">
                Debes <b className="text-[15px] text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(filasAcumuladas.reduce((a: number, f: any) => a + Number(f.balance), 0))}</b>
              </span>
              <span className="text-slate-400 dark:text-slate-500">
                {filasAcumuladas.length} proveedor{filasAcumuladas.length === 1 ? '' : 'es'} · {filasAcumuladas.reduce((a: number, f: any) => a + f.facturas, 0)} factura{filasAcumuladas.reduce((a: number, f: any) => a + f.facturas, 0) === 1 ? '' : 's'}
              </span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Proveedor</th>
                  <th className="hidden lg:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Identificación</th>
                  <th className="hidden sm:table-cell text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Facturas</th>
                  <th className="hidden md:table-cell text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</th>
                  <th className="hidden sm:table-cell text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Abonado</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Saldo</th>
                  <th className="hidden lg:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Próx. vence</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                {cargandoSaldos ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>{[...Array(8)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" /></td>)}</tr>
                  ))
                ) : filasAcumuladas.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                      <Truck size={36} strokeWidth={1.5} />
                      <p className="text-[13px]">Ningún proveedor con cuentas en este filtro</p>
                    </div>
                  </td></tr>
                ) : filasAcumuladas.map((f: any) => (
                  <tr
                    key={f.supplier.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                    // Clic en la fila: lleva al detalle de ESE proveedor, que es
                    // lo que uno quiere después de ver el total ("¿de qué
                    // facturas sale?").
                    onClick={() => { setSearch(f.supplier.name); setVista('detalle'); setPage(1); }}
                  >
                    <td className="px-4 py-3 text-[13px] font-medium text-slate-800 dark:text-white">
                      {f.supplier.name}
                      {f.supplier.document && (
                        <span className="lg:hidden block text-[11px] font-normal text-slate-400 font-mono">{f.supplier.document}</span>
                      )}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-[12px] text-slate-500 dark:text-slate-400 font-mono">{f.supplier.document || '—'}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">{f.facturas}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-right text-[13px] text-slate-600 dark:text-slate-300 tabular-nums">{formatCurrency(f.totalAmount)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right text-[13px] text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(f.paidAmount)}</td>
                    <td className="px-4 py-3 text-right text-[13px] font-bold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(f.balance)}</td>
                    {/* En rojo si ya se pasó la fecha y todavía se debe: es a
                        quien hay que pagarle ya. */}
                    <td className="hidden lg:table-cell px-4 py-3 text-[12.5px] tabular-nums">
                      {f.proximoVencimiento ? (
                        <span className={vencida({ dueDate: f.proximoVencimiento, balance: f.balance }) ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}>
                          {formatDate(f.proximoVencimiento)}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 dark:text-slate-600"><ChevronRight size={15} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 border-t border-slate-100 dark:border-white/[0.06] text-[11.5px] text-slate-400 dark:text-slate-500">
            Toque un proveedor para ver de qué facturas sale su saldo.
          </p>
        </div>
      ) : (
      <>
      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Proveedor</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Identificación</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Factura</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</th>
                <th className="hidden sm:table-cell text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Abonado</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Saldo</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Vencimiento</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>{[...Array(9)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" /></td>)}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-600">
                    <HandCoins size={36} strokeWidth={1.5} />
                    <p className="text-[13px]">No hay cuentas por pagar</p>
                  </div>
                </td></tr>
              ) : rows.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => openDetail(c)}>
                  <td className="px-4 py-3 text-[13px] font-medium text-slate-800 dark:text-white">
                    {c.supplier?.name}
                    {c.supplier?.document && (
                      <span className="lg:hidden block text-[11px] font-normal text-slate-400 font-mono">{c.supplier.document}</span>
                    )}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-[12px] text-slate-500 dark:text-slate-400 font-mono">{c.supplier?.document || '—'}</td>
                  {/* En las importadas no hay compra registrada: el número
                      viene del archivo. */}
                  <td className="hidden md:table-cell px-4 py-3 text-[12px] text-slate-500 dark:text-slate-400 font-mono">{c.purchase?.invoiceNumber || c.invoiceNumber || '—'}</td>
                  <td className="px-4 py-3 text-right text-[13px] text-slate-600 dark:text-slate-300 tabular-nums">{formatCurrency(c.totalAmount)}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-right text-[13px] text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(c.paidAmount)}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(c.balance)}</td>
                  {/* Vencida y con saldo: en rojo. Es la cuenta que hay que
                      pagar ya, y en una lista larga tiene que saltar a la vista. */}
                  <td className="px-4 py-3 text-[12.5px] tabular-nums">
                    {c.dueDate ? (
                      <span className={vencida(c) ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}>
                        {formatDate(c.dueDate)}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><span className={`badge ${statusColor(c.status)}`}>{statusLabel(c.status)}</span></td>
                  <td className="px-4 py-3 text-right">
                    {c.status !== 'PAID' && c.status !== 'CANCELLED' && (
                      <button onClick={(e) => { e.stopPropagation(); openPayment(c); }} className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">Abonar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[13px] text-slate-500">
            <span>{pagination.total} cuentas</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 text-[12px]">Anterior</button>
              <span className="px-3 py-1.5 text-slate-400">{page} / {pagination.totalPages}</span>
              <button disabled={page === pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 text-[12px]">Siguiente</button>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>

    {/* Abonar */}
    {showPayment && selected && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Pagar al proveedor</h2>
            <button aria-label="Cerrar" onClick={() => setShowPayment(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><X size={16} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl px-4 py-3 text-center">
              <p className="text-[12px] text-red-500 dark:text-red-400 mb-1">Saldo con <span className="font-semibold">{selected.supplier?.name}</span></p>
              <p className="text-[24px] font-bold text-red-700 dark:text-red-300 tabular-nums">{formatCurrency(selected.balance)}</p>
            </div>
            <form onSubmit={handleSubmit((d: any) => paymentMutation.mutate({ ...d, id: selected.id }))} className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Monto del abono *</label>
                <Controller
                  control={control}
                  name="amount"
                  rules={{ required: 'El monto es obligatorio', min: { value: 0.01, message: 'El monto debe ser mayor a 0' }, max: { value: Number(selected?.balance) ?? Infinity, message: 'No puede superar el saldo' } }}
                  render={({ field }) => <PriceInput {...field} onChange={(n) => field.onChange(n ?? 0)} className={inputCls} placeholder="0" autoFocus />}
                />
                {payErrors.amount && <p className="text-[11px] text-red-500 mt-1">{payErrors.amount.message as string}</p>}
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Medio de pago</label>
                <select {...register('paymentAccountId')} className={inputCls}>
                  {paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Notas (opcional)</label>
                <input {...register('notes')} type="text" className={inputCls} />
              </div>
              <button type="submit" disabled={paymentMutation.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl shadow-sm shadow-emerald-600/20 transition flex items-center justify-center gap-2 text-[13px]">
                {paymentMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <DollarSign size={15} />} Registrar pago
              </button>
            </form>
          </div>
        </div>
      </div>
    )}

    {/* Detalle */}
    {showDetail && selected && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => { setShowDetail(false); setSelected(null); }}>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
            <div>
              <h2 className="text-[15px] font-bold text-slate-800 dark:text-white">{(detail || selected).supplier?.name}</h2>
              <p className="text-[12px] text-slate-400">{(detail || selected).purchase?.invoiceNumber ? `Factura ${(detail || selected).purchase.invoiceNumber}` : 'Compra a crédito'}</p>
            </div>
            <button aria-label="Cerrar" onClick={() => { setShowDetail(false); setSelected(null); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><X size={16} /></button>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto min-h-0 flex-1">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] py-2.5"><p className="text-[10px] uppercase text-slate-400">Total</p><p className="text-[14px] font-bold text-slate-800 dark:text-white tabular-nums">{formatCurrency((detail || selected).totalAmount)}</p></div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 py-2.5"><p className="text-[10px] uppercase text-emerald-500">Abonado</p><p className="text-[14px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{formatCurrency((detail || selected).paidAmount)}</p></div>
              <div className="rounded-xl bg-red-50 dark:bg-red-500/10 py-2.5"><p className="text-[10px] uppercase text-red-500">Saldo</p><p className="text-[14px] font-bold text-red-700 dark:text-red-300 tabular-nums">{formatCurrency((detail || selected).balance)}</p></div>
            </div>

            {(detail || selected).dueDate && (
              <p className="text-[12px] text-slate-500 dark:text-slate-400">Fecha de pago acordada: <b>{formatDate((detail || selected).dueDate)}</b></p>
            )}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Abonos</p>
              {(detail?.payments || []).length === 0 ? (
                <p className="text-[12px] text-slate-400 py-3 text-center">Aún no hay abonos.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.payments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-[12px]">
                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(p.amount)}</p>
                        <p className="text-[11px] text-slate-400">{formatDateTime(p.createdAt)} · {labelPago(allAccounts, p.paymentAccountId, p.paymentMethod)}</p>
                      </div>
                      {p.notes && <span className="text-[11px] text-slate-400 italic truncate max-w-[120px]">{p.notes}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selected.status !== 'PAID' && selected.status !== 'CANCELLED' && (
              <button onClick={() => openPayment(selected)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-[13px] flex items-center justify-center gap-2">
                <DollarSign size={15} /> Pagar al proveedor
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    {/* Vista previa antes de importar: se muestra qué se va a crear ANTES de
        escribir nada. Importar a ciegas un archivo mal armado obligaría a
        borrar cuentas a mano una por una. */}
    {previewData && pendingFile && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
        <div className="bg-white dark:bg-slate-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Revisar antes de importar</h2>
            <button onClick={() => { setPreviewData(null); setPendingFile(null); }} aria-label="Cerrar"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Filas</p>
                <p className="text-[17px] font-bold text-slate-700 dark:text-slate-200">{previewData.total}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3">
                <p className="text-[11px] uppercase tracking-wide text-emerald-500 mb-1">Se crean</p>
                <p className="text-[17px] font-bold text-emerald-700 dark:text-emerald-300">{previewData.toCreate}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3">
                <p className="text-[11px] uppercase tracking-wide text-blue-500 mb-1">Proveedores nuevos</p>
                <p className="text-[17px] font-bold text-blue-700 dark:text-blue-300">{previewData.proveedoresNuevos}</p>
              </div>
            </div>

            {previewData.detectedColumns?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Columnas reconocidas</p>
                <div className="flex flex-wrap gap-1.5">
                  {previewData.detectedColumns.map((c: any) => (
                    <span key={c.field} className="text-[11.5px] px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {c.header}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {previewData.issues?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                  Avisos ({previewData.issues.length})
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {previewData.issues.map((i: any, n: number) => (
                    <p key={n} className={`text-[12px] leading-snug ${i.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      Fila {i.row}{i.name ? ` · ${i.name}` : ''}: {i.message}
                    </p>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Las filas con error no se importan. Las de advertencia sí.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-white/[0.06]">
            <button type="button" onClick={() => { setPreviewData(null); setPendingFile(null); }}
              className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-[13px] font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition">
              Cancelar
            </button>
            <button type="button"
              onClick={() => importMut.mutate(pendingFile)}
              disabled={importMut.isPending || previewData.toCreate === 0}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-[13px] font-semibold transition flex items-center justify-center gap-2">
              {importMut.isPending && <Loader2 size={14} className="animate-spin" />}
              Importar {previewData.toCreate}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
