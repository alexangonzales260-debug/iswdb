import type { AuthClient } from './auth'

export async function darLike(
  client: AuthClient,
  reseñaId: string,
  userId: string
): Promise<void> {
  const { error } = await client
    .from('reseña_like')
    .insert({ reseña_id: reseñaId, user_id: userId })
  if (error && error.code !== '23505') throw new Error(error.message)
}

export async function quitarLike(
  client: AuthClient,
  reseñaId: string,
  userId: string
): Promise<void> {
  const { error } = await client
    .from('reseña_like')
    .delete()
    .eq('reseña_id', reseñaId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function likesPorReseñas(
  client: AuthClient,
  reseñaIds: string[]
): Promise<Map<string, number>> {
  const conteo = new Map<string, number>()
  if (reseñaIds.length === 0) return conteo
  const { data, error } = await client
    .from('reseña_like')
    .select('*')
    .in('reseña_id', reseñaIds)
  if (error) throw new Error(`likesPorReseñas: ${error.message}`)
  for (const fila of data ?? []) {
    conteo.set(fila.reseña_id, (conteo.get(fila.reseña_id) ?? 0) + 1)
  }
  return conteo
}

export async function likesPropios(
  client: AuthClient,
  reseñaIds: string[],
  userId: string | null
): Promise<Set<string>> {
  const propios = new Set<string>()
  if (!userId || reseñaIds.length === 0) return propios
  const { data, error } = await client
    .from('reseña_like')
    .select('*')
    .eq('user_id', userId)
    .in('reseña_id', reseñaIds)
  if (error) throw new Error(`likesPropios: ${error.message}`)
  for (const fila of data ?? []) propios.add(fila.reseña_id)
  return propios
}
