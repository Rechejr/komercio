'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useCartStore, lineKey } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { useUpgradeStore } from '@/store/upgrade.store';
import { usePosViewStore } from '@/store/posView.store';
import { formatCurrency, formatDate, statusColor, statusLabel, cn } from '@/lib/utils';
import { calcularDescuentoGlobal, calcularCambio, faltantePorPagar, sumarPagos, puedeConfirmarVenta, montoPagado } from '@/lib/pos';
import { usePaymentAccounts, labelPago } from '@/lib/usePaymentAccounts';
import { armarPlan, proximoMesISO, MAX_CUOTAS } from '@/lib/cuotas';
import { EASE, DUR } from '@/lib/motion';
import { useSound } from '@/lib/useSound';
import toast from 'react-hot-toast';
import {
  Search, Plus, Minus, Trash2, User,
  DollarSign, Printer, X, Loader2, ShoppingBag, CheckCircle,
  Zap, Package, AlertCircle, CreditCard,
  GlassWater, Milk, Leaf, Wheat, ShoppingBasket,
  Beef, Sparkles, Cpu, Shirt, Wrench, Pen, Pill,
  Heart, Droplets, Cookie, Baby, ScanLine, type LucideIcon,
  Image as ImageIcon, ImageOff,
} from 'lucide-react';
import { Receipt, type ReceiptItem } from '@/components/Receipt';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { shareSaleViaWhatsApp } from '@/lib/receiptShare';
import { PosFirstSaleHint } from '@/components/onboarding/PosFirstSaleHint';

// ── Category color + icon palette (alineado con guía de estilo Ventrix) ──────
const CAT_MAP: Record<string, { rgb: string; color: string; icon: LucideIcon }> = {
  bebidas:     { rgb: '59 123 255',  color: '#3B7BFF', icon: GlassWater   },
  lacteos:     { rgb: '20 184 166',  color: '#14B8A6', icon: Milk         },
  lácteos:     { rgb: '20 184 166',  color: '#14B8A6', icon: Milk         },
  snacks:      { rgb: '245 158 11',  color: '#F59E0B', icon: Cookie       },
  aseo:        { rgb: '139 92 246',  color: '#8B5CF6', icon: Sparkles     },
  limpieza:    { rgb: '139 92 246',  color: '#8B5CF6', icon: Droplets     },
  abarrotes:   { rgb: '34 197 94',   color: '#22C55E', icon: ShoppingBasket },
  carnes:      { rgb: '239 68 68',   color: '#EF4444', icon: Beef         },
  frutas:      { rgb: '132 204 22',  color: '#84CC16', icon: Leaf         },
  verduras:    { rgb: '132 204 22',  color: '#84CC16', icon: Leaf         },
  panaderia:   { rgb: '249 115 22',  color: '#F97316', icon: Wheat        },
  panadería:   { rgb: '249 115 22',  color: '#F97316', icon: Wheat        },
  dulces:      { rgb: '236 72 153',  color: '#EC4899', icon: Heart        },
  confiteria:  { rgb: '236 72 153',  color: '#EC4899', icon: Heart        },
  tecnologia:  { rgb: '6 182 212',   color: '#06B6D4', icon: Cpu          },
  electronica: { rgb: '6 182 212',   color: '#06B6D4', icon: Cpu          },
  ropa:        { rgb: '139 92 246',  color: '#8B5CF6', icon: Shirt        },
  ferreteria:  { rgb: '100 116 139', color: '#64748B', icon: Wrench       },
  ferretería:  { rgb: '100 116 139', color: '#64748B', icon: Wrench       },
  papeleria:   { rgb: '59 123 255',  color: '#3B7BFF', icon: Pen          },
  papelería:   { rgb: '59 123 255',  color: '#3B7BFF', icon: Pen          },
  drogueria:   { rgb: '34 197 94',   color: '#22C55E', icon: Pill         },
  farmacia:    { rgb: '34 197 94',   color: '#22C55E', icon: Pill         },
  bebe:        { rgb: '236 72 153',  color: '#EC4899', icon: Baby         },
  bebé:        { rgb: '236 72 153',  color: '#EC4899', icon: Baby         },
};
const HASH_PALETTE = [
  { rgb: '59 123 255',  color: '#3B7BFF' }, { rgb: '139 92 246',  color: '#8B5CF6' },
  { rgb: '34 197 94',   color: '#22C55E' }, { rgb: '245 158 11',  color: '#F59E0B' },
  { rgb: '239 68 68',   color: '#EF4444' }, { rgb: '6 182 212',   color: '#06B6D4' },
  { rgb: '132 204 22',  color: '#84CC16' }, { rgb: '236 72 153',  color: '#EC4899' },
];
function catStyle(name: string | undefined): { rgb: string; color: string; icon: LucideIcon } {
  if (!name) return { rgb: '100 116 139', color: '#64748B', icon: Package };
  const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (CAT_MAP[key]) return CAT_MAP[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = key.charCodeAt(i) + ((h << 5) - h);
  return { ...HASH_PALETTE[Math.abs(h) % HASH_PALETTE.length], icon: Package };
}

// ── Shared input style ────────────────────────────────────────────────────────
// text-[16px] en móvil evita el zoom automático de iOS Safari (< 16 px dispara zoom)
const inputCls = [
  'w-full px-3.5 py-2.5 text-[16px] sm:text-[13px] rounded-xl border transition-all duration-150',
  'bg-slate-50 dark:bg-slate-800/60',
  'border-slate-200 dark:border-slate-700/60',
  'text-slate-900 dark:text-slate-100',
  'placeholder:text-slate-400 dark:placeholder:text-slate-500',
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 dark:focus:border-emerald-400',
].join(' ');

export default function POSPage() {
  const qc = useQueryClient();
  const { items, addItem, updateQty, updateDiscount, removeItem, clear, totals, customerId, setCustomer, setGlobalDiscount, priceList, setPriceList } = useCartStore();
  const plan       = useAuthStore((s) => s.user?.plan);
  const cashierName = useAuthStore((s) => s.user?.name);
  const branchId   = useAuthStore((s) => s.user?.branchId);
  const isFree     = !plan || plan === 'free';
  const openUpgrade = useUpgradeStore((s) => s.open);
  const { play }   = useSound();

  const [search, setSearch]                   = useState('');
  const [showScanner, setShowScanner]         = useState(false);
  // Ver los productos con foto o solo con el nombre. Es preferencia de quien
  // vende y se recuerda en su navegador (ver posView.store.ts).
  const showImages = usePosViewStore((st) => st.showImages);
  const toggleImages = usePosViewStore((st) => st.toggleImages);
  const [categoryFilter, setCategoryFilter]   = useState('');
  const [customerSearch, setCustomerSearch]   = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [showPayment, setShowPayment]         = useState(false);
  const [paymentMethod, setPaymentMethod]     = useState('CASH');
  const [paidAmount, setPaidAmount]           = useState('');
  const [isCredit, setIsCredit]               = useState(false);
  // Plazo del fiado. Se elige con atajos (15/30 días) porque en el mostrador
  // nadie abre un calendario con el cliente esperando. Vacío = sin plazo.
  const [creditDueDate, setCreditDueDate]     = useState('');
  // Venta a cuotas: 0 = fiado simple (una sola fecha). >1 arma el plan.
  const [numCuotas, setNumCuotas]             = useState(0);
  const [tasaInteres, setTasaInteres]         = useState('');
  const [primeraCuota, setPrimeraCuota]       = useState('');
  // Montos editados a mano; vacío = reparto parejo que propone el sistema.
  const [montosCuotas, setMontosCuotas]       = useState<number[]>([]);
  const [lastSale, setLastSale]               = useState<any>(null);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const receiptItemsRef = useRef<ReceiptItem[]>([]);
  const [saleError, setSaleError]             = useState('');
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustName, setNewCustName]         = useState('');
  const [newCustPhone, setNewCustPhone]       = useState('');
  const [newCustDoc, setNewCustDoc]           = useState('');
  const [newCustAddress, setNewCustAddress]   = useState('');
  const [mixedPayments, setMixedPayments]     = useState<Array<{ method: string; amount: number; paymentAccountId?: string; name?: string }>>([]);
  const [splitMethod, setSplitMethod]         = useState('CASH');
  const [splitAmount, setSplitAmount]         = useState('');
  const [saleNotes, setSaleNotes]             = useState('');
  // Descuento global sobre el total: el cajero escribe un monto ($) o un % y el
  // sistema calcula el valor a descontar (además del DESC% por línea).
  const [discMode, setDiscMode]               = useState<'amount' | 'pct'>('amount');
  const [discInput, setDiscInput]             = useState('');
  const [showCreditPayment, setShowCreditPayment] = useState(false);
  const [selectedCreditId, setSelectedCreditId]   = useState<string | null>(null);
  const [creditPayAmount, setCreditPayAmount] = useState('');
  const [creditPayMethod, setCreditPayMethod] = useState('CASH');
  // Selector de talla/color al vender un producto de ropa.
  const [variantPicker, setVariantPicker] = useState<{ product: any; variants: any[] } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Medios de pago configurables. paymentMethod/splitMethod/creditPayMethod pasan a
  // guardar el ID del medio (o 'MIXED' para el pago mixto).
  const { active: paymentAccounts, all: allAccounts } = usePaymentAccounts();
  const selectedAccount = paymentAccounts.find((a) => a.id === paymentMethod);
  const isCashSelected = selectedAccount?.type === 'CASH';

  // Al cargar los medios, fijar un valor válido por defecto (el estado inicial
  // 'CASH' no es un id de medio). Solo corrige si la selección no es válida.
  useEffect(() => {
    if (paymentAccounts.length === 0) return;
    const firstId = paymentAccounts[0].id;
    if (paymentMethod !== 'MIXED' && !paymentAccounts.some((a) => a.id === paymentMethod)) setPaymentMethod(firstId);
    if (!paymentAccounts.some((a) => a.id === splitMethod)) setSplitMethod(firstId);
    if (!paymentAccounts.some((a) => a.id === creditPayMethod)) setCreditPayMethod(firstId);
  }, [paymentAccounts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focalizar el buscador solo en escritorio al montar (en móvil evita teclado automático)
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) {
      searchRef.current?.focus();
    }
  }, []);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
  });

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products-pos', search, categoryFilter, branchId],
    // branchId: el stock que se muestra (y el que se valida al cobrar) es el de
    // ESTA bodega del cajero, no el total del negocio — así la etiqueta nunca
    // promete algo que Inventario ve en otra bodega. Un dueño sin bodega fija
    // sigue viendo el total, como Inventario.
    queryFn: () => api.get(
      `/products?search=${encodeURIComponent(search)}&limit=40&isActive=true${categoryFilter ? `&categoryId=${categoryFilter}` : ''}${branchId ? `&branchId=${branchId}` : ''}`,
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

  const { data: businessInfo } = useQuery({
    queryKey: ['business-me'],
    queryFn: () => api.get('/business/me').then((r) => r.data.data),
    staleTime: 5 * 60_000,
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
    creditPaymentMutation.mutate({ creditId: selectedCreditId, amount: parseFloat(creditPayAmount), paymentAccountId: creditPayMethod });
  }

  const saleMutation = useMutation({
    mutationFn: (saleData: any) => api.post('/sales', saleData).then((r) => r.data.data),
    onSuccess: (sale) => {
      play('sale');
      // Snapshot cart items BEFORE clear() so the receipt has product names
      receiptItemsRef.current = items.map((i) => ({
        name: i.variantLabel ? `${i.name} (${i.variantLabel})` : i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountPct: i.discountPct,
        total: i.unitPrice * i.quantity * (1 - i.discountPct / 100),
      }));
      setSaleError('');
      setLastSale(sale);
      clear();
      setShowPayment(false);
      setSearch('');
      setMixedPayments([]);
      setSplitAmount('');
      setSplitMethod(paymentAccounts[0]?.id || '');
      setSaleNotes('');
      setPaidAmount('');
      setDiscInput('');
      // El plazo es de ESTA venta: si se quedara puesto, la siguiente heredaría
      // una fecha que nadie acordó con ese otro cliente.
      setCreditDueDate('');
      setNumCuotas(0);
      setTasaInteres('');
      setPrimeraCuota('');
      setMontosCuotas([]);
      toast.success('¡Venta registrada!');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-pos'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['credits'] });
      // Refresca el onboarding para disparar la celebración de la primera venta.
      qc.invalidateQueries({ queryKey: ['onboarding'] });
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

  // Calcula el descuento global desde el campo (monto o %) y lo sincroniza con el
  // carrito. Se recalcula si cambia el campo, el modo, o la base (subtotal+imp).
  useEffect(() => {
    setGlobalDiscount(calcularDescuentoGlobal(discInput, discMode, subtotal + taxes));
  }, [discInput, discMode, subtotal, taxes, setGlobalDiscount]);

  const change         = calcularCambio(paidAmount, total);
  const mixedTotal     = sumarPagos(mixedPayments);
  const mixedRemaining = faltantePorPagar(total, mixedTotal);

  function addSplitPayment() {
    const amount = parseFloat(splitAmount);
    if (!amount || amount <= 0) return;
    const acct = paymentAccounts.find((a) => a.id === splitMethod);
    const newPayments = [...mixedPayments, {
      // method (enum) alimenta la validación y el cálculo de caja del backend;
      // paymentAccountId + name se guardan para mostrar el medio real.
      method: (acct?.legacyEnum || 'TRANSFER') as string,
      amount,
      paymentAccountId: acct?.id,
      name: acct?.name,
    }];
    setMixedPayments(newPayments);
    const newTotal = newPayments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, total - newTotal);
    setSplitAmount(remaining > 0 ? String(Math.round(remaining)) : '');
  }

  function removeSplitPayment(index: number) {
    setMixedPayments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAddProduct(product: any) {
    // Producto de ropa → abrir el selector de talla/color (carga las variantes).
    if (product.hasVariants) {
      try {
        const full = (await api.get(`/products/${product.id}`)).data.data;
        setVariantPicker({ product: full, variants: full.variants || [] });
      } catch { toast.error('No se pudieron cargar las variantes'); }
      setSearch('');
      return;
    }
    const cartQty = items.find((i) => i.productId === product.id && !i.productVariantId)?.quantity ?? 0;
    if (product.stock <= cartQty && !product.allowNegativeStock) {
      play('error');
      toast.error(`"${product.name}" sin stock suficiente (${product.stock} disponibles)`);
      return;
    }
    play('add');
    addItem({
      productId: product.id, name: product.name, code: product.code,
      salePrice: product.salePrice, wholesalePrice: product.wholesalePrice ?? null,
      quantity: 1, discountPct: 0, taxRate: product.taxRate || 0,
    });
    setSearch('');
    // Solo refocalizar en escritorio — en móvil abre el teclado de forma inesperada
    if (window.matchMedia('(pointer: fine)').matches) {
      searchRef.current?.focus();
    }
  }

  // Agrega al carrito la talla/color elegida (línea propia por variante).
  function pickVariant(product: any, variant: any) {
    const vStock = (variant.stocks || []).reduce((s: number, x: any) => s + Number(x.stock), 0);
    const inCart = items.find((i) => i.productVariantId === variant.id)?.quantity ?? 0;
    if (vStock <= inCart && !product.allowNegativeStock) {
      play('error');
      toast.error(`Sin stock de esa talla/color (${vStock} disponibles)`);
      return;
    }
    play('add');
    addItem({
      productId: product.id, productVariantId: variant.id,
      variantLabel: [variant.talla, variant.color].filter(Boolean).join(' · '),
      name: product.name, code: product.code,
      salePrice: product.salePrice, wholesalePrice: product.wholesalePrice ?? null,
      quantity: 1, discountPct: 0, taxRate: product.taxRate || 0,
    });
    setVariantPicker(null);
  }

  function handleSale() {
    setSaleError('');
    if (items.length === 0) { toast.error('Agrega productos'); return; }
    if (isCredit && !customerId) { toast.error('Selecciona un cliente para registrar un fiado'); return; }
    if (paymentMethod === 'MIXED' && mixedPayments.length === 0) { toast.error('Agrega al menos un método de pago'); return; }
    const paid = montoPagado({ paymentMethod, paidAmount, total, mixedTotal, isCredit });
    saleMutation.mutate({
      customerId: customerId || undefined,
      items: items.map((i) => ({ productId: i.productId, productVariantId: i.productVariantId, quantity: i.quantity, discountPct: i.discountPct })),
      // Pago simple → paymentAccountId (el backend deriva el enum). MIXTO conserva
      // el flujo por splits (paymentMethod='MIXED').
      ...(paymentMethod === 'MIXED'
        ? { paymentMethod: 'MIXED', paymentDetails: { splits: mixedPayments } }
        : { paymentAccountId: paymentMethod }),
      paidAmount: paid,
      discountAmount: discount, isCredit, priceList,
      ...(isCredit && numCuotas < 2 && creditDueDate ? { creditDueDate } : {}),
      ...(isCredit && numCuotas >= 2 ? {
        creditInstallments: numCuotas,
        creditInterestRate: Number(tasaInteres) || 0,
        creditFirstDueDate: primeraCuota || proximoMesISO(),
        // Solo se mandan si el vendedor los ajustó; si no, el servidor reparte.
        ...(montosCuotas.length === numCuotas ? { creditInstallmentAmounts: montosCuotas } : {}),
      } : {}),
      notes: saleNotes.trim() || undefined,
    });
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (lastSale) {
    return (
      <AnimatePresence>
        <motion.div
          key="success-screen"
          className="flex flex-col items-center py-6 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DUR.sm, ease: EASE.spring }}
        >
          {/* Receipt */}
          <motion.div
            className="w-full max-w-sm shadow-xl rounded-2xl overflow-hidden border border-slate-100 dark:border-white/[0.06] mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE.spring }}
          >
            <Receipt
              invoiceNumber={lastSale.invoiceNumber}
              createdAt={lastSale.createdAt || new Date()}
              items={receiptItemsRef.current}
              subtotal={Number(lastSale.subtotal)}
              discountAmount={Number(lastSale.discountAmount)}
              taxAmount={Number(lastSale.taxAmount)}
              total={Number(lastSale.total)}
              paidAmount={Number(lastSale.paidAmount)}
              changeAmount={Number(lastSale.changeAmount)}
              paymentMethod={lastSale.paymentMethod}
              paymentLabel={labelPago(allAccounts, lastSale.paymentAccountId, lastSale.paymentMethod)}
              customerName={selectedCustomer?.name || null}
              cashierName={cashierName || null}
              business={businessInfo}
              animated={true}
            />
          </motion.div>

          {/* Action bar — hidden when printing */}
          <motion.div
            className="print-hide w-full max-w-sm flex items-center justify-between"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: DUR.md, ease: EASE.spring }}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20">
                <CheckCircle className="text-emerald-500" size={14} />
              </div>
              <span className="text-[14px] font-semibold text-slate-800 dark:text-white">¡Venta registrada!</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Printer size={14} /> Imprimir
              </button>
              <button
                type="button"
                disabled={sharingWhatsApp}
                onClick={async () => {
                  setSharingWhatsApp(true);
                  try {
                    await shareSaleViaWhatsApp(lastSale.invoiceNumber, selectedCustomer?.phone);
                  } finally {
                    setSharingWhatsApp(false);
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl text-[13px] font-medium transition-colors disabled:opacity-60"
              >
                {sharingWhatsApp ? <Loader2 size={14} className="animate-spin" /> : <WhatsAppIcon />} WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setLastSale(null)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 transition-colors"
              >
                Nueva venta
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <>
    <div className="flex flex-col lg:flex-row lg:items-start gap-4">

      {/* ── Left: Products + Cart ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <PosFirstSaleHint />

        {/* Search + categories + grid */}
        <div className="card p-4">
          {/* Search */}
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto por nombre, código o código de barras..."
                className={cn(inputCls, 'pl-9')}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              title="Escanear código de barras"
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm shadow-emerald-600/20"
            >
              <ScanLine size={16} />
            </button>
          </div>

          {showScanner && (
            <BarcodeScanner
              onScan={async (code) => {
                play('scan');
                setShowScanner(false);
                // Si el código coincide EXACTO con un solo producto, se agrega
                // directo al carrito (sin el clic extra). Si hay 0 o varias
                // coincidencias, se muestra en el buscador para elegir a mano.
                try {
                  const res = await api.get(
                    `/products?search=${encodeURIComponent(code)}&limit=8&isActive=true${branchId ? `&branchId=${branchId}` : ''}`,
                  );
                  const exact = (res.data.data as any[]).filter((p) => p.barcode === code || p.code === code);
                  if (exact.length === 1) {
                    handleAddProduct(exact[0]);
                    setSearch('');
                    return;
                  }
                } catch { /* si la búsqueda falla, cae al comportamiento normal */ }
                setSearch(code);
                setTimeout(() => searchRef.current?.focus(), 100);
              }}
              onClose={() => setShowScanner(false)}
            />
          )}

          {/* Category chips + cómo se ven los productos */}
          <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setCategoryFilter('')}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150',
                !categoryFilter
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25'
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
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25'
                    : 'border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

            {/* Con foto o sin foto. Sin foto caben casi el triple de productos,
                que es lo que quiere quien se sabe el catálogo de memoria. */}
            <span className="hidden sm:inline text-[12px] font-medium text-slate-500 dark:text-slate-400 flex-shrink-0 select-none">
              Fotos
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showImages ? 'true' : 'false'}
              aria-label={showImages ? 'Ocultar las fotos de los productos' : 'Mostrar las fotos de los productos'}
              title={showImages ? 'Ocultar fotos — se ven más productos' : 'Mostrar fotos de los productos'}
              onClick={toggleImages}
              className={cn(
                'relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40',
                showImages ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700',
              )}
            >
              <span className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 flex items-center justify-center',
                showImages ? 'translate-x-5' : 'translate-x-0',
              )}>
                {showImages
                  ? <ImageIcon size={10} className="text-emerald-500" />
                  : <ImageOff size={10} className="text-slate-400" />}
              </span>
            </button>
          </div>

          {/* Product grid */}
          <div className="mt-3 max-h-[272px] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className={cn(
                'grid gap-2.5',
                showImages
                  ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6'
                  : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8',
              )}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex flex-col rounded-2xl overflow-hidden">
                    {showImages && <div className="skeleton aspect-[16/10] w-full" />}
                    <div className="p-2.5 bg-slate-800/40 space-y-1.5">
                      <div className="skeleton h-3 w-3/4 rounded" />
                      <div className="skeleton h-4 w-1/2 rounded" />
                      <div className="skeleton h-3 w-2/3 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : productsData?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400 dark:text-slate-600">
                <Package size={32} strokeWidth={1.5} />
                <p className="text-[13px]">{search ? `Sin resultados para "${search}"` : 'No hay productos disponibles'}</p>
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="text-[12px] text-emerald-500 hover:underline">
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            ) : (
              <div className={cn(
                'grid gap-2.5',
                showImages
                  ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6'
                  : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8',
              )}>
                {productsData?.map((p: any) => {
                  const cs      = catStyle(p.category?.name);
                  const CatIcon = cs.icon;
                  const outOfStock  = p.stock <= 0 && !p.allowNegativeStock;
                  const lowStock    = p.minStock > 0 && p.stock > 0 && p.stock <= p.minStock;
                  const hasWholesale = p.wholesalePrice != null && p.wholesalePrice > 0;
                  const effPrice    = priceList === 'wholesale' && hasWholesale ? p.wholesalePrice : p.salePrice;

                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      onClick={() => handleAddProduct(p)}
                      disabled={outOfStock}
                      whileTap={outOfStock ? undefined : { scale: 0.93 }}
                      transition={{ duration: DUR.xs, ease: EASE.spring }}
                      className={cn(
                        'flex flex-col rounded-2xl overflow-hidden text-left transition-all duration-150',
                        'border-2',
                        outOfStock
                          ? 'opacity-50 cursor-not-allowed border-transparent'
                          : 'border-transparent hover:border-emerald-500 hover:scale-[1.02] hover:shadow-lg hover:shadow-emerald-500/20',
                      )}
                    >
                      {/* ── Header: image or category color ── */}
                      {showImages ? (
                      <div className="relative w-full aspect-[16/10] overflow-hidden">
                        {p.image ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
                          </>
                        ) : (
                          <div
                            className="cat-tile w-full h-full flex items-center justify-center"
                            style={{ '--cat-rgb': cs.rgb } as React.CSSProperties}
                          >
                            <CatIcon size={26} style={{ color: cs.color }} className="opacity-75" />
                          </div>
                        )}
                        {/* Category badge */}
                        {p.category?.name && (
                          <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-white/90 leading-tight">
                            {p.category.name}
                          </span>
                        )}
                      </div>
                      ) : (
                        // Sin foto queda una franja con el color de la categoría:
                        // ocupa 4 px y conserva la pista de color para ubicar el
                        // producto de un vistazo.
                        <div className="h-1 w-full flex-shrink-0" style={{ backgroundColor: cs.color }} />
                      )}

                      {/* ── Info ── */}
                      <div className={cn(
                        'pos-card-body px-2.5 pt-2 pb-2.5 flex flex-col gap-1.5',
                        !showImages && 'border border-t-0 border-slate-200/60 dark:border-white/[0.06] rounded-b-2xl',
                      )}>
                        <p className={cn(
                          'text-[12px] font-semibold text-[rgb(var(--text-primary))] leading-tight line-clamp-2',
                          showImages && 'min-h-[2.2em]',
                        )}>
                          {p.name}
                        </p>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[15px] font-black text-[rgb(var(--text-primary))] tabular-nums leading-none flex items-center gap-1">
                            {formatCurrency(effPrice)}
                            {priceList === 'wholesale' && hasWholesale && (
                              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 leading-none uppercase">May.</span>
                            )}
                          </span>
                          {!outOfStock && (
                            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                              <Plus size={13} className="text-white" strokeWidth={2.5} />
                            </div>
                          )}
                        </div>
                        <span className={cn(
                          'inline-flex items-center gap-1 w-fit text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-tight',
                          outOfStock ? 'bg-red-500/15 text-red-400'
                            : lowStock ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-emerald-500/15 text-emerald-400',
                        )}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-current" />
                          {outOfStock ? 'Agotado' : lowStock ? `¡Bajo! ${p.stock}` : `${p.stock} disponibles`}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart items */}
        <div className="card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <ShoppingBag size={15} className="text-emerald-500" />
              Carrito
              {items.length > 0 && (
                <span className="bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold px-1.5 py-0.5 rounded-md">
                  {items.length}
                </span>
              )}
            </h3>
            {items.length > 0 && (
              <button type="button" onClick={() => { clear(); setDiscInput(''); }} className="text-[12px] text-red-500 hover:text-red-700 hover:underline transition-colors">
                Limpiar
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto lg:max-h-none lg:overflow-visible scrollbar-thin">
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
                    <tr key={lineKey(item)} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[180px]">{item.name}</p>
                        {item.variantLabel && <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{item.variantLabel}</p>}
                        <p className="text-[11px] text-slate-400">{item.code}</p>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            aria-label="Disminuir cantidad"
                            onClick={() => updateQty(lineKey(item), item.quantity - 1)}
                            className="w-6 h-6 rounded-md border border-slate-200 dark:border-slate-700/60 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Minus size={11} />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            aria-label="Cantidad"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              if (!isNaN(v) && v > 0) updateQty(lineKey(item), v);
                            }}
                            className="w-10 text-center text-[16px] sm:text-[13px] font-mono border border-slate-200 dark:border-slate-700/60 rounded-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:bg-slate-800 dark:text-white"
                          />
                          <button
                            type="button"
                            aria-label="Aumentar cantidad"
                            onClick={() => updateQty(lineKey(item), item.quantity + 1)}
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
                            inputMode="numeric"
                            aria-label="Descuento %"
                            min={0} max={100}
                            value={item.discountPct}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              updateDiscount(lineKey(item), isNaN(v) ? 0 : Math.min(100, Math.max(0, v)));
                            }}
                            className="w-10 text-right text-[16px] sm:text-[12px] border border-slate-200 dark:border-slate-700/60 rounded-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:bg-slate-800 dark:text-white"
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
                          onClick={() => removeItem(lineKey(item))}
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
      <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-3 lg:sticky lg:top-0 lg:self-start">

        {/* Customer */}
        <div className="card p-4">
          <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
            <User size={12} /> Cliente (opcional)
          </p>
          {customerId ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl px-3 py-2">
                <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                  {customersData?.find((c: any) => c.id === customerId)?.name ?? customerSearch}
                </span>
                <button
                  type="button"
                  aria-label="Quitar cliente"
                  onClick={() => { setCustomer(null); setCustomerSearch(''); setShowCustomerList(false); setShowCreditPayment(false); setSelectedCreditId(null); setCreditPayAmount(''); }}
                  className="text-emerald-400 hover:text-red-500 ml-2 flex-shrink-0 transition-colors"
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
                      className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-emerald-50 dark:hover:bg-white/[0.04] transition-colors"
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
                    className="w-full flex items-center gap-1.5 px-3 py-2.5 text-[13px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-white/[0.04] border-t border-slate-100 dark:border-white/[0.06] transition-colors"
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
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Resumen</h3>
            {/* Lista de precios: detal ↔ mayorista para toda la venta */}
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setPriceList('retail')}
                className={cn('px-2.5 py-1 rounded-md text-[11px] font-semibold transition', priceList === 'retail' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}
              >
                Detal
              </button>
              <button
                type="button"
                onClick={() => setPriceList('wholesale')}
                className={cn('px-2.5 py-1 rounded-md text-[11px] font-semibold transition', priceList === 'wholesale' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}
              >
                Mayorista
              </button>
            </div>
          </div>
          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal</span><span className="tabular">{formatCurrency(subtotal)}</span>
            </div>
            {taxes > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Impuestos</span><span className="tabular">{formatCurrency(taxes)}</span>
              </div>
            )}
            {/* Casilla de descuento global (monto $ o %) */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-slate-600 dark:text-slate-400">Descuento</span>
              <div className="flex items-center gap-1.5">
                <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                  <button type="button" onClick={() => setDiscMode('amount')} className={cn('px-2 py-0.5 rounded text-[11px] font-bold transition', discMode === 'amount' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400')}>$</button>
                  <button type="button" onClick={() => setDiscMode('pct')} className={cn('px-2 py-0.5 rounded text-[11px] font-bold transition', discMode === 'pct' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400')}>%</button>
                </div>
                <input
                  value={discInput}
                  onChange={(e) => setDiscInput(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-20 text-right px-2 py-1 rounded-lg text-[13px] tabular bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                />
              </div>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Descuento aplicado</span><span className="tabular">-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[18px] text-slate-900 dark:text-white border-t border-slate-100 dark:border-white/[0.06] pt-2.5 mt-1">
              <span>Total</span>
              <motion.span
                key={total}
                animate={{ scale: total > 0 ? [1, 1.05, 1] : 1 }}
                transition={{ duration: 0.3, ease: EASE.spring }}
                className="text-emerald-600 dark:text-emerald-400 tabular"
              >
                {formatCurrency(total)}
              </motion.span>
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
                {[...paymentAccounts.map((a) => ({ value: a.id, label: a.name })), { value: 'MIXED', label: 'Mixto' }].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPaymentMethod(opt.value)}
                    className={cn(
                      'text-[12px] py-2 px-2 rounded-xl border font-semibold transition-all duration-150',
                      paymentMethod === opt.value
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    )}
                  >
                    {opt.label}
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
                    className="flex-1 min-w-0 px-2 py-2 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[16px] sm:text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-slate-50 dark:bg-slate-800/60 dark:text-white"
                  >
                    {paymentAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSplitPayment()}
                    placeholder={mixedRemaining > 0 ? String(Math.round(mixedRemaining)) : '0'}
                    className="w-24 px-2 py-2 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[16px] sm:text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    aria-label="Agregar pago"
                    onClick={addSplitPayment}
                    className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-[13px] font-bold hover:bg-emerald-700 transition-colors flex-shrink-0"
                  >
                    +
                  </button>
                </div>
                {mixedPayments.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl overflow-hidden border border-slate-100 dark:border-white/[0.06]">
                    {mixedPayments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-white/[0.04] last:border-b-0">
                        <span className="text-[12px] text-slate-600 dark:text-slate-400">{p.name || labelPago(allAccounts, p.paymentAccountId, p.method)}</span>
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
                    inputMode="decimal"
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
                          className="px-2 py-0.5 text-[11px] rounded-full border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                        >
                          ${(d / 1000).toFixed(0)}k
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setPaidAmount(String(Math.ceil(total)))}
                      className="px-2 py-0.5 text-[11px] rounded-full border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                    >
                      Exacto
                    </button>
                  </div>
                </div>
                {!isCredit && parseFloat(paidAmount || '0') > 0 && parseFloat(paidAmount) < total && (
                  <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-2.5 text-center border border-amber-100 dark:border-amber-500/20">
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide">Falta</p>
                    <p className="font-bold text-amber-700 dark:text-amber-400 text-[18px] tabular">{formatCurrency(total - parseFloat(paidAmount))}</p>
                  </div>
                )}
                {isCashSelected && parseFloat(paidAmount) >= total && parseFloat(paidAmount) > 0 && (
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
                <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} className="rounded accent-emerald-600" />
                Fiado / Crédito
              </label>
            )}

            {/* Forma de pago del fiado: de una sola vez, o a cuotas mensuales. */}
            {isCredit && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5 space-y-2.5">
                <div className="flex gap-1.5">
                  <button
                    type="button" onClick={() => setNumCuotas(0)}
                    className={`flex-1 text-[12px] font-medium px-2 py-1.5 rounded-lg border transition ${
                      numCuotas < 2
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Pago único
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNumCuotas(numCuotas >= 2 ? numCuotas : 3); if (!primeraCuota) setPrimeraCuota(proximoMesISO()); }}
                    className={`flex-1 text-[12px] font-medium px-2 py-1.5 rounded-lg border transition ${
                      numCuotas >= 2
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Por cuotas
                  </button>
                </div>

                {numCuotas >= 2 && (() => {
                  const saldo = Math.max(0, Math.round(total - montoPagado({ paymentMethod, paidAmount, total, mixedTotal, isCredit })));
                  const plan = armarPlan(saldo, numCuotas, Number(tasaInteres) || 0, primeraCuota || proximoMesISO(),
                    montosCuotas.length === numCuotas ? montosCuotas : undefined);
                  const suma = plan.cuotas.reduce((s, c) => s + c.monto, 0);
                  const descuadre = suma - plan.total;
                  return (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Cuotas</label>
                          <input
                            type="number" min={2} max={MAX_CUOTAS} value={numCuotas}
                            onChange={(e) => {
                              const n = Math.max(2, Math.min(MAX_CUOTAS, Number(e.target.value) || 2));
                              setNumCuotas(n);
                              setMontosCuotas([]); // cambió el plan: se vuelve al reparto parejo
                            }}
                            className="w-full px-2 py-1.5 text-[16px] sm:text-[13px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Interés %/mes</label>
                          <input
                            type="number" min={0} max={100} step="0.1" value={tasaInteres} placeholder="0"
                            onChange={(e) => { setTasaInteres(e.target.value); setMontosCuotas([]); }}
                            className="w-full px-2 py-1.5 text-[16px] sm:text-[13px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">1ª cuota</label>
                          <input
                            type="date" value={primeraCuota || proximoMesISO()}
                            onChange={(e) => setPrimeraCuota(e.target.value)}
                            className="w-full px-2 py-1.5 text-[16px] sm:text-[12px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                        </div>
                      </div>

                      {/* Resumen: el cliente debe saber el total ANTES de firmar. */}
                      <div className="text-[12px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-2 space-y-0.5">
                        <div className="flex justify-between"><span>Saldo a financiar</span><span className="tabular-nums">{formatCurrency(saldo)}</span></div>
                        {plan.interes > 0 && (
                          <div className="flex justify-between text-amber-600 dark:text-amber-400">
                            <span>Interés ({tasaInteres}% × {numCuotas})</span>
                            <span className="tabular-nums">+{formatCurrency(plan.interes)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold pt-0.5 border-t border-slate-100 dark:border-slate-700">
                          <span>Total a pagar</span><span className="tabular-nums">{formatCurrency(plan.total)}</span>
                        </div>
                      </div>

                      {/* Cada cuota, editable. El vendedor ajusta si quiere una
                          primera más alta o redondear la última. */}
                      <div className="max-h-44 overflow-y-auto space-y-1">
                        {plan.cuotas.map((c, i) => (
                          <div key={c.numero} className="flex items-center gap-2 text-[12px]">
                            <span className="w-6 text-slate-400 tabular-nums">{c.numero}.</span>
                            <span className="flex-1 text-slate-500 dark:text-slate-400">
                              {c.fecha.toISOString().slice(8, 10)}/{c.fecha.toISOString().slice(5, 7)}/{c.fecha.getUTCFullYear()}
                            </span>
                            <input
                              type="number" min={1} value={c.monto}
                              onChange={(e) => {
                                const copia = plan.cuotas.map((x) => x.monto);
                                copia[i] = Math.max(0, Math.round(Number(e.target.value) || 0));
                                setMontosCuotas(copia);
                              }}
                              className="w-28 px-2 py-1 text-[16px] sm:text-[12px] text-right tabular-nums rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Si los montos ajustados no suman el total, se avisa aquí
                          mismo: el servidor lo rechazaría igual, pero es mejor
                          verlo antes de intentar cobrar. */}
                      {descuadre !== 0 && (
                        <p className="text-[11.5px] text-red-600 dark:text-red-400 leading-snug">
                          Las cuotas suman {formatCurrency(suma)}: {descuadre > 0 ? 'sobran' : 'faltan'}{' '}
                          {formatCurrency(Math.abs(descuadre))} para llegar a {formatCurrency(plan.total)}.
                        </p>
                      )}
                      {montosCuotas.length > 0 && (
                        <button
                          type="button" onClick={() => setMontosCuotas([])}
                          className="text-[11.5px] text-emerald-600 hover:underline"
                        >
                          Volver al reparto parejo
                        </button>
                      )}
                    </div>
                  );
                })()}

                {numCuotas < 2 && (
                  <>
                <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-2">
                  ¿Cuándo lo paga? <span className="text-slate-400 font-normal">(opcional)</span>
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { label: '15 días', dias: 15 },
                    { label: '30 días', dias: 30 },
                    { label: '45 días', dias: 45 },
                  ].map(({ label, dias }) => {
                    const f = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
                    const activo = creditDueDate === f;
                    return (
                      <button
                        key={dias} type="button"
                        onClick={() => setCreditDueDate(activo ? '' : f)}
                        className={`text-[12px] font-medium px-2.5 py-1.5 rounded-lg border transition ${
                          activo
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {creditDueDate && (
                    <button
                      type="button" onClick={() => setCreditDueDate('')}
                      className="text-[12px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1.5"
                    >
                      Sin plazo
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={creditDueDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setCreditDueDate(e.target.value)}
                  aria-label="Fecha en que el cliente pagará el fiado"
                  className="w-full px-3 py-2 text-[16px] sm:text-[13px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleSale}
              disabled={!puedeConfirmarVenta({
                paymentMethod, paidAmount, total, mixedTotal, isCredit,
                enviando: saleMutation.isPending,
              })}
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
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-[15px] shadow-sm shadow-emerald-600/25 active:scale-[0.99]"
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
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
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
                    inputMode="decimal"
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
                    {paymentAccounts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setCreditPayMethod(a.id)}
                        className={cn(
                          'text-[12px] py-1.5 px-1 rounded-xl border font-semibold transition-all duration-150',
                          creditPayMethod === a.id
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : 'border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-slate-300',
                        )}
                      >
                        {a.name}
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
    {/* Selector de talla/color (ropa) */}
    {variantPicker && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setVariantPicker(null)}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-sm max-h-[85vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">Elige talla / color</h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">{variantPicker.product.name}</p>
            </div>
            <button type="button" onClick={() => setVariantPicker(null)} className="text-slate-400 hover:text-slate-600 p-1 flex-shrink-0"><X size={18} /></button>
          </div>
          <div className="p-3 overflow-y-auto grid grid-cols-2 gap-2">
            {variantPicker.variants.map((v: any) => {
              const vStock = (v.stocks || []).reduce((s: number, x: any) => s + Number(x.stock), 0);
              const agotado = vStock <= 0 && !variantPicker.product.allowNegativeStock;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={agotado}
                  onClick={() => pickVariant(variantPicker.product, v)}
                  className={cn(
                    'text-left rounded-xl border p-3 transition',
                    agotado
                      ? 'border-slate-100 dark:border-slate-800 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 dark:border-slate-700/60 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
                  )}
                >
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{[v.talla, v.color].filter(Boolean).join(' · ')}</p>
                  <p className={cn('text-[11px] mt-0.5', vStock <= 0 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400')}>{vStock <= 0 ? 'Agotado' : `${vStock} disponibles`}</p>
                </button>
              );
            })}
            {variantPicker.variants.length === 0 && (
              <p className="col-span-2 text-center text-[13px] text-slate-400 py-6">Este producto no tiene tallas/colores configurados.</p>
            )}
          </div>
        </div>
      </div>
    )}

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
            <input type="tel" placeholder="Celular" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} maxLength={10} className={inputCls} />
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
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[13px] font-semibold disabled:opacity-50 transition-colors"
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