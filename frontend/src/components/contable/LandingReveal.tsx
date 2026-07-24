'use client';

import { useEffect } from 'react';

/**
 * Anima los elementos .lp-reveal al entrar en viewport, igual que el landing del
 * POS. Se aísla en un componente cliente para que la página del landing pueda ser
 * un server component (y así exportar metadata para SEO). Devuelve null: solo
 * corre el efecto.
 */
export function LandingReveal() {
  useEffect(() => {
    const reveals = document.querySelectorAll<HTMLElement>('.lp-reveal');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
      },
      { threshold: 0.12 },
    );
    reveals.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
