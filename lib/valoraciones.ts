import { z } from 'zod'
import type { AuthClient } from './auth'
import { supabaseServer } from './supabase'

// El SELECT de valoracion es público (D11: valoracion_select_public), así que
// basta el cliente anon existente filtrando por user_id server-side.
function misValoracionesQuery(userId: string) {
  return supabaseServer
    .from('valoracion')
    .select('nota, created_at, serie ( titulo, slug )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
}

type ValoracionPropiaRow = NonNullable<
  Awaited<ReturnType<typeof misValoracionesQuery>>['data']
>[number]

export interface MiValoracion {
  nota: number
  created_at: string
  serie: { titulo: string; slug: string }
}

// La FK serie_id es NOT NULL, pero PostgREST tipa el embed como nullable;
// se filtran los null por defensa (patrón de lib/series.ts).
function conSerie(
  fila: ValoracionPropiaRow
): fila is ValoracionPropiaRow & { serie: { titulo: string; slug: string } } {
  return fila.serie !== null
}

// Valoraciones del usuario para /perfil (AUTH-03): serie + nota + fecha,
// más recientes primero.
export async function listMisValoraciones(userId: string): Promise<MiValoracion[]> {
  const { data, error } = await misValoracionesQuery(userId)
  if (error) throw new Error(`listMisValoraciones: ${error.message}`)
  return (data ?? []).filter(conSerie).map((fila) => ({
    nota: fila.nota,
    created_at: fila.created_at,
    serie: fila.serie
  }))
}

// ── F009 · Lecturas para la ficha (cliente anon, D11) ─────────────────────

export interface DistribucionNota {
  nota: number
  count: number
}

// Histograma de notas de una serie (VAL-04): siempre 10 entradas, ordenadas
// 10→1 e incluyendo ceros, para que el componente pinte todas las barras.
export async function getDistribucionNotas(serieId: string): Promise<DistribucionNota[]> {
  const { data, error } = await supabaseServer
    .from('valoracion')
    .select('nota')
    .eq('serie_id', serieId)
  if (error) throw new Error(`getDistribucionNotas: ${error.message}`)

  const conteo = new Map<number, number>()
  for (const fila of data ?? []) {
    conteo.set(fila.nota, (conteo.get(fila.nota) ?? 0) + 1)
  }

  const distribucion: DistribucionNota[] = []
  for (let nota = 10; nota >= 1; nota--) {
    distribucion.push({ nota, count: conteo.get(nota) ?? 0 })
  }
  return distribucion
}

// Nota actual del usuario para una serie (selector de la ficha, VAL-04);
// null si no la ha valorado. SELECT público filtrado server-side (D11).
export async function getValoracionUsuario(
  serieId: string,
  userId: string
): Promise<number | null> {
  const { data, error } = await supabaseServer
    .from('valoracion')
    .select('nota')
    .eq('serie_id', serieId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`getValoracionUsuario: ${error.message}`)
  return data?.nota ?? null
}

// ── F009 · Escritura: servicios inyectables (cliente con sesión, F008) ────

export const ERRORES_VALORACION = {
  sinSesion: 'Debes iniciar sesión para valorar',
  notaInvalida: 'La nota debe estar entre 1 y 10',
  serieNoEncontrada: 'Serie no encontrada',
  serieNoAprobada: 'Esta serie no admite valoraciones'
} as const

const notaSchema = z
  .number()
  .int(ERRORES_VALORACION.notaInvalida)
  .min(1, ERRORES_VALORACION.notaInvalida)
  .max(10, ERRORES_VALORACION.notaInvalida)

// Usuario de la sesión del cliente inyectado; lanza si no hay sesión
// (equivalente a requireUser pero en la capa de servicio).
async function usuarioDeSesion(client: AuthClient): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error(ERRORES_VALORACION.sinSesion)
  return data.user.id
}

// La serie por slug (id + estado). serie_select_public permite leer también
// las no aprobadas: necesario para poder rechazarlas server-side (VAL-07).
async function seriePorSlug(client: AuthClient, slug: string) {
  const { data, error } = await client
    .from('serie')
    .select('id, moderation_status')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Crear o actualizar la valoración del usuario (VAL-01). Orden: validación
// Zod → sesión → resolución de la serie → rechazo server-side si no es
// aprobada (VAL-07) → upsert. El RLS (valoracion_insert_own/update_own)
// garantiza además que solo escribe su propia fila.
export async function valorarSerie(
  client: AuthClient,
  serieSlug: string,
  nota: number
): Promise<void> {
  const parsed = notaSchema.safeParse(nota)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_VALORACION.notaInvalida)
  }

  const userId = await usuarioDeSesion(client)

  const serie = await seriePorSlug(client, serieSlug)
  if (!serie) throw new Error(ERRORES_VALORACION.serieNoEncontrada)
  if (serie.moderation_status !== 'aprobada') {
    throw new Error(ERRORES_VALORACION.serieNoAprobada)
  }

  const { error } = await client
    .from('valoracion')
    .upsert(
      { user_id: userId, serie_id: serie.id, nota: parsed.data },
      { onConflict: 'user_id,serie_id' }
    )
  if (error) throw new Error(error.message)
}

// Eliminar la valoración del usuario para una serie (VAL-02). Idempotente:
// si no existe la valoración no falla. No exige que la serie sea aprobada:
// retirar tu propio voto no depende del estado de moderación.
export async function eliminarValoracion(client: AuthClient, serieSlug: string): Promise<void> {
  const userId = await usuarioDeSesion(client)

  const serie = await seriePorSlug(client, serieSlug)
  if (!serie) throw new Error(ERRORES_VALORACION.serieNoEncontrada)

  const { error } = await client
    .from('valoracion')
    .delete()
    .eq('serie_id', serie.id)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}
