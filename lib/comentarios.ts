import { z } from 'zod'
import type { AuthClient } from './auth'

export const ERRORES_COMENTARIO = {
  sinSesion: 'Debes iniciar sesión para comentar',
  reseñaNoEncontrada: 'Reseña no encontrada',
  comentarioNoEncontrado: 'Comentario no encontrado',
  sinPermiso: 'No tienes permiso para modificar este comentario',
  contenidoVacio: 'El comentario no puede estar vacío',
  contenidoMuyLargo: 'El comentario no puede superar los 1000 caracteres'
} as const

const contenidoSchema = z
  .string()
  .trim()
  .min(1, ERRORES_COMENTARIO.contenidoVacio)
  .max(1000, ERRORES_COMENTARIO.contenidoMuyLargo)

export interface ComentarioPublico {
  id: string
  contenido: string
  created_at: string
  autor: { id: string; username: string | null }
}

function comentariosDeReseñaQuery(client: AuthClient, reseñaId: string, limit: number) {
  return client
    .from('comentario')
    .select('id, contenido, created_at, usuario ( id, username )')
    .eq('reseña_id', reseñaId)
    .order('created_at', { ascending: false })
    .limit(limit)
}

type ComentarioFila = NonNullable<Awaited<ReturnType<typeof comentariosDeReseñaQuery>>['data']>[number]

function conAutor(
  fila: ComentarioFila
): fila is ComentarioFila & {
  usuario: { id: string; username: string | null }
} {
  return fila.usuario !== null
}

async function reseñaPublicaExiste(client: AuthClient, reseñaId: string): Promise<boolean> {
  const { data } = await client
    .from('reseña')
    .select('id, serie!inner ( moderation_status )')
    .eq('id', reseñaId)
    .eq('serie.moderation_status', 'aprobada')
    .maybeSingle()
  return data !== null
}

export async function crearComentario(
  client: AuthClient,
  reseñaId: string,
  userId: string,
  contenido: string
): Promise<ComentarioPublico> {
  const parsed = contenidoSchema.safeParse(contenido)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_COMENTARIO.contenidoVacio)
  }

  const existe = await reseñaPublicaExiste(client, reseñaId)
  if (!existe) throw new Error(ERRORES_COMENTARIO.reseñaNoEncontrada)

  const { data, error } = await client
    .from('comentario')
    .insert({ reseña_id: reseñaId, user_id: userId, contenido: parsed.data })
    .select('id, contenido, created_at, usuario ( id, username )')
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(ERRORES_COMENTARIO.reseñaNoEncontrada)

  const autor = data.usuario as { id: string; username: string | null } | null
  return {
    id: data.id,
    contenido: data.contenido,
    created_at: data.created_at,
    autor: { id: autor?.id ?? userId, username: autor?.username ?? null }
  }
}

export async function editarComentario(
  client: AuthClient,
  comentarioId: string,
  userId: string,
  contenido: string
): Promise<void> {
  const parsed = contenidoSchema.safeParse(contenido)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_COMENTARIO.contenidoVacio)
  }

  const { data, error } = await client
    .from('comentario')
    .update({ contenido: parsed.data })
    .eq('id', comentarioId)
    .eq('user_id', userId)
    .select('id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) {
    const { data: existe } = await client
      .from('comentario')
      .select('id')
      .eq('id', comentarioId)
      .maybeSingle()
    if (existe) throw new Error(ERRORES_COMENTARIO.sinPermiso)
    throw new Error(ERRORES_COMENTARIO.comentarioNoEncontrado)
  }
}

export async function borrarComentario(
  client: AuthClient,
  comentarioId: string,
  userId: string
): Promise<void> {
  const { data, error } = await client
    .from('comentario')
    .delete()
    .eq('id', comentarioId)
    .eq('user_id', userId)
    .select('id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) {
    const { data: existe } = await client
      .from('comentario')
      .select('id')
      .eq('id', comentarioId)
      .maybeSingle()
    if (existe) throw new Error(ERRORES_COMENTARIO.sinPermiso)
    throw new Error(ERRORES_COMENTARIO.comentarioNoEncontrado)
  }
}

export async function listComentariosPorReseña(
  client: AuthClient,
  reseñaId: string,
  limit = 50
): Promise<ComentarioPublico[]> {
  const existe = await reseñaPublicaExiste(client, reseñaId)
  if (!existe) throw new Error(ERRORES_COMENTARIO.reseñaNoEncontrada)

  const { data, error } = await comentariosDeReseñaQuery(client, reseñaId, limit)
  if (error) throw new Error(`listComentariosPorReseña: ${error.message}`)

  return (data ?? []).filter(conAutor).map((fila) => ({
    id: fila.id,
    contenido: fila.contenido,
    created_at: fila.created_at,
    autor: { id: fila.usuario.id, username: fila.usuario.username }
  }))
}
