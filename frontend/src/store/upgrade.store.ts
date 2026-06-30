import { create } from 'zustand';

interface UpgradeStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useUpgradeStore = create<UpgradeStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
