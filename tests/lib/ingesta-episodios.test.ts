import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'
import type { Database } from '@/types/database'
import {
  procesarSeries,
  tienePatronClaro,
  extraerPlaylistId,
  ingestNuevosEpisodios,
} from '../../lib/ingesta-episodios'
import type { IngestaDeps, SerieInfo, VideoInfo } from '../../lib/ingesta-episodios'
import { dbAdmin, requireLocalDb } from '../db/env'

// lib/supabase.ts (createServiceRoleClient) y lib/auth.ts lanzan si faltan env vars;
// vi.hoisted se ejecuta antes de los imports para evitar el throw.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

requireLocalDb()

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

// ── ingestNuevosEpisodios con BD real ────────────────────────────────────────
//
// No invoca YouTube: el proveedor de videos se sustituye por un mock
// determinista. El cliente service-role escribe en episodio_sugerencia con
// bypass de RLS, tal como lo hace el endpoint productivo. La UNIQUE
// (serie_id, video_id_youtube) de M24 se verifica en tiempo real.

describe('ingestNuevosEpisodios — DB real, videos mock', () => {
  const RUN_ID = Date.now()
  let serieId: string
  let client: SupabaseClient<Database>

  const mockVideos: VideoInfo[] = [
    { video_id: `mock-v1-${RUN_ID}`, titulo: `Serie A S01E01 - Piloto`, descripcion: 'Desc v1' },
    { video_id: `mock-v2-${RUN_ID}`, titulo: `Serie A Ep. 2`, descripcion: 'Desc v2' },
    { video_id: `mock-v3-${RUN_ID}`, titulo: `Serie A Random sin patrón`, descripcion: 'Desc v3' },
  ]

  beforeAll(async () => {
    client = createServiceRoleClient()

    // Crear categoría propia para aislamiento (la BD puede estar vacía).
    const { data: cat } = await dbAdmin
      .from('categoria')
      .insert({ nombre: `Cat Ingesta ${RUN_ID}`, slug: `cat-ingesta-${RUN_ID}` })
      .select('id')
      .single()
    if (!cat) throw new Error('No se pudo crear categoría para ingest DB test')

    const { data: nuevaSerie } = await dbAdmin
      .from('serie')
      .insert({
        titulo: `Serie Ingesta DB ${RUN_ID}`,
        slug: `serie-ing-db-${RUN_ID}`,
        categoria_id: cat.id,
        moderation_status: 'aprobada',
        estado: 'activa',
        playlist_url: 'https://www.youtube.com/playlist?list=PLmock',
      })
      .select('id')
      .single()

    if (!nuevaSerie) throw new Error('No se pudo crear serie para ingest DB test')
    serieId = nuevaSerie.id
  })

  afterAll(async () => {
    // Limpieza defensiva: sugerencias creadas por esta corrida.
    await dbAdmin.from('episodio_sugerencia').delete().eq('serie_id', serieId)
    await dbAdmin.from('serie').delete().eq('id', serieId)
    // Categoría creada exclusivamente para este test.
    await dbAdmin.from('categoria').delete().eq('slug', `cat-ingesta-${RUN_ID}`)
  })

  it('crea sugerencias pendientes y omite videos sin patrón', async () => {
    const deps: IngestaDeps = {
      obtenerSeriesActivas: async () => [
        { id: serieId, titulo: `Serie Ingesta DB ${RUN_ID}`, playlist_url: 'https://www.youtube.com/playlist?list=PLmock' },
      ],
      obtenerVideos: async () => mockVideos,
      crearSugerencia: async (s) => {
        const { error } = await client.from('episodio_sugerencia').insert(s)
        return { error }
      },
    }

    const resumenes = await ingestNuevosEpisodios(client, deps)
    const resumen = resumenes.find((r) => r.serie_id === serieId)

    expect(resumen).toBeDefined()
    expect(resumen?.procesados).toBe(3)
    expect(resumen?.creados).toBe(2) // v1 (S01E01) y v2 (Ep. 2) tienen patrón
    expect(resumen?.omitidos).toBe(1) // v3 sin patrón
    expect(resumen?.errores).toHaveLength(0)

    // Verificación directa en BD: dos sugerencias pendientes.
    const { data: sugerencias } = await client
      .from('episodio_sugerencia')
      .select('video_id_youtube, estado')
      .eq('serie_id', serieId)
    expect(sugerencias).toHaveLength(2)
    expect(sugerencias!.every((s) => s.estado === 'pendiente')).toBe(true)
    expect(sugerencias!.map((s) => s.video_id_youtube).sort()).toEqual(
      [mockVideos[0].video_id, mockVideos[1].video_id].sort()
    )
  })

  it('es idempotente: reejecución genera duplicados 23505 → omitidos', async () => {
    const deps: IngestaDeps = {
      obtenerSeriesActivas: async () => [
        { id: serieId, titulo: `Serie Ingesta DB ${RUN_ID}`, playlist_url: 'https://www.youtube.com/playlist?list=PLmock' },
      ],
      obtenerVideos: async () => mockVideos,
      crearSugerencia: async (s) => {
        const { error } = await client.from('episodio_sugerencia').insert(s)
        return { error }
      },
    }

    // Segunda ejecución con los mismos videos.
    const resumenes = await ingestNuevosEpisodios(client, deps)
    const resumen = resumenes.find((r) => r.serie_id === serieId)

    expect(resumen).toBeDefined()
    expect(resumen?.procesados).toBe(3)
    expect(resumen?.creados).toBe(0) // ya existen
    expect(resumen?.omitidos).toBe(3) // 1 sin patrón + 2 duplicados
    expect(resumen?.errores).toHaveLength(0)

    // La BD sigue teniendo exactamente 2 sugerencias (las originales).
    const { data: sugerencias } = await client
      .from('episodio_sugerencia')
      .select('id')
      .eq('serie_id', serieId)
    expect(sugerencias).toHaveLength(2)
  })
})