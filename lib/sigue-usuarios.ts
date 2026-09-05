import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { notificarNuevoSeguidor } from './notificaciones'

export type ServiceRoleClient = SupabaseClient<Database>

export const ERRORES_SIGUE = {
  sinSesion: 'Debes iniciar sesión para seguir a otros usuarios',
  noPuedeSeguirse: 'No puedes seguirte a ti mismo',
  destinoNoEncontrado: 'El usuario que quieres seguir no existe'
} as const

export interface ItemFeedValoracion {
  tipo: 'valoracion'
  creadoEn: string
  autor: { id: string; username: string }
  serie: { titulo: string; slug: string }
  nota: number
}

export interface ItemFeedResena {
  tipo: 'resena'
  id: string
  creadoEn: string
  autor: { id: string; username: string }
  serie: { titulo: string; slug: string }
  contenido: string
}

export interface ItemFeedLista {
  tipo: 'lista'
  creadoEn: string
  autor: { id: string; username: string }
  lista: { id: string; nombre: string }
}

export type ItemFeed = ItemFeedValoracion | ItemFeedResena | ItemFeedLista

export interface ContadoresUsuario {
  seguidos: number
  seguidores: number
}

// F022 · Seguir usuarios (follow/unfollow) + feed: servicios inyectables.
// Patrón lib/follows.ts (F018): todos reciben el cliente por parámetro (las
// Server Actions pasan createAuthClient(); los tests, clientes planos). Las
// operaciones de escritura y el estado de la sesión van con el cliente de
// sesión (RLS propio de usuario_usuario: seguidor_id = auth.uid()); los
// contadores y el feed son lecturas cross-user y reciben el cliente
// service_role (D25/D27), como F021.

// Seguir a un usuario (SEG-01). El autofollow (seguidorId === seguidoId) se
// rechaza app-side con mensaje amigable; el CHECK 23514 queda de backstop. Un
// 23503 (seguido_id sin fila en public.usuario) → destinoNoEncontrado. El 23505
// (UNIQUE seguidor_id, seguido_id) se trata como éxito idempotente (doble click
// / carrera, patrón D24 seguirSerie): el follow ya existía, no se notifica. El
// RLS insert_own garantiza el alcance.
// Tras un insert realmente nuevo genera la notificación nuevo_seguidor (F023)
// con el cliente service_role (el insert de notificacion exige service_role,
// M12). Si la notificación falla se loguea y el follow se conserva
// (log-and-continue, D25).
export async function seguirUsuario(
  client: SupabaseClient<Database>,
  serviceRoleClient: ServiceRoleClient,
  seguidorId: string,
  seguidoId: string
): Promise<void> {
  if (seguidorId === seguidoId) {
    throw new Error(ERRORES_SIGUE.noPuedeSeguirse)
  }
  const { error } = await client
    .from('usuario_usuario')
    .insert({ seguidor_id: seguidorId, seguido_id: seguidoId })
  if (error && error.code === '23503') {
    throw new Error(ERRORES_SIGUE.destinoNoEncontrado)
  }
  if (error && error.code !== '23505') throw new Error(error.message)
  if (error) return
  try {
    await notificarNuevoSeguidor(serviceRoleClient, seguidoId, seguidorId)
  } catch (errorNotificacion) {
    console.error('seguirUsuario: no se pudo notificar el nuevo seguidor', errorNotificacion)
  }
}

// Dejar de seguir a un usuario (SEG-02). Idempotente: borrar 0 filas (no estaba
// siguiendo, o el follow ya no existe) no es un error.
export async function dejarDeSeguirUsuario(
  client: SupabaseClient<Database>,
  seguidorId: string,
  seguidoId: string
): Promise<void> {
  const { error } = await client
    .from('usuario_usuario')
    .delete()
    .eq('seguidor_id', seguidorId)
    .eq('seguido_id', seguidoId)
  if (error) throw new Error(error.message)
}

// Indica si el seguidor sigue al seguido (SEG-03): select maybeSingle con el
// cliente de sesión (RLS own: seguidor_id = auth.uid()).
export async function estaSiguiendoUsuario(
  client: SupabaseClient<Database>,
  seguidorId: string,
  seguidoId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('usuario_usuario')
    .select('seguido_id')
    .eq('seguidor_id', seguidorId)
    .eq('seguido_id', seguidoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data !== null
}

// Contadores de seguidos/seguidores de un usuario (SEG-04). Lectura cross-user
// con service_role (el RLS own oculta follows ajenos). seguidos = nº de filas
// con seguidor_id = userId; seguidores = nº de filas con seguido_id = userId.
export async function contadoresUsuario(
  client: ServiceRoleClient,
  userId: string
): Promise<ContadoresUsuario> {
  const [seguidos, seguidores] = await Promise.all([
    (async () => {
      const { count, error } = await client
        .from('usuario_usuario')
        .select('seguidor_id', { count: 'exact', head: true })
        .eq('seguidor_id', userId)
      if (error) throw new Error(error.message)
      return count ?? 0
    })(),
    (async () => {
      const { count, error } = await client
        .from('usuario_usuario')
        .select('seguido_id', { count: 'exact', head: true })
        .eq('seguido_id', userId)
      if (error) throw new Error(error.message)
      return count ?? 0
    })()
  ])
  return { seguidos, seguidores }
}

// Lookup del id del usuario por username (service_role). Lectura cross-user
// para resolver la FK del target sin tocar getPerfilPublico (F021) ni su RLS.
export async function getUsuarioIdPorUsername(
  client: ServiceRoleClient,
  username: string
): Promise<string | null> {
  const { data, error } = await client
    .from('usuario')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

function valoracionesFeedQuery(client: ServiceRoleClient, ids: string[], limit: number) {
  return client
    .from('valoracion')
    .select('created_at, nota, user_id, serie!inner ( titulo, slug, moderation_status )')
    .in('user_id', ids)
    .eq('serie.moderation_status', 'aprobada')
    .order('created_at', { ascending: false })
    .limit(limit)
}

type ValoracionFeedRow = NonNullable<
  Awaited<ReturnType<typeof valoracionesFeedQuery>>['data']
>[number]

function conSerieValoracionFeed(
  fila: ValoracionFeedRow
): fila is ValoracionFeedRow & { serie: { titulo: string; slug: string } } {
  return fila.serie !== null
}

function resenasFeedQuery(client: ServiceRoleClient, ids: string[], limit: number) {
  return client
    .from('reseña')
    .select('id, contenido, created_at, user_id, serie!inner ( titulo, slug, moderation_status )')
    .in('user_id', ids)
    .eq('serie.moderation_status', 'aprobada')
    .order('created_at', { ascending: false })
    .limit(limit)
}

type ResenaFeedRow = NonNullable<Awaited<ReturnType<typeof resenasFeedQuery>>['data']>[number]

function conSerieResenaFeed(
  fila: ResenaFeedRow
): fila is ResenaFeedRow & { serie: { titulo: string; slug: string } } {
  return fila.serie !== null
}

// Feed cronológico de la actividad de los usuarios seguidos (SEG-06). Con
// service_role: valoraciones + reseñas públicas + listas públicas de los
// seguidos, filtradas a series aprobadas (serie!inner + moderation_status) y
// listas es_publica = true. Se leen en paralelo (cota por fuente) y se funden
// en TS ordenando por created_at desc.
export async function listFeed(
  client: ServiceRoleClient,
  seguidorId: string,
  limit = 50
): Promise<ItemFeed[]> {
  const { data: follows, error: errorFollows } = await client
    .from('usuario_usuario')
    .select('seguido_id')
    .eq('seguidor_id', seguidorId)
    .limit(limit)
  if (errorFollows) throw new Error(errorFollows.message)

  const ids = (follows ?? []).map((f) => f.seguido_id)
  if (ids.length === 0) return []

  const autores = new Map<string, string>()
  const { data: usuarioFilas, error: errorUsuarios } = await client
    .from('usuario')
    .select('id, username')
    .in('id', ids)
  if (errorUsuarios) throw new Error(errorUsuarios.message)
  for (const fila of usuarioFilas ?? []) {
    autores.set(fila.id, fila.username)
  }

  const items: ItemFeed[] = []

  await Promise.all([
    (async () => {
      const { data: filas, error } = await valoracionesFeedQuery(client, ids, limit)
      if (error) throw new Error(error.message)
      for (const fila of (filas ?? []).filter(conSerieValoracionFeed)) {
        const username = autores.get(fila.user_id)
        if (username === undefined) continue
        items.push({
          tipo: 'valoracion',
          creadoEn: fila.created_at,
          autor: { id: fila.user_id, username },
          serie: { titulo: fila.serie.titulo, slug: fila.serie.slug },
          nota: fila.nota
        })
      }
    })(),
    (async () => {
      const { data: filas, error } = await resenasFeedQuery(client, ids, limit)
      if (error) throw new Error(error.message)
      for (const fila of (filas ?? []).filter(conSerieResenaFeed)) {
        const username = autores.get(fila.user_id)
        if (username === undefined) continue
        items.push({
          tipo: 'resena',
          id: fila.id,
          creadoEn: fila.created_at,
          autor: { id: fila.user_id, username },
          serie: { titulo: fila.serie.titulo, slug: fila.serie.slug },
          contenido: fila.contenido
        })
      }
    })(),
    (async () => {
      const { data: filas, error } = await client
        .from('lista')
        .select('id, nombre, created_at, user_id')
        .in('user_id', ids)
        .eq('es_publica', true)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      for (const fila of filas ?? []) {
        const username = autores.get(fila.user_id)
        if (username === undefined) continue
        items.push({
          tipo: 'lista',
          creadoEn: fila.created_at,
          autor: { id: fila.user_id, username },
          lista: { id: fila.id, nombre: fila.nombre }
        })
      }
    })()
  ])

  return items
    .slice()
    .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0))
    .slice(0, limit)
}
