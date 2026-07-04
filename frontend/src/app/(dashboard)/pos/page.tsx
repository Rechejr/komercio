'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { formatCurrency, formatDate, paymentMethodLabel, statusColor, statusLabel, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Search, Plus, Minus, Trash2, User,
  DollarSign, Printer, X, Loader2, ShoppingBag, CheckCircle,
  Zap, Package, AlertCircle, CreditCard,
} from 'lucide-react';

const PAYMENT_METHODS = ['CASH', 'NEQUI', 'DAVIPLATA', 'TRANSFER', 'CARD', 'MIXED'];

// ── Shared input style ────────────────────────────────────────────────────────
const inputCls = [
  'w-full px-3.5 py-2.5 text-[13px] rounded-xl border transition-all duration-150',
  'bg-slate-50 dark:bg-slate-800/60',
  'border-slate-200 dark:border-slate-700/60',
  'text-slate-900 dark:text-slate-100',
  'placeholder:text-slate-400 dark:placeholder:text-slate-500',
  'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-400',
].join(' ');

export default function POSPage() {
  const qc = useQueryClient();
  const { items, addItem, updateQty, updateDiscount, removeItem, clear, totals, customerId, setCustomer } = useCartStore();
  const plan       = useAuthStore((s) => s.user?.plan);
  const isFree     = !plan || plan === 'free';
  const openUpgrade = useUpgradeStore((s) => s.open);

  const [search, setSearch]                   = useState('');
  const [categoryFilter, setCategoryFilter]   = useState('');
  const [customerSearch, setCustomerSearch]   = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [showPayment, setShowPayment]         = useState(false);
  const [paymentMethod, setPaymentMethod]     = useState('CASH');
  const [paidAmount, setPaidAmount]           = useState('');
  const [isCredit, setIsCredit]               = useState(false);
  const [lastSale, setLastSale]               = useState<any>(null);
  const [saleError, setSaleError]             = useState('');
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustName, setNewCustName]         = useState('');
  const [newCustPhone, setNewCustPhone]       = useState('');
  const [newCustDoc, setNewCustDoc]           = useState('');
  const [newCustAddress, setNewCustAddress]   = useState('');
  const [mixedPayments, setMixedPayments]     = useState<Array<{ method: string; amount: number }>>([]);
  const [splitMethod, setSplitMethod]         = useState('CASH');
  const [splitAmount, setSplitAmount]         = useState('');
  const [saleNotes, setSaleNotes]             = useState('');
  const [showCreditPayment, setShowCreditPayment] = useState(false);
  const [selectedCreditId, setSelectedCreditId]   = useState<string | null>(null);
  const [creditPayAmount, setCreditPayAmount] = useState('');
  const [creditPayMethod, setCreditPayMethod] = useState('CASH');
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
  });

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products-pos', search, categoryFilter],
    queryFn: () => api.get(
      `/products?search=${encodeURIComponent(search)}&limit=40&isActive=true${categoryFilter ? `&categoryId=${categoryFilter}` : ''}`,
    ).then((r) => r.data.data),
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => api.get(`/customers?limit=10&search=${encodeURIComponent(customerSearch)}`).then((r) => r.data.data),
    enabled: customerSearch.length > 0 || showCustomerList,
  });

  const { data: selectedCustomer } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api.get(`/customers/${customerId}`).then((r) => r.data.data),
    enabled: !!customerId,
  });

  const { data: customerCredits, isLoading: loadingCredits } = useQuery({
    queryKey: ['customer-credits-pos', customerId],
    queryFn: () =>
      api.get(`/credits?customerId=${customerId}&limit=50`).then((r) =>
        (r.data.data || []).filter((c: any) =>
          ['PENDING', 'PARTIAL', 'OVERDUE'].includes(c.status) && c.balance > 0,
        ),
      ),
    enabled: !!customerId && showCreditPayment,
  });

  const creditPaymentMutation = useMutation({
    mutationFn: ({ creditId, ...data }: any) =>
      api.post(`/credits/${creditId}/payments`, data).then((r) => r.data),
    onSuccess: () => {
      toast.success('Abono registrado');
      setShowCreditPayment(false);
      setSelectedCreditId(null);
      setCreditPayAmount('');
      qc.invalidateQueries({ queryKey: ['credits'] });
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      qc.invalidateQueries({ queryKey: ['customers-search'] });
      qc.invalidateQueries({ queryKey: ['customer-credits-pos', customerId] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al registrar abono'),
  });

  function handleCreditPayment() {
    if (!selectedCreditId || !creditPayAmount || parseFloat(creditPayAmount) <= 0) return;
    creditPaymentMutation.mutate({ creditId: selectedCreditId, amount: parseFloat(creditPayAmount), paymentMethod: creditPayMethod });
  }

  const saleMutation = useMutation({
    mutationFn: (saleData: any) => api.post('/sales', saleData).then((r) => r.data.data),
    onSuccess: (sale) => {
      setSaleError('');
      setLastSale(sale);
      clear();
      setShowPayment(false);
      setSearch('');
      setMixedPayments([]);
      setSplitAmount('');
      setSplitMethod('CASH');
      setSaleNotes('');
      setPaidAmount('');
      toast.success('¡Venta registrada!');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-pos'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['credits'] });
    },
    onError: (err: any) => {
      const message = err.response?.data?.error || 'Error al procesar la venta. Intenta de nuevo.';
      setSaleError(message);
      toast.error(message);
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: (d: { name: string; phone?: string; document?: string; address?: string }) =>
      api.post('/customers', d).then((r) => r.data.data),
    onSuccess: (customer) => {
      setCustomer(customer.id);
      setCustomerSearch(customer.name);
      setShowCreateCustomer(false);
      setNewCustName(''); setNewCustPhone(''); setNewCustDoc(''); setNewCustAddress('');
      qc.invalidateQueries({ queryKey: ['customers-search'] });
      toast.success('Cliente creado');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al crear cliente'),
  });

  const { subtotal, taxes, discount, total } = totals();
  const change         = Math.max(0, parseFloat(paidAmount || '0') - total);
  const mixedTotal     = mixedPayments.reduce((sum, p) => sum + p.amount, 0);
  const mixedRemaining = Math.max(0, total - mixedTotal);

  function addSplitPayment() {
    const amount = parseFloat(splitAmount);
    if (!amount || amount <= 0) return;
    const newPayments = [...mixedPayments, { method: splitMethod, amount }];
    setMixedPayments(newPayments);
    const newTotal = newPayments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, total - newTotal);
    setSplitAmount(remaining > 0 ? String(Math.round(remaining)) : '');
  }

  function removeSplitPayment(index: number) {
    setMixedPayments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddProduct(product: any) {
    const cartQty = items.find((i) => i.productId === product.id)?.quantity ?? 0;
    if (product.stock <= cartQty && !product.allowNegativeStock) {
      toast.error(`"${product.name}" sin stock suficiente (${product.stock} disponibles)`);
      return;
    }
    addItem({
      productId: product.id, name: product.name, code: product.code,
      unitPrice: product.salePrice, quantity: 1, discountPct: 0, taxRate: product.taxRate || 0,
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function handleSale() {
    setSaleError('');
    if (items.length === 0) { toast.error('Agrega productos'); return; }
    if (isCredit && !customerId) { toast.error('Selecciona un cliente para registrar un fiado'); return; }
    if (paymentMethod === 'MIXED' && mixedPayments.length === 0) { toast.error('Agrega al menos un método de pago'); return; }
    const paid = paymentMethod === 'MIXED'
      ? mixedTotal
      : isCredit ? parseFloat(paidAmount || '0') : parseFloat(paidAmount || String(total));
    saleMutation.mutate({
      customerId: customerId || undefined,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, discountPct: i.discountPct })),
      paymentMethod, paidAmount: paid,
      paymentDetails: paymentMethod === 'MIXED' ? { splits: mixedPayments } : undefined,
      discountAmount: discount, isCredit,
      notes: saleNotes.trim() || undefined,
    });
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (lastSale) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="max-w-sm w-full text-center animate-scale-in">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-5 border border-emerald-100 dark:border-emerald-500/20">
            <CheckCircle className="text-emerald-500" size={40} strokeWidth={1.5} />
          </div>
          <h2 className="text-[22px] font-bold text-slate-900 dark:text-white mb-1">¡Venta exitosa!</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5">
            Factura <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{lastSale.invoiceNumber}</span>
          </p>
          <div className="card p-5 mb-4 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Total cobrado</p>
            <p className="text-[36px] font-bold text-slate-900 dark:text-white tabular">{formatCurrency(lastSale.total)}</p>
            {lastSale.changeAmount > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mb-0.5">Cambio</p>
                <p className="text-[22px] font-bold text-emerald-600 dark:text-emerald-400 tabular">{formatCurrency(lastSale.changeAmount)}</p>
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Printer size={15} /> Imprimir
            </button>
            <button
              type="button"
              onClick={() => setLastSale(null)}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-semibold hover:bg-blue-700 transition-colors"
            >
              Nueva venta
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <>
    <div className="flex flex-col lg:flex-row gap-4 lg:h-full lg:max-h-[calc(100vh-120px)]">

      {/* ── Left: Products + Cart ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 lg:overflow-hidden">

        {/* Search + categories + grid */}
        <div className="card p-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre, código o código de barras..."
              className={cn(inputCls, 'pl-9')}
              autoFocus
            />
          </div>

          {/* Category chips */}
          <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => setCategoryFilter('')}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150',
                !categoryFilter
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                  : 'border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50',
              )}
            >
              Todos
            </button>
            {categories?.map((c: any) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryFilter(c.id)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150',
                  categoryFilter === c.id
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                    : 'border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="mt-3 max-h-[280px] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex flex-col rounded-xl p-2.5 bg-slate-50 dark:bg-slate-800/40">
                    <div className="skeleton aspect-square w-full rounded-lg mb-2" />
                    <div className="skeleton h-3 w-3/4 mb-1.5 rounded" />
                    <div className="skeleton h-2.5 w-full mb-1.5 rounded" />
                    <div className="skeleton h-3 w-1/2 rounded-full" />
                  </div>
                ))}
              </div>
            ) : productsData?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400 dark:text-slate-600">
                <Package size={32} strokeWidth={1.5} />
                <p className="text-[13px]">{search ? `Sin resultados para "${search}"` : 'No hay productos disponibles'}</p>
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="text-[12px] text-blue-500 hover:underline">
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                {productsData?.map((p: any) => {
                  const lowStock = p.stock <= p.minStock;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleAddProduct(p)}
                      className={cn(
                        'flex flex-col bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 text-left',
                        'border border-transparent hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-500/5',
                        'transition-all duration-150 group',
                      )}
                    >
                      <div className="aspect-square w-full rounded-lg overflow-hidden bg-white dark:bg-slate-800 mb-2 flex items-center justify-center border border-slate-100 dark:border-white/[0.05]">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package size={22} className="text-slate-300 dark:text-slate-600" />
                        )}
                      </div>
                      <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate tabular">{formatCurrency(p.salePrice)}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-1.5">{p.name}</p>
                      <span className={cn(
                        'inline-block w-fit text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                        lowStock
                          ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                          : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                      )}>
                        {p.stock} disp.
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart items */}
        <div className="lg:flex-1 card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <ShoppingBag size={15} className="text-blue-500" />
              Carrito
              {items.length > 0 && (
                <span className="bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 text-[11px] font-bold px-1.5 py-0.5 rounded-md">
                  {items.length}
                </span>
              )}
            </h3>
            {items.length > 0 && (
              <button type="button" onClick={clear} className="text-[12px] text-red-500 hover:text-red-700 hover:underline transition-colors">
                Limpiar
              </button>
            )}
          </div>

          <div className="max-h-72 lg:max-h-none lg:flex-1 overflow-y-auto scrollbar-thin">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 text-slate-400 dark:text-slate-600 gap-2">
                <ShoppingBag size={32} strokeWidth={1.5} />
                <p className="text-[13px]">Busca y agrega productos</p>
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/60 dark:bg-white/[0.02]">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Producto</th>
                    <th className="text-center px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 w-24">Cant.</th>
                    <th className="text-right px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 w-16">Desc%</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</th>
                    <th className="w-8 sr-only">Eliminar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                  {items.map((item) => (
                    <tr key={item.productId} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[180px]">{item.name}</p>
                        <p className="text-[11px] text-slate-400">{item.code}</p>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            aria-label="Disminuir cantidad"
                            onClick={() => updateQty(item.productId, item.quantity - 1)}
                            className="w-6 h-6 rounded-md border border-slate-200 dark:border-slate-700/60 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Minus size={11} />
                          </button>
                          <input
                            type="number"
                            aria-label="Cantidad"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              if (!isNaN(v) && v > 0) updateQty(item.productId, v);
                            }}
                            className="w-10 text-center text-[13px] font-mono border border-slate-200 dark:border-slate-700/60 rounded-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                          />
                          <button
                            type="button"
                            aria-label="Aumentar cantidad"
                            onClick={() => updateQty(item.productId, item.quantity + 1)}
                            className="w-6 h-6 rounded-md border border-slate-200 dark:border-slate-700/60 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <input
                            type="number"
                            aria-label="Descuento %"
                            min={0} max={100}
                            value={item.discountPct}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              updateDiscount(item.productId, isNaN(v) ? 0 : Math.min(100, Math.max(0, v)));
                            }}
                            className="w-10 text-right text-[12px] border border-slate-200 dark:border-slate-700/60 rounded-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                          />
                          <span className="text-[11px] text-slate-400">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800 dark:text-white tabular">
                        {formatCurrency(item.total)}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          aria-label="Eliminar producto"
                          onClick={() => removeItem(item.productId)}
                          className="text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: Customer + Totals + Payment ───────────────────────────── */}
      <div className="w-full lg:w-72 flex flex-col gap-3">

        {/* Customer */}
        <div className="card p-4">
          <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
            <User size={12} /> Cliente (opcional)
          </p>
          {customerId ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl px-3 py-2">
                <span className="text-[13px] font-semibold text-blue-700 dark:text-blue-300 truncate">
                  {customersData?.find((c: any) => c.id === customerId)?.name ?? customerSearch}
                </span>
                <button
                  type="button"
                  aria-label="Quitar cliente"
                  onClick={() => { setCustomer(null); setCustomerSearch(''); setShowCustomerList(false); setShowCreditPayment(false); setSelectedCreditId(null); setCreditPayAmount(''); }}
                  className="text-blue-400 hover:text-red-500 ml-2 flex-shrink-0 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              {(selectedCustomer?.currentDebt ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCreditPayment(true)}
                  className="w-full text-[12px] px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/15 transition-colors flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5"><CreditCard size={12} /> Deuda: {formatCurrency(selectedCustomer.currentDebt)}</span>
                  <span className="font-semibold">Abonar →</span>
                </button>
              )}
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerList(true); }}
                onFocus={() => setShowCustomerList(true)}
                onBlur={() => setTimeout(() => setShowCustomerList(false), 150)}
                placeholder="Buscar cliente..."
                className={inputCls}
              />
              {showCustomerList && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-modal z-20 max-h-48 overflow-y-auto scrollbar-thin animate-scale-in">
                  <button
                    type="button"
                    onMouseDown={() => { setCustomer(null); setCustomerSearch(''); setShowCustomerList(false); }}
                    className="w-full text-left px-3 py-2.5 text-[13px] text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.04] border-b border-slate-100 dark:border-white/[0.06] transition-colors"
                  >
                    Mostrador (sin cliente)
                  </button>
                  {customersData?.length === 0 && customerSearch && (
                    <p className="px-3 py-2.5 text-[12px] text-slate-400">Sin resultados</p>
                  )}
                  {customersData?.map((c: any) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => { setCustomer(c.id); setCustomerSearch(c.name); setShowCustomerList(false); }}
                      className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-blue-50 dark:hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="font-medium text-slate-800 dark:text-white">{c.name}</span>
                      {c.currentDebt > 0 && (
                        <span className="ml-2 text-[11px] text-red-500">Deuda: {formatCurrency(c.currentDebt)}</span>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setShowCustomerList(false); setShowCreateCustomer(true); }}
                    className="w-full flex items-center gap-1.5 px-3 py-2.5 text-[13px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-white/[0.04] border-t border-slate-100 dark:border-white/[0.06] transition-colors"
                  >
                    <Plus size={13} /> Crear cliente nuevo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="card p-4 space-y-2.5">
          <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Resumen</h3>
          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal</span><span className="tabular">{formatCurrency(subtotal)}</span>
            </div>
            {taxes > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Impuestos</span><span className="tabular">{formatCurrency(taxes)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Descuento</span><span className="tabular">-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[18px] text-slate-900 dark:text-white border-t border-slate-100 dark:border-white/[0.06] pt-2.5 mt-1">
              <span>Total</span>
              <span className="text-blue-600 dark:text-blue-400 tabular">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Payment panel */}
        {showPayment ? (
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white">Cobrar</h3>
              <button
                type="button"
                aria-label="Cerrar cobro"
                onClick={() => { setShowPayment(false); setSaleError(''); }}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {saleError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">No se pudo registrar</p>
                  <p className="mt-0.5 opacity-80">{saleError}</p>
                </div>
                <button type="button" aria-label="Cerrar error" onClick={() => setSaleError('')} className="opacity-60 hover:opacity-100 transition-opacity">
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Payment methods */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">Método de pago</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={cn(
                      'text-[12px] py-2 px-2 rounded-xl border font-semibold transition-all duration-150',
                      paymentMethod === m
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                        : 'border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    )}
                  >
                    {paymentMethodLabel[m]}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'MIXED' ? (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <select
                    aria-label="Método de pago"
                    value={splitMethod}
                    onChange={(e) => setSplitMethod(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-slate-50 dark:bg-slate-800/60 dark:text-white"
                  >
                    {PAYMENT_METHODS.filter((m) => m !== 'MIXED').map((m) => (
                      <option key={m} value={m}>{paymentMethodLabel[m]}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSplitPayment()}
                    placeholder={mixedRemaining > 0 ? String(Math.round(mixedRemaining)) : '0'}
                    className="w-24 px-2 py-2 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    aria-label="Agregar pago"
                    onClick={addSplitPayment}
                    className="px-3 py-2 bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 transition-colors flex-shrink-0"
                  >
                    +
                  </button>
                </div>
                {mixedPayments.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl overflow-hidden border border-slate-100 dark:border-white/[0.06]">
                    {mixedPayments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-white/[0.04] last:border-b-0">
                        <span className="text-[12px] text-slate-600 dark:text-slate-400">{paymentMethodLabel[p.method]}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-slate-800 dark:text-white tabular">{formatCurrency(p.amount)}</span>
                          <button type="button" aria-label="Quitar pago" onClick={() => removeSplitPayment(i)} className="text-slate-300 hover:text-red-500 transition-colors">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 dark:border-white/[0.06] bg-white dark:bg-slate-800/20">
                      <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Total registrado</span>
                      <span className={cn(
                        'text-[13px] font-bold tabular',
                        mixedTotal >= total ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
                      )}>
                        {formatCurrency(mixedTotal)}
                        {mixedTotal >= total ? ' ✓' : ` (falta ${formatCurrency(mixedRemaining)})`}
                      </span>
                    </div>
                  </div>
                )}
                {mixedTotal > total && (
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-2.5 text-center border border-emerald-100 dark:border-emerald-500/20">
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wide">Cambio</p>
                    <p className="font-bold text-emerald-700 dark:text-emerald-400 text-[18px] tabular">{formatCurrency(mixedTotal - total)}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Monto recibido</label>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={formatCurrency(total)}
                    className={inputCls}
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[5000, 10000, 20000, 50000, 100000, 200000]
                      .filter((d) => d >= total)
                      .slice(0, 4)
                      .map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setPaidAmount(String(d))}
                          className="px-2 py-0.5 text-[11px] rounded-full border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
                        >
                          ${(d / 1000).toFixed(0)}k
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setPaidAmount(String(Math.ceil(total)))}
                      className="px-2 py-0.5 text-[11px] rounded-full border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                    >
                      Exacto
                    </button>
                  </div>
                </div>
                {paymentMethod === 'CASH' && parseFloat(paidAmount) > 0 && (
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-2.5 text-center border border-emerald-100 dark:border-emerald-500/20">
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wide">Cambio</p>
                    <p className="font-bold text-emerald-700 dark:text-emerald-400 text-[18px] tabular">{formatCurrency(change)}</p>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Observaciones</label>
              <input
                type="text"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                placeholder="Opcional..."
                maxLength={200}
                className={inputCls}
              />
            </div>

            {isFree ? (
              <button
                type="button"
                onClick={openUpgrade}
                className="flex items-center gap-2 text-[12px] text-amber-600 dark:text-amber-400 hover:text-amber-700 transition-colors"
              >
                <Zap size={12} className="fill-amber-500 text-amber-500" />
                Fiado / Crédito — Solo Plan Pro
              </button>
            ) : (
              <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} className="rounded accent-blue-600" />
                Fiado / Crédito
              </label>
            )}

            <button
              type="button"
              onClick={handleSale}
              disabled={saleMutation.isPending || (paymentMethod === 'MIXED' && mixedTotal < total && !isCredit)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/25"
            >
              {saleMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {saleMutation.isPending ? 'Procesando...' : 'Confirmar venta'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => items.length > 0 ? setShowPayment(true) : toast.error('Agrega productos primero')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-[15px] shadow-sm shadow-blue-600/25 active:scale-[0.99]"
          >
            <DollarSign size={18} />
            Cobrar {total > 0 ? formatCurrency(total) : ''}
          </button>
        )}
      </div>
    </div>

    {/* ── Credit payment modal ───────────────────────────────────────────── */}
    {showCreditPayment && customerId && (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
        onClick={() => { setShowCreditPayment(false); setSelectedCreditId(null); setCreditPayAmount(''); }}
      >
        <div
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] rounded-2xl shadow-modal w-full max-w-md animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <CreditCard size={16} className="text-amber-500" /> Registrar abono
            </h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => { setShowCreditPayment(false); setSelectedCreditId(null); setCreditPayAmount(''); }}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X size={15} />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl px-4 py-2.5 flex justify-between items-center">
              <span className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">
                {customersData?.find((c: any) => c.id === customerId)?.name ?? customerSearch}
              </span>
              <span className="text-[13px] font-bold text-amber-700 dark:text-amber-400 tabular">
                Deuda: {formatCurrency(selectedCustomer?.currentDebt || 0)}
              </span>
            </div>
            {loadingCredits ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
            ) : !customerCredits?.length ? (
              <p className="text-[13px] text-slate-400 text-center py-4">No hay créditos pendientes</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Selecciona el crédito a abonar</p>
                {customerCredits.map((credit: any) => (
                  <button
                    key={credit.id}
                    type="button"
                    onClick={() => { setSelectedCreditId(credit.id); setCreditPayAmount(String(credit.balance)); }}
                    className={cn(
                      'w-full text-left px-4 py-3 rounded-xl border-2 transition-all duration-150',
                      selectedCreditId === credit.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                        : 'border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600',
                    )}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[13px] font-semibold text-slate-800 dark:text-white">
                          {credit.sale?.invoiceNumber || 'Crédito directo'}
                        </p>
                        {credit.dueDate && (
                          <p className="text-[11px] text-slate-400 mt-0.5">Vence: {formatDate(credit.dueDate)}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-bold text-red-600 dark:text-red-400 tabular">Saldo: {formatCurrency(credit.balance)}</p>
                        <span className={`badge ${statusColor(credit.status)}`}>{statusLabel(credit.status)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedCreditId && (
              <>
                <div>
                  <label htmlFor="creditPayAmount" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Monto del abono *</label>
                  <input
                    id="creditPayAmount"
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={creditPayAmount}
                    onChange={(e) => setCreditPayAmount(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Método de pago</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['CASH', 'NEQUI', 'DAVIPLATA', 'TRANSFER', 'CARD'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCreditPayMethod(m)}
                        className={cn(
                          'text-[12px] py-1.5 px-1 rounded-xl border font-semibold transition-all duration-150',
                          creditPayMethod === m
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-slate-300',
                        )}
                      >
                        {paymentMethodLabel[m]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setShowCreditPayment(false); setSelectedCreditId(null); setCreditPayAmount(''); }}
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreditPayment}
                disabled={!selectedCreditId || !creditPayAmount || parseFloat(creditPayAmount) <= 0 || creditPaymentMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[13px] font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors shadow-sm shadow-amber-600/25"
              >
                {creditPaymentMutation.isPending && <Loader2 size={13} className="animate-spin" />}
                Registrar abono
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Create customer modal ──────────────────────────────────────────── */}
    {showCreateCustomer && (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
        onClick={() => { setShowCreateCustomer(false); setNewCustName(''); setNewCustPhone(''); setNewCustDoc(''); setNewCustAddress(''); }}
      >
        <div
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] rounded-2xl shadow-modal w-full max-w-sm p-5 space-y-3 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-[15px] font-semibold text-slate-800 dark:text-white">Crear cliente</h3>
          <input
            type="text"
            placeholder="Nombre completo *"
            value={newCustName}
            onChange={(e) => setNewCustName(e.target.value)}
            autoFocus
            className={inputCls}
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Cédula / NIT" value={newCustDoc} onChange={(e) => setNewCustDoc(e.target.value)} className={inputCls} />
            <input type="tel" placeholder="Celular" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} className={inputCls} />
          </div>
          <input type="text" placeholder="Dirección (opcional)" value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)} className={inputCls} />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowCreateCustomer(false); setNewCustName(''); setNewCustPhone(''); setNewCustDoc(''); setNewCustAddress(''); }}
              className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => newCustName.trim() && createCustomerMutation.mutate({ name: newCustName.trim(), phone: newCustPhone.trim() || undefined, document: newCustDoc.trim() || undefined, address: newCustAddress.trim() || undefined })}
              disabled={!newCustName.trim() || createCustomerMutation.isPending}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-semibold disabled:opacity-50 transition-colors"
            >
              {createCustomerMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}