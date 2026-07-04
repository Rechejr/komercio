import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/response';
import { logger } from '../config/logger';
import { Prisma } from '@prisma/client';
import { Sentry } from '../config/sentry';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error(`${req.method} ${req.path} - ${err.message}`, { stack: err.stack });

  if (err instanceof AppError) {
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
      const friendly = raw.map((f) => FIELD_LABELS[f] || null).filter(Boolean);
      const label = friendly.length > 0 ? friendly.join(' / ') : 'ese campo';
      res.status(409).json({ success: false, error: `Ya existe un registro con ${label}` });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, error: 'Registro no encontrado' });
      return;
    }
    res.status(400).json({ success: false, error: 'Error de base de datos' });
    return;
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    return;
  }

  Sentry.captureException(err, { extra: { method: req.method, path: req.path } });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
}
