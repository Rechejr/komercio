'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ChevronDown, Search, X, Plus, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Category {
  id: string;
  name: string;
}

interface CategorySelectProps {
  value: string;
  onChange: (categoryId: string) => void;
  categories: Category[];
}

export function CategorySelect({ value, onChange, categories }: CategorySelectProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = categories.find((c) => c.id === value);

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post('/categories', { name }),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      onChange(data.data.id);
      setSearch('');
      setOpen(false);
      toast.success('Categoría creada');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al crear la categoría'),
  });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));
  const exactMatch = categories.some((c) => c.name.toLowerCase() === search.trim().toLowerCase());
  const canCreate = search.trim().length > 0 && !exactMatch;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-left flex items-center justify-between bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={selected ? '' : 'text-gray-400'}>{selected ? selected.name : 'Sin categoría'}</span>
        <ChevronDown size={15} className={cn('text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <Search size={14} className="text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoría..."
              className="flex-1 text-sm outline-none bg-transparent dark:text-white"
            />
            {search && (
              <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setSearch(''); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-500"
            >
              Sin categoría
              {!value && <Check size={13} className="text-blue-600" />}
            </button>

            {filtered.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => { onChange(c.id); setSearch(''); setOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:text-white"
              >
                {c.name}
                {value === c.id && <Check size={13} className="text-blue-600" />}
              </button>
            ))}

            {filtered.length === 0 && !canCreate && (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No se encontraron categorías</p>
            )}
          </div>

          <button
            type="button"
            disabled={createMutation.isPending}
            onClick={() => canCreate ? createMutation.mutate(search.trim()) : inputRef.current?.focus()}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-t border-gray-100 dark:border-gray-700 transition-colors disabled:opacity-60"
          >
            {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {canCreate ? `Crear "${search.trim()}"` : 'Nueva categoría'}
          </button>
        </div>
      )}
    </div>
  );
}
