import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// lib/admin.ts → lib/supabase.ts lanza si faltan env vars (fail fast);
// vi.hoisted se ejecuta antes que los imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

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
import {
  contarNoLeidas,
  listMisNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  notificarNuevoEpisodio
} from '@/lib/notificaciones'
import { editarSerie } from '@/lib/admin'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let seguidorId: string
let ajenoId: string
let clientSeguidor: SupabaseClient<Database>
let clientAjeno: SupabaseClient<Database>

let categoriaId: string
let serieId: string
let episodioId: string

function slugDe(nombre: string): string {
  return `not-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `not-test-${nombre}-${runId}@iswdb.local`
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

  seguidorId = await crearUsuario('seguidor')
  ajenoId = await crearUsuario('ajeno')
  clientSeguidor = await signInTestUser(emailDe('seguidor'), TEST_PASSWORD)
  clientAjeno = await signInTestUser(emailDe('ajeno'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Not Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  categoriaId = categoria.id

  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie Notificaciones',
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
        temporada: 2,
        numero: 5,
        titulo: 'Episodio Nuevo',
        video_id: `vid-${runId}`
      })
      .select('id')
      .single()
  )
  episodioId = episodio.id
}, 60_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('notificacion').delete().eq('serie_id', serieId))
  await unwrap(dbAdmin.from('usuario_serie').delete().eq('serie_id', serieId))
  await unwrap(dbAdmin.from('episodio').delete().eq('serie_id', serieId))
  await unwrap(dbAdmin.from('serie').delete().eq('id', serieId))
  await unwrap(dbAdmin.from('categoria').delete().eq('id', categoriaId))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

async function seguirASerie(usuarioId: string): Promise<void> {
  await unwrap(dbAdmin.from('usuario_serie').insert({ usuario_id: usuarioId, serie_id: serieId }))
}

async function limpiarNotificaciones(): Promise<void> {
  await unwrap(dbAdmin.from('notificacion').delete().eq('serie_id', serieId))
}

describe('generación (notificarNuevoEpisodio, service_role)', () => {
  it('A sigue la serie → tras notificar, A tiene 1 notificación correcta', async () => {
    await seguirASerie(seguidorId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    const notifs = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('usuario_id, serie_id, episodio_id, leida')
        .eq('serie_id', serieId)
    )
    expect(notifs).toHaveLength(1)
    expect(notifs[0].usuario_id).toBe(seguidorId)
    expect(notifs[0].serie_id).toBe(serieId)
    expect(notifs[0].episodio_id).toBe(episodioId)
    expect(notifs[0].leida).toBe(false)

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)

  it('idempotente: llamar 2 veces → 1 notificación (UNIQUE usuario_id, episodio_id)', async () => {
    await seguirASerie(seguidorId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    const notifs = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('id')
        .eq('usuario_id', seguidorId)
        .eq('episodio_id', episodioId)
    )
    expect(notifs).toHaveLength(1)

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)

  it('B (no sigue la serie) → 0 notificaciones', async () => {
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)
    const notifs = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('id')
        .eq('serie_id', serieId)
        .eq('usuario_id', ajenoId)
    )
    expect(notifs).toHaveLength(0)
    await limpiarNotificaciones()
  }, 30_000)

  it('editarSerie (admin) añade un episodio nuevo a una serie seguida → notificación por seguidor', async () => {
    await seguirASerie(seguidorId)
    // La serie ya tiene episodioId; el edit conserva ese episodio y añade uno nuevo.
    await editarSerie(dbAdmin, slugDe('serie'), {
      titulo: 'Serie Notificaciones',
      categoria: slugDe('cat'),
      estado: 'activa',
      episodios: [
        { id: episodioId, temporada: 2, numero: 5, titulo: 'Episodio Nuevo', video_id: `vid-${runId}` },
        { temporada: 2, numero: 8, titulo: 'Episodio Añadido', video_id: `vid4-${runId}` }
      ]
    })

    const notifs = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('episodio_id, leida')
        .eq('usuario_id', seguidorId)
    )
    expect(notifs).toHaveLength(1)
    expect(notifs[0].leida).toBe(false)
    expect(notifs[0].episodio_id).not.toBe(episodioId)

    await limpiarNotificaciones()
    await unwrap(
      dbAdmin
        .from('episodio')
        .delete()
        .eq('serie_id', serieId)
        .neq('id', episodioId)
    )
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)
})

describe('consulta y conteo (listMisNotificaciones, contarNoLeidas)', () => {
  it('A: listMisNotificaciones retorna su notificación con join, order desc', async () => {
    await seguirASerie(seguidorId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    const lista = await listMisNotificaciones(clientSeguidor, seguidorId)
    expect(lista).toHaveLength(1)
    const notif = lista[0]
    expect(notif.tipo).toBe('nuevo_episodio')
    if (notif.tipo === 'nuevo_episodio') {
      expect(notif.serie.titulo).toBe('Serie Notificaciones')
      expect(notif.serie.slug).toBe(slugDe('serie'))
      expect(notif.episodio.numero).toBe(5)
      expect(notif.episodio.temporada).toBe(2)
      expect(notif.episodio.titulo).toBe('Episodio Nuevo')
    }
    expect(notif.leida).toBe(false)
    expect(new Date(notif.created_at).getTime()).not.toBeNaN()

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)

  it('A: contarNoLeidas = 1 antes de marcar, 0 después', async () => {
    await seguirASerie(seguidorId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    expect(await contarNoLeidas(clientSeguidor, seguidorId)).toBe(1)

    const notifs = await unwrap(
      dbAdmin.from('notificacion').select('id').eq('usuario_id', seguidorId).eq('episodio_id', episodioId)
    )
    await marcarLeida(clientSeguidor, seguidorId, notifs[0].id)

    expect(await contarNoLeidas(clientSeguidor, seguidorId)).toBe(0)

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)
})

describe('escritura (marcarLeida, marcarTodasLeidas)', () => {
  it('marcarLeida: leida=true tras marcar (solo la propia)', async () => {
    await seguirASerie(seguidorId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    const notifs = await unwrap(
      dbAdmin.from('notificacion').select('id').eq('usuario_id', seguidorId).eq('episodio_id', episodioId)
    )
    await marcarLeida(clientSeguidor, seguidorId, notifs[0].id)

    const actualizada = await unwrap(
      dbAdmin.from('notificacion').select('leida').eq('id', notifs[0].id).single()
    )
    expect(actualizada.leida).toBe(true)

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)

  it('marcarTodasLeidas: con 2 notificaciones, ambas leida=true', async () => {
    await seguirASerie(seguidorId)
    const ep1 = await unwrap(
      dbAdmin
        .from('episodio')
        .insert({
          serie_id: serieId,
          temporada: 2,
          numero: 6,
          titulo: 'Episodio 2',
          video_id: `vid2-${runId}`
        })
        .select('id')
        .single()
    )
    const ep2 = await unwrap(
      dbAdmin
        .from('episodio')
        .insert({
          serie_id: serieId,
          temporada: 2,
          numero: 7,
          titulo: 'Episodio 3',
          video_id: `vid3-${runId}`
        })
        .select('id')
        .single()
    )
    await notificarNuevoEpisodio(dbAdmin, serieId, ep1.id)
    await notificarNuevoEpisodio(dbAdmin, serieId, ep2.id)

    expect(await contarNoLeidas(clientSeguidor, seguidorId)).toBe(2)

    await marcarTodasLeidas(clientSeguidor, seguidorId)

    const restantes = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('leida')
        .eq('usuario_id', seguidorId)
    )
    expect(restantes).toHaveLength(2)
    expect(restantes.every((n) => n.leida === true)).toBe(true)
    expect(await contarNoLeidas(clientSeguidor, seguidorId)).toBe(0)

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('episodio').delete().eq('id', ep1.id))
    await unwrap(dbAdmin.from('episodio').delete().eq('id', ep2.id))
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)
})

describe('RLS (NOT-08)', () => {
  it('B con su sesión: listMisNotificaciones no ve las de A (0 filas)', async () => {
    await seguirASerie(seguidorId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    const lista = await listMisNotificaciones(clientAjeno, ajenoId)
    expect(lista).toHaveLength(0)

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)

  it('B intenta marcarLeida con el id de A → no actualiza', async () => {
    await seguirASerie(seguidorId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    const notifs = await unwrap(
      dbAdmin
        .from('notificacion')
        .select('id')
        .eq('usuario_id', seguidorId)
        .eq('episodio_id', episodioId)
    )
    await marcarLeida(clientAjeno, ajenoId, notifs[0].id)

    const actualizada = await unwrap(
      dbAdmin.from('notificacion').select('leida').eq('id', notifs[0].id).single()
    )
    expect(actualizada.leida).toBe(false)

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)

  it('authenticated INSERT directo a notificacion → denegado (insert solo service_role)', async () => {
    await seguirASerie(seguidorId)
    await expect(
      unwrap(
        clientSeguidor.from('notificacion').insert({
          usuario_id: seguidorId,
          serie_id: serieId,
          episodio_id: episodioId
        })
      )
    ).rejects.toThrow(/row-level security|permission denied/i)

    const notifs = await unwrap(
      dbAdmin.from('notificacion').select('id').eq('serie_id', serieId)
    )
    expect(notifs).toHaveLength(0)

    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)

  it('anon: lectura de notificaciones denegada (sin grant de SELECT)', async () => {
    await seguirASerie(seguidorId)
    await notificarNuevoEpisodio(dbAdmin, serieId, episodioId)

    await expect(
      unwrap(db.from('notificacion').select('id').eq('serie_id', serieId))
    ).rejects.toThrow(/permission denied|not permitted/i)

    await limpiarNotificaciones()
    await unwrap(dbAdmin.from('usuario_serie').delete().eq('usuario_id', seguidorId).eq('serie_id', serieId))
  }, 30_000)
})
