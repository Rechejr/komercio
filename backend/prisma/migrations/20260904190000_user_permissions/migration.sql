-- Permisos por usuario: marcas que pisan lo que trae el rol, solo para esa
-- persona. null = el usuario usa exactamente los permisos de su rol, que es
-- como venia funcionando todo hasta ahora.
ALTER TABLE "users" ADD COLUMN "permissions" JSONB;
