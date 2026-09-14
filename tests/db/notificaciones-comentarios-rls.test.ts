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

// F026 (NOTC-01..06): M20 extiende notificacion con tipo 'nuevo_comentario' y
// comentario_id (FK comentario cascade). Se ejercitan en crudo las
// invariantes: CHECK del tipo (3 valores), CHECK de consistencia por tipo
// (nuevo_comentario exige comentario_id y prohíbe serie/episodio/seguidor),
// sin UNIQUE adicional (cada comentario notifica, NOTC-04), cascade del
// comentario, backfill/default y RLS (insert solo service_role).
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let autorId: string
let comentaristaId: string
let clientAutor: SupabaseClient<Database>

let categoriaId: string
let serieId: string
let episodioId: string
let reseñaId: string

function slugDe(nombre: string): string {
  return `notcom-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `notcom-test-${nombre}-${runId}@iswdb.local`
}

function contenido(n: number): string {
  return 'a'.repeat(n)
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

async function insertarComentario(comentaristaIdUsado: string = comentaristaId): Promise<string> {
  const fila = await unwrap(
    dbAdmin
      .from('comentario')
      .insert({ reseña_id: reseñaId, user_id: comentaristaIdUsado, contenido: contenido(70) })
      .select('id')
      .single()
  )
  return fila.id
}

beforeAll(async () => {
  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  autorId = await crearUsuario('autor')
  comentaristaId = await crearUsuario('comentarista')
  clientAutor = await signInTestUser(emailDe('autor'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Not Com Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  categoriaId = categoria.id

  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie Not Com',
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
        titulo: 'Episodio Not Com',
        video_id: `vid-notcom-${runId}`
      })
      .select('id')
      .single()
  )
  episodioId = episodio.id

  const reseña = await unwrap(
    dbAdmin
      .from('reseña')
      .insert({ user_id: autorId, serie_id: serieId, contenido: contenido(70) })
      .select('id')
      .single()
  )
  reseñaId = reseña.id
}, 60_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('notificacion').delete().eq('usuario_id', autorId))
  await unwrap(dbAdmin.from('notificacion').delete().eq('usuario_id', comentaristaId))
  await unwrap(dbAdmin.from('comentario').delete().eq('reseña_id', reseñaId))
  await unwrap(dbAdmin.from('reseña').delete().eq('id', reseñaId))
  await unwrap(dbAdmin.from('episodio').delete().eq('serie_id', serieId))
  await unwrap(dbAdmin.from('serie').delete().eq('id', serieId))
  await unwrap(dbAdmin.from('categoria').delete().eq('id', categoriaId))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

async function limpiarNotificaciones(): Promise<void> {
  await unwrap(dbAdmin.from('notificacion').delete().eq('usuario_id', autorId))
}

describe('M20 invariantes — nuevo_comentario', () => {
  it('insert nuevo_comentario con comentario_id válido y serie/episodio/seguidor NULL → OK', async () => {
    const comentarioId = await insertarComentario()

    const fila = await unwrap(
      dbAdmin
        .from('notificacion')
        .insert({
          usuario_id: autorId,
          comentario_id: comentarioId,
          tipo: 'nuevo_comentario',
          serie_id: null,
          episodio_id: null,
          seguidor_id: null
        })
        .select('id, usuario_id, comentario_id, tipo, serie_id, episodio_id, seguidor_id, leida')
        .single()
    )
    expect(fila.usuario_id).toBe(autorId)
    expect(fila.comentario_id).toBe(comentarioId)
    expect(fila.tipo).toBe('nuevo_comentario')
    expect(fila.serie_id).toBeNull()
    expect(fila.episodio_id).toBeNull()
    expect(fila.seguidor_id).toBeNull()
    expect(fila.leida).toBe(false)

    await limpiarNotificaciones()
  }, 30_000)

  it('insert con tipo inválido → CHECK falla (23514)', async () => {
    const comentarioId = await insertarComentario()

    await expect(
      unwrap(
        dbAdmin.from('notificacion').insert({
          usuario_id: autorId,
          comentario_id: comentarioId,
          tipo: 'inventado'
        })
      )
    ).rejects.toThrow(/check constraint/i)

    await limpiarNotificaciones()
  }, 30_000)

  it('insert nuevo_comentario sin comentario_id → CHECK de consistencia falla (23514)', async () => {
    await expect(
      unwrap(
        dbAdmin.from('notificacion').insert({
          usuario_id: autorId,
          tipo: 'nuevo_comentario',
          serie_id: null,
          episodio_id: null,
          seguidor_id: null
        })
      )
    ).rejects.toThrow(/check constraint/i)

    await limpiarNotificaciones()
  }, 30_000)

  it('nuevo_comentario con serie_id no nulo → CHECK de consistencia falla (23514)', async () => {
    const comentarioId = await insertarComentario()

    await expect(
      unwrap(
        dbAdmin.from('notificacion').insert({
          usuario_id: autorId,
          comentario_id: comentarioId,
          tipo: 'nuevo_comentario',
          serie_id: serieId,
          episodio_id: null,
          seguidor_id: null
        })
      )
    ).rejects.toThrow(/check constraint/i)

    await limpiarNotificaciones()
  }, 30_000)
})

describe('M20 invariantes — sin UNIQUE (NOTC-04)', () => {
  it('2 comentarios de B sobre la reseña de A → 2 notificaciones', async () => {
    const comentario1 = await insertarComentario()
    const comentario2 = await insertarComentario()

    await unwrap(
      dbAdmin.from('notificacion').insert({
        usuario_id: autorId,
        comentario_id: comentario1,
        tipo: 'nuevo_comentario'
      })
    )
    await unwrap(
      dbAdmin.from('notificacion').insert({
        usuario_id: autorId,
        comentario_id: comentario2,
        tipo: 'nuevo_comentario'
      })
    )

    const filas = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('id, comentario_id')
        .eq('usuario_id', autorId)
        .eq('tipo', 'nuevo_comentario')
    )
    expect(filas).toHaveLength(2)

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('comentario').delete().eq('id', comentario1))
    await unwrap(dbAdmin.from('comentario').delete().eq('id', comentario2))
  }, 30_000)
})

describe('M20 invariantes — cascade y RLS', () => {
  it('cascade: borrar comentario → notificación borrada', async () => {
    const comentarioId = await insertarComentario()
    await unwrap(
      dbAdmin.from('notificacion').insert({
        usuario_id: autorId,
        comentario_id: comentarioId,
        tipo: 'nuevo_comentario'
      })
    )

    await unwrap(dbAdmin.from('comentario').delete().eq('id', comentarioId))

    const restantes = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('id')
        .eq('usuario_id', autorId)
        .eq('comentario_id', comentarioId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)

  it('authenticated: insert directo a notificacion denegado (solo service_role)', async () => {
    const comentarioId = await insertarComentario()

    await expect(
      unwrap(
        clientAutor.from('notificacion').insert({
          usuario_id: autorId,
          comentario_id: comentarioId,
          tipo: 'nuevo_comentario'
        })
      )
    ).rejects.toThrow(/row-level security|permission denied/i)

    const filas = await unwrap(
      dbAdmin.from('notificacion').select('id').eq('usuario_id', autorId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)
})

describe('M20 regresión — F019 y F023 intactos', () => {
  it('nuevo_episodio (serie/episodio NOT NULL, comentario NULL) sigue pasando el CHECK', async () => {
    await unwrap(
      dbAdmin.from('notificacion').insert({
        usuario_id: autorId,
        serie_id: serieId,
        episodio_id: episodioId,
        tipo: 'nuevo_episodio'
      })
    )
    const fila = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('tipo, serie_id, episodio_id, comentario_id, seguidor_id')
        .eq('usuario_id', autorId)
        .single()
    )
    expect(fila.tipo).toBe('nuevo_episodio')
    expect(fila.serie_id).toBe(serieId)
    expect(fila.episodio_id).toBe(episodioId)
    expect(fila.comentario_id).toBeNull()
    expect(fila.seguidor_id).toBeNull()

    await limpiarNotificaciones()
  }, 30_000)

  it('nuevo_seguidor (seguidor NOT NULL, comentario NULL) sigue pasando el CHECK', async () => {
    await unwrap(
      dbAdmin.from('notificacion').insert({
        usuario_id: autorId,
        seguidor_id: comentaristaId,
        tipo: 'nuevo_seguidor',
        serie_id: null,
        episodio_id: null
      })
    )
    const fila = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('tipo, serie_id, episodio_id, comentario_id, seguidor_id')
        .eq('usuario_id', autorId)
        .single()
    )
    expect(fila.tipo).toBe('nuevo_seguidor')
    expect(fila.seguidor_id).toBe(comentaristaId)
    expect(fila.serie_id).toBeNull()
    expect(fila.episodio_id).toBeNull()
    expect(fila.comentario_id).toBeNull()

    await limpiarNotificaciones()
  }, 30_000)

  it('backfill: filas pre-M20 (sin comentario_id) quedan con comentario_id NULL', async () => {
    // El insert de M12/M16 sin comentario_id (nuevo_episodio) crea la fila con el
    // default NULL del backfill: la columna es nullable y no exige valor.
    await unwrap(
      dbAdmin.from('notificacion').insert({
        usuario_id: autorId,
        serie_id: serieId,
        episodio_id: episodioId,
        tipo: 'nuevo_episodio'
      })
    )
    const fila = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('tipo, comentario_id')
        .eq('usuario_id', autorId)
        .single()
    )
    expect(fila.tipo).toBe('nuevo_episodio')
    expect(fila.comentario_id).toBeNull()

    await limpiarNotificaciones()
  }, 30_000)

  it('anon: lectura de notificaciones denegada (sin grant de SELECT)', async () => {
    await expect(
      unwrap(db.from('notificacion').select('id').eq('usuario_id', autorId))
    ).rejects.toThrow(/permission denied|not permitted/i)
  }, 30_000)
})