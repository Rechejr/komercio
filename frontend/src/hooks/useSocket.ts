'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

let socket: Socket | null = null;

export function useSocket() {
  const { accessToken, isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const connected = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || connected.current) return;

    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      connected.current = true;
    });

    socket.on('new_sale', (data) => {
      toast.success(`Nueva venta: ${data.sale?.invoiceNumber}`);
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    });

    socket.on('inventory_updated', () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    });

    socket.on('low_stock_alert', (data) => {
      toast(`⚠️ Stock bajo: ${data.product?.name} (${data.product?.stock} uds)`, { duration: 6000 });
    });

    socket.on('payment_received', (data) => {
      toast.success('Pago de crédito recibido');
      qc.invalidateQueries({ queryKey: ['credits'] });
    });

    socket.on('disconnect', () => {
      connected.current = false;
    });

    return () => {
      socket?.disconnect();
      socket = null;
      connected.current = false;
    };
  }, [isAuthenticated, accessToken]);

  return socket;
}
