'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renderiza a `document.body` para sacar el contenido del árbol del DOM local.
 *
 * Un modal con `position: fixed` se ancla a la ventana SOLO si ningún ancestro
 * crea un "bloque contenedor" (transform/filter/will-change). Las páginas usan
 * wrappers con `animate-fade-up` y el contenido vive dentro de `<main overflow-auto>`;
 * cuando la página hace scroll, el modal se anclaba al contenedor scrolleado y su
 * encabezado quedaba recortado. Portalizándolo a <body> el `fixed` siempre mira a
 * la ventana. Guardamos `mounted` para no romper el render del servidor (SSR).
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
