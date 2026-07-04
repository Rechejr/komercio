import { api } from './api';
import toast from 'react-hot-toast';

export async function downloadExcel(
  endpoint: 'sales' | 'purchases' | 'expenses',
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
    a.download = `${endpoint}-${startDate || 'inicio'}-${endDate || 'hoy'}.xlsx`;
    document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); }
    URL.revokeObjectURL(url);
    toast.success('Descargado', { id: toastId });
  } catch {
    toast.error('Error al exportar. Intenta con un rango de fechas menor.', { id: toastId });
  }
}
