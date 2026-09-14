import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// lib/comentarios.ts importa lib/notificaciones.ts → lib/supabase.ts (fail fast
// si faltan env vars); vi.hoisted se ejecuta antes de imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

import {
  borrarComentario,
  crearComentario,
  editarComentario,
  ERRORES_COMENTARIO,
  listComentariosPorReseña
} from '@/lib/comentarios'
import { getReseña } from '@/lib/reseñas'
import type { Database } from '@/types/database'
import {
  createTestUser,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap,
  usernameDesdeEmail
} from '../db/env'

// F025 (COM-01..06): servicios de comentarios (lib/comentarios.ts).
// Los servicios reciben el cliente por parámetro (patrón F012): los tests
// usan clientes con sesión en memoria (signInTestUser) para las escrituras
// (RLS own real) y dbAdmin como service-role en las lecturas con embed de
// username (usuario_select_own, M7).
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let escritorId: string
let otroId: string
let clientEscritor: SupabaseClient<Database>
let clientOtro: SupabaseClient<Database>
let serieAId: string
let seriePendienteId: string
let serieLibretaId: string
let reseñaAId: string
let reseñaPendienteId: string
let reseñaListaId: string
let reseñaVacíaId: string
let comentarioEscritorId: string

function slugDe(nombre: string): string {
  return `comsvc-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `comsvc-test-${nombre}-${runId}@iswdb.local`
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

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  escritorId = await crearUsuario('escritor')
  otroId = await crearUsuario('otro')
  clientEscritor = await signInTestUser(emailDe('escritor'), TEST_PASSWORD)
  clientOtro = await signInTestUser(emailDe('otro'), TEST_PASSWORD)
  const usernameEscritor = usernameDesdeEmail(emailDe('escritor'), escritorId)
  const usernameOtro = usernameDesdeEmail(emailDe('otro'), otroId)
  expect(usernameEscritor).toBeTruthy()
  expect(usernameOtro).toBeTruthy()

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `ComSvc Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        {
          titulo: 'Serie Svc A',
          slug: slugDe('a'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        },
        {
          titulo: 'Serie Svc Pendiente',
          slug: slugDe('pendiente'),
          categoria_id: categoria.id,
          moderation_status: 'pendiente'
        },
        {
          titulo: 'Serie Svc Libreta',
          slug: slugDe('libreta'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        }
      ])
      .select('id, slug')
  )
  serieAId = series.find((s) => s.slug === slugDe('a'))!.id
  seriePendienteId = series.find((s) => s.slug === slugDe('pendiente'))!.id
  serieLibretaId = series.find((s) => s.slug === slugDe('libreta'))!.id

  reseñaAId = await crearReseña(escritorId, serieAId)
  reseñaPendienteId = await crearReseña(escritorId, seriePendienteId)
  reseñaListaId = await crearReseña(otroId, serieAId)
  reseñaVacíaId = await crearReseña(escritorId, serieLibretaId)
}, 120_000)

afterAll(async () => {
  try {
    await unwrap(
      dbAdmin
        .from('serie')
        .delete()
        .in('slug', [slugDe('a'), slugDe('pendiente'), slugDe('libreta')])
    )
    await unwrap(dbAdmin.from('categoria').delete().eq('slug', slugDe('cat')))
    await unwrap(dbAdmin.from('usuario').delete().in('id', createdAuthUserIds))
  } catch (error) {
    console.warn(`Cleanup de tests/lib/comentarios.test.ts falló: ${(error as Error).message}`)
  }
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('crearComentario (COM-01/COM-06)', () => {
  it('crea el comentario (trimeado) y retorna la fila con el username del autor', async () => {
    const creado = await crearComentario(clientEscritor, dbAdmin, reseñaAId, escritorId, '  Me encantó  ')

    expect(creado.contenido).toBe('Me encantó')
    expect(creado.autor.id).toBe(escritorId)
    expect(creado.autor.username).toBe(usernameDesdeEmail(emailDe('escritor'), escritorId))
    expect(new Date(creado.created_at).getTime()).not.toBeNaN()
    comentarioEscritorId = creado.id

    const fila = await unwrap(
      dbAdmin.from('comentario').select('contenido, user_id').eq('id', creado.id).single()
    )
    expect(fila.contenido).toBe('Me encantó')
    expect(fila.user_id).toBe(escritorId)
  }, 30_000)

  it('límite de 1000 caracteres se acepta', async () => {
    const creado = await crearComentario(clientEscritor, dbAdmin, reseñaAId, escritorId, contenido(1000))
    expect(creado.contenido).toHaveLength(1000)
  }, 30_000)

  it('reseña inexistente → reseñaNoEncontrada', async () => {
    await expect(
      crearComentario(clientEscritor, dbAdmin, crypto.randomUUID(), escritorId, 'Hola')
    ).rejects.toThrow(ERRORES_COMENTARIO.reseñaNoEncontrada)
  }, 30_000)

  it('reseña de serie no aprobada → reseñaNoEncontrada', async () => {
    await expect(
      crearComentario(clientEscritor, dbAdmin, reseñaPendienteId, escritorId, 'Hola')
    ).rejects.toThrow(ERRORES_COMENTARIO.reseñaNoEncontrada)
  }, 30_000)

  it('contenido vacío (0 tras trim) → contenidoVacio', async () => {
    await expect(crearComentario(clientEscritor, dbAdmin, reseñaAId, escritorId, '')).rejects.toThrow(
      ERRORES_COMENTARIO.contenidoVacio
    )
    await expect(crearComentario(clientEscritor, dbAdmin, reseñaAId, escritorId, '   ')).rejects.toThrow(
      ERRORES_COMENTARIO.contenidoVacio
    )
  }, 30_000)

  it('contenido >1000 → contenidoMuyLargo', async () => {
    await expect(
      crearComentario(clientEscritor, dbAdmin, reseñaAId, escritorId, contenido(1001))
    ).rejects.toThrow(ERRORES_COMENTARIO.contenidoMuyLargo)
  }, 30_000)
})

describe('notificaciones de comentarios (F026 / NOTC-01..05)', () => {
  async function notificacionesDeComentario(comentarioId: string) {
    return unwrap(
      dbAdmin.from('notificacion').select('id, usuario_id, tipo').eq('comentario_id', comentarioId)
    )
  }

  it('comentar reseña ajena genera notificación al autor (nuevo_comentario)', async () => {
    const comentario = await crearComentario(clientOtro, dbAdmin, reseñaAId, otroId, 'Notifica a la reseña')

    const notifs = await notificacionesDeComentario(comentario.id)
    expect(notifs).toHaveLength(1)
    expect(notifs[0].usuario_id).toBe(escritorId)
    expect(notifs[0].tipo).toBe('nuevo_comentario')
  }, 30_000)

  it('comentar la propia reseña NO genera notificación (NOTC-03)', async () => {
    const comentario = await crearComentario(clientEscritor, dbAdmin, reseñaAId, escritorId, 'Sin auto')

    expect(await notificacionesDeComentario(comentario.id)).toEqual([])
  }, 30_000)

  it('editar/borrar no generan ni borran notificaciones (NOTC-05)', async () => {
    const comentario = await crearComentario(clientOtro, dbAdmin, reseñaAId, otroId, 'Edición notificación')
    expect(await notificacionesDeComentario(comentario.id)).toHaveLength(1)

    await editarComentario(clientOtro, comentario.id, otroId, 'Editado sin notificación')
    const trasEditar = await notificacionesDeComentario(comentario.id)
    expect(trasEditar).toHaveLength(1)
    expect(trasEditar[0].usuario_id).toBe(escritorId)

    await borrarComentario(clientOtro, comentario.id, otroId)
    expect(await notificacionesDeComentario(comentario.id)).toEqual([])
  }, 30_000)

  it('fallo de notificación NO rompe el comentario (log-and-continue, D25)', async () => {
    const serviceRoleQueFalla = {
      from: () => ({ insert: async () => ({ error: { message: 'insert denegado (stub)' } }) })
    } as unknown as SupabaseClient<Database>

    const comentario = await crearComentario(
      clientOtro,
      serviceRoleQueFalla,
      reseñaAId,
      otroId,
      'Comentario con notif rota'
    )
    expect(comentario.contenido).toBe('Comentario con notif rota')

    const fila = await unwrap(
      dbAdmin.from('comentario').select('id').eq('id', comentario.id).single()
    )
    expect(fila.id).toBe(comentario.id)
  }, 30_000)
})

describe('editarComentario (COM-02/COM-05/COM-06)', () => {
  it('actualiza el contenido y conserva created_at (sin updated_at)', async () => {
    await unwindCreatedAt(comentarioEscritorId)
    await editarComentario(clientEscritor, comentarioEscritorId, escritorId, 'Ahora con edición')

    const fila = await unwrap(
      dbAdmin.from('comentario').select('contenido, created_at').eq('id', comentarioEscritorId).single()
    )
    expect(fila.contenido).toBe('Ahora con edición')
    expect(fila.created_at).toBe('2026-02-01T10:00:00+00:00')
  }, 30_000)

  it('comentario ajeno → sinPermiso, contenido intacto (COM-05)', async () => {
    await expect(
      editarComentario(clientOtro, comentarioEscritorId, otroId, 'Intento ajeno')
    ).rejects.toThrow(ERRORES_COMENTARIO.sinPermiso)
    const fila = await unwrap(
      dbAdmin.from('comentario').select('contenido').eq('id', comentarioEscritorId).single()
    )
    expect(fila.contenido).toBe('Ahora con edición')
  }, 30_000)

  it('comentario inexistente → comentarioNoEncontrado', async () => {
    await expect(
      editarComentario(clientEscritor, crypto.randomUUID(), escritorId, 'Hola')
    ).rejects.toThrow(ERRORES_COMENTARIO.comentarioNoEncontrado)
  }, 30_000)

  it('contenido vacío → contenidoVacio (no escribe)', async () => {
    await expect(
      editarComentario(clientEscritor, comentarioEscritorId, escritorId, '   ')
    ).rejects.toThrow(ERRORES_COMENTARIO.contenidoVacio)
  }, 30_000)

  it('contenido >1000 → contenidoMuyLargo', async () => {
    await expect(
      editarComentario(clientEscritor, comentarioEscritorId, escritorId, contenido(1001))
    ).rejects.toThrow(ERRORES_COMENTARIO.contenidoMuyLargo)
  }, 30_000)
})

describe('borrarComentario (COM-03/COM-05)', () => {
  it('comentario inexistente → comentarioNoEncontrado', async () => {
    await expect(
      borrarComentario(clientEscritor, crypto.randomUUID(), escritorId)
    ).rejects.toThrow(ERRORES_COMENTARIO.comentarioNoEncontrado)
  }, 30_000)

  it('comentario ajeno → sinPermiso, fila intacta (COM-05)', async () => {
    const propio = await crearComentario(clientOtro, dbAdmin, reseñaAId, otroId, 'Comentario de otro')

    await expect(
      borrarComentario(clientEscritor, propio.id, escritorId)
    ).rejects.toThrow(ERRORES_COMENTARIO.sinPermiso)
    const restantes = await unwrap(
      dbAdmin.from('comentario').select('id').eq('id', propio.id)
    )
    expect(restantes).toHaveLength(1)
  }, 30_000)

  it('borra el propio comentario (COM-03)', async () => {
    const propio = await crearComentario(clientEscritor, dbAdmin, reseñaAId, escritorId, 'Para borrar')
    await borrarComentario(clientEscritor, propio.id, escritorId)
    const restantes = await unwrap(dbAdmin.from('comentario').select('id').eq('id', propio.id))
    expect(restantes).toHaveLength(0)
  }, 30_000)
})

describe('listComentariosPorReseña (COM-04)', () => {
  it('orden created_at desc con embed de username y limit', async () => {
    await unwindComentariosDeLista()

    const lista = await listComentariosPorReseña(dbAdmin, reseñaListaId)

    expect(lista.map((c) => c.contenido)).toEqual(['Medio aaa', 'Intermedio aaa', 'Primero aaa'])
    expect(lista.map((c) => c.autor.username)).toEqual([
      usernameDesdeEmail(emailDe('escritor'), escritorId),
      usernameDesdeEmail(emailDe('otro'), otroId),
      usernameDesdeEmail(emailDe('escritor'), escritorId)
    ])

    const limitada = await listComentariosPorReseña(dbAdmin, reseñaListaId, 2)
    expect(limitada).toHaveLength(2)
    expect(limitada.map((c) => c.contenido)).toEqual(['Medio aaa', 'Intermedio aaa'])
  }, 30_000)

  it('reseña sin comentarios → lista vacía', async () => {
    // reseñaVacía se crea en beforeAll sobre una serie sin reseñas previas
    // (unique user+serie): serieLibreta solo la tiene escritor.
    expect(await listComentariosPorReseña(dbAdmin, reseñaVacíaId)).toEqual([])
  }, 30_000)

  it('reseña inexistente → reseñaNoEncontrada', async () => {
    await expect(listComentariosPorReseña(dbAdmin, crypto.randomUUID())).rejects.toThrow(
      ERRORES_COMENTARIO.reseñaNoEncontrada
    )
  }, 30_000)

  it('reseña de serie no aprobada → reseñaNoEncontrada', async () => {
    await expect(listComentariosPorReseña(dbAdmin, reseñaPendienteId)).rejects.toThrow(
      ERRORES_COMENTARIO.reseñaNoEncontrada
    )
  }, 30_000)
})

describe('getReseña (página /resenas/<id>)', () => {
  it('devuelve la reseña con autor (username) y serie', async () => {
    const reseña = await getReseña(dbAdmin, reseñaAId)
    expect(reseña).not.toBeNull()
    expect(reseña!.serie.slug).toBe(slugDe('a'))
    expect(reseña!.autor.username).toBe(usernameDesdeEmail(emailDe('escritor'), escritorId))
    expect(reseña!.serie.titulo).toBe('Serie Svc A')
    expect(reseña!.contenido).toBe(contenido(70))
  }, 30_000)

  it('null si la reseña no existe', async () => {
    expect(await getReseña(dbAdmin, crypto.randomUUID())).toBeNull()
  })

  it('null si la serie no está aprobada (reseña no pública)', async () => {
    expect(await getReseña(dbAdmin, reseñaPendienteId)).toBeNull()
  })
})

async function unwindCreatedAt(comentarioId: string): Promise<void> {
  await unwrap(
    dbAdmin
      .from('comentario')
      .update({ created_at: '2026-02-01T10:00:00+00' })
      .eq('id', comentarioId)
  )
}

async function unwindComentariosDeLista(): Promise<void> {
  await unwrap(
    dbAdmin.from('comentario').insert([
      {
        reseña_id: reseñaListaId,
        user_id: escritorId,
        contenido: 'Primero aaa',
        created_at: '2026-02-01T10:00:00+00'
      },
      {
        reseña_id: reseñaListaId,
        user_id: otroId,
        contenido: 'Intermedio aaa',
        created_at: '2026-03-01T10:00:00+00'
      },
      {
        reseña_id: reseñaListaId,
        user_id: escritorId,
        contenido: 'Medio aaa',
        created_at: '2026-04-01T10:00:00+00'
      }
    ])
  )
}