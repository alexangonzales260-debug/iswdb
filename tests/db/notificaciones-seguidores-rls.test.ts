import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

import {
  createTestUser,
  db,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap,
  usernameDesdeEmail
} from './env'

// F023 (NOT-09..13): M16 extiende notificacion con tipo 'nuevo_seguidor',
// seguidor_id, y hace serie_id/episodio_id nullable. Se ejercitan en crudo las
// invariantes: CHECK del tipo, índice parcial de idempotencia SOLO para
// nuevo_episodio (NOT-07) y sin UNIQUE para nuevo_seguidor (NOT-11), cascade
// del seguidor, backfill/default y RLS (insert solo service_role).
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let seguidorId: string
let seguidoId: string
let clientSeguido: SupabaseClient<Database>

let categoriaId: string
let serieId: string
let episodioId: string

function slugDe(nombre: string): string {
  return `notseg-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `notseg-test-${nombre}-${runId}@iswdb.local`
}

async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin
      .from('usuario')
      .insert({ id: userId, username: usernameDesdeEmail(emailDe(nombre), userId) })
  )
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  seguidoId = await crearUsuario('seguido')
  seguidorId = await crearUsuario('seguidor')
  clientSeguido = await signInTestUser(emailDe('seguido'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Not Seg Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  categoriaId = categoria.id

  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie Not Seg',
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
        temporada: 1,
        numero: 1,
        titulo: 'Episodio Not Seg',
        video_id: `vid-notseg-${runId}`
      })
      .select('id')
      .single()
  )
  episodioId = episodio.id
}, 60_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('notificacion').delete().eq('serie_id', serieId))
  await unwrap(dbAdmin.from('episodio').delete().eq('serie_id', serieId))
  await unwrap(dbAdmin.from('serie').delete().eq('id', serieId))
  await unwrap(dbAdmin.from('categoria').delete().eq('id', categoriaId))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

async function limpiarNotificaciones(): Promise<void> {
  await unwrap(dbAdmin.from('notificacion').delete().eq('usuario_id', seguidoId))
  await unwrap(dbAdmin.from('notificacion').delete().eq('usuario_id', seguidorId))
}

describe('M16 invariantes — nuevo_seguidor', () => {
  it('insert nuevo_seguidor con seguidor_id válido y serie/episodio NULL → OK', async () => {
    const fila = await unwrap(
      dbAdmin
        .from('notificacion')
        .insert({
          usuario_id: seguidoId,
          seguidor_id: seguidorId,
          tipo: 'nuevo_seguidor',
          serie_id: null,
          episodio_id: null
        })
        .select('id, usuario_id, seguidor_id, tipo, serie_id, episodio_id, leida')
        .single()
    )
    expect(fila.usuario_id).toBe(seguidoId)
    expect(fila.seguidor_id).toBe(seguidorId)
    expect(fila.tipo).toBe('nuevo_seguidor')
    expect(fila.serie_id).toBeNull()
    expect(fila.episodio_id).toBeNull()
    expect(fila.leida).toBe(false)

    await limpiarNotificaciones()
  }, 30_000)

  it('insert nuevo_episodio con episodio_id NULL → CHECK falla (23514)', async () => {
    await expect(
      unwrap(
        dbAdmin.from('notificacion').insert({
          usuario_id: seguidoId,
          serie_id: serieId,
          episodio_id: null,
          tipo: 'nuevo_episodio'
        })
      )
    ).rejects.toThrow(/check constraint/i)

    await limpiarNotificaciones()
  }, 30_000)

  it('insert con tipo inválido → CHECK falla (23514)', async () => {
    await expect(
      unwrap(
        dbAdmin.from('notificacion').insert({
          usuario_id: seguidoId,
          seguidor_id: seguidorId,
          tipo: 'inventado'
        })
      )
    ).rejects.toThrow(/check constraint/i)

    await limpiarNotificaciones()
  }, 30_000)

  it('2 nuevo_seguidor mismo par (seguido, seguidor) → ambas persisten (NOT-11)', async () => {
    const insert = {
      usuario_id: seguidoId,
      seguidor_id: seguidorId,
      tipo: 'nuevo_seguidor' as const
    }
    await unwrap(dbAdmin.from('notificacion').insert(insert))
    await unwrap(dbAdmin.from('notificacion').insert(insert))

    const filas = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('id')
        .eq('usuario_id', seguidoId)
        .eq('seguidor_id', seguidorId)
        .eq('tipo', 'nuevo_seguidor')
    )
    expect(filas).toHaveLength(2)

    await limpiarNotificaciones()
  }, 30_000)
})

describe('M16 invariantes — nuevo_episodio', () => {
  it('2 nuevo_episodio mismo (usuario, episodio) → UNIQUE global rechaza (NOT-07)', async () => {
    const insert = {
      usuario_id: seguidoId,
      serie_id: serieId,
      episodio_id: episodioId,
      tipo: 'nuevo_episodio' as const
    }
    await unwrap(dbAdmin.from('notificacion').insert(insert))
    await expect(
      unwrap(dbAdmin.from('notificacion').insert(insert))
    ).rejects.toThrow(/duplicate key value/i)

    // El mismo par en tipo nuevo_seguidor NO debe chocar con el índice parcial.
    await unwrap(
      dbAdmin.from('notificacion').insert({
        usuario_id: seguidoId,
        seguidor_id: seguidorId,
        tipo: 'nuevo_seguidor',
        serie_id: null,
        episodio_id: null
      })
    )
    const filas = await unwrap(
      dbAdmin.from('notificacion').select('id').eq('usuario_id', seguidoId)
    )
    expect(filas).toHaveLength(2)

    await limpiarNotificaciones()
  }, 30_000)

  it('insert sin tipo ni seguidor_id (backfill old-style) → tipo=nuevo_episodio, seguidor_id=NULL', async () => {
    await unwrap(
      dbAdmin
        .from('notificacion')
        .insert({ usuario_id: seguidoId, serie_id: serieId, episodio_id: episodioId })
    )
    const fila = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('tipo, seguidor_id')
        .eq('usuario_id', seguidoId)
        .single()
    )
    expect(fila.tipo).toBe('nuevo_episodio')
    expect(fila.seguidor_id).toBeNull()

    await limpiarNotificaciones()
  }, 30_000)
})

describe('M16 invariantes — cascade y RLS', () => {
  it('cascade: borrar seguidor → notificaciones de seguidor borradas', async () => {
    await unwrap(
      dbAdmin.from('notificacion').insert({
        usuario_id: seguidoId,
        seguidor_id: seguidorId,
        tipo: 'nuevo_seguidor',
        serie_id: null,
        episodio_id: null
      })
    )
    await unwrap(dbAdmin.from('usuario').delete().eq('id', seguidorId))

    const restantes = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('id')
        .eq('usuario_id', seguidoId)
        .eq('seguidor_id', seguidorId)
    )
    expect(restantes).toHaveLength(0)

    await limpiarNotificaciones()
    // El usuario borrado se quita de la limpieza final para no reintentar.
    createdAuthUserIds.splice(createdAuthUserIds.indexOf(seguidorId), 1)
  }, 30_000)

  it('authenticated: insert directo a notificacion denegado (solo service_role)', async () => {
    await expect(
      unwrap(
        clientSeguido.from('notificacion').insert({
          usuario_id: seguidoId,
          seguidor_id: seguidorId,
          tipo: 'nuevo_seguidor',
          serie_id: null,
          episodio_id: null
        })
      )
    ).rejects.toThrow(/row-level security|permission denied/i)

    const filas = await unwrap(
      dbAdmin.from('notificacion').select('id').eq('usuario_id', seguidoId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('anon: lectura de notificaciones denegada (sin grant de SELECT)', async () => {
    await expect(
      unwrap(db.from('notificacion').select('id').eq('usuario_id', seguidoId))
    ).rejects.toThrow(/permission denied|not permitted/i)
  }, 30_000)
})