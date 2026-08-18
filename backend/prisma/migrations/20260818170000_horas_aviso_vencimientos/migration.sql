-- Horas (0-23, hora de Colombia) en que cada oficina contable quiere sus avisos
-- de vencimientos. Por defecto 7am (panorama), 2pm (pendientes) y 6pm (cierre).
ALTER TABLE "businesses" ADD COLUMN "vencAvisoHoras" INTEGER[] NOT NULL DEFAULT ARRAY[7, 14, 18];
