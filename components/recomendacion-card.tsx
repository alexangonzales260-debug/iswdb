import Image from 'next/image'
import Link from 'next/link'
import { Film } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { RecomendacionSerie } from '@/lib/recomendaciones'

export function RecomendacionCard({
  serie,
  razon,
  headingLevel = 3
}: {
  serie: RecomendacionSerie
  razon?: string
  headingLevel?: 2 | 3
}) {
  const Titulo = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <Link href={`/series/${serie.slug}`} className="group block h-full">
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
          {serie.categoria && (
            <Badge variant="secondary" className="w-fit">
              {serie.categoria.nombre}
            </Badge>
          )}
          {razon && <p className="mt-auto text-sm text-muted-foreground">{razon}</p>}
        </CardContent>
      </Card>
    </Link>
  )
}