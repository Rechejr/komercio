'use client';

import { ResponsabilidadesManuales } from '@/components/contable/ResponsabilidadesManuales';

export default function ExogenaPage() {
  return (
    <ResponsabilidadesManuales
      tipo="exogena"
      conceptoLabel="Concepto"
      conceptoPlaceholder="Ej. Formatos 1001, Exógena 2025, Formato 1005..."
      emptyHint="Aún no hay registros de información exógena. Agrega el primero."
    />
  );
}
