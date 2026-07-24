import { Response, NextFunction } from 'express';
import { Prisma, Calidad, Obligacion } from '@prisma/client';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { success, created, paginated, AppError } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { calcularDV, soloDigitos, ultimoDigito, dosUltimosDigitos } from '../utils/nit';
import { normalizarResponsabilidades, obligacionesSugeridas } from '../utils/calidades';

// El calendario sembrado hoy es solo 2026 (cada año se siembra el decreto nuevo).
const ANIO_CALENDARIO = 2026;

/** Confirma que un TaxClient existe y pertenece a ESTA oficina. Devuelve el
 *  cliente o lanza 404 — nunca revela la existencia de clientes de otra oficina. */
async function getClientOfBusiness(taxClientId: string, businessId: string) {
  const client = await prisma.taxClient.findFirst({
    where: { id: taxClientId, businessId },
  });
  if (!client) throw new AppError('Cliente no encontrado', 404);
  return client;
}

/** Variante del calendario según la obligación y el cliente:
 *  IVA → periodicidad; renta → tipo de persona; el resto no tiene variante. */
function varianteDe(obligacion: Obligacion, tipoPersona: string, ivaPeriodicidad: string | null): string | null {
  if (obligacion === 'iva') return ivaPeriodicidad;
  if (obligacion === 'renta') return tipoPersona;
  return null;
}

/** Periodos del calendario DIAN para una obligación y un NIT, con la fecha ya
 *  resuelta. Maneja los dos mecanismos: por último dígito (la mayoría) y por los
 *  dos últimos (renta de personas naturales). Porta periodosCalendario() de la
 *  app de referencia. */
async function periodosCalendario(obligacion: Obligacion, variante: string | null, nit: string) {
  if (obligacion === 'renta' && variante === 'natural') {
    const row = await prisma.calendarioRentaNatural.findUnique({
      where: { anio_dosDigitos: { anio: ANIO_CALENDARIO, dosDigitos: dosUltimosDigitos(nit) } },
    });
    return row ? [{ periodo: 'Año 2025', fecha: row.fecha }] : [];
  }
  const rows = await prisma.calendarioDian.findMany({
    where: { anio: ANIO_CALENDARIO, obligacion, variante, digito: ultimoDigito(nit) },
    orderBy: { periodoOrden: 'asc' },
    select: { periodo: true, fecha: true },
  });
  return rows;
}

function diasDesdeHoy(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d;
}

export const contableController = {
  // ─── CLIENTES ────────────────────────────────────────────────────────────────
  async listClients(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { page, limit, skip } = getPagination(req);
      const search = (req.query.search as string)?.trim();

      const where: Prisma.TaxClientWhereInput = { businessId, activo: true };
      if (search) {
        // Buscar por razón social o por NIT (con o sin el guion del DV).
        const soloNum = soloDigitos(search);
        where.OR = [
          { razonSocial: { contains: search, mode: 'insensitive' } },
          ...(soloNum ? [{ nit: { contains: soloNum } }] : []),
        ];
      }

      const [items, total] = await Promise.all([
        prisma.taxClient.findMany({ where, skip, take: limit, orderBy: { razonSocial: 'asc' } }),
        prisma.taxClient.count({ where }),
      ]);
      return paginated(res, items, total, page, limit);
    } catch (err) { next(err); }
  },

  async createClient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { razonSocial, nit, celular, direccion, tipoPersona, responsabilidades, ivaPeriodicidad } = req.body;

      if (!razonSocial?.trim()) throw new AppError('La razón social es requerida', 400);
      const nitLimpio = soloDigitos(nit || '');
      if (!nitLimpio) throw new AppError('El NIT es requerido', 400);
      if (tipoPersona !== 'natural' && tipoPersona !== 'juridica') {
        throw new AppError('Tipo de persona inválido', 400);
      }

      const calidades = normalizarResponsabilidades(responsabilidades);
      // La periodicidad de IVA solo aplica si es responsable de IVA.
      const ivaPer = calidades.includes('responsable_iva')
        ? (ivaPeriodicidad === 'bimestral' || ivaPeriodicidad === 'cuatrimestral' ? ivaPeriodicidad : null)
        : null;
      const dv = calcularDV(nitLimpio);

      try {
        const client = await prisma.taxClient.create({
          data: {
            businessId,
            razonSocial: razonSocial.trim(),
            nit: nitLimpio,
            dv,
            celular: celular?.trim() || null,
            direccion: direccion?.trim() || null,
            tipoPersona,
            responsabilidades: calidades,
            ivaPeriodicidad: ivaPer,
          },
        });
        return created(res, client, 'Cliente creado');
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppError('Ya tienes un cliente registrado con ese NIT', 409);
        }
        throw e;
      }
    } catch (err) { next(err); }
  },

  async updateClient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      await getClientOfBusiness(req.params.id, businessId);

      const { razonSocial, nit, celular, direccion, tipoPersona, responsabilidades, ivaPeriodicidad } = req.body;
      if (!razonSocial?.trim()) throw new AppError('La razón social es requerida', 400);
      const nitLimpio = soloDigitos(nit || '');
      if (!nitLimpio) throw new AppError('El NIT es requerido', 400);
      if (tipoPersona !== 'natural' && tipoPersona !== 'juridica') {
        throw new AppError('Tipo de persona inválido', 400);
      }

      const calidades = normalizarResponsabilidades(responsabilidades);
      const ivaPer = calidades.includes('responsable_iva')
        ? (ivaPeriodicidad === 'bimestral' || ivaPeriodicidad === 'cuatrimestral' ? ivaPeriodicidad : null)
        : null;

      try {
        const client = await prisma.taxClient.update({
          where: { id: req.params.id },
          data: {
            razonSocial: razonSocial.trim(),
            nit: nitLimpio,
            dv: calcularDV(nitLimpio),
            celular: celular?.trim() || null,
            direccion: direccion?.trim() || null,
            tipoPersona,
            responsabilidades: calidades,
            ivaPeriodicidad: ivaPer,
          },
        });
        return success(res, client, 'Cliente actualizado');
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppError('Ya tienes un cliente registrado con ese NIT', 409);
        }
        throw e;
      }
    } catch (err) { next(err); }
  },

  // Solo ADMIN (el dueño). El AUXILIAR no elimina clientes — lo aplica el router.
  async deleteClient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      await getClientOfBusiness(req.params.id, businessId);
      // Vencimientos y resoluciones caen por la cascada declarada en el schema.
      await prisma.taxClient.delete({ where: { id: req.params.id } });
      return success(res, null, 'Cliente eliminado');
    } catch (err) { next(err); }
  },

  /** Obligaciones que le faltan al cliente según sus calidades (§5.5). */
  async clientSuggestions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const client = await getClientOfBusiness(req.params.id, businessId);
      const registradas = await prisma.vencimiento.findMany({
        where: { taxClientId: client.id },
        select: { obligacion: true },
        distinct: ['obligacion'],
      });
      const sugeridas = obligacionesSugeridas(
        client.responsabilidades as Calidad[],
        registradas.map((r) => r.obligacion),
      );
      return success(res, sugeridas);
    } catch (err) { next(err); }
  },

  // ─── CALENDARIO (fecha automática por NIT) ─────────────────────────────────────
  async periodos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const obligacion = req.query.obligacion as Obligacion;
      if (!obligacion) throw new AppError('Falta la obligación', 400);

      const client = await getClientOfBusiness(req.query.taxClientId as string, businessId);
      const variante = varianteDe(obligacion, client.tipoPersona, client.ivaPeriodicidad);
      const periodos = await periodosCalendario(obligacion, variante, client.nit);
      // periodos = [] cuando la obligación no está en el calendario (ICA, PILA,
      // exógena) → el frontend deja la fecha en modo manual.
      return success(res, periodos);
    } catch (err) { next(err); }
  },

  // ─── VENCIMIENTOS ──────────────────────────────────────────────────────────────
  async listVencimientos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const obligacion = req.query.obligacion as Obligacion | undefined;
      const search = (req.query.search as string)?.trim();

      const where: Prisma.VencimientoWhereInput = { taxClient: { businessId } };
      if (obligacion) where.obligacion = obligacion;
      if (search) {
        const soloNum = soloDigitos(search);
        where.taxClient = {
          businessId,
          OR: [
            { razonSocial: { contains: search, mode: 'insensitive' } },
            ...(soloNum ? [{ nit: { contains: soloNum } }] : []),
          ],
        };
      }

      const items = await prisma.vencimiento.findMany({
        where,
        include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true } } },
        orderBy: { fecha: 'desc' },
      });
      return success(res, items);
    } catch (err) { next(err); }
  },

  async createVencimiento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { taxClientId, obligacion, periodo, fecha, monto, notas } = req.body;

      await getClientOfBusiness(taxClientId, businessId);
      if (!obligacion) throw new AppError('La obligación es requerida', 400);
      if (!periodo?.trim()) throw new AppError('El periodo es requerido', 400);
      if (!fecha) throw new AppError('La fecha es requerida', 400);

      try {
        const venc = await prisma.vencimiento.create({
          data: {
            taxClientId,
            obligacion,
            periodo: periodo.trim(),
            fecha: new Date(`${fecha}T00:00:00Z`),
            monto: monto != null && monto !== '' ? new Prisma.Decimal(monto) : null,
            notas: notas?.trim() || null,
          },
        });
        return created(res, venc, 'Vencimiento registrado');
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppError('Ese cliente ya tiene un vencimiento para esa obligación y periodo', 409);
        }
        throw e;
      }
    } catch (err) { next(err); }
  },

  async updateEstadoVencimiento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { estado } = req.body;
      const ESTADOS = ['pendiente', 'en_proceso', 'presentada', 'pagada', 'vencida'];
      if (!ESTADOS.includes(estado)) throw new AppError('Estado inválido', 400);

      // Asegurar que el vencimiento sea de esta oficina antes de tocarlo.
      const venc = await prisma.vencimiento.findFirst({
        where: { id: req.params.id, taxClient: { businessId } },
      });
      if (!venc) throw new AppError('Vencimiento no encontrado', 404);

      const updated = await prisma.vencimiento.update({
        where: { id: req.params.id },
        data: { estado },
      });
      return success(res, updated, 'Estado actualizado');
    } catch (err) { next(err); }
  },

  async deleteVencimiento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const venc = await prisma.vencimiento.findFirst({
        where: { id: req.params.id, taxClient: { businessId } },
      });
      if (!venc) throw new AppError('Vencimiento no encontrado', 404);
      await prisma.vencimiento.delete({ where: { id: req.params.id } });
      return success(res, null, 'Vencimiento eliminado');
    } catch (err) { next(err); }
  },

  // ─── RESOLUCIONES DIAN ─────────────────────────────────────────────────────────
  async listResoluciones(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const where: Prisma.ResolucionDianWhereInput = { taxClient: { businessId } };
      if (req.query.taxClientId) {
        await getClientOfBusiness(req.query.taxClientId as string, businessId);
        where.taxClientId = req.query.taxClientId as string;
      }
      const items = await prisma.resolucionDian.findMany({
        where,
        include: { taxClient: { select: { id: true, razonSocial: true } } },
        orderBy: { fechaVigencia: 'asc' },
      });
      return success(res, items);
    } catch (err) { next(err); }
  },

  async createResolucion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { taxClientId, tipo, numero, fechaExpedicion, fechaVigencia, prefijo, rangoDesde, rangoHasta, modalidad, notas } = req.body;

      await getClientOfBusiness(taxClientId, businessId);
      const TIPOS = ['facturacion_numeracion', 'habilitacion_electronica', 'otra'];
      if (!TIPOS.includes(tipo)) throw new AppError('Tipo de resolución inválido', 400);
      if (!numero?.trim()) throw new AppError('El número es requerido', 400);
      if (!fechaExpedicion || !fechaVigencia) throw new AppError('Las fechas son requeridas', 400);

      const reso = await prisma.resolucionDian.create({
        data: {
          taxClientId,
          tipo,
          numero: numero.trim(),
          fechaExpedicion: new Date(`${fechaExpedicion}T00:00:00Z`),
          fechaVigencia: new Date(`${fechaVigencia}T00:00:00Z`),
          prefijo: prefijo?.trim() || null,
          rangoDesde: rangoDesde != null && rangoDesde !== '' ? Number(rangoDesde) : null,
          rangoHasta: rangoHasta != null && rangoHasta !== '' ? Number(rangoHasta) : null,
          modalidad: ['pos', 'electronica', 'contingencia'].includes(modalidad) ? modalidad : null,
          notas: notas?.trim() || null,
        },
      });
      return created(res, reso, 'Resolución registrada');
    } catch (err) { next(err); }
  },

  async deleteResolucion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const reso = await prisma.resolucionDian.findFirst({
        where: { id: req.params.id, taxClient: { businessId } },
      });
      if (!reso) throw new AppError('Resolución no encontrada', 404);
      await prisma.resolucionDian.delete({ where: { id: req.params.id } });
      return success(res, null, 'Resolución eliminada');
    } catch (err) { next(err); }
  },

  // ─── PANEL ─────────────────────────────────────────────────────────────────────
  async panel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const [proximosVencimientos, resolucionesPorVencer, totalClientes] = await Promise.all([
        prisma.vencimiento.findMany({
          where: {
            taxClient: { businessId },
            estado: { notIn: ['presentada', 'pagada'] },
            fecha: { lte: diasDesdeHoy(15) },
          },
          include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true } } },
          orderBy: { fecha: 'asc' },
          take: 50,
        }),
        prisma.resolucionDian.findMany({
          where: {
            taxClient: { businessId },
            estado: { not: 'vencida' },
            fechaVigencia: { lte: diasDesdeHoy(30) },
          },
          include: { taxClient: { select: { id: true, razonSocial: true } } },
          orderBy: { fechaVigencia: 'asc' },
          take: 50,
        }),
        prisma.taxClient.count({ where: { businessId, activo: true } }),
      ]);
      return success(res, { proximosVencimientos, resolucionesPorVencer, totalClientes });
    } catch (err) { next(err); }
  },
};
