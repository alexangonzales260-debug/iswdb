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

// F022 (SEG-08..10): tabla usuario_usuario (M15) y su RLS en crudo.
// M15 define usuario_usuario (seguidor_id/seguido_id → usuario cascade,
// created_at, UNIQUE(seguidor_id, seguido_id), CHECK seguidor <> seguido); el
// RLS es propio (seguidor_id = auth.uid()).
// Los servicios (lib/sigue-usuarios.ts) se cubren en T2; aquí se ejercitan las
// policies directamente con clientes anon / de sesión (signInTestUser).
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let ownerId: string
let seguidoId: string
let clientOwner: SupabaseClient<Database>
let clientOtro: SupabaseClient<Database>

function emailDe(nombre: string): string {
  return `sgu-test-${nombre}-${runId}@iswdb.local`
}

async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  // La fila public.usuario es necesaria por la FK usuario_usuario.*_id → usuario(id).
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userId, username: usernameDesdeEmail(emailDe(nombre), userId) })
  )
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  // GoTrue en frío (tras supabase start/reset): se templa con un usuario.
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  ownerId = await crearUsuario('owner')
  seguidoId = await crearUsuario('seguido')
  await crearUsuario('otro')
  clientOwner = await signInTestUser(emailDe('owner'), TEST_PASSWORD)
  clientOtro = await signInTestUser(emailDe('otro'), TEST_PASSWORD)
}, 60_000)

afterAll(async () => {
  await unwrap(
    dbAdmin
      .from('usuario_usuario')
      .delete()
      .in('seguidor_id', createdAuthUserIds)
  )
  await unwrap(
    dbAdmin
      .from('usuario_usuario')
      .delete()
      .in('seguido_id', createdAuthUserIds)
  )
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M15 invariantes — usuario_usuario', () => {
  it('seguir crea fila con seguidor_id, seguido_id y created_at', async () => {
    await unwrap(
      dbAdmin.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId })
    )
    const fila = await unwrap(
      dbAdmin
        .from('usuario_usuario')
        .select('seguidor_id, seguido_id, created_at')
        .eq('seguidor_id', ownerId)
        .eq('seguido_id', seguidoId)
        .single()
    )
    expect(fila.seguidor_id).toBe(ownerId)
    expect(fila.seguido_id).toBe(seguidoId)
    expect(new Date(fila.created_at).getTime()).not.toBeNaN()
    // Limpiar para no interferir con otros tests.
    await unwrap(
      dbAdmin.from('usuario_usuario').delete().eq('seguidor_id', ownerId).eq('seguido_id', seguidoId)
    )
  }, 30_000)

  it('duplicado (seguidor_id, seguido_id) → 23505', async () => {
    await unwrap(
      dbAdmin.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId })
    )
    await expect(
      unwrap(
        dbAdmin.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId })
      )
    ).rejects.toThrow(/duplicate key value/i)
    // Limpiar.
    await unwrap(
      dbAdmin.from('usuario_usuario').delete().eq('seguidor_id', ownerId).eq('seguido_id', seguidoId)
    )
  }, 30_000)

  it('autofollow (seguidor_id = seguido_id) → 23514 (CHECK)', async () => {
    await expect(
      unwrap(
        dbAdmin.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: ownerId })
      )
    ).rejects.toThrow(/violates check constraint/i)
  }, 30_000)

  it('cascade: borrar usuario → follows borrados', async () => {
    const temporalId = await crearUsuario('temporal')
    await unwrap(
      dbAdmin.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: temporalId })
    )
    // El borrado de la fila public.usuario (FK usuario) cascada usuario_usuario.
    await unwrap(dbAdmin.from('usuario').delete().eq('id', temporalId))
    const restantes = await unwrap(
      dbAdmin.from('usuario_usuario').select('seguido_id').eq('seguido_id', temporalId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)
})

describe('M15 RLS — usuario_usuario (lectura own)', () => {
  it('owner: lee sus follows', async () => {
    await unwrap(
      dbAdmin.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId })
    )
    const filas = await unwrap(
      clientOwner.from('usuario_usuario').select('seguido_id').eq('seguido_id', seguidoId)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].seguido_id).toBe(seguidoId)
    // Limpiar.
    await unwrap(
      dbAdmin.from('usuario_usuario').delete().eq('seguidor_id', ownerId).eq('seguido_id', seguidoId)
    )
  }, 30_000)

  it('ajeno: no ve follows del owner (0 filas)', async () => {
    await unwrap(
      dbAdmin.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId })
    )
    const filas = await unwrap(
      clientOtro.from('usuario_usuario').select('seguido_id').eq('seguidor_id', ownerId)
    )
    expect(filas).toHaveLength(0)
    // Limpiar.
    await unwrap(
      dbAdmin.from('usuario_usuario').delete().eq('seguidor_id', ownerId).eq('seguido_id', seguidoId)
    )
  }, 30_000)
})

describe('M15 RLS — usuario_usuario (escritura own)', () => {
  it('anon: insert denegado', async () => {
    await expect(
      unwrap(db.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId }))
    ).rejects.toThrow(/row-level security|permission denied/i)
  }, 30_000)

  it('owner: inserta su follow', async () => {
    await unwrap(
      clientOwner.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId })
    )
    const filas = await unwrap(
      clientOwner.from('usuario_usuario').select('seguido_id').eq('seguido_id', seguidoId)
    )
    expect(filas).toHaveLength(1)
    // Limpiar para no interferir con tests posteriores.
    await unwrap(
      dbAdmin.from('usuario_usuario').delete().eq('seguidor_id', ownerId).eq('seguido_id', seguidoId)
    )
  }, 30_000)

  it('ajeno: no inserta follow con seguidor_id del owner (denegado)', async () => {
    await expect(
      unwrap(
        clientOtro.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId })
      )
    ).rejects.toThrow(/row-level security/i)
  }, 30_000)

  it('owner: borra su follow', async () => {
    await unwrap(
      dbAdmin.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId })
    )
    await unwrap(
      clientOwner
        .from('usuario_usuario')
        .delete()
        .eq('seguidor_id', ownerId)
        .eq('seguido_id', seguidoId)
    )
    const restantes = await unwrap(
      dbAdmin.from('usuario_usuario').select('seguido_id').eq('seguidor_id', ownerId).eq('seguido_id', seguidoId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)

  it('ajeno: no borra follow del owner (0 filas, el follow persiste)', async () => {
    // Crear un follow del owner para intentar borrarlo.
    await unwrap(
      dbAdmin.from('usuario_usuario').insert({ seguidor_id: ownerId, seguido_id: seguidoId })
    )
    const borradas = await unwrap(
      clientOtro
        .from('usuario_usuario')
        .delete()
        .eq('seguidor_id', ownerId)
        .eq('seguido_id', seguidoId)
        .select('seguidor_id')
    )
    expect(borradas).toHaveLength(0)
    // El follow sigue existiendo.
    const restantes = await unwrap(
      dbAdmin.from('usuario_usuario').select('seguidor_id').eq('seguidor_id', ownerId).eq('seguido_id', seguidoId)
    )
    expect(restantes).toHaveLength(1)
    // Limpiar.
    await unwrap(
      dbAdmin.from('usuario_usuario').delete().eq('seguidor_id', ownerId).eq('seguido_id', seguidoId)
    )
  }, 30_000)
})