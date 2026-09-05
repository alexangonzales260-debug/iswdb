import type { Metadata } from 'next'
import Link from 'next/link'
import { List, MessageSquareText, Star } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { requireUser } from '@/lib/auth'
import { listFeed, type ItemFeed } from '@/lib/sigue-usuarios'
import { createServiceRoleClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Feed · ISWDB'
}

const formatearFecha = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

function claveItem(item: ItemFeed): string {
  if (item.tipo === 'resena') return `resena-${item.id}`
  if (item.tipo === 'valoracion') return `valoracion-${item.autor.id}-${item.serie.slug}`
  return `lista-${item.lista.id}`
}

function CuerpoItem({ item }: { item: ItemFeed }) {
  if (item.tipo === 'valoracion') {
    return (
      <Link
        href={`/series/${item.serie.slug}`}
        className="font-medium text-foreground transition-colors hover:text-brand"
      >
        Valoró {item.serie.titulo} con {item.nota}/10
      </Link>
    )
  }
  if (item.tipo === 'resena') {
    return (
      <div>
        <Link
          href={`/series/${item.serie.slug}`}
          className="font-medium text-foreground transition-colors hover:text-brand"
        >
          Reseñó {item.serie.titulo}
        </Link>
        <p className="mt-0.5 text-sm text-muted-foreground">{item.contenido}</p>
      </div>
    )
  }
  return (
    <Link
      href={`/listas/${item.lista.id}`}
      className="font-medium text-foreground transition-colors hover:text-brand"
    >
      Creó la lista {item.lista.nombre}
    </Link>
  )
}

function IconoItem({ item }: { item: ItemFeed }) {
  if (item.tipo === 'valoracion') return <Star className="size-4 text-brand" aria-hidden="true" />
  if (item.tipo === 'resena')
    return <MessageSquareText className="size-4 text-brand" aria-hidden="true" />
  return <List className="size-4 text-brand" aria-hidden="true" />
}

export default async function FeedPage() {
  const user = await requireUser({ next: '/feed' })

  const feed = await listFeed(createServiceRoleClient(), user.id)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Actividad reciente de los usuarios que sigues
      </p>

      {feed.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Star}
            title="Tu feed está vacío"
            description="Sigue a otros usuarios para ver aquí sus valoraciones, reseñas y listas."
          />
        </div>
      ) : (
        <ul className="mt-8 divide-y">
          {feed.map((item) => (
            <li key={claveItem(item)} className="flex items-start gap-3 py-4">
              <span className="mt-0.5 shrink-0">
                <IconoItem item={item} />
              </span>
              <div className="min-w-0">
                <CuerpoItem item={item} />
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <Link
                    href={`/usuarios/${item.autor.username}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.autor.username}
                  </Link>
                  {' · '}
                  {formatearFecha.format(new Date(item.creadoEn))}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
