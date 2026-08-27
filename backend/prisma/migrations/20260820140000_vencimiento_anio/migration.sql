-- El vencimiento pasa a saber de que año de calendario es.
--
-- Por que: los periodos mensuales se llaman "Enero", "Febrero"... sin año. Con
-- la llave unica [cliente, obligacion, periodo], al sembrar el calendario del
-- año siguiente el "Enero" nuevo chocaria con el viejo. Y como la agenda se
-- genera con skipDuplicates, NO daria error: se saltaria en silencio y el
-- cliente se quedaria sin ese vencimiento hasta que se le pasara la fecha.
--
-- Las filas que ya existen son todas del calendario 2026, el unico sembrado
-- hasta hoy: se rellenan con ese valor y despues se quita el default, para que
-- el codigo tenga que decir siempre a que año pertenece lo que crea.
ALTER TABLE "vencimientos" ADD COLUMN "anio" INTEGER NOT NULL DEFAULT 2026;
ALTER TABLE "vencimientos" ALTER COLUMN "anio" DROP DEFAULT;

-- La llave unica ahora incluye el año: "Enero" de 2026 y "Enero" de 2027 pueden
-- convivir en el mismo cliente. Es mas permisiva que la anterior, asi que
-- ninguna fila existente puede quedar en conflicto.
DROP INDEX "vencimientos_taxClientId_obligacion_periodo_key";
CREATE UNIQUE INDEX "vencimientos_taxClientId_obligacion_periodo_anio_key"
  ON "vencimientos"("taxClientId", "obligacion", "periodo", "anio");
