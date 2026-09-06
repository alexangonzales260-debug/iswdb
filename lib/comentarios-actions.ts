'use server'

import { revalidatePath } from 'next/cache'

import { createAuthClient, requireUser } from './auth'
import { borrarComentario, crearComentario, editarComentario, ERRORES_COMENTARIO } from './comentarios'

export interface ComentarioActionState {
  error?: string
}

// COM-01: crea un comentario del usuario en la reseña. La lógica (Zod 1-1000,
// reseña pública) vive en el servicio (lib/comentarios.ts); la action solo
// orquesta: guard de sesión (AUTH-06, sin sesión → /login con next y msg) →
// cliente con cookies → servicio con user.id → revalidación. En fallo devuelve
// { error } para que el form lo pinte sin navegar.
export async function accionCrearComentario(
  reseñaId: string,
  _prev: ComentarioActionState,
  formData: FormData
): Promise<ComentarioActionState> {
  const user = await requireUser({
    next: `/resenas/${reseñaId}`,
    message: ERRORES_COMENTARIO.sinSesion
  })
  const client = await createAuthClient()
  try {
    await crearComentario(client, reseñaId, user.id, String(formData.get('contenido') ?? ''))
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo publicar el comentario'
    }
  }
  revalidatePath(`/resenas/${reseñaId}`)
  return {}
}

// COM-02: edita el comentario propio. Mismo patrón que accionCrearComentario;
// el bind del comentarioId se hace en el componente (useActionState).
export async function accionEditarComentario(
  reseñaId: string,
  comentarioId: string,
  _prev: ComentarioActionState,
  formData: FormData
): Promise<ComentarioActionState> {
  const user = await requireUser({
    next: `/resenas/${reseñaId}`,
    message: ERRORES_COMENTARIO.sinSesion
  })
  const client = await createAuthClient()
  try {
    await editarComentario(client, comentarioId, user.id, String(formData.get('contenido') ?? ''))
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo guardar el comentario'
    }
  }
  revalidatePath(`/resenas/${reseñaId}`)
  return {}
}

// COM-03: borra el comentario propio (lo decide el servicio + RLS delete_own).
// Llamada directa desde el botón con useTransition (no es un form; patrón
// reseña-delete-button).
export async function accionBorrarComentario(
  reseñaId: string,
  comentarioId: string
): Promise<ComentarioActionState> {
  const user = await requireUser({
    next: `/resenas/${reseñaId}`,
    message: ERRORES_COMENTARIO.sinSesion
  })
  const client = await createAuthClient()
  try {
    await borrarComentario(client, comentarioId, user.id)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo eliminar el comentario'
    }
  }
  revalidatePath(`/resenas/${reseñaId}`)
  return {}
}