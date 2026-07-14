-- Índice compuesto para el patrón de consulta real de Ventas/Reportes/Dashboard:
-- filtrar por bodega + estado + rango de fechas al mismo tiempo (ej. "ventas
-- COMPLETED de esta bodega en este rango"). Los índices existentes cubren cada
-- combinación por separado pero no las tres juntas.
CREATE INDEX "sales_branchId_status_createdAt_idx" ON "sales"("branchId", "status", "createdAt");
