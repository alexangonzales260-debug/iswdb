import { describe, expect, it, vi } from 'vitest'
import { procesarSeries, tienePatronClaro, extraerPlaylistId } from '../../lib/ingesta-episodios'
import type { IngestaDeps, SerieInfo, VideoInfo } from '../../lib/ingesta-episodios'

const mockBaseSerie = (id: string): SerieInfo => ({
  id,
  titulo: `Serie Ing ${id}`,
  playlist_url: 'https://www.youtube.com/playlist?list=PLtest123',
})

function makeDeps(overrides?: Partial<IngestaDeps>): IngestaDeps {
  return {
    obtenerSeriesActivas: async () => [],
    obtenerVideos: async () => [],
    crearSugerencia: async () => ({ error: null }),
    ...overrides,
  }
}

describe('tienePatronClaro', () => {
  it('detecta SXXEXX', () => {
    expect(tienePatronClaro('Serie S01E01 - Inicio')).toBe(true)
  })
  it('detecta XxXX', () => {
    expect(tienePatronClaro('Serie 1x02 - Más')).toBe(true)
  })
  it('detecta Capítulo/Episodio', () => {
    expect(tienePatronClaro('Serie - Capítulo 3')).toBe(true)
    expect(tienePatronClaro('Serie Ep. 5')).toBe(true)
  })
  it('descarta títulos sin patrón', () => {
    expect(tienePatronClaro('Video Random sin patrón')).toBe(false)
  })
})

describe('extraerPlaylistId', () => {
  it('extrae el parámetro list de una URL válida', () => {
    expect(extraerPlaylistId('https://www.youtube.com/playlist?list=PLabc123')).toBe('PLabc123')
  })
  it('devuelve null para URLs inválidas', () => {
    expect(extraerPlaylistId('no-es-url')).toBeNull()
  })
})

describe('procesarSeries', () => {
  const videosConPatron: VideoInfo[] = [
    { video_id: 'v1', titulo: 'Serie S01E01 - Inicio', descripcion: 'Desc 1' },
    { video_id: 'v2', titulo: 'Video Random sin patrón', descripcion: 'Desc 2' },
    { video_id: 'v3', titulo: 'Serie 1x02 - Más', descripcion: 'Desc 3' },
  ]

  it('ingesta videos con patrón y omite videos sin patrón', async () => {
    const crearSugerencia = vi.fn(async () => ({ error: null }))
    const deps = makeDeps({
      obtenerSeriesActivas: async () => [mockBaseSerie('1')],
      obtenerVideos: async () => videosConPatron,
      crearSugerencia,
    })

    const resumenes = await procesarSeries(deps)
    const resumen = resumenes.find(r => r.serie_id === '1')

    expect(resumen).toBeDefined()
    expect(resumen?.procesados).toBe(3)
    expect(resumen?.creados).toBe(2) // v1 y v3 tienen patrón
    expect(resumen?.omitidos).toBe(1) // v2 sin patrón
    expect(crearSugerencia).toHaveBeenCalledTimes(2)
  })

  it('incrementa omitidos ante error de duplicado 23505', async () => {
    const crearSugerencia = vi.fn(async () => ({ error: { code: '23505' } }))
    const deps = makeDeps({
      obtenerSeriesActivas: async () => [mockBaseSerie('1')],
      obtenerVideos: async () => [videosConPatron[0]], // solo v1
      crearSugerencia,
    })

    const resumenes = await procesarSeries(deps)
    const resumen = resumenes.find(r => r.serie_id === '1')

    expect(resumen?.creados).toBe(0)
    expect(resumen?.omitidos).toBe(1)
    expect(crearSugerencia).toHaveBeenCalledTimes(1)
  })

  it('mezcla creados y omitidos cuando hay duplicados parciales', async () => {
    let callCount = 0
    const crearSugerencia = vi.fn(async () => {
      callCount++
      if (callCount === 1) return { error: null }
      return { error: { code: '23505' } }
    })
    const deps = makeDeps({
      obtenerSeriesActivas: async () => [mockBaseSerie('1')],
      obtenerVideos: async () => videosConPatron,
      crearSugerencia,
    })

    const resumenes = await procesarSeries(deps)
    const resumen = resumenes.find(r => r.serie_id === '1')

    expect(resumen?.creados).toBe(1)
    expect(resumen?.omitidos).toBe(2) // 1 sin patrón + 1 duplicado
    expect(crearSugerencia).toHaveBeenCalledTimes(2)
  })

  it('retorna array vacío si no hay series activas', async () => {
    const crearSugerencia = vi.fn(async () => ({ error: null }))
    const deps = makeDeps({
      obtenerSeriesActivas: async () => [],
      obtenerVideos: async () => [],
      crearSugerencia,
    })

    const resumenes = await procesarSeries(deps)
    expect(resumenes).toHaveLength(0)
    expect(crearSugerencia).not.toHaveBeenCalled()
  })

  it('registra error si serie no tiene playlist_url', async () => {
    const deps = makeDeps({
      obtenerSeriesActivas: async () => [{ id: '99', titulo: 'Sin Playlist', playlist_url: null }],
      obtenerVideos: async () => [],
      crearSugerencia: async () => ({ error: null }),
    })

    const resumenes = await procesarSeries(deps)
    const resumen = resumenes.find(r => r.serie_id === '99')

    expect(resumen?.errores).toContain('Sin playlist_url')
    expect(resumen?.procesados).toBe(0)
  })

  it('captura errores de fetch de videos', async () => {
    const deps = makeDeps({
      obtenerSeriesActivas: async () => [mockBaseSerie('1')],
      obtenerVideos: async () => { throw new Error('Network error') },
      crearSugerencia: async () => ({ error: null }),
    })

    const resumenes = await procesarSeries(deps)
    const resumen = resumenes.find(r => r.serie_id === '1')

    expect(resumen?.errores).toHaveLength(1)
    expect(String(resumen?.errores[0])).toMatch(/Network error/)
  })

  it('registra errores no-23505 como errores', async () => {
    const crearSugerencia = vi.fn(async () => ({ error: { code: '42P01', message: 'table not found' } }))
    const deps = makeDeps({
      obtenerSeriesActivas: async () => [mockBaseSerie('1')],
      obtenerVideos: async () => [videosConPatron[0]],
      crearSugerencia,
    })

    const resumenes = await procesarSeries(deps)
    const resumen = resumenes.find(r => r.serie_id === '1')

    expect(resumen?.errores).toHaveLength(1)
    expect(resumen?.errores[0]).toMatch(/table not found/)
    expect(resumen?.creados).toBe(0)
    expect(resumen?.omitidos).toBe(0)
  })

  it('pasa temporada_detectada number y numero_detectado correctamente', async () => {
    const crearSugerencia = vi.fn(async () => ({ error: null }))
    const deps = makeDeps({
      obtenerSeriesActivas: async () => [mockBaseSerie('1')],
      obtenerVideos: async () => [{ video_id: 'v1', titulo: 'Serie S03E07 - Final', descripcion: 'd' }],
      crearSugerencia,
    })

    await procesarSeries(deps)

    expect(crearSugerencia).toHaveBeenCalledWith(
      expect.objectContaining({
        serie_id: '1',
        video_id_youtube: 'v1',
        temporada_detectada: 3,
        numero_detectado: 7,
      })
    )
  })
})