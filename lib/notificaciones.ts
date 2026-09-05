import type { AuthClient } from './auth'
import { createServiceRoleClient } from './supabase'

// F019 · Notificaciones de nuevos episodios: servicios inyectables.
// Mismo patrón que lib/follows.ts (F018): todas las funciones reciben el
// cliente por parámetro (las Server Actions pasan createAuthClient(); los
// tests, clientes planos con sesión en memoria). El RLS de notificacion (M12,
// usuario_id = auth.uid()) garantiza el alcance de lectura/escritura a las
// propias. La generación (notificarNuevoEpisodio) recibe un cliente
// service-role por parámetro porque el RLS de insert está restringido a
// service_role.

export interface NotificacionEpisodio {
  id: string
  leida: boolean
  created_at: string
  tipo: 'nuevo_episodio'
  serie: { titulo: string; slug: string }
  episodio: { temporada: number; numero: number; titulo: string }
}

export interface NotificacionSeguidor {
  id: string
  leida: boolean
  created_at: string
  tipo: 'nuevo_seguidor'
  seguidor: { username: string }
}

export type Notificacion = NotificacionEpisodio | NotificacionSeguidor

function notificacionesQuery(client: AuthClient, userId: string) {
  return client
    .from('notificacion')
    .select(
      'id, leida, created_at, tipo, seguidor_id, serie ( titulo, slug ), episodio ( temporada, numero, titulo )'
    )
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
}

export async function listMisNotificaciones(
  client: AuthClient,
  userId: string
): Promise<Notificacion[]> {
  const { data, error } = await notificacionesQuery(client, userId)
  if (error) throw new Error(`listMisNotificaciones: ${error.message}`)

  const filas = data ?? []
  const seguidorIds = filas
    .filter((fila) => fila.tipo === 'nuevo_seguidor')
    .map((fila) => fila.seguidor_id)
    .filter((id): id is string => id !== null)

  const usernames = new Map<string, string>()
  if (seguidorIds.length > 0) {
    const { data: usuarios, error: errorUsuarios } = await createServiceRoleClient()
      .from('usuario')
      .select('id, username')
      .in('id', seguidorIds)
    if (errorUsuarios) throw new Error(`listMisNotificaciones: ${errorUsuarios.message}`)
    for (const usuario of usuarios ?? []) {
      usernames.set(usuario.id, usuario.username)
    }
  }

  return filas
    .map((fila): Notificacion | null => {
      if (fila.tipo === 'nuevo_seguidor') {
        const username =
          fila.seguidor_id !== null ? usernames.get(fila.seguidor_id) : undefined
        if (username === undefined) return null
        return {
          id: fila.id,
          leida: fila.leida,
          created_at: fila.created_at,
          tipo: 'nuevo_seguidor',
          seguidor: { username }
        }
      }
      if (fila.tipo === 'nuevo_episodio' && fila.serie !== null && fila.episodio !== null) {
        return {
          id: fila.id,
          leida: fila.leida,
          created_at: fila.created_at,
          tipo: 'nuevo_episodio',
          serie: fila.serie,
          episodio: fila.episodio
        }
      }
      return null
    })
    .filter((n): n is Notificacion => n !== null)
}

// Marcar una notificación como leída (NOT-04). El filtro usuario_id garantiza
// por RLS y por query que solo se marcan las propias.
export async function marcarLeida(
  client: AuthClient,
  userId: string,
  notificacionId: string
): Promise<void> {
  const { error } = await client
    .from('notificacion')
    .update({ leida: true })
    .eq('id', notificacionId)
    .eq('usuario_id', userId)
  if (error) throw new Error(`marcarLeida: ${error.message}`)
}

// Marcar todas las notificaciones del usuario como leídas (NOT-05).
export async function marcarTodasLeidas(client: AuthClient, userId: string): Promise<void> {
  const { error } = await client
    .from('notificacion')
    .update({ leida: true })
    .eq('usuario_id', userId)
    .eq('leida', false)
  if (error) throw new Error(`marcarTodasLeidas: ${error.message}`)
}

// Conteo de notificaciones no leídas del usuario (badge del header, NOT-02).
export async function contarNoLeidas(client: AuthClient, userId: string): Promise<number> {
  const { count, error } = await client
    .from('notificacion')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .eq('leida', false)
  if (error) throw new Error(`contarNoLeidas: ${error.message}`)
  return count ?? 0
}

// Generar una notificación de "nuevo episodio" por cada seguidor de la serie
// (NOT-01). Se llama desde la acción de admin tras insertar un episodio.
// Recibe por parámetro un cliente service-role (createServiceRoleClient en
// lib/supabase.ts; en tests, el dbAdmin): el insert está restringido por RLS a
// service_role. Idempotente (NOT-07): si un seguidor ya tiene una notificación
// para ese episodio (UNIQUE usuario_id, episodio_id), el upsert la ignora.
export async function notificarNuevoEpisodio(
  serviceRoleClient: AuthClient,
  serieId: string,
  episodioId: string
): Promise<void> {
  const { data: seguidores, error: errorSeguidores } = await serviceRoleClient
    .from('usuario_serie')
    .select('usuario_id')
    .eq('serie_id', serieId)
  if (errorSeguidores) throw new Error(`notificarNuevoEpisodio: ${errorSeguidores.message}`)

  if (!seguidores || seguidores.length === 0) return

  const notificaciones = seguidores.map((seguidor) => ({
    usuario_id: seguidor.usuario_id,
    serie_id: serieId,
    episodio_id: episodioId
  }))

  const { error } = await serviceRoleClient
    .from('notificacion')
    .upsert(notificaciones, { onConflict: 'usuario_id,episodio_id', ignoreDuplicates: true })
  if (error) throw new Error(`notificarNuevoEpisodio: ${error.message}`)
}

export async function notificarNuevoSeguidor(
  serviceRoleClient: AuthClient,
  seguidoId: string,
  seguidorId: string
): Promise<void> {
  const { error } = await serviceRoleClient
    .from('notificacion')
    .insert({
      usuario_id: seguidoId,
      seguidor_id: seguidorId,
      tipo: 'nuevo_seguidor',
      episodio_id: null,
      serie_id: null
    })
  if (error) throw new Error(`notificarNuevoSeguidor: ${error.message}`)
}
