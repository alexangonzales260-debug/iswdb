import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// lib/valoraciones.ts importa lib/auth.ts (AuthClient) y lib/supabase.ts, que
// lanzan si faltan env vars (fail fast); vi.hoisted define las vars antes de
// los imports.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import {
  eliminarValoracion,
  ERRORES_VALORACION,
  getDistribucionNotas,
  getValoracionUsuario,
  valorarSerie
} from '@/lib/valoraciones'
import type { Database } from '@/types/database'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap } from './env'

requireLocalDb()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const TEST_PASSWORD = 'test-password-123'

let runId: number
// Borrar cada auth user casca en cascada su fila de public.usuario y sus
// valoraciones (FK on delete cascade); las series se borran por slug.
const createdAuthUserIds: string[] = []

let userA: string
let clientA: SupabaseClient<Database>
let serieAprobadaId: string
let seriePendienteId: string
let serieHistogramaId: string
const histUserIds: string[] = []

function slugDe(nombre: string): string {
  return `val-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `val-test-${nombre}-${runId}@iswdb.local`
}

// Cliente plano tipado (sin cookies): la sesión vive en memoria del cliente
// (persistSession: false), patrón de tests/db/auth.test.ts.
function nuevoCliente(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

async function clienteConSesion(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = nuevoCliente()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`GoTrue: login falló para ${email}: ${error.message}`)
  return client
}

// Crea auth user + fila public.usuario (FK necesaria para valorar) y devuelve
// el id. El login se hace aparte cuando se necesita cliente con sesión.
async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(dbAdmin.from('usuario').insert({ id: userId, rol: 'user' }))
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  // GoTrue en frío (tras supabase start/reset) puede fallar en las primeras
  // llamadas: se templa creando y borrando un usuario vía admin API.
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  // Categoría + 3 series: aprobada (escritura), pendiente (VAL-07) e
  // histograma (lecturas agregadas).
  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Val Cat ${runId}`, slug: slugDe('cat') })
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
          titulo: 'Serie Val Aprobada',
          slug: slugDe('aprobada'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        },
        {
          titulo: 'Serie Val Pendiente',
          slug: slugDe('pendiente'),
          categoria_id: categoria.id,
          moderation_status: 'pendiente'
        },
        {
          titulo: 'Serie Val Histograma',
          slug: slugDe('histograma'),
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        }
      ])
      .select('id, slug, moderation_status')
  )
  const porSlug = Object.fromEntries(series.map((s) => [s.slug, s]))
  serieAprobadaId = porSlug[slugDe('aprobada')].id
  seriePendienteId = porSlug[slugDe('pendiente')].id
  serieHistogramaId = porSlug[slugDe('histograma')].id

  // Usuario principal con sesión para las pruebas de escritura.
  userA = await crearUsuario('escritor')
  clientA = await clienteConSesion(emailDe('escritor'), TEST_PASSWORD)

  // Usuarios para el histograma (solo necesitan existir en public.usuario).
  for (const nombre of ['hist-1', 'hist-2', 'hist-3']) {
    histUserIds.push(await crearUsuario(nombre))
  }
  // Histograma seed: 10, 10, 7 → dos dieces y un siete.
  await unwrap(
    dbAdmin.from('valoracion').insert([
      { user_id: histUserIds[0], serie_id: serieHistogramaId, nota: 10 },
      { user_id: histUserIds[1], serie_id: serieHistogramaId, nota: 10 },
      { user_id: histUserIds[2], serie_id: serieHistogramaId, nota: 7 }
    ])
  )
}, 120_000)

afterAll(async () => {
  try {
    // Borrar las series casca en cascada sus valoraciones.
    await unwrap(
      dbAdmin
        .from('serie')
        .delete()
        .in('slug', [slugDe('aprobada'), slugDe('pendiente'), slugDe('histograma')])
    )
    await unwrap(dbAdmin.from('categoria').delete().eq('slug', slugDe('cat')))
    await unwrap(dbAdmin.from('usuario').delete().in('id', createdAuthUserIds))
  } catch (error) {
    console.warn(`Cleanup de tests/db/valoraciones.test.ts falló: ${(error as Error).message}`)
  }
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('valorarSerie (VAL-01, upsert)', () => {
  it('crea la valoración si no existe (upsert insert)', async () => {
    await valorarSerie(clientA, slugDe('aprobada'), 8)

    expect(await getValoracionUsuario(serieAprobadaId, userA)).toBe(8)
    const filas = await unwrap(
      dbAdmin
        .from('valoracion')
        .select('nota')
        .eq('serie_id', serieAprobadaId)
        .eq('user_id', userA)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].nota).toBe(8)
  }, 30_000)

  it('cambia la nota si ya existe (upsert update, no duplica)', async () => {
    await valorarSerie(clientA, slugDe('aprobada'), 5)

    expect(await getValoracionUsuario(serieAprobadaId, userA)).toBe(5)
    const filas = await unwrap(
      dbAdmin
        .from('valoracion')
        .select('nota')
        .eq('serie_id', serieAprobadaId)
        .eq('user_id', userA)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].nota).toBe(5)
  }, 30_000)

  it('nota fuera de 1-10 → error de validación y no escribe', async () => {
    await expect(valorarSerie(clientA, slugDe('aprobada'), 0)).rejects.toThrow(
      ERRORES_VALORACION.notaInvalida
    )
    await expect(valorarSerie(clientA, slugDe('aprobada'), 11)).rejects.toThrow(
      ERRORES_VALORACION.notaInvalida
    )
    await expect(valorarSerie(clientA, slugDe('aprobada'), 5.5)).rejects.toThrow(
      ERRORES_VALORACION.notaInvalida
    )
    // La nota previa (5) no cambia.
    expect(await getValoracionUsuario(serieAprobadaId, userA)).toBe(5)
  }, 30_000)

  it('serie NO aprobada → rechazo server-side (VAL-07)', async () => {
    await expect(valorarSerie(clientA, slugDe('pendiente'), 8)).rejects.toThrow(
      ERRORES_VALORACION.serieNoAprobada
    )
    const filas = await unwrap(
      dbAdmin.from('valoracion').select('nota').eq('serie_id', seriePendienteId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('slug inexistente → error serie no encontrada', async () => {
    await expect(valorarSerie(clientA, slugDe('no-existe'), 8)).rejects.toThrow(
      ERRORES_VALORACION.serieNoEncontrada
    )
  }, 30_000)

  it('sin sesión → error (requireUser implícito)', async () => {
    const anonimo = nuevoCliente()
    await expect(valorarSerie(anonimo, slugDe('aprobada'), 8)).rejects.toThrow(
      ERRORES_VALORACION.sinSesion
    )
  }, 30_000)
})

describe('eliminarValoracion (VAL-02)', () => {
  it('borra la valoración existente', async () => {
    // userA tiene nota 5 de la serie aprobada (describe anterior).
    expect(await getValoracionUsuario(serieAprobadaId, userA)).toBe(5)

    await eliminarValoracion(clientA, slugDe('aprobada'))
    expect(await getValoracionUsuario(serieAprobadaId, userA)).toBeNull()
  }, 30_000)

  it('sin valoración previa → idempotente, no falla', async () => {
    await expect(eliminarValoracion(clientA, slugDe('aprobada'))).resolves.toBeUndefined()
    expect(await getValoracionUsuario(serieAprobadaId, userA)).toBeNull()
  }, 30_000)

  it('slug inexistente → error serie no encontrada', async () => {
    await expect(eliminarValoracion(clientA, slugDe('no-existe'))).rejects.toThrow(
      ERRORES_VALORACION.serieNoEncontrada
    )
  }, 30_000)
})

describe('lecturas de ficha (cliente anon, D11)', () => {
  it('getDistribucionNotas: histograma 10→1 con conteos y ceros', async () => {
    const distribucion = await getDistribucionNotas(serieHistogramaId)

    expect(distribucion).toHaveLength(10)
    // Orden nota desc: 10, 9, ..., 1.
    expect(distribucion.map((d) => d.nota)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(distribucion[0]).toEqual({ nota: 10, count: 2 })
    expect(distribucion.find((d) => d.nota === 7)).toEqual({ nota: 7, count: 1 })
    // Ocho notas sin valoraciones → count 0.
    expect(distribucion.filter((d) => d.count === 0)).toHaveLength(8)
  })

  it('getDistribucionNotas: serie sin valoraciones → 10 ceros', async () => {
    const distribucion = await getDistribucionNotas(serieAprobadaId)
    expect(distribucion).toHaveLength(10)
    expect(distribucion.every((d) => d.count === 0)).toBe(true)
  })

  it('getValoracionUsuario: nota actual del usuario', async () => {
    expect(await getValoracionUsuario(serieHistogramaId, histUserIds[0])).toBe(10)
    expect(await getValoracionUsuario(serieHistogramaId, histUserIds[2])).toBe(7)
  })

  it('getValoracionUsuario: null si el usuario no ha valorado', async () => {
    expect(await getValoracionUsuario(serieHistogramaId, userA)).toBeNull()
  })
})
