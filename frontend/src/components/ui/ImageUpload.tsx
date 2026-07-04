'use client';

import { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const MAX_IMAGES = 3;
const MAX_SIZE_MB = 2;

interface ImageUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
}

export function ImageUpload({ value, onChange }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList).slice(0, MAX_IMAGES - value.length);
    if (files.length === 0) {
      toast.error(`Máximo ${MAX_IMAGES} imágenes`);
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} no es una imagen válida`);
        return;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`${file.name} supera el límite de ${MAX_SIZE_MB}MB`);
        return;
      }
    }

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('images', f));
      const { data } = await api.post('/uploads/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange([...value, ...data.data.urls]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al subir las imágenes');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removeImage(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {value.map((url) => (
          <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Producto" className="w-full h-full object-cover" />
            <button
              type="button"
              aria-label="Quitar imagen"
              onClick={() => removeImage(url)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {value.length < MAX_IMAGES && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl py-6 flex flex-col items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 size={20} className="animate-spin text-blue-500" />
          ) : (
            <Upload size={20} className="text-blue-500" />
          )}
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            {uploading ? 'Subiendo...' : `Carga hasta ${MAX_IMAGES} imágenes`}
          </span>
          <span className="text-[11px] text-blue-400 dark:text-blue-500 text-center px-4">
            Recomendamos: 500 x 500 px, formato PNG, peso máximo {MAX_SIZE_MB}MB
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
