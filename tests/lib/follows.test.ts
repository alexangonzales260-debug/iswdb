import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// lib/follows.ts importa lib/supabase.ts, que lanza si faltan env vars
// (fail fast); vi.hoisted se ejecuta antes que los imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import {
  dejarDeSeguirSerie,
  estaSiguiendo,
  listMisSeguidas,
  seguirSerie
} from '@/lib/follows'
import { asegurarFilaUsuario } from '@/lib/auth'
import {
  createTestUser,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap,
  usernameDesdeEmail
} from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let userId: string
let client: Awaited<ReturnType<typeof signInTestUser>>

let serieAId: string
let serieBId: string

function slugDe(nombre: string): string {
  return `fol-lib-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `fol-lib-${nombre}-${runId}@iswdb.local`
}

beforeAll(async () => {
  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  userId = await createTestUser(emailDe('user'), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userId, username: usernameDesdeEmail(emailDe('user'), userId) })
  )
  client = await signInTestUser(emailDe('user'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Fol Lib Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )

  // Series aprobadas con created_at en la serie (no aplica al orden de follows).
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        { titulo: 'Serie Lib A', slug: slugDe('a'), categoria_id: categoria.id, moderation_status: 'aprobada', portada_url: null },
        { titulo: 'Serie Lib B', slug: slugDe('b'), categoria_id: categoria.id, moderation_status: 'aprobada', portada_url: 'https://img.example/portada-b.jpg' }
      ])
      .select('id, slug')
  )
  serieAId = series.find((s) => s.slug === slugDe('a'))!.id
  serieBId = series.find((s) => s.slug === slugDe('b'))!.id
}, 60_000)

afterAll(async () => {
  await unwrap(
    dbAdmin.from('usuario_serie').delete().in('serie_id', [serieAId, serieBId])
  )
  await unwrap(
    dbAdmin
      .from('serie')
      .delete()
      .in('slug', [slugDe('a'), slugDe('b')])
  )
  await unwrap(dbAdmin.from('categoria').delete().like('slug', `fol-lib-cat-${runId}`))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('seguirSerie (FOL-01)', () => {
  it('crea el follow → estaSiguiendo true', async () => {
    await seguirSerie(client, userId, serieAId)
    expect(await estaSiguiendo(client, userId, serieAId)).toBe(true)
  }, 30_000)

  it('duplicado → 23505 silencioso (idempotente, FOL-08)', async () => {
    await seguirSerie(client, userId, serieAId)
    await expect(seguirSerie(client, userId, serieAId)).resolves.toBeUndefined()
    // Solo una fila.
    const filas = await unwrap(
      dbAdmin
        .from('usuario_serie')
        .select('serie_id')
        .eq('usuario_id', userId)
        .eq('serie_id', serieAId)
    )
    expect(filas).toHaveLength(1)
  }, 30_000)
})

describe('dejarDeSeguirSerie (FOL-02)', () => {
  it('borra el follow → estaSiguiendo false', async () => {
    await seguirSerie(client, userId, serieBId)
    expect(await estaSiguiendo(client, userId, serieBId)).toBe(true)
    await dejarDeSeguirSerie(client, userId, serieBId)
    expect(await estaSiguiendo(client, userId, serieBId)).toBe(false)
  }, 30_000)

  it('follow inexistente → idempotente (no lanza)', async () => {
    await expect(
      dejarDeSeguirSerie(client, userId, serieAId)
    ).resolves.toBeUndefined()
  }, 30_000)
})

describe('estaSiguiendo (FOL-05)', () => {
  it('devuelve true si sigue la serie', async () => {
    await seguirSerie(client, userId, serieAId)
    expect(await estaSiguiendo(client, userId, serieAId)).toBe(true)
  }, 30_000)

  it('devuelve false si no sigue la serie', async () => {
    expect(await estaSiguiendo(client, userId, serieBId)).toBe(false)
  }, 30_000)
})

describe('listMisSeguidas (FOL-03)', () => {
  // Limpiar seguidas previas del usuario para un estado controlado.
  beforeEach(async () => {
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', userId))
  })

  it('junction con serie: join con titulo, slug y portada_url', async () => {
    await seguirSerie(client, userId, serieAId)
    const filas = await listMisSeguidas(client, userId)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toEqual({
      created_at: filas[0].created_at,
      serie: { titulo: 'Serie Lib A', slug: slugDe('a'), portada_url: null }
    })
  }, 30_000)

  it('order by created_at desc (más reciente primero)', async () => {
    // serieA primero (follow antiguo), luego serieB (follow reciente).
    await seguirSerie(client, userId, serieAId)
    const espera = new Promise((resolve) => setTimeout(resolve, 20))
    await espera
    await seguirSerie(client, userId, serieBId)

    const filas = await listMisSeguidas(client, userId)
    expect(filas).toHaveLength(2)
    expect(filas[0].serie.slug).toBe(slugDe('b'))
    expect(filas[1].serie.slug).toBe(slugDe('a'))
  }, 30_000)

  it('sin follows → lista vacía', async () => {
    const filas = await listMisSeguidas(client, userId)
    expect(filas).toEqual([])
  }, 30_000)
})

describe('self-healing: auth user sin fila en public.usuario (FK fix)', () => {
  let fixUserId: string
  let fixClient: Awaited<ReturnType<typeof signInTestUser>>

  beforeAll(async () => {
    // Crear auth user SOLO en GoTrue, sin fila en public.usuario.
    fixUserId = await createTestUser(emailDe('fix-user'), TEST_PASSWORD)
    createdAuthUserIds.push(fixUserId)
    fixClient = await signInTestUser(emailDe('fix-user'), TEST_PASSWORD)
  }, 60_000)

  afterAll(async () => {
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', fixUserId))
    // La fila de usuario se crea durante el test; se limpia junto al auth user.
    await unwrap(dbAdmin.from('usuario').delete().eq('id', fixUserId))
  })

  it('asegurarFilaUsuario + seguirSerie: crea follow sin FK violation y crea fila usuario', async () => {
    // Precondición: no hay fila de usuario aún.
    const antes = await unwrap(
      dbAdmin.from('usuario').select('id').eq('id', fixUserId).maybeSingle()
    )
    expect(antes).toBeNull()

    // Mismo flujo que accionSeguir: self-healing ANTES de seguirSerie.
    await asegurarFilaUsuario(fixClient, fixUserId, emailDe('fix-user'))
    await seguirSerie(fixClient, fixUserId, serieAId)

    expect(await estaSiguiendo(fixClient, fixUserId, serieAId)).toBe(true)

    const despues = await unwrap(
      dbAdmin.from('usuario').select('id, rol').eq('id', fixUserId).single()
    )
    expect(despues.rol).toBe('user')
  }, 30_000)

  it('asegurarFilaUsuario es idempotente (la fila ya existe → no falla ni sobreescribe rol)', async () => {
    await asegurarFilaUsuario(fixClient, fixUserId, emailDe('fix-user'))
    const fila = await unwrap(
      dbAdmin.from('usuario').select('rol').eq('id', fixUserId).single()
    )
    expect(fila.rol).toBe('user')
  }, 30_000)

  it('sin asegurarFilaUsuario: seguirSerie lanza FK violation (regresión esperada sin fix)', async () => {
    // Un usuario completamente nuevo, sin fila, solo GoTrue.
    const bareId = await createTestUser(emailDe('bare'), TEST_PASSWORD)
    createdAuthUserIds.push(bareId)
    const bareClient = await signInTestUser(emailDe('bare'), TEST_PASSWORD)

    await expect(
      seguirSerie(bareClient, bareId, serieBId)
    ).rejects.toThrow(/violates foreign key|usuario/)

    await unwrap(dbAdmin.from('usuario').delete().eq('id', bareId))
  }, 30_000)
})
