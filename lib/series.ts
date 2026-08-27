import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabaseServer } from './supabase'

export const PAGE_SIZE = 12

// categoria!inner: necesario para poder filtrar el padre por categoria.slug
// (sin !inner, PostgREST solo filtra el payload del embed, no las filas).
// No pierde filas: toda serie tiene categoria (FK NOT NULL) y su lectura es pública.
const SERIE_SELECT = `
  id,
  titulo,
  slug,
  portada_url,
  anio_inicio,
  created_at,
  categoria!inner ( nombre, slug ),
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

// AVG con redondeo a 1 decimal; null con 0 notas. Compartido por tarjetas y
// ficha (la fórmula WR llega en F009).
function toRating(notas: number[]): SerieRating | null {
  if (notas.length === 0) return null
  const average = Math.round((notas.reduce((suma, n) => suma + n, 0) / notas.length) * 10) / 10
  return { average, count: notas.length }
}

function toSerieCard(row: SerieRow): SerieCard {
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
    rating: toRating(row.valoracion.map((v) => v.nota))
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

// Ficha completa. Sin !inner: aquí los embeds son datos a mostrar, no filtros
// del padre (a diferencia de SERIE_SELECT, que lo necesita para categoria.slug).
const SERIE_FICHA_SELECT = `
  id,
  titulo,
  slug,
  portada_url,
  descripcion,
  estado,
  anio_inicio,
  anio_fin,
  playlist_url,
  categoria ( nombre, slug ),
  participa ( rol, canal ( nombre, handle, avatar_url ) ),
  valoracion ( nota ),
  episodio ( temporada, numero, titulo, video_id )
` as const

export interface EpisodioFicha {
  numero: number
  titulo: string
  video_id: string
}

export interface TemporadaFicha {
  numero: number
  episodios: EpisodioFicha[]
}

export interface CanalFicha {
  nombre: string
  handle: string
  avatar_url: string | null
  rol: string
}

export interface SerieFicha {
  id: string
  titulo: string
  slug: string
  portada_url: string | null
  descripcion: string | null
  estado: string
  anio_inicio: number | null
  anio_fin: number | null
  playlist_url: string | null
  categoria: { nombre: string; slug: string } | null
  canales: CanalFicha[]
  rating: SerieRating | null
  temporadas: TemporadaFicha[]
}

function serieFichaQuery(slug: string) {
  return supabaseServer
    .from('serie')
    .select(SERIE_FICHA_SELECT)
    .eq('slug', slug)
    .eq('moderation_status', 'aprobada')
}

type SerieFichaRow = NonNullable<Awaited<ReturnType<typeof serieFichaQuery>>['data']>[number]
type ParticipaFichaRow = SerieFichaRow['participa'][number]

function toCanalesFicha(filas: ParticipaFichaRow[]): CanalFicha[] {
  return filas
    .filter(
      (fila): fila is ParticipaFichaRow & { canal: NonNullable<ParticipaFichaRow['canal']> } =>
        fila.canal !== null
    )
    .map((fila) => ({
      nombre: fila.canal.nombre,
      handle: fila.canal.handle,
      avatar_url: fila.canal.avatar_url,
      rol: fila.rol
    }))
}

// Agrupación en TS: PostgREST no garantiza orden en los embeds y el catálogo
// es pequeño por diseño. Temporadas asc, episodios por numero asc.
function toTemporadas(filas: SerieFichaRow['episodio']): TemporadaFicha[] {
  const porTemporada = new Map<number, EpisodioFicha[]>()
  for (const fila of filas) {
    const episodios = porTemporada.get(fila.temporada) ?? []
    episodios.push({ numero: fila.numero, titulo: fila.titulo, video_id: fila.video_id })
    porTemporada.set(fila.temporada, episodios)
  }
  return [...porTemporada.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numero, episodios]) => ({
      numero,
      episodios: episodios.sort((a, b) => a.numero - b.numero)
    }))
}

function toSerieFicha(row: SerieFichaRow): SerieFicha {
  return {
    id: row.id,
    titulo: row.titulo,
    slug: row.slug,
    portada_url: row.portada_url,
    descripcion: row.descripcion,
    estado: row.estado,
    anio_inicio: row.anio_inicio,
    anio_fin: row.anio_fin,
    playlist_url: row.playlist_url,
    categoria: row.categoria ? { nombre: row.categoria.nombre, slug: row.categoria.slug } : null,
    canales: toCanalesFicha(row.participa),
    rating: toRating(row.valoracion.map((v) => v.nota)),
    temporadas: toTemporadas(row.episodio)
  }
}

// La ficha solo expone series aprobadas (FIC-04): pendiente/rechazada/borrador
// o slug inexistente devuelven null → la página responderá con notFound().
export async function getSerieBySlug(slug: string): Promise<SerieFicha | null> {
  const row = await unwrap(serieFichaQuery(slug).maybeSingle())
  return row ? toSerieFicha(row) : null
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

  // Count previo (head): con offset-based, una página fuera de rango devuelve
  // HTTP 416 en PostgREST; así devolvemos página vacía con el total correcto.
  let countQuery = supabaseServer
    .from('serie')
    .select('id, categoria!inner ( slug )', { count: 'exact', head: true })
    .eq('moderation_status', 'aprobada')
  if (options.categoria) countQuery = countQuery.eq('categoria.slug', options.categoria)
  if (serieIdsPorCanal) countQuery = countQuery.in('id', serieIdsPorCanal)

  const { count, error: countError } = await countQuery
  if (countError) throw new Error(`listSeries: ${countError.message}`)

  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  if (total === 0 || page > totalPages) return { series: [], total, totalPages }

  let query = supabaseServer
    .from('serie')
    .select(SERIE_SELECT)
    .eq('moderation_status', 'aprobada')
  if (options.categoria) query = query.eq('categoria.slug', options.categoria)
  if (serieIdsPorCanal) query = query.in('id', serieIdsPorCanal)

  const desde = (page - 1) * PAGE_SIZE
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(desde, desde + PAGE_SIZE - 1)

  if (error) throw new Error(`listSeries: ${error.message}`)

  return {
    series: (data ?? []).map(toSerieCard),
    total,
    totalPages
  }
}
