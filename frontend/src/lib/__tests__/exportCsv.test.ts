import { describe, it, expect, beforeEach, vi } from 'vitest';
import { downloadCsv } from '../exportCsv';

// jsdom no implementa createObjectURL: se mockea para poder inspeccionar el Blob
// que se le pasa (es el archivo que termina descargando el usuario).
let blobs: Blob[] = [];
let clicks: HTMLAnchorElement[] = [];

beforeEach(() => {
  blobs = [];
  clicks = [];
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:fake'; });
  URL.revokeObjectURL = vi.fn();
  // Capturar el <a> que dispara la descarga sin navegar de verdad.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push(this);
  });
});

const contenido = async () => (await blobs[0].text());

// Los bytes crudos del archivo: leer como texto descarta el BOM, y el BOM es
// justo lo que hace que Excel abra bien las tildes.
const bytes = (blob: Blob) => new Promise<Uint8Array>((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => resolve(new Uint8Array(lector.result as ArrayBuffer));
  lector.onerror = () => reject(lector.error);
  lector.readAsArrayBuffer(blob);
});

describe('downloadCsv', () => {
  it('escribe encabezados y filas separados por punto y coma', async () => {
    downloadCsv('ventas', ['Fecha', 'Total'], [['2026-08-15', 19900]]);
    const csv = await contenido();
    expect(csv).toContain('Fecha;Total');
    expect(csv).toContain('2026-08-15;19900');
  });

  it('separa las filas con CRLF (lo que Excel espera)', async () => {
    downloadCsv('ventas', ['A'], [['1'], ['2']]);
    expect(await contenido()).toContain('A\r\n1\r\n2');
  });

  it('empieza con BOM UTF-8 para que Excel no dañe las tildes ni la ñ', async () => {
    downloadCsv('ventas', ['Descripción'], [['Ñame señor']]);
    expect(Array.from((await bytes(blobs[0])).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(await contenido()).toContain('Ñame señor');
  });

  it('entrecomilla los campos que traen punto y coma', async () => {
    // Sin esto, un nombre con ";" partiría la fila en dos columnas.
    downloadCsv('x', ['Producto'], [['Camisa; talla M']]);
    expect(await contenido()).toContain('"Camisa; talla M"');
  });

  it('duplica las comillas dentro de un campo', async () => {
    downloadCsv('x', ['Producto'], [['Camisa "premium"']]);
    expect(await contenido()).toContain('"Camisa ""premium"""');
  });

  it('entrecomilla los campos con saltos de línea', async () => {
    downloadCsv('x', ['Nota'], [['linea1\nlinea2']]);
    expect(await contenido()).toContain('"linea1\nlinea2"');
  });

  it('deja los montos como números, sin formato, para que Excel los sume', async () => {
    downloadCsv('x', ['Total'], [[1234567]]);
    const csv = await contenido();
    expect(csv).toContain('1234567');
    expect(csv).not.toContain('1.234.567');
  });

  it('escribe vacío donde no hay dato, en vez de "null" o "undefined"', async () => {
    downloadCsv('x', ['A', 'B', 'C'], [[null as never, undefined as never, 'ok']]);
    expect(await contenido()).toContain('\r\n;;ok');
  });

  it('agrega la extensión .csv solo si falta', () => {
    downloadCsv('ventas', ['A'], []);
    expect(clicks[0].download).toBe('ventas.csv');

    downloadCsv('ventas.csv', ['A'], []);
    expect(clicks[1].download).toBe('ventas.csv');
  });

  it('exporta el archivo como CSV en UTF-8', () => {
    downloadCsv('x', ['A'], []);
    expect(blobs[0].type).toBe('text/csv;charset=utf-8;');
  });

  it('libera la URL y no deja el enlace pegado en el documento', () => {
    downloadCsv('x', ['A'], [['1']]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('exporta el encabezado aunque no haya filas', async () => {
    downloadCsv('x', ['Fecha', 'Total'], []);
    expect(await contenido()).toContain('Fecha;Total');
  });
});
