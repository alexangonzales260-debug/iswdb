import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  crearReseña,
  editarReseña,
  eliminarReseña,
  ERRORES_RESEÑA,
  getReseñaUsuario,
  listReseñasSerie
} from '@/lib/reseñas'
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
let clientEscritor: SupabaseClient<Database>
let clientOtro: SupabaseClient<Database>
let clientMod: SupabaseClient<Database>
let clientAdmin: SupabaseClient<Database>
let serieAId: string
let serieBId: string
let seriePendienteId: string
let serieReseñasId: string
let serieListaId: string
let reseñaEscritorId: string
let reseñaOtroId: string
let reseñaOtroSerieBId: string
let escritorReseñaId: string
let modReseñaId: string
let otroReseña2Id: string

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
  // Email en la fila usuario (M6): necesario para el embed de autor en
  // listReseñasSerie.
  await unwrap(dbAdmin.from('usuario').insert({ id: userId, rol, email: emailDe(nombre) }))
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  // GoTrue en frío (tras supabase start/reset) puede fallar en las primeras
  // llamadas: se templa creando y borrando un usuario vía admin API.
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  // Categoría + 5 series: serieA (objetivo principal de RLS), serieB
  // (inserts propios/ajenos sin chocar con el unique user+serie), pendiente
  // (rechazo server-side), res (servicios de creación/edición/borrado) y
  // lista (listReseñasSerie con created_at explícitos).
  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Res Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  // Filas uniformes: en el bulk insert PostgREST toma las columnas del primer
  // objeto; una key ausente sería NULL (no el default de la BD).
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        {
          titulo: 'Serie Res A',
          slug: slugDe('a'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        },
        {
          titulo: 'Serie Res B',
          slug: slugDe('b'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        },
        {
          titulo: 'Serie Res Pendiente',
          slug: slugDe('pendiente'),
          categoria_id: categoria.id,
          moderation_status: 'pendiente'
        },
        {
          titulo: 'Serie Res C',
          slug: slugDe('res'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        },
        {
          titulo: 'Serie Res Lista',
          slug: slugDe('lista'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        }
      ])
      .select('id, slug')
  )
  const porSlug = Object.fromEntries(series.map((s) => [s.slug, s]))
  serieAId = porSlug[slugDe('a')].id
  serieBId = porSlug[slugDe('b')].id
  seriePendienteId = porSlug[slugDe('pendiente')].id
  serieReseñasId = porSlug[slugDe('res')].id
  serieListaId = porSlug[slugDe('lista')].id

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

  // Valoraciones previas para los tests de servicios (RES-02): todos tienen
  // nota en la serie 'res' salvo para la pendiente, que solo tiene el
  // escritor (así el rechazo de no aprobada no se confunde con el de sin
  // valoración). otro no ha valorado la serie 'lista'.
  await unwrap(
    dbAdmin.from('valoracion').insert([
      { user_id: escritorId, serie_id: serieReseñasId, nota: 8 },
      { user_id: escritorId, serie_id: seriePendienteId, nota: 5 },
      { user_id: modId, serie_id: serieReseñasId, nota: 7 },
      { user_id: adminId, serie_id: serieReseñasId, nota: 9 },
      { user_id: otroId, serie_id: serieReseñasId, nota: 6 }
    ])
  )
}, 120_000)

afterAll(async () => {
  try {
    // Borrar las series casca en cascada sus reseñas y valoraciones.
    await unwrap(
      dbAdmin
        .from('serie')
        .delete()
        .in('slug', [slugDe('a'), slugDe('b'), slugDe('pendiente'), slugDe('res'), slugDe('lista')])
    )
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

// ── F012 · Servicios (lib/reseñas.ts) ──────────────────────────────────────
// Clientes con sesión en memoria (signInTestUser): RLS con auth.uid() real
// sin request context de Next. dbAdmin hace de cliente service-role en las
// lecturas (mismo bypass que createServiceRoleClient en la app).

describe('crearReseña (RES-01/RES-02/RES-07)', () => {
  it('crea la reseña si hay valoración previa', async () => {
    await crearReseña(clientEscritor, slugDe('res'), contenido(100))

    const filas = await unwrap(
      dbAdmin
        .from('reseña')
        .select('id, contenido')
        .eq('serie_id', serieReseñasId)
        .eq('user_id', escritorId)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].contenido).toBe(contenido(100))
    escritorReseñaId = filas[0].id
  }, 30_000)

  it('sin valoración previa → rechazo server-side (RES-02)', async () => {
    // otro no ha valorado la serie 'lista'.
    await expect(crearReseña(clientOtro, slugDe('lista'), contenido(80))).rejects.toThrow(
      ERRORES_RESEÑA.sinValoracion
    )
    const filas = await unwrap(
      dbAdmin.from('reseña').select('id').eq('serie_id', serieListaId).eq('user_id', otroId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('serie no aprobada → rechazo server-side', async () => {
    // El escritor sí tiene valoración en la pendiente: el rechazo es por
    // estado de moderación, no por falta de voto.
    await expect(crearReseña(clientEscritor, slugDe('pendiente'), contenido(80))).rejects.toThrow(
      ERRORES_RESEÑA.serieNoAprobada
    )
    const filas = await unwrap(
      dbAdmin.from('reseña').select('id').eq('serie_id', seriePendienteId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('slug inexistente → serie no encontrada', async () => {
    await expect(crearReseña(clientEscritor, slugDe('no-existe'), contenido(80))).rejects.toThrow(
      ERRORES_RESEÑA.serieNoEncontrada
    )
  }, 30_000)

  it('longitudes inválidas (49/2001) → error de validación, no escribe', async () => {
    await expect(crearReseña(clientOtro, slugDe('res'), contenido(49))).rejects.toThrow(
      ERRORES_RESEÑA.contenidoInvalido
    )
    await expect(crearReseña(clientOtro, slugDe('res'), contenido(2001))).rejects.toThrow(
      ERRORES_RESEÑA.contenidoInvalido
    )
    const filas = await unwrap(
      dbAdmin.from('reseña').select('id').eq('serie_id', serieReseñasId).eq('user_id', otroId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('límites válidos 50/2000 ok; el contenido se almacena trimeado', async () => {
    // 54 chars en bruto → 50 tras trim: pasa el mínimo gracias al trim y se
    // guarda sin los espacios.
    await crearReseña(clientMod, slugDe('res'), `  ${contenido(50)}  `)
    const deMod = await unwrap(
      dbAdmin
        .from('reseña')
        .select('id, contenido')
        .eq('serie_id', serieReseñasId)
        .eq('user_id', modId)
        .single()
    )
    modReseñaId = deMod.id
    expect(deMod.contenido).toBe(contenido(50))

    await crearReseña(clientAdmin, slugDe('res'), contenido(2000))
    const deAdmin = await unwrap(
      dbAdmin
        .from('reseña')
        .select('contenido')
        .eq('serie_id', serieReseñasId)
        .eq('user_id', adminId)
        .single()
    )
    expect(deAdmin.contenido).toBe(contenido(2000))
  }, 30_000)

  it('duplicado → error amigable (23505 mapeado, RES-07)', async () => {
    await expect(crearReseña(clientEscritor, slugDe('res'), contenido(90))).rejects.toThrow(
      ERRORES_RESEÑA.duplicada
    )
  }, 30_000)

  it('sin sesión → error', async () => {
    await expect(crearReseña(db, slugDe('res'), contenido(80))).rejects.toThrow(
      ERRORES_RESEÑA.sinSesion
    )
  }, 30_000)
})

describe('getReseñaUsuario', () => {
  it('devuelve la reseña actual del usuario', async () => {
    const reseña = await getReseñaUsuario(dbAdmin, serieReseñasId, escritorId)
    expect(reseña).toEqual({ id: escritorReseñaId, contenido: contenido(100) })
  })

  it('null si el usuario no tiene reseña para la serie', async () => {
    expect(await getReseñaUsuario(dbAdmin, serieReseñasId, otroId)).toBeNull()
  })
})

describe('editarReseña (RES-03)', () => {
  it('actualiza el contenido y refreshed updated_at (trigger)', async () => {
    // updated_at al pasado para hacer observable el trigger.
    await unwrap(
      dbAdmin
        .from('reseña')
        .update({ updated_at: '2026-01-01T00:00:00+00' })
        .eq('id', escritorReseñaId)
    )

    await editarReseña(clientEscritor, escritorReseñaId, contenido(120))

    const fila = await unwrap(
      dbAdmin.from('reseña').select('contenido, updated_at').eq('id', escritorReseñaId).single()
    )
    expect(fila.contenido).toBe(contenido(120))
    expect(new Date(fila.updated_at).getTime()).toBeGreaterThan(
      new Date('2026-01-02T00:00:00Z').getTime()
    )
  }, 30_000)

  it('reseña ajena → rechazada, contenido intacto', async () => {
    await expect(editarReseña(clientOtro, escritorReseñaId, contenido(130))).rejects.toThrow(
      ERRORES_RESEÑA.noEncontrada
    )
    const fila = await unwrap(
      dbAdmin.from('reseña').select('contenido').eq('id', escritorReseñaId).single()
    )
    expect(fila.contenido).toBe(contenido(120))
  }, 30_000)

  it('longitud inválida → error de validación', async () => {
    await expect(editarReseña(clientEscritor, escritorReseñaId, contenido(49))).rejects.toThrow(
      ERRORES_RESEÑA.contenidoInvalido
    )
  }, 30_000)

  it('id inexistente → error', async () => {
    await expect(
      editarReseña(clientEscritor, crypto.randomUUID(), contenido(60))
    ).rejects.toThrow(ERRORES_RESEÑA.noEncontrada)
  }, 30_000)
})

describe('eliminarReseña (RES-04/RES-09)', () => {
  it('no dueño ni mod → rechazada, fila intacta', async () => {
    await expect(eliminarReseña(clientOtro, escritorReseñaId)).rejects.toThrow(
      ERRORES_RESEÑA.sinPermiso
    )
    const filas = await unwrap(dbAdmin.from('reseña').select('id').eq('id', escritorReseñaId))
    expect(filas).toHaveLength(1)
  }, 30_000)

  it('dueño la borra y su valoración permanece intacta (RES-04)', async () => {
    await eliminarReseña(clientMod, modReseñaId)

    const restantes = await unwrap(dbAdmin.from('reseña').select('id').eq('id', modReseñaId))
    expect(restantes).toHaveLength(0)
    // Aserción explícita RES-04: la valoración no se toca.
    const valoración = await unwrap(
      dbAdmin
        .from('valoracion')
        .select('nota')
        .eq('serie_id', serieReseñasId)
        .eq('user_id', modId)
        .single()
    )
    expect(valoración.nota).toBe(7)
  }, 30_000)

  it('mod borra reseña de otro usuario (RES-09)', async () => {
    await eliminarReseña(clientMod, escritorReseñaId)
    const restantes = await unwrap(dbAdmin.from('reseña').select('id').eq('id', escritorReseñaId))
    expect(restantes).toHaveLength(0)
  }, 30_000)

  it('admin borra reseña de otro usuario', async () => {
    // otro crea su reseña (tiene valoración en la serie 'res').
    await crearReseña(clientOtro, slugDe('res'), contenido(80))
    const creadas = await unwrap(
      dbAdmin.from('reseña').select('id').eq('serie_id', serieReseñasId).eq('user_id', otroId)
    )
    otroReseña2Id = creadas[0].id

    await eliminarReseña(clientAdmin, otroReseña2Id)
    const restantes = await unwrap(dbAdmin.from('reseña').select('id').eq('id', otroReseña2Id))
    expect(restantes).toHaveLength(0)
  }, 30_000)
})

describe('listReseñasSerie (RES-08)', () => {
  it('orden created_at desc con embed de autor (id y email)', async () => {
    // created_at explícitos: escritor (03) > mod (02) > otro (01).
    await unwrap(
      dbAdmin.from('reseña').insert([
        {
          user_id: otroId,
          serie_id: serieListaId,
          contenido: contenido(55),
          created_at: '2026-01-05T10:00:00+00'
        },
        {
          user_id: modId,
          serie_id: serieListaId,
          contenido: contenido(65),
          created_at: '2026-02-05T10:00:00+00'
        },
        {
          user_id: escritorId,
          serie_id: serieListaId,
          contenido: contenido(75),
          created_at: '2026-03-05T10:00:00+00'
        }
      ])
    )

    const lista = await listReseñasSerie(dbAdmin, serieListaId)

    expect(lista.map((r) => r.autor.id)).toEqual([escritorId, modId, otroId])
    expect(lista.map((r) => r.autor.email)).toEqual([
      emailDe('escritor'),
      emailDe('mod'),
      emailDe('otro')
    ])
    expect(lista.map((r) => r.contenido)).toEqual([contenido(75), contenido(65), contenido(55)])
    for (const reseña of lista) {
      expect(reseña.id).toBeDefined()
      expect(reseña.created_at).toBeTruthy()
      expect(reseña.updated_at).toBeTruthy()
    }
  }, 30_000)

  it('serie sin reseñas → lista vacía', async () => {
    // serieB quedó sin reseñas tras los tests RLS (la de otro la borró mod).
    expect(await listReseñasSerie(dbAdmin, serieBId)).toEqual([])
  })
})
