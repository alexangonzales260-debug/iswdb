import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabaseServer } from './supabase'

export const PAGE_SIZE = 12

const SERIE_SELECT = `
  id,
  titulo,
  slug,
  portada_url,
  anio_inicio,
  created_at,
  categoria ( nombre, slug ),
  participa ( canal ( nombre, handle ) ),
  valoracion ( nota )
` as const

function serieAprobadaQuery() {
  return supabaseServer.from('serie').select(SERIE_SELECT).eq('moderation_status', 'aprobada')
}

type SerieRow = NonNullable<Awaited<ReturnType<typeof serieAprobadaQuery>>['data']>[number]

export interface SerieRating {
  average: number
  count: number
}

export interface SerieCard {
  id: string
  titulo: string
  slug: string
  portada_url: string | null
  anio_inicio: number | null
  created_at: string
  categoria: { nombre: string; slug: string } | null
  canales: { nombre: string; handle: string }[]
  rating: SerieRating | null
}

async function unwrap<T>(p: PromiseLike<PostgrestSingleResponse<T>>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

function toSerieCard(row: SerieRow): SerieCard {
  const notas = row.valoracion.map((v) => v.nota)
  const rating: SerieRating | null =
    notas.length > 0
      ? {
          average: Math.round((notas.reduce((suma, n) => suma + n, 0) / notas.length) * 10) / 10,
          count: notas.length
        }
      : null

  return {
    id: row.id,
    titulo: row.titulo,
    slug: row.slug,
    portada_url: row.portada_url,
    anio_inicio: row.anio_inicio,
    created_at: row.created_at,
    categoria: row.categoria ? { nombre: row.categoria.nombre, slug: row.categoria.slug } : null,
    canales: row.participa
      .map((p) => p.canal)
      .filter((canal): canal is NonNullable<typeof canal> => canal !== null)
      .map((canal) => ({ nombre: canal.nombre, handle: canal.handle })),
    rating
  }
}

function byRatingDesc(a: SerieCard, b: SerieCard): number {
  const diferencia = (b.rating?.average ?? 0) - (a.rating?.average ?? 0)
  if (diferencia !== 0) return diferencia
  return b.created_at.localeCompare(a.created_at)
}

// Opción A (plan 003): AVG(nota) se calcula server-side en TS; PostgREST no
// puede ordenar el padre por un agregado del hijo. Catálogo pequeño por diseño.
export async function getTopSeries(limit = 5): Promise<SerieCard[]> {
  const rows = await unwrap(serieAprobadaQuery())
  return rows.map(toSerieCard).filter((serie) => serie.rating !== null).sort(byRatingDesc).slice(0, limit)
}

export async function getHeroSerie(): Promise<SerieCard | null> {
  const [hero] = await getTopSeries(1)
  return hero ?? null
}

export async function getLatestSeries(limit = 10): Promise<SerieCard[]> {
  const rows = await unwrap(
    serieAprobadaQuery().order('created_at', { ascending: false }).limit(limit)
  )
  return rows.map(toSerieCard)
}

export interface ListSeriesOptions {
  categoria?: string
  canal?: string
  page?: number
}

export interface ListSeriesResult {
  series: SerieCard[]
  total: number
  totalPages: number
}

async function getSerieIdsByCanal(handle: string): Promise<string[]> {
  const canal = await unwrap(supabaseServer.from('canal').select('id').eq('handle', handle).maybeSingle())
  if (!canal) return []
  const filas = await unwrap(supabaseServer.from('participa').select('serie_id').eq('canal_id', canal.id))
  return [...new Set(filas.map((fila) => fila.serie_id))]
}

export async function listSeries(options: ListSeriesOptions = {}): Promise<ListSeriesResult> {
  const page = Math.max(1, Math.floor(options.page ?? 1))

  // Filtro por canal en 2 pasos: el embed !inner filtraría también la lista de
  // canales mostrada en cada tarjeta; así cada tarjeta conserva todos sus canales.
  let serieIdsPorCanal: string[] | null = null
  if (options.canal) {
    serieIdsPorCanal = await getSerieIdsByCanal(options.canal)
    if (serieIdsPorCanal.length === 0) return { series: [], total: 0, totalPages: 0 }
  }

  let query = supabaseServer
    .from('serie')
    .select(SERIE_SELECT, { count: 'exact' })
    .eq('moderation_status', 'aprobada')
  if (options.categoria) {
    query = query.eq('categoria.slug', options.categoria)
  }
  if (serieIdsPorCanal) {
    query = query.in('id', serieIdsPorCanal)
  }

  const desde = (page - 1) * PAGE_SIZE
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(desde, desde + PAGE_SIZE - 1)

  if (error) throw new Error(`listSeries: ${error.message}`)

  const total = count ?? 0
  return {
    series: (data ?? []).map(toSerieCard),
    total,
    totalPages: Math.ceil(total / PAGE_SIZE)
  }
}
