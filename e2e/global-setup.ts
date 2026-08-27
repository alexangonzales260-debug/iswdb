import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient
} from '@supabase/supabase-js'

const execFileAsync = promisify(execFile)

// Claves públicas de desarrollo local de Supabase (no son secretos:
// las imprime `supabase status` y son iguales en todo proyecto local).
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const TEST_PASSWORD = 'test-password-123'

// e2e-01..08 → minecraft · e2e-09..15 → gta · e2e-16 → gta (pendiente).
// 15 aprobadas (2 páginas de 12) + 1 pendiente que no debe aparecer.
export const FIXTURE = {
  categorias: [
    { nombre: 'Minecraft', slug: 'minecraft' },
    { nombre: 'GTA', slug: 'gta' }
  ],
  // Filas uniformes (bulk insert de PostgREST): avatar_url presente en todas.
  // F005: Canal Tres solo participa en la pendiente e2e-16 → su ficha es 404.
  canales: [
    { nombre: 'Canal Uno', handle: '@canal-uno', avatar_url: null },
    {
      nombre: 'Canal Dos',
      handle: '@canal-dos',
      avatar_url: 'https://img.youtube.com/vi/canaldos/avatar.jpg'
    },
    { nombre: 'Canal Tres', handle: '@canal-tres', avatar_url: null }
  ],
  totalSeries: 16,
  slugPendiente: 'e2e-16',
  heroSlug: 'e2e-10',
  participa: {
    '@canal-uno': ['e2e-02', 'e2e-05', 'e2e-09', 'e2e-13'],
    '@canal-dos': ['e2e-01', 'e2e-09'],
    '@canal-tres': ['e2e-16']
  },
  // Roles explícitos (F005): el resto de participaciones queda en el
  // default 'colaborador' de la BD.
  roles: {
    'e2e-09': { '@canal-uno': 'principal' }
  } as Record<string, Record<string, string>>,
  // Ficha (F004): e2e-01 con 2 temporadas · e2e-10 con 1 episodio ·
  // e2e-02 sin episodios (empty state). video_ids estables para los tests.
  ficha: {
    slugDosTemporadas: 'e2e-01',
    slugSinEpisodios: 'e2e-02',
    playlistUrl: 'https://www.youtube.com/playlist?list=PLe2e0000000000001',
    videoIds: {
      'e2e-01-t1e1': 'e2e01t01e001',
      'e2e-01-t1e2': 'e2e01t01e002',
      'e2e-01-t2e1': 'e2e01t02e001',
      'e2e-10-t1e1': 'e2e10t01e001'
    }
  }
} as const

export function slugSerie(n: number): string {
  return `e2e-${String(n).padStart(2, '0')}`
}

function categoriaDe(n: number): string {
  return n <= 8 ? 'minecraft' : 'gta'
}

async function unwrap<T>(p: PromiseLike<PostgrestSingleResponse<T>>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

export async function createAuthUser(email: string): Promise<string> {
  // GoTrue en frío (tras db reset) puede responder 554 en las primeras llamadas.
  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true })
    })
    if (res.ok) {
      const user = (await res.json()) as { id: string }
      return user.id
    }
    lastError = `(${res.status}): ${await res.text()}`
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  throw new Error(`GoTrue admin: no se pudo crear usuario ${lastError}`)
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  })
  if (!res.ok) {
    console.warn(`GoTrue admin: no se pudo borrar usuario de test ${userId} (${res.status})`)
  }
}

// El endpoint /admin/users de GoTrue local (CLI 2.115.0) está roto: los
// usuarios con email_change NULL (los del seed, insertados por SQL directo)
// hacen fallar el scan de GoTrue ("converting NULL to string is unsupported")
// → 500 en cualquier listado. Por eso los usuarios registrados vía UI se
// limpian directamente en Postgres; la FK cascade cubre public.usuario y
// valoracion (mismo mecanismo que deleteAuthUser vía API).
const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function deleteAuthUserByEmail(email: string): Promise<void> {
  const emailEscapado = email.replaceAll("'", "''")
  try {
    await execFileAsync('psql', [
      DB_URL,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `delete from auth.users where email = '${emailEscapado}'`
    ])
  } catch (error) {
    console.warn(`psql: no se pudo borrar usuario de test ${email}: ${(error as Error).message}`)
  }
}

async function wipe(db: SupabaseClient): Promise<void> {
  await unwrap(db.from('valoracion').delete().not('id', 'is', null))
  await unwrap(db.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(db.from('episodio').delete().not('id', 'is', null))
  await unwrap(db.from('serie').delete().not('id', 'is', null))
  await unwrap(db.from('canal').delete().not('id', 'is', null))
  await unwrap(db.from('categoria').delete().not('id', 'is', null))
}

async function seed(db: SupabaseClient): Promise<string[]> {
  const runId = Date.now()
  const userIds: string[] = []
  for (const i of [1, 2]) {
    userIds.push(await createAuthUser(`e2e-u${i}-${runId}@iswdb.local`))
  }
  await unwrap(db.from('usuario').insert(userIds.map((id) => ({ id }))))

  const categorias = await unwrap(
    db.from('categoria').insert([...FIXTURE.categorias]).select('id, slug')
  )
  const catIdPorSlug = Object.fromEntries(categorias.map((c) => [c.slug, c.id]))

  const canales = await unwrap(db.from('canal').insert([...FIXTURE.canales]).select('id, handle'))
  const canalIdPorHandle = Object.fromEntries(canales.map((c) => [c.handle, c.id]))

  // Filas uniformes: en el bulk insert PostgREST toma las columnas del primer
  // objeto; keys ausentes en el resto serían NULL (no default). e2e-01
  // ejercita la ficha completa (FIC-01).
  const filasSerie = Array.from({ length: FIXTURE.totalSeries }, (_, i) => {
    const n = i + 1
    return {
      titulo: `Serie e2e ${n}`,
      slug: slugSerie(n),
      categoria_id: catIdPorSlug[categoriaDe(n)],
      moderation_status: n === FIXTURE.totalSeries ? 'pendiente' : 'aprobada',
      // F005: e2e-02 con 2025 hace observable el orden de la filmografía
      // (anio_inicio desc) en el E2E de la ficha de canal.
      anio_inicio: n === 2 ? 2025 : 2024,
      created_at: new Date(Date.UTC(2026, 3, n)).toISOString(),
      descripcion: n === 1 ? 'Serie de pruebas para la ficha: dos temporadas y reparto.' : null,
      estado: n === 1 ? 'finalizada' : 'activa',
      anio_fin: n === 1 ? 2025 : null,
      playlist_url: n === 1 ? FIXTURE.ficha.playlistUrl : null
    }
  })
  const series = await unwrap(db.from('serie').insert(filasSerie).select('id, slug'))
  const serieIdPorSlug = Object.fromEntries(series.map((s) => [s.slug, s.id]))

  const filasParticipa = Object.entries(FIXTURE.participa).flatMap(([handle, slugs]) =>
    slugs.map((slug) => ({
      serie_id: serieIdPorSlug[slug],
      canal_id: canalIdPorHandle[handle],
      rol: FIXTURE.roles[slug]?.[handle] ?? 'colaborador'
    }))
  )
  await unwrap(db.from('participa').insert(filasParticipa))

  const [u1, u2] = userIds
  const notasPorSerie: Record<string, [string, number][]> = {
    // e2e-10: AVG 9.5 → hero · e2e-04: 8.0 · e2e-13: 6.5
    'e2e-10': [
      [u1, 10],
      [u2, 9]
    ],
    'e2e-04': [[u1, 8]],
    'e2e-13': [
      [u1, 7],
      [u2, 6]
    ],
    // e2e-16 (pendiente) tiene nota alta a propósito: debe quedar excluida.
    'e2e-16': [[u1, 10]]
  }
  const filasValoracion = Object.entries(notasPorSerie).flatMap(([slug, notas]) =>
    notas.map(([userId, nota]) => ({ user_id: userId, serie_id: serieIdPorSlug[slug], nota }))
  )
  await unwrap(db.from('valoracion').insert(filasValoracion))

  // Episodios para la ficha (FIC-02): e2e-01 con 2 temporadas insertadas
  // fuera de orden (verifica agrupación y ordenamiento en lib/) · e2e-10 con
  // 1 episodio · e2e-02 sin episodios (empty state). El cleanup cascada desde
  // serie (on delete cascade).
  const { videoIds } = FIXTURE.ficha
  const filasEpisodio = [
    {
      serie_id: serieIdPorSlug[slugSerie(1)],
      temporada: 2,
      numero: 1,
      titulo: 'Estreno de la segunda temporada',
      video_id: videoIds['e2e-01-t2e1']
    },
    {
      serie_id: serieIdPorSlug[slugSerie(1)],
      temporada: 1,
      numero: 2,
      titulo: 'Segundo episodio',
      video_id: videoIds['e2e-01-t1e2']
    },
    {
      serie_id: serieIdPorSlug[slugSerie(1)],
      temporada: 1,
      numero: 1,
      titulo: 'Piloto',
      video_id: videoIds['e2e-01-t1e1']
    },
    {
      serie_id: serieIdPorSlug[slugSerie(10)],
      temporada: 1,
      numero: 1,
      titulo: 'Episodio único',
      video_id: videoIds['e2e-10-t1e1']
    }
  ]
  await unwrap(db.from('episodio').insert(filasEpisodio))

  return userIds
}

async function cleanup(db: SupabaseClient, userIds: string[]): Promise<void> {
  // Borrar las series cascada participa/valoracion/episodio.
  await unwrap(db.from('serie').delete().like('slug', 'e2e-%'))
  await unwrap(db.from('categoria').delete().in('slug', FIXTURE.categorias.map((c) => c.slug)))
  await unwrap(db.from('canal').delete().like('handle', '@canal-%'))
  await unwrap(db.from('usuario').delete().in('id', userIds))
  for (const id of userIds) {
    await deleteAuthUser(id)
  }
}

export default async function globalSetup() {
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Fail fast (D12): sin BD local no hay E2E.
  const { error } = await db.from('categoria').select('id').limit(1)
  if (error) {
    throw new Error(`E2E: BD local no disponible → ejecuta supabase start (${error.message})`)
  }

  await wipe(db)
  const userIds = await seed(db)

  return async () => {
    try {
      await cleanup(db, userIds)
    } catch (error) {
      console.warn(`E2E cleanup falló: ${(error as Error).message}`)
    }
  }
}
