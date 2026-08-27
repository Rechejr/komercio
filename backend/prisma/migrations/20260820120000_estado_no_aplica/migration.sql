-- Nuevo estado para un vencimiento que en ese periodo no habia nada que
-- declarar. Caso tipico: retencion en la fuente en un mes sin retenciones
-- practicadas. Antes esos quedaban "pendiente" para siempre, ensuciando la
-- agenda y disparando avisos de algo que no existe.
--
-- Se decide periodo por periodo: marcar enero no afecta a febrero.
ALTER TYPE "estado_vencimiento" ADD VALUE IF NOT EXISTS 'no_aplica';
