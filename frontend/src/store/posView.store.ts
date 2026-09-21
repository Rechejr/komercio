import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Las tres formas de ver el catálogo en el POS:
 * - `fotos`:    tarjetas con foto — la de siempre.
 * - `compacto`: tarjetas sin foto — caben casi el triple.
 * - `lista`:    sin catálogo. Solo la barra de búsqueda y el carrito, que se
 *               queda con toda la pantalla. Los productos aparecen únicamente
 *               mientras se busca o se escanea, y se esconden al agregar.
 */
export type PosViewMode = 'fotos' | 'compacto' | 'lista';

interface PosViewStore {
  mode: PosViewMode;
  setMode: (m: PosViewMode) => void;
  /** Atajo que usan las tarjetas: ¿se pinta la foto? */
  showImages: boolean;
  /** Compatibilidad con el interruptor anterior: alterna entre fotos y compacto. */
  toggleImages: () => void;
  setShowImages: (v: boolean) => void;
}

/**
 * Cómo quiere ver los productos QUIEN está vendiendo, no el negocio.
 *
 * En una tienda de barrio se vende por nombre y las fotos solo quitan pantalla;
 * en una de ropa o repuestos la foto es lo que identifica el producto; y en un
 * mostrador con mucho movimiento lo que importa es ver el carrito completo, no
 * el catálogo. Dentro del mismo negocio la cajera y quien despacha pueden
 * preferir cosas distintas. Por eso la preferencia vive en el navegador de cada
 * quien (localStorage) y no en la configuración del negocio: nadie se la cambia
 * a otro.
 */
export const usePosViewStore = create<PosViewStore>()(
  persist(
    (set) => ({
      // Con fotos por defecto: es como se veía hasta ahora, así que a nadie le
      // cambia el POS de un día para otro sin haberlo pedido.
      mode: 'fotos',
      showImages: true,
      setMode: (m) => set({ mode: m, showImages: m === 'fotos' }),
      toggleImages: () => set((s) => {
        const m: PosViewMode = s.showImages ? 'compacto' : 'fotos';
        return { mode: m, showImages: m === 'fotos' };
      }),
      setShowImages: (v) => set({ mode: v ? 'fotos' : 'compacto', showImages: v }),
    }),
    {
      name: 'ventrix-pos-view',
      storage: createJSONStorage(() => localStorage),
      // Quien ya había apagado las fotos con el interruptor viejo sigue viendo
      // el POS igual: su preferencia se traduce al modo compacto.
      version: 1,
      migrate: (persisted: unknown) => {
        const viejo = (persisted ?? {}) as { showImages?: boolean; mode?: PosViewMode };
        if (viejo.mode) return { ...viejo, showImages: viejo.mode === 'fotos' };
        const mode: PosViewMode = viejo.showImages === false ? 'compacto' : 'fotos';
        return { mode, showImages: mode === 'fotos' };
      },
    },
  ),
);
