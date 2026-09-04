'use server'

import { revalidatePath } from 'next/cache'

import { createAuthClient, requireUser, asegurarFilaUsuario } from './auth'
import { seguirSerie, dejarDeSeguirSerie } from './follows'

export interface FollowActionState {
  error?: string
}

export async function accionSeguir(
  _prevState: FollowActionState,
  formData: FormData
): Promise<FollowActionState> {
  const serieId = formData.get('serieId') as string | null
  const serieSlug = formData.get('serieSlug') as string | null
  if (!serieId || !serieSlug) return { error: 'Faltan datos de la serie' }

  const user = await requireUser({
    next: `/series/${serieSlug}`,
    message: 'Inicia sesión para seguir series'
  })
  const client = await createAuthClient()

  try {
    await asegurarFilaUsuario(client, user.id, user.email ?? '')
    await seguirSerie(client, user.id, serieId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo seguir la serie'
    }
  }
  revalidatePath(`/series/${serieSlug}`)
  revalidatePath('/perfil/seguidas')
  return {}
}

export async function accionDejarDeSeguir(
  _prevState: FollowActionState,
  formData: FormData
): Promise<FollowActionState> {
  const serieId = formData.get('serieId') as string | null
  const serieSlug = formData.get('serieSlug') as string | null
  if (!serieId || !serieSlug) return { error: 'Faltan datos de la serie' }

  const user = await requireUser({
    next: `/series/${serieSlug}`,
    message: 'Inicia sesión para seguir series'
  })
  const client = await createAuthClient()

  try {
    await dejarDeSeguirSerie(client, user.id, serieId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo dejar de seguir la serie'
    }
  }
  revalidatePath(`/series/${serieSlug}`)
  revalidatePath('/perfil/seguidas')
  return {}
}
