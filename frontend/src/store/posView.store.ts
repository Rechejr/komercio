import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PosViewStore {
  /** Mostrar la foto de cada producto en la cuadrícula del POS. */
  showImages: boolean;
  toggleImages: () => void;
  setShowImages: (v: boolean) => void;
}

/**
 * Cómo quiere ver los productos QUIEN está vendiendo, no el negocio.
 *
 * En una tienda de barrio se vende por nombre y las fotos solo quitan pantalla;
 * en una de ropa o repuestos la foto es lo que identifica el producto. Y dentro
 * del mismo negocio la cajera del mostrador y quien despacha pueden preferir
 * cosas distintas. Por eso la preferencia vive en el navegador de cada quien
 * (localStorage) y no en la configuración del negocio: nadie se la cambia a otro.
 */
export const usePosViewStore = create<PosViewStore>()(
  persist(
    (set) => ({
      // Con fotos por defecto: es como se veía hasta ahora, así que a nadie le
      // cambia el POS de un día para otro sin haberlo pedido.
      showImages: true,
      toggleImages: () => set((s) => ({ showImages: !s.showImages })),
      setShowImages: (v) => set({ showImages: v }),
    }),
    { name: 'ventrix-pos-view', storage: createJSONStorage(() => localStorage) },
  ),
);
