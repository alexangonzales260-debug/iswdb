'use server'

import { revalidatePath } from 'next/cache'

import { createAuthClient, requireUser } from './auth'
import { crearReseña, editarReseña, eliminarReseña, ERRORES_RESEÑA } from './reseñas'

export interface ReseñaActionState {
  error?: string
}

// RES-01: crea la reseña del usuario. La lógica de negocio (Zod 50-2000,
// valoración previa RES-02, serie aprobada) vive en el servicio
// (lib/reseñas.ts); la action solo orquesta: guard de sesión (AUTH-06, sin
// sesión → /login con next y msg) → cliente con cookies → servicio →
// revalidación. En fallo devuelve { error } para que el form lo pinte sin
// navegar.
//
// revalidatePath('/series/<slug>'): las reseñas solo afectan a la ficha (no
// tocan rankings/home//series como las valoraciones), así que la revalidación
// es acotada (decisión 7 del plan).
export async function accionCrearReseña(
  serieSlug: string,
  _prev: ReseñaActionState,
  formData: FormData
): Promise<ReseñaActionState> {
  await requireUser({
    next: `/series/${serieSlug}`,
    message: ERRORES_RESEÑA.sinSesion
  })
  const client = await createAuthClient()
  try {
    await crearReseña(client, serieSlug, String(formData.get('contenido') ?? ''))
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo publicar la reseña'
    }
  }
  revalidatePath(`/series/${serieSlug}`)
  return {}
}

// RES-03: edita la reseña propia. Mismo patrón que accionCrearReseña; el
// bind del reseñaId se hace en el componente (useActionState).
export async function accionEditarReseña(
  serieSlug: string,
  reseñaId: string,
  _prev: ReseñaActionState,
  formData: FormData
): Promise<ReseñaActionState> {
  await requireUser({
    next: `/series/${serieSlug}`,
    message: ERRORES_RESEÑA.sinSesion
  })
  const client = await createAuthClient()
  try {
    await editarReseña(client, reseñaId, String(formData.get('contenido') ?? ''))
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo guardar la reseña'
    }
  }
  revalidatePath(`/series/${serieSlug}`)
  return {}
}

// RES-04/RES-09: elimina una reseña (dueño o mod/admin; lo decide la política
// reseña_delete_own_or_mod y el servicio mapea 0 filas a error). Llamada
// directa desde el botón con useTransition (no es un form; patrón
// rating-selector/moderation-buttons).
export async function accionEliminarReseña(
  reseñaId: string,
  serieSlug: string
): Promise<ReseñaActionState> {
  await requireUser({
    next: `/series/${serieSlug}`,
    message: ERRORES_RESEÑA.sinSesion
  })
  const client = await createAuthClient()
  try {
    await eliminarReseña(client, reseñaId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo eliminar la reseña'
    }
  }
  revalidatePath(`/series/${serieSlug}`)
  return {}
}
