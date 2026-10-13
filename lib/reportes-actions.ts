'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createAuthClient, getUser, requireUser } from './auth'
import { requireMod } from './admin'
import {
  crearReporte,
  eliminarReporte,
  ERRORES_REPORTE,
  tipoReporteSchema,
  motivoReporteSchema,
  actualizarEstadoReporte
} from './reportes'

export interface ReporteActionState {
  error?: string
  success?: boolean
}

// F028 (REP-01): crea un reporte. requireUser redirige a /login si no hay
// sesión (AUTH-06). Zod valida motivo (1-2000) y descripción opcional (máx 500).
// El servicio crea la fila; revalida la ruta del contenido reportado para que
// el UI refleje el cambio.
export async function accionCrearReporte(
  tipo: z.infer<typeof tipoReporteSchema>,
  idObjetivo: string,
  _prev: ReporteActionState,
  formData: FormData
): Promise<ReporteActionState> {
  const user = await requireUser()
  const client = await createAuthClient()

  const tipoParsed = tipoReporteSchema.safeParse(tipo)
  if (!tipoParsed.success) {
    return { error: 'Tipo de reporte no válido' }
  }

  const motivoRaw = String(formData.get('motivo') ?? '')
  const motivoParsed = motivoReporteSchema.safeParse(motivoRaw)
  if (!motivoParsed.success) {
    return { error: motivoParsed.error.issues[0]?.message ?? ERRORES_REPORTE.motivoInvalido }
  }

  const descripcionRaw = String(formData.get('descripcion') ?? '')
  const descripcion = descripcionRaw.trim() || undefined
  if (descripcion && descripcion.length > 500) {
    return { error: ERRORES_REPORTE.descripcionMuyLarga }
  }

  try {
    const { error } = await crearReporte(client, { tipo: tipoParsed.data, idObjetivo, motivo: motivoParsed.data, descripcion }, user.id)
    if (error) {
      return { error: error.message }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : ERRORES_REPORTE.sinSesion }
  }

  // Revalidar la ruta del recurso reportado para que el estado se actualice
  // sin recarga completa.
  switch (tipoParsed.data) {
    case 'serie':
      revalidatePath('/series', 'layout')
      break
    case 'episodio':
      revalidatePath('/', 'layout')
      break
    case 'reseña':
      revalidatePath(`/resenas/${idObjetivo}`)
      break
    case 'comentario':
      revalidatePath('/', 'layout')
      break
  }

  return { success: true }
}

// F028 (REP-04/05): mod/admin actualiza el estado de un reporte. requireMod
// lanza notFound() para users/anon (defensa en profundidad, ADM-04).
export async function accionActualizarEstadoReporte(
  id: string,
  nuevoEstado: 'pendiente' | 'revisado' | 'descartado'
): Promise<ReporteActionState> {
  const client = await createAuthClient()
  const user = await getUser()
  await requireMod(client, user)

  try {
    const { error } = await actualizarEstadoReporte(client, id, nuevoEstado)
    if (error) {
      return { error: error.message }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo actualizar el reporte' }
  }

  revalidatePath('/admin/reportes')
  return { success: true }
}

// F028 (REP-05): mod/admin elimina un reporte.
export async function accionEliminarReporte(id: string): Promise<ReporteActionState> {
  const client = await createAuthClient()
  const user = await getUser()
  await requireMod(client, user)

  try {
    const { error } = await eliminarReporte(client, id)
    if (error) {
      return { error: error.message }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo eliminar el reporte' }
  }

  revalidatePath('/admin/reportes')
  return { success: true }
}
