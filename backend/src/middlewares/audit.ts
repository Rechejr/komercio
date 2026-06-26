import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../config/database';

export function auditLog(action: string, module: string) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const originalJson = _res.json.bind(_res);
    (_res as any).json = async (body: any) => {
      if (_res.statusCode >= 200 && _res.statusCode < 300) {
        try {
          await prisma.auditLog.create({
            data: {
              userId: req.user?.userId,
              action,
              module,
              entityId: req.params.id,
              newData: body?.data,
              ipAddress: req.ip || req.socket.remoteAddress,
              userAgent: req.headers['user-agent'],
            },
          });
        } catch { /* non-blocking */ }
      }
      return originalJson(body);
    };
    next();
  };
}
