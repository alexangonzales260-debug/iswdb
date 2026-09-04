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
  unwrap
} from './env'

// F018 (FOL-01..08): tabla usuario_serie (M11) y su RLS en crudo.
// M11 define usuario_serie (usuario_id → usuario cascade, serie_id → serie
// cascade, created_at, UNIQUE(usuario_id, serie_id)); el RLS es propio
// (usuario_id = auth.uid()).
// Los servicios (lib/follows.ts) se cubren en T2; aquí se ejercitan las
// policies directamente con clientes anon / de sesión (signInTestUser).
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let ownerId: string
let clientOwner: SupabaseClient<Database>
let clientOtro: SupabaseClient<Database>

let categoriaId: string
let serieAId: string
let serieBId: string

function slugDe(nombre: string): string {
  return `fol-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `fol-test-${nombre}-${runId}@iswdb.local`
}

async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  // La fila public.usuario es necesaria por la FK usuario_id -> usuario(id).
  await unwrap(dbAdmin.from('usuario').insert({ id: userId }))
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  // GoTrue en frío (tras supabase start/reset): se templa con un usuario.
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  ownerId = await crearUsuario('owner')
  await crearUsuario('otro')
  clientOwner = await signInTestUser(emailDe('owner'), TEST_PASSWORD)
  clientOtro = await signInTestUser(emailDe('otro'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Fol Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  categoriaId = categoria.id

  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        { titulo: 'Serie Fol A', slug: slugDe('a'), categoria_id: categoria.id, moderation_status: 'aprobada' },
        { titulo: 'Serie Fol B', slug: slugDe('b'), categoria_id: categoria.id, moderation_status: 'aprobada' }
      ])
      .select('id, slug')
  )
  serieAId = series.find((s) => s.slug === slugDe('a'))!.id
  serieBId = series.find((s) => s.slug === slugDe('b'))!.id
}, 60_000)

afterAll(async () => {
  await unwrap(
    dbAdmin
      .from('usuario_serie')
      .delete()
      .in('serie_id', [serieAId, serieBId])
  )
  await unwrap(
    dbAdmin
      .from('serie')
      .delete()
      .in('slug', [slugDe('a'), slugDe('b')])
  )
  await unwrap(dbAdmin.from('categoria').delete().eq('id', categoriaId))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M11 invariantes — usuario_serie', () => {
  it('seguir crea fila con usuario_id, serie_id y created_at', async () => {
    await unwrap(
      dbAdmin.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serieAId })
    )
    const fila = await unwrap(
      dbAdmin
        .from('usuario_serie')
        .select('usuario_id, serie_id, created_at')
        .eq('usuario_id', ownerId)
        .eq('serie_id', serieAId)
        .single()
    )
    expect(fila.usuario_id).toBe(ownerId)
    expect(fila.serie_id).toBe(serieAId)
    expect(new Date(fila.created_at).getTime()).not.toBeNaN()
    // Limpiar para no interferir con otros tests.
    await unwrap(
      dbAdmin.from('usuario_serie').delete().eq('usuario_id', ownerId).eq('serie_id', serieAId)
    )
  }, 30_000)

  it('duplicado (usuario_id, serie_id) → 23505', async () => {
    await unwrap(
      dbAdmin.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serieAId })
    )
    await expect(
      unwrap(
        dbAdmin.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serieAId })
      )
    ).rejects.toThrow(/duplicate key value/i)
    // Limpiar.
    await unwrap(
      dbAdmin.from('usuario_serie').delete().eq('usuario_id', ownerId).eq('serie_id', serieAId)
    )
  }, 30_000)

  it('dejar de seguir borra la fila', async () => {
    await unwrap(
      dbAdmin.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serieAId })
    )
    await unwrap(
      dbAdmin.from('usuario_serie').delete().eq('usuario_id', ownerId).eq('serie_id', serieAId)
    )
    const restantes = await unwrap(
      dbAdmin
        .from('usuario_serie')
        .select('usuario_id')
        .eq('usuario_id', ownerId)
        .eq('serie_id', serieAId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)

  it('cascade: borrar serie → follow borrado', async () => {
    const serie = await unwrap(
      dbAdmin
        .from('serie')
        .insert({ titulo: 'Serie Fol Cascade', slug: slugDe('cascade'), categoria_id: categoriaId })
        .select('id')
        .single()
    )
    await unwrap(
      dbAdmin.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serie.id })
    )
    await unwrap(dbAdmin.from('serie').delete().eq('id', serie.id))
    const restantes = await unwrap(
      dbAdmin.from('usuario_serie').select('serie_id').eq('serie_id', serie.id)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)
})

describe('M11 RLS — usuario_serie (lectura own)', () => {
  it('owner: lee sus follows', async () => {
    await unwrap(
      dbAdmin.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serieAId })
    )
    const filas = await unwrap(
      clientOwner.from('usuario_serie').select('serie_id').eq('serie_id', serieAId)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].serie_id).toBe(serieAId)
  }, 30_000)

  it('ajeno: no ve follows del owner (0 filas)', async () => {
    const filas = await unwrap(
      clientOtro.from('usuario_serie').select('serie_id').eq('usuario_id', ownerId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)
})

describe('M11 RLS — usuario_serie (escritura own)', () => {
  it('anon: insert denegado', async () => {
    await expect(
      unwrap(db.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serieAId }))
    ).rejects.toThrow(/row-level security|permission denied/i)
  }, 30_000)

  it('owner: inserta su follow (serieB, distinta de la usada en la lectura)', async () => {
    await unwrap(
      clientOwner.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serieBId })
    )
    const filas = await unwrap(
      clientOwner.from('usuario_serie').select('serie_id').eq('serie_id', serieBId)
    )
    expect(filas).toHaveLength(1)
    // Limpiar para no interferir con tests posteriores.
    await unwrap(
      clientOwner.from('usuario_serie').delete().eq('usuario_id', ownerId).eq('serie_id', serieBId)
    )
  }, 30_000)

  it('ajeno: no inserta follow con usuario_id del owner (denegado)', async () => {
    await expect(
      unwrap(
        clientOtro.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serieBId })
      )
    ).rejects.toThrow(/row-level security/i)
  }, 30_000)

  it('owner: borra su follow', async () => {
    await unwrap(
      clientOwner.from('usuario_serie').delete().eq('usuario_id', ownerId).eq('serie_id', serieAId)
    )
    const filas = await unwrap(
      clientOwner.from('usuario_serie').select('serie_id').eq('serie_id', serieAId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('ajeno: no borra follow del owner (denegado)', async () => {
    // Crear un follow del owner para intentar borrarlo.
    await unwrap(
      dbAdmin.from('usuario_serie').insert({ usuario_id: ownerId, serie_id: serieBId })
    )
    const borradas = await unwrap(
      clientOtro
        .from('usuario_serie')
        .delete()
        .eq('usuario_id', ownerId)
        .eq('serie_id', serieBId)
        .select('usuario_id')
    )
    expect(borradas).toHaveLength(0)
    // El follow sigue existiendo.
    const restantes = await unwrap(
      dbAdmin.from('usuario_serie').select('usuario_id').eq('usuario_id', ownerId).eq('serie_id', serieBId)
    )
    expect(restantes).toHaveLength(1)
  }, 30_000)
})
