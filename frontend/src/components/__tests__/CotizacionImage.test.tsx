import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CotizacionImage, type CotizacionData } from '../CotizacionImage';

// La cotización es un documento que sale del negocio hacia el cliente: si sale
// con un total mal sumado o sin la advertencia de que no es una factura, el
// daño ya está hecho cuando alguien lo nota. Por eso se prueba lo que se ve.

const base: CotizacionData = {
  numero: 'COT-0007',
  fecha: '12 sept 2026',
  validUntil: '30 sept 2026',
  cliente: 'Ferretería La 45',
  clienteTelefono: '3001234567',
  items: [{ name: 'Cemento gris', quantity: 3, unitPrice: 30000 }],
  subtotal: 90000,
  discountAmount: 0,
  taxAmount: 0,
  total: 90000,
  notas: null,
  negocio: { name: 'Depósito El Roble', nit: '900123456-7', phone: '6041234', address: 'Cra 45 #10-20', city: 'Medellín' },
};

const armar = (extra: Partial<CotizacionData> = {}) =>
  render(<CotizacionImage data={{ ...base, ...extra }} />);

// formatCurrency mete un espacio duro entre el $ y el número ("$ 100.000"); se
// normaliza para que la prueba hable de plata y no de espacios en blanco.
const conTexto = (esperado: string) => (_: string, el: Element | null) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim() === esperado;

describe('CotizacionImage', () => {
  it('se captura por el id que usan compartir e imprimir', () => {
    const { container } = armar();
    expect(container.querySelector('#cotizacion-content')).not.toBeNull();
  });

  it('dice COTIZACIÓN, no factura', () => {
    armar();
    expect(screen.getByText('COTIZACIÓN')).toBeInTheDocument();
    expect(screen.getByText(/no constituye una venta ni una factura/i)).toBeInTheDocument();
  });

  it('muestra el membrete del negocio', () => {
    armar();
    expect(screen.getByText('Depósito El Roble')).toBeInTheDocument();
    expect(screen.getByText('NIT: 900123456-7')).toBeInTheDocument();
    expect(screen.getByText(/Cra 45 #10-20 · Medellín/)).toBeInTheDocument();
  });

  it('prefiere la razón social sobre el nombre comercial', () => {
    armar({ negocio: { ...base.negocio!, legalName: 'Inversiones El Roble S.A.S.' } });
    expect(screen.getByText('Inversiones El Roble S.A.S.')).toBeInTheDocument();
    expect(screen.queryByText('Depósito El Roble')).not.toBeInTheDocument();
  });

  it('muestra los datos del cliente', () => {
    armar();
    expect(screen.getByText('Ferretería La 45')).toBeInTheDocument();
    expect(screen.getByText('Tel: 3001234567')).toBeInTheDocument();
  });

  it('calcula el total de la línea con descuento e IVA', () => {
    // 2 × 100.000 −10% +19% = 214.200
    armar({ items: [{ name: 'Taladro', quantity: 2, unitPrice: 100000, discountPct: 10, taxRate: 19 }] });
    expect(screen.getByText(conTexto('2 × $ 100.000 · −10% · IVA 19%'))).toBeInTheDocument();
    expect(screen.getAllByText(conTexto('$ 214.200')).length).toBeGreaterThan(0);
  });

  it('oculta descuento e IVA cuando son cero', () => {
    armar();
    expect(screen.queryByText('Descuento')).not.toBeInTheDocument();
    expect(screen.queryByText('IVA')).not.toBeInTheDocument();
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
  });

  it('avisa hasta cuándo valen los precios', () => {
    armar();
    expect(screen.getByText(/Precios válidos hasta/)).toBeInTheDocument();
    expect(screen.getByText('30 sept 2026')).toBeInTheDocument();
  });

  it('sin vigencia no inventa una fecha', () => {
    armar({ validUntil: null });
    expect(screen.queryByText(/Precios válidos hasta/)).not.toBeInTheDocument();
  });

  it('imprime las observaciones tal como se escribieron', () => {
    armar({ notas: 'Entrega en obra.\nSe paga 50% por anticipado.' });
    expect(screen.getByText(/Se paga 50% por anticipado/)).toBeInTheDocument();
  });

  it('sale sin membrete si el negocio no cargó', () => {
    const { container } = armar({ negocio: null });
    expect(container.querySelector('#cotizacion-content')).not.toBeNull();
    expect(screen.getByText('COTIZACIÓN')).toBeInTheDocument();
  });

  it('muestra la variante junto al producto', () => {
    armar({ items: [{ name: 'Camiseta', quantity: 1, unitPrice: 40000, variantLabel: 'M / Negro' }] });
    expect(screen.getByText('Camiseta (M / Negro)')).toBeInTheDocument();
  });
});
