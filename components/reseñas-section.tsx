import { MessageSquareText } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { ReseñaDeleteButton } from '@/components/reseña-delete-button'
import { ReseñaForm } from '@/components/reseña-form'
import { getRolUsuario } from '@/lib/admin'
import { createAuthClient, getUser } from '@/lib/auth'
import { truncarEmail } from '@/lib/format'
import { getReseñaUsuario, listReseñasSerie, type ReseñaPropia } from '@/lib/reseñas'
import { createServiceRoleClient } from '@/lib/supabase'
import { getValoracionUsuario } from '@/lib/valoraciones'

// Patrón /perfil y /admin: fecha larga en es-ES.
const formatoFecha = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

// Sección "Reseñas" de la ficha (RES-08): formulario primero (RES-05/RES-06)
// y lista pública en orden cronológico descendente con autor (email
// truncado), fecha y contenido. getUser() está cacheado con cache() de React
// (el header del layout lo llama en el mismo request); la valoración, la
// reseña propia y el rol solo se consultan si hay sesión. listReseñasSerie
// necesita el cliente service-role: el embed usuario(email) está oculto para
// anon por usuario_select_authenticated (el email completo solo vive
// server-side; la UI lo trunca).
export async function ReseñasSection({
  serieId,
  serieSlug
}: {
  serieId: string
  serieSlug: string
}) {
  const user = await getUser()

  let haValorado = false
  let reseñaPropia: ReseñaPropia | null = null
  let esMod = false
  if (user) {
    const client = await createAuthClient()
    const [nota, propia, rol] = await Promise.all([
      getValoracionUsuario(serieId, user.id),
      getReseñaUsuario(client, serieId, user.id),
      getRolUsuario(client, user.id)
    ])
    haValorado = nota !== null
    reseñaPropia = propia
    esMod = rol === 'mod' || rol === 'admin'
  }

  const reseñas = await listReseñasSerie(createServiceRoleClient(), serieId)

  return (
    <section className="space-y-4" aria-labelledby="resenas-heading">
      <h2 id="resenas-heading" className="text-xl font-semibold tracking-tight">
        Reseñas
      </h2>

      <ReseñaForm
        serieSlug={serieSlug}
        conSesion={user !== null}
        haValorado={haValorado}
        reseñaPropia={reseñaPropia}
      />

      {reseñas.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="Aún no hay reseñas"
          description="Sé la primera persona en reseñar esta serie."
        />
      ) : (
        <ul className="space-y-4">
          {reseñas.map((reseña) => {
            // RES-04 + RES-09: el botón lo ve el dueño o mod/admin; un user
            // normal no lo ve en reseñas ajenas.
            const puedeEliminar = user !== null && (reseña.autor.id === user.id || esMod)
            return (
              <li key={reseña.id} className="rounded-xl border bg-card p-4">
                <article className="space-y-2">
                  <header className="flex items-start justify-between gap-3">
                    <p className="text-sm">
                      <span className="font-medium">{truncarEmail(reseña.autor.email ?? '')}</span>
                      <span className="text-muted-foreground">
                        {' · '}
                        <time dateTime={reseña.created_at}>
                          {formatoFecha.format(new Date(reseña.created_at))}
                        </time>
                      </span>
                    </p>
                    {puedeEliminar ? (
                      <ReseñaDeleteButton reseñaId={reseña.id} serieSlug={serieSlug} />
                    ) : null}
                  </header>
                  <p className="whitespace-pre-wrap text-sm">{reseña.contenido}</p>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
