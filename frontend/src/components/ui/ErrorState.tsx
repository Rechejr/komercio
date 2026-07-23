'use client';

import { AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { getApiErrorMessage, isNetworkError } from '@/lib/apiError';
import { cn } from '@/lib/utils';

/**
 * Banner de error para pantallas de datos.
 *
 * Existe para separar dos estados que antes se veían igual: "no hay nada que
 * mostrar" y "no pudimos cargar". Cuando una consulta fallaba, la pantalla caía
 * en el estado vacío y el POS decía "No hay productos" aunque el negocio
 * tuviera cientos — el usuario culpaba a sus datos en vez de reintentar.
 */
export function ErrorState({
  error,
  onRetry,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const offline = isNetworkError(error);
  const Icon = offline ? WifiOff : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/15',
        compact ? 'px-4 py-3' : 'px-5 py-6',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon size={compact ? 18 : 20} className="text-red-500 flex-shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <p className={cn('font-semibold text-red-800 dark:text-red-300', compact ? 'text-sm' : 'text-[15px]')}>
            No pudimos cargar los datos
          </p>
          <p className="text-sm text-red-700/90 dark:text-red-400/90 mt-0.5 leading-relaxed">
            {getApiErrorMessage(error)}
          </p>
        </div>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 flex-shrink-0 text-sm font-medium text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 bg-white dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5 transition-colors"
          >
            <RefreshCw size={14} />
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
