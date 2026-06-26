'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Loader2, Store } from 'lucide-react';

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  businessName: z.string().min(2, 'Nombre del negocio requerido'),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await api.post('/auth/register', data);
      toast.success('Cuenta creada. Inicia sesión.');
      router.push('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al registrarse');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-2xl px-6 py-3 mb-4">
            <Store className="text-white" size={28} />
            <span className="text-white font-bold text-2xl">Komercio</span>
          </div>
          <p className="text-blue-100 text-sm">Crea tu cuenta gratis</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Crear cuenta</h1>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {[
              { name: 'name' as const, label: 'Tu nombre completo', placeholder: 'Juan Pérez', type: 'text' },
              { name: 'businessName' as const, label: 'Nombre de tu negocio', placeholder: 'Tienda El Sol', type: 'text' },
              { name: 'email' as const, label: 'Correo electrónico', placeholder: 'tu@correo.com', type: 'email' },
              { name: 'password' as const, label: 'Contraseña', placeholder: 'Mínimo 8 caracteres', type: 'password' },
            ].map((f) => (
              <div key={f.name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input
                  {...register(f.name)}
                  type={f.type}
                  placeholder={f.placeholder}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                {errors[f.name] && <p className="text-red-500 text-xs mt-1">{errors[f.name]?.message}</p>}
              </div>
            ))}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta gratis'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            ¿Ya tienes cuenta?{' '}
            <a href="/login" className="text-blue-600 font-medium hover:underline">Inicia sesión</a>
          </p>
        </div>
      </div>
    </div>
  );
}
