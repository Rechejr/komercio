import { api } from './api';
import toast from 'react-hot-toast';

const ENDPOINT_FILENAMES: Record<string, string> = {
  sales: 'ventas',
  purchases: 'compras',
  expenses: 'gastos',
  financial: 'estado-resultados',
  products: 'inventario',
};

export async function downloadExcel(
  endpoint: 'sales' | 'purchases' | 'expenses' | 'financial' | 'products',
  startDate: string,
  endDate: string,
) {
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    toast.error('La fecha de inicio no puede ser mayor a la fecha de fin');
    return;
  }

  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const toastId = toast.loading('Generando Excel...');
  try {
    const res = await api.get(`/exports/${endpoint}?${params}`, { responseType: 'blob', timeout: 120000 });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    const name = ENDPOINT_FILENAMES[endpoint] ?? endpoint;
    // El inventario no tiene rango de fechas — usa la fecha de hoy en vez de
    // los placeholders "inicio"/"hoy" (que no tendrían sentido sin rango).
    const suffix = startDate || endDate
      ? `-${startDate || 'inicio'}-${endDate || 'hoy'}`
      : `-${new Date().toISOString().split('T')[0]}`;
    a.download = `${name}${suffix}.xlsx`;
    document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); }
    URL.revokeObjectURL(url);
    toast.success('Descargado', { id: toastId });
  } catch {
    toast.error('Error al exportar. Intenta con un rango de fechas menor.', { id: toastId });
  }
}
