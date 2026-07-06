'use client';

import { useSoundStore } from '@/store/sound.store';
import { sounds } from '@/lib/sounds';

type SoundName = keyof typeof sounds;

export function useSound() {
  const enabled = useSoundStore((s) => s.enabled);

  function play(name: SoundName) {
    if (!enabled) return;
    try { sounds[name](); } catch { /* AudioContext blocked before user gesture */ }
  }

  return { play, enabled };
}
