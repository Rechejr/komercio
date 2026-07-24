import { Router } from 'express';
import { contableController } from '../controllers/contable.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { requireContable } from '../middlewares/requireContable';

const router = Router();

// Toda la Agenda requiere sesión Y que la cuenta sea de producto contable.
router.use(authenticate);
router.use(requireContable);

// El AUXILIAR (ayudante) puede ver y gestionar el día a día, pero NO eliminar
// clientes. Solo el ADMIN (el contador dueño) puede eliminar. El resto de
// endpoints los comparten ambos roles.
const VER_Y_GESTIONAR = authorize('ADMIN', 'AUXILIAR');
const SOLO_ADMIN = authorize('ADMIN');

// ─── Panel ──────────────────────────────────────────────────────────────────
router.get('/panel', VER_Y_GESTIONAR, contableController.panel);

// ─── Clientes ───────────────────────────────────────────────────────────────
router.get('/clients', VER_Y_GESTIONAR, contableController.listClients);
router.post('/clients', VER_Y_GESTIONAR, contableController.createClient);
router.put('/clients/:id', VER_Y_GESTIONAR, contableController.updateClient);
router.delete('/clients/:id', SOLO_ADMIN, contableController.deleteClient);
router.get('/clients/:id/sugerencias', VER_Y_GESTIONAR, contableController.clientSuggestions);

// ─── Calendario DIAN (fecha automática por NIT) ─────────────────────────────
router.get('/calendario/periodos', VER_Y_GESTIONAR, contableController.periodos);

// ─── Vencimientos ───────────────────────────────────────────────────────────
router.get('/vencimientos', VER_Y_GESTIONAR, contableController.listVencimientos);
router.post('/vencimientos', VER_Y_GESTIONAR, contableController.createVencimiento);
router.patch('/vencimientos/:id/estado', VER_Y_GESTIONAR, contableController.updateEstadoVencimiento);
router.delete('/vencimientos/:id', VER_Y_GESTIONAR, contableController.deleteVencimiento);

// ─── Resoluciones DIAN ──────────────────────────────────────────────────────
router.get('/resoluciones', VER_Y_GESTIONAR, contableController.listResoluciones);
router.post('/resoluciones', VER_Y_GESTIONAR, contableController.createResolucion);
router.delete('/resoluciones/:id', VER_Y_GESTIONAR, contableController.deleteResolucion);

export default router;
