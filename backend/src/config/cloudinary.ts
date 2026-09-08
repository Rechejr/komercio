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

export interface DocumentoSubido {
  /** URL firmada. Es secreta: solo la usa el servidor para leer el archivo. */
  url: string;
  publicId: string;
  resourceType: string;
}

// Sube un documento (PDF o imagen) SIN transformar, en su propia carpeta y en
// modo PRIVADO.
//
// `type: 'authenticated'` es lo importante: sin eso Cloudinary sirve el archivo
// a cualquiera que tenga el enlace, y aquí se guardan RUT, cámaras de comercio y
// declaraciones de renta de terceros. Con esto, la URL sin firmar devuelve 401 y
// la firmada solo la conoce el servidor, que sirve el archivo a quien tenga
// sesión y permiso.
//
// resource_type 'auto' deja que Cloudinary elija (PDF/imágenes → image; otros → raw).
export function uploadDocument(buffer: Buffer): Promise<DocumentoSubido> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return Promise.reject(new Error('Cloudinary no está configurado (faltan variables de entorno)'));
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'komercio/contable-docs', resource_type: 'auto', type: 'authenticated' },
      (err, result) => {
        if (err || !result) return reject(err);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type || 'image',
        });
      },
    );
    stream.end(buffer);
  });
}

/** Borra un documento privado. `deleteImage` no sirve: los privados viven bajo
 *  otro `type` y hay que decírselo a Cloudinary. */
export async function deleteDocument(publicId: string, resourceType = 'image'): Promise<void> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated' });
}

/** Pasa a privado un archivo que se había subido público (los de antes de este
 *  cambio). Devuelve la URL firmada nueva. */
export async function hacerPrivado(publicId: string, resourceType = 'image'): Promise<string> {
  const r = await cloudinary.uploader.rename(publicId, publicId, {
    resource_type: resourceType,
    type: 'upload',
    to_type: 'authenticated',
    overwrite: true,
  });
  return r.secure_url;
}

export { extractPublicId };

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
