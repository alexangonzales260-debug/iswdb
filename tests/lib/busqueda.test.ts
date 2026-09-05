import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// lib/supabase.ts lanza si faltan env vars (fail fast); vi.hoisted se ejecuta
// antes que los imports, así el módulo se carga con las vars ya definidas.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import { buscarCanales, buscarSeries } from '@/lib/busqueda'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap, usernameDesdeEmail } from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

const CATEGORIA = { nombre: 'Busqueda', slug: 'busqueda' }

const CANALES = [
  {
    nombre: 'Canal BS Uno',
    handle: '@iswdb-bs-uno',
    avatar_url: 'https://img.youtube.com/vi/bsuno/avatar.jpg'
  },
  { nombre: 'Canal BS Dos', handle: '@iswdb-bs-dos', avatar_url: null },
  { nombre: 'Canal BS Tres', handle: '@iswdb-bs-tres', avatar_url: null },
  { nombre: 'Café Canal', handle: '@iswdb-bs-cafe', avatar_url: null }
]

// bs-03 es pendiente: su título coincide con 'marbella' pero nunca debe
// aparecer (BUS-07). '@iswdb-bs-dos' solo participa en bs-03 → invisible en la
// búsqueda de canales y no aporta series. '@iswdb-bs-tres' no participa en
// nada. Notas: C = (9+7)/2 = 8 (las de la pendiente no cuentan) →
// WR bs-01 = 89/11 ≈ 8.09 > WR bs-02 = 87/11 ≈ 7.91 (orden cuando ambas
// coinciden, p.ej. buscando por el canal @iswdb-bs-uno).
const FILAS_SERIE = [
  {
    titulo: 'Marbella Vice',
    slug: 'bs-01',
    anio_inicio: 2021,
    anio_fin: 2021,
    estado: 'finalizada',
    moderation_status: 'aprobada',
    created_at: '2026-01-01T00:00:00.000Z'
  },
  {
    titulo: 'Café Táctico',
    slug: 'bs-02',
    anio_inicio: 2022,
    anio_fin: null,
    estado: 'activa',
    moderation_status: 'aprobada',
    created_at: '2026-01-02T00:00:00.000Z'
  },
  {
    titulo: 'Marbella Oculta',
    slug: 'bs-03',
    anio_inicio: 2023,
    anio_fin: null,
    estado: 'activa',
    moderation_status: 'pendiente',
    created_at: '2026-01-03T00:00:00.000Z'
  }
]

const PARTICIPA: { handle: string; slug: string; rol: string }[] = [
  { handle: '@iswdb-bs-uno', slug: 'bs-01', rol: 'principal' },
  { handle: '@iswdb-bs-uno', slug: 'bs-02', rol: 'colaborador' },
  { handle: '@iswdb-bs-dos', slug: 'bs-03', rol: 'colaborador' },
  { handle: '@iswdb-bs-cafe', slug: 'bs-02', rol: 'invitado' }
]

// Limpieza inicial: deja el catálogo vacío para los tests de BD vacía.
beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('canal').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('categoria').delete().not('id', 'is', null))
})

describe('búsqueda con BD vacía (cliente anon, RLS de lectura pública)', () => {
  it('sin datos → ambas búsquedas devuelven []', async () => {
    expect(await buscarSeries('marbella')).toEqual([])
    expect(await buscarCanales('canal')).toEqual([])
  })
})

describe('búsqueda con datos (cliente anon, RLS de lectura pública)', () => {
  let userId: string

  beforeAll(async () => {
    const runId = Date.now()
    userId = await createTestUser(`bs-u1-${runId}@iswdb.local`, TEST_PASSWORD)
    await unwrap(
      dbAdmin.from('usuario').insert({ id: userId, username: usernameDesdeEmail(`bs-u1-${runId}@iswdb.local`, userId) })
    )

    const categorias = await unwrap(dbAdmin.from('categoria').insert(CATEGORIA).select('id, slug'))
    const categoriaId = categorias[0].id

    const canales = await unwrap(dbAdmin.from('canal').insert(CANALES).select('id, handle'))
    const canalIdPorHandle = Object.fromEntries(canales.map((c) => [c.handle, c.id]))

    const filasSerie = FILAS_SERIE.map((fila) => ({
      ...fila,
      categoria_id: categoriaId,
      descripcion: null,
      portada_url: null,
      playlist_url: null
    }))
    const series = await unwrap(dbAdmin.from('serie').insert(filasSerie).select('id, slug'))
    const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))

    const filasParticipa = PARTICIPA.map((p) => ({
      serie_id: serieIdPorSlug[p.slug],
      canal_id: canalIdPorHandle[p.handle],
      rol: p.rol
    }))
    await unwrap(dbAdmin.from('participa').insert(filasParticipa))

    // bs-03 (pendiente) tiene nota alta a propósito: no debe contar en C ni
    // hacer visible la serie.
    const notasPorSerie: Record<string, number> = { 'bs-01': 9, 'bs-02': 7, 'bs-03': 10 }
    const filasValoracion = Object.entries(notasPorSerie).map(([slug, nota]) => ({
      user_id: userId,
      serie_id: serieIdPorSlug[slug],
      nota
    }))
    await unwrap(dbAdmin.from('valoracion').insert(filasValoracion))
  }, 120_000)

  afterAll(async () => {
    try {
      // Borrar las series cascada participa/valoracion/episodio.
      await unwrap(dbAdmin.from('serie').delete().like('slug', 'bs-%'))
      await unwrap(dbAdmin.from('categoria').delete().eq('slug', CATEGORIA.slug))
      await unwrap(dbAdmin.from('canal').delete().like('handle', '@iswdb-bs-%'))
      await unwrap(dbAdmin.from('usuario').delete().eq('id', userId))
    } catch (error) {
      console.warn(`Cleanup de tests/lib/busqueda.test.ts falló: ${(error as Error).message}`)
    }
    await deleteTestUser(userId)
  })

  describe('buscarSeries', () => {
    it('búsqueda por título con tarjeta completa (embeds + rating)', async () => {
      const series = await buscarSeries('marbella')
      expect(series).toHaveLength(1)
      const [serie] = series
      expect(serie.titulo).toBe('Marbella Vice')
      expect(serie.slug).toBe('bs-01')
      expect(serie.anio_inicio).toBe(2021)
      expect(serie.categoria).toEqual({ nombre: 'Busqueda', slug: 'busqueda' })
      expect(serie.canales).toEqual([{ nombre: 'Canal BS Uno', handle: '@iswdb-bs-uno' }])
      expect(serie.rating).toEqual({ average: 9, count: 1 })
    })

    it('serie pendiente con título coincidente queda excluida (BUS-07)', async () => {
      // 'marbella' también es substring de 'Marbella Oculta' (bs-03, pendiente).
      const slugs = (await buscarSeries('marbella')).map((s) => s.slug)
      expect(slugs).toEqual(['bs-01'])
    })

    it('insensible a mayúsculas: MARBELLA → mismo resultado', async () => {
      const slugs = (await buscarSeries('MARBELLA')).map((s) => s.slug)
      expect(slugs).toEqual(['bs-01'])
    })

    it('insensible a acentos: término sin acentos encuentra título acentuado', async () => {
      const slugs = (await buscarSeries('cafe tactico')).map((s) => s.slug)
      expect(slugs).toEqual(['bs-02'])
    })

    it('insensible a acentos: término acentuado también coincide', async () => {
      const slugs = (await buscarSeries('café')).map((s) => s.slug)
      expect(slugs).toEqual(['bs-02'])
    })

    it('búsqueda por nombre de canal muestra sus series en orden WR', async () => {
      // WR (C = 8): bs-01 ≈ 8.09 > bs-02 ≈ 7.91.
      const slugs = (await buscarSeries('Canal BS Uno')).map((s) => s.slug)
      expect(slugs).toEqual(['bs-01', 'bs-02'])
    })

    it('búsqueda por handle de canal muestra sus series', async () => {
      const slugs = (await buscarSeries('iswdb-bs-uno')).map((s) => s.slug)
      expect(slugs).toEqual(['bs-01', 'bs-02'])
    })

    it('canal que solo participa en series pendientes no aporta series', async () => {
      expect(await buscarSeries('iswdb-bs-dos')).toEqual([])
    })

    it('sin resultados: término inexistente → []', async () => {
      expect(await buscarSeries('zzzz')).toEqual([])
    })

    it('comodines ILIKE escapados: % y _ son literales', async () => {
      // Sin escape, '%' devolvería las 2 aprobadas y '_' casi todas.
      expect(await buscarSeries('%')).toEqual([])
      expect(await buscarSeries('_')).toEqual([])
    })

    it('término en blanco → [] sin consultar', async () => {
      expect(await buscarSeries('   ')).toEqual([])
    })
  })

  describe('buscarCanales', () => {
    it('búsqueda por nombre de canal devuelve sus campos', async () => {
      const canales = await buscarCanales('canal bs uno')
      expect(canales).toHaveLength(1)
      expect(canales[0]).toEqual({
        id: expect.any(String),
        nombre: 'Canal BS Uno',
        handle: '@iswdb-bs-uno',
        avatar_url: 'https://img.youtube.com/vi/bsuno/avatar.jpg'
      })
    })

    it('búsqueda por handle (substring, con o sin @)', async () => {
      const porHandle = await buscarCanales('iswdb-bs-uno')
      const porHandleConArroba = await buscarCanales('@iswdb-bs-uno')
      expect(porHandle.map((c) => c.handle)).toEqual(['@iswdb-bs-uno'])
      expect(porHandleConArroba.map((c) => c.handle)).toEqual(['@iswdb-bs-uno'])
    })

    it('insensible a acentos y mayúsculas: CAFÉ CANAL → Café Canal', async () => {
      const canales = await buscarCanales('CAFÉ CANAL')
      expect(canales.map((c) => c.nombre)).toEqual(['Café Canal'])
      const sinAcentos = await buscarCanales('cafe canal')
      expect(sinAcentos.map((c) => c.nombre)).toEqual(['Café Canal'])
    })

    it('solo canales con ≥1 serie aprobada (BUS-07), ordenados por nombre asc', async () => {
      // 'canal' coincide con los 4 nombres, pero BS Dos (solo pendiente) y
      // BS Tres (sin series) quedan excluidos. Orden nombre asc:
      // 'Café Canal' < 'Canal BS Uno'.
      const canales = await buscarCanales('canal')
      expect(canales.map((c) => c.handle)).toEqual(['@iswdb-bs-cafe', '@iswdb-bs-uno'])
    })

    it('sin resultados: término inexistente → []', async () => {
      expect(await buscarCanales('zzz')).toEqual([])
    })

    it('término en blanco → [] sin consultar', async () => {
      expect(await buscarCanales('  ')).toEqual([])
    })
  })
})
