import { z } from 'zod'
import type { AuthClient } from './auth'

export const ERRORES_REPORTE = {
  sinSesion: 'Debes iniciar sesión para reportar contenido',
  propioContenido: 'No puedes reportar tu propio contenido',
  yaReportado: 'Ya has reportado este contenido',
  motivoInvalido: 'El motivo seleccionado no es válido',
  contenidoNoEncontrado: 'El contenido no fue encontrado',
  descripcionMuyLarga: 'La descripción no puede superar los 500 caracteres'
} as const

export const motivoReporteSchema = z.enum(['spam', 'ofensivo', 'spoiler', 'otro'])

export const reporteSchema = z.object({
  motivo: motivoReporteSchema,
  descripcion: z
    .string()
    .trim()
    .max(500, ERRORES_REPORTE.descripcionMuyLarga)
    .optional()
    .transform((v) => (v === '' ? undefined : v))
})

export type MotivoReporte = z.infer<typeof motivoReporteSchema>

export async function reportarReseña(
  client: AuthClient,
  reportadorId: string,
  reseñaId: string,
  motivo: string,
  descripcion?: string
): Promise<void> {
  const parsed = reporteSchema.safeParse({ motivo, descripcion })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(
      issue?.path.includes('descripcion')
        ? ERRORES_REPORTE.descripcionMuyLarga
        : ERRORES_REPORTE.motivoInvalido
    )
  }

  const { data: reseña, error: reseñaError } = await client
    .from('reseña')
    .select('user_id')
    .eq('id', reseñaId)
    .maybeSingle()

  if (reseñaError) throw new Error(reseñaError.message)
  if (!reseña) throw new Error(ERRORES_REPORTE.contenidoNoEncontrado)

  if (reseña.user_id === reportadorId) {
    throw new Error(ERRORES_REPORTE.propioContenido)
  }

  const { error } = await client.from('reporte').insert({
    tipo: 'reseña',
    reseña_id: reseñaId,
    motivo: parsed.data.motivo,
    descripcion: parsed.data.descripcion ?? null,
    reportador_id: reportadorId,
    estado: 'pendiente'
  })

  if (error) {
    if (error.code === '23505') throw new Error(ERRORES_REPORTE.yaReportado)
    throw new Error(error.message)
  }
}

export async function reportarComentario(
  client: AuthClient,
  reportadorId: string,
  comentarioId: string,
  motivo: string,
  descripcion?: string
): Promise<void> {
  const parsed = reporteSchema.safeParse({ motivo, descripcion })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(
      issue?.path.includes('descripcion')
        ? ERRORES_REPORTE.descripcionMuyLarga
        : ERRORES_REPORTE.motivoInvalido
    )
  }

  const { data: comentario, error: comentarioError } = await client
    .from('comentario')
    .select('user_id')
    .eq('id', comentarioId)
    .maybeSingle()

  if (comentarioError) throw new Error(comentarioError.message)
  if (!comentario) throw new Error(ERRORES_REPORTE.contenidoNoEncontrado)

  if (comentario.user_id === reportadorId) {
    throw new Error(ERRORES_REPORTE.propioContenido)
  }

  const { error } = await client.from('reporte').insert({
    tipo: 'comentario',
    comentario_id: comentarioId,
    motivo: parsed.data.motivo,
    descripcion: parsed.data.descripcion ?? null,
    reportador_id: reportadorId,
    estado: 'pendiente'
  })

  if (error) {
    if (error.code === '23505') throw new Error(ERRORES_REPORTE.yaReportado)
    throw new Error(error.message)
  }
}
