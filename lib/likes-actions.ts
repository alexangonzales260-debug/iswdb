'use server'

import { revalidatePath } from 'next/cache'

import { createAuthClient, requireUser, asegurarFilaUsuario } from './auth'
import { darLike, quitarLike } from './likes'

export interface LikeActionState {
  error?: string
}

export async function accionToggleLike(
  _prevState: LikeActionState,
  formData: FormData
): Promise<LikeActionState> {
  const reseñaId = formData.get('reseñaId') as string | null
  const serieSlug = formData.get('serieSlug') as string | null
  const reseñaPageId = formData.get('reseñaPageId') as string | null
  const accion = formData.get('accion') as 'dar' | 'quitar' | null
  if (!reseñaId || !serieSlug || !accion) {
    return { error: 'Faltan datos para votar' }
  }

  const user = await requireUser({
    next: `/series/${serieSlug}`,
    message: 'Inicia sesión para votar'
  })
  const client = await createAuthClient()

  try {
    await asegurarFilaUsuario(client, user.id, user.email ?? '')
    if (accion === 'dar') {
      await darLike(client, reseñaId, user.id)
    } else {
      await quitarLike(client, reseñaId, user.id)
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo registrar el voto'
    }
  }

  revalidatePath(`/series/${serieSlug}`)
  if (reseñaPageId) {
    revalidatePath(`/resenas/${reseñaPageId}`)
  }
  return {}
}
