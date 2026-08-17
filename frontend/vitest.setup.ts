import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom deja `localStorage`/`sessionStorage` como objetos vacíos (sin getItem ni
// setItem), así que cualquier store con `persist` explota al importarse. Se
// instala un Storage en memoria con la misma API del navegador.
class MemoryStorage implements Storage {
  private datos = new Map<string, string>();
  get length() { return this.datos.size; }
  clear() { this.datos.clear(); }
  getItem(k: string) { return this.datos.has(k) ? this.datos.get(k)! : null; }
  key(i: number) { return Array.from(this.datos.keys())[i] ?? null; }
  removeItem(k: string) { this.datos.delete(k); }
  setItem(k: string, v: string) { this.datos.set(k, String(v)); }
}

for (const nombre of ['localStorage', 'sessionStorage'] as const) {
  if (typeof (window as unknown as Record<string, Storage>)[nombre]?.setItem !== 'function') {
    Object.defineProperty(window, nombre, { value: new MemoryStorage(), writable: true, configurable: true });
  }
}

// Blob de jsdom no trae .text(): se implementa con FileReader para poder leer el
// contenido de los archivos que la app genera (exportaciones CSV).
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result));
      lector.onerror = () => reject(lector.error);
      lector.readAsText(this);
    });
  };
}

// jsdom no implementa estas APIs y Radix (diálogos, selects) las usa al montar.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  });
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Radix mide el scroll del body y llama a estas al abrir un diálogo.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

afterEach(() => cleanup());
