import Image from 'next/image'
import Link from 'next/link'
import { Film, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { SerieCard as SerieCardData } from '@/lib/series'

function ratingTexto(serie: SerieCardData): string {
  if (!serie.rating) return 'Sin valoraciones'
  const { average, count } = serie.rating
  return `${average.toFixed(1)} · ${count} ${count === 1 ? 'valoración' : 'valoraciones'}`
}

export function SerieCard({
  serie,
  headingLevel = 3
}: {
  serie: SerieCardData
  headingLevel?: 2 | 3
}) {
  const Titulo = headingLevel === 2 ? 'h2' : 'h3'

  return (
    // TODO: quitar prefetch={false} cuando F004 cree /series/[slug]
    <Link href={`/series/${serie.slug}`} prefetch={false} className="group block h-full">
      <Card className="h-full transition-colors group-hover:bg-accent/60">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
          {serie.portada_url ? (
            <Image
              src={serie.portada_url}
              alt={`Portada de ${serie.titulo}`}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center" aria-hidden="true">
              <Film className="size-10 text-muted-foreground" />
            </div>
          )}
        </div>
        <CardContent className="flex flex-1 flex-col gap-1.5">
          <Titulo className="line-clamp-2 leading-snug font-medium">{serie.titulo}</Titulo>
          {serie.anio_inicio !== null && (
            <p className="text-xs text-muted-foreground">{serie.anio_inicio}</p>
          )}
          {serie.categoria && (
            <Badge variant="secondary" className="w-fit">
              {serie.categoria.nombre}
            </Badge>
          )}
          {serie.canales.length > 0 && (
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {serie.canales.map((canal) => canal.nombre).join(', ')}
            </p>
          )}
          <p className="mt-auto flex items-center gap-1 text-sm">
            <Star className="size-3.5 text-brand" aria-hidden="true" />
            <span>{ratingTexto(serie)}</span>
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
