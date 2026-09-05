import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// lib/recomendaciones.ts importa lib/supabase.ts (env check) y lib/auth.ts
// (env check). vi.hoisted se ejecuta ANTES de los imports; setear BOTH
// NEXT_PUBLIC_SUPABASE_* Y SUPABASE_SERVICE_ROLE_KEY (createServiceRoleClient).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

import { getRecomendaciones, getSeriesSimilares } from '@/lib/recomendaciones'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, signInTestUser, unwrap, usernameDesdeEmail } from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let userId: string
let client: Awaited<ReturnType<typeof signInTestUser>>
let userNadaId: string
let clientNada: Awaited<ReturnType<typeof signInTestUser>>

let catA: string
let catB: string
let catC: string
let catD: string
let catE: string

let sourceAId: string
let sourceBId: string
let sourceCId: string
let valoradaBajaId: string
let candA1Id: string
let candA2Id: string
let candB1Id: string
let candC1Id: string
let candD1Id: string
let unicaEId: string

let u2Id: string
let u3Id: string
let u4Id: string

function slugDe(nombre: string): string {
  return `rec-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `rec-${nombre}-${runId}@iswdb.local`
}

beforeAll(async () => {
  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  userId = await createTestUser(emailDe('owner'), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userId, username: usernameDesdeEmail(emailDe('owner'), userId) })
  )
  client = await signInTestUser(emailDe('owner'), TEST_PASSWORD)

  userNadaId = await createTestUser(emailDe('nada'), TEST_PASSWORD)
  createdAuthUserIds.push(userNadaId)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userNadaId, username: usernameDesdeEmail(emailDe('nada'), userNadaId) })
  )
  clientNada = await signInTestUser(emailDe('nada'), TEST_PASSWORD)

  u2Id = await createTestUser(emailDe('u2'), TEST_PASSWORD)
  createdAuthUserIds.push(u2Id)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: u2Id, username: usernameDesdeEmail(emailDe('u2'), u2Id) })
  )

  u3Id = await createTestUser(emailDe('u3'), TEST_PASSWORD)
  createdAuthUserIds.push(u3Id)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: u3Id, username: usernameDesdeEmail(emailDe('u3'), u3Id) })
  )

  u4Id = await createTestUser(emailDe('u4'), TEST_PASSWORD)
  createdAuthUserIds.push(u4Id)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: u4Id, username: usernameDesdeEmail(emailDe('u4'), u4Id) })
  )

  const cats = await unwrap(
    dbAdmin
      .from('categoria')
      .insert([
        { nombre: `Rec Cat A ${runId}`, slug: slugDe('cat-a') },
        { nombre: `Rec Cat B ${runId}`, slug: slugDe('cat-b') },
        { nombre: `Rec Cat C ${runId}`, slug: slugDe('cat-c') },
        { nombre: `Rec Cat D ${runId}`, slug: slugDe('cat-d') },
        { nombre: `Rec Cat E ${runId}`, slug: slugDe('cat-e') }
      ])
      .select('id, slug')
  )
  catA = cats.find((c) => c.slug === slugDe('cat-a'))!.id
  catB = cats.find((c) => c.slug === slugDe('cat-b'))!.id
  catC = cats.find((c) => c.slug === slugDe('cat-c'))!.id
  catD = cats.find((c) => c.slug === slugDe('cat-d'))!.id
  catE = cats.find((c) => c.slug === slugDe('cat-e'))!.id

  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        { titulo: 'Source A', slug: slugDe('source-a'), categoria_id: catA, moderation_status: 'aprobada', created_at: '2026-01-01T10:00:00+00' },
        { titulo: 'Source B', slug: slugDe('source-b'), categoria_id: catB, moderation_status: 'aprobada', created_at: '2026-01-02T10:00:00+00' },
        { titulo: 'Source C', slug: slugDe('source-c'), categoria_id: catC, moderation_status: 'aprobada', created_at: '2026-01-03T10:00:00+00' },
        { titulo: 'Valorada Baja', slug: slugDe('valorada-baja'), categoria_id: catA, moderation_status: 'aprobada', created_at: '2026-01-04T10:00:00+00' },
        { titulo: 'Cand A1', slug: slugDe('cand-a1'), categoria_id: catA, moderation_status: 'aprobada', created_at: '2026-02-01T10:00:00+00' },
        { titulo: 'Cand A2', slug: slugDe('cand-a2'), categoria_id: catA, moderation_status: 'aprobada', created_at: '2026-02-02T10:00:00+00' },
        { titulo: 'Cand B1', slug: slugDe('cand-b1'), categoria_id: catB, moderation_status: 'aprobada', created_at: '2026-02-03T10:00:00+00' },
        { titulo: 'Cand C1', slug: slugDe('cand-c1'), categoria_id: catC, moderation_status: 'aprobada', created_at: '2026-02-04T10:00:00+00' },
        { titulo: 'Cand D1', slug: slugDe('cand-d1'), categoria_id: catD, moderation_status: 'aprobada', created_at: '2026-02-05T10:00:00+00' },
        { titulo: 'Unica E', slug: slugDe('unica-e'), categoria_id: catE, moderation_status: 'aprobada', created_at: '2026-02-06T10:00:00+00' }
      ])
      .select('id, slug')
  )
  sourceAId = series.find((s) => s.slug === slugDe('source-a'))!.id
  sourceBId = series.find((s) => s.slug === slugDe('source-b'))!.id
  sourceCId = series.find((s) => s.slug === slugDe('source-c'))!.id
  valoradaBajaId = series.find((s) => s.slug === slugDe('valorada-baja'))!.id
  candA1Id = series.find((s) => s.slug === slugDe('cand-a1'))!.id
  candA2Id = series.find((s) => s.slug === slugDe('cand-a2'))!.id
  candB1Id = series.find((s) => s.slug === slugDe('cand-b1'))!.id
  candC1Id = series.find((s) => s.slug === slugDe('cand-c1'))!.id
  candD1Id = series.find((s) => s.slug === slugDe('cand-d1'))!.id
  unicaEId = series.find((s) => s.slug === slugDe('unica-e'))!.id

  await unwrap(
    dbAdmin.from('usuario_serie').insert([
      { usuario_id: userId, serie_id: sourceAId, created_at: '2026-01-10T10:00:00+00' },
      { usuario_id: userId, serie_id: sourceBId, created_at: '2026-01-11T10:00:00+00' }
    ])
  )
  await unwrap(
    dbAdmin.from('valoracion').insert([
      { user_id: userId, serie_id: sourceAId, nota: 9, created_at: '2026-01-15T10:00:00+00' },
      { user_id: userId, serie_id: sourceCId, nota: 8, created_at: '2026-01-16T10:00:00+00' },
      { user_id: userId, serie_id: valoradaBajaId, nota: 5, created_at: '2026-01-17T10:00:00+00' }
    ])
  )

  await unwrap(
    dbAdmin.from('usuario_serie').insert([
      { usuario_id: u2Id, serie_id: candA2Id, created_at: '2026-03-01T10:00:00+00' },
      { usuario_id: u3Id, serie_id: candA2Id, created_at: '2026-03-02T10:00:00+00' },
      { usuario_id: u2Id, serie_id: candA1Id, created_at: '2026-03-03T10:00:00+00' },
      { usuario_id: u3Id, serie_id: candA1Id, created_at: '2026-03-04T10:00:00+00' },
      { usuario_id: u2Id, serie_id: candB1Id, created_at: '2026-03-05T10:00:00+00' },
      { usuario_id: u2Id, serie_id: candD1Id, created_at: '2026-03-06T10:00:00+00' },
      { usuario_id: u3Id, serie_id: candD1Id, created_at: '2026-03-07T10:00:00+00' },
      { usuario_id: u4Id, serie_id: candD1Id, created_at: '2026-03-08T10:00:00+00' }
    ])
  )
}, 60_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('usuario_serie').delete().in('serie_id', [
    sourceAId, sourceBId, sourceCId, valoradaBajaId,
    candA1Id, candA2Id, candB1Id, candC1Id, candD1Id, unicaEId
  ]))
  await unwrap(dbAdmin.from('valoracion').delete().in('serie_id', [
    sourceAId, sourceBId, sourceCId, valoradaBajaId
  ]))
  await unwrap(dbAdmin.from('serie').delete().in('slug', [
    slugDe('source-a'), slugDe('source-b'), slugDe('source-c'), slugDe('valorada-baja'),
    slugDe('cand-a1'), slugDe('cand-a2'), slugDe('cand-b1'), slugDe('cand-c1'),
    slugDe('cand-d1'), slugDe('unica-e')
  ]))
  await unwrap(dbAdmin.from('categoria').delete().in('slug', [
    slugDe('cat-a'), slugDe('cat-b'), slugDe('cat-c'), slugDe('cat-d'), slugDe('cat-e')
  ]))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('getRecomendaciones (REC-01/REC-02/REC-03/REC-06)', () => {
  it('devuelve solo series de A/B/C (nunca D, ni candD1 con 3 seguidores)', async () => {
    const recs = await getRecomendaciones(client, userId, 10)
    const slugs = recs.map((r) => r.serie.slug)
    expect(slugs).not.toContain(slugDe('cand-d1'))
    // Solo 4 candidatas en A/B/C: candA1, candA2, candB1, candC1
    const esperados = new Set([slugDe('cand-a1'), slugDe('cand-a2'), slugDe('cand-b1'), slugDe('cand-c1')])
    expect(new Set(slugs)).toEqual(esperados)
  }, 30_000)

  it('orden por seguidores desc (candA2 y candA1 tienen 2, tie created_at desc); luego candB1 (1); luego candC1 (0)', async () => {
    const recs = await getRecomendaciones(client, userId, 10)
    const ids = recs.map((r) => r.serie.id)
    expect(ids[0]).toBe(candA2Id)
    expect(ids[1]).toBe(candA1Id)
    const b1Idx = ids.indexOf(candB1Id)
    const c1Idx = ids.indexOf(candC1Id)
    expect(b1Idx).toBeLessThan(c1Idx)
  }, 30_000)

  it('respeta el limit', async () => {
    const recs = await getRecomendaciones(client, userId, 2)
    expect(recs).toHaveLength(2)
    expect(recs[0].serie.id).toBe(candA2Id)
    expect(recs[1].serie.id).toBe(candA1Id)
  }, 30_000)

  it('sin series seguidas/valoradas en output (incluye valoradaBaja nota<7)', async () => {
    const recs = await getRecomendaciones(client, userId, 10)
    const ids = recs.map((r) => r.serie.id)
    expect(ids).not.toContain(sourceAId)
    expect(ids).not.toContain(sourceBId)
    expect(ids).not.toContain(sourceCId)
    expect(ids).not.toContain(valoradaBajaId)
  }, 30_000)

  it('razones: candA1/candA2 → "Porque sigues Source A"; candB1 → "Porque sigues Source B"; candC1 → "Porque valoraste Source C"', async () => {
    const recs = await getRecomendaciones(client, userId, 10)
    const razones = recs.map((r) => ({ id: r.serie.id, razon: r.razon }))
    expect(razones.find((r) => r.id === candA2Id)?.razon).toBe('Porque sigues Source A')
    expect(razones.find((r) => r.id === candA1Id)?.razon).toBe('Porque sigues Source A')
    expect(razones.find((r) => r.id === candB1Id)?.razon).toBe('Porque sigues Source B')
    expect(razones.find((r) => r.id === candC1Id)?.razon).toBe('Porque valoraste Source C')
  }, 30_000)

  it('usuario sin follows ni valoraciones → []', async () => {
    const recs = await getRecomendaciones(clientNada, userNadaId, 6)
    expect(recs).toEqual([])
  }, 30_000)

  it('usuario sin follows pero con valoración >=7 → recomendaciones por valorada', async () => {
    await unwrap(
      dbAdmin.from('valoracion').insert({
        user_id: userNadaId,
        serie_id: sourceAId,
        nota: 8,
        created_at: '2026-05-01T10:00:00+00'
      })
    )
    const recs = await getRecomendaciones(clientNada, userNadaId, 6)
    expect(recs.length).toBeGreaterThan(0)
    const r = recs.find((x) => x.serie.id === candA2Id)
    expect(r?.razon).toBe('Porque valoraste Source A')
    await unwrap(dbAdmin.from('valoracion').delete().eq('user_id', userNadaId).eq('serie_id', sourceAId))
  }, 30_000)
})

describe('getSeriesSimilares (REC-04)', () => {
  it('sourceA (cat A) → [candA2, candA1, valoradaBaja] (sin la actual, orden seguidores desc)', async () => {
    const similares = await getSeriesSimilares(client, sourceAId, 10)
    const ids = similares.map((s) => s.id)
    expect(ids).toEqual([candA2Id, candA1Id, valoradaBajaId])
  }, 30_000)

  it('serie única en su categoría (unicaE en cat E) → []', async () => {
    const similares = await getSeriesSimilares(client, unicaEId, 4)
    expect(similares).toEqual([])
  }, 30_000)

  it('respeta limit (4)', async () => {
    const similares = await getSeriesSimilares(client, sourceAId, 2)
    expect(similares).toHaveLength(2)
    expect(similares[0].id).toBe(candA2Id)
    expect(similares[1].id).toBe(candA1Id)
  }, 30_000)

  it('serie inexistente → []', async () => {
    const similares = await getSeriesSimilares(client, '00000000-0000-0000-0000-000000000000', 4)
    expect(similares).toEqual([])
  }, 30_000)
})