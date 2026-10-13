import { z } from 'zod'
import type { AuthClient } from './auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const ERRORES_REPORTE = {
  sinSesion: 'Debes iniciar sesión para reportar contenido',
  propioContenido: 'No puedes reportar tu propio contenido',
  yaReportado: 'Ya has reportado este contenido',
  motivoInvalido: 'El motivo no puede estar vacío ni superar los 2000 caracteres',
  contenidoNoEncontrado: 'El contenido no fue encontrado',
  descripcionMuyLarga: 'La descripción no puede superar los 500 caracteres'
} as const

export const motivoReporteSchema = z
  .string()
  .trim()
  .min(1, ERRORES_REPORTE.motivoInvalido)
  .max(2000, ERRORES_REPORTE.motivoInvalido)

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

export type TipoReporte = 'serie' | 'episodio' | 'reseña' | 'comentario'
export type EstadoReporte = 'pendiente' | 'revisado' | 'descartado'

export const tipoReporteSchema = z.enum(['serie', 'episodio', 'reseña', 'comentario'])

export async function reportarReseña(
  client: AuthClient,
  reportadorId: string,
  reseñaId: string,
  motivo: string,
  descripcion?: string
): Promise<void> {
  const parsed = reporteSchema.safeParse({ motivo, descripcion })
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_REPORTE.motivoInvalido)
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
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_REPORTE.motivoInvalido)
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

export async function crearReporte(
  client: SupabaseClient<Database>,
  params: { tipo: TipoReporte; idObjetivo: string; motivo: string; descripcion?: string | null },
  usuarioId: string
): Promise<{ data: { id: string } | null; error: Error | null }> {
  if (params.tipo === 'reseña') {
    try {
      await reportarReseña(client as unknown as AuthClient, usuarioId, params.idObjetivo, params.motivo, params.descripcion ?? undefined)
      return { data: null, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  }

  if (params.tipo === 'comentario') {
    try {
      await reportarComentario(client as unknown as AuthClient, usuarioId, params.idObjetivo, params.motivo, params.descripcion ?? undefined)
      return { data: null, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  }

  const motivoValido = params.motivo.length >= 1 && params.motivo.length <= 2000
  if (!motivoValido) {
    return { data: null, error: new Error(ERRORES_REPORTE.motivoInvalido) }
  }

  if (params.descripcion !== undefined && params.descripcion !== null && params.descripcion.length > 500) {
    return { data: null, error: new Error(ERRORES_REPORTE.descripcionMuyLarga) }
  }

  if (params.tipo === 'serie') {
    const { data, error } = await client
      .from('reporte')
      .insert({
        reportador_id: usuarioId,
        serie_id: params.idObjetivo,
        tipo: 'serie',
        motivo: params.motivo,
        descripcion: params.descripcion ?? null,
        estado: 'pendiente'
      })
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') return { data: null, error: new Error(ERRORES_REPORTE.yaReportado) }
      return { data: null, error: new Error(error.message) }
    }
    return { data, error: null }
  }

  if (params.tipo === 'episodio') {
    const { data, error } = await client
      .from('reporte')
      .insert({
        reportador_id: usuarioId,
        episodio_id: params.idObjetivo,
        tipo: 'episodio',
        motivo: params.motivo,
        descripcion: params.descripcion ?? null,
        estado: 'pendiente'
      })
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') return { data: null, error: new Error(ERRORES_REPORTE.yaReportado) }
      return { data: null, error: new Error(error.message) }
    }
    return { data, error: null }
  }

  return { data: null, error: new Error(ERRORES_REPORTE.motivoInvalido) }
}

export async function listMisReportes(
  client: SupabaseClient<Database>,
  usuarioId: string
): Promise<{ data: Database['public']['Tables']['reporte']['Row'][] | null; error: Error | null }> {
  const { data, error } = await client
    .from('reporte')
    .select('*')
    .eq('reportador_id', usuarioId)
    .order('created_at', { ascending: false })
  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

export async function listReportesPendientes(
  client: SupabaseClient<Database>
): Promise<{ data: Database['public']['Tables']['reporte']['Row'][] | null; error: Error | null }> {
  const { data, error } = await client
    .from('reporte')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

export async function actualizarEstadoReporte(
  client: SupabaseClient<Database>,
  reporteId: string,
  nuevoEstado: EstadoReporte
): Promise<{ data: null; error: Error | null }> {
  const { error } = await client
    .from('reporte')
    .update({ estado: nuevoEstado })
    .eq('id', reporteId)
  if (error) return { data: null, error: new Error(error.message) }
  return { data: null, error: null }
}

export async function eliminarReporte(
  client: SupabaseClient<Database>,
  reporteId: string
): Promise<{ data: null; error: Error | null }> {
  const { error } = await client
    .from('reporte')
    .delete()
    .eq('id', reporteId)
  if (error) return { data: null, error: new Error(error.message) }
  return { data: null, error: null }
}