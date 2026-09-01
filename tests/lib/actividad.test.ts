import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import { listMisValoraciones, listMisReseñas, listMisPropuestas, calcularAgregados } from '@/lib/actividad'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap } from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
let userActivo: string
let userVacio: string
const createdAuthUserIds: string[] = []

function slugDe(n: number): string {
  return `act-${String(n).padStart(2, '0')}-${runId}`
}

// Limpieza inicial: catálogo vacío + seed propio
beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('reseña').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('lista_serie').delete().not('lista_id', 'is', null))
  await unwrap(dbAdmin.from('lista').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('canal').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('categoria').delete().not('id', 'is', null))

  runId = Date.now()
  userActivo = await createTestUser(`act-usuario-${runId}@iswdb.local`, TEST_PASSWORD)
  userVacio = await createTestUser(`act-vacio-${runId}@iswdb.local`, TEST_PASSWORD)
  createdAuthUserIds.push(userActivo, userVacio)
  await unwrap(
    dbAdmin.from('usuario').insert([{ id: userActivo }, { id: userVacio }])
  )

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-act-${runId}`, slug: `cat-act-${runId}` })
      .select('id')
      .single()
  )

  // 3 series aprobadas para valoraciones, reseñas, listas
  const titulosSeries = ['Serie Act Uno', 'Serie Act Dos', 'Serie Act Tres']
  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert(
        titulosSeries.map((titulo, i) => ({
          titulo,
          slug: slugDe(i + 1),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        }))
      )
      .select('id, slug')
  )
  const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))

  // 2 valoraciones del usuario activo (created_at explícitos para orden desc)
  await unwrap(
    dbAdmin.from('valoracion').insert([
      {
        user_id: userActivo,
        serie_id: serieIdPorSlug[slugDe(1)],
        nota: 8,
        created_at: '2026-01-05T10:00:00+00'
      },
      {
        user_id: userActivo,
        serie_id: serieIdPorSlug[slugDe(2)],
        nota: 5,
        created_at: '2026-03-05T10:00:00+00'
      }
    ])
  )

  // 2 reseñas del usuario activo (mínimo 50 chars)
  await unwrap(
    dbAdmin.from('reseña').insert([
      {
        user_id: userActivo,
        serie_id: serieIdPorSlug[slugDe(1)],
        contenido: 'Primera reseña del usuario activo, muy buena serie con mucho contenido interesante.',
        created_at: '2026-02-10T10:00:00+00'
      },
      {
        user_id: userActivo,
        serie_id: serieIdPorSlug[slugDe(2)],
        contenido: 'Segunda reseña, más reciente que la primera, también con contenido suficiente.',
        created_at: '2026-04-10T10:00:00+00'
      }
    ])
  )

  // 2 listas del usuario activo
  const listas = await unwrap(
    dbAdmin
      .from('lista')
      .insert([
        {
          user_id: userActivo,
          nombre: 'Mi lista favorita',
          descripcion: 'Series que me gustan',
          es_publica: true
        },
        {
          user_id: userActivo,
          nombre: 'Lista privada',
          descripcion: null,
          es_publica: false
        }
      ])
      .select('id')
  )
  const lista1Id = listas[0].id
  const lista2Id = listas[1].id

  // Añadir series a las listas
  await unwrap(
    dbAdmin.from('lista_serie').insert([
      { lista_id: lista1Id, serie_id: serieIdPorSlug[slugDe(1)], posicion: 1 },
      { lista_id: lista1Id, serie_id: serieIdPorSlug[slugDe(2)], posicion: 2 },
      { lista_id: lista2Id, serie_id: serieIdPorSlug[slugDe(3)], posicion: 1 }
    ])
  )

  // 3 propuestas del usuario activo: pendiente, aprobada, rechazada
  await unwrap(
    dbAdmin.from('serie').insert([
      {
        user_id: userActivo,
        titulo: 'Propuesta Pendiente',
        slug: `prop-pendiente-${runId}`,
        categoria_id: categoria.id,
        moderation_status: 'pendiente'
      },
      {
        user_id: userActivo,
        titulo: 'Propuesta Aprobada',
        slug: `prop-aprobada-${runId}`,
        categoria_id: categoria.id,
        moderation_status: 'aprobada'
      },
      {
        user_id: userActivo,
        titulo: 'Propuesta Rechazada',
        slug: `prop-rechazada-${runId}`,
        categoria_id: categoria.id,
        moderation_status: 'rechazada'
      }
    ])
  )
}, 60_000)

afterAll(async () => {
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
  await unwrap(dbAdmin.from('serie').delete().like('slug', `act-%${runId}`))
  await unwrap(dbAdmin.from('serie').delete().like('slug', `prop-%${runId}`))
  await unwrap(dbAdmin.from('categoria').delete().like('slug', `cat-act-%${runId}`))
})

describe('listMisValoraciones', () => {
  it('devuelve solo las valoraciones del usuario, orden created_at desc', async () => {
    const client = dbAdmin
    const propias = await listMisValoraciones(client, userActivo)
    expect(propias).toHaveLength(2)
    // La más reciente (2026-03) antes que la antigua (2026-01)
    expect(propias[0].serie.slug).toBe(slugDe(2))
    expect(propias[0].nota).toBe(5)
    expect(propias[1].serie.slug).toBe(slugDe(1))
    expect(propias[1].nota).toBe(8)
  })

  it('incluye el join con serie (titulo, slug, portada_url, categoria.nombre)', async () => {
    const client = dbAdmin
    const propias = await listMisValoraciones(client, userActivo)
    expect(propias[0].serie.titulo).toBe('Serie Act Dos')
    expect(propias[0].serie.slug).toBe(slugDe(2))
    expect(propias[0].serie.portada_url).toBeNull()
    expect(propias[0].serie.categoria?.nombre).toBe(`cat-act-${runId}`)
    expect(propias[1].serie.titulo).toBe('Serie Act Uno')
    expect(propias[1].serie.slug).toBe(slugDe(1))
    expect(propias[1].serie.categoria?.nombre).toBe(`cat-act-${runId}`)
  })

  it('otro usuario solo ve las suyas', async () => {
    const client = dbAdmin
    const propias = await listMisValoraciones(client, userVacio)
    expect(propias).toEqual([])
  })
})

describe('listMisReseñas', () => {
  it('devuelve solo las reseñas del usuario, orden created_at desc', async () => {
    const client = dbAdmin
    const propias = await listMisReseñas(client, userActivo)
    expect(propias).toHaveLength(2)
    // La más reciente (2026-04) antes que la antigua (2026-02)
    expect(propias[0].serie.slug).toBe(slugDe(2))
    expect(propias[0].contenido).toBe('Segunda reseña, más reciente que la primera, también con contenido suficiente.')
    expect(propias[1].serie.slug).toBe(slugDe(1))
    expect(propias[1].contenido).toBe('Primera reseña del usuario activo, muy buena serie con mucho contenido interesante.')
  })

  it('incluye el join con serie (titulo, slug)', async () => {
    const client = dbAdmin
    const propias = await listMisReseñas(client, userActivo)
    expect(propias[0].serie.titulo).toBe('Serie Act Dos')
    expect(propias[0].serie.slug).toBe(slugDe(2))
    expect(propias[1].serie.titulo).toBe('Serie Act Uno')
    expect(propias[1].serie.slug).toBe(slugDe(1))
  })

  it('usuario sin reseñas → lista vacía', async () => {
    const client = dbAdmin
    const propias = await listMisReseñas(client, userVacio)
    expect(propias).toEqual([])
  })
})

describe('listMisPropuestas', () => {
  it('filtra por user_id y moderation_status IN (pendiente, aprobada, rechazada)', async () => {
    const client = dbAdmin
    const propias = await listMisPropuestas(client, userActivo)
    expect(propias).toHaveLength(3)
    // Orden created_at desc (todas tienen mismo timestamp, orden por id desc por defecto)
    const statuses = propias.map((p) => p.moderation_status).sort()
    expect(statuses).toEqual(['aprobada', 'pendiente', 'rechazada'])
  })

  it('incluye slug solo si aprobada', async () => {
    const client = dbAdmin
    const propias = await listMisPropuestas(client, userActivo)
    const aprobada = propias.find((p) => p.moderation_status === 'aprobada')
    const pendiente = propias.find((p) => p.moderation_status === 'pendiente')
    const rechazada = propias.find((p) => p.moderation_status === 'rechazada')

    expect(aprobada).toBeDefined()
    expect(aprobada!.slug).toBe(`prop-aprobada-${runId}`)

    expect(pendiente).toBeDefined()
    expect(pendiente!.slug).toBeNull()

    expect(rechazada).toBeDefined()
    expect(rechazada!.slug).toBeNull()
  })

  it('usuario sin propuestas → lista vacía', async () => {
    const client = dbAdmin
    const propias = await listMisPropuestas(client, userVacio)
    expect(propias).toEqual([])
  })
})

describe('calcularAgregados', () => {
  it('calcula conteos exactos y promedio con 1 decimal', () => {
    const valoraciones = [
      { nota: 8, created_at: '2026-01-01', serie: { titulo: 'A', slug: 'a', portada_url: null, categoria: { nombre: 'Cat' } } },
      { nota: 6, created_at: '2026-01-02', serie: { titulo: 'B', slug: 'b', portada_url: null, categoria: { nombre: 'Cat' } } }
    ]
    const reseñas = [
      { id: '1', contenido: 'R1', created_at: '2026-01-01', serie: { titulo: 'A', slug: 'a' } },
      { id: '2', contenido: 'R2', created_at: '2026-01-02', serie: { titulo: 'B', slug: 'b' } }
    ]
    const listas = [
      { id: '1', nombre: 'L1', descripcion: null, es_publica: true, updated_at: '2026-01-01', numSeries: 2 },
      { id: '2', nombre: 'L2', descripcion: 'desc', es_publica: false, updated_at: '2026-01-02', numSeries: 1 }
    ]
    const propuestas = [
      { id: '1', titulo: 'P1', moderation_status: 'pendiente' as const, created_at: '2026-01-01', slug: null },
      { id: '2', titulo: 'P2', moderation_status: 'aprobada' as const, created_at: '2026-01-02', slug: 'p2' },
      { id: '3', titulo: 'P3', moderation_status: 'rechazada' as const, created_at: '2026-01-03', slug: null }
    ]

    const agg = calcularAgregados(valoraciones, reseñas, listas, propuestas)

    expect(agg.totalValoraciones).toBe(2)
    expect(agg.promedioDado).toBe(7.0) // (8+6)/2 = 7.0
    expect(agg.totalReseñas).toBe(2)
    expect(agg.totalListas).toBe(2)
    expect(agg.totalPropuestas).toBe(3)
  })

  it('promedioDado es null si 0 valoraciones', () => {
    const agg = calcularAgregados([], [], [], [])
    expect(agg.totalValoraciones).toBe(0)
    expect(agg.promedioDado).toBeNull()
    expect(agg.totalReseñas).toBe(0)
    expect(agg.totalListas).toBe(0)
    expect(agg.totalPropuestas).toBe(0)
  })

  it('promedio con un decimal correcto (p.ej. 7.5)', () => {
    const valoraciones = [
      { nota: 7, created_at: '2026-01-01', serie: { titulo: 'A', slug: 'a', portada_url: null, categoria: { nombre: 'Cat' } } },
      { nota: 8, created_at: '2026-01-02', serie: { titulo: 'B', slug: 'b', portada_url: null, categoria: { nombre: 'Cat' } } }
    ]
    const agg = calcularAgregados(valoraciones, [], [], [])
    expect(agg.promedioDado).toBe(7.5)
  })
})