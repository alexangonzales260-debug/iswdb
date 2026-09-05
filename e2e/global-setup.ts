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

export function usernameDesdeEmail(email: string, userId: string): string {
  const base =
    (email.split('@')[0] ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 13) || 'usuario'
  return `${base}-${userId.replaceAll('-', '').slice(0, 6)}`
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

// F014 (T4): extrae el link de recuperación del correo en Mailpit. Hace poll
// con timeout porque GoTrue puede tardar en enviar el correo. El link que
// genera GoTrue apunta al endpoint verify del API (…/auth/v1/verify?token=…&
// type=recovery&redirect_to=…): al abrirlo, GoTrue redirige al browser a
// /auth/reset#access_token=… (rebautizado por el callback). Lo extraemos del
// body HTML del email (href de "Reset password").
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

export async function getRecoveryLink(email: string): Promise<string> {
  for (let intento = 1; intento <= 30; intento++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
    )
    const data = (await res.json()) as { messages?: { ID: string; Subject: string }[] }
    const reset = (data.messages ?? []).find((m) => m.Subject === 'Reset your password')
    if (reset) {
      const detalleRes = await fetch(`${MAILPIT_URL}/api/v1/message/${reset.ID}`)
      const detalle = (await detalleRes.json()) as { HTML?: string }
      const href = detalle.HTML?.match(/href="([^"]*)"/)
      if (href?.[1]) {
        return href[1].replaceAll('&amp;', '&')
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`getRecoveryLink: no se encontró correo de recuperación para ${email}`)
}

// F015 (T7): extrae el link de confirmación de cambio de email del correo en
// Mailpit (poll con timeout, igual que getRecoveryLink). El correo de GoTrue
// tiene subject "Confirm your new email address" y apunta al endpoint verify
// (…/auth/v1/verify?token=…&type=email_change&redirect_to=…): al abrirlo,
// GoTrue confirma el cambio de email y redirige al browser a redirect_to.
export async function getEmailChangeLink(email: string): Promise<string> {
  for (let intento = 1; intento <= 30; intento++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
    )
    const data = (await res.json()) as { messages?: { ID: string; Subject: string }[] }
    const change = (data.messages ?? []).find(
      (m) => m.Subject === 'Confirm your new email address'
    )
    if (change) {
      const detalleRes = await fetch(`${MAILPIT_URL}/api/v1/message/${change.ID}`)
      const detalle = (await detalleRes.json()) as { HTML?: string }
      const href = detalle.HTML?.match(/href="([^"]*)"/)
      if (href?.[1]) {
        return href[1].replaceAll('&amp;', '&')
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`getEmailChangeLink: no se encontró correo de cambio de email para ${email}`)
}

// F009 (T5): usuario E2E con fila en public.usuario. createAuthUser solo crea
// el auth user; la FK de valoracion exige la fila de usuario, y el flujo de
// valorar no visita /perfil (cuyo self-healing la crearía). El email se
// desnormaliza en la fila (M6): RES-08 lo muestra truncado como autor de
// reseñas.
export async function createAuthUserWithUsuario(email: string): Promise<string> {
  const userId = await createAuthUser(email)
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  await unwrap(
    db.from('usuario').insert({ id: userId, email, username: usernameDesdeEmail(email, userId) })
  )
  return userId
}

// F010 (T6): usuario mod E2E = auth user + fila en public.usuario con rol
// 'mod' (RLS is_admin_or_mod, D10) y email (M6). Password: TEST_PASSWORD.
export async function createModUser(email: string): Promise<string> {
  const userId = await createAuthUser(email)
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  await unwrap(
    db.from('usuario').insert({
      id: userId,
      rol: 'mod',
      email,
      username: usernameDesdeEmail(email, userId)
    })
  )
  return userId
}

// F010 (T6, riesgo 5): restauración del fixture desde admin.spec.ts. El
// cliente service-role evita RLS; la actualización es idempotente.
export async function setModerationStatus(slug: string, moderationStatus: string): Promise<void> {
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  await unwrap(db.from('serie').update({ moderation_status: moderationStatus }).eq('slug', slug))
}

// F010 (T6): borrado de las series creadas por el E2E de admin; la FK
// cascada cubre participa, episodio y valoracion.
export async function deleteSeriesBySlugLike(slugPattern: string): Promise<void> {
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  await unwrap(db.from('serie').delete().like('slug', slugPattern))
}

// F012 (T4): id del usuario por email (service-role). Para limpiar en
// afterAll un usuario registrado vía UI (registro → login → reseña), cuyo id
// no se conoce de antemano. Se consulta public.usuario (M6 desnormalizó el
// email; usuario.id == auth.users.id) en vez del admin de GoTrue, cuyo
// listUsers paginado falla en el stack local.
export async function getUserIdByEmail(email: string): Promise<string | null> {
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const fila = await db.from('usuario').select('id').eq('email', email).maybeSingle()
  if (fila.error) throw new Error(`getUserIdByEmail: ${fila.error.message}`)
  return fila.data?.id ?? null
}

async function wipe(db: SupabaseClient): Promise<void> {
  // reseña primero (F012): depende de usuario y serie.
  await unwrap(db.from('reseña').delete().not('id', 'is', null))
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
  const emails = [`e2e-u1-${runId}@iswdb.local`, `e2e-u2-${runId}@iswdb.local`]
  for (const email of emails) {
    userIds.push(await createAuthUser(email))
  }
  await unwrap(
    db.from('usuario').insert(userIds.map((id, i) => ({ id, username: usernameDesdeEmail(emails[i], id) })))
  )

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
