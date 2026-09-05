import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// getPerfilPublico usa createServiceRoleClient (lib/supabase.ts), que exige
// NEXT_PUBLIC_SUPABASE_* Y SUPABASE_SERVICE_ROLE_KEY; vi.hoisted se ejecuta
// antes de los imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

import { getPerfilPublico } from '@/lib/perfil-publico'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap, usernameDesdeEmail } from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
let userActivo: string
let userVacio: string
let usernameActivo: string
let emailActivo: string
const createdAuthUserIds: string[] = []

function slugDe(n: number): string {
  return `pp-${String(n).padStart(2, '0')}-${runId}`
}

// Limpieza inicial: catálogo vacío + seed propio (patrón actividad.test.ts).
beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('reseña').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('lista_serie').delete().not('lista_id', 'is', null))
  await unwrap(dbAdmin.from('lista').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('usuario_serie').delete().not('usuario_id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('canal').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('categoria').delete().not('id', 'is', null))

  runId = Date.now()
  emailActivo = `pp-activo-${runId}@iswdb.local`
  userActivo = await createTestUser(emailActivo, TEST_PASSWORD)
  userVacio = await createTestUser(`pp-vacio-${runId}@iswdb.local`, TEST_PASSWORD)
  createdAuthUserIds.push(userActivo, userVacio)
  usernameActivo = usernameDesdeEmail(emailActivo, userActivo)
  await unwrap(
    dbAdmin.from('usuario').insert([
      { id: userActivo, username: usernameActivo },
      { id: userVacio, username: usernameDesdeEmail(`pp-vacio-${runId}@iswdb.local`, userVacio) }
    ])
  )

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-pp-${runId}`, slug: `cat-pp-${runId}` })
      .select('id')
      .single()
  )

  // 3 series: 1 y 2 aprobadas; 3 pendiente (debe excluirse siempre).
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        { titulo: 'Serie PP Uno', slug: slugDe(1), categoria_id: categoria.id, moderation_status: 'aprobada' },
        { titulo: 'Serie PP Dos', slug: slugDe(2), categoria_id: categoria.id, moderation_status: 'aprobada' },
        { titulo: 'Serie PP No Aprobada', slug: slugDe(3), categoria_id: categoria.id, moderation_status: 'pendiente' }
      ])
      .select('id, slug')
  )
  const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))
  const s1 = serieIdPorSlug[slugDe(1)]
  const s2 = serieIdPorSlug[slugDe(2)]
  const s3 = serieIdPorSlug[slugDe(3)]

  // Valoraciones: 2 aprobadas (orden creadas desc explícito) + 1 no aprobada.
  await unwrap(
    dbAdmin.from('valoracion').insert([
      { user_id: userActivo, serie_id: s1, nota: 8, created_at: '2026-01-05T10:00:00+00' },
      { user_id: userActivo, serie_id: s2, nota: 5, created_at: '2026-03-05T10:00:00+00' },
      { user_id: userActivo, serie_id: s3, nota: 3, created_at: '2026-02-05T10:00:00+00' }
    ])
  )

  // Reseñas: 1 aprobada (mínimo 50 chars) + 1 no aprobada.
  await unwrap(
    dbAdmin.from('reseña').insert([
      {
        user_id: userActivo,
        serie_id: s1,
        contenido: 'Reseña pública del usuario activo sobre la serie aprobada con detalle suficiente.',
        created_at: '2026-02-10T10:00:00+00'
      },
      {
        user_id: userActivo,
        serie_id: s3,
        contenido: 'Reseña sobre una serie no aprobada que no debe aparecer en el perfil público jamás.',
        created_at: '2026-04-10T10:00:00+00'
      }
    ])
  )

  // Seguidas: 2 aprobadas (orden desc explícito) + 1 no aprobada.
  await unwrap(
    dbAdmin.from('usuario_serie').insert([
      { usuario_id: userActivo, serie_id: s1, created_at: '2026-01-01T10:00:00+00' },
      { usuario_id: userActivo, serie_id: s2, created_at: '2026-02-01T10:00:00+00' },
      { usuario_id: userActivo, serie_id: s3, created_at: '2026-03-01T10:00:00+00' }
    ])
  )

  // Listas: 1 pública con 2 series + 1 privada con 1 serie.
  const listas = await unwrap(
    dbAdmin
      .from('lista')
      .insert([
        { user_id: userActivo, nombre: 'Mi lista pública', descripcion: 'Series que me gustan', es_publica: true },
        { user_id: userActivo, nombre: 'Mi lista privada', descripcion: null, es_publica: false }
      ])
      .select('id, es_publica')
  )
  const listaPublica = listas.find((l) => l.es_publica)!.id
  const listaPrivada = listas.find((l) => !l.es_publica)!.id
  await unwrap(
    dbAdmin.from('lista_serie').insert([
      { lista_id: listaPublica, serie_id: s1, posicion: 1 },
      { lista_id: listaPublica, serie_id: s2, posicion: 2 },
      { lista_id: listaPrivada, serie_id: s3, posicion: 1 }
    ])
  )
}, 60_000)

afterAll(async () => {
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
  await unwrap(dbAdmin.from('serie').delete().like('slug', `pp-%${runId}`))
  await unwrap(dbAdmin.from('categoria').delete().like('slug', `cat-pp-%${runId}`))
})

describe('getPerfilPublico (F021)', () => {
  it('perfil existente devuelve los datos públicos', async () => {
    const perfil = await getPerfilPublico(usernameActivo)

    expect(perfil).not.toBeNull()
    expect(perfil!.usuario).toEqual({
      username: usernameActivo,
      display_name: null,
      created_at: expect.any(String)
    })

    expect(perfil!.seguidas.map((s) => s.serie.slug)).toEqual([slugDe(2), slugDe(1)])
    expect(perfil!.valoraciones.map((v) => ({ slug: v.serie.slug, nota: v.nota }))).toEqual([
      { slug: slugDe(2), nota: 5 },
      { slug: slugDe(1), nota: 8 }
    ])
    expect(perfil!.resenasPublicas).toHaveLength(1)
    expect(perfil!.resenasPublicas[0].serie.slug).toBe(slugDe(1))
    expect(perfil!.listasPublicas.map((l) => ({ nombre: l.nombre, numSeries: l.numSeries }))).toEqual([
      { nombre: 'Mi lista pública', numSeries: 2 }
    ])
  })

  it('username inexistente → null', async () => {
    const perfil = await getPerfilPublico(`no-existe-${runId}`)
    expect(perfil).toBeNull()
  })

  it('el retorno NO contiene el email del usuario', async () => {
    const perfil = await getPerfilPublico(usernameActivo)
    expect(perfil).not.toBeNull()
    expect(JSON.stringify(perfil)).not.toContain(emailActivo)
  })

  it('series no aprobadas excluidas de seguidas, valoraciones y reseñas', async () => {
    const perfil = await getPerfilPublico(usernameActivo)
    expect(perfil).not.toBeNull()

    expect(perfil!.seguidas.map((s) => s.serie.slug)).not.toContain(slugDe(3))
    expect(perfil!.valoraciones.map((v) => v.serie.slug)).not.toContain(slugDe(3))
    expect(perfil!.resenasPublicas.map((r) => r.serie.slug)).not.toContain(slugDe(3))
  })

  it('listas privadas excluidas', async () => {
    const perfil = await getPerfilPublico(usernameActivo)
    expect(perfil).not.toBeNull()
    expect(perfil!.listasPublicas.map((l) => l.nombre)).toEqual(['Mi lista pública'])
  })

  it('usuario sin actividad → arrays vacíos', async () => {
    const perfil = await getPerfilPublico(usernameDesdeEmail(`pp-vacio-${runId}@iswdb.local`, userVacio))
    expect(perfil).not.toBeNull()
    expect(perfil!.seguidas).toEqual([])
    expect(perfil!.valoraciones).toEqual([])
    expect(perfil!.resenasPublicas).toEqual([])
    expect(perfil!.listasPublicas).toEqual([])
  })
})