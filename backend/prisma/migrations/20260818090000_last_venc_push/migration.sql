-- Marca del último push-resumen de vencimientos enviado a cada oficina contable.
-- El aviso se repite a diario mientras queden obligaciones sin presentar, así que
-- hace falta saber si ya se envió hoy (un reinicio no debe volver a sonar).
ALTER TABLE "businesses" ADD COLUMN "lastVencPushAt" TIMESTAMP(3);
