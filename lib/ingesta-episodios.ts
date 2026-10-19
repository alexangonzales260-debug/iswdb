import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getVideosRecientes } from './youtube'
import { detectarPatronEpisodio } from './episodio-deteccion'

export interface VideoInfo {
  video_id: string
  titulo: string
  descripcion: string
}

export interface SerieInfo {
  id: string
  titulo: string
  playlist_url: string | null
}

export interface IngestaResumen {
  serie_id: string
  titulo: string
  procesados: number
  creados: number
  omitidos: number
  errores: string[]
}

export interface IngestaDeps {
  obtenerSeriesActivas: () => Promise<SerieInfo[]>
  obtenerVideos: (playlistId: string) => Promise<VideoInfo[]>
  crearSugerencia: (sugerencia: {
    serie_id: string
    video_id_youtube: string
    titulo_detectado: string
    descripcion: string
    temporada_detectada: number
    numero_detectado: number | null
  }) => Promise<{ error: { code?: string; message?: string } | null }>
}

export function tienePatronClaro(titulo: string): boolean {
  const rePatron = /(?:S(\d+)E(\d+))|(?:(\d+)[xX](\d+))/i
  const reSecuencial = /(?:cap[ií]tulo|cap|episodio|ep)\.?\s*(\d+)/i
  const reNumerado = /#(\d+)\b/i
  return rePatron.test(titulo) || reSecuencial.test(titulo) || reNumerado.test(titulo)
}

export function extraerPlaylistId(url: string): string | null {
  try {
    const urlObj = new URL(url)
    return urlObj.searchParams.get('list')
  } catch {
    return null
  }
}

export async function procesarSeries(
  deps: IngestaDeps
): Promise<IngestaResumen[]> {
  const series = await deps.obtenerSeriesActivas()
  const resumenes: IngestaResumen[] = []

  for (const serie of series) {
    const resumen: IngestaResumen = {
      serie_id: serie.id,
      titulo: serie.titulo,
      procesados: 0,
      creados: 0,
      omitidos: 0,
      errores: [],
    }

    try {
      if (!serie.playlist_url) {
        resumen.errores.push('Sin playlist_url')
        resumenes.push(resumen)
        continue
      }

      const playlistId = extraerPlaylistId(serie.playlist_url)
      if (!playlistId) {
        resumen.errores.push('URL de playlist inválida')
        resumenes.push(resumen)
        continue
      }

      const videos = await deps.obtenerVideos(playlistId)
      resumen.procesados = videos.length

      for (const video of videos) {
        if (!tienePatronClaro(video.titulo)) {
          resumen.omitidos++
          continue
        }

        const patron = detectarPatronEpisodio(video.titulo)

        const { error } = await deps.crearSugerencia({
          serie_id: serie.id,
          video_id_youtube: video.video_id,
          titulo_detectado: patron.titulo || video.titulo,
          descripcion: video.descripcion,
          temporada_detectada: patron.temporada ?? 1,
          numero_detectado: patron.numero,
        })

        if (error) {
          if (error.code === '23505') {
            resumen.omitidos++
          } else {
            resumen.errores.push(`Error insert ${video.video_id}: ${error.message}`)
          }
        } else {
          resumen.creados++
        }
      }
    } catch (e) {
      resumen.errores.push(e instanceof Error ? e.message : String(e))
    }

    resumenes.push(resumen)
  }

  return resumenes
}

export async function ingestNuevosEpisodios(
  client: SupabaseClient<Database>,
  deps?: IngestaDeps
): Promise<IngestaResumen[]> {
  return procesarSeries(
    deps ?? {
      obtenerSeriesActivas: async () => {
        const { data: series, error } = await client
          .from('serie')
          .select('id, titulo, playlist_url')
          .eq('estado', 'activa')
          .eq('moderation_status', 'aprobada')
          .not('playlist_url', 'is', null)
        if (error) throw new Error(`Error leer series: ${error.message}`)
        return series
      },
      obtenerVideos: getVideosRecientes,
      crearSugerencia: async (sugerencia) => {
        const { error } = await client.from('episodio_sugerencia').insert(sugerencia)
        return { error }
      },
    }
  )
}