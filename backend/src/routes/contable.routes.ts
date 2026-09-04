import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { contableController } from '../controllers/contable.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { requirePermission } from '../middlewares/permissions';
import { requireContable, requireActiveContable } from '../middlewares/requireContable';
import { AppError, success } from '../utils/response';
import { prisma } from '../config/database';

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

// Documentos de la bóveda: PDF e imágenes, hasta 8 MB.
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError('Solo se permiten archivos PDF o imágenes (JPG, PNG)', 400));
    }
    cb(null, true);
  },
});

// El AUXILIAR (ayudante) puede ver y gestionar el día a día, pero NO eliminar
// clientes. Solo el ADMIN (el contador dueño) puede eliminar. El resto de
// endpoints los comparten ambos roles.
const VER_Y_GESTIONAR = authorize('ADMIN', 'AUXILIAR');
// requireActiveContable exige prueba/suscripción vigente. Va SOLO en escritura:
// al vencer, la agenda queda en solo-lectura (los GET siguen abiertos).
const ESCRIBIR = [requireActiveContable];

// ─── Panel ──────────────────────────────────────────────────────────────────
router.get('/panel', requirePermission('contable.clientes.ver'), contableController.panel);
// Avisos al abrir la agenda (vencidos + vence en ≤7 días, pendientes).
router.get('/prioritarios', requirePermission('contable.clientes.ver'), contableController.prioritarios);

// ─── Clientes ───────────────────────────────────────────────────────────────
router.get('/clients', requirePermission('contable.clientes.ver'), contableController.listClients);
// Importación masiva (soporta ?dryRun=true para la vista previa). Es escritura:
// requiere prueba/suscripción vigente igual que crear a mano.
router.post('/clients/import', requirePermission('contable.clientes.gestionar'), ...ESCRIBIR, xlsxUpload.single('file'), contableController.importClients);
router.post('/clients', requirePermission('contable.clientes.gestionar'), ...ESCRIBIR, contableController.createClient);
router.put('/clients/:id', requirePermission('contable.clientes.gestionar'), ...ESCRIBIR, contableController.updateClient);
router.delete('/clients/:id', requirePermission('contable.clientes.eliminar'), requireActiveContable, contableController.deleteClient);
router.get('/clients/:id/sugerencias', requirePermission('contable.clientes.ver'), contableController.clientSuggestions);

// ─── Calendario DIAN (fecha automática por NIT) ─────────────────────────────
router.get('/calendario/periodos', requirePermission('contable.clientes.ver'), contableController.periodos);

// ─── Vencimientos ───────────────────────────────────────────────────────────
router.get('/vencimientos', requirePermission('contable.clientes.ver'), contableController.listVencimientos);
router.post('/vencimientos', requirePermission('contable.vencimientos.gestionar'), ...ESCRIBIR, contableController.createVencimiento);
// Generación en lote (agenda completa del cliente o todos los periodos de una obligación).
router.post('/vencimientos/generar', requirePermission('contable.vencimientos.gestionar'), ...ESCRIBIR, contableController.generarVencimientos);
router.post('/vencimientos/regenerar-todos', requirePermission('contable.agenda.regenerar'), requireActiveContable, contableController.regenerarAgendaTodos);
router.patch('/vencimientos/:id/estado', requirePermission('contable.vencimientos.gestionar'), ...ESCRIBIR, contableController.updateEstadoVencimiento);
router.delete('/vencimientos/:id', requirePermission('contable.vencimientos.gestionar'), ...ESCRIBIR, contableController.deleteVencimiento);

// ─── Resoluciones DIAN ──────────────────────────────────────────────────────
router.get('/resoluciones', requirePermission('contable.clientes.ver'), contableController.listResoluciones);
router.post('/resoluciones', requirePermission('contable.clientes.gestionar'), ...ESCRIBIR, contableController.createResolucion);
router.delete('/resoluciones/:id', requirePermission('contable.clientes.gestionar'), ...ESCRIBIR, contableController.deleteResolucion);

// ─── Responsabilidades manuales (Información Exógena / Otras Responsabilidades) ─
router.get('/responsabilidades', requirePermission('contable.clientes.ver'), contableController.listResponsabilidades);
router.post('/responsabilidades', requirePermission('contable.clientes.gestionar'), ...ESCRIBIR, contableController.createResponsabilidad);
router.patch('/responsabilidades/:id', requirePermission('contable.clientes.gestionar'), ...ESCRIBIR, contableController.updateResponsabilidad);
router.delete('/responsabilidades/:id', requirePermission('contable.clientes.gestionar'), ...ESCRIBIR, contableController.deleteResponsabilidad);

// ─── Bóveda de credenciales (usuarios y contraseñas de portales) ───────────────
router.get('/credenciales', requirePermission('contable.boveda.ver'), contableController.listCredenciales);
router.post('/credenciales', requirePermission('contable.boveda.ver'), ...ESCRIBIR, contableController.createCredencial);
router.put('/credenciales/:id', requirePermission('contable.boveda.ver'), ...ESCRIBIR, contableController.updateCredencial);
router.delete('/credenciales/:id', requirePermission('contable.boveda.ver'), ...ESCRIBIR, contableController.deleteCredencial);

// ─── Bóveda de documentos (RUT, cámara de comercio, declaraciones…) ────────────
router.get('/clients/:id/documentos', requirePermission('contable.documentos.gestionar'), contableController.listDocumentos);
router.post('/clients/:id/documentos', requirePermission('contable.documentos.gestionar'), ...ESCRIBIR, docUpload.single('file'), contableController.uploadDocumento);
router.delete('/documentos/:id', requirePermission('contable.documentos.gestionar'), ...ESCRIBIR, contableController.deleteDocumento);

// ─── Horario de los avisos de vencimientos ────────────────────────────────────
// Cada oficina elige a qué horas quiere que le suene el celular. Por defecto tres
// (7am panorama, 2pm pendientes, 6pm cierre), pero un contador que abre a las
// 5:30am no quiere el mismo horario que uno que abre a las 9.
router.get('/avisos', VER_Y_GESTIONAR, async (req: any, res, next) => {
  try {
    const negocio = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      select: { vencAvisoHoras: true },
    });
    return success(res, { horas: [...(negocio?.vencAvisoHoras ?? [])].sort((a, b) => a - b) });
  } catch (err) { next(err); }
});

router.patch('/avisos', ...ESCRIBIR, async (req: any, res, next) => {
  try {
    const crudas = Array.isArray(req.body?.horas) ? req.body.horas : null;
    if (!crudas) throw new AppError('Envía las horas de los avisos', 400);

    const horas: number[] = [...new Set(crudas.map((h: unknown) => Number(h)))]
      .filter((h) => Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23)
      .map((h) => h as number)
      .sort((a, b) => a - b);

    if (horas.length !== crudas.length) throw new AppError('Hay horas repetidas o fuera de 0-23', 400);
    // Sin horas no habría avisos, y más de cuatro al día es ruido que termina
    // haciendo que el contador apague las notificaciones.
    if (horas.length < 1 || horas.length > 4) throw new AppError('Elige entre 1 y 4 horas al día', 400);

    await prisma.business.update({
      where: { id: req.user.businessId },
      data: { vencAvisoHoras: horas },
    });
    return success(res, { horas }, 'Horario de avisos actualizado');
  } catch (err) { next(err); }
});

export default router;
