import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// lib/reseñas.ts importa lib/supabase.ts (fail fast si faltan env vars);
// vi.hoisted se ejecuta antes que los imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

import { darLike } from '@/lib/likes'
import { getReseña, listReseñasSerie } from '@/lib/reseñas'
import type { Database } from '@/types/database'
import {
  createTestUser,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap,
  usernameDesdeEmail
} from '../db/env'

// F012/F027: listReseñasSerie y getReseña devuelven numLikes y yaDisteLike
// (parámetro opcional userId). Las escrituras de likes usan clientes con
// sesión (RLS own real); las lecturas con embed usan dbAdmin (service-role).
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let userA: string
let userB: string
let userC: string
let clientA: SupabaseClient<Database>
let clientB: SupabaseClient<Database>
let clientC: SupabaseClient<Database>
let serieId: string
let reseñaUno: string
let reseñaDos: string

function slugDe(nombre: string): string {
  return `rssvc-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `rssvc-test-${nombre}-${runId}@iswdb.local`
}

function contenido(n: number): string {
  return 'a'.repeat(n)
}

async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userId, username: usernameDesdeEmail(emailDe(nombre), userId) })
  )
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  userA = await crearUsuario('a')
  userB = await crearUsuario('b')
  userC = await crearUsuario('c')
  clientA = await signInTestUser(emailDe('a'), TEST_PASSWORD)
  clientB = await signInTestUser(emailDe('b'), TEST_PASSWORD)
  clientC = await signInTestUser(emailDe('c'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin.from('categoria').insert({ nombre: `RsSvc Cat ${runId}`, slug: slugDe('cat') }).select('id').single()
  )
  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie RsSvc',
        slug: slugDe('s'),
        categoria_id: categoria.id,
        moderation_status: 'aprobada'
      })
      .select('id')
      .single()
  )
  serieId = serie.id

  const reseñas = await unwrap(
    dbAdmin
      .from('reseña')
      .insert([
        { user_id: userA, serie_id: serieId, contenido: contenido(70) },
        { user_id: userB, serie_id: serieId, contenido: contenido(71) }
      ])
      .select('id, user_id')
  )
  reseñaUno = reseñas.find((r) => r.user_id === userA)!.id
  reseñaDos = reseñas.find((r) => r.user_id === userB)!.id

  // reseñaUno: 2 likes (userA auto-like + userB). reseñaDos: 1 like (userC).
  await darLike(clientA, reseñaUno, userA)
  await darLike(clientB, reseñaUno, userB)
  await darLike(clientC, reseñaDos, userC)
}, 120_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('serie').delete().like('slug', `rssvc-%${runId}`))
  await unwrap(dbAdmin.from('categoria').delete().like('slug', `rssvc-cat-%${runId}`))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('listReseñasSerie (RES-08) con likes (F027)', () => {
  it('sin userId → numLikes presente y yaDisteLike false', async () => {
    const lista = await listReseñasSerie(dbAdmin, serieId)

    expect(lista).toHaveLength(2)
    expect(lista.map((r) => r.id).sort()).toEqual([reseñaUno, reseñaDos].sort())
    for (const reseña of lista) {
      expect(typeof reseña.numLikes).toBe('number')
      expect(reseña.yaDisteLike).toBe(false)
    }
    const porId = new Map(lista.map((r) => [r.id, r]))
    expect(porId.get(reseñaUno)!.numLikes).toBe(2)
    expect(porId.get(reseñaDos)!.numLikes).toBe(1)
  }, 30_000)

  it('con userId → yaDisteLike true solo en las propias', async () => {
    const lista = await listReseñasSerie(dbAdmin, serieId, userA)

    const porId = new Map(lista.map((r) => [r.id, r]))
    expect(porId.get(reseñaUno)!.yaDisteLike).toBe(true)
    expect(porId.get(reseñaDos)!.yaDisteLike).toBe(false)
    expect(porId.get(reseñaUno)!.numLikes).toBe(2)
    expect(porId.get(reseñaDos)!.numLikes).toBe(1)
  }, 30_000)

  it('serie sin reseñas → lista vacía (sin llamadas a likes)', async () => {
    await expect(listReseñasSerie(dbAdmin, crypto.randomUUID())).resolves.toEqual([])
  }, 30_000)
})

describe('getReseña (F025) con likes (F027)', () => {
  it('sin userId → numLikes presente y yaDisteLike false', async () => {
    const reseña = await getReseña(dbAdmin, reseñaUno)

    expect(reseña).not.toBeNull()
    expect(reseña!.numLikes).toBe(2)
    expect(reseña!.yaDisteLike).toBe(false)
  }, 30_000)

  it('con userId → yaDisteLike correcto', async () => {
    const reseña = await getReseña(dbAdmin, reseñaUno, userB)

    expect(reseña).not.toBeNull()
    expect(reseña!.numLikes).toBe(2)
    expect(reseña!.yaDisteLike).toBe(true)

    const ajena = await getReseña(dbAdmin, reseñaDos, userB)
    expect(ajena).not.toBeNull()
    expect(ajena!.numLikes).toBe(1)
    expect(ajena!.yaDisteLike).toBe(false)
  }, 30_000)
})