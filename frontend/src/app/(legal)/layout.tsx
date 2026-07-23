import Link from 'next/link';
import { LEGAL } from '@/lib/legal';

// Layout compartido por Términos y Privacidad. Se mantiene deliberadamente
// sobrio y sin JavaScript de cliente: son documentos que deben poder leerse,
// imprimirse y archivarse sin depender de nada más.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-200 dark:border-white/[0.08] sticky top-0 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <span className="w-7 h-7 rounded-lg bg-emerald-500 text-white grid place-items-center text-sm font-bold">
              V
            </span>
            {LEGAL.brand}
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link
              href="/terminos"
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Términos
            </Link>
            <Link
              href="/privacidad"
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Privacidad
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Documento ──────────────────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-6 py-12">{children}</main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-white/[0.08] mt-8">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span>© 2026 {LEGAL.brand} · Punto de venta</span>
          <Link href="/" className="hover:text-slate-900 dark:hover:text-white transition-colors">
            Volver al inicio
          </Link>
        </div>
      </footer>
    </div>
  );
}
