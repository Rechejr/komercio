'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Bell, Check, AlertTriangle, Info, CheckCheck } from 'lucide-react';
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
      className="absolute right-0 top-12 w-80 max-h-[28rem] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 z-50 flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-sm text-gray-800 dark:text-white">Notificaciones</h3>
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
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <Bell size={28} className="mb-2 opacity-30" />
            <p className="text-xs">No tienes notificaciones</p>
          </div>
        ) : (
          notifications.map((n: any) => (
            <button
              type="button"
              key={n.id}
              onClick={() => !n.isRead && markRead.mutate(n.id)}
              className={cn(
                'w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors',
                !n.isRead && 'bg-blue-50/50 dark:bg-blue-900/10',
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                n.type === 'WARNING' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600',
              )}>
                {n.type === 'WARNING' ? <AlertTriangle size={13} /> : <Info size={13} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs leading-snug', n.isRead ? 'text-gray-600 dark:text-gray-400' : 'text-gray-800 dark:text-white font-medium')}>
                  {n.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[11px] text-gray-300 mt-1">{timeAgo(n.createdAt)}</p>
              </div>
              {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />}
              {n.isRead && <Check size={12} className="text-gray-300 flex-shrink-0 mt-1.5" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
