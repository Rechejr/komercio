'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Trash2, HelpCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'danger' | 'warning' | 'default';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  variant?: Variant;
}

const icons: Record<Variant, React.ReactNode> = {
  danger:  <Trash2 size={20} className="text-red-600" />,
  warning: <AlertTriangle size={20} className="text-amber-600" />,
  default: <HelpCircle size={20} className="text-emerald-600" />,
};

const iconBg: Record<Variant, string> = {
  danger:  'bg-red-100 dark:bg-red-900/30',
  warning: 'bg-amber-100 dark:bg-amber-900/30',
  default: 'bg-emerald-100 dark:bg-emerald-900/30',
};

const confirmBtn: Record<Variant, string> = {
  danger:  'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500',
  warning: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500',
  default: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500',
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  loading = false,
  variant = 'danger',
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
            'bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-modal w-full max-w-sm p-0',
            'animate-scale-in',
          )}
          onEscapeKeyDown={() => !loading && onOpenChange(false)}
          onPointerDownOutside={() => !loading && onOpenChange(false)}
        >
          <div className="px-6 py-5">
            <div className="flex items-start gap-4">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', iconBg[variant])}>
                {icons[variant]}
              </div>
              <div className="flex-1 min-w-0">
                <Dialog.Title className="font-bold text-slate-800 dark:text-white leading-snug">
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {description}
                  </Dialog.Description>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 px-6 pb-5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white',
                'disabled:opacity-60 flex items-center justify-center gap-2 transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                confirmBtn[variant],
              )}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}