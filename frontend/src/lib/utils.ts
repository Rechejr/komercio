import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'COP'): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('es-CO', opts || { dateStyle: 'medium' }).format(d);
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('es-CO').format(n);
}

export function truncate(str: string, maxLen = 30): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

export function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    COMPLETED: 'text-green-600 bg-green-50',
    PENDING: 'text-yellow-600 bg-yellow-50',
    CANCELLED: 'text-red-600 bg-red-50',
    REFUNDED: 'text-purple-600 bg-purple-50',
    PAID: 'text-green-600 bg-green-50',
    OVERDUE: 'text-red-600 bg-red-50',
    PARTIAL: 'text-blue-600 bg-blue-50',
  };
  return map[status] || 'text-gray-600 bg-gray-50';
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    COMPLETED: 'Completado',
    PENDING: 'Pendiente',
    CANCELLED: 'Anulado',
    REFUNDED: 'Devuelto',
    PAID: 'Pagado',
    OVERDUE: 'Vencido',
    PARTIAL: 'Abonado',
    OPEN: 'Abierta',
    CLOSED: 'Cerrada',
  };
  return map[status] || status;
}

export const paymentMethodLabel: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  CARD: 'Tarjeta',
  MIXED: 'Mixto',
};
