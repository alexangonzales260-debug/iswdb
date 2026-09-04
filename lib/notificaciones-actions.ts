'use server'

import { revalidatePath } from 'next/cache'

import { createAuthClient, requireUser } from './auth'
import { marcarLeida, marcarTodasLeidas } from './notificaciones'

export interface NotificacionActionState {
  error?: string
}

export async function accionMarcarLeida(
  _prevState: NotificacionActionState,
  formData: FormData
): Promise<NotificacionActionState> {
  const notificacionId = formData.get('notificacionId') as string | null
  if (!notificacionId) return { error: 'Falta el id de la notificación' }

  const user = await requireUser({ next: '/perfil/notificaciones' })
  const client = await createAuthClient()

  try {
    await marcarLeida(client, user.id, notificacionId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo marcar como leída'
    }
  }
  revalidatePath('/perfil/notificaciones')
  return {}
}

export async function accionMarcarTodasLeidas(
  _prevState: NotificacionActionState,
  _formData: FormData
): Promise<NotificacionActionState> {
  const user = await requireUser({ next: '/perfil/notificaciones' })
  const client = await createAuthClient()

  try {
    await marcarTodasLeidas(client, user.id)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudieron marcar todas como leídas'
    }
  }
  revalidatePath('/perfil/notificaciones')
  return {}
}
