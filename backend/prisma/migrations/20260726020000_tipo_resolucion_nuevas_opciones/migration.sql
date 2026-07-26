-- El contador pidió cambiar las opciones de "Tipo" de resolución a:
-- Factura Electrónica · Documento Soporte · Otra.
-- RENAME VALUE conserva las filas existentes (se remapean por posición sin
-- perder datos). 'otra' se queda igual.
ALTER TYPE "tipo_resolucion" RENAME VALUE 'facturacion_numeracion' TO 'factura_electronica';
ALTER TYPE "tipo_resolucion" RENAME VALUE 'habilitacion_electronica' TO 'documento_soporte';
