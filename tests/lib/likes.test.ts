import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// lib/likes.ts importa lib/supabase.ts, que lanza si faltan env vars
// (fail fast); vi.hoisted se ejecuta antes que los imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

import { darLike, likesPorReseñas, likesPropios, quitarLike } from '@/lib/likes'
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

// F027 (LIKE-01..08): servicios de likes (lib/likes.ts). Los tests usan
// clientes con sesión en memoria (signInTestUser) para las escrituras (RLS
// own real de reseña_like) y dbAdmin como service-role en las lecturas.
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let userA: string
let userB: string
let userC: string
let userExtra: string
let clientA: SupabaseClient<Database>
let clientB: SupabaseClient<Database>
let clientExtra: SupabaseClient<Database>
let serieSId: string
let serie2Id: string
let reseñaR1: string
let reseñaR2: string
let reseñaR3: string

function slugDe(nombre: string): string {
  return `lksvc-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `lksvc-test-${nombre}-${runId}@iswdb.local`
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

async function crearReseña(userId: string, serieId: string): Promise<string> {
  const fila = await unwrap(
    dbAdmin
      .from('reseña')
      .insert({ user_id: userId, serie_id: serieId, contenido: contenido(70) })
      .select('id')
      .single()
  )
  return fila.id
}

beforeAll(async () => {
  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  userA = await crearUsuario('a')
  userB = await crearUsuario('b')
  userC = await crearUsuario('c')
  userExtra = await crearUsuario('extra')
  clientA = await signInTestUser(emailDe('a'), TEST_PASSWORD)
  clientB = await signInTestUser(emailDe('b'), TEST_PASSWORD)
  clientExtra = await signInTestUser(emailDe('extra'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin.from('categoria').insert({ nombre: `LkSvc Cat ${runId}`, slug: slugDe('cat') }).select('id').single()
  )
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        {
          titulo: 'Serie LkSvc Uno',
          slug: slugDe('s1'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        },
        {
          titulo: 'Serie LkSvc Dos',
          slug: slugDe('s2'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        }
      ])
      .select('id, slug')
  )
  serieSId = series.find((s) => s.slug === slugDe('s1'))!.id
  serie2Id = series.find((s) => s.slug === slugDe('s2'))!.id

  reseñaR1 = await crearReseña(userA, serieSId)
  reseñaR2 = await crearReseña(userB, serieSId)
  reseñaR3 = await crearReseña(userC, serieSId)
}, 120_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('serie').delete().like('slug', `lksvc-%${runId}`))
  await unwrap(dbAdmin.from('categoria').delete().like('slug', `lksvc-cat-%${runId}`))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('darLike / quitarLike (LIKE-01/LIKE-02)', () => {
  it('darLike inserta la fila', async () => {
    await darLike(clientA, reseñaR1, userA)

    const filas = await unwrap(
      dbAdmin.from('reseña_like').select('reseña_id, user_id').eq('reseña_id', reseñaR1).eq('user_id', userA)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]).toEqual({ reseña_id: reseñaR1, user_id: userA })
  }, 30_000)

  it('duplicado → idempotente (sin error, sin fila nueva)', async () => {
    await expect(darLike(clientA, reseñaR1, userA)).resolves.toBeUndefined()

    const filas = await unwrap(
      dbAdmin.from('reseña_like').select('reseña_id').eq('reseña_id', reseñaR1).eq('user_id', userA)
    )
    expect(filas).toHaveLength(1)
  }, 30_000)

  it('quitarLike borra la fila', async () => {
    await quitarLike(clientA, reseñaR1, userA)

    const filas = await unwrap(
      dbAdmin.from('reseña_like').select('reseña_id').eq('reseña_id', reseñaR1).eq('user_id', userA)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('quitar un like inexistente → idempotente (sin error)', async () => {
    await expect(quitarLike(clientA, reseñaR1, userA)).resolves.toBeUndefined()
  }, 30_000)
})

describe('likesPorReseñas / likesPropios (LIKE-04)', () => {
  it('likesPorReseñas devuelve Map con los conteos correctos', async () => {
    await darLike(clientA, reseñaR1, userA)
    await darLike(clientA, reseñaR2, userA)
    await darLike(clientB, reseñaR2, userB)

    const conteos = await likesPorReseñas(dbAdmin, [reseñaR1, reseñaR2, reseñaR3])

    expect(conteos.get(reseñaR1)).toBe(1)
    expect(conteos.get(reseñaR2)).toBe(2)
    expect(conteos.has(reseñaR3)).toBe(false)
  }, 30_000)

  it('likesPropios devuelve Set con las reseñas liked por el usuario', async () => {
    const propiosA = await likesPropios(dbAdmin, [reseñaR1, reseñaR2, reseñaR3], userA)
    expect(propiosA.has(reseñaR1)).toBe(true)
    expect(propiosA.has(reseñaR2)).toBe(true)
    expect(propiosA.has(reseñaR3)).toBe(false)

    const propiosB = await likesPropios(dbAdmin, [reseñaR1, reseñaR2, reseñaR3], userB)
    expect(propiosB.has(reseñaR2)).toBe(true)
    expect(propiosB.has(reseñaR1)).toBe(false)
  }, 30_000)

  it('likesPropios con userId null → Set vacío', async () => {
    const vacios = await likesPropios(dbAdmin, [reseñaR1, reseñaR2], null)
    expect(vacios.size).toBe(0)
  }, 30_000)
})

describe('Cascadas (LIKE-06)', () => {
  it('borrar la reseña borra sus likes', async () => {
    const reseñaCascada = await crearReseña(userC, serie2Id)
    await darLike(clientA, reseñaCascada, userA)

    const antes = await unwrap(
      dbAdmin.from('reseña_like').select('reseña_id').eq('reseña_id', reseñaCascada)
    )
    expect(antes).toHaveLength(1)

    await unwrap(dbAdmin.from('reseña').delete().eq('id', reseñaCascada))

    const despues = await unwrap(
      dbAdmin.from('reseña_like').select('reseña_id').eq('reseña_id', reseñaCascada)
    )
    expect(despues).toHaveLength(0)
  }, 30_000)

  it('borrar el usuario borra sus likes', async () => {
    await darLike(clientExtra, reseñaR2, userExtra)

    await unwrap(
      dbAdmin.from('reseña_like').select('reseña_id').eq('reseña_id', reseñaR2).eq('user_id', userExtra)
    )
    await deleteTestUser(userExtra)

    const despues = await unwrap(
      dbAdmin.from('reseña_like').select('reseña_id').eq('reseña_id', reseñaR2).eq('user_id', userExtra)
    )
    expect(despues).toHaveLength(0)
  }, 30_000)
})