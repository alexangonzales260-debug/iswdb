import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createTestUser,
  db,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap
} from './env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
// Borrar cada auth user casca en cascada su fila de public.usuario y sus
// reseñas (FK on delete cascade); las series se borran por slug.
const createdAuthUserIds: string[] = []

let escritorId: string
let otroId: string
let modId: string
let adminId: string
let clientEscritor: SupabaseClient
let clientOtro: SupabaseClient
let clientMod: SupabaseClient
let clientAdmin: SupabaseClient
let serieAId: string
let serieBId: string
let reseñaEscritorId: string
let reseñaOtroId: string
let reseñaOtroSerieBId: string

function slugDe(nombre: string): string {
  return `res-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `res-test-${nombre}-${runId}@iswdb.local`
}

// Contenido de longitud exacta para los límites del CHECK (50-2000).
function contenido(n: number): string {
  return 'a'.repeat(n)
}

async function crearUsuario(nombre: string, rol: 'user' | 'mod' | 'admin'): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(dbAdmin.from('usuario').insert({ id: userId, rol }))
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  // GoTrue en frío (tras supabase start/reset) puede fallar en las primeras
  // llamadas: se templa creando y borrando un usuario vía admin API.
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  // Categoría + 2 series aprobadas: serieA (objetivo principal de RLS) y
  // serieB (inserts propios/ajenos sin chocar con el unique user+serie).
  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Res Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        { titulo: 'Serie Res A', slug: slugDe('a'), categoria_id: categoria.id },
        { titulo: 'Serie Res B', slug: slugDe('b'), categoria_id: categoria.id }
      ])
      .select('id, slug')
  )
  const porSlug = Object.fromEntries(series.map((s) => [s.slug, s]))
  serieAId = porSlug[slugDe('a')].id
  serieBId = porSlug[slugDe('b')].id

  escritorId = await crearUsuario('escritor', 'user')
  otroId = await crearUsuario('otro', 'user')
  modId = await crearUsuario('mod', 'mod')
  adminId = await crearUsuario('admin', 'admin')

  clientEscritor = await signInTestUser(emailDe('escritor'), TEST_PASSWORD)
  clientOtro = await signInTestUser(emailDe('otro'), TEST_PASSWORD)
  clientMod = await signInTestUser(emailDe('mod'), TEST_PASSWORD)
  clientAdmin = await signInTestUser(emailDe('admin'), TEST_PASSWORD)

  // Reseña seed del escritor en serieA: objetivo de update/delete propios y
  // de los intentos ajenos. updated_at explícito en el pasado para hacer
  // observable el trigger en el test correspondiente.
  const seed = await unwrap(
    dbAdmin
      .from('reseña')
      .insert({
        user_id: escritorId,
        serie_id: serieAId,
        contenido: contenido(80),
        updated_at: '2026-01-01T00:00:00+00'
      })
      .select('id')
      .single()
  )
  reseñaEscritorId = seed.id
}, 120_000)

afterAll(async () => {
  try {
    // Borrar las series casca en cascada sus reseñas.
    await unwrap(dbAdmin.from('serie').delete().in('slug', [slugDe('a'), slugDe('b')]))
    await unwrap(dbAdmin.from('categoria').delete().eq('slug', slugDe('cat')))
    await unwrap(dbAdmin.from('usuario').delete().in('id', createdAuthUserIds))
  } catch (error) {
    console.warn(`Cleanup de tests/db/reseñas.test.ts falló: ${(error as Error).message}`)
  }
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M5 invariantes — tabla reseña', () => {
  it('límites del CHECK: 50 y 2000 caracteres se aceptan', async () => {
    const deOtro = await unwrap(
      dbAdmin
        .from('reseña')
        .insert({
          user_id: otroId,
          serie_id: serieAId,
          contenido: contenido(50),
          updated_at: '2026-01-01T00:00:00+00'
        })
        .select('id')
        .single()
    )
    reseñaOtroId = deOtro.id

    const deMod = await unwrap(
      dbAdmin
        .from('reseña')
        .insert({ user_id: modId, serie_id: serieAId, contenido: contenido(2000) })
        .select('id')
        .single()
    )
    expect(deMod.id).toBeDefined()
  }, 30_000)

  it('contenido fuera de 50-2000 → violación de check', async () => {
    await expect(
      unwrap(
        dbAdmin
          .from('reseña')
          .insert({ user_id: adminId, serie_id: serieAId, contenido: contenido(49) })
      )
    ).rejects.toThrow(/violates check constraint/i)
    await expect(
      unwrap(
        dbAdmin
          .from('reseña')
          .insert({ user_id: adminId, serie_id: serieAId, contenido: contenido(2001) })
      )
    ).rejects.toThrow(/violates check constraint/i)
  }, 30_000)

  it('unique(user_id, serie_id): duplicado → 23505 (RES-07)', async () => {
    await expect(
      unwrap(
        dbAdmin
          .from('reseña')
          .insert({ user_id: escritorId, serie_id: serieAId, contenido: contenido(60) })
      )
    ).rejects.toThrow(/duplicate key value violates unique constraint/i)
  }, 30_000)

  it('trigger updated_at: update refresca la fecha', async () => {
    // La reseña de otro se insertó con updated_at en 2026-01-01.
    const actualizada = await unwrap(
      dbAdmin
        .from('reseña')
        .update({ contenido: contenido(60) })
        .eq('id', reseñaOtroId)
        .select('updated_at')
        .single()
    )
    expect(new Date(actualizada.updated_at).getTime()).toBeGreaterThan(
      new Date('2026-01-02T00:00:00Z').getTime()
    )
  }, 30_000)
})

describe('M5 RLS — anon', () => {
  it('SELECT público ok (reseña_select_public)', async () => {
    const filas = await unwrap(db.from('reseña').select('id').eq('serie_id', serieAId))
    // Seed del escritor + límites 50 (otro) y 2000 (mod).
    expect(filas).toHaveLength(3)
  })

  it('INSERT/UPDATE/DELETE denegados', async () => {
    const denial = /permission denied|row-level security/i
    await expect(
      unwrap(
        db
          .from('reseña')
          .insert({ user_id: escritorId, serie_id: serieBId, contenido: contenido(60) })
      )
    ).rejects.toThrow(denial)
    await expect(
      unwrap(db.from('reseña').update({ contenido: contenido(60) }).not('id', 'is', null))
    ).rejects.toThrow(denial)
    await expect(
      unwrap(db.from('reseña').delete().not('id', 'is', null))
    ).rejects.toThrow(denial)
  })
})

describe('M5 RLS — authenticated normal', () => {
  it('update propio ok (reseña_update_own)', async () => {
    const actualizada = await unwrap(
      clientEscritor
        .from('reseña')
        .update({ contenido: contenido(75) })
        .eq('id', reseñaEscritorId)
        .select('contenido')
        .single()
    )
    expect(actualizada.contenido).toBe(contenido(75))
  }, 30_000)

  it('update de reseña ajena → 0 filas, contenido intacto', async () => {
    const { data } = await clientEscritor
      .from('reseña')
      .update({ contenido: contenido(99) })
      .eq('id', reseñaOtroId)
      .select()
    expect(data).toHaveLength(0)

    const intacta = await unwrap(
      dbAdmin.from('reseña').select('contenido').eq('id', reseñaOtroId).single()
    )
    expect(intacta.contenido).toBe(contenido(60))
  }, 30_000)

  it('delete de reseña ajena (user sin rol) → 0 filas, fila intacta', async () => {
    const { data } = await clientOtro.from('reseña').delete().eq('id', reseñaEscritorId).select()
    expect(data).toHaveLength(0)

    const intacta = await unwrap(
      dbAdmin.from('reseña').select('id').eq('id', reseñaEscritorId).single()
    )
    expect(intacta.id).toBe(reseñaEscritorId)
  }, 30_000)

  it('insert con user_id ajeno → denegado (reseña_insert_own)', async () => {
    await expect(
      unwrap(
        clientOtro
          .from('reseña')
          .insert({ user_id: escritorId, serie_id: serieBId, contenido: contenido(60) })
      )
    ).rejects.toThrow(/row-level security/i)
  }, 30_000)

  it('insert propio ok', async () => {
    const fila = await unwrap(
      clientOtro
        .from('reseña')
        .insert({ user_id: otroId, serie_id: serieBId, contenido: contenido(65) })
        .select('id')
        .single()
    )
    reseñaOtroSerieBId = fila.id
  }, 30_000)
})

describe('M5 RLS — mod/admin (reseña_delete_own_or_mod, D10)', () => {
  it('mod NO puede editar reseña ajena (update_own es estricta)', async () => {
    const { data } = await clientMod
      .from('reseña')
      .update({ contenido: contenido(90) })
      .eq('id', reseñaEscritorId)
      .select()
    expect(data).toHaveLength(0)
  }, 30_000)

  it('mod borra reseña de otro usuario (RES-09)', async () => {
    const borradas = await unwrap(
      clientMod.from('reseña').delete().eq('id', reseñaOtroSerieBId).select('id')
    )
    expect(borradas).toHaveLength(1)

    const restantes = await unwrap(dbAdmin.from('reseña').select('id').eq('id', reseñaOtroSerieBId))
    expect(restantes).toHaveLength(0)
  }, 30_000)

  it('admin borra reseña de otro usuario', async () => {
    const borradas = await unwrap(
      clientAdmin.from('reseña').delete().eq('id', reseñaEscritorId).select('id')
    )
    expect(borradas).toHaveLength(1)

    const restantes = await unwrap(dbAdmin.from('reseña').select('id').eq('id', reseñaEscritorId))
    expect(restantes).toHaveLength(0)
  }, 30_000)
})
