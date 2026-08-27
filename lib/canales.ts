import { getGlobalMeanRating, toRating, unwrap, wrDeNotas, type SerieCard } from './series'
import { supabaseServer } from './supabase'

// Filmografía de canal (CAN-01): un único query con embeds anidados. El filtro
// participa.serie.moderation_status descarta participaciones en series no
// aprobadas (elimina filas del embed, no la fila del canal); si la participa
// queda vacía la función devuelve null → la página responde notFound() (CAN-03).
const CANAL_FICHA_SELECT = `
  nombre,
  handle,
  avatar_url,
  participa (
    rol,
    serie!inner (
      id,
      titulo,
      slug,
      portada_url,
      anio_inicio,
      created_at,
      estado,
      categoria ( nombre, slug ),
      participa ( canal ( nombre, handle ) ),
      valoracion ( nota )
    )
  )
` as const

function canalFichaQuery(handle: string) {
  return supabaseServer
    .from('canal')
    .select(CANAL_FICHA_SELECT)
    .eq('handle', handle)
    .eq('participa.serie.moderation_status', 'aprobada')
}

type CanalFichaRow = NonNullable<Awaited<ReturnType<typeof canalFichaQuery>>['data']>[number]
type ParticipaFichaRow = CanalFichaRow['participa'][number]
type SerieFilmografiaRow = NonNullable<ParticipaFichaRow['serie']>

// SerieCard + estado: el orden de la filmografía (CAN-01) necesita el estado,
// que no forma parte de la tarjeta de F003.
export interface SerieFilmografia extends SerieCard {
  estado: string
}

export interface FilmografiaSerie {
  serie: SerieFilmografia
  rol: string
}

export interface CanalFichaData {
  nombre: string
  handle: string
  avatar_url: string | null
  series: FilmografiaSerie[]
}

function toSerieFilmografia(row: SerieFilmografiaRow): SerieFilmografia {
  return {
    id: row.id,
    titulo: row.titulo,
    slug: row.slug,
    portada_url: row.portada_url,
    anio_inicio: row.anio_inicio,
    created_at: row.created_at,
    estado: row.estado,
    categoria: row.categoria ? { nombre: row.categoria.nombre, slug: row.categoria.slug } : null,
    canales: row.participa
      .map((p) => p.canal)
      .filter((canal): canal is NonNullable<typeof canal> => canal !== null)
      .map((canal) => ({ nombre: canal.nombre, handle: canal.handle })),
    rating: toRating(row.valoracion.map((v) => v.nota))
  }
}

// Orden CAN-01: anio_inicio desc (null al final) → activas antes que
// finalizadas → WR desc (sin valoración → 0) → created_at desc como
// desempate determinista (patrón de lib/series.ts). El tercer criterio usa
// WR (VAL-05), no el AVG redondeado de la tarjeta.
const RANGO_ESTADO: Record<string, number> = { activa: 0, finalizada: 1 }

// Entrada del comparador: la serie mapeada + su WR exacto (calculado de las
// notas crudas, no del AVG redondeado) + el rol. El WR se descarta al final.
type FilmografiaConWr = { rol: string; serie: SerieFilmografia; wr: number | null }

function byFilmografia(a: FilmografiaConWr, b: FilmografiaConWr): number {
  const anioA = a.serie.anio_inicio ?? Number.MIN_SAFE_INTEGER
  const anioB = b.serie.anio_inicio ?? Number.MIN_SAFE_INTEGER
  if (anioA !== anioB) return anioB - anioA

  const rangoA = RANGO_ESTADO[a.serie.estado] ?? Number.MAX_SAFE_INTEGER
  const rangoB = RANGO_ESTADO[b.serie.estado] ?? Number.MAX_SAFE_INTEGER
  if (rangoA !== rangoB) return rangoA - rangoB

  const diferenciaWr = (b.wr ?? 0) - (a.wr ?? 0)
  if (diferenciaWr !== 0) return diferenciaWr

  return b.serie.created_at.localeCompare(a.serie.created_at)
}

function toFilmografia(filas: ParticipaFichaRow[], c: number): FilmografiaSerie[] {
  return filas
    .filter(
      (fila): fila is ParticipaFichaRow & { serie: SerieFilmografiaRow } => fila.serie !== null
    )
    .map((fila) => ({
      rol: fila.rol,
      serie: toSerieFilmografia(fila.serie),
      wr: wrDeNotas(
        fila.serie.valoracion.map((v) => v.nota),
        c
      )
    }))
    .sort(byFilmografia)
    .map(({ rol, serie }) => ({ rol, serie }))
}

// Ficha de canal (CAN-01/CAN-03): null si el handle no existe o si el canal
// no participa en ninguna serie aprobada → la página responde notFound().
export async function getCanalByHandle(handle: string): Promise<CanalFichaData | null> {
  // C de la fórmula WR (VAL-05) en paralelo con la ficha del canal.
  const [row, c] = await Promise.all([
    unwrap(canalFichaQuery(handle).maybeSingle()),
    getGlobalMeanRating()
  ])
  if (!row) return null
  const series = toFilmografia(row.participa, c)
  if (series.length === 0) return null
  return {
    nombre: row.nombre,
    handle: row.handle,
    avatar_url: row.avatar_url,
    series
  }
}

const JERARQUIA_ROL: Record<string, number> = { principal: 0, colaborador: 1, invitado: 2 }

// Los handles de YouTube se almacenan en BD con '@', pero Next.js trata los
// segmentos de URL que empiezan por '@' como slots de parallel routes
// (isGroupSegment en next/dist/shared/lib/segment.js) y devuelve 404 en
// /canales/@<handle>, tanto en dev como en prod. Decisión aprobada (F005):
// la URL pública va sin '@' (/canales/canal-uno).
export function handleDesdeUrl(param: string): string {
  return param.startsWith('@') ? param : `@${param}`
}

export function handleParaUrl(handle: string): string {
  return handle.replace(/^@/, '')
}

// Rol de mayor jerarquía presente en la filmografía (CAN-05):
// principal > colaborador > invitado. null si la lista está vacía.
export function rolDestacado(series: Pick<FilmografiaSerie, 'rol'>[]): string | null {
  let mejor: string | null = null
  for (const { rol } of series) {
    const rango = JERARQUIA_ROL[rol] ?? Number.MAX_SAFE_INTEGER
    if (mejor === null || rango < (JERARQUIA_ROL[mejor] ?? Number.MAX_SAFE_INTEGER)) {
      mejor = rol
    }
  }
  return mejor
}
