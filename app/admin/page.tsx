import Link from 'next/link'
import { Inbox, Plus } from 'lucide-react'

import { ModerationButtons } from '@/components/admin/moderation-buttons'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listSeriesPendientes, listTodasSeries } from '@/lib/admin'
import { createAuthClient } from '@/lib/auth'

// ADM-01: cola de pendientes (FIFO) + listado de todas + acceso a crear.
// El guard requireMod ya corrió en app/admin/layout.tsx.
export const dynamic = 'force-dynamic'

const formatoFecha = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada'
}

type VarianteBadge = 'secondary' | 'outline' | 'destructive' | 'ghost'

const VARIANTE_ESTADO: Record<string, VarianteBadge> = {
  aprobada: 'secondary',
  pendiente: 'outline',
  rechazada: 'destructive',
  borrador: 'ghost'
}

export default async function AdminPage() {
  const client = await createAuthClient()
  const [pendientes, todas] = await Promise.all([
    listSeriesPendientes(client),
    listTodasSeries(client)
  ])

  return (
    <div className="flex flex-col gap-10">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/admin/series/nueva">
            <Plus />
            Nueva serie
          </Link>
        </Button>
      </div>

      <section aria-labelledby="admin-pendientes">
        <h2 id="admin-pendientes" className="text-lg font-semibold tracking-tight">
          Pendientes de moderación
        </h2>
        {pendientes.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Inbox}
              title="No hay series pendientes"
              description="Cuando alguien proponga una serie, aparecerá aquí."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y rounded-xl border">
            {pendientes.map((serie) => (
              <li key={serie.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{serie.titulo}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {serie.canales.length > 0
                      ? serie.canales.map((canal) => canal.nombre).join(', ')
                      : 'Sin canales'}
                    {' · '}
                    {formatoFecha.format(new Date(serie.created_at))}
                  </p>
                </div>
                <ModerationButtons slug={serie.slug} titulo={serie.titulo} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-todas">
        <h2 id="admin-todas" className="text-lg font-semibold tracking-tight">
          Todas las series
        </h2>
        <ul className="mt-4 divide-y rounded-xl border">
          {todas.map((serie) => (
            <li key={serie.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="truncate font-medium">{serie.titulo}</span>
                <Badge variant={VARIANTE_ESTADO[serie.moderation_status] ?? 'outline'}>
                  {ETIQUETA_ESTADO[serie.moderation_status] ?? serie.moderation_status}
                </Badge>
                {serie.categoria ? (
                  <span className="text-sm text-muted-foreground">{serie.categoria.nombre}</span>
                ) : null}
              </div>
              <Link
                href={`/admin/series/${serie.slug}/editar`}
                className="shrink-0 text-sm font-medium underline-offset-4 hover:underline"
              >
                Editar
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
