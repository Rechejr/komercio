import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  code: string;
  unitPrice: number;
  quantity: number;
  discountPct: number;
  taxRate: number;
  subtotal: number;
  total: number;
}

interface CartState {
  items: CartItem[];
  customerId: string | null;
  discount: number;
  addItem: (item: Omit<CartItem, 'subtotal' | 'total'>) => void;
  updateQty: (productId: string, qty: number) => void;
  updateDiscount: (productId: string, pct: number) => void;
  removeItem: (productId: string) => void;
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

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customerId: null,
  discount: 0,

  addItem(item) {
    set((state) => {
      const existing = state.items.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === item.productId
              ? calcItem({ ...i, quantity: i.quantity + item.quantity })
              : i,
          ),
        };
      }
      return { items: [...state.items, calcItem(item)] };
    });
  },

  updateQty(productId, qty) {
    if (qty <= 0) {
      get().removeItem(productId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) => i.productId === productId ? calcItem({ ...i, quantity: qty }) : i),
    }));
  },

  updateDiscount(productId, pct) {
    set((state) => ({
      items: state.items.map((i) => i.productId === productId ? calcItem({ ...i, discountPct: pct }) : i),
    }));
  },

  removeItem(productId) {
    set((state) => ({ items: state.items.filter((i) => i.productId !== productId) }));
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
}));
