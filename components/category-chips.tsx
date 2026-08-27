import Link from 'next/link'

import { cn } from '@/lib/utils'
import type { CategoriaChip } from '@/lib/categorias'

export function CategoryChips({
  categorias,
  activa
}: {
  categorias: CategoriaChip[]
  activa?: string
}) {
  if (categorias.length === 0) return null

  return (
    <ul aria-label="Categorías" className="flex flex-wrap gap-2">
      {categorias.map((categoria) => {
        const esActiva = categoria.slug === activa
        return (
          <li key={categoria.slug}>
            <Link
              href={`/series?categoria=${categoria.slug}`}
              aria-current={esActiva ? 'page' : undefined}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                esActiva
                  ? 'border-brand text-foreground ring-1 ring-brand'
                  : 'border-border text-muted-foreground'
              )}
            >
              {categoria.nombre}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
