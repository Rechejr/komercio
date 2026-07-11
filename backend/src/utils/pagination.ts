import { Request } from 'express';

export function getPagination(req: Request) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function getSearch(req: Request) {
  return (req.query.search as string)?.trim() || '';
}

export function getSortOrder(req: Request, allowedFields: string[], defaultField = 'createdAt') {
  const sortBy = allowedFields.includes(req.query.sortBy as string)
    ? (req.query.sortBy as string)
    : defaultField;
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
  return { [sortBy]: sortOrder };
}
