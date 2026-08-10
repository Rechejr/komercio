-- Estado del onboarding por negocio (guía de primeros pasos), cross-device.
ALTER TABLE "businesses" ADD COLUMN "onboarding" JSONB;

-- Blindaje de usuarios EXISTENTES: todo negocio ya creado al momento de migrar
-- NO es nuevo → se marca la bienvenida y el tour como vistos para que no reciban
-- el onboarding como si fueran primerizos. Los negocios creados después quedan
-- en null y sí reciben la guía.
UPDATE "businesses"
SET "onboarding" = jsonb_build_object(
  'welcomeSeenAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'tourDoneAt',    to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'legacy',        true
)
WHERE "onboarding" IS NULL;
