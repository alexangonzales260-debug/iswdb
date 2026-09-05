'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createAuthClient, requireUser } from './auth'
import {
  añadirSerieALista,
  cambiarDescripcionLista,
  crearLista,
  eliminarLista,
  ERRORES_LISTA,
  quitarSerieDeLista,
  renombrarLista,
  reordenarLista
} from './listas'
import {
  invitarColaborador,
  quitarColaborador,
  cambiarRolColaborador
} from './listas-colaborativas'

export interface ListaActionState {
  error?: string
}

// F013 · Server Actions de listas (patrón valoraciones-actions/reseñas-actions).
// La lógica de negocio (Zod, sesión, propiedad, serie aprobada) vive en los
// servicios de lib/listas.ts; estas actions solo orquestan: guard de sesión
// (AUTH-06, sin sesión → /login con next y msg) → cliente con cookies →
// servicio → revalidación acotada (plan, decisión 6). En fallo devuelven
// { error } para que el cliente lo pinte sin navegar.

// Crea una lista (LIS-01) y redirige a su detalle. useActionState: recibe
// (prev, formData). requireUser conserva la vuelta a /listas.
export async function accionCrearLista(
  _prev: ListaActionState,
  formData: FormData
): Promise<ListaActionState> {
  await requireUser({ next: '/listas', message: ERRORES_LISTA.sinSesion })
  const client = await createAuthClient()

  let id: string
  try {
    id = (
      await crearLista(client, {
        nombre: String(formData.get('nombre') ?? ''),
        descripcion: String(formData.get('descripcion') ?? '') || null,
        es_publica: formData.get('es_publica') === 'on'
      })
    ).id
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo crear la lista'
    }
  }

  revalidatePath('/listas')
  redirect(`/listas/${id}`)
}

// Renombra una lista propia (LIS-02). El bind del listaId se hace en el
// componente (useActionState). Solo afecta al detalle y al grid.
export async function accionRenombrarLista(
  listaId: string,
  _prev: ListaActionState,
  formData: FormData
): Promise<ListaActionState> {
  await requireUser({ next: `/listas/${listaId}`, message: ERRORES_LISTA.sinSesion })
  const client = await createAuthClient()

  try {
    await renombrarLista(client, listaId, String(formData.get('nombre') ?? ''))
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo renombrar la lista'
    }
  }

  revalidatePath('/listas')
  revalidatePath(`/listas/${listaId}`)
  return {}
}

// Elimina una lista propia (LIS-03). Llamada directa (useTransition).
export async function accionEliminarLista(
  listaId: string
): Promise<ListaActionState> {
  await requireUser({ next: '/listas', message: ERRORES_LISTA.sinSesion })
  const client = await createAuthClient()

  try {
    await eliminarLista(client, listaId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo eliminar la lista'
    }
  }

  revalidatePath('/listas')
  return {}
}

// Añade una serie a una lista propia (LIS-04). Llamada directa desde el
// dropdown de la ficha. serieSlug permite revalidar la ficha en la que se
// añadió (revalidación acotada, plan decisión 6).
export async function accionAñadirSerie(
  listaId: string,
  serieId: string,
  serieSlug: string
): Promise<ListaActionState> {
  await requireUser({
    next: `/series/${serieSlug}`,
    message: ERRORES_LISTA.sinSesion
  })
  const client = await createAuthClient()

  try {
    await añadirSerieALista(client, listaId, serieId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo añadir la serie'
    }
  }

  revalidatePath('/listas')
  revalidatePath(`/listas/${listaId}`)
  revalidatePath(`/series/${serieSlug}`)
  return {}
}

// Quita una serie de una lista propia (LIS-05). Llamada directa desde el
// detalle (y el dropdown de la ficha).
export async function accionQuitarSerie(
  listaId: string,
  serieId: string,
  serieSlug: string
): Promise<ListaActionState> {
  await requireUser({
    next: `/listas/${listaId}`,
    message: ERRORES_LISTA.sinSesion
  })
  const client = await createAuthClient()

  try {
    await quitarSerieDeLista(client, listaId, serieId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo quitar la serie'
    }
  }

  revalidatePath('/listas')
  revalidatePath(`/listas/${listaId}`)
  revalidatePath(`/series/${serieSlug}`)
  return {}
}

// Reordena las series de una lista editable (LIS-06). serieIds es el orden
// final deseado (array de serie_id). Llamada directa (useTransition).
export async function accionReordenar(
  listaId: string,
  serieIds: string[]
): Promise<ListaActionState> {
  await requireUser({
    next: `/listas/${listaId}`,
    message: ERRORES_LISTA.sinSesion
  })
  const client = await createAuthClient()

  try {
    await reordenarLista(client, listaId, serieIds)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo reordenar la lista'
    }
  }

  revalidatePath(`/listas/${listaId}`)
  return {}
}

// ── Colaboradores (T3) ───────────────────────────────────────────────────────

// Invita un colaborador a la lista (COL-01/05). useActionState: username + rol.
export async function accionInvitarColaborador(
  listaId: string,
  _prev: ListaActionState,
  formData: FormData
): Promise<ListaActionState> {
  await requireUser({
    next: `/listas/${listaId}`,
    message: ERRORES_LISTA.sinSesion
  })
  const client = await createAuthClient()
  const { data: userData } = await client.auth.getUser()
  const invitorId = userData.user?.id

  if (!invitorId) {
    return { error: ERRORES_LISTA.sinSesion }
  }

  try {
    await invitarColaborador(client, listaId, invitorId, String(formData.get('username') ?? ''), String(formData.get('rol') ?? ''))
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo invitar al colaborador'
    }
  }

  revalidatePath(`/listas/${listaId}`)
  return {}
}

// Quita un colaborador de la lista (COL-04). Llamada directa (useTransition).
export async function accionQuitarColaborador(
  listaId: string,
  colaboradorId: string
): Promise<ListaActionState> {
  await requireUser({
    next: `/listas/${listaId}`,
    message: ERRORES_LISTA.sinSesion
  })
  const client = await createAuthClient()
  const { data: userData } = await client.auth.getUser()
  const ownerId = userData.user?.id

  if (!ownerId) {
    return { error: ERRORES_LISTA.sinSesion }
  }

  try {
    await quitarColaborador(client, listaId, ownerId, colaboradorId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo quitar al colaborador'
    }
  }

  revalidatePath(`/listas/${listaId}`)
  return {}
}

// Cambia el rol de un colaborador (COL-04). Llamada directa.
export async function accionCambiarRolColaborador(
  listaId: string,
  colaboradorId: string,
  nuevoRol: string
): Promise<ListaActionState> {
  await requireUser({
    next: `/listas/${listaId}`,
    message: ERRORES_LISTA.sinSesion
  })
  const client = await createAuthClient()
  const { data: userData } = await client.auth.getUser()
  const ownerId = userData.user?.id

  if (!ownerId) {
    return { error: ERRORES_LISTA.sinSesion }
  }

  try {
    await cambiarRolColaborador(client, listaId, ownerId, colaboradorId, nuevoRol)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo cambiar el rol'
    }
  }

  revalidatePath(`/listas/${listaId}`)
  return {}
}

// Cambia la descripción de una lista editable (COL-02). useActionState.
export async function accionCambiarDescripcionLista(
  listaId: string,
  _prev: ListaActionState,
  formData: FormData
): Promise<ListaActionState> {
  await requireUser({
    next: `/listas/${listaId}`,
    message: ERRORES_LISTA.sinSesion
  })
  const client = await createAuthClient()

  try {
    await cambiarDescripcionLista(client, listaId, String(formData.get('descripcion') ?? '') || null)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo cambiar la descripción'
    }
  }

  revalidatePath(`/listas/${listaId}`)
  return {}
}
