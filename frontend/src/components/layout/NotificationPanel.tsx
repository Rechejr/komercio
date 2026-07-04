'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Bell, Check, AlertTriangle, Info, CheckCheck, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications?limit=15').then((r) => r.data.data),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  const notifications = data || [];

  return (
    <div
      ref={ref}
      className="absolute right-0 top-12 w-80 max-h-[28rem] bg-white dark:bg-slate-900 rounded-xl shadow-modal border border-slate-100 dark:border-white/[0.08] z-50 flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/[0.06]">
        <h3 className="font-semibold text-sm text-slate-800 dark:text-white">Notificaciones</h3>
        {notifications.some((n: any) => !n.isRead) && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <CheckCheck size={12} /> Marcar todas
          </button>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-600">
            <Bell size={28} className="mb-2 opacity-50" />
            <p className="text-xs">No tienes notificaciones</p>
          </div>
        ) : (
          notifications.map((n: any) => {
            const isLowStock = n.data?.kind === 'LOW_STOCK' && n.data?.productId;
            return (
              <button
                type="button"
                key={n.id}
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  if (isLowStock) {
                    router.push(`/inventario?productId=${n.data.productId}`);
                    onClose();
                  }
                }}
                className={cn(
                  'w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-50 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors',
                  !n.isRead && 'bg-blue-50/50 dark:bg-blue-900/10',
                  isLowStock && 'cursor-pointer',
                )}
              >
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                  n.type === 'WARNING' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
                )}>
                  {n.type === 'WARNING' ? <AlertTriangle size={13} /> : <Info size={13} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs leading-snug', n.isRead ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-white font-medium')}>
                    {n.title}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[11px] text-slate-300 dark:text-slate-600">{timeAgo(n.createdAt)}</p>
                    {isLowStock && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-0.5">
                        Ver en inventario <ArrowRight size={9} />
                      </span>
                    )}
                  </div>
                </div>
                {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />}
                {n.isRead && <Check size={12} className="text-slate-300 dark:text-slate-600 flex-shrink-0 mt-1.5" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
