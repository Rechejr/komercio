import { Router } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { productController } from '../controllers/product.controller';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { planLimit } from '../middlewares/planLimit';
import { prisma } from '../config/database';
import { success, AppError } from '../utils/response';

const router = Router();

// ── Template download (public — generic example file, no user data) ──────────
router.get('/import-template', async (_req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Productos');

    ws.columns = [
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Código', key: 'code', width: 15 },
      { header: 'Precio Venta', key: 'salePrice', width: 15 },
      { header: 'Precio Costo', key: 'costPrice', width: 15 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Stock Mínimo', key: 'minStock', width: 13 },
      { header: 'Categoría', key: 'category', width: 20 },
      { header: 'Unidad', key: 'unit', width: 10 },
      { header: 'Código de Barras', key: 'barcode', width: 18 },
      { header: 'Descripción', key: 'description', width: 30 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center' };
    });

    ws.addRow({ name: 'Arroz Diana 1kg', code: 'P001', salePrice: 3200, costPrice: 2500, stock: 50, minStock: 10, category: 'Alimentos', unit: 'Und', barcode: '', description: '' });
    ws.addRow({ name: 'Aceite Vegetal 900ml', code: 'P002', salePrice: 9500, costPrice: 7800, stock: 30, minStock: 5, category: 'Alimentos', unit: 'Und', barcode: '', description: '' });
    ws.addRow({ name: 'Jabón Protex 120g', code: 'P003', salePrice: 4200, costPrice: 3000, stock: 40, minStock: 8, category: 'Aseo', unit: 'Und', barcode: '', description: '' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla-productos.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

router.use(authenticate);

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


// ── Bulk import (supports ?dryRun=true for preview) ──────────────────────────
router.post('/import',
  authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'),
  planLimit.bulkImport(),
  xlsxUpload.single('file'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.file) throw new AppError('Archivo requerido', 400);
      const dryRun = req.query.dryRun === 'true';
      const businessId = req.user!.businessId;
      const branchId = req.user!.branchId;

      const wb = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wb.xlsx.load as any)(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) throw new AppError('El archivo no contiene hojas de cálculo', 400);

      // Normalize headers: lowercase + remove accents
      const headers: string[] = [];
      ws.getRow(1).eachCell((cell) => {
        headers.push(
          String(cell.value ?? '').trim().toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, ''),
        );
      });

      // Column alias map — order matters: more specific aliases first
      const colDefs: Record<string, string[]> = {
        name:        ['nombre', 'name', 'producto', 'articulo', 'item', 'mercancia'],
        code:        ['codigo', 'code', 'referencia', 'ref', 'sku', 'cod'],
        salePrice:   ['precio venta', 'precio_venta', 'precio de venta', 'precio al publico',
                      'precio publico', 'saleprice', 'pvp', 'p.v.p', 'venta', 'precio'],
        costPrice:   ['precio costo', 'precio_costo', 'precio de costo', 'precio de compra',
                      'precio compra', 'costo', 'compra', 'costprice'],
        stock:       ['stock', 'cantidad disponible', 'existencias', 'inventario', 'qty', 'cantidad'],
        minStock:    ['stock minimo', 'stock_minimo', 'stock min', 'cantidad minima',
                      'punto de reorden', 'reorden', 'minstock', 'minimo', 'min'],
        category:    ['categoria', 'category', 'grupo', 'tipo', 'linea', 'departamento', 'seccion'],
        unit:        ['unidad', 'unit', 'um', 'und', 'medida', 'presentacion'],
        barcode:     ['codigo de barras', 'barcode', 'ean', 'codbarras', 'cod barras', 'ean13', 'upc'],
        description: ['descripcion', 'description', 'detalle', 'observacion', 'observaciones', 'nota'],
      };

      // Global two-pass column mapping with deduplication (no column claimed twice)
      const claimedCols = new Map<number, string>(); // headerIndex → field
      const col: Record<string, number> = {};
      for (const f of Object.keys(colDefs)) col[f] = -1;

      // Pass 1: exact match
      for (const [field, aliases] of Object.entries(colDefs)) {
        for (const a of aliases) {
          const i = headers.indexOf(a);
          if (i >= 0 && !claimedCols.has(i)) {
            claimedCols.set(i, field);
            col[field] = i + 1; // ExcelJS 1-based
            break;
          }
        }
      }

      // Pass 2: header contains alias — only for unclaimed columns and unmatched fields
      for (const [field, aliases] of Object.entries(colDefs)) {
        if (col[field] !== -1) continue;
        for (const a of aliases) {
          const i = headers.findIndex((h, idx) => h.includes(a) && !claimedCols.has(idx));
          if (i >= 0) {
            claimedCols.set(i, field);
            col[field] = i + 1;
            break;
          }
        }
      }

      if (col.name === -1) throw new AppError('No se encontró columna de nombre de producto. Asegúrate de tener una columna "Nombre" o "Producto".', 400);

      const detectedColumns = Array.from(claimedCols.entries()).map(([idx, field]) => ({
        field,
        header: headers[idx],
      }));

      function cellVal(row: ExcelJS.Row, colIndex: number): string {
        if (colIndex === -1) return '';
        const v = row.getCell(colIndex).value;
        if (v === null || v === undefined) return '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof v === 'object' && 'result' in (v as any)) return String((v as any).result ?? '');
        return String(v).trim();
      }

      function parseNum(raw: string): number {
        // Handle both "1.234,56" (ES) and "1,234.56" (EN) formats
        const s = raw.replace(/[^0-9.,-]/g, '');
        const normalized = s.includes(',') && s.includes('.')
          ? (s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''))
          : s.replace(',', '.');
        return parseFloat(normalized) || 0;
      }

      interface ParsedRow {
        rowNum: number; name: string; rawCode: string;
        salePrice: number; costPrice: number; stock: number; minStock: number;
        categoryName: string; unit: string; barcodeVal: string; descriptionVal: string;
      }
      type RowIssue = { row: number; name: string; message: string; type: 'error' | 'warning' };

      const issues: RowIssue[] = [];
      const validRows: ParsedRow[] = [];
      const seenCodes = new Map<string, number>(); // code → first rowNum
      let totalRows = 0;

      for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
        const row = ws.getRow(rowNum);
        const name = cellVal(row, col.name);
        if (!name) continue; // skip blank rows
        totalRows++;

        // Hard error: invalid sale price
        const rawSalePriceStr = cellVal(row, col.salePrice);
        const salePrice = parseNum(rawSalePriceStr);
        if (!rawSalePriceStr || salePrice <= 0) {
          issues.push({ row: rowNum, name, message: 'Precio de venta vacío o inválido', type: 'error' });
          continue;
        }

        // Hard error: negative stock
        const stock = parseNum(cellVal(row, col.stock));
        if (stock < 0) {
          issues.push({ row: rowNum, name, message: 'Stock negativo', type: 'error' });
          continue;
        }

        const rawCode = cellVal(row, col.code);
        const costPrice = parseNum(cellVal(row, col.costPrice));
        const minStock = parseNum(cellVal(row, col.minStock)) || 5;

        // Warning: price below cost
        if (costPrice > 0 && salePrice < costPrice) {
          issues.push({
            row: rowNum, name,
            message: `Precio de venta (${salePrice.toLocaleString('es-CO')}) menor al costo (${costPrice.toLocaleString('es-CO')})`,
            type: 'warning',
          });
        }

        // Warning: duplicate code within file
        if (rawCode) {
          if (seenCodes.has(rawCode)) {
            issues.push({
              row: rowNum, name,
              message: `Código "${rawCode}" ya aparece en la fila ${seenCodes.get(rawCode)}`,
              type: 'warning',
            });
          } else {
            seenCodes.set(rawCode, rowNum);
          }
        }

        validRows.push({
          rowNum, name, rawCode, salePrice, costPrice, stock, minStock,
          categoryName: cellVal(row, col.category),
          unit: cellVal(row, col.unit) || 'unit',
          barcodeVal: cellVal(row, col.barcode),
          descriptionVal: cellVal(row, col.description),
        });
      }

      // ── Dry run: return preview stats without touching the DB ────────────────
      if (dryRun) {
        const codesInFile = validRows.map(r => r.rawCode).filter(Boolean);
        const existingProducts = codesInFile.length > 0
          ? await prisma.product.findMany({
              where: { code: { in: codesInFile }, businessId },
              select: { code: true },
            })
          : [];
        const existingCodes = new Set(existingProducts.map(p => p.code));

        return success(res, {
          total: totalRows,
          valid: validRows.length,
          toCreate: validRows.filter(r => !r.rawCode || !existingCodes.has(r.rawCode)).length,
          toUpdate: validRows.filter(r => r.rawCode && existingCodes.has(r.rawCode)).length,
          issues,
          detectedColumns,
        }, 'Vista previa generada');
      }

      // ── Actual import ────────────────────────────────────────────────────────
      const categoryCache = new Map<string, string>();
      const results = {
        imported: 0,
        updated: 0,
        errors: issues
          .filter(i => i.type === 'error')
          .map(i => ({ row: i.row, message: `"${i.name}": ${i.message}` })),
      };

      for (const r of validRows) {
        try {
          let categoryId: string | undefined;
          if (r.categoryName) {
            const cacheKey = r.categoryName.toLowerCase();
            if (categoryCache.has(cacheKey)) {
              categoryId = categoryCache.get(cacheKey)!;
            } else {
              const cat = await prisma.category.upsert({
                where: { businessId_name: { businessId: businessId!, name: r.categoryName } },
                update: {},
                create: { name: r.categoryName, businessId: businessId! },
              });
              categoryCache.set(cacheKey, cat.id);
              categoryId = cat.id;
            }
          }

          const productData = {
            name: r.name, salePrice: r.salePrice, costPrice: r.costPrice,
            stock: r.stock, minStock: r.minStock, unit: r.unit,
            categoryId, branchId, businessId,
            ...(r.barcodeVal && { barcode: r.barcodeVal }),
            ...(r.descriptionVal && { description: r.descriptionVal }),
          };

          if (r.rawCode) {
            const existing = await prisma.product.findFirst({ where: { code: r.rawCode, businessId } });
            if (existing) {
              await prisma.product.update({ where: { id: existing.id }, data: productData });
              results.updated++;
            } else {
              try {
                await prisma.product.create({ data: { code: r.rawCode, ...productData } });
                results.imported++;
              } catch (e: any) {
                if (e.code === 'P2002') {
                  // Code collides with another business — add suffix
                  const fallbackCode = `${r.rawCode}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
                  await prisma.product.create({ data: { code: fallbackCode, ...productData } });
                  results.imported++;
                } else { throw e; }
              }
            }
          } else {
            const autoCode = `IMP${String(r.rowNum).padStart(5, '0')}-${Date.now().toString(36).toUpperCase()}`;
            await prisma.product.create({ data: { code: autoCode, ...productData } });
            results.imported++;
          }
        } catch (err: any) {
          results.errors.push({ row: r.rowNum, message: `"${r.name}": ${err.message ?? 'Error desconocido'}` });
        }
      }

      return success(res, results, `Importación: ${results.imported} creados, ${results.updated} actualizados`);
    } catch (err) { next(err); }
  },
);

// ── Standard CRUD ────────────────────────────────────────────────────────────
router.get('/', productController.list);
router.get('/low-stock', productController.getLowStock);
router.get('/:id', productController.getOne);

router.post('/',
  authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'),
  planLimit.products(),
  [
    body('code').trim().notEmpty().withMessage('El código es requerido'),
    body('name').trim().notEmpty().withMessage('El nombre es requerido'),
    body('salePrice').isFloat({ min: 0 }).withMessage('Precio de venta inválido'),
    body('costPrice').optional().isFloat({ min: 0 }),
  ],
  validate,
  productController.create,
);

router.put('/:id', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'), productController.update);
router.delete('/:id', authorize('ADMIN', 'SUPERVISOR'), productController.delete);
router.post('/:id/duplicate', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'), productController.duplicate);
router.patch('/:id/adjust-stock',
  authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'),
  [
    body('quantity').isFloat({ min: 0.001 }),
    body('type').isIn(['IN', 'OUT', 'ADJUSTMENT']),
    body('reason').optional().trim(),
  ],
  validate,
  productController.adjustStock,
);

export default router;