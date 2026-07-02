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
// MIME type alone is client-controlled and can be spoofed; the extension check
// adds a second layer of defence before the buffer reaches Cloudinary.
const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIMETYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new AppError('Solo se permiten imágenes JPG, PNG, GIF o WebP', 400));
    }
    cb(null, true);
  },
});

router.post('/images', upload.array('images', 3), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) throw new AppError('No se enviaron imágenes', 400);

    const urls = await Promise.all(files.map((f) => uploadImage(f.buffer)));
    return success(res, { urls });
  } catch (err) {
    next(err);
  }
});

export default router;
