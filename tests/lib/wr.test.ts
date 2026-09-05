import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// lib/supabase.ts lanza si faltan env vars (fail fast); vi.hoisted se ejecuta
// antes que los imports, así el módulo se carga con las vars ya definidas.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import {
  getGlobalMeanRating,
  getHeroSerie,
  getTopSeries,
  listSeries,
  weightedRating,
  WR_M
} from '@/lib/series'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap, usernameDesdeEmail } from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

describe('weightedRating: fórmula pura (VAL-05)', () => {
  it('m por defecto es 10', () => {
    expect(WR_M).toBe(10)
  })

  it('R = C → WR = R (la ponderación no altera el resultado)', () => {
    expect(weightedRating(3, 8, 8)).toBe(8)
  })

  it('pocos votos: WR se acerca a C', () => {
    // (1/11)*10 + (10/11)*6 = 70/11 ≈ 6.36
    expect(weightedRating(1, 10, 6)).toBeCloseTo(70 / 11, 10)
  })

  it('muchos votos: WR se acerca a R', () => {
    // (100/110)*9 + (10/110)*6 = 960/110 ≈ 8.73
    expect(weightedRating(100, 9, 6)).toBeCloseTo(96 / 11, 10)
  })

  it('v = 0 → WR = C', () => {
    expect(weightedRating(0, 0, 7.5)).toBe(7.5)
  })

  it('m configurable', () => {
    // (10/40)*9 + (30/40)*5 = 6
    expect(weightedRating(10, 9, 5, 30)).toBe(6)
  })
})

// Limpieza inicial: deja el catálogo vacío (patrón de series.test.ts).
beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('canal').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('categoria').delete().not('id', 'is', null))
})

describe('rankings por WR con BD vacía (cliente anon, RLS de lectura pública)', () => {
  it('getGlobalMeanRating → 0', async () => {
    expect(await getGlobalMeanRating()).toBe(0)
  })

  it('getTopSeries → []', async () => {
    expect(await getTopSeries()).toEqual([])
  })
})

// Fixture diseñado para que el orden WR difiera del orden AVG: con m = 10 y
// C = 58/9 ≈ 6.44, wr-b (AVG 9, 2 votos) supera en WR a wr-a (AVG 10, 1 voto).
// wr-d aporta 6 notas bajas que bajan C · wr-c no tiene notas (fuera del top,
// última en /series) · wr-e es pendiente con nota alta: excluida de C y de
// los rankings.
describe('rankings por WR con datos (cliente anon, RLS de lectura pública)', () => {
  const createdAuthUserIds: string[] = []

  beforeAll(async () => {
    const runId = Date.now()
    for (const i of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      createdAuthUserIds.push(await createTestUser(`wr-u${i}-${runId}@iswdb.local`, TEST_PASSWORD))
    }
    await unwrap(
      dbAdmin.from('usuario').insert(
        createdAuthUserIds.map((id, i) => ({
          id,
          username: usernameDesdeEmail(`wr-u${i + 1}-${runId}@iswdb.local`, id)
        }))
      )
    )

    const categoria = await unwrap(
      dbAdmin.from('categoria').insert({ nombre: 'WR', slug: 'wr' }).select('id').single()
    )

    const filasSerie = ['wr-a', 'wr-b', 'wr-c', 'wr-d', 'wr-e'].map((slug, i) => ({
      titulo: `Serie WR ${slug.slice(-1).toUpperCase()}`,
      slug,
      categoria_id: categoria.id,
      moderation_status: slug === 'wr-e' ? 'pendiente' : 'aprobada',
      anio_inicio: 2024,
      created_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString()
    }))
    const series = await unwrap(dbAdmin.from('serie').insert(filasSerie).select('id, slug'))
    const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))

    const [u1, u2, u3, u4, u5, u6, u7, u8, u9] = createdAuthUserIds
    const filasValoracion: { user_id: string; serie_id: string; nota: number }[] = [
      { user_id: u1, serie_id: serieIdPorSlug['wr-a'], nota: 10 },
      { user_id: u2, serie_id: serieIdPorSlug['wr-b'], nota: 9 },
      { user_id: u3, serie_id: serieIdPorSlug['wr-b'], nota: 9 },
      // wr-c: sin valoraciones a propósito.
      { user_id: u4, serie_id: serieIdPorSlug['wr-d'], nota: 5 },
      { user_id: u5, serie_id: serieIdPorSlug['wr-d'], nota: 5 },
      { user_id: u6, serie_id: serieIdPorSlug['wr-d'], nota: 5 },
      { user_id: u7, serie_id: serieIdPorSlug['wr-d'], nota: 5 },
      { user_id: u8, serie_id: serieIdPorSlug['wr-d'], nota: 5 },
      { user_id: u9, serie_id: serieIdPorSlug['wr-d'], nota: 5 },
      // wr-e (pendiente) tiene nota alta a propósito: excluida de C y rankings.
      { user_id: u1, serie_id: serieIdPorSlug['wr-e'], nota: 10 }
    ]
    await unwrap(dbAdmin.from('valoracion').insert(filasValoracion))
  }, 120_000)

  afterAll(async () => {
    try {
      // Borrar las series cascada participa/valoracion/episodio.
      await unwrap(dbAdmin.from('serie').delete().like('slug', 'wr-%'))
      await unwrap(dbAdmin.from('categoria').delete().eq('slug', 'wr'))
      await unwrap(dbAdmin.from('usuario').delete().in('id', createdAuthUserIds))
    } catch (error) {
      console.warn(`Cleanup de tests/lib/wr.test.ts falló: ${(error as Error).message}`)
    }
    for (const id of createdAuthUserIds) {
      await deleteTestUser(id)
    }
  })

  it('getGlobalMeanRating: C = media de todas las notas de aprobadas (58/9), pendiente excluida', async () => {
    // (10 + 9 + 9 + 6*5) / 9 = 58/9 ≈ 6.444; la nota de wr-e no cuenta.
    expect(await getGlobalMeanRating()).toBeCloseTo(58 / 9, 10)
  })

  it('getTopSeries: orden WR ≠ orden AVG (wr-b antes que wr-a)', async () => {
    const top = await getTopSeries(5)
    // WR: wr-b ≈ 6.87 > wr-a ≈ 6.77 > wr-d ≈ 5.90; por AVG sería 10 > 9 > 5.
    expect(top.map((s) => s.slug)).toEqual(['wr-b', 'wr-a', 'wr-d'])
  })

  it('getTopSeries: sin valoraciones no aparece; pendientes tampoco', async () => {
    const top = await getTopSeries(20)
    expect(top.map((s) => s.slug)).toEqual(['wr-b', 'wr-a', 'wr-d'])
  })

  it('getHeroSerie: la de mayor WR (wr-b, no la de mayor AVG)', async () => {
    const hero = await getHeroSerie()
    expect(hero?.slug).toBe('wr-b')
    expect(hero?.rating).toEqual({ average: 9, count: 2 })
  })

  it('listSeries: con valoración por WR desc; sin valoración al final', async () => {
    const resultado = await listSeries()
    expect(resultado.total).toBe(4)
    expect(resultado.totalPages).toBe(1)
    expect(resultado.series.map((s) => s.slug)).toEqual(['wr-b', 'wr-a', 'wr-d', 'wr-c'])
  })
})
