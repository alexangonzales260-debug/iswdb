import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// lib/notificaciones.ts importa lib/supabase.ts (createServiceRoleClient), que
// lanza si faltan env vars (fail fast); vi.hoisted se ejecuta antes de imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

import {
  contarNoLeidas,
  listMisNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  notificarNuevoEpisodio,
  notificarNuevoSeguidor
} from '@/lib/notificaciones'
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

let seguidorId: string
let seguidoId: string
let usernameA: string
let clientSeguido: SupabaseClient<Database>

let categoriaId: string
let serieId: string
let episodioId: string

function emailDe(nombre: string): string {
  return `notif-lib-${nombre}-${runId}@iswdb.local`
}

function slugDe(nombre: string): string {
  return `notif-lib-${nombre}-${runId}`
}

async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userId, username: usernameDesdeEmail(emailDe(nombre), userId) })
  )
  return userId
}

async function limpiarNotificaciones(): Promise<void> {
  await unwrap(dbAdmin.from('notificacion').delete().eq('usuario_id', seguidoId))
}

async function limpiarSuscripcionSerie(): Promise<void> {
  await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidoId).eq('serie_id', serieId))
}

beforeAll(async () => {
  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  seguidorId = await crearUsuario('seguidor')
  seguidoId = await crearUsuario('seguido')
  usernameA = usernameDesdeEmail(emailDe('seguidor'), seguidorId)
  clientSeguido = await signInTestUser(emailDe('seguido'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Notif Lib Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  categoriaId = categoria.id

  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie Notificaciones Lib',
        slug: slugDe('serie'),
        categoria_id: categoriaId,
        moderation_status: 'aprobada'
      })
      .select('id')
      .single()
  )
  serieId = serie.id

  const episodio = await unwrap(
    dbAdmin
      .from('episodio')
      .insert({
        serie_id: serieId,
        temporada: 3,
        numero: 4,
        titulo: 'Episodio Lib',
        video_id: `vid-lib-${runId}`
      })
      .select('id')
      .single()
  )
  episodioId = episodio.id
}, 60_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('notificacion').delete().eq('usuario_id', seguidoId))
  await unwrap(dbAdmin.from('usuario_serie').delete().eq('serie_id', serieId))
  await unwrap(dbAdmin.from('episodio').delete().eq('id', episodioId))
  await unwrap(dbAdmin.from('serie').delete().eq('id', serieId))
  await unwrap(dbAdmin.from('categoria').delete().eq('id', categoriaId))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('generación notificarNuevoSeguidor (NOT-09)', () => {
  it('A sigue a B → fila nuevo_seguidor para B con campos correctos', async () => {
    await notificarNuevoSeguidor(dbAdmin, seguidoId, seguidorId)

    const filas = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('usuario_id, seguidor_id, tipo, serie_id, episodio_id, leida')
        .eq('usuario_id', seguidoId)
        .eq('tipo', 'nuevo_seguidor')
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      usuario_id: seguidoId,
      seguidor_id: seguidorId,
      tipo: 'nuevo_seguidor',
      serie_id: null,
      episodio_id: null,
      leida: false
    })

    await limpiarNotificaciones()
  }, 30_000)

  it('no idempotente: dos llamadas → 2 filas (NOT-11)', async () => {
    await notificarNuevoSeguidor(dbAdmin, seguidoId, seguidorId)
    await notificarNuevoSeguidor(dbAdmin, seguidoId, seguidorId)

    const filas = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('id')
        .eq('usuario_id', seguidoId)
        .eq('tipo', 'nuevo_seguidor')
    )
    expect(filas).toHaveLength(2)

    await limpiarNotificaciones()
  }, 30_000)
})

describe('nuevo_episodio intacto (regresión F019)', () => {
  it('notificarNuevoEpisodio sigue generando con upsert onConflict (idempotente)', async () => {
    await unwrap(dbAdmin.from('usuario_serie').insert({ usuario_id: seguidoId, serie_id: serieId }))
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    const filas = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('tipo, serie_id, episodio_id')
        .eq('usuario_id', seguidoId)
        .eq('episodio_id', episodioId)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].tipo).toBe('nuevo_episodio')
    expect(filas[0].serie_id).toBe(serieId)
    expect(filas[0].episodio_id).toBe(episodioId)

    await limpiarNotificaciones()
    await limpiarSuscripcionSerie()
  }, 30_000)
})

describe('listMisNotificaciones (unión por tipo)', () => {
  it('ambos tipos: discrimina, resuelve username del seguidor y serie + episodio, orden desc', async () => {
    await unwrap(
      dbAdmin.from('notificacion').insert([
        {
          usuario_id: seguidoId,
          tipo: 'nuevo_episodio',
          serie_id: serieId,
          episodio_id: episodioId,
          created_at: '2026-02-01T10:00:00+00'
        },
        {
          usuario_id: seguidoId,
          tipo: 'nuevo_seguidor',
          seguidor_id: seguidorId,
          created_at: '2026-01-01T10:00:00+00'
        }
      ])
    )

    const lista = await listMisNotificaciones(clientSeguido, seguidoId)

    expect(lista).toHaveLength(2)
    expect(lista[0].tipo).toBe('nuevo_episodio')
    expect(lista[1].tipo).toBe('nuevo_seguidor')

    const episodio = lista[0]
    expect(episodio.tipo).toBe('nuevo_episodio')
    if (episodio.tipo === 'nuevo_episodio') {
      expect(episodio.serie).toEqual({ titulo: 'Serie Notificaciones Lib', slug: slugDe('serie') })
      expect(episodio.episodio).toEqual({ temporada: 3, numero: 4, titulo: 'Episodio Lib' })
      expect(episodio.leida).toBe(false)
      expect(new Date(episodio.created_at).getTime()).not.toBeNaN()
    }

    const seguidor = lista[1]
    expect(seguidor.tipo).toBe('nuevo_seguidor')
    if (seguidor.tipo === 'nuevo_seguidor') {
      expect(seguidor.seguidor).toEqual({ username: usernameA })
      expect(seguidor.leida).toBe(false)
      expect(new Date(seguidor.created_at).getTime()).not.toBeNaN()
    }

    await limpiarNotificaciones()
  }, 30_000)
})

describe('escritura (marcarLeida) con ambos tipos', () => {
  it('marcarLeida funciona sobre nuevo_episodio y nuevo_seguidor', async () => {
    await notificarNuevoSeguidor(dbAdmin, seguidoId, seguidorId)
    await unwrap(dbAdmin.from('usuario_serie').insert({ usuario_id: seguidoId, serie_id: serieId }))
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    const lista = await listMisNotificaciones(clientSeguido, seguidoId)
    expect(lista).toHaveLength(2)
    expect(lista.every((n) => n.tipo === 'nuevo_episodio' || n.tipo === 'nuevo_seguidor')).toBe(true)

    for (const n of lista) {
      await marcarLeida(clientSeguido, seguidoId, n.id)
    }

    const restantes = await unwrap(
      dbAdmin.from('notificacion').select('leida').eq('usuario_id', seguidoId)
    )
    expect(restantes).toHaveLength(2)
    expect(restantes.every((n) => n.leida === true)).toBe(true)

    await limpiarNotificaciones()
    await limpiarSuscripcionSerie()
  }, 30_000)
})

describe('contarNoLeidas (NOT-02)', () => {
  it('cuenta ambos tipos y llega a 0 tras marcarTodasLeidas', async () => {
    await notificarNuevoSeguidor(dbAdmin, seguidoId, seguidorId)
    await unwrap(dbAdmin.from('usuario_serie').insert({ usuario_id: seguidoId, serie_id: serieId }))
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    expect(await contarNoLeidas(clientSeguido, seguidoId)).toBe(2)

    await marcarTodasLeidas(clientSeguido, seguidoId)

    expect(await contarNoLeidas(clientSeguido, seguidoId)).toBe(0)

    await limpiarNotificaciones()
    await limpiarSuscripcionSerie()
  }, 30_000)
})