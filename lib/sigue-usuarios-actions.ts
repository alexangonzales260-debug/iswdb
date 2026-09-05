'use server'

import { revalidatePath } from 'next/cache'

import { createAuthClient, requireUser } from './auth'
import { createServiceRoleClient } from './supabase'
import { dejarDeSeguirUsuario, seguirUsuario } from './sigue-usuarios'

export interface SigueUsuarioActionState {
  error?: string
}

export async function accionSeguirUsuario(
  _prevState: SigueUsuarioActionState,
  formData: FormData
): Promise<SigueUsuarioActionState> {
  const seguidoId = formData.get('seguidoId') as string | null
  const seguidoUsername = formData.get('seguidoUsername') as string | null
  if (!seguidoId || !seguidoUsername) return { error: 'Faltan datos del usuario' }

  const user = await requireUser({ next: `/usuarios/${seguidoUsername}` })
  const client = await createAuthClient()

  try {
    await seguirUsuario(client, createServiceRoleClient(), user.id, seguidoId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo seguir al usuario'
    }
  }
  revalidatePath(`/usuarios/${seguidoUsername}`)
  revalidatePath('/feed')
  return {}
}

export async function accionDejarDeSeguirUsuario(
  _prevState: SigueUsuarioActionState,
  formData: FormData
): Promise<SigueUsuarioActionState> {
  const seguidoId = formData.get('seguidoId') as string | null
  const seguidoUsername = formData.get('seguidoUsername') as string | null
  if (!seguidoId || !seguidoUsername) return { error: 'Faltan datos del usuario' }

  const user = await requireUser({ next: `/usuarios/${seguidoUsername}` })
  const client = await createAuthClient()

  try {
    await dejarDeSeguirUsuario(client, user.id, seguidoId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo dejar de seguir al usuario'
    }
  }
  revalidatePath(`/usuarios/${seguidoUsername}`)
  revalidatePath('/feed')
  return {}
}
