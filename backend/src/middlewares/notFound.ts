import { Request, Response } from 'express';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: `Ruta no encontrada: ${req.method} ${req.path}` });
}
