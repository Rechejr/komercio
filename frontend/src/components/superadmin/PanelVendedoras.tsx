'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/exportCsv';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Users, Download, ChevronDown, ChevronRight, Store, Calculator, RefreshCw } from 'lucide-react';

// Cuánto vendió cada vendedora y cuánto se le debe. La comisión la calcula el
// SERVIDOR (backend/utils/comision.ts) — la misma cifra que ellas ven en su
// portal, para que a la hora de liquidar no haya dos números distintos.

interface Venta {
  businessId: string; negocio: string; producto: string; cliente: string;
  email: string; celular: string; periodo: string; precio: number; comision: number;
  montoReal: boolean; fecha: string; plan: string;
}
interface Vendedora {
  id: string; name: string; slug: string; phone: string | null; active: boolean;
  cuentas: number; facturado: number; comision: number; ultimaVenta: string | null;
  ventas: Venta[];
}
interface Respuesta {
  vendedoras: Vendedora[];
  totales: { cuentas: number; facturado: number; comision: number };
  reglas: { porcentaje: number; topeAnual: number };
}

/** Primer y último día de un mes 'YYYY-MM', para el filtro de liquidación. */
function rangoDelMes(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

const mesActual = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
};

export function PanelVendedoras() {
  // Vacío = histórico completo. Las comisiones se liquidan por mes, así que el
  // filtro por mes es el que se usa de verdad.
  const [mes, setMes] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<Respuesta>({
    queryKey: ['sa-sellers', mes],
    queryFn: () => {
      const params = mes ? rangoDelMes(mes) : {};
      return api.get('/superadmin/sellers', { params }).then((r) => r.data.data);
    },
  });

  const vendedoras = data?.vendedoras ?? [];

  function exportar() {
    const filas = vendedoras.flatMap((v) =>
      v.ventas.map((venta) => [
        v.name, venta.fecha.slice(0, 10), venta.cliente, venta.email, venta.celular,
        venta.producto, venta.periodo, venta.precio, venta.comision,
      ]),
    );
    downloadCsv(
      `comisiones-${mes || 'historico'}`,
      ['Vendedora', 'Fecha', 'Cliente', 'Correo', 'Celular', 'Producto', 'Periodo', 'Precio', 'Comisión'],
      filas,
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 mb-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
          <Users size={17} className="text-emerald-400" /> Vendedoras y comisiones
        </h2>
        <button onClick={() => refetch()} className="text-slate-400 hover:text-emerald-400 transition" aria-label="Actualizar">
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="month" value={mes} onChange={(e) => setMes(e.target.value)} max={mesActual()}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-[13px] rounded-lg px-3 py-1.5"
          />
          {mes && (
            <button onClick={() => setMes('')} className="text-[12px] text-slate-400 hover:text-white underline">
              Ver todo
            </button>
          )}
          <button
            onClick={exportar} disabled={!vendedoras.some((v) => v.cuentas > 0)}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-[13px] font-medium px-3 py-1.5 rounded-lg transition"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Cuentas vendidas', valor: String(data.totales.cuentas) },
            { label: 'Facturado', valor: formatCurrency(data.totales.facturado) },
            { label: 'Comisiones a pagar', valor: formatCurrency(data.totales.comision), destacado: true },
          ].map((t) => (
            <div key={t.label} className={`rounded-xl px-4 py-3 border ${t.destacado ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900/60 border-slate-700'}`}>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{t.label}</p>
              <p className={`text-[17px] font-bold tabular ${t.destacado ? 'text-emerald-300' : 'text-white'}`}>{t.valor}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-[13px] text-slate-400 py-6 text-center">Cargando…</p>
      ) : vendedoras.length === 0 ? (
        <p className="text-[13px] text-slate-400 py-6 text-center">No hay vendedoras registradas.</p>
      ) : (
        <div className="space-y-2">
          {vendedoras.map((v) => (
            <div key={v.id} className="border border-slate-700 rounded-xl overflow-hidden">
              <button
                onClick={() => setAbierta(abierta === v.id ? null : v.id)}
                className="w-full flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-800/60 transition text-left"
              >
                {abierta === v.id ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                <div className="flex-1 min-w-[140px]">
                  <p className="text-[14px] font-semibold text-white">{v.name}</p>
                  <p className="text-[11px] text-slate-400">/planes?v={v.slug}{!v.active && ' · inactiva'}</p>
                </div>
                <div className="text-center px-2">
                  <p className="text-[15px] font-bold text-white tabular">{v.cuentas}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">cuentas</p>
                </div>
                <div className="text-right px-2">
                  <p className="text-[13px] text-slate-300 tabular">{formatCurrency(v.facturado)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">facturado</p>
                </div>
                <div className="text-right min-w-[110px]">
                  <p className="text-[15px] font-bold text-emerald-400 tabular">{formatCurrency(v.comision)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    {v.ultimaVenta ? `última: ${formatDate(v.ultimaVenta)}` : 'sin ventas'}
                  </p>
                </div>
              </button>

              {abierta === v.id && (
                v.ventas.length === 0 ? (
                  <p className="px-4 py-4 text-[12px] text-slate-500 border-t border-slate-700">
                    Sin ventas en este periodo.
                  </p>
                ) : (
                  <div className="border-t border-slate-700 overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-slate-900/60 text-slate-400">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold">Fecha</th>
                          <th className="text-left px-4 py-2 font-semibold">Cliente</th>
                          <th className="text-left px-4 py-2 font-semibold">Producto</th>
                          <th className="text-right px-4 py-2 font-semibold">Precio</th>
                          <th className="text-right px-4 py-2 font-semibold">Comisión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {v.ventas.map((venta) => (
                          <tr key={venta.businessId} className="text-slate-300">
                            <td className="px-4 py-2 tabular whitespace-nowrap">{formatDate(venta.fecha)}</td>
                            <td className="px-4 py-2">
                              <p className="text-white">{venta.cliente}</p>
                              <p className="text-[11px] text-slate-500">{venta.email}</p>
                            </td>
                            <td className="px-4 py-2">
                              <span className="inline-flex items-center gap-1">
                                {venta.producto === 'Contable' ? <Calculator size={11} /> : <Store size={11} />}
                                {venta.producto} · {venta.periodo}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right tabular">
                              {formatCurrency(venta.precio)}
                              {/* Sin monto real: el precio se dedujo de la duración del plan. */}
                              {!venta.montoReal && <span className="text-slate-500" title="Precio deducido del plan, no del pago"> ≈</span>}
                            </td>
                            <td className="px-4 py-2 text-right tabular text-emerald-400 font-semibold">{formatCurrency(venta.comision)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {data && (
        <p className="text-[11px] text-slate-500 mt-3">
          Comisión: {Math.round(data.reglas.porcentaje * 100)}% del primer pago, con tope de {formatCurrency(data.reglas.topeAnual)} en planes anuales.
          El símbolo ≈ marca las cuentas creadas a mano, donde el precio se deduce de la duración del plan.
        </p>
      )}
    </div>
  );
}
