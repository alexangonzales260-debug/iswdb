import type { AuthClient } from './auth'

// ── F029 · Detección de patrones ─────────────────────────────────────────────

export interface DatosEpisodio {
  temporada: number
  numero: number
  titulo: string
}

/**
 * Extrae temporada, episodio y título de un título de YouTube.
 * Patrones soportados: SXXEXX, XxXX, Cap. X, Episodio X, Ep. X, y numerales.
 * 
 * Ejemplos:
 * "Serie - S01E02 - Título" -> { temporada: 1, numero: 2, titulo: "Título" }
 * "Serie 1x02 Título" -> { temporada: 1, numero: 2, titulo: "Título" }
 * "Serie - Cap. 3" -> { temporada: 1, numero: 3, titulo: "" }
 */
export function detectarPatronEpisodio(titulo: string): DatosEpisodio {
  // Regex para S01E01 o 1x01
  const rePatron = /(?:S(\d+)E(\d+))|(?:(\d+)[xX](\d+))/i
  
  // Regex para "Capítulo X", "Cap. X", "Episodio X", "Ep. X"
  const reSecuencial = /(?:cap[ií]tulo|cap|episodio|ep)\.?\s*(\d+)/i

  // Regex para "#N" al final o precedido de separador
  const reNumerado = /#(\d+)\b/i

  const matchPatron = titulo.match(rePatron)
  if (matchPatron) {
    const t = parseInt(matchPatron[1] || matchPatron[3])
    const n = parseInt(matchPatron[2] || matchPatron[4])
    return { temporada: t, numero: n, titulo: extraerTituloLimpio(titulo, matchPatron[0]) }
  }
  
  const matchSecuencial = titulo.match(reSecuencial)
  if (matchSecuencial) {
    const n = parseInt(matchSecuencial[1])
    return { temporada: 1, numero: n, titulo: extraerTituloLimpio(titulo, matchSecuencial[0]) }
  }

  const matchNumerado = titulo.match(reNumerado)
  if (matchNumerado) {
    const n = parseInt(matchNumerado[1])
    return { temporada: 1, numero: n, titulo: extraerTituloLimpio(titulo, matchNumerado[0]) }
  }

  // Fallback simple: busca número al final si no hay nada más claro
  return { temporada: 1, numero: 1, titulo: titulo.trim() }
}

function extraerTituloLimpio(titulo: string, match: string): string {
  const indice = titulo.indexOf(match)
  if (indice === -1) return titulo.trim()
  const antes = titulo.slice(0, indice).replace(/[-|:–]/g, '').trim().replace(/\s+/g, ' ')
  const despues = titulo.slice(indice + match.length).replace(/[-|:–]/g, '').trim().replace(/\s+/g, ' ')
  return despues || antes
}

// ── F029 · Servicios de Sugerencia ──────────────────────────────────────────

export interface SugerenciaDatos {
  serie_id: string
  video_id_youtube: string
  titulo_detectado: string
  descripcion?: string | null
  temporada_detectada: number
  numero_detectado?: number | null
}

export async function crearSugerencia(client: AuthClient, datos: SugerenciaDatos): Promise<void> {
  const { error } = await client.from('episodio_sugerencia').insert(datos)
  if (error) throw new Error(error.message)
}

export interface SugerenciaPendiente {
  id: string
  video_id_youtube: string
  titulo_detectado: string
  serie: { titulo: string }
}

export async function listSugerenciasPendientes(client: AuthClient): Promise<SugerenciaPendiente[]> {
  const { data, error } = await client
    .from('episodio_sugerencia')
    .select('id, video_id_youtube, titulo_detectado, serie ( titulo )')
    .eq('estado', 'pendiente')
    .order('fecha_deteccion', { ascending: false })
  if (error) throw new Error(error.message)
  return data.map(s => ({
    id: s.id,
    video_id_youtube: s.video_id_youtube,
    titulo_detectado: s.titulo_detectado,
    serie: { titulo: s.serie?.titulo ?? 'Desconocida' }
  }))
}

export async function aprobarSugerencia(
  client: AuthClient, 
  sugerenciaId: string, 
  overrides?: Partial<DatosEpisodio>
): Promise<void> {
  const { data: sug, error: sugError } = await client
    .from('episodio_sugerencia')
    .select('*')
    .eq('id', sugerenciaId)
    .single()
  if (sugError) throw new Error(sugError.message)

  const { error: insError } = await client.from('episodio').insert({
    serie_id: sug.serie_id,
    temporada: overrides?.temporada ?? sug.temporada_detectada,
    numero: overrides?.numero ?? (sug.numero_detectado ?? 1),
    titulo: overrides?.titulo ?? sug.titulo_detectado,
    video_id: sug.video_id_youtube
  })
  if (insError) throw new Error(insError.message)

  await client.from('episodio_sugerencia').update({ estado: 'aprobado' }).eq('id', sugerenciaId)
}

export async function rechazarSugerencia(client: AuthClient, sugerenciaId: string): Promise<void> {
  const { error } = await client
    .from('episodio_sugerencia')
    .update({ estado: 'rechazado' })
    .eq('id', sugerenciaId)
  if (error) throw new Error(error.message)
}

export async function eliminarSugerencia(client: AuthClient, sugerenciaId: string): Promise<void> {
  const { error } = await client.from('episodio_sugerencia').delete().eq('id', sugerenciaId)
  if (error) throw new Error(error.message)
}
