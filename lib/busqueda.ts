import {
  byWrDesc,
  getGlobalMeanRating,
  SERIE_SELECT,
  toSerieCard,
  unwrap,
  type SerieCard
} from './series'
import { supabaseServer } from './supabase'

export interface CanalBusqueda {
  id: string
  nombre: string
  handle: string
  avatar_url: string | null
}

// Búsqueda de series (BUS-01/BUS-07): el predicado ILIKE + unaccent vive en la
// función RPC de la migración F006 (el builder no puede invocar unaccent() en
// un filtro; allí también se escapan los comodines %, _, \). Solo series
// aprobadas; una serie coincide si su título o alguno de sus canales
// (nombre/handle) coincide con el término. Orden: WR desc (VAL-05), el mismo
// de /series; sin valoración al final, desempate created_at desc.
export async function buscarSeries(q: string): Promise<SerieCard[]> {
  const termino = q.trim()
  if (termino === '') return []
  // C de la fórmula WR (VAL-05) en paralelo con la búsqueda.
  const [filas, c] = await Promise.all([
    unwrap(supabaseServer.rpc('buscar_series', { q: termino }).select(SERIE_SELECT)),
    getGlobalMeanRating()
  ])
  return filas.sort(byWrDesc(c)).map(toSerieCard)
}

// Canales visibles en la búsqueda (BUS-07): solo los que participan en ≥1
// serie aprobada (coherente con la ficha de canal, F005). La coincidencia por
// nombre/handle y el orden nombre asc viven en el SQL de buscar_canales.
export async function buscarCanales(q: string): Promise<CanalBusqueda[]> {
  const termino = q.trim()
  if (termino === '') return []
  const filas = await unwrap(supabaseServer.rpc('buscar_canales', { q: termino }))
  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    handle: fila.handle,
    avatar_url: fila.avatar_url
  }))
}
