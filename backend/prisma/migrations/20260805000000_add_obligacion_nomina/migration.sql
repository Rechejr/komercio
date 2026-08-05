-- Nueva obligación: nómina electrónica (se reporta dentro de los primeros 10
-- días hábiles del mes siguiente). Ver utils/pila.ts → periodosNomina.
ALTER TYPE "obligacion" ADD VALUE 'nomina';
