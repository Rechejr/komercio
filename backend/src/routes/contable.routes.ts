import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { contableController } from '../controllers/contable.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { requireContable, requireActiveContable } from '../middlewares/requireContable';
import { AppError } from '../utils/response';

const router = Router();

// ── Plantilla de import (sin auth — archivo en blanco, no lleva datos) ────────
router.get('/clients/import-template', async (_req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clientes');

    ws.columns = [
      { header: 'Nombre / Razón social', key: 'razonSocial',     width: 34 },
      { header: 'NIT / Cédula',          key: 'nit',             width: 16 },
      { header: 'Tipo de persona',       key: 'tipoPersona',     width: 16 },
      { header: 'Celular',               key: 'celular',         width: 15 },
      { header: 'Dirección',             key: 'direccion',       width: 26 },
      { header: 'Calidades',             key: 'calidades',       width: 40 },
      { header: 'Periodicidad IVA',      key: 'ivaPeriodicidad', width: 16 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
      cell.alignment = { horizontal: 'center' };
    });

    ws.addRow({ razonSocial: 'Comercializadora El Sol SAS', nit: '900123456', tipoPersona: 'Jurídica', celular: '3001234567', direccion: 'Cra 10 # 20-30', calidades: 'Responsable de IVA, Declarante de renta', ivaPeriodicidad: 'Bimestral' });
    ws.addRow({ razonSocial: 'María González', nit: '52891234', tipoPersona: 'Natural', celular: '3152891234', direccion: 'Calle 50 # 20-15', calidades: 'Régimen Simple', ivaPeriodicidad: '' });
    ws.addRow({ razonSocial: 'Distribuidora Andina Ltda', nit: '830055111', tipoPersona: 'Jurídica', celular: '', direccion: '', calidades: 'Responsable de IVA, Agente retenedor', ivaPeriodicidad: 'Cuatrimestral' });

    // Fila de ayuda con los valores admitidos para Calidades.
    const ayuda = ws.addRow({ razonSocial: 'Calidades válidas: Responsable de IVA · Declarante de renta · Agente retenedor · Impoconsumo · Régimen Simple (RST)' });
    ws.mergeCells(`A${ayuda.number}:G${ayuda.number}`);
    ayuda.getCell(1).font = { italic: true, color: { argb: 'FF64748B' }, size: 10 };

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla-clientes-contable.xlsx');
    res.send(buffer);
  } catch (err) { next(err); }
});

// Toda la Agenda requiere sesión Y que la cuenta sea de producto contable.
router.use(authenticate);
router.use(requireContable);

const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError('Solo se permiten archivos Excel (.xlsx, .xls) o CSV', 400));
    }
    cb(null, true);
  },
});

// El AUXILIAR (ayudante) puede ver y gestionar el día a día, pero NO eliminar
// clientes. Solo el ADMIN (el contador dueño) puede eliminar. El resto de
// endpoints los comparten ambos roles.
const VER_Y_GESTIONAR = authorize('ADMIN', 'AUXILIAR');
const SOLO_ADMIN = authorize('ADMIN');
// requireActiveContable exige prueba/suscripción vigente. Va SOLO en escritura:
// al vencer, la agenda queda en solo-lectura (los GET siguen abiertos).
const ESCRIBIR = [authorize('ADMIN', 'AUXILIAR'), requireActiveContable];

// ─── Panel ──────────────────────────────────────────────────────────────────
router.get('/panel', VER_Y_GESTIONAR, contableController.panel);
// Avisos al abrir la agenda (vencidos + vence en ≤7 días, pendientes).
router.get('/prioritarios', VER_Y_GESTIONAR, contableController.prioritarios);

// ─── Clientes ───────────────────────────────────────────────────────────────
router.get('/clients', VER_Y_GESTIONAR, contableController.listClients);
// Importación masiva (soporta ?dryRun=true para la vista previa). Es escritura:
// requiere prueba/suscripción vigente igual que crear a mano.
router.post('/clients/import', ...ESCRIBIR, xlsxUpload.single('file'), contableController.importClients);
router.post('/clients', ...ESCRIBIR, contableController.createClient);
router.put('/clients/:id', ...ESCRIBIR, contableController.updateClient);
router.delete('/clients/:id', SOLO_ADMIN, requireActiveContable, contableController.deleteClient);
router.get('/clients/:id/sugerencias', VER_Y_GESTIONAR, contableController.clientSuggestions);

// ─── Calendario DIAN (fecha automática por NIT) ─────────────────────────────
router.get('/calendario/periodos', VER_Y_GESTIONAR, contableController.periodos);

// ─── Vencimientos ───────────────────────────────────────────────────────────
router.get('/vencimientos', VER_Y_GESTIONAR, contableController.listVencimientos);
router.post('/vencimientos', ...ESCRIBIR, contableController.createVencimiento);
// Generación en lote (agenda completa del cliente o todos los periodos de una obligación).
router.post('/vencimientos/generar', ...ESCRIBIR, contableController.generarVencimientos);
router.patch('/vencimientos/:id/estado', ...ESCRIBIR, contableController.updateEstadoVencimiento);
router.delete('/vencimientos/:id', ...ESCRIBIR, contableController.deleteVencimiento);

// ─── Resoluciones DIAN ──────────────────────────────────────────────────────
router.get('/resoluciones', VER_Y_GESTIONAR, contableController.listResoluciones);
router.post('/resoluciones', ...ESCRIBIR, contableController.createResolucion);
router.delete('/resoluciones/:id', ...ESCRIBIR, contableController.deleteResolucion);

// ─── Responsabilidades manuales (Información Exógena / Otras Responsabilidades) ─
router.get('/responsabilidades', VER_Y_GESTIONAR, contableController.listResponsabilidades);
router.post('/responsabilidades', ...ESCRIBIR, contableController.createResponsabilidad);
router.patch('/responsabilidades/:id', ...ESCRIBIR, contableController.updateResponsabilidad);
router.delete('/responsabilidades/:id', ...ESCRIBIR, contableController.deleteResponsabilidad);

// ─── Bóveda de credenciales (usuarios y contraseñas de portales) ───────────────
router.get('/credenciales', VER_Y_GESTIONAR, contableController.listCredenciales);
router.post('/credenciales', ...ESCRIBIR, contableController.createCredencial);
router.put('/credenciales/:id', ...ESCRIBIR, contableController.updateCredencial);
router.delete('/credenciales/:id', ...ESCRIBIR, contableController.deleteCredencial);

export default router;
