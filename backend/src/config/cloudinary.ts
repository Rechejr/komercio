import { v2 as cloudinary } from 'cloudinary';

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

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
