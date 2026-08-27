import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function Pagination({
  page,
  totalPages,
  hrefFor
}: {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
}) {
  if (totalPages <= 1) return null

  const hasAnterior = page > 1
  const hasSiguiente = page < totalPages

  return (
    <nav aria-label="Paginación" className="flex items-center justify-center gap-3">
      {hasAnterior ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={hrefFor(page - 1)}>
            <ChevronLeft aria-hidden="true" /> Anterior
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <ChevronLeft aria-hidden="true" /> Anterior
        </Button>
      )}
      <span className="text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </span>
      {hasSiguiente ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={hrefFor(page + 1)}>
            Siguiente <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Siguiente <ChevronRight aria-hidden="true" />
        </Button>
      )}
    </nav>
  )
}
