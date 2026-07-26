'use client';

import { ResponsabilidadesManuales } from '@/components/contable/ResponsabilidadesManuales';

export default function OtrasResponsabilidadesPage() {
  return (
    <ResponsabilidadesManuales
      tipo="otra"
      conceptoLabel="Actividad"
      conceptoPlaceholder="Ej. Impuesto de rodamiento, renovación cámara de comercio..."
      emptyHint="Aún no hay otras responsabilidades. Agrega la primera."
      nota="Los registros de esta sección se borran automáticamente 2 meses después de su fecha de vencimiento, para no saturar la lista."
    />
  );
}
