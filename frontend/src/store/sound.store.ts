import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SoundStore {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
}

export const useSoundStore = create<SoundStore>()(
  persist(
    (set) => ({
      enabled: true,
      toggle:     () => set((s) => ({ enabled: !s.enabled })),
      setEnabled: (v) => set({ enabled: v }),
    }),
    { name: 'ventrix-sound', storage: createJSONStorage(() => localStorage) },
  ),
);
