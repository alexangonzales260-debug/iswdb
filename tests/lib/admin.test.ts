import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// lib/admin.ts importa lib/series.ts → lib/supabase.ts, que lanza si faltan
// env vars (fail fast); vi.hoisted se ejecuta antes que los imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import {
  aprobarSerie,
  ERRORES_ADMIN,
  getRolUsuario,
  getSerieParaEditar,
  listSeriesPendientes,
  listTodasSeries,
  rechazarSerie,
  requireMod
} from '@/lib/admin'
import { listCanales } from '@/lib/canales'
import {
  createTestUser,
  db,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap
} from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'
// Digest del error que lanza notFound() en Next 16 (http-access-fallback).
const DIGEST_NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404'

let runId: number
let modId: string
let userId: string
let clientMod: SupabaseClient
let clientUser: SupabaseClient
const createdAuthUserIds: string[] = []

function slugDe(n: number): string {
  return `adm-${String(n).padStart(2, '0')}-${runId}`
}

// Limpieza inicial: catálogo vacío + seed propio (patrón de valoraciones.test).
// Fixture: 1 aprobada (con canales y episodios), 2 pendientes (FIFO), 1 rechazada.
beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('canal').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('categoria').delete().not('id', 'is', null))

  runId = Date.now()
  modId = await createTestUser(`adm-mod-${runId}@iswdb.local`, TEST_PASSWORD)
  userId = await createTestUser(`adm-user-${runId}@iswdb.local`, TEST_PASSWORD)
  createdAuthUserIds.push(modId, userId)
  await unwrap(
    dbAdmin.from('usuario').insert([
      { id: modId, rol: 'mod' },
      { id: userId, rol: 'user' }
    ])
  )
  clientMod = await signInTestUser(`adm-mod-${runId}@iswdb.local`, TEST_PASSWORD)
  clientUser = await signInTestUser(`adm-user-${runId}@iswdb.local`, TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-adm-${runId}`, slug: `cat-adm-${runId}` })
      .select('id')
      .single()
  )
  const canales = await unwrap(
    dbAdmin
      .from('canal')
      .insert([
        { nombre: 'Canal ADM Uno', handle: `adm-canal-uno-${runId}`, avatar_url: null },
        {
          nombre: 'Canal ADM Dos',
          handle: `adm-canal-dos-${runId}`,
          avatar_url: `https://img.youtube.com/vi/adm${runId}/avatar.jpg`
        }
      ])
      .select('id, handle')
  )
  const canalIdPorHandle = Object.fromEntries(canales.map((c) => [c.handle, c.id]))

  // created_at explícitos: orden FIFO de la cola (asc) y listado desc.
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        {
          titulo: 'Serie ADM Uno',
          slug: slugDe(1),
          categoria_id: categoria.id,
          moderation_status: 'aprobada',
          created_at: '2026-01-01T10:00:00+00'
        },
        {
          titulo: 'Serie ADM Dos',
          slug: slugDe(2),
          categoria_id: categoria.id,
          moderation_status: 'pendiente',
          created_at: '2026-01-02T10:00:00+00'
        },
        {
          titulo: 'Serie ADM Tres',
          slug: slugDe(3),
          categoria_id: categoria.id,
          moderation_status: 'rechazada',
          created_at: '2026-01-03T10:00:00+00'
        },
        {
          titulo: 'Serie ADM Cuatro',
          slug: slugDe(4),
          categoria_id: categoria.id,
          moderation_status: 'pendiente',
          created_at: '2026-01-04T10:00:00+00'
        }
      ])
      .select('id, slug')
  )
  const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))

  await unwrap(
    dbAdmin.from('participa').insert([
      {
        serie_id: serieIdPorSlug[slugDe(1)],
        canal_id: canalIdPorHandle[`adm-canal-uno-${runId}`],
        rol: 'principal'
      },
      {
        serie_id: serieIdPorSlug[slugDe(1)],
        canal_id: canalIdPorHandle[`adm-canal-dos-${runId}`],
        rol: 'invitado'
      }
    ])
  )

  // Episodios insertados fuera de orden: getSerieParaEditar debe devolverlos
  // ordenados por temporada asc, numero asc.
  await unwrap(
    dbAdmin.from('episodio').insert([
      {
        serie_id: serieIdPorSlug[slugDe(1)],
        temporada: 2,
        numero: 1,
        titulo: 'Estreno T2',
        video_id: `adm-t2e1-${runId}`
      },
      {
        serie_id: serieIdPorSlug[slugDe(1)],
        temporada: 1,
        numero: 2,
        titulo: 'Segundo',
        video_id: `adm-t1e2-${runId}`
      },
      {
        serie_id: serieIdPorSlug[slugDe(1)],
        temporada: 1,
        numero: 1,
        titulo: 'Piloto',
        video_id: `adm-t1e1-${runId}`
      }
    ])
  )
}, 60_000)

afterAll(async () => {
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
  await unwrap(dbAdmin.from('serie').delete().like('slug', `adm-%${runId}`))
  await unwrap(dbAdmin.from('canal').delete().like('handle', `adm-canal-%${runId}`))
  await unwrap(dbAdmin.from('categoria').delete().like('slug', `cat-adm-%${runId}`))
})

describe('getRolUsuario (D10)', () => {
  it('devuelve el rol de la fila usuario', async () => {
    expect(await getRolUsuario(clientMod, modId)).toBe('mod')
    expect(await getRolUsuario(clientUser, userId)).toBe('user')
  })

  it('id sin fila en usuario → null', async () => {
    expect(await getRolUsuario(clientMod, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})

describe('requireMod (ADM-04)', () => {
  it('mod pasa el guard', async () => {
    await expect(requireMod(clientMod, { id: modId })).resolves.toBeUndefined()
  })

  it('user → notFound()', async () => {
    await expect(requireMod(clientUser, { id: userId })).rejects.toMatchObject({
      digest: DIGEST_NOT_FOUND
    })
  })

  it('sin sesión → notFound()', async () => {
    await expect(requireMod(clientMod, null)).rejects.toMatchObject({
      digest: DIGEST_NOT_FOUND
    })
  })
})

describe('listSeriesPendientes (ADM-01)', () => {
  it('mod: solo pendientes, en orden FIFO (created_at asc)', async () => {
    const pendientes = await listSeriesPendientes(clientMod)
    expect(pendientes.map((s) => s.slug)).toEqual([slugDe(2), slugDe(4)])
    expect(pendientes[0].titulo).toBe('Serie ADM Dos')
    expect(pendientes[0].moderation_status).toBe('pendiente')
    expect(pendientes[0].categoria?.slug).toBe(`cat-adm-${runId}`)
  })

  // M3: serie_select_public usa `using (true)` — la lectura de pendientes es
  // pública; la protección del panel es requireMod en la UI (documentado en
  // lib/admin.ts). El user ve los mismos datos que el mod.
  it('user: la lectura pública de M3 también devuelve las pendientes', async () => {
    const pendientes = await listSeriesPendientes(clientUser)
    expect(pendientes.map((s) => s.slug)).toEqual([slugDe(2), slugDe(4)])
  })
})

describe('listTodasSeries (ADM-01)', () => {
  it('mod: todas las series con su estado, created_at desc', async () => {
    const todas = await listTodasSeries(clientMod)
    expect(todas.map((s) => s.slug)).toEqual([slugDe(4), slugDe(3), slugDe(2), slugDe(1)])
    expect(todas.map((s) => s.moderation_status)).toEqual([
      'pendiente',
      'rechazada',
      'pendiente',
      'aprobada'
    ])
  })
})

describe('getSerieParaEditar (ADM-06)', () => {
  it('devuelve la serie con categoria, canales y episodios ordenados', async () => {
    const serie = await getSerieParaEditar(clientMod, slugDe(1))
    expect(serie).not.toBeNull()
    if (!serie) return
    expect(serie.titulo).toBe('Serie ADM Uno')
    expect(serie.slug).toBe(slugDe(1))
    expect(serie.moderation_status).toBe('aprobada')
    expect(serie.categoria?.slug).toBe(`cat-adm-${runId}`)

    expect(serie.canales.map((c) => `${c.nombre}:${c.rol}`)).toEqual([
      'Canal ADM Dos:invitado',
      'Canal ADM Uno:principal'
    ])
    expect(serie.canales[1].canal_id).toBeTruthy()
    expect(serie.canales[1].handle).toBe(`adm-canal-uno-${runId}`)

    // Insertados fuera de orden → temporada asc, numero asc.
    expect(serie.episodios.map((e) => `${e.temporada}x${e.numero} ${e.titulo}`)).toEqual([
      '1x1 Piloto',
      '1x2 Segundo',
      '2x1 Estreno T2'
    ])
    expect(serie.episodios[0].id).toBeTruthy()
    expect(serie.episodios[0].video_id).toBe(`adm-t1e1-${runId}`)
  })

  it('slug inexistente → null', async () => {
    expect(await getSerieParaEditar(clientMod, `adm-noexiste-${runId}`)).toBeNull()
  })
})

describe('listCanales (select del formulario)', () => {
  it('devuelve todos los canales ordenados por nombre', async () => {
    const canales = await listCanales()
    expect(canales.map((c) => c.nombre)).toEqual(['Canal ADM Dos', 'Canal ADM Uno'])
    expect(canales[1].handle).toBe(`adm-canal-uno-${runId}`)
    expect(canales[1].avatar_url).toBeNull()
    expect(canales[0].avatar_url).toContain('img.youtube.com')
  })
})

// Al final a propósito: estos tests mutan el moderation_status del fixture y
// los describe anteriores dependen del estado inicial.
describe('moderación (ADM-02/ADM-03)', () => {
  it('aprobarSerie con mod → moderation_status aprobada', async () => {
    await aprobarSerie(clientMod, slugDe(2))
    const fila = await unwrap(
      dbAdmin.from('serie').select('moderation_status').eq('slug', slugDe(2)).single()
    )
    expect(fila.moderation_status).toBe('aprobada')
  })

  it('rechazarSerie con mod → moderation_status rechazada', async () => {
    await rechazarSerie(clientMod, slugDe(4))
    const fila = await unwrap(
      dbAdmin.from('serie').select('moderation_status').eq('slug', slugDe(4)).single()
    )
    expect(fila.moderation_status).toBe('rechazada')
  })

  it('aprobarSerie con user → denegado por RLS (0 filas → error, estado intacto)', async () => {
    await expect(aprobarSerie(clientUser, slugDe(3))).rejects.toThrow(
      ERRORES_ADMIN.serieNoEncontrada
    )
    const fila = await unwrap(
      dbAdmin.from('serie').select('moderation_status').eq('slug', slugDe(3)).single()
    )
    expect(fila.moderation_status).toBe('rechazada')
  })

  it('aprobarSerie con anon → denegado (sin grant de escritura)', async () => {
    await expect(aprobarSerie(db, slugDe(1))).rejects.toThrow(
      /permission denied|row-level security/i
    )
    const fila = await unwrap(
      dbAdmin.from('serie').select('moderation_status').eq('slug', slugDe(1)).single()
    )
    expect(fila.moderation_status).toBe('aprobada')
  })

  it('aprobarSerie slug inexistente → error', async () => {
    await expect(aprobarSerie(clientMod, `adm-noexiste-${runId}`)).rejects.toThrow(
      ERRORES_ADMIN.serieNoEncontrada
    )
  })
})
