import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// lib/supabase.ts lanza si faltan env vars (fail fast); vi.hoisted se ejecuta
// antes que los imports, así el módulo se carga con las vars ya definidas.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import { getCanalByHandle, rolDestacado } from '@/lib/canales'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap } from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

const CATEGORIA = { nombre: 'Ficha Canal', slug: 'ficha-canal' }

const CANALES = [
  {
    nombre: 'Canal FC Uno',
    handle: '@iswdb-fc-uno',
    avatar_url: 'https://img.youtube.com/vi/fcuno/avatar.jpg'
  },
  { nombre: 'Canal FC Dos', handle: '@iswdb-fc-dos', avatar_url: null },
  { nombre: 'Canal FC Tres', handle: '@iswdb-fc-tres', avatar_url: null },
  { nombre: 'Canal FC Cuatro', handle: '@iswdb-fc-cuatro', avatar_url: null }
]

// anio_inicio/estado variados para ejercitar el orden CAN-01:
// 2024 activas (fc-02 sin notas, fc-03 con 8.0) → 2024 finalizada (fc-04) →
// 2023 (fc-01) → anio null (fc-05). fc-06 es pendiente: nunca debe aparecer.
const FILAS_SERIE = [
  {
    titulo: 'Serie FC 1',
    slug: 'fc-01',
    anio_inicio: 2023,
    anio_fin: 2024,
    estado: 'finalizada',
    moderation_status: 'aprobada',
    created_at: '2026-01-01T00:00:00.000Z'
  },
  {
    titulo: 'Serie FC 2',
    slug: 'fc-02',
    anio_inicio: 2024,
    anio_fin: null,
    estado: 'activa',
    moderation_status: 'aprobada',
    created_at: '2026-01-02T00:00:00.000Z'
  },
  {
    titulo: 'Serie FC 3',
    slug: 'fc-03',
    anio_inicio: 2024,
    anio_fin: null,
    estado: 'activa',
    moderation_status: 'aprobada',
    created_at: '2026-01-03T00:00:00.000Z'
  },
  {
    titulo: 'Serie FC 4',
    slug: 'fc-04',
    anio_inicio: 2024,
    anio_fin: 2025,
    estado: 'finalizada',
    moderation_status: 'aprobada',
    created_at: '2026-01-04T00:00:00.000Z'
  },
  {
    titulo: 'Serie FC 5',
    slug: 'fc-05',
    anio_inicio: null,
    anio_fin: null,
    estado: 'activa',
    moderation_status: 'aprobada',
    created_at: '2026-01-05T00:00:00.000Z'
  },
  {
    titulo: 'Serie FC 6',
    slug: 'fc-06',
    anio_inicio: 2024,
    anio_fin: null,
    estado: 'activa',
    moderation_status: 'pendiente',
    created_at: '2026-01-06T00:00:00.000Z'
  }
]

// '@iswdb-fc-dos' solo participa en la pendiente fc-06 → ficha 404 (CAN-03).
// '@iswdb-fc-tres' no participa en nada → ficha 404 (CAN-03).
// '@iswdb-fc-cuatro' acompaña en fc-03: la tarjeta conserva todos los canales.
const PARTICIPA: { handle: string; slug: string; rol: string }[] = [
  { handle: '@iswdb-fc-uno', slug: 'fc-01', rol: 'principal' },
  { handle: '@iswdb-fc-uno', slug: 'fc-02', rol: 'colaborador' },
  { handle: '@iswdb-fc-uno', slug: 'fc-03', rol: 'invitado' },
  { handle: '@iswdb-fc-uno', slug: 'fc-04', rol: 'colaborador' },
  { handle: '@iswdb-fc-uno', slug: 'fc-05', rol: 'invitado' },
  { handle: '@iswdb-fc-dos', slug: 'fc-06', rol: 'colaborador' },
  { handle: '@iswdb-fc-cuatro', slug: 'fc-03', rol: 'colaborador' }
]

// Limpieza inicial: deja el catálogo vacío para los tests de handle sin datos.
beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('canal').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('categoria').delete().not('id', 'is', null))
})

describe('getCanalByHandle con BD vacía (cliente anon, RLS de lectura pública)', () => {
  it('handle inexistente → null', async () => {
    expect(await getCanalByHandle('@no-existe')).toBeNull()
  })
})

describe('getCanalByHandle con datos (cliente anon, RLS de lectura pública)', () => {
  const createdAuthUserIds: string[] = []

  beforeAll(async () => {
    const runId = Date.now()
    for (const i of [1, 2]) {
      createdAuthUserIds.push(await createTestUser(`fc-u${i}-${runId}@iswdb.local`, TEST_PASSWORD))
    }
    await unwrap(dbAdmin.from('usuario').insert(createdAuthUserIds.map((id) => ({ id }))))

    const categorias = await unwrap(dbAdmin.from('categoria').insert(CATEGORIA).select('id, slug'))
    const categoriaId = categorias[0].id

    const canales = await unwrap(dbAdmin.from('canal').insert(CANALES).select('id, handle'))
    const canalIdPorHandle = Object.fromEntries(canales.map((c) => [c.handle, c.id]))

    const filasSerie = FILAS_SERIE.map((fila) => ({
      ...fila,
      categoria_id: categoriaId,
      descripcion: null,
      portada_url: null,
      playlist_url: null
    }))
    const series = await unwrap(dbAdmin.from('serie').insert(filasSerie).select('id, slug'))
    const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))

    const filasParticipa = PARTICIPA.map((p) => ({
      serie_id: serieIdPorSlug[p.slug],
      canal_id: canalIdPorHandle[p.handle],
      rol: p.rol
    }))
    await unwrap(dbAdmin.from('participa').insert(filasParticipa))

    const [u1, u2] = createdAuthUserIds
    const notasPorSerie: Record<string, [string, number][]> = {
      'fc-01': [
        [u1, 9],
        [u2, 9]
      ],
      'fc-03': [[u1, 8]],
      'fc-04': [[u1, 10]],
      // fc-06 (pendiente) tiene nota alta a propósito: debe quedar excluida.
      'fc-06': [[u1, 10]]
    }
    const filasValoracion = Object.entries(notasPorSerie).flatMap(([slug, notas]) =>
      notas.map(([userId, nota]) => ({ user_id: userId, serie_id: serieIdPorSlug[slug], nota }))
    )
    await unwrap(dbAdmin.from('valoracion').insert(filasValoracion))
  }, 120_000)

  afterAll(async () => {
    try {
      // Borrar las series cascada participa/valoracion/episodio.
      await unwrap(dbAdmin.from('serie').delete().like('slug', 'fc-%'))
      await unwrap(dbAdmin.from('categoria').delete().eq('slug', CATEGORIA.slug))
      await unwrap(dbAdmin.from('canal').delete().like('handle', '@iswdb-fc-%'))
      await unwrap(dbAdmin.from('usuario').delete().in('id', createdAuthUserIds))
    } catch (error) {
      console.warn(`Cleanup de tests/lib/canales.test.ts falló: ${(error as Error).message}`)
    }
    for (const id of createdAuthUserIds) {
      await deleteTestUser(id)
    }
  })

  it('ficha completa de @iswdb-fc-uno: campos del canal y orden CAN-01', async () => {
    const canal = await getCanalByHandle('@iswdb-fc-uno')
    expect(canal?.nombre).toBe('Canal FC Uno')
    expect(canal?.handle).toBe('@iswdb-fc-uno')
    expect(canal?.avatar_url).toBe('https://img.youtube.com/vi/fcuno/avatar.jpg')
    // anio desc (null al final) → activas antes que finalizadas → rating desc.
    expect(canal?.series.map((s) => s.serie.slug)).toEqual([
      'fc-03',
      'fc-02',
      'fc-04',
      'fc-01',
      'fc-05'
    ])
  })

  it('rol del canal en cada serie de la filmografía', async () => {
    const canal = await getCanalByHandle('@iswdb-fc-uno')
    expect(canal?.series.map((s) => s.rol)).toEqual([
      'invitado',
      'colaborador',
      'colaborador',
      'principal',
      'invitado'
    ])
  })

  it('cada serie trae rating, categoria, estado y anio correctos', async () => {
    const canal = await getCanalByHandle('@iswdb-fc-uno')
    const porSlug = Object.fromEntries(canal!.series.map((s) => [s.serie.slug, s.serie]))

    expect(porSlug['fc-03'].rating).toEqual({ average: 8, count: 1 })
    expect(porSlug['fc-02'].rating).toBeNull()
    expect(porSlug['fc-04'].rating).toEqual({ average: 10, count: 1 })
    expect(porSlug['fc-01'].rating).toEqual({ average: 9, count: 2 })
    expect(porSlug['fc-05'].rating).toBeNull()

    for (const slug of ['fc-01', 'fc-02', 'fc-03', 'fc-04', 'fc-05']) {
      expect(porSlug[slug].categoria).toEqual({ nombre: 'Ficha Canal', slug: 'ficha-canal' })
    }

    expect(porSlug['fc-03'].estado).toBe('activa')
    expect(porSlug['fc-04'].estado).toBe('finalizada')
    expect(porSlug['fc-01'].anio_inicio).toBe(2023)
    expect(porSlug['fc-05'].anio_inicio).toBeNull()
  })

  it('fc-03 conserva todos sus canales en la tarjeta', async () => {
    const canal = await getCanalByHandle('@iswdb-fc-uno')
    const fc03 = canal?.series.find((s) => s.serie.slug === 'fc-03')?.serie
    expect(fc03?.canales).toHaveLength(2)
    expect(fc03?.canales).toEqual(
      expect.arrayContaining([
        { nombre: 'Canal FC Uno', handle: '@iswdb-fc-uno' },
        { nombre: 'Canal FC Cuatro', handle: '@iswdb-fc-cuatro' }
      ])
    )
  })

  it('rolDestacado: mayor jerarquía presente en la filmografía', async () => {
    const canal = await getCanalByHandle('@iswdb-fc-uno')
    expect(rolDestacado(canal!.series)).toBe('principal')
    expect(rolDestacado(canal!.series.filter((s) => s.rol !== 'principal'))).toBe('colaborador')
    expect(rolDestacado([])).toBeNull()
  })

  it('canal con solo series pendientes → null', async () => {
    expect(await getCanalByHandle('@iswdb-fc-dos')).toBeNull()
  })

  it('canal sin participaciones → null', async () => {
    expect(await getCanalByHandle('@iswdb-fc-tres')).toBeNull()
  })

  it('handle inexistente → null', async () => {
    expect(await getCanalByHandle('@no-existe')).toBeNull()
  })
})
