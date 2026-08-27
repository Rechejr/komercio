-- Indice para la limpieza semanal de notificaciones por antiguedad.
-- Sin el, el borrado recorre la tabla completa, que es justamente la que crece.
CREATE INDEX "notifications_isRead_createdAt_idx" ON "notifications"("isRead", "createdAt");
