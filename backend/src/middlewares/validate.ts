import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

export function validate(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      error: 'Datos inválidos',
      details: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
    });
  }
  next();
}
