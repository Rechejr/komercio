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
  DollarSign, Printer, X, Loader2, ShoppingBag, CheckCircle, Zap, Package, AlertCircle, CreditCard,
} from 'lucide-react';

const PAYMENT_METHODS = ['CASH', 'NEQUI', 'DAVIPLATA', 'TRANSFER', 'CARD', 'MIXED'];

export default function POSPage() {
  const qc = useQueryClient();
  const { items, addItem, updateQty, updateDiscount, removeItem, clear, totals, customerId, setCustomer } = useCartStore();
  const plan = useAuthStore((s) => s.user?.plan);
  const isFree = !plan || plan === 'free';
  const openUpgrade = useUpgradeStore((s) => s.open);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [isCredit, setIsCredit] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [saleError, setSaleError] = useState('');
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustDoc, setNewCustDoc] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [mixedPayments, setMixedPayments] = useState<Array<{ method: string; amount: number }>>([]);
  const [splitMethod, setSplitMethod] = useState('CASH');
  const [splitAmount, setSplitAmount] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [showCreditPayment, setShowCreditPayment] = useState(false);
  const [selectedCreditId, setSelectedCreditId] = useState<string | null>(null);
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
    queryFn: () =>
      api.get(`/customers?limit=10&search=${encodeURIComponent(customerSearch)}`).then((r) => r.data.data),
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
    creditPaymentMutation.mutate({
      creditId: selectedCreditId,
      amount: parseFloat(creditPayAmount),
      paymentMethod: creditPayMethod,
    });
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
  const change = Math.max(0, parseFloat(paidAmount || '0') - total);
  const mixedTotal = mixedPayments.reduce((sum, p) => sum + p.amount, 0);
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
    addItem({
      productId: product.id,
      name: product.name,
      code: product.code,
      unitPrice: product.salePrice,
      quantity: 1,
      discountPct: 0,
      taxRate: product.taxRate || 0,
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function handleSale() {
    setSaleError('');
    if (items.length === 0) { toast.error('Agrega productos'); return; }
    if (isCredit && !customerId) {
      toast.error('Selecciona un cliente para registrar un fiado');
      return;
    }
    if (paymentMethod === 'MIXED' && mixedPayments.length === 0) {
      toast.error('Agrega al menos un método de pago');
      return;
    }
    const paid = paymentMethod === 'MIXED'
      ? mixedTotal
      : isCredit ? parseFloat(paidAmount || '0') : parseFloat(paidAmount || String(total));
    saleMutation.mutate({
      customerId: customerId || undefined,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, discountPct: i.discountPct })),
      paymentMethod,
      paidAmount: paid,
      paymentDetails: paymentMethod === 'MIXED' ? { splits: mixedPayments } : undefined,
      discountAmount: discount,
      isCredit,
      notes: saleNotes.trim() || undefined,
    });
  }

  if (lastSale) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="max-w-sm w-full text-center animate-scale-in">
          {/* Icon */}
          <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-200 dark:shadow-green-900/20">
            <CheckCircle className="text-green-500" size={48} />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">¡Venta exitosa!</h2>
          <p className="text-sm text-gray-400 mb-5">
            Factura <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{lastSale.invoiceNumber}</span>
          </p>

          {/* Amount card */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-5 mb-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold mb-1">Total cobrado</p>
            <p className="text-4xl font-bold text-gray-900 dark:text-white">{formatCurrency(lastSale.total)}</p>
            {lastSale.changeAmount > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Cambio</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(lastSale.changeAmount)}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <Printer size={16} /> Imprimir ticket
            </button>
            <button
              type="button"
              onClick={() => setLastSale(null)}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
            >
              Nueva venta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col lg:flex-row gap-4 lg:h-full lg:max-h-[calc(100vh-120px)]">
      {/* Left: Product Search */}
      <div className="flex-1 flex flex-col gap-4 lg:overflow-hidden">
        {/* Search + category tabs + grid */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre, código o código de barras..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategoryFilter('')}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                !categoryFilter ? 'bg-amber-400 text-gray-900' : 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300',
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
                  'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  categoryFilter === c.id ? 'bg-amber-400 text-gray-900' : 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="mt-3 max-h-72 overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex flex-col rounded-xl p-2.5 bg-gray-50 dark:bg-gray-700/40">
                    <div className="skeleton aspect-square w-full rounded-lg mb-2" />
                    <div className="skeleton h-3.5 w-3/4 mb-1.5" />
                    <div className="skeleton h-3 w-full mb-1.5" />
                    <div className="skeleton h-4 w-1/2 rounded-full" />
                  </div>
                ))}
              </div>
            ) : productsData?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
                <Package size={36} className="opacity-25" />
                <p className="text-sm">{search ? `Sin resultados para "${search}"` : 'No hay productos disponibles'}</p>
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="text-xs text-blue-500 hover:underline">
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
                      className="flex flex-col bg-gray-50 dark:bg-gray-700/40 rounded-xl p-2.5 text-left hover:ring-2 hover:ring-blue-400 transition"
                    >
                      <div className="aspect-square w-full rounded-lg overflow-hidden bg-white dark:bg-gray-800 mb-2 flex items-center justify-center">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package size={26} className="text-gray-300 dark:text-gray-500" />
                        )}
                      </div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{formatCurrency(p.salePrice)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.name}</p>
                      <span className={cn(
                        'mt-1.5 inline-block w-fit text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                        lowStock ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700',
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

        {/* Cart Items */}
        <div className="lg:flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <ShoppingBag size={18} className="text-blue-500" />
              Carrito ({items.length})
            </h3>
            {items.length > 0 && (
              <button type="button" onClick={clear} className="text-xs text-red-500 hover:underline">Limpiar</button>
            )}
          </div>

          <div className="max-h-72 lg:max-h-none lg:flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <ShoppingBag size={40} className="opacity-30" />
                <p className="text-sm">Busca y agrega productos</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-left px-4 py-2 font-medium">Producto</th>
                    <th className="text-center px-2 py-2 font-medium w-24">Cant.</th>
                    <th className="text-right px-2 py-2 font-medium w-16">Desc%</th>
                    <th className="text-right px-4 py-2 font-medium">Total</th>
                    <th className="w-8 sr-only">Eliminar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {items.map((item) => (
                    <tr key={item.productId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-800 dark:text-white truncate max-w-[180px]">{item.name}</p>
                        <p className="text-xs text-gray-400">{item.code}</p>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            aria-label="Disminuir cantidad"
                            onClick={() => updateQty(item.productId, item.quantity - 1)}
                            className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition"
                          >
                            <Minus size={12} />
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
                            className="w-10 text-center text-sm font-mono border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          />
                          <button
                            type="button"
                            aria-label="Aumentar cantidad"
                            onClick={() => updateQty(item.productId, item.quantity + 1)}
                            className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <input
                            type="number"
                            aria-label="Descuento %"
                            min={0}
                            max={100}
                            value={item.discountPct}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              updateDiscount(item.productId, isNaN(v) ? 0 : Math.min(100, Math.max(0, v)));
                            }}
                            className="w-10 text-right text-xs border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-800 dark:text-white">
                        {formatCurrency(item.total)}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          aria-label="Eliminar producto"
                          onClick={() => removeItem(item.productId)}
                          className="text-gray-300 hover:text-red-500 transition"
                        >
                          <Trash2 size={14} />
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

      {/* Right: Summary & Payment */}
      <div className="w-full lg:w-72 flex flex-col gap-4">
        {/* Customer */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
            <User size={12} /> Cliente (opcional)
          </p>
          {customerId ? (
            <div>
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
                  {customersData?.find((c: any) => c.id === customerId)?.name ?? customerSearch}
                </span>
                <button type="button" aria-label="Quitar cliente"
                  onClick={() => { setCustomer(null); setCustomerSearch(''); setShowCustomerList(false); setShowCreditPayment(false); setSelectedCreditId(null); setCreditPayAmount(''); }}
                  className="text-blue-400 hover:text-red-500 ml-2 flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
              {(selectedCustomer?.currentDebt ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCreditPayment(true)}
                  className="mt-1.5 w-full text-xs px-3 py-1.5 bg-orange-50 border border-orange-200 dark:bg-orange-900/20 dark:border-orange-700 rounded-lg text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition flex items-center justify-between"
                >
                  <span className="flex items-center gap-1"><CreditCard size={11} /> Deuda: {formatCurrency(selectedCustomer.currentDebt)}</span>
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
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              {showCustomerList && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                  <button type="button" onMouseDown={() => { setCustomer(null); setCustomerSearch(''); setShowCustomerList(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700">
                    Mostrador (sin cliente)
                  </button>
                  {customersData?.length === 0 && customerSearch && (
                    <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
                  )}
                  {customersData?.map((c: any) => (
                    <button key={c.id} type="button"
                      onMouseDown={() => { setCustomer(c.id); setCustomerSearch(c.name); setShowCustomerList(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-gray-700 transition">
                      <span className="font-medium text-gray-800 dark:text-white">{c.name}</span>
                      {c.currentDebt > 0 && (
                        <span className="ml-2 text-xs text-red-500">Deuda: {formatCurrency(c.currentDebt)}</span>
                      )}
                    </button>
                  ))}
                  <button type="button"
                    onMouseDown={(e) => { e.preventDefault(); setShowCustomerList(false); setShowCreateCustomer(true); }}
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700">
                    <Plus size={13} /> Crear cliente nuevo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800 dark:text-white">Resumen</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {taxes > 0 && (
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Impuestos</span><span>{formatCurrency(taxes)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Descuento</span><span>-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-gray-900 dark:text-white border-t border-gray-100 dark:border-gray-700 pt-2">
              <span>Total</span><span className="text-blue-600">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Payment */}
        {showPayment ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 dark:text-white">Cobrar</h3>
              <button type="button" aria-label="Cerrar cobro" onClick={() => { setShowPayment(false); setSaleError(''); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>

            {saleError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">No se pudo registrar la venta</p>
                  <p className="mt-0.5">{saleError}</p>
                </div>
                <button type="button" aria-label="Cerrar mensaje de error" onClick={() => setSaleError('')} className="text-red-400 hover:text-red-600 flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Método de pago</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`text-xs py-2 px-2 rounded-lg border transition font-medium ${
                      paymentMethod === m
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {paymentMethodLabel[m]}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'MIXED' ? (
              <div className="space-y-2">
                {/* Add split row */}
                <div className="flex gap-1.5">
                  <select
                    aria-label="Método de pago"
                    value={splitMethod}
                    onChange={(e) => setSplitMethod(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
                    className="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    aria-label="Agregar pago"
                    onClick={addSplitPayment}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition flex-shrink-0"
                  >
                    +
                  </button>
                </div>

                {/* Payment list */}
                {mixedPayments.length > 0 && (
                  <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                    {mixedPayments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-b-0">
                        <span className="text-xs text-gray-600">{paymentMethodLabel[p.method]}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{formatCurrency(p.amount)}</span>
                          <button type="button" aria-label="Quitar pago" onClick={() => removeSplitPayment(i)} className="text-gray-300 hover:text-red-500 transition">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 bg-white border-t border-gray-200">
                      <span className="text-xs font-semibold text-gray-700">Total registrado</span>
                      <span className={`text-sm font-bold ${mixedTotal >= total ? 'text-green-600' : 'text-orange-500'}`}>
                        {formatCurrency(mixedTotal)}
                        {mixedTotal >= total ? ' ✓' : ` (falta ${formatCurrency(mixedRemaining)})`}
                      </span>
                    </div>
                  </div>
                )}

                {mixedTotal > total && (
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-green-600">Cambio</p>
                    <p className="font-bold text-green-700 text-lg">{formatCurrency(mixedTotal - total)}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Monto recibido</label>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={formatCurrency(total)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {/* Quick denomination chips */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[5000, 10000, 20000, 50000, 100000, 200000]
                      .filter((d) => d >= total)
                      .slice(0, 4)
                      .concat(total % 1 === 0 ? [] : [])
                      .map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setPaidAmount(String(d))}
                          className="px-2 py-0.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
                        >
                          ${(d / 1000).toFixed(0)}k
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setPaidAmount(String(Math.ceil(total)))}
                      className="px-2 py-0.5 text-xs rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
                    >
                      Exacto
                    </button>
                  </div>
                </div>

                {parseFloat(paidAmount) > 0 && (
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-green-600">Cambio</p>
                    <p className="font-bold text-green-700 text-lg">{formatCurrency(change)}</p>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Observaciones (opcional)</label>
              <input
                type="text"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                placeholder="Ej: cliente pagó con transferencia..."
                maxLength={200}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {isFree ? (
              <button
                type="button"
                onClick={openUpgrade}
                className="flex items-center gap-2 text-xs text-amber-600 hover:text-amber-700 transition-colors"
              >
                <Zap size={13} className="fill-amber-500 text-amber-500" />
                Fiado / Crédito — Solo Plan Pro
              </button>
            ) : (
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} className="rounded" />
                Fiado / Crédito
              </label>
            )}

            <button
              type="button"
              onClick={handleSale}
              disabled={saleMutation.isPending || (paymentMethod === 'MIXED' && mixedTotal < total && !isCredit)}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              {saleMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              {saleMutation.isPending ? 'Procesando...' : 'Confirmar venta'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => items.length > 0 ? setShowPayment(true) : toast.error('Agrega productos primero')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-2 text-base"
          >
            <DollarSign size={20} />
            Cobrar {total > 0 ? formatCurrency(total) : ''}
          </button>
        )}
      </div>
    </div>

    {/* Credit payment modal */}
    {showCreditPayment && customerId && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={() => { setShowCreditPayment(false); setSelectedCreditId(null); setCreditPayAmount(''); }}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <CreditCard size={18} className="text-orange-500" /> Registrar abono
            </h2>
            <button type="button" aria-label="Cerrar"
              onClick={() => { setShowCreditPayment(false); setSelectedCreditId(null); setCreditPayAmount(''); }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Customer debt summary */}
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg px-4 py-2.5 flex justify-between items-center">
              <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
                {customersData?.find((c: any) => c.id === customerId)?.name ?? customerSearch}
              </span>
              <span className="text-sm font-bold text-orange-700 dark:text-orange-400">
                Deuda: {formatCurrency(selectedCustomer?.currentDebt || 0)}
              </span>
            </div>

            {/* Credits list */}
            {loadingCredits ? (
              <div className="flex justify-center py-6"><Loader2 size={22} className="animate-spin text-gray-400" /></div>
            ) : !customerCredits?.length ? (
              <p className="text-sm text-gray-400 text-center py-4">No hay créditos pendientes</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Selecciona el crédito a abonar</p>
                {customerCredits.map((credit: any) => (
                  <button key={credit.id} type="button"
                    onClick={() => { setSelectedCreditId(credit.id); setCreditPayAmount(String(credit.balance)); }}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${
                      selectedCreditId === credit.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-white">
                          {credit.sale?.invoiceNumber || 'Crédito directo'}
                        </p>
                        {credit.dueDate && (
                          <p className="text-xs text-gray-400">Vence: {formatDate(credit.dueDate)}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-600">Saldo: {formatCurrency(credit.balance)}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor(credit.status)}`}>
                          {statusLabel(credit.status)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Amount + method (only when a credit is selected) */}
            {selectedCreditId && (
              <>
                <div>
                  <label htmlFor="creditPayAmount" className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Monto del abono *</label>
                  <input
                    id="creditPayAmount"
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={creditPayAmount}
                    onChange={(e) => setCreditPayAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block">Método de pago</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['CASH', 'NEQUI', 'DAVIPLATA', 'TRANSFER', 'CARD'] as const).map((m) => (
                      <button key={m} type="button"
                        onClick={() => setCreditPayMethod(m)}
                        className={`text-xs py-1.5 px-1 rounded-lg border transition font-medium ${
                          creditPayMethod === m
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                        }`}>
                        {paymentMethodLabel[m]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button type="button"
                onClick={() => { setShowCreditPayment(false); setSelectedCreditId(null); setCreditPayAmount(''); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                Cancelar
              </button>
              <button type="button"
                onClick={handleCreditPayment}
                disabled={!selectedCreditId || !creditPayAmount || parseFloat(creditPayAmount) <= 0 || creditPaymentMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition">
                {creditPaymentMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Registrar abono
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Inline customer creation modal */}
    {showCreateCustomer && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        onClick={() => { setShowCreateCustomer(false); setNewCustName(''); setNewCustPhone(''); setNewCustDoc(''); setNewCustAddress(''); }}>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-3"
          onClick={(e) => e.stopPropagation()}>
          <h3 className="font-semibold text-gray-800 dark:text-white">Crear cliente</h3>
          <input type="text" placeholder="Nombre completo *" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} autoFocus
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Cédula / NIT" value={newCustDoc} onChange={(e) => setNewCustDoc(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
            <input type="tel" placeholder="Celular / WhatsApp" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
          </div>
          <input type="text" placeholder="Dirección (opcional)" value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
          <div className="flex gap-2 pt-1">
            <button type="button"
              onClick={() => { setShowCreateCustomer(false); setNewCustName(''); setNewCustPhone(''); setNewCustDoc(''); setNewCustAddress(''); }}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button type="button"
              onClick={() => newCustName.trim() && createCustomerMutation.mutate({ name: newCustName.trim(), phone: newCustPhone.trim() || undefined, document: newCustDoc.trim() || undefined, address: newCustAddress.trim() || undefined })}
              disabled={!newCustName.trim() || createCustomerMutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {createCustomerMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
