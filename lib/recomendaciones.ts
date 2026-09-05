// F020 · Recomendaciones personalizadas: servicios inyectables.
// Mismo patrón que lib/follows.ts / lib/valoraciones.ts: reciben el cliente por
// parámetro. Las lecturas de usuario_serie/valoracion/serie se hacen con el
// cliente de sesión (RLS); el conteo GLOBAL de seguidores (REC-06) sale con el
// cliente service-role, porque usuario_serie tiene RLS solo-propio (M11 lo
// autoriza: "service_role queda fuera del RLS para las lecturas server-side",
// mismo criterio que D25). Sin ML, sin librerías, sin caché (decisión 2).

import type { AuthClient } from './auth'
import { createServiceRoleClient } from './supabase'

// REC-01: las fuentes de recomendación son follows (F018) + valoraciones
// (F009) con nota >= 7. Las valoraciones con nota < 7 NO generan fuentes pero
// SÍ excluyen (REC-03: una serie "valorada" nunca se recomienda, cualquier
// nota), decisión confirmada en planificación.
export const NOTA_MINIMA_FUENTE = 7

export interface RecomendacionSerie {
  id: string
  titulo: string
  slug: string
  portada_url: string | null
  anio_inicio: number | null
  categoria: { nombre: string; slug: string } | null
}

export interface Recomendacion {
  serie: RecomendacionSerie
  razon: string
}

// Fuente de recomendación: serie del usuario que aporta una categoría y la
// razón ("Porque sigues X" / "Porque valoraste X"). Si una serie está en ambos
// sets prioriza "seguida" (decisión 1).
interface Fuente {
  serieId: string
  created_at: string
  kind: 'seguida' | 'valorada'
}

// SELECT común de candidatas (getRecomendaciones y getSeriesSimilares). La
// categoria embed sale nullable por PostgREST; el filtro `!inner` no aplica
// aquí porque la categoría es dato a mostrar, no filtro del padre.
function seriesCandidatasQuery(client: AuthClient) {
  return client
    .from('serie')
    .select(
      'id, titulo, slug, portada_url, anio_inicio, created_at, categoria_id, categoria ( nombre, slug )'
    )
    .eq('moderation_status', 'aprobada')
}

type FilaSerieCandidata = NonNullable<
  Awaited<ReturnType<typeof seriesCandidatasQuery>>['data']
>[number]

function toRecomendacionSerie(fila: FilaSerieCandidata): RecomendacionSerie {
  return {
    id: fila.id,
    titulo: fila.titulo,
    slug: fila.slug,
    portada_url: fila.portada_url,
    anio_inicio: fila.anio_inicio,
    categoria: fila.categoria
      ? { nombre: fila.categoria.nombre, slug: fila.categoria.slug }
      : null
  }
}

// Nº de seguidores (usuario_serie) por serie candidata. El RLS de
// usuario_serie es solo-propio (D24), así que el conteo GLOBAL se lee con
// service-role. Solo alimenta el orden (REC-06); jamás expone filas ajenas.
async function seguidoresPorSerie(serieIds: string[]): Promise<Map<string, number>> {
  if (serieIds.length === 0) return new Map()
  const { data, error } = await createServiceRoleClient()
    .from('usuario_serie')
    .select('serie_id')
    .in('serie_id', serieIds)
  if (error) throw new Error(`seguidoresPorSerie: ${error.message}`)
  const conteo = new Map<string, number>()
  for (const fila of data ?? []) {
    conteo.set(fila.serie_id, (conteo.get(fila.serie_id) ?? 0) + 1)
  }
  return conteo
}

// REC-06 / orden determinista: seguidores desc; empate por created_at desc
// (patrón de orden de F003). Ordena in-place.
function ordenarPorPopularidad<T extends { id: string; created_at: string }>(
  filas: T[],
  seguidores: Map<string, number>
): T[] {
  return filas.sort((a, b) => {
    const diff = (seguidores.get(b.id) ?? 0) - (seguidores.get(a.id) ?? 0)
    if (diff !== 0) return diff
    return b.created_at.localeCompare(a.created_at)
  })
}

// Recomendaciones para un usuario (REC-01). Algoritmo de 8 pasos (decisión 1):
// 1. follows del usuario (usuario_serie, RLS own).
// 2. valoraciones >= 7 como fuentes (valoracion, lectura pública D11).
// 3. orden canónico determinista: follows por created_at asc, luego valoradas
//    >= 7 por created_at asc (sin repetir las ya seguidas); "seguida" manda.
// 4. categoria_id de cada fuente.
// 5. candidatas aprobadas en esas categorías.
// 6. popularidad: nº de seguidores por candidata (service-role).
// 7. orden por seguidores desc (tie created_at desc) y slice(limit).
// 8. razón: primera fuente con la misma categoría.
export async function getRecomendaciones(
  client: AuthClient,
  userId: string,
  limit = 6
): Promise<Recomendacion[]> {
  // Paso 1: follows (RLS usuario_serie_select_own: solo las propias filas).
  const followResp = await client
    .from('usuario_serie')
    .select('serie_id, created_at')
    .eq('usuario_id', userId)
  if (followResp.error) throw new Error(`getRecomendaciones: ${followResp.error.message}`)

  // Paso 2 (fuentes): valoraciones >= 7 con su created_at para el orden del
  // paso 3. .gte = "valoradas altas" (F009).
  const fuentesResp = await client
    .from('valoracion')
    .select('serie_id, created_at')
    .eq('user_id', userId)
    .gte('nota', NOTA_MINIMA_FUENTE)
  if (fuentesResp.error) throw new Error(`getRecomendaciones: ${fuentesResp.error.message}`)

  // REC-03: exclusión = follows ∪ TODAS las valoradas (cualquier nota). La
  // lectura de valoracion es pública (D11), filtrada server-side por user_id.
  const exclusionResp = await client
    .from('valoracion')
    .select('serie_id')
    .eq('user_id', userId)
  if (exclusionResp.error) throw new Error(`getRecomendaciones: ${exclusionResp.error.message}`)

  const excluidas = new Set(exclusionResp.data?.map((v) => v.serie_id) ?? [])
  for (const fila of followResp.data ?? []) excluidas.add(fila.serie_id)

  // Paso 3: fuentes en orden canónico (solo las que no están ya seguidas se
  // añaden como "valorada").
  const seguidaPorId = new Map(
    [...(followResp.data ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((fila) => [fila.serie_id, fila.created_at] as const)
  )
  const fuentes: Fuente[] = [...seguidaPorId.entries()].map(([serieId, created_at]) => ({
    serieId,
    created_at,
    kind: 'seguida'
  }))
  for (const fila of [...(fuentesResp.data ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  )) {
    if (!seguidaPorId.has(fila.serie_id)) {
      fuentes.push({ serieId: fila.serie_id, created_at: fila.created_at, kind: 'valorada' })
    }
  }
  if (fuentes.length === 0) return []

  // Paso 4: título + categoría de cada fuente (para la razón y el filtro).
  const fuentesSeriesResp = await client
    .from('serie')
    .select('id, titulo, categoria_id')
    .in('id', fuentes.map((f) => f.serieId))
  if (fuentesSeriesResp.error) {
    throw new Error(`getRecomendaciones: ${fuentesSeriesResp.error.message}`)
  }

  const razonPorCategoria = new Map<string, { titulo: string; kind: Fuente['kind'] }>()
  const categoriasFuente = new Set<string>()
  for (const fuente of fuentes) {
    const fila = fuentesSeriesResp.data?.find((s) => s.id === fuente.serieId)
    if (!fila) continue
    categoriasFuente.add(fila.categoria_id)
    if (!razonPorCategoria.has(fila.categoria_id)) {
      razonPorCategoria.set(fila.categoria_id, { titulo: fila.titulo, kind: fuente.kind })
    }
  }
  if (categoriasFuente.size === 0) return []

  // Paso 5: candidatas aprobadas en las categorías fuente; filtro en TS del
  // set de exclusión (REC-03: sin seguidas ni valoradas en el output).
  const candidatasResp = await seriesCandidatasQuery(client).in('categoria_id', [
    ...categoriasFuente
  ])
  if (candidatasResp.error) throw new Error(`getRecomendaciones: ${candidatasResp.error.message}`)
  const candidatas = (candidatasResp.data ?? []).filter((c) => !excluidas.has(c.id))

  // Paso 6: popularidad por candidata.
  const seguidores = await seguidoresPorSerie(candidatas.map((c) => c.id))

  // Pasos 7-8: orden por seguidores desc (REC-06) + razón de la primera fuente
  // con la misma categoría (determinista por el orden canónico del paso 3).
  const ordenadas = ordenarPorPopularidad(candidatas, seguidores)

  const recomendaciones: Recomendacion[] = []
  for (const candidata of ordenadas.slice(0, limit)) {
    const fuente = razonPorCategoria.get(candidata.categoria_id)
    if (!fuente) continue
    recomendaciones.push({
      serie: toRecomendacionSerie(candidata),
      razon:
        fuente.kind === 'seguida'
          ? `Porque sigues ${fuente.titulo}`
          : `Porque valoraste ${fuente.titulo}`
    })
  }
  return recomendaciones
}

// Series similares a una serie dada (REC-04): misma categoría, excluyendo la
// actual, ordenadas por popularidad (REC-06). Público: no requiere sesión y la
// razón no aplica.
export async function getSeriesSimilares(
  client: AuthClient,
  serieId: string,
  limit = 4
): Promise<RecomendacionSerie[]> {
  const serieResp = await client
    .from('serie')
    .select('categoria_id')
    .eq('id', serieId)
    .maybeSingle()
  if (serieResp.error) throw new Error(`getSeriesSimilares: ${serieResp.error.message}`)
  if (!serieResp.data) return []

  const similaresResp = await seriesCandidatasQuery(client)
    .eq('categoria_id', serieResp.data.categoria_id)
    .neq('id', serieId)
  if (similaresResp.error) throw new Error(`getSeriesSimilares: ${similaresResp.error.message}`)

  const seguidores = await seguidoresPorSerie((similaresResp.data ?? []).map((s) => s.id))
  return ordenarPorPopularidad(similaresResp.data ?? [], seguidores)
    .slice(0, limit)
    .map(toRecomendacionSerie)
}