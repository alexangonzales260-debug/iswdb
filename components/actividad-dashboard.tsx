import Link from 'next/link'
import Image from 'next/image'
import { Star, MessageSquareText, ListMusic, FolderPlus, Film } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import type { AgregadosActividad, MiValoracion, MiReseña, MiLista, MiPropuesta } from '@/lib/actividad'

function formatFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max).trim() + '…'
}

function getStatusLabel(status: MiPropuesta['moderation_status']): string {
  switch (status) {
    case 'pendiente':
      return 'Pendiente'
    case 'aprobada':
      return 'Aprobada'
    case 'rechazada':
      return 'Rechazada'
  }
}

function getStatusVariant(status: MiPropuesta['moderation_status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'pendiente':
      return 'secondary'
    case 'aprobada':
      return 'default'
    case 'rechazada':
      return 'destructive'
  }
}

export interface ActividadDashboardProps {
  agregados: AgregadosActividad
  valoraciones: MiValoracion[]
  reseñas: MiReseña[]
  listas: MiLista[]
  propuestas: MiPropuesta[]
}

export function ActividadDashboard({
  agregados,
  valoraciones,
  reseñas,
  listas,
  propuestas
}: ActividadDashboardProps) {
  return (
    <div className="space-y-8">
      <section aria-label="Resumen de actividad">
        <h2 className="sr-only">Resumen de actividad</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card size="sm">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Valoraciones</p>
              <p className="text-3xl font-bold tracking-tight">{agregados.totalValoraciones}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Promedio dado</p>
              <p className="text-3xl font-bold tracking-tight">
                {agregados.promedioDado !== null ? agregados.promedioDado.toFixed(1) : '—'}
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Reseñas</p>
              <p className="text-3xl font-bold tracking-tight">{agregados.totalReseñas}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Listas</p>
              <p className="text-3xl font-bold tracking-tight">{agregados.totalListas}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Propuestas</p>
              <p className="text-3xl font-bold tracking-tight">{agregados.totalPropuestas}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 border-b border-border pb-2" aria-label="Secciones de actividad">
        <a href="#valoraciones" className="text-sm font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Valoraciones
        </a>
        <a href="#reseñas" className="text-sm font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Reseñas
        </a>
        <a href="#listas" className="text-sm font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Listas
        </a>
        <a href="#propuestas" className="text-sm font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Propuestas
        </a>
      </nav>

      <div className="space-y-8">
        <section id="valoraciones" className="actividad-panel">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">Valoraciones</h2>
            <span className="text-sm text-muted-foreground">{valoraciones.length} elementos</span>
          </div>
          {valoraciones.length === 0 ? (
            <EmptyState
              icon={Star}
              title="Sin valoraciones"
              description="Cuando valores una serie, aparecerá aquí."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {valoraciones.map((v) => (
                <Card key={v.serie.slug} size="sm">
                  <div className="flex gap-3 p-4">
                    <div className="relative shrink-0 w-16 h-24">
                      {v.serie.portada_url ? (
                        <Image
                          src={v.serie.portada_url}
                          alt=""
                          fill
                          className="object-cover rounded-md"
                          sizes="64px"
                        />
                      ) : (
                        <div className="w-full h-full rounded-md bg-muted flex items-center justify-center">
                          <Film className="size-6 text-muted-foreground" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/series/${v.serie.slug}`}
                        className="font-medium underline-offset-4 hover:underline block truncate"
                      >
                        {v.serie.titulo}
                      </Link>
                      {v.serie.categoria && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {v.serie.categoria.nombre}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Star className="size-4 text-yellow-500 fill-current" aria-hidden="true" />
                        <span className="font-medium">{v.nota}/10</span>
                        <span className="text-sm text-muted-foreground">{formatFecha(v.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="reseñas" className="actividad-panel">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">Reseñas</h2>
            <span className="text-sm text-muted-foreground">{reseñas.length} elementos</span>
          </div>
          {reseñas.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="Sin reseñas"
              description="Cuando escribas una reseña, aparecerá aquí."
            />
          ) : (
            <div className="space-y-4">
              {reseñas.map((r) => (
                <Card key={r.id} size="sm">
                  <CardContent className="pt-4">
                    <Link
                      href={`/series/${r.serie.slug}`}
                      className="font-medium underline-offset-4 hover:underline block mb-1"
                    >
                      {r.serie.titulo}
                    </Link>
                    <p className="text-sm text-muted-foreground line-clamp-3">{truncate(r.contenido, 150)}</p>
                    <time className="text-xs text-muted-foreground block mt-2">{formatFecha(r.created_at)}</time>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="listas" className="actividad-panel">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">Listas</h2>
            <span className="text-sm text-muted-foreground">{listas.length} elementos</span>
          </div>
          {listas.length === 0 ? (
            <EmptyState
              icon={ListMusic}
              title="Sin listas"
              description="Cuando crees una lista, aparecerá aquí."
            />
          ) : (
            <div className="space-y-4">
              {listas.map((l) => (
                <Card key={l.id} size="sm">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/listas/${l.id}`}
                          className="font-medium underline-offset-4 hover:underline block truncate"
                        >
                          {l.nombre}
                        </Link>
                        {l.descripcion && (
                          <p className="text-sm text-muted-foreground truncate mt-1">{l.descripcion}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-sm text-muted-foreground">{l.numSeries} series</span>
                          <Badge variant={l.es_publica ? 'default' : 'secondary'}>{l.es_publica ? 'Pública' : 'Privada'}</Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="propuestas" className="actividad-panel">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">Propuestas</h2>
            <span className="text-sm text-muted-foreground">{propuestas.length} elementos</span>
          </div>
          {propuestas.length === 0 ? (
            <EmptyState
              icon={FolderPlus}
              title="Sin propuestas"
              description="Cuando propongas una serie, aparecerá aquí."
            />
          ) : (
            <div className="space-y-4">
              {propuestas.map((p) => (
                <Card key={p.id} size="sm">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {p.moderation_status === 'aprobada' && p.slug ? (
                          <Link
                            href={`/series/${p.slug}`}
                            className="font-medium underline-offset-4 hover:underline block truncate"
                          >
                            {p.titulo}
                          </Link>
                        ) : (
                          <span className="font-medium block truncate">{p.titulo}</span>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={getStatusVariant(p.moderation_status)}>
                            {getStatusLabel(p.moderation_status)}
                          </Badge>
                          <time className="text-xs text-muted-foreground">{formatFecha(p.created_at)}</time>
                        </div>
                        {p.moderation_status === 'rechazada' && (
                          <p className="text-sm text-muted-foreground mt-1">Rechazada</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .actividad-panel {
          display: none;
        }
        .actividad-panel:target,
        .actividad-panel:not(:target) ~ #valoraciones:not(:target) {
          display: block;
        }
        :root:has(#valoraciones:target) #valoraciones,
        :root:has(#reseñas:target) #reseñas,
        :root:has(#listas:target) #listas,
        :root:has(#propuestas:target) #propuestas {
          display: block;
        }
        :root:has(#valoraciones:target) #reseñas,
        :root:has(#valoraciones:target) #listas,
        :root:has(#valoraciones:target) #propuestas,
        :root:has(#reseñas:target) #valoraciones,
        :root:has(#reseñas:target) #listas,
        :root:has(#reseñas:target) #propuestas,
        :root:has(#listas:target) #valoraciones,
        :root:has(#listas:target) #reseñas,
        :root:has(#listas:target) #propuestas,
        :root:has(#propuestas:target) #valoraciones,
        :root:has(#propuestas:target) #reseñas,
        :root:has(#propuestas:target) #listas {
          display: none;
        }
        :root:not(:has(:target)) #valoraciones {
          display: block;
        }
        :root:not(:has(:target)) #reseñas,
        :root:not(:has(:target)) #listas,
        :root:not(:has(:target)) #propuestas {
          display: none;
        }
      `}</style>
    </div>
  )
}