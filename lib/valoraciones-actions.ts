'use server'

import { revalidatePath } from 'next/cache'

import { createAuthClient, requireUser } from './auth'
import { eliminarValoracion, ERRORES_VALORACION, valorarSerie } from './valoraciones'

export interface ValoracionActionState {
  error?: string
}

// VAL-01: crea o actualiza la valoración del usuario. La lógica de negocio
// (Zod 1–10, rechazo de series no aprobadas VAL-07) vive en el servicio
// (lib/valoraciones.ts); la action solo orquesta: guard de sesión (AUTH-06,
// sin sesión → /login con next y msg) → cliente con cookies → servicio →
// revalidación. En fallo devuelve { error } para que el selector lo pinte
// sin navegar.
//
// revalidatePath('/', 'layout'): una valoración afecta a ficha, home
// (top 5/hero), /series (orden WR), filmografías y /perfil; enumerar rutas
// sería frágil (decisión 9 del plan).
export async function accionValorar(
  serieSlug: string,
  nota: number
): Promise<ValoracionActionState> {
  await requireUser({
    next: `/series/${serieSlug}`,
    message: ERRORES_VALORACION.sinSesion
  })
  const client = await createAuthClient()
  try {
    await valorarSerie(client, serieSlug, nota)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo guardar la valoración'
    }
  }
  revalidatePath('/', 'layout')
  return {}
}

// VAL-02: elimina la valoración del usuario para la serie. Idempotente (el
// servicio no falla si la valoración no existe). Revalida todo el sitio por
// el mismo motivo que accionValorar.
export async function accionEliminarValoracion(
  serieSlug: string
): Promise<ValoracionActionState> {
  await requireUser({
    next: `/series/${serieSlug}`,
    message: ERRORES_VALORACION.sinSesion
  })
  const client = await createAuthClient()
  try {
    await eliminarValoracion(client, serieSlug)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo eliminar la valoración'
    }
  }
  revalidatePath('/', 'layout')
  return {}
}
