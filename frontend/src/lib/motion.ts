import { useEffect, useState } from 'react';

// ── Duraciones ────────────────────────────────────────────────────────────────
export const DUR = {
  xs:   0.12,
  sm:   0.18,
  md:   0.28,
  lg:   0.45,
  hero: 0.85,
} as const;

// ── Easing ────────────────────────────────────────────────────────────────────
export const EASE = {
  spring: [0.16, 1, 0.3, 1] as const,
  out:    [0.0, 0.0, 0.2, 1] as const,
} as const;

// ── Hook: true si el usuario prefiere reduced motion ──────────────────────────
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);

    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

// ── Variants reutilizables ────────────────────────────────────────────────────
export const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0 },
} as const;

export const fadeIn = {
  hidden: { opacity: 0 },
  show:   { opacity: 1 },
} as const;

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show:   { opacity: 1, scale: 1 },
} as const;

export const staggerContainer = (stagger = 0.06, delayChildren = 0) => ({
  hidden: {},
  show: {
    transition: {
      staggerChildren: stagger,
      delayChildren,
    },
  },
});
