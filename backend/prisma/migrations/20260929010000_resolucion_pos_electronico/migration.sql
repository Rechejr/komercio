-- Tipo de resolución "POS electrónico".
--
-- La pantalla de Resoluciones lo ofrecía en el desplegable y el validador del
-- servidor lo aceptaba, pero el enum de la base no lo tenía: al guardar, Postgres
-- rechazaba el valor y el contador veía "Error interno del servidor".
--
-- IF NOT EXISTS para que sea seguro correrla dos veces.
ALTER TYPE "tipo_resolucion" ADD VALUE IF NOT EXISTS 'pos_electronico' AFTER 'factura_electronica';
