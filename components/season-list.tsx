import Image from 'next/image'
import { ExternalLink } from 'lucide-react'

import type { TemporadaFicha } from '@/lib/series'

// Link externo (FIC-02/D5): sin embeds ni iframes, solo <a> nativo que abre
// en nueva pestaña. Thumbnail derivada del video_id (img.youtube.com).
function youtubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function SeasonList({ temporadas }: { temporadas: TemporadaFicha[] }) {
  return (
    <div className="space-y-8">
      {temporadas.map((temporada) => (
        <section
          key={temporada.numero}
          className="space-y-3"
          aria-labelledby={`temporada-${temporada.numero}-heading`}
        >
          <h3 id={`temporada-${temporada.numero}-heading`} className="text-lg font-semibold tracking-tight">
            Temporada {temporada.numero}
          </h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {temporada.episodios.map((episodio) => (
              <li key={episodio.numero}>
                <a
                  href={youtubeUrl(episodio.video_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ver ${episodio.titulo} en YouTube (se abre en nueva pestaña)`}
                  className="group flex h-full gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/60"
                >
                  <div className="relative aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={`https://img.youtube.com/vi/${episodio.video_id}/hqdefault.jpg`}
                      alt=""
                      fill
                      sizes="128px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-xs text-muted-foreground">Episodio {episodio.numero}</p>
                    <p className="line-clamp-2 leading-snug font-medium">{episodio.titulo}</p>
                    <span className="mt-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      YouTube
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
