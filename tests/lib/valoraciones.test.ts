import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// lib/valoraciones.ts importa lib/supabase.ts, que lanza si faltan env vars
// (fail fast); vi.hoisted se ejecuta antes que los imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import { listMisValoraciones } from '@/lib/valoraciones'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap, usernameDesdeEmail } from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
let userDos: string
let userUna: string
let userNada: string
const createdAuthUserIds: string[] = []

function slugDe(n: number): string {
  return `vl-${String(n).padStart(2, '0')}-${runId}`
}

// Limpieza inicial: catálogo vacío + seed propio (patrón de series.test.ts).
beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('canal').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('categoria').delete().not('id', 'is', null))

  runId = Date.now()
  userDos = await createTestUser(`vl-dos-${runId}@iswdb.local`, TEST_PASSWORD)
  userUna = await createTestUser(`vl-una-${runId}@iswdb.local`, TEST_PASSWORD)
  userNada = await createTestUser(`vl-nada-${runId}@iswdb.local`, TEST_PASSWORD)
  createdAuthUserIds.push(userDos, userUna, userNada)
  await unwrap(
    dbAdmin.from('usuario').insert([
      { id: userDos, username: usernameDesdeEmail(`vl-dos-${runId}@iswdb.local`, userDos) },
      { id: userUna, username: usernameDesdeEmail(`vl-una-${runId}@iswdb.local`, userUna) },
      { id: userNada, username: usernameDesdeEmail(`vl-nada-${runId}@iswdb.local`, userNada) }
    ])
  )

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-vl-${runId}`, slug: `cat-vl-${runId}` })
      .select('id')
      .single()
  )
  const titulos = ['Serie VL Uno', 'Serie VL Dos', 'Serie VL Tres']
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert(
        titulos.map((titulo, i) => ({
          titulo,
          slug: slugDe(i + 1),
          categoria_id: categoria.id
        }))
      )
      .select('id, slug')
  )
  const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))

  // created_at explícitos: vl-02 es más reciente que vl-01 → en orden desc
  // la valoración de vl-02 debe aparecer primero.
  await unwrap(
    dbAdmin.from('valoracion').insert([
      {
        user_id: userDos,
        serie_id: serieIdPorSlug[slugDe(1)],
        nota: 8,
        created_at: '2026-01-05T10:00:00+00'
      },
      {
        user_id: userDos,
        serie_id: serieIdPorSlug[slugDe(2)],
        nota: 5,
        created_at: '2026-03-05T10:00:00+00'
      },
      {
        user_id: userUna,
        serie_id: serieIdPorSlug[slugDe(1)],
        nota: 9,
        created_at: '2026-02-05T10:00:00+00'
      }
    ])
  )
}, 60_000)

afterAll(async () => {
  // Borrar los auth users casca sus filas de usuario y valoracion (FK cascade).
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
  await unwrap(dbAdmin.from('serie').delete().like('slug', `vl-%${runId}`))
  await unwrap(dbAdmin.from('categoria').delete().like('slug', `cat-vl-%${runId}`))
})

describe('listMisValoraciones (AUTH-03)', () => {
  it('devuelve solo las valoraciones del usuario, orden created_at desc', async () => {
    const propias = await listMisValoraciones(userDos)
    expect(propias).toHaveLength(2)
    // vl-02 (2026-03) antes que vl-01 (2026-01).
    expect(propias[0].serie.slug).toBe(slugDe(2))
    expect(propias[0].nota).toBe(5)
    expect(propias[1].serie.slug).toBe(slugDe(1))
    expect(propias[1].nota).toBe(8)
  })

  it('incluye el join con serie (titulo y slug)', async () => {
    const propias = await listMisValoraciones(userDos)
    expect(propias[0].serie).toEqual({ titulo: 'Serie VL Dos', slug: slugDe(2) })
    expect(propias[1].serie).toEqual({ titulo: 'Serie VL Uno', slug: slugDe(1) })
    for (const fila of propias) {
      expect(fila.created_at).toBeTruthy()
    }
  })

  it('otro usuario solo ve las suyas', async () => {
    const propias = await listMisValoraciones(userUna)
    expect(propias).toHaveLength(1)
    expect(propias[0].nota).toBe(9)
    expect(propias[0].serie.slug).toBe(slugDe(1))
  })

  it('usuario sin valoraciones → lista vacía', async () => {
    const propias = await listMisValoraciones(userNada)
    expect(propias).toEqual([])
  })
})
