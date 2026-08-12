import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PriceList = 'retail' | 'wholesale';

export interface CartItem {
  productId: string;
  // Variante (ropa): cuando el producto maneja tallas/colores. La identidad de la
  // línea es productVariantId ?? productId, así dos variantes del mismo producto
  // (M-Navy y L-Navy) son líneas separadas.
  productVariantId?: string;
  variantLabel?: string; // ej. "M · Navy" (solo para mostrar)
  name: string;
  code: string;
  // Ambos precios del producto se guardan por línea para poder cambiar de lista
  // (detal ↔ mayorista) sin volver a consultar el catálogo. `unitPrice` es el
  // precio EFECTIVO según la lista activa (lo que se cobra y se muestra).
  salePrice: number;
  wholesalePrice: number | null;
  unitPrice: number;
  quantity: number;
  discountPct: number;
  taxRate: number;
  subtotal: number;
  total: number;
}

/** Identidad de línea del carrito: la variante si existe, si no el producto. */
export const lineKey = (i: { productId: string; productVariantId?: string }) => i.productVariantId || i.productId;

interface CartState {
  items: CartItem[];
  customerId: string | null;
  discount: number;
  priceList: PriceList;
  addItem: (item: Omit<CartItem, 'subtotal' | 'total' | 'unitPrice'>) => void;
  updateQty: (key: string, qty: number) => void;
  updateDiscount: (key: string, pct: number) => void;
  removeItem: (key: string) => void;
  setCustomer: (id: string | null) => void;
  setGlobalDiscount: (amount: number) => void;
  setPriceList: (list: PriceList) => void;
  clear: () => void;
  totals: () => { subtotal: number; taxes: number; discount: number; total: number };
}

// Precio efectivo según la lista: mayorista si hay y está activa, si no el de venta.
// Tolera líneas viejas persistidas en sessionStorage (sin salePrice) cayendo a su
// unitPrice previo, para no romper un carrito abierto durante un deploy.
function effectivePrice(item: { salePrice?: number; wholesalePrice?: number | null; unitPrice?: number }, list: PriceList): number {
  const retail = item.salePrice ?? item.unitPrice ?? 0;
  if (list === 'wholesale' && item.wholesalePrice != null && item.wholesalePrice > 0) return item.wholesalePrice;
  return retail;
}

function calcItem(item: Omit<CartItem, 'subtotal' | 'total' | 'unitPrice'>, list: PriceList): CartItem {
  const unitPrice = effectivePrice(item, list);
  const sub = unitPrice * item.quantity;
  const discounted = sub * (1 - item.discountPct / 100);
  const tax = discounted * (item.taxRate / 100);
  return { ...item, unitPrice, subtotal: discounted, total: discounted + tax };
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      customerId: null,
      discount: 0,
      priceList: 'retail',

      addItem(item) {
        const key = lineKey(item);
        const list = get().priceList;
        set((state) => {
          const existing = state.items.find((i) => lineKey(i) === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                lineKey(i) === key
                  ? calcItem({ ...i, quantity: i.quantity + item.quantity }, list)
                  : i,
              ),
            };
          }
          return { items: [...state.items, calcItem(item, list)] };
        });
      },

      updateQty(key, qty) {
        if (qty <= 0) {
          get().removeItem(key);
          return;
        }
        const list = get().priceList;
        set((state) => ({
          items: state.items.map((i) => lineKey(i) === key ? calcItem({ ...i, quantity: qty }, list) : i),
        }));
      },

      updateDiscount(key, pct) {
        const list = get().priceList;
        set((state) => ({
          items: state.items.map((i) => lineKey(i) === key ? calcItem({ ...i, discountPct: pct }, list) : i),
        }));
      },

      removeItem(key) {
        set((state) => ({ items: state.items.filter((i) => lineKey(i) !== key) }));
      },

      setCustomer(customerId) { set({ customerId }); },
      setGlobalDiscount(discount) { set({ discount }); },

      // Cambiar de lista de precios recalcula TODAS las líneas del carrito con el
      // precio efectivo de la nueva lista (mayorista → detal o viceversa).
      setPriceList(priceList) {
        set((state) => ({
          priceList,
          items: state.items.map((i) => calcItem(i, priceList)),
        }));
      },

      clear() { set({ items: [], customerId: null, discount: 0, priceList: 'retail' }); },

      totals() {
        const { items, discount } = get();
        const subtotal = items.reduce((a, i) => a + i.subtotal, 0);
        const taxes = items.reduce((a, i) => a + (i.total - i.subtotal), 0);
        return { subtotal, taxes, discount, total: subtotal + taxes - discount };
      },
    }),
    {
      name: 'ventrix-pos-cart',
      storage: createJSONStorage(() => sessionStorage),
      // Functions aren't serializable — only persist the cart data itself
      partialize: (state) => ({ items: state.items, customerId: state.customerId, discount: state.discount, priceList: state.priceList }),
    },
  ),
);
