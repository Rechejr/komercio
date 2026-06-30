'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCartStore } from '@/store/cart.store';
import { formatCurrency, paymentMethodLabel } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Search, Plus, Minus, Trash2, User,
  DollarSign, Printer, X, Loader2, ShoppingBag, CheckCircle,
} from 'lucide-react';

const PAYMENT_METHODS = ['CASH', 'NEQUI', 'DAVIPLATA', 'TRANSFER', 'CARD', 'MIXED'];

export default function POSPage() {
  const qc = useQueryClient();
  const { items, addItem, updateQty, removeItem, clear, totals, customerId, setCustomer } = useCartStore();
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [isCredit, setIsCredit] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products-pos', search],
    queryFn: () => api.get(`/products?search=${encodeURIComponent(search)}&limit=20&isActive=true`).then((r) => r.data.data),
    enabled: search.length > 0,
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () =>
      api.get(`/customers?limit=10&search=${encodeURIComponent(customerSearch)}`).then((r) => r.data.data),
    enabled: customerSearch.length > 0 || showCustomerList,
  });

  const saleMutation = useMutation({
    mutationFn: (saleData: any) => api.post('/sales', saleData).then((r) => r.data.data),
    onSuccess: (sale) => {
      setLastSale(sale);
      clear();
      setShowPayment(false);
      setSearch('');
      toast.success('¡Venta registrada!');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-pos'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['credits'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Error al procesar la venta');
    },
  });

  const { subtotal, taxes, discount, total } = totals();
  const change = Math.max(0, parseFloat(paidAmount || '0') - total);

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
    if (items.length === 0) { toast.error('Agrega productos'); return; }
    if (isCredit && !customerId) {
      toast.error('Selecciona un cliente para registrar un fiado');
      return;
    }
    saleMutation.mutate({
      customerId: customerId || undefined,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, discountPct: i.discountPct })),
      paymentMethod,
      paidAmount: isCredit ? parseFloat(paidAmount || '0') : parseFloat(paidAmount || String(total)),
      discountAmount: discount,
      isCredit,
    });
  }

  if (lastSale) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center space-y-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="text-green-500" size={40} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">¡Venta exitosa!</h2>
        <p className="text-gray-500">Factura: <span className="font-mono font-bold text-blue-600">{lastSale.invoiceNumber}</span></p>
        <p className="text-3xl font-bold text-gray-900">{formatCurrency(lastSale.total)}</p>
        {lastSale.changeAmount > 0 && (
          <p className="text-green-600 font-semibold">Cambio: {formatCurrency(lastSale.changeAmount)}</p>
        )}
        <div className="flex gap-3 justify-center pt-4">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            <Printer size={16} /> Imprimir ticket
          </button>
          <button
            type="button"
            onClick={() => setLastSale(null)}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
          >
            Nueva venta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:h-full lg:max-h-[calc(100vh-120px)]">
      {/* Left: Product Search */}
      <div className="flex-1 flex flex-col gap-4 lg:overflow-hidden">
        {/* Search */}
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

          {/* Results */}
          {search && (
            <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : productsData?.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin resultados</p>
              ) : (
                productsData?.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => handleAddProduct(p)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 transition text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.code} · Stock: {p.stock} {p.unit}</p>
                    </div>
                    <p className="text-sm font-bold text-blue-600">{formatCurrency(p.salePrice)}</p>
                  </button>
                ))
              )}
            </div>
          )}
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
                    <th className="text-right px-4 py-2 font-medium">Precio</th>
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
                          <span className="w-8 text-center text-sm font-mono">{item.quantity}</span>
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
                      <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">
                        {formatCurrency(item.unitPrice)}
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
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
                {customersData?.find((c: any) => c.id === customerId)?.name ?? customerSearch}
              </span>
              <button type="button" aria-label="Quitar cliente"
                onClick={() => { setCustomer(null); setCustomerSearch(''); setShowCustomerList(false); }}
                className="text-blue-400 hover:text-red-500 ml-2 flex-shrink-0">
                <X size={14} />
              </button>
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
              <button type="button" aria-label="Cerrar cobro" onClick={() => setShowPayment(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>

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

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Monto recibido</label>
              <input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder={formatCurrency(total)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {parseFloat(paidAmount) > 0 && (
              <div className="bg-green-50 rounded-lg p-2 text-center">
                <p className="text-xs text-green-600">Cambio</p>
                <p className="font-bold text-green-700 text-lg">{formatCurrency(change)}</p>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} className="rounded" />
              Fiado / Crédito
            </label>

            <button
              type="button"
              onClick={handleSale}
              disabled={saleMutation.isPending}
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
  );
}
