import { v2 as cloudinary } from 'cloudinary';

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// Extrae el public_id de una secure_url de Cloudinary (todo lo que va después
// de /upload/ y de un segmento de versión opcional "v123456/", sin extensión).
function extractPublicId(url: string): string | null {
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-zA-Z0-9]+$/);
  return m ? m[1] : null;
}

// Best-effort — se usa para limpiar imágenes huérfanas (producto eliminado o
// imagen reemplazada). Nunca debe tumbar el flujo principal si falla.
export async function deleteImage(url: string): Promise<void> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return;
  const publicId = extractPublicId(url);
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId);
}

export function uploadImage(buffer: Buffer): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return Promise.reject(new Error('Cloudinary no está configurado (faltan variables de entorno)'));
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'komercio/products',
        transformation: [
          { width: 500, height: 500, crop: 'fill', gravity: 'auto' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (err, result) => {
        if (err || !result) return reject(err);
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}
