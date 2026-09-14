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

export interface NotificacionComentario {
  id: string
  leida: boolean
  created_at: string
  tipo: 'nuevo_comentario'
  comentario: { id: string }
  reseña: { id: string }
  serie: { titulo: string; slug: string }
  comentarista: { username: string }
}

export type Notificacion =
  | NotificacionEpisodio
  | NotificacionSeguidor
  | NotificacionComentario

function notificacionesQuery(client: AuthClient, userId: string) {
  return client
    .from('notificacion')
    .select(
      'id, leida, created_at, tipo, seguidor_id, comentario_id, serie ( titulo, slug ), episodio ( temporada, numero, titulo )'
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

  const comentarioIds = filas
    .filter((fila) => fila.tipo === 'nuevo_comentario')
    .map((fila) => fila.comentario_id)
    .filter((id): id is string => id !== null)

  const usernames = new Map<string, string>()
  const comentarios = new Map<string, { reseña_id: string; user_id: string }>()
  const reseñas = new Map<string, { serie_id: string }>()
  const series = new Map<string, { titulo: string; slug: string }>()

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

  if (comentarioIds.length > 0) {
    const serviceRole = createServiceRoleClient()
    const { data: dataComentarios, error: errorComentarios } = await serviceRole
      .from('comentario')
      .select('*')
      .in('id', comentarioIds)
    if (errorComentarios) throw new Error(`listMisNotificaciones: ${errorComentarios.message}`)

    const reseñaIds = (dataComentarios ?? []).map((comentario) => comentario.reseña_id)
    for (const comentario of dataComentarios ?? []) {
      comentarios.set(comentario.id, { reseña_id: comentario.reseña_id, user_id: comentario.user_id })
    }

    if (reseñaIds.length > 0) {
      const { data: dataReseñas, error: errorReseñas } = await serviceRole
        .from('reseña')
        .select('*')
        .in('id', reseñaIds)
      if (errorReseñas) throw new Error(`listMisNotificaciones: ${errorReseñas.message}`)

      const serieIds = (dataReseñas ?? []).map((reseña) => reseña.serie_id)
      for (const reseña of dataReseñas ?? []) {
        reseñas.set(reseña.id, { serie_id: reseña.serie_id })
      }

      if (serieIds.length > 0) {
        const { data: dataSeries, error: errorSeries } = await serviceRole
          .from('serie')
          .select('id, titulo, slug')
          .in('id', serieIds)
        if (errorSeries) throw new Error(`listMisNotificaciones: ${errorSeries.message}`)
        for (const serie of dataSeries ?? []) {
          series.set(serie.id, { titulo: serie.titulo, slug: serie.slug })
        }
      }
    }

    const comentaristaIds = (dataComentarios ?? []).map((comentario) => comentario.user_id)
    if (comentaristaIds.length > 0) {
      const { data: dataUsuarios, error: errorUsuariosComentario } = await serviceRole
        .from('usuario')
        .select('id, username')
        .in('id', comentaristaIds)
      if (errorUsuariosComentario)
        throw new Error(`listMisNotificaciones: ${errorUsuariosComentario.message}`)
      for (const usuario of dataUsuarios ?? []) {
        usernames.set(usuario.id, usuario.username)
      }
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
      if (fila.tipo === 'nuevo_comentario') {
        const comentarioId = fila.comentario_id
        if (comentarioId === null) return null
        const comentario = comentarios.get(comentarioId)
        if (!comentario) return null
        const reseña = reseñas.get(comentario.reseña_id)
        if (!reseña) return null
        const serie = series.get(reseña.serie_id)
        if (!serie) return null
        const username = usernames.get(comentario.user_id)
        if (username === undefined) return null
        return {
          id: fila.id,
          leida: fila.leida,
          created_at: fila.created_at,
          tipo: 'nuevo_comentario',
          comentario: { id: comentarioId },
          reseña: { id: comentario.reseña_id },
          serie,
          comentarista: { username }
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

export async function notificarNuevoComentario(
  serviceRoleClient: AuthClient,
  autorResenaId: string,
  comentarioId: string
): Promise<void> {
  const { error } = await serviceRoleClient.from('notificacion').insert({
    usuario_id: autorResenaId,
    comentario_id: comentarioId,
    tipo: 'nuevo_comentario',
    serie_id: null,
    episodio_id: null,
    seguidor_id: null
  })
  if (error) throw new Error(`notificarNuevoComentario: ${error.message}`)
}
