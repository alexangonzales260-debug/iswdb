import { expect, test, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  createAuthUserWithUsuario,
  createModUser,
  deleteAuthUser,
  TEST_PASSWORD,
} from './global-setup'

// ── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const RUN_ID = Date.now()
const EMAIL_USER = `e2e-ing-user-${RUN_ID}@iswdb.local`
const EMAIL_MOD = `e2e-ing-mod-${RUN_ID}@iswdb.local`

let userUserId: string
let modUserId: string
let serieId: string

// ── Setup / Teardown ─────────────────────────────────────────────────────────

test.beforeAll(async () => {
  userUserId = await createAuthUserWithUsuario(EMAIL_USER)
  modUserId = await createModUser(EMAIL_MOD)

  const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Resolve minecraft category id for the test series.
  const { data: cat } = await db
    .from('categoria')
    .select('id')
    .eq('slug', 'minecraft')
    .single()
  if (!cat) throw new Error('Categoria minecraft no encontrada')

  // Create a dedicated series for this test (no shared fixture modification).
  // playlist_url is intentionally left null: the YouTube API call is made
  // server-side by Node.js, not from the browser, so Playwright's route
  // interception cannot mock it. Without playlist_url the endpoint returns
  // 200 with empty results, which is enough to verify session auth.
  const { data: nuevaSerie } = await db
    .from('serie')
    .insert({
      titulo: `Serie Ingesta E2E ${RUN_ID}`,
      slug: `serie-ingesta-e2e-${RUN_ID}`,
      categoria_id: cat.id,
      moderation_status: 'aprobada',
      estado: 'activa',
      // Null playlist_url → no YouTube call → deterministic result.
  // La idempotencia real (UNIQUE 23505) se prueba en
  // tests/lib/ingesta-episodios.test.ts con proveedor falso de videos +
  // Supabase local real, sin tocar el endpoint.
      playlist_url: null,
    })
    .select('id')
    .single()

  if (!nuevaSerie) throw new Error('No se pudo crear la serie de prueba para ingesta')
  serieId = nuevaSerie.id
})

test.afterAll(async () => {
  const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Clean up any suggestions created by this test (should be none since
  // playlist_url is null, but defensive in case of parallel runs).
  await db.from('episodio_sugerencia').delete().eq('serie_id', serieId)

  // Cascade delete: series → participa, episodio, valoracion.
  await db.from('serie').delete().eq('id', serieId)

  await deleteAuthUser(userUserId)
  await deleteAuthUser(modUserId)
})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('sin autenticación → 401', async ({ page }) => {
  const response = await page.request.post('/api/ingesta-episodios')
  expect(response.status()).toBe(401)
  const body = await response.json()
  expect(body).toHaveProperty('error')
})

test('usuario normal sin sesión → 401', async ({ page }) => {
  // No login: request goes without cookies.
  const response = await page.request.post('/api/ingesta-episodios')
  expect(response.status()).toBe(401)
})

test('usuario normal con sesión activa → 401', async ({ page }) => {
  await login(page, EMAIL_USER)

  const response = await page.request.post('/api/ingesta-episodios')
  expect(response.status()).toBe(401)
  const body = await response.json()
  expect(body).toHaveProperty('error')
})

test('token Bearer inválido → 401', async ({ page }) => {
  // No session, only invalid token.
  const response = await page.request.post('/api/ingesta-episodios', {
    headers: { Authorization: 'Bearer invalid-token-value' },
  })
  expect(response.status()).toBe(401)
  const body = await response.json()
  expect(body).toHaveProperty('error')
})

test('mod con sesión activa acepta la petición y retorna resumen vacío (sin playlist_url)', async ({
  page,
}) => {
  await login(page, EMAIL_MOD)

  const response = await page.request.post('/api/ingesta-episodios')
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toHaveProperty('procesadas', 0)
  expect(body).toHaveProperty('creadas', 0)
  expect(body).toHaveProperty('omitidas', 0)
  expect(body).toHaveProperty('errores')
  expect(Array.isArray(body.errores)).toBe(true)
})

// ── Diagnóstico: idempotencia real probada en tests/lib/ingesta-episodios.test.ts
//
// La idempotencia (UNIQUE 23505) y la creación de sugerencias se prueban
// determinísticamente en el suite vitest con proveedor falso de videos y
// Supabase local real (ver ingestNuevosEpisodios — DB real, videos mock).
// Playwright no puede interceptar fetch() server-side desde Node.js, por lo
// que el E2E se limita a auth/autorización.
