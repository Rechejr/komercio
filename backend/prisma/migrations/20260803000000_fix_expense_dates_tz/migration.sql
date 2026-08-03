-- Corrige gastos que se guardaron a medianoche UTC: en Colombia (UTC-5) se
-- mostraban y filtraban un día ANTES del que el usuario eligió. Se desplazan
-- +5 horas para quedar a medianoche de Colombia (05:00 UTC), que es como ahora
-- los guarda el backend.
--
-- Solo toca los que están EXACTAMENTE a las 00:00:00 UTC (los que vienen del
-- formulario de fecha "YYYY-MM-DD"). Los gastos creados sin fecha tienen un
-- timestamp real (hora del día) y no se tocan. Es idempotente: tras el ajuste
-- quedan a las 05:00:00, que ya no cumple la condición, así que re-ejecutar no
-- vuelve a moverlos.
UPDATE "expenses"
SET "date" = "date" + interval '5 hours'
WHERE "date"::time = TIME '00:00:00';
