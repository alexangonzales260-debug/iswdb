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

// F025 (COM-01..06): tabla comentario (M19) + RLS en crudo.
// M19 define comentario (id uuid PK gen_random_uuid(), "reseña_id" → reseña
// on delete cascade, user_id → usuario on delete cascade, contenido CHECK
// char_length 1-1000, created_at timestamptz default now(); SIN updated_at,
// SIN trigger, SIN UNIQUE). RLS: comentario_select_public (using true, anon +
// authenticated) e insert/update/delete own (user_id = auth.uid()). Sin
// permisos especiales para el autor de la reseña (decisión 5).
// Los servicios (lib/comentarios.ts) se cubren en T2; aquí se ejercitan las
// policies directamente con clientes anon / de sesión.
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
// Borrar cada auth user casca en cascada su fila de public.usuario y sus
// comentarios (FK on delete cascade); las reseñas y series se borran por id/slug.
const createdAuthUserIds: string[] = []

let escritorId: string
let otroId: string
let clientEscritor: SupabaseClient<Database>
let clientOtro: SupabaseClient<Database>
let serieAId: string
let serieBId: string
let reseñaAId: string
let comentarioEscritorId: string
let comentarioOtroId: string

function slugDe(nombre: string): string {
  return `com-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `com-test-${nombre}-${runId}@iswdb.local`
}

// Contenido de longitud exacta para los límites del CHECK (1-1000).
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

// Reseña pública (contenido ≥50, serie aprobada) vía service-role: el RLS de
// reseña no exige valoración previa (esa regla es app-side, F012).
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
      .insert({ nombre: `Com Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        {
          titulo: 'Serie Com A',
          slug: slugDe('a'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        },
        {
          titulo: 'Serie Com B',
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
}, 120_000)

afterAll(async () => {
  try {
    // Borrar las series casca en cascada sus reseñas y comentarios.
    await unwrap(dbAdmin.from('serie').delete().in('slug', [slugDe('a'), slugDe('b')]))
    await unwrap(dbAdmin.from('categoria').delete().eq('slug', slugDe('cat')))
    await unwrap(dbAdmin.from('usuario').delete().in('id', createdAuthUserIds))
  } catch (error) {
    console.warn(`Cleanup de tests/db/comentarios-rls.test.ts falló: ${(error as Error).message}`)
  }
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M19 invariantes — tabla comentario', () => {
  it('insert ok con "reseña_id", user_id y contenido; created_at default presente', async () => {
    // select('*') devuelve el tipo Row completo: el parser de supabase-js no
    // soporta la columna con ñ ("reseña_id") dentro del string de select().
    const fila = await unwrap(
      dbAdmin
        .from('comentario')
        .insert({ reseña_id: reseñaAId, user_id: otroId, contenido: contenido(10) })
        .select('*')
        .single()
    )
    expect(fila.contenido).toBe(contenido(10))
    expect(fila.reseña_id).toBe(reseñaAId)
    expect(fila.user_id).toBe(otroId)
    expect(new Date(fila.created_at).getTime()).not.toBeNaN()
  }, 30_000)

  it('CHECK: 1 y 1000 caracteres se aceptan; 0 y 1001 → violación de check', async () => {
    await unwrap(
      dbAdmin.from('comentario').insert({ reseña_id: reseñaAId, user_id: escritorId, contenido: contenido(1) })
    )
    await unwrap(
      dbAdmin.from('comentario').insert({ reseña_id: reseñaAId, user_id: escritorId, contenido: contenido(1000) })
    )

    await expect(
      unwrap(
        dbAdmin.from('comentario').insert({ reseña_id: reseñaAId, user_id: escritorId, contenido: contenido(0) })
      )
    ).rejects.toThrow(/violates check constraint/i)
    await expect(
      unwrap(
        dbAdmin.from('comentario').insert({ reseña_id: reseñaAId, user_id: escritorId, contenido: contenido(1001) })
      )
    ).rejects.toThrow(/violates check constraint/i)
  }, 30_000)
})

describe('M19 RLS — anon', () => {
  it('SELECT público ok (comentario_select_public, COM-04)', async () => {
    const filas = await unwrap(
      db
        .from('comentario')
        .select('id, contenido')
        .eq('reseña_id', reseñaAId)
    )
    // Invariantes (repetir como otro, 1 y 1000 como escritor) sobre la reseñaA.
    expect(filas.length).toBeGreaterThanOrEqual(3)
  })

  it('INSERT/UPDATE/DELETE denegados', async () => {
    const denial = /permission denied|row-level security/i
    const antes = await unwrap(dbAdmin.from('comentario').select('id').eq('reseña_id', reseñaAId))

    await expect(
      unwrap(
        db
          .from('comentario')
          .insert({ reseña_id: reseñaAId, user_id: escritorId, contenido: contenido(5) })
      )
    ).rejects.toThrow(denial)

    // UPDATE/DELETE de anon sin política aplicable: RLS filtra y no toca filas
    // (PostgREST responde sin error con data null/[]). La denegación real de
    // escritura es el INSERT (y el insert con user_id ajeno, probado arriba);
    // aquí se verifica que nada se modifica ni se borra.
    const { data: upd } = await db
      .from('comentario')
      .update({ contenido: contenido(5) })
      .eq('id', comentarioEscritorId)
    const { data: del } = await db
      .from('comentario')
      .delete()
      .eq('id', comentarioEscritorId)
    expect(upd ?? []).toHaveLength(0)
    expect(del ?? []).toHaveLength(0)

    const despues = await unwrap(dbAdmin.from('comentario').select('id').eq('reseña_id', reseñaAId))
    expect(despues).toHaveLength(antes.length)
  })
})

describe('M19 RLS — authenticated normal', () => {
  it('insert propio ok (comentario_insert_own, COM-01)', async () => {
    const fila = await unwrap(
      clientEscritor
        .from('comentario')
        .insert({ reseña_id: reseñaAId, user_id: escritorId, contenido: contenido(20) })
        .select('id, contenido')
        .single()
    )
    expect(fila.contenido).toBe(contenido(20))
    comentarioEscritorId = fila.id

    const deOtro = await unwrap(
      clientOtro
        .from('comentario')
        .insert({ reseña_id: reseñaAId, user_id: otroId, contenido: contenido(15) })
        .select('id')
        .single()
    )
    comentarioOtroId = deOtro.id
  }, 30_000)

  it('insert con user_id ajeno → denegado (comentario_insert_own)', async () => {
    await expect(
      unwrap(
        clientOtro
          .from('comentario')
          .insert({ reseña_id: reseñaAId, user_id: escritorId, contenido: contenido(8) })
      )
    ).rejects.toThrow(/row-level security/i)
  }, 30_000)

  it('update propio ok (comentario_update_own, COM-02)', async () => {
    const actualizada = await unwrap(
      clientEscritor
        .from('comentario')
        .update({ contenido: contenido(25) })
        .eq('id', comentarioEscritorId)
        .select('contenido')
        .single()
    )
    expect(actualizada.contenido).toBe(contenido(25))
  }, 30_000)

  it('update de comentario ajeno → 0 filas, contenido intacto (COM-05)', async () => {
    const { data } = await clientOtro
      .from('comentario')
      .update({ contenido: contenido(99) })
      .eq('id', comentarioEscritorId)
      .select()
    expect(data).toHaveLength(0)

    const intacto = await unwrap(
      dbAdmin.from('comentario').select('contenido').eq('id', comentarioEscritorId).single()
    )
    expect(intacto.contenido).toBe(contenido(25))
  }, 30_000)

  it('delete de comentario ajeno → 0 filas, fila intacta (COM-05)', async () => {
    const { data } = await clientEscritor
      .from('comentario')
      .delete()
      .eq('id', comentarioOtroId)
      .select()
    expect(data).toHaveLength(0)

    const intacto = await unwrap(
      dbAdmin.from('comentario').select('id').eq('id', comentarioOtroId).single()
    )
    expect(intacto.id).toBe(comentarioOtroId)
  }, 30_000)

  it('delete propio ok (comentario_delete_own, COM-03)', async () => {
    const borrados = await unwrap(
      clientOtro
        .from('comentario')
        .delete()
        .eq('id', comentarioOtroId)
        .select('id')
    )
    expect(borrados).toHaveLength(1)

    const restantes = await unwrap(
      dbAdmin.from('comentario').select('id').eq('id', comentarioOtroId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)
})

describe('M19 cascade — FK on delete', () => {
  it('borrar reseña → sus comentarios borrados', async () => {
    // otroId no tiene reseña en serieBId (solo escritorId tiene), por lo que
    // otroId puede crear una nueva sin violar unique(user_id, serie_id)
    const reseñaCId = await crearReseña(otroId, serieBId)
    await unwrap(
      dbAdmin
        .from('comentario')
        .insert({ reseña_id: reseñaCId, user_id: escritorId, contenido: contenido(12) })
    )
    await unwrap(dbAdmin.from('reseña').delete().eq('id', reseñaCId))

    const restantes = await unwrap(
      dbAdmin.from('comentario').select('id').eq('reseña_id', reseñaCId)
    )
    expect(restantes).toHaveLength(0)
    // La otra reseña (A) conserva sus comentarios.
    const deA = await unwrap(
      dbAdmin.from('comentario').select('id').eq('reseña_id', reseñaAId)
    )
    expect(deA.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('borrar usuario → sus comentarios borrados', async () => {
    const cscdId = await crearUsuario('cscd')
    await unwrap(
      dbAdmin
        .from('comentario')
        .insert({ reseña_id: reseñaAId, user_id: cscdId, contenido: contenido(9) })
    )
    const antes = await unwrap(
      dbAdmin.from('comentario').select('id').eq('reseña_id', reseñaAId).eq('user_id', cscdId)
    )
    expect(antes).toHaveLength(1)

    await deleteTestUser(cscdId)

    const restantes = await unwrap(
      dbAdmin.from('comentario').select('id').eq('reseña_id', reseñaAId).eq('user_id', cscdId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)
})