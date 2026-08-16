import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, lineKey, type CartItem } from '../cart.store';

// Producto de ejemplo: camisa a $10.000 detal / $8.000 mayorista, sin impuesto.
type NuevoItem = Omit<CartItem, 'subtotal' | 'total' | 'unitPrice'>;

const camisa = (over: Partial<NuevoItem> = {}): NuevoItem => ({
  productId: 'p1', name: 'Camisa', code: 'CAM-01',
  salePrice: 10000, wholesalePrice: 8000,
  quantity: 1, discountPct: 0, taxRate: 0,
  ...over,
});

const store = () => useCartStore.getState();

beforeEach(() => {
  useCartStore.setState({ items: [], customerId: null, discount: 0, priceList: 'retail' });
});

describe('lineKey — identidad de la línea', () => {
  it('usa la variante cuando el producto maneja tallas/colores', () => {
    expect(lineKey({ productId: 'p1', productVariantId: 'v-m-navy' })).toBe('v-m-navy');
    expect(lineKey({ productId: 'p1' })).toBe('p1');
  });
});

describe('agregar al carrito', () => {
  it('cobra precio × cantidad', () => {
    store().addItem(camisa({ quantity: 3 }));
    const [item] = store().items;
    expect(item.unitPrice).toBe(10000);
    expect(item.total).toBe(30000);
    expect(store().totals().total).toBe(30000);
  });

  it('suma cantidades en vez de duplicar la línea del mismo producto', () => {
    store().addItem(camisa({ quantity: 2 }));
    store().addItem(camisa({ quantity: 3 }));
    expect(store().items).toHaveLength(1);
    expect(store().items[0].quantity).toBe(5);
    expect(store().totals().total).toBe(50000);
  });

  it('separa dos tallas del mismo producto en líneas distintas', () => {
    store().addItem(camisa({ productVariantId: 'v-M', variantLabel: 'M · Navy' }));
    store().addItem(camisa({ productVariantId: 'v-L', variantLabel: 'L · Navy' }));
    expect(store().items).toHaveLength(2);
    expect(store().totals().total).toBe(20000);
  });

  it('suma sobre la MISMA variante, no sobre el producto', () => {
    store().addItem(camisa({ productVariantId: 'v-M', quantity: 1 }));
    store().addItem(camisa({ productVariantId: 'v-M', quantity: 2 }));
    expect(store().items).toHaveLength(1);
    expect(store().items[0].quantity).toBe(3);
  });
});

describe('descuento por línea (DESC%)', () => {
  it('descuenta el porcentaje sobre esa línea', () => {
    store().addItem(camisa({ quantity: 2 })); // 20.000
    store().updateDiscount('p1', 10);
    expect(store().items[0].total).toBe(18000);
    expect(store().totals().total).toBe(18000);
  });

  it('un descuento del 100% deja la línea en cero, no en negativo', () => {
    store().addItem(camisa());
    store().updateDiscount('p1', 100);
    expect(store().items[0].total).toBe(0);
    expect(store().totals().total).toBe(0);
  });
});

describe('impuestos', () => {
  it('calcula el IVA sobre el valor ya descontado, no sobre el precio de lista', () => {
    // 10.000 con 19% de IVA y 10% de descuento → base 9.000, IVA 1.710.
    store().addItem(camisa({ taxRate: 19, discountPct: 10 }));
    const { subtotal, taxes, total } = store().totals();
    expect(subtotal).toBe(9000);
    expect(taxes).toBe(1710);
    expect(total).toBe(10710);
  });

  it('separa subtotal e impuestos en los totales', () => {
    store().addItem(camisa({ taxRate: 19 }));
    const { subtotal, taxes, total } = store().totals();
    expect(subtotal).toBe(10000);
    expect(taxes).toBe(1900);
    expect(total).toBe(11900);
  });
});

describe('lista de precios detal ↔ mayorista', () => {
  it('recalcula TODO el carrito al cambiar de lista', () => {
    store().addItem(camisa({ quantity: 2 }));      // 20.000 detal
    store().setPriceList('wholesale');
    expect(store().items[0].unitPrice).toBe(8000);
    expect(store().totals().total).toBe(16000);    // 2 × 8.000
    store().setPriceList('retail');
    expect(store().totals().total).toBe(20000);
  });

  it('mantiene el precio de detal si el producto no tiene precio mayorista', () => {
    store().addItem(camisa({ wholesalePrice: null }));
    store().setPriceList('wholesale');
    expect(store().items[0].unitPrice).toBe(10000);
  });

  it('ignora un precio mayorista en cero (no regala el producto)', () => {
    store().addItem(camisa({ wholesalePrice: 0 }));
    store().setPriceList('wholesale');
    expect(store().items[0].unitPrice).toBe(10000);
  });

  it('un producto agregado con la lista mayorista activa entra ya con ese precio', () => {
    store().setPriceList('wholesale');
    store().addItem(camisa());
    expect(store().items[0].unitPrice).toBe(8000);
  });

  it('conserva el descuento de línea al cambiar de lista', () => {
    store().addItem(camisa({ discountPct: 10 }));
    store().setPriceList('wholesale');
    expect(store().items[0].total).toBe(7200); // 8.000 - 10%
  });
});

describe('cantidades', () => {
  it('actualiza la cantidad y el total de la línea', () => {
    store().addItem(camisa());
    store().updateQty('p1', 4);
    expect(store().totals().total).toBe(40000);
  });

  it('quita la línea si la cantidad baja a cero o menos', () => {
    store().addItem(camisa());
    store().updateQty('p1', 0);
    expect(store().items).toHaveLength(0);

    store().addItem(camisa());
    store().updateQty('p1', -3);
    expect(store().items).toHaveLength(0);
  });

  it('elimina solo la línea indicada', () => {
    store().addItem(camisa({ productVariantId: 'v-M' }));
    store().addItem(camisa({ productVariantId: 'v-L' }));
    store().removeItem('v-M');
    expect(store().items).toHaveLength(1);
    expect(lineKey(store().items[0])).toBe('v-L');
  });
});

describe('totales de la venta', () => {
  it('resta el descuento global del total', () => {
    store().addItem(camisa({ quantity: 3 })); // 30.000
    store().setGlobalDiscount(5000);
    const { subtotal, discount, total } = store().totals();
    expect(subtotal).toBe(30000);
    expect(discount).toBe(5000);
    expect(total).toBe(25000);
  });

  it('suma varias líneas con impuestos distintos', () => {
    store().addItem(camisa({ taxRate: 19 }));                                  // 11.900
    store().addItem(camisa({ productId: 'p2', salePrice: 5000, taxRate: 0 })); // 5.000
    const { subtotal, taxes, total } = store().totals();
    expect(subtotal).toBe(15000);
    expect(taxes).toBe(1900);
    expect(total).toBe(16900);
  });

  it('un carrito vacío da todo en cero', () => {
    expect(store().totals()).toEqual({ subtotal: 0, taxes: 0, discount: 0, total: 0 });
  });
});

describe('clear', () => {
  it('deja el carrito listo para la siguiente venta', () => {
    store().addItem(camisa());
    store().setCustomer('c1');
    store().setGlobalDiscount(1000);
    store().setPriceList('wholesale');

    store().clear();

    expect(store().items).toHaveLength(0);
    expect(store().customerId).toBeNull();
    expect(store().discount).toBe(0);
    // La lista vuelve a detal: si no, la siguiente venta cobraría al por mayor.
    expect(store().priceList).toBe('retail');
  });
});

describe('carrito viejo persistido (deploy con una venta abierta)', () => {
  it('usa el unitPrice guardado si la línea no trae salePrice', () => {
    // Formato anterior en sessionStorage: sin salePrice/wholesalePrice.
    useCartStore.setState({
      items: [{
        productId: 'viejo', name: 'Producto', code: 'X',
        unitPrice: 7500, quantity: 2, discountPct: 0, taxRate: 0,
        subtotal: 15000, total: 15000,
      } as CartItem],
    });
    store().updateQty('viejo', 3);
    expect(store().items[0].unitPrice).toBe(7500);
    expect(store().totals().total).toBe(22500);
  });
});
