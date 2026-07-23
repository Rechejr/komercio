// Primitivas de maquetación compartidas por los documentos legales. Existen para
// que Términos y Privacidad se vean idénticos y para que el contenido de cada
// página quede legible como texto, sin ruido de clases de Tailwind repetidas.

export function LegalTitle({ title, updated }: { title: string; updated: string }) {
  return (
    <header className="mb-10 pb-6 border-b border-slate-200 dark:border-white/[0.08]">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{title}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Última actualización: {updated}
      </p>
    </header>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 scroll-mt-20" id={`seccion-${n}`}>
      <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
        {n}. {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="text-emerald-500 flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bloque destacado para advertencias o puntos que el usuario no debe pasar por alto. */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/10 rounded-r-lg px-4 py-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
      {children}
    </div>
  );
}

/** Tabla simple con scroll horizontal en móvil. */
export function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-white/[0.08]">
      <table className="w-full text-sm text-left border-collapse">
        <thead className="bg-slate-50 dark:bg-slate-900">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-200 dark:border-white/[0.08]">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-slate-700 dark:text-slate-300 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
