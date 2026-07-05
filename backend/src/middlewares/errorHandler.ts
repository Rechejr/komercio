import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/response';
import { logger } from '../config/logger';
import { Prisma } from '@prisma/client';
import { Sentry } from '../config/sentry';

function requestContext(req: Request) {
  const user = (req as any).user;
  return {
    method: req.method,
    path: req.path,
    userId: user?.userId,
    businessId: user?.businessId,
    ip: req.ip,
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    // 4xx are expected operational errors — log as warn to reduce noise
    if (err.statusCode >= 500) {
      logger.error(`${req.method} ${req.path} - ${err.message}`, { ...requestContext(req), stack: err.stack });
    } else {
      logger.warn(`${req.method} ${req.path} [${err.statusCode}] - ${err.message}`, requestContext(req));
    }
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const FIELD_LABELS: Record<string, string> = {
        email: 'correo electrónico',
        code: 'código de producto',
        barcode: 'código de barras',
        invoiceNumber: 'número de factura',
        document: 'número de documento',
        name: 'nombre',
        nit: 'NIT',
        phone: 'teléfono',
      };
      const raw = (err.meta?.target as string[] | undefined) || [];
      const friendly = raw.filter((f) => f !== 'businessId').map((f) => FIELD_LABELS[f] || null).filter(Boolean);
      const label = friendly.length > 0 ? friendly.join(' / ') : 'ese campo';
      logger.warn(`${req.method} ${req.path} [409] P2002 duplicate`, { ...requestContext(req), target: raw });
      res.status(409).json({ success: false, error: `Ya existe un registro con ${label}` });
      return;
    }
    if (err.code === 'P2025') {
      logger.warn(`${req.method} ${req.path} [404] P2025 not found`, requestContext(req));
      res.status(404).json({ success: false, error: 'Registro no encontrado' });
      return;
    }
    if (err.code === 'P2003') {
      // Foreign key constraint — the referenced record doesn't exist
      logger.warn(`${req.method} ${req.path} [400] P2003 FK violation`, { ...requestContext(req), meta: err.meta });
      res.status(400).json({ success: false, error: 'Referencia inválida: uno de los registros relacionados no existe.' });
      return;
    }
    if (err.code === 'P2011' || err.code === 'P2012') {
      // Null constraint or missing required value
      logger.warn(`${req.method} ${req.path} [400] ${err.code} null constraint`, { ...requestContext(req), meta: err.meta });
      res.status(400).json({ success: false, error: 'Faltan campos obligatorios. Completa todos los datos requeridos.' });
      return;
    }
    if (err.code === 'P2014' || err.code === 'P2015') {
      // Required relation violation / related record not found
      logger.warn(`${req.method} ${req.path} [400] ${err.code} relation`, { ...requestContext(req), meta: err.meta });
      res.status(400).json({ success: false, error: 'Error de relación: un registro relacionado no existe o fue eliminado.' });
      return;
    }
    logger.error(`${req.method} ${req.path} Prisma ${err.code}`, { ...requestContext(req), meta: err.meta });
    res.status(400).json({ success: false, error: 'Error al procesar la solicitud. Intenta de nuevo.' });
    return;
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    logger.warn(`${req.method} ${req.path} [401] JWT ${err.name}`, requestContext(req));
    res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    return;
  }

  // Unexpected 5xx — log full context and report to Sentry
  logger.error(`${req.method} ${req.path} - unhandled: ${err.message}`, { ...requestContext(req), stack: err.stack });
  Sentry.captureException(err, { extra: requestContext(req) });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
}
