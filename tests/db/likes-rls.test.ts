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

// F027 (LIKE-01..07): tabla reseña_like (M21) + RLS en crudo.
// M21 define reseña_like ("reseña_id" → reseña on delete cascade,
// user_id → usuario on delete cascade, created_at timestamptz default
// now(), UNIQUE("reseña_id", user_id)). SIN id uuid PK, SIN updated_at,
// SIN trigger. RLS: reseña_like_select_public (using true, anon +
// authenticated) e insert/delete own (user_id = auth.uid()). Sin update.
// Auto-like permitido (el autor puede dar like a su propia reseña).
// Los servicios (lib/likes.ts) se cubren en T2; aquí se ejercitan las
// policies directamente con clientes anon / de sesión.
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
// Borrar cada auth user casca en cascada su fila de public.usuario y sus
// likes (FK on delete cascade); las reseñas y series se borran por id/slug.
const createdAuthUserIds: string[] = []

let escritorId: string
let otroId: string
let clientEscritor: SupabaseClient<Database>
let clientOtro: SupabaseClient<Database>
let serieAId: string
let serieBId: string
let reseñaAId: string
let reseñaBId: string

function slugDe(nombre: string): string {
  return `like-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `like-test-${nombre}-${runId}@iswdb.local`
}

// Contenido de longitud exacta para el CHECK de reseña (50-2000).
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

// Reseña pública (contenido ≥50, serie aprobada) vía service-role.
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

  // GoTrue en frío (tras supabase start/reset): se templa con un usuario.
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  escritorId = await crearUsuario('escritor')
  otroId = await crearUsuario('otro')
  clientEscritor = await signInTestUser(emailDe('escritor'), TEST_PASSWORD)
  clientOtro = await signInTestUser(emailDe('otro'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Like Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        {
          titulo: 'Serie Like A',
          slug: slugDe('a'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        },
        {
          titulo: 'Serie Like B',
          slug: slugDe('b'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        }
      ])
      .select('id, slug')
  )
  serieAId = series.find((s) => s.slug === slugDe('a'))!.id
  serieBId = series.find((s) => s.slug === slugDe('b'))!.id

  reseñaAId = await crearReseña(escritorId, serieAId)
  reseñaBId = await crearReseña(otroId, serieBId)
}, 120_000)

afterAll(async () => {
  try {
    // Borrar las series casca en cascada sus reseñas y likes.
    await unwrap(dbAdmin.from('serie').delete().in('slug', [slugDe('a'), slugDe('b')]))
    await unwrap(dbAdmin.from('categoria').delete().eq('slug', slugDe('cat')))
    await unwrap(dbAdmin.from('usuario').delete().in('id', createdAuthUserIds))
  } catch (error) {
    console.warn(`Cleanup de tests/db/likes-rls.test.ts falló: ${(error as Error).message}`)
  }
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M21 invariantes — tabla reseña_like', () => {
  it('insert ok con "reseña_id", user_id y created_at default presente', async () => {
    const fila = await unwrap(
      dbAdmin
        .from('reseña_like')
        .insert({ reseña_id: reseñaAId, user_id: otroId })
        .select('*')
        .single()
    )
    expect(fila.reseña_id).toBe(reseñaAId)
    expect(fila.user_id).toBe(otroId)
    expect(new Date(fila.created_at).getTime()).not.toBeNaN()
  }, 30_000)

  it('duplicado ("reseña_id", user_id) → 23505 (LIKE-05)', async () => {
    await expect(
      unwrap(
        dbAdmin.from('reseña_like').insert({ reseña_id: reseñaAId, user_id: otroId })
      )
    ).rejects.toThrow(/duplicate key value violates unique constraint/i)
  }, 30_000)

  it('delete own borra la fila', async () => {
    await unwrap(
      dbAdmin.from('reseña_like').delete().eq('reseña_id', reseñaAId).eq('user_id', otroId)
    )
    const restantes = await unwrap(
      dbAdmin
        .from('reseña_like')
        .select('user_id')
        .eq('reseña_id', reseñaAId)
        .eq('user_id', otroId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)
})

describe('M21 RLS — anon', () => {
  it('SELECT público ok (reseña_like_select_public, LIKE-04)', async () => {
    // Insertar un like vía service-role para tener algo que leer.
    await unwrap(
      dbAdmin.from('reseña_like').insert({ reseña_id: reseñaAId, user_id: escritorId })
    )
    const filas = await unwrap(
      db.from('reseña_like').select('reseña_id, user_id').eq('reseña_id', reseñaAId)
    )
    expect(filas.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('INSERT/DELETE denegados', async () => {
    const denial = /permission denied|row-level security/i

    await expect(
      unwrap(
        db.from('reseña_like').insert({ reseña_id: reseñaAId, user_id: escritorId })
      )
    ).rejects.toThrow(denial)

    // DELETE de anon sin política aplicable: RLS filtra y no toca filas
    // (PostgREST responde sin error con data null/[]).
    const { data: del } = await db
      .from('reseña_like')
      .delete()
      .eq('reseña_id', reseñaAId)
      .eq('user_id', escritorId)
    expect(del ?? []).toHaveLength(0)

    // La fila sigue existiendo.
    const restantes = await unwrap(
      dbAdmin
        .from('reseña_like')
        .select('user_id')
        .eq('reseña_id', reseñaAId)
        .eq('user_id', escritorId)
    )
    expect(restantes).toHaveLength(1)
  }, 30_000)
})

describe('M21 RLS — authenticated normal', () => {
  it('insert propio ok (reseña_like_insert_own, LIKE-01)', async () => {
    await unwrap(
      clientEscritor
        .from('reseña_like')
        .insert({ reseña_id: reseñaBId, user_id: escritorId })
    )
    const filas = await unwrap(
      clientEscritor
        .from('reseña_like')
        .select('reseña_id')
        .eq('reseña_id', reseñaBId)
        .eq('user_id', escritorId)
    )
    expect(filas).toHaveLength(1)
  }, 30_000)

  it('insert con user_id ajeno → denegado (reseña_like_insert_own)', async () => {
    await expect(
      unwrap(
        clientOtro
          .from('reseña_like')
          .insert({ reseña_id: reseñaAId, user_id: escritorId })
      )
    ).rejects.toThrow(/row-level security/i)
  }, 30_000)

  it('delete de like ajeno → 0 filas, like intacto (LIKE-05)', async () => {
    // clientOtro intenta borrar el like del escritor (ajeno): el RLS
    // delete_own exige user_id = auth.uid().
    const { data } = await clientOtro
      .from('reseña_like')
      .delete()
      .eq('reseña_id', reseñaAId)
      .eq('user_id', escritorId)
      .select()
    expect(data).toHaveLength(0)

    // El like del escritor en reseñaA sigue existiendo.
    const intacto = await unwrap(
      dbAdmin
        .from('reseña_like')
        .select('user_id')
        .eq('reseña_id', reseñaAId)
        .eq('user_id', escritorId)
    )
    expect(intacto).toHaveLength(1)
  }, 30_000)

  it('delete propio ok (reseña_like_delete_own, LIKE-02)', async () => {
    await unwrap(
      clientOtro
        .from('reseña_like')
        .delete()
        .eq('reseña_id', reseñaAId)
        .eq('user_id', otroId)
    )
    const restantes = await unwrap(
      dbAdmin
        .from('reseña_like')
        .select('user_id')
        .eq('reseña_id', reseñaAId)
        .eq('user_id', otroId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)

  it('auto-like: autor da like a su propia reseña (LIKE-07)', async () => {
    // escritorId es el autor de reseñaAId. Se retira su like previo (puesto
    // vía service-role en el test de SELECT público) para volver a darlo por
    // el camino de un cliente autenticado: el RLS insert_own no distingue
    // reseñas propias de ajenas, solo verifica user_id = auth.uid().
    await unwrap(
      dbAdmin
        .from('reseña_like')
        .delete()
        .eq('reseña_id', reseñaAId)
        .eq('user_id', escritorId)
    )
    await unwrap(
      clientEscritor
        .from('reseña_like')
        .insert({ reseña_id: reseñaAId, user_id: escritorId })
    )
    const filas = await unwrap(
      dbAdmin
        .from('reseña_like')
        .select('user_id')
        .eq('reseña_id', reseñaAId)
        .eq('user_id', escritorId)
    )
    expect(filas).toHaveLength(1)
  }, 30_000)
})

describe('M21 cascade — FK on delete', () => {
  it('borrar reseña → sus likes borrados', async () => {
    // escritorId no tiene reseña en serieB (la tiene otroId), así que puede
    // crear una nueva sin violar el UNIQUE(user_id, serie_id); el like lo
    // pone otroId (ajeno al autor de la reseña temporal).
    const reseñaTmp = await crearReseña(escritorId, serieBId)
    await unwrap(
      dbAdmin.from('reseña_like').insert({ reseña_id: reseñaTmp, user_id: otroId })
    )
    const antes = await unwrap(
      dbAdmin.from('reseña_like').select('user_id').eq('reseña_id', reseñaTmp)
    )
    expect(antes).toHaveLength(1)

    await unwrap(dbAdmin.from('reseña').delete().eq('id', reseñaTmp))

    const restantes = await unwrap(
      dbAdmin.from('reseña_like').select('user_id').eq('reseña_id', reseñaTmp)
    )
    expect(restantes).toHaveLength(0)

    // La otra reseña (A) conserva sus likes.
    const deA = await unwrap(
      dbAdmin.from('reseña_like').select('user_id').eq('reseña_id', reseñaAId)
    )
    expect(deA.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('borrar usuario → sus likes borrados', async () => {
    const cscdId = await crearUsuario('cscd')
    await unwrap(
      dbAdmin.from('reseña_like').insert({ reseña_id: reseñaAId, user_id: cscdId })
    )
    const antes = await unwrap(
      dbAdmin
        .from('reseña_like')
        .select('user_id')
        .eq('reseña_id', reseñaAId)
        .eq('user_id', cscdId)
    )
    expect(antes).toHaveLength(1)

    await deleteTestUser(cscdId)

    const restantes = await unwrap(
      dbAdmin
        .from('reseña_like')
        .select('user_id')
        .eq('reseña_id', reseñaAId)
        .eq('user_id', cscdId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)
})
