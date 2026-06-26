import { api } from './api';
import toast from 'react-hot-toast';

export async function downloadExcel(
  endpoint: 'sales' | 'purchases' | 'expenses',
  startDate: string,
  endDate: string,
) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const toastId = toast.loading('Generando Excel...');
  try {
    const res = await api.get(`/exports/${endpoint}?${params}`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${endpoint}-${startDate || 'inicio'}-${endDate || 'hoy'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Descargado', { id: toastId });
  } catch {
    toast.error('Error al exportar', { id: toastId });
  }
}
