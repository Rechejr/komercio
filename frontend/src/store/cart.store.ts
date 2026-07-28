import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartItem {
  productId: string;
  // Variante (ropa): cuando el producto maneja tallas/colores. La identidad de la
  // línea es productVariantId ?? productId, así dos variantes del mismo producto
  // (M-Navy y L-Navy) son líneas separadas.
  productVariantId?: string;
  variantLabel?: string; // ej. "M · Navy" (solo para mostrar)
  name: string;
  code: string;
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
  addItem: (item: Omit<CartItem, 'subtotal' | 'total'>) => void;
  updateQty: (key: string, qty: number) => void;
  updateDiscount: (key: string, pct: number) => void;
  removeItem: (key: string) => void;
  setCustomer: (id: string | null) => void;
  setGlobalDiscount: (amount: number) => void;
  clear: () => void;
  totals: () => { subtotal: number; taxes: number; discount: number; total: number };
}

function calcItem(item: Omit<CartItem, 'subtotal' | 'total'>): CartItem {
  const sub = item.unitPrice * item.quantity;
  const discounted = sub * (1 - item.discountPct / 100);
  const tax = discounted * (item.taxRate / 100);
  return { ...item, subtotal: discounted, total: discounted + tax };
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      customerId: null,
      discount: 0,

      addItem(item) {
        const key = lineKey(item);
        set((state) => {
          const existing = state.items.find((i) => lineKey(i) === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                lineKey(i) === key
                  ? calcItem({ ...i, quantity: i.quantity + item.quantity })
                  : i,
              ),
            };
          }
          return { items: [...state.items, calcItem(item)] };
        });
      },

      updateQty(key, qty) {
        if (qty <= 0) {
          get().removeItem(key);
          return;
        }
        set((state) => ({
          items: state.items.map((i) => lineKey(i) === key ? calcItem({ ...i, quantity: qty }) : i),
        }));
      },

      updateDiscount(key, pct) {
        set((state) => ({
          items: state.items.map((i) => lineKey(i) === key ? calcItem({ ...i, discountPct: pct }) : i),
        }));
      },

      removeItem(key) {
        set((state) => ({ items: state.items.filter((i) => lineKey(i) !== key) }));
      },

      setCustomer(customerId) { set({ customerId }); },
      setGlobalDiscount(discount) { set({ discount }); },
      clear() { set({ items: [], customerId: null, discount: 0 }); },

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
      partialize: (state) => ({ items: state.items, customerId: state.customerId, discount: state.discount }),
    },
  ),
);
