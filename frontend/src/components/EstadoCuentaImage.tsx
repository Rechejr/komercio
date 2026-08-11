'use client';

import { formatCurrency } from '@/lib/utils';

export interface EstadoCuentaData {
  negocio?: string | null;
  cliente: string;
  factura?: string | null;
  total: number | string;
  abonado: number | string;
  saldo: number | string;
  estado: string;
  fecha: string; // fecha de emisión (ya formateada)
  vence?: string | null;
  pagos: Array<{ fecha: string; metodo?: string | null; monto: number | string }>;
}

// Documento "Estado de cuenta" para descargar/compartir como imagen. Colores
// FIJOS en claro (sin dark:) para que la imagen capturada se vea siempre limpia,
// igual que el ticket de venta. Se renderiza fuera de pantalla y html2canvas lo
// captura por su id.
export function EstadoCuentaImage({ data }: { data: EstadoCuentaData }) {
  return (
    <div style={{ position: 'fixed', left: -99999, top: 0, zIndex: -1, pointerEvents: 'none' }} aria-hidden>
      <div id="estado-cuenta-content" style={{ width: 400 }} className="bg-white p-6 font-sans text-slate-800">
        {/* Encabezado */}
        <div className="text-center border-b border-slate-200 pb-3 mb-4">
          {data.negocio && <p className="text-[15px] font-bold text-slate-900">{data.negocio}</p>}
          <p className="text-[13px] font-semibold text-emerald-600 uppercase tracking-wide mt-0.5">Estado de cuenta</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{data.fecha}</p>
        </div>

        {/* Cliente */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Cliente</p>
          <p className="text-[14px] font-semibold text-slate-900">{data.cliente}</p>
          {data.factura && <p className="text-[11px] text-slate-400 font-mono">{data.factura}</p>}
        </div>

        {/* Totales */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 text-center">
            <p className="text-[9px] uppercase text-slate-400">Total fiado</p>
            <p className="text-[13px] font-bold text-slate-800">{formatCurrency(Number(data.total))}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center">
            <p className="text-[9px] uppercase text-emerald-500">Abonado</p>
            <p className="text-[13px] font-bold text-emerald-700">{formatCurrency(Number(data.abonado))}</p>
          </div>
          <div className="rounded-lg bg-red-50 border border-red-100 p-2 text-center">
            <p className="text-[9px] uppercase text-red-500">Saldo</p>
            <p className="text-[13px] font-bold text-red-700">{formatCurrency(Number(data.saldo))}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 text-[11px]">
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{data.estado}</span>
          {data.vence && <span className="text-slate-400">Vence: {data.vence}</span>}
        </div>

        {/* Historial de abonos */}
        <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Historial de abonos</p>
        {data.pagos.length === 0 ? (
          <p className="text-[12px] text-slate-400 text-center py-2">Sin abonos registrados</p>
        ) : (
          <div className="border border-slate-100 rounded-lg divide-y divide-slate-100">
            {data.pagos.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-[11px] text-slate-500">{p.fecha}</p>
                  {p.metodo && <p className="text-[10px] text-slate-400">{p.metodo}</p>}
                </div>
                <span className="text-[12px] font-bold text-emerald-600">+{formatCurrency(Number(p.monto))}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[9px] text-slate-300 text-center mt-4">Generado con Ventrix</p>
      </div>
    </div>
  );
}
