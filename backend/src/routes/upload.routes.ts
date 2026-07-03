import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/auth';
import { uploadImage } from '../config/cloudinary';
import { success, AppError } from '../utils/response';

const router = Router();
router.use(authenticate);

// Whitelist explicit MIME types and extensions.
// SVG is excluded — it can carry embedded XSS payloads that bypass CSP.
// HEIC/HEIF included because iOS Safari converts them to JPEG before upload
// but often preserves the original filename extension (e.g. IMG_1234.HEIC).
const ALLOWED_MIMETYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif',
]);
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.heic', '.heif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Accept files with no extension (some mobile browsers omit it) if MIME is valid
    if (!ALLOWED_MIMETYPES.has(file.mimetype) || (ext !== '' && !ALLOWED_EXTENSIONS.has(ext))) {
      return cb(new AppError('Solo se permiten imágenes JPG, PNG, GIF o WebP (máx. 2 MB)', 400));
    }
    cb(null, true);
  },
});

router.post('/images', upload.array('images', 3), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) throw new AppError('No se enviaron imágenes', 400);

    const urls = await Promise.all(
      files.map((f) =>
        uploadImage(f.buffer).catch(() => {
          throw new AppError('No se pudo subir la imagen. Verifica tu conexión e intenta de nuevo.', 502);
        }),
      ),
    );
    return success(res, { urls });
  } catch (err) {
    next(err);
  }
});

export default router;