'use server'

import { revalidatePath } from 'next/cache'

import { createAuthClient, getUser } from './auth'
import { requireMod } from './admin'
import {
  aprobarSugerencia,
  eliminarSugerencia,
  rechazarSugerencia
} from './episodio-deteccion'

export interface SugerenciaActionState {
  error?: string
}

// SUG-03: mod aprueba una sugerencia → crea episodio y marca como aprobado.
export async function accionAprobarSugerencia(
  sugerenciaId: string
): Promise<SugerenciaActionState> {
  const client = await createAuthClient()
  const user = await getUser()
  await requireMod(client, user)

  try {
    await aprobarSugerencia(client, sugerenciaId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo aprobar la sugerencia' }
  }

  revalidatePath('/admin/sugerencias-episodios')
  return {}
}

// SUG-04: mod rechaza una sugerencia.
export async function accionRechazarSugerencia(
  sugerenciaId: string
): Promise<SugerenciaActionState> {
  const client = await createAuthClient()
  const user = await getUser()
  await requireMod(client, user)

  try {
    await rechazarSugerencia(client, sugerenciaId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo rechazar la sugerencia' }
  }

  revalidatePath('/admin/sugerencias-episodios')
  return {}
}

// Elimina una sugerencia completamente (solo mod).
export async function accionEliminarSugerencia(
  sugerenciaId: string
): Promise<SugerenciaActionState> {
  const client = await createAuthClient()
  const user = await getUser()
  await requireMod(client, user)

  try {
    await eliminarSugerencia(client, sugerenciaId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo eliminar la sugerencia' }
  }

  revalidatePath('/admin/sugerencias-episodios')
  return {}
}
