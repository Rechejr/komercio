import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/auth';
import { uploadImage } from '../config/cloudinary';
import { success, AppError } from '../utils/response';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new AppError('Solo se permiten archivos de imagen', 400));
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
