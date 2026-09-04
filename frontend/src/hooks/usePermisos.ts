'use client';

import { useAuthStore } from '@/store/auth.store';

/**
 * Qué puede hacer el usuario que tiene la sesión abierta.
 *
 *   const puede = usePermisos();
 *   {puede('ventas.anular') && <button>Anular</button>}
 *
 * Es solo para la pantalla: esconde lo que la persona no puede usar, para que no
 * choque contra un "no tienes permisos". Quien decide de verdad es el servidor,
 * que revisa el permiso en cada llamada (backend/src/middlewares/permissions.ts).
 */
export function usePermisos() {
  const user = useAuthStore((s) => s.user);

  return (llave: string): boolean => {
    if (!user) return false;
    // El dueño y el super admin no se filtran por permisos.
    if (user.isOwner || user.role === 'SUPER_ADMIN') return true;
    // Sesión vieja, guardada antes de que existieran los permisos: se deja pasar
    // y el servidor decide. Si no, alguien que ya estaba adentro vería el menú
    // vacío hasta volver a entrar.
    if (!user.permissions) return true;
    return user.permissions.includes(llave);
  };
}
