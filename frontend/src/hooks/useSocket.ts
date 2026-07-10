'use client';

import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

// Singleton a nivel de módulo — si varios componentes montan este hook a la vez
// (layout + una página, o el doble-mount de StrictMode en dev), todos deben
// compartir la misma conexión y los mismos listeners en vez de crear una por
// instancia (antes `connected` era un ref por-instancia, así que cada montaje
// pasaba el chequeo y abría su propio socket, duplicando cada evento).
let socket: Socket | null = null;
let refCount = 0;

export function useSocket() {
  const { accessToken, isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    refCount++;

    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
        auth: { token: accessToken },
        transports: ['websocket'],
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

      socket.on('payment_received', () => {
        toast.success('Pago de crédito recibido');
        qc.invalidateQueries({ queryKey: ['credits'] });
      });

      socket.on('new_notification', () => {
        qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
        qc.invalidateQueries({ queryKey: ['notifications'] });
      });
    } else {
      // Ya hay una conexión activa (abierta por otra instancia del hook) —
      // solo se refresca el token para el próximo reconnect, sin forzar uno nuevo.
      socket.auth = { token: accessToken };
    }

    return () => {
      refCount--;
      if (refCount <= 0) {
        socket?.disconnect();
        socket = null;
        refCount = 0;
      }
    };
  }, [isAuthenticated, accessToken, qc]);

  return socket;
}
