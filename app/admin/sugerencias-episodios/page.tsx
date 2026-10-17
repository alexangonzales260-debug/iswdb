import Image from 'next/image'

import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { Inbox } from 'lucide-react'

import { SugerenciaActions } from '@/components/admin/sugerencia-actions'
import { requireMod } from '@/lib/admin'
import { createAuthClient, getUser } from '@/lib/auth'
import { listSugerenciasPendientes } from '@/lib/episodio-deteccion'

// F029 (SUG-02): cola de sugerencias de episodios para moderadores.
// El guard requireMod ya corrió en app/admin/layout.tsx.
export const dynamic = 'force-dynamic'

// Devuelve la URL de miniatura de YouTube para el video_id dado.
function thumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

export default async function SugerenciasEpisodiosPage() {
  const client = await createAuthClient()
  const user = await getUser()
  await requireMod(client, user ?? null)

  const lista = await listSugerenciasPendientes(client)

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-lg font-semibold tracking-tight">Sugerencias de episodios</h2>

      {lista.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No hay sugerencias pendientes"
          description="Cuando se detecte un vídeo con patrón de episodio, aparecerá aquí."
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {lista.map((sug) => (
            <li key={sug.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 gap-4">
                <Image
                  src={thumbnailUrl(sug.video_id_youtube)}
                  alt=""
                  width={96}
                  height={64}
                  unoptimized
                  className="h-16 w-24 shrink-0 rounded object-cover"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Badge variant="outline">Pendiente</Badge>
                  <p className="truncate text-sm font-medium">{sug.titulo_detectado}</p>
                  <p className="text-sm text-muted-foreground">
                    Serie: {sug.serie.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Video ID: {sug.video_id_youtube}
                  </p>
                </div>
              </div>
              <SugerenciaActions id={sug.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
