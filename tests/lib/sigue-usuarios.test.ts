import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// lib/sigue-usuarios.ts importa lib/supabase.ts (createServiceRoleClient), que
// lanza si faltan env vars (fail fast); vi.hoisted se ejecuta antes de imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

// lib/sigue-usuarios.ts llama a notificarNuevoSeguidor (F023). Se mockea el
// módulo para poder forzar fallos (log-and-continue); el mock llama por defecto
// a la implementación real para que los tests de base de datos sigan válidos.
vi.mock('@/lib/notificaciones', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/notificaciones')>()
  return { ...mod, notificarNuevoSeguidor: vi.fn().mockImplementation(mod.notificarNuevoSeguidor) }
})

import {
  contadoresUsuario,
  dejarDeSeguirUsuario,
  ERRORES_SIGUE,
  estaSiguiendoUsuario,
  getUsuarioIdPorUsername,
  listFeed,
  seguirUsuario
} from '@/lib/sigue-usuarios'
import { notificarNuevoSeguidor } from '@/lib/notificaciones'
import { createServiceRoleClient } from '@/lib/supabase'
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
let userIdA: string
let userIdB: string
let usernameB: string
let clientA: SupabaseClient<Database>
const createdAuthUserIds: string[] = []

// Cliente service_role server-side (D25/D27): contadores y feed cross-user.
const serviceRole = createServiceRoleClient()
const mockNotificarNuevoSeguidor = vi.mocked(notificarNuevoSeguidor)

function slugDe(n: number): string {
  return `sgu-lib-${String(n).padStart(2, '0')}-${runId}`
}

function emailDe(nombre: string): string {
  return `sgu-lib-${nombre}-${runId}@iswdb.local`
}

// El seguidor (A) y el seguido (B): ambos con fila en public.usuario (FK).
async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userId, username: usernameDesdeEmail(emailDe(nombre), userId) })
  )
  return userId
}

// Limpieza inicial: catálogo vacío + seed propio (patrón actividad.test.ts).
beforeAll(async () => {
  await unwrap(dbAdmin.from('usuario_usuario').delete().not('seguidor_id', 'is', null))
  await unwrap(dbAdmin.from('usuario_usuario').delete().not('seguido_id', 'is', null))
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('reseña').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('lista_serie').delete().not('lista_id', 'is', null))
  await unwrap(dbAdmin.from('lista').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('usuario_serie').delete().not('usuario_id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('canal').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('categoria').delete().not('id', 'is', null))

  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  userIdA = await crearUsuario('a')
  userIdB = await crearUsuario('b')
  usernameB = usernameDesdeEmail(emailDe('b'), userIdB)
  clientA = await signInTestUser(emailDe('a'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-sgu-lib-${runId}`, slug: `cat-sgu-lib-${runId}` })
      .select('id')
      .single()
  )

  // 2 series aprobadas + 1 no aprobada (se excluye del feed).
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        { titulo: 'Serie Sgu Uno', slug: slugDe(1), categoria_id: categoria.id, moderation_status: 'aprobada' },
        { titulo: 'Serie Sgu Dos', slug: slugDe(2), categoria_id: categoria.id, moderation_status: 'aprobada' },
        { titulo: 'Serie Sgu No Aprobada', slug: slugDe(3), categoria_id: categoria.id, moderation_status: 'pendiente' }
      ])
      .select('id, slug')
  )
  const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))
  const s1 = serieIdPorSlug[slugDe(1)]
  const s2 = serieIdPorSlug[slugDe(2)]
  const s3 = serieIdPorSlug[slugDe(3)]

  // Valoraciones de B: 2 aprobadas + 1 no aprobada (excluida del feed).
  await unwrap(
    dbAdmin.from('valoracion').insert([
      { user_id: userIdB, serie_id: s1, nota: 8, created_at: '2026-01-05T10:00:00+00' },
      { user_id: userIdB, serie_id: s2, nota: 5, created_at: '2026-03-05T10:00:00+00' },
      { user_id: userIdB, serie_id: s3, nota: 3, created_at: '2026-02-05T10:00:00+00' }
    ])
  )

  // Reseñas de B: 1 pública aprobada + 1 no aprobada (excluida).
  await unwrap(
    dbAdmin.from('reseña').insert([
      {
        user_id: userIdB,
        serie_id: s1,
        contenido: 'Reseña pública de B sobre una serie aprobada con detalle suficiente para el feed.',
        created_at: '2026-02-10T10:00:00+00'
      },
      {
        user_id: userIdB,
        serie_id: s3,
        contenido: 'Reseña de B sobre una serie no aprobada que no debe aparecer en el feed jamás.',
        created_at: '2026-04-10T10:00:00+00'
      }
    ])
  )

  // Listas de B: 1 pública + 1 privada (excluida del feed).
  const listas = await unwrap(
    dbAdmin
      .from('lista')
      .insert([
        { user_id: userIdB, nombre: 'Lista pública de B', descripcion: 'Para el feed', es_publica: true, created_at: '2026-04-01T10:00:00+00' },
        { user_id: userIdB, nombre: 'Lista privada de B', descripcion: null, es_publica: false, created_at: '2026-05-01T10:00:00+00' }
      ])
      .select('id, es_publica, created_at')
  )
  const listaPublica = listas.find((l) => l.es_publica)!.id
  const listaPrivada = listas.find((l) => !l.es_publica)!.id
  await unwrap(
    dbAdmin.from('lista_serie').insert([
      { lista_id: listaPublica, serie_id: s1, posicion: 1 },
      { lista_id: listaPublica, serie_id: s2, posicion: 2 },
      { lista_id: listaPrivada, serie_id: s3, posicion: 1 }
    ])
  )
}, 60_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('notificacion').delete().eq('seguidor_id', userIdA))
  await unwrap(
    dbAdmin.from('usuario_usuario').delete().in('seguidor_id', createdAuthUserIds)
  )
  await unwrap(
    dbAdmin.from('usuario_usuario').delete().in('seguido_id', createdAuthUserIds)
  )
  await unwrap(dbAdmin.from('serie').delete().like('slug', `sgu-lib-%${runId}`))
  await unwrap(dbAdmin.from('categoria').delete().like('slug', `cat-sgu-lib-${runId}`))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('seguirUsuario (SEG-01)', () => {
  it('crea el follow → estaSiguiendoUsuario true', async () => {
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)
    expect(await estaSiguiendoUsuario(clientA, userIdA, userIdB)).toBe(true)
  }, 30_000)

  it('duplicado → 23505 silencioso (idempotente, doble click)', async () => {
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)
    await expect(seguirUsuario(clientA, serviceRole, userIdA, userIdB)).resolves.toBeUndefined()
    const filas = await unwrap(
      dbAdmin
        .from('usuario_usuario')
        .select('seguido_id')
        .eq('seguidor_id', userIdA)
        .eq('seguido_id', userIdB)
    )
    expect(filas).toHaveLength(1)
  }, 30_000)

  it('autofollow (seguidorId === seguidoId) → noPuedeSeguirse', async () => {
    await expect(seguirUsuario(clientA, serviceRole, userIdA, userIdA)).rejects.toThrow(
      ERRORES_SIGUE.noPuedeSeguirse
    )
  }, 30_000)

  it('destino inexistente → destinoNoEncontrado (23503)', async () => {
    const inexistente = '00000000-0000-4000-8000-000000000000'
    await expect(seguirUsuario(clientA, serviceRole, userIdA, inexistente)).rejects.toThrow(
      ERRORES_SIGUE.destinoNoEncontrado
    )
  }, 30_000)
})

describe('dejarDeSeguirUsuario (SEG-02)', () => {
  it('borra el follow → estaSiguiendoUsuario false', async () => {
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)
    expect(await estaSiguiendoUsuario(clientA, userIdA, userIdB)).toBe(true)
    await dejarDeSeguirUsuario(clientA, userIdA, userIdB)
    expect(await estaSiguiendoUsuario(clientA, userIdA, userIdB)).toBe(false)
  }, 30_000)

  it('follow inexistente → idempotente (no lanza)', async () => {
    await expect(
      dejarDeSeguirUsuario(clientA, userIdA, userIdB)
    ).resolves.toBeUndefined()
  }, 30_000)
})

describe('estaSiguiendoUsuario (SEG-03)', () => {
  it('true si sigue al usuario', async () => {
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)
    expect(await estaSiguiendoUsuario(clientA, userIdA, userIdB)).toBe(true)
  }, 30_000)

  it('false si no sigue al usuario', async () => {
    await dejarDeSeguirUsuario(clientA, userIdA, userIdB)
    expect(await estaSiguiendoUsuario(clientA, userIdA, userIdB)).toBe(false)
  }, 30_000)
})

describe('contadoresUsuario (SEG-04)', () => {
  it('devuelve { seguidos, seguidores }', async () => {
    // A sigue a B y a otro; nadie sigue a A → B tiene 1 seguidor (A).
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)
    const deA = await contadoresUsuario(serviceRole, userIdA)
    expect(deA.seguidos).toBe(1)
    expect(deA.seguidores).toBe(0)
    const deB = await contadoresUsuario(serviceRole, userIdB)
    expect(deB.seguidos).toBe(0)
    expect(deB.seguidores).toBe(1)
  }, 30_000)
})

describe('getUsuarioIdPorUsername', () => {
  it('username válido → id', async () => {
    const id = await getUsuarioIdPorUsername(serviceRole, usernameB)
    expect(id).toBe(userIdB)
  }, 30_000)

  it('username inexistente → null', async () => {
    const id = await getUsuarioIdPorUsername(serviceRole, `no-existe-${runId}`)
    expect(id).toBeNull()
  }, 30_000)
})

describe('listFeed (SEG-06)', () => {
  // Limpiar follows de A para un estado controlado en cada test de feed.
  async function resetFollows() {
    await unwrap(dbAdmin.from('usuario_usuario').delete().eq('seguidor_id', userIdA))
  }

  it('sin follows → lista vacía', async () => {
    await resetFollows()
    const feed = await listFeed(serviceRole, userIdA)
    expect(feed).toEqual([])
  }, 30_000)

  it('union de las 3 fuentes ordenadas por created_at desc', async () => {
    await resetFollows()
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)

    const feed = await listFeed(serviceRole, userIdA)

    // created_at de B: valoración s2 (03-05), lista pública (04-01), reseña s1
    // (02-10), valoración s1 (01-05) → orden desc esperado.
    expect(feed.map((i) => i.tipo)).toEqual([
      'lista',
      'valoracion',
      'resena',
      'valoracion'
    ])

    expect(feed[0]).toMatchObject({
      tipo: 'lista',
      autor: { id: userIdB, username: usernameB },
      lista: { nombre: 'Lista pública de B' }
    })
    expect(feed[1]).toMatchObject({
      tipo: 'valoracion',
      autor: { id: userIdB, username: usernameB },
      serie: { slug: slugDe(2) },
      nota: 5
    })
    expect(feed[2]).toMatchObject({
      tipo: 'resena',
      autor: { id: userIdB, username: usernameB },
      serie: { slug: slugDe(1) }
    })
    expect(feed[3]).toMatchObject({
      tipo: 'valoracion',
      autor: { id: userIdB, username: usernameB },
      serie: { slug: slugDe(1) },
      nota: 8
    })

    // Todos los items llevan el autor con username.
    for (const item of feed) {
      expect(item.autor.username).toBe(usernameB)
    }
  }, 30_000)

  it('listas privadas y series no aprobadas excluidas del feed', async () => {
    await resetFollows()
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)

    const feed = await listFeed(serviceRole, userIdA)
    expect(feed.some((i) => i.tipo === 'lista' && i.lista.nombre === 'Lista privada de B')).toBe(false)
    for (const item of feed) {
      if (item.tipo !== 'lista') {
        expect(item.serie.slug).not.toBe(slugDe(3))
      }
    }
  }, 30_000)
})

describe('seguirUsuario + notificación de nuevo seguidor (F023)', () => {
  beforeEach(() => {
    mockNotificarNuevoSeguidor.mockClear()
  })

  const inexistente = '00000000-0000-4000-8000-000000000000'

  async function contarNotifSeguidor(): Promise<number> {
    const filas = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('id')
        .eq('usuario_id', userIdB)
        .eq('tipo', 'nuevo_seguidor')
    )
    return filas.length
  }

  async function limpiarEstado(): Promise<void> {
    await unwrap(
      dbAdmin.from('usuario_usuario').delete().eq('seguidor_id', userIdA).eq('seguido_id', userIdB)
    )
    await unwrap(
      dbAdmin.from('notificacion').delete().eq('usuario_id', userIdB).eq('seguidor_id', userIdA)
    )
  }

  it('seguir genera notificación nuevo_seguidor para el seguido', async () => {
    await limpiarEstado()
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)

    const filas = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('usuario_id, seguidor_id, tipo, serie_id, episodio_id')
        .eq('usuario_id', userIdB)
        .eq('tipo', 'nuevo_seguidor')
        .eq('seguidor_id', userIdA)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      usuario_id: userIdB,
      seguidor_id: userIdA,
      tipo: 'nuevo_seguidor',
      serie_id: null,
      episodio_id: null
    })
  }, 30_000)

  it('dejar de seguir NO genera notificación', async () => {
    await limpiarEstado()
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)
    const antes = await contarNotifSeguidor()
    await dejarDeSeguirUsuario(clientA, userIdA, userIdB)
    expect(await contarNotifSeguidor()).toBe(antes)
  }, 30_000)

  it('seguir de nuevo genera OTRA notificación (no idempotente, NOT-11)', async () => {
    await limpiarEstado()
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)
    await dejarDeSeguirUsuario(clientA, userIdA, userIdB)
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)
    expect(await contarNotifSeguidor()).toBe(2)
  }, 30_000)

  it('autofollow y destino inexistente (23503) no generan notificación', async () => {
    await limpiarEstado()
    await expect(seguirUsuario(clientA, serviceRole, userIdA, userIdA)).rejects.toThrow(
      ERRORES_SIGUE.noPuedeSeguirse
    )
    await expect(seguirUsuario(clientA, serviceRole, userIdA, inexistente)).rejects.toThrow(
      ERRORES_SIGUE.destinoNoEncontrado
    )
    expect(await contarNotifSeguidor()).toBe(0)
    expect(mockNotificarNuevoSeguidor).not.toHaveBeenCalled()
  }, 30_000)

  it('23505 (follow ya existía) no genera notificación duplicada', async () => {
    await limpiarEstado()
    await seguirUsuario(clientA, serviceRole, userIdA, userIdB)
    expect(mockNotificarNuevoSeguidor).toHaveBeenCalledTimes(1)
    await expect(seguirUsuario(clientA, serviceRole, userIdA, userIdB)).resolves.toBeUndefined()
    expect(mockNotificarNuevoSeguidor).toHaveBeenCalledTimes(1)
    expect(await contarNotifSeguidor()).toBe(1)
  }, 30_000)

  it('fallo de notificación no rompe el follow (log-and-continue, D25)', async () => {
    await limpiarEstado()
    mockNotificarNuevoSeguidor.mockRejectedValueOnce(new Error('BD de notificaciones caída'))
    await expect(seguirUsuario(clientA, serviceRole, userIdA, userIdB)).resolves.toBeUndefined()
    expect(await estaSiguiendoUsuario(clientA, userIdA, userIdB)).toBe(true)
  }, 30_000)
})
