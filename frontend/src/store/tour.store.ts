import { create } from 'zustand';

export interface TourStep {
  // Valor de data-tour del elemento a resaltar (en el sidebar).
  target: string;
  title: string;
  body: string;
}

interface TourState {
  active: boolean;
  index: number;
  steps: TourStep[];
  start: (steps: TourStep[]) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
}

// Estado del recorrido guiado (tour). Lo disparan la bienvenida y el Centro de
// Ayuda; lo pinta TourOverlay (montado en el layout).
export const useTourStore = create<TourState>((set, get) => ({
  active: false,
  index: 0,
  steps: [],
  start: (steps) => set({ active: true, index: 0, steps }),
  next: () => {
    const { index, steps } = get();
    if (index < steps.length - 1) set({ index: index + 1 });
    else set({ active: false });
  },
  prev: () => {
    const { index } = get();
    if (index > 0) set({ index: index - 1 });
  },
  stop: () => set({ active: false }),
}));
