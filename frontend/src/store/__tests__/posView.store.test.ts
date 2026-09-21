import { describe, it, expect, beforeEach } from 'vitest';
import { usePosViewStore } from '../posView.store';

// Cómo ve el catálogo quien vende: con fotos, compacto o solo la lista del
// carrito. Lo que importa proteger: que la preferencia vieja (el interruptor
// de fotos) siga funcionando, y que `showImages` nunca se desincronice del modo,
// porque las tarjetas se pintan con ese atajo.

const store = () => usePosViewStore.getState();

beforeEach(() => {
  usePosViewStore.setState({ mode: 'fotos', showImages: true });
});

describe('modos de vista del POS', () => {
  it('arranca con fotos, como se veía siempre', () => {
    expect(store().mode).toBe('fotos');
    expect(store().showImages).toBe(true);
  });

  it('compacto apaga las fotos', () => {
    store().setMode('compacto');
    expect(store().mode).toBe('compacto');
    expect(store().showImages).toBe(false);
  });

  it('solo lista también apaga las fotos (no hay tarjetas que pintar)', () => {
    store().setMode('lista');
    expect(store().mode).toBe('lista');
    expect(store().showImages).toBe(false);
  });

  it('volver a fotos las prende', () => {
    store().setMode('lista');
    store().setMode('fotos');
    expect(store().showImages).toBe(true);
  });
});

describe('compatibilidad con el interruptor anterior', () => {
  it('toggleImages alterna entre fotos y compacto', () => {
    store().toggleImages();
    expect(store().mode).toBe('compacto');
    store().toggleImages();
    expect(store().mode).toBe('fotos');
  });

  it('desde solo lista, el interruptor lleva a fotos (estaban apagadas)', () => {
    store().setMode('lista');
    store().toggleImages();
    expect(store().mode).toBe('fotos');
    expect(store().showImages).toBe(true);
  });

  it('setShowImages sigue funcionando y deja el modo coherente', () => {
    store().setShowImages(false);
    expect(store().mode).toBe('compacto');
    store().setShowImages(true);
    expect(store().mode).toBe('fotos');
  });
});

describe('migración de la preferencia guardada', () => {
  // Quien ya había apagado las fotos con la versión anterior del POS no debe
  // ver que se le prenden solas al actualizar.
  const migrar = (usePosViewStore.persist.getOptions().migrate as (p: unknown, v: number) => { mode: string; showImages: boolean });

  it('showImages=false de la versión vieja pasa a compacto', () => {
    expect(migrar({ showImages: false }, 0)).toEqual({ mode: 'compacto', showImages: false });
  });

  it('showImages=true pasa a fotos', () => {
    expect(migrar({ showImages: true }, 0)).toEqual({ mode: 'fotos', showImages: true });
  });

  it('sin nada guardado, fotos', () => {
    expect(migrar(undefined, 0)).toEqual({ mode: 'fotos', showImages: true });
  });

  it('un estado ya nuevo se respeta y solo se recalcula showImages', () => {
    expect(migrar({ mode: 'lista', showImages: true }, 1)).toEqual({ mode: 'lista', showImages: false });
  });
});
