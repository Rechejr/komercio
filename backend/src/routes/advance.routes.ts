import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { requirePermission } from '../middlewares/permissions';
import { advanceController } from '../controllers/advance.controller';

const router = Router();
router.use(authenticate);

// Saldo a favor de un tercero. Va antes de /:id para que "available" no se
// confunda con el id de un anticipo.
router.get('/available', requirePermission('anticipos.ver'), advanceController.available);

router.get('/', requirePermission('anticipos.ver'), advanceController.list);
// Facturas del tercero contra las que se puede cruzar este anticipo.
router.get('/:id/invoices', requirePermission('anticipos.ver'), advanceController.invoices);
router.get('/:id', requirePermission('anticipos.ver'), advanceController.getOne);
router.post('/', requirePermission('anticipos.gestionar'), advanceController.create);
// Cruzar contra una factura: no mueve la caja, solo descuenta del saldo.
router.post('/:id/apply', requirePermission('anticipos.gestionar'), advanceController.apply);
// Devolver la plata (sale de la caja) y anular un registro equivocado (revierte
// el movimiento original) son cosas distintas a propósito.
router.post('/:id/refund', requirePermission('anticipos.devolver'), advanceController.refund);
router.post('/:id/cancel', requirePermission('anticipos.devolver'), advanceController.cancel);

export default router;
