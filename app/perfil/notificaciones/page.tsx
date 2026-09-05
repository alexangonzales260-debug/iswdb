import type { Metadata } from 'next'
import { Bell } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { MarcarLeidaButton, MarcarTodasLeidaButton } from '@/components/marcar-leida-button'
import { createAuthClient, requireUser } from '@/lib/auth'
import { listMisNotificaciones } from '@/lib/notificaciones'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Notificaciones · ISWDB'
}

export default async function NotificacionesPage() {
  const user = await requireUser({ next: '/perfil/notificaciones' })
  const client = await createAuthClient()
  const notificaciones = await listMisNotificaciones(client, user.id)

  const noLeidas = notificaciones.filter((n) => !n.leida)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Notificaciones</h1>
        {noLeidas.length > 0 && <MarcarTodasLeidaButton />}
      </div>

      {notificaciones.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Bell}
            title="No tienes notificaciones"
            description="Cuando se publiquen nuevos episodios de las series que sigues, aparecerán aquí."
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y">
          {notificaciones.map((notificacion) => (
            <li
              key={notificacion.id}
              className={`flex items-start justify-between gap-4 py-4 ${
                notificacion.leida ? 'opacity-60' : ''
              }`}
            >
              <div className="min-w-0">
                {notificacion.tipo === 'nuevo_episodio' && (
                  <>
                    <p className="font-medium">
                      Nuevo episodio en {notificacion.serie.titulo}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      T{notificacion.episodio.temporada} E{notificacion.episodio.numero}
                      {notificacion.episodio.titulo ? ` — ${notificacion.episodio.titulo}` : ''}
                    </p>
                  </>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat('es-ES', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  }).format(new Date(notificacion.created_at))}
                </p>
              </div>
              {!notificacion.leida && (
                <MarcarLeidaButton notificacionId={notificacion.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
