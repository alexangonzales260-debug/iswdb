import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// lib/supabase.ts lanza si faltan env vars (fail fast); vi.hoisted se ejecuta
// antes que los imports, así el módulo se carga con las vars ya definidas.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import { getCategorias } from '@/lib/categorias'
import {
  getHeroSerie,
  getLatestSeries,
  getSerieBySlug,
  getTopSeries,
  listSeries
} from '@/lib/series'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap } from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

const CATEGORIAS = [
  { nombre: 'Minecraft', slug: 'minecraft' },
  { nombre: 'GTA', slug: 'gta' },
  { nombre: 'Roleplay', slug: 'roleplay' }
]

const CANALES = [
  { nombre: 'Canal Uno', handle: '@iswdb-uno', avatar_url: null },
  {
    nombre: 'Canal Dos',
    handle: '@iswdb-dos',
    avatar_url: 'https://img.youtube.com/vi/canaldos/avatar.jpg'
  },
  { nombre: 'Canal Tres', handle: '@iswdb-tres', avatar_url: null }
]

// ql-01..ql-06 → minecraft · ql-07..ql-11 → gta · ql-12..ql-16 → roleplay.
// ql-16 es la más reciente y es 'pendiente': no debe aparecer en ningún listado.
const TOTAL_SERIES = 16

// Participaciones: '@iswdb-uno' → ql-02/05/08/13 · '@iswdb-dos' → ql-01/02/10
// '@iswdb-tres' → ql-13 (ql-13 tiene 2 canales a propósito).
const PARTICIPA: Record<string, string[]> = {
  '@iswdb-uno': ['ql-02', 'ql-05', 'ql-08', 'ql-13'],
  '@iswdb-dos': ['ql-01', 'ql-02', 'ql-10'],
  '@iswdb-tres': ['ql-13']
}

// Roles explícitos para la ficha (FIC-05): ql-13 con principal/invitado; el
// resto de participaciones queda en el default 'colaborador' de la BD.
const ROLES: Record<string, Record<string, string>> = {
  'ql-13': { '@iswdb-uno': 'principal', '@iswdb-tres': 'invitado' }
}

function slugSerie(n: number): string {
  return `ql-${String(n).padStart(2, '0')}`
}

function categoriaDe(n: number): string {
  if (n <= 6) return 'minecraft'
  if (n <= 11) return 'gta'
  return 'roleplay'
}

// Limpieza inicial: deja el catálogo vacío para los tests de empty states.
beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('canal').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('categoria').delete().not('id', 'is', null))
})

describe('queries de catálogo con BD vacía (cliente anon, RLS de lectura pública)', () => {
  it('getHeroSerie → null', async () => {
    expect(await getHeroSerie()).toBeNull()
  })

  it('getTopSeries → []', async () => {
    expect(await getTopSeries()).toEqual([])
  })

  it('getLatestSeries → []', async () => {
    expect(await getLatestSeries()).toEqual([])
  })

  it('listSeries → serie vacía con total 0', async () => {
    expect(await listSeries()).toEqual({ series: [], total: 0, totalPages: 0 })
  })

  it('getCategorias → []', async () => {
    expect(await getCategorias()).toEqual([])
  })
})

describe('queries de catálogo con datos (cliente anon, RLS de lectura pública)', () => {
  const createdAuthUserIds: string[] = []

  beforeAll(async () => {
    const runId = Date.now()
    for (const i of [1, 2, 3]) {
      createdAuthUserIds.push(await createTestUser(`ql-u${i}-${runId}@iswdb.local`, TEST_PASSWORD))
    }
    await unwrap(dbAdmin.from('usuario').insert(createdAuthUserIds.map((id) => ({ id }))))

    const categorias = await unwrap(
      dbAdmin.from('categoria').insert(CATEGORIAS).select('id, slug')
    )
    const catIdPorSlug = Object.fromEntries(categorias.map((c) => [c.slug, c.id]))

    const canales = await unwrap(dbAdmin.from('canal').insert(CANALES).select('id, handle'))
    const canalIdPorHandle = Object.fromEntries(canales.map((c) => [c.handle, c.id]))

    // Filas uniformes: en el bulk insert PostgREST toma las columnas del
    // primer objeto; keys ausentes en el resto serían NULL (no default).
    // ql-01 ejercita la ficha completa (FIC-01): descripcion, estado
    // finalizada, anio_fin y playlist_url.
    const filasSerie = Array.from({ length: TOTAL_SERIES }, (_, i) => {
      const n = i + 1
      return {
        titulo: `Serie QL ${n}`,
        slug: slugSerie(n),
        categoria_id: catIdPorSlug[categoriaDe(n)],
        moderation_status: n === TOTAL_SERIES ? 'pendiente' : 'aprobada',
        anio_inicio: 2024,
        created_at: new Date(Date.UTC(2026, 0, n)).toISOString(),
        descripcion: n === 1 ? 'Serie de pruebas para la ficha: dos temporadas y reparto con rol.' : null,
        estado: n === 1 ? 'finalizada' : 'activa',
        anio_fin: n === 1 ? 2025 : null,
        playlist_url: n === 1 ? 'https://www.youtube.com/playlist?list=PLiswdb00000000001' : null
      }
    })
    const series = await unwrap(dbAdmin.from('serie').insert(filasSerie).select('id, slug'))
    const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))

    const filasParticipa = Object.entries(PARTICIPA).flatMap(([handle, slugs]) =>
      slugs.map((slug) => ({
        serie_id: serieIdPorSlug[slug],
        canal_id: canalIdPorHandle[handle],
        rol: ROLES[slug]?.[handle] ?? 'colaborador'
      }))
    )
    await unwrap(dbAdmin.from('participa').insert(filasParticipa))

    const [u1, u2, u3] = createdAuthUserIds
    const notasPorSerie: Record<string, [string, number][]> = {
      'ql-10': [
        [u1, 10],
        [u2, 9],
        [u3, 10]
      ],
      'ql-04': [
        [u1, 9],
        [u2, 9]
      ],
      'ql-13': [
        [u1, 8],
        [u2, 9]
      ],
      // ql-07 y ql-02 empatan a WR (una única nota de 8 en cada una):
      // ql-07 es más reciente → va antes.
      'ql-07': [[u1, 8]],
      'ql-02': [[u1, 8]],
      'ql-11': [[u1, 5]],
      // ql-16 (pendiente) tiene nota alta a propósito: debe quedar excluida.
      'ql-16': [[u1, 10]]
    }
    const filasValoracion = Object.entries(notasPorSerie).flatMap(([slug, notas]) =>
      notas.map(([userId, nota]) => ({ user_id: userId, serie_id: serieIdPorSlug[slug], nota }))
    )
    await unwrap(dbAdmin.from('valoracion').insert(filasValoracion))

    // Episodios para la ficha (FIC-02): ql-01 con 2 temporadas insertadas
    // FUERA DE ORDEN (verifica agrupación y ordenamiento en lib/) · ql-10 con
    // 1 episodio · ql-02 sin episodios (empty state).
    const filasEpisodio = [
      {
        serie_id: serieIdPorSlug['ql-01'],
        temporada: 2,
        numero: 1,
        titulo: 'Estreno de la segunda temporada',
        video_id: 'ql01t02e001'
      },
      {
        serie_id: serieIdPorSlug['ql-01'],
        temporada: 1,
        numero: 2,
        titulo: 'Segundo episodio',
        video_id: 'ql01t01e002'
      },
      {
        serie_id: serieIdPorSlug['ql-01'],
        temporada: 1,
        numero: 1,
        titulo: 'Piloto',
        video_id: 'ql01t01e001'
      },
      {
        serie_id: serieIdPorSlug['ql-10'],
        temporada: 1,
        numero: 1,
        titulo: 'Episodio único',
        video_id: 'ql10t01e001'
      }
    ]
    await unwrap(dbAdmin.from('episodio').insert(filasEpisodio))
  }, 120_000)

  afterAll(async () => {
    try {
      // Borrar las series cascada participa/valoracion/episodio.
      await unwrap(dbAdmin.from('serie').delete().like('slug', 'ql-%'))
      await unwrap(
        dbAdmin.from('categoria').delete().in('slug', CATEGORIAS.map((c) => c.slug))
      )
      await unwrap(dbAdmin.from('canal').delete().like('handle', '@iswdb-%'))
      await unwrap(dbAdmin.from('usuario').delete().in('id', createdAuthUserIds))
    } catch (error) {
      console.warn(`Cleanup de tests/lib/series.test.ts falló: ${(error as Error).message}`)
    }
    for (const id of createdAuthUserIds) {
      await deleteTestUser(id)
    }
  })

  it('getHeroSerie: la aprobada con mayor WR (AVG 9.7, 3 valoraciones)', async () => {
    const hero = await getHeroSerie()
    expect(hero?.slug).toBe('ql-10')
    expect(hero?.rating).toEqual({ average: 9.7, count: 3 })
    expect(hero?.categoria).toEqual({ nombre: 'GTA', slug: 'gta' })
    expect(hero?.canales).toEqual([{ nombre: 'Canal Dos', handle: '@iswdb-dos' }])
    expect(hero?.anio_inicio).toBe(2024)
    expect(hero?.portada_url).toBeNull()
  })

  it('getTopSeries(5): WR desc, empate por created_at desc, mínimo 1 valoración', async () => {
    const top = await getTopSeries(5)
    expect(top.map((s) => s.slug)).toEqual(['ql-10', 'ql-04', 'ql-13', 'ql-07', 'ql-02'])
    expect(top[3].rating?.average).toBe(8)
    expect(top[4].rating?.average).toBe(8)
  })

  it('getTopSeries: sin valoraciones no aparece; pendientes tampoco', async () => {
    const top = await getTopSeries(20)
    // Solo 6 aprobadas tienen valoración (ql-16 es pendiente con nota 10).
    expect(top.map((s) => s.slug)).toEqual(['ql-10', 'ql-04', 'ql-13', 'ql-07', 'ql-02', 'ql-11'])
  })

  it('getLatestSeries(10): created_at desc, sin pendientes', async () => {
    const latest = await getLatestSeries(10)
    expect(latest.map((s) => s.slug)).toEqual([
      'ql-15',
      'ql-14',
      'ql-13',
      'ql-12',
      'ql-11',
      'ql-10',
      'ql-09',
      'ql-08',
      'ql-07',
      'ql-06'
    ])
  })

  it('listSeries(): página 1 con 12 series, total 15, totalPages 2 (orden WR)', async () => {
    const resultado = await listSeries()
    expect(resultado.series).toHaveLength(12)
    expect(resultado.total).toBe(15)
    expect(resultado.totalPages).toBe(2)
    // Con valoración primero (WR desc): ql-10 > ql-04 > ql-13 > ql-07 > ql-02
    // > ql-11; sin valoración al final por created_at desc (ql-15 la primera).
    expect(resultado.series.map((s) => s.slug)).toEqual([
      'ql-10',
      'ql-04',
      'ql-13',
      'ql-07',
      'ql-02',
      'ql-11',
      'ql-15',
      'ql-14',
      'ql-12',
      'ql-09',
      'ql-08',
      'ql-06'
    ])
    expect(resultado.series.some((s) => s.slug === 'ql-16')).toBe(false)
  })

  it('listSeries({ page: 2 }): 3 series sin valoración en orden created_at desc', async () => {
    const resultado = await listSeries({ page: 2 })
    expect(resultado.series.map((s) => s.slug)).toEqual(['ql-05', 'ql-03', 'ql-01'])
    expect(resultado.total).toBe(15)
    expect(resultado.totalPages).toBe(2)
  })

  it('listSeries({ categoria }): filtra por categoria.slug (orden WR)', async () => {
    const resultado = await listSeries({ categoria: 'minecraft' })
    expect(resultado.total).toBe(6)
    // Valoradas: ql-04 (WR 8.58) > ql-02 (8.45); sin valoración al final.
    expect(resultado.series.map((s) => s.slug)).toEqual([
      'ql-04',
      'ql-02',
      'ql-06',
      'ql-05',
      'ql-03',
      'ql-01'
    ])
    expect(resultado.series.every((s) => s.categoria?.slug === 'minecraft')).toBe(true)
  })

  it('listSeries({ canal }): filtra por canal.handle y conserva todos los canales por tarjeta (orden WR)', async () => {
    const resultado = await listSeries({ canal: '@iswdb-uno' })
    expect(resultado.total).toBe(4)
    // Valoradas: ql-13 (WR 8.5) > ql-02 (8.45); sin valoración al final.
    expect(resultado.series.map((s) => s.slug)).toEqual(['ql-13', 'ql-02', 'ql-08', 'ql-05'])
    const ql13 = resultado.series.find((s) => s.slug === 'ql-13')
    expect(ql13?.canales).toHaveLength(2)
    expect(ql13?.rating).toEqual({ average: 8.5, count: 2 })
  })

  it('listSeries({ categoria, canal }): filtros combinados (orden WR)', async () => {
    const resultado = await listSeries({ categoria: 'minecraft', canal: '@iswdb-uno' })
    expect(resultado.total).toBe(2)
    expect(resultado.series.map((s) => s.slug)).toEqual(['ql-02', 'ql-05'])
  })

  it('listSeries: filtros sin resultados → total 0', async () => {
    expect(await listSeries({ categoria: 'no-existe' })).toEqual({
      series: [],
      total: 0,
      totalPages: 0
    })
    expect(await listSeries({ canal: '@no-existe' })).toEqual({
      series: [],
      total: 0,
      totalPages: 0
    })
  })

  it('listSeries: página fuera de rango → vacía con total correcto; página inválida → 1', async () => {
    const fuera = await listSeries({ page: 99 })
    expect(fuera.series).toEqual([])
    expect(fuera.total).toBe(15)

    const invalida = await listSeries({ page: 0 })
    expect(invalida.series).toHaveLength(12)
    expect(invalida.series[0].slug).toBe('ql-10')
  })

  it('getCategorias: 3 categorías ordenadas por nombre', async () => {
    const categorias = await getCategorias()
    expect(categorias).toEqual([
      { nombre: 'GTA', slug: 'gta' },
      { nombre: 'Minecraft', slug: 'minecraft' },
      { nombre: 'Roleplay', slug: 'roleplay' }
    ])
  })

  it('getSerieBySlug: ficha completa de ql-01 (campos, canal con rol, temporadas ordenadas)', async () => {
    const ficha = await getSerieBySlug('ql-01')
    expect(ficha).toEqual({
      id: expect.any(String),
      titulo: 'Serie QL 1',
      slug: 'ql-01',
      portada_url: null,
      descripcion: 'Serie de pruebas para la ficha: dos temporadas y reparto con rol.',
      estado: 'finalizada',
      anio_inicio: 2024,
      anio_fin: 2025,
      playlist_url: 'https://www.youtube.com/playlist?list=PLiswdb00000000001',
      categoria: { nombre: 'Minecraft', slug: 'minecraft' },
      canales: [
        {
          nombre: 'Canal Dos',
          handle: '@iswdb-dos',
          avatar_url: 'https://img.youtube.com/vi/canaldos/avatar.jpg',
          rol: 'colaborador'
        }
      ],
      rating: null,
      temporadas: [
        {
          numero: 1,
          episodios: [
            { numero: 1, titulo: 'Piloto', video_id: 'ql01t01e001' },
            { numero: 2, titulo: 'Segundo episodio', video_id: 'ql01t01e002' }
          ]
        },
        {
          numero: 2,
          episodios: [
            { numero: 1, titulo: 'Estreno de la segunda temporada', video_id: 'ql01t02e001' }
          ]
        }
      ]
    })
  })

  it('getSerieBySlug: ql-10 con valoración agregada y episodio', async () => {
    const ficha = await getSerieBySlug('ql-10')
    expect(ficha?.rating).toEqual({ average: 9.7, count: 3 })
    expect(ficha?.temporadas).toEqual([
      {
        numero: 1,
        episodios: [{ numero: 1, titulo: 'Episodio único', video_id: 'ql10t01e001' }]
      }
    ])
  })

  it('getSerieBySlug: ql-13 muestra los 2 canales con rol explícito', async () => {
    const ficha = await getSerieBySlug('ql-13')
    expect(ficha?.canales).toHaveLength(2)
    expect(ficha?.canales).toEqual(
      expect.arrayContaining([
        { nombre: 'Canal Uno', handle: '@iswdb-uno', avatar_url: null, rol: 'principal' },
        { nombre: 'Canal Tres', handle: '@iswdb-tres', avatar_url: null, rol: 'invitado' }
      ])
    )
  })

  it('getSerieBySlug: ql-02 sin episodios → temporadas vacías', async () => {
    const ficha = await getSerieBySlug('ql-02')
    expect(ficha?.temporadas).toEqual([])
  })

  it('getSerieBySlug: serie pendiente → null', async () => {
    expect(await getSerieBySlug('ql-16')).toBeNull()
  })

  it('getSerieBySlug: slug inexistente → null', async () => {
    expect(await getSerieBySlug('no-existe')).toBeNull()
  })
})
