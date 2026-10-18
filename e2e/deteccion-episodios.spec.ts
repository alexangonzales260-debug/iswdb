import { expect, test, type Page } from '@playwright/test'
import {
  createClient,
  type SupabaseClient
} from '@supabase/supabase-js'

import {
  createAuthUserWithUsuario,
  createModUser,
  deleteAuthUser,
  TEST_PASSWORD,
  slugSerie
} from './global-setup'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const RUN_ID = Date.now()
const EMAIL_USER = `e2e-sug-user-${RUN_ID}@iswdb.local`
const EMAIL_MOD = `e2e-sug-mod-${RUN_ID}@iswdb.local`

let userUserId: string
let modUserId: string
let sugerenciaIdAprobar: string
let sugerenciaIdRechazar: string

test.beforeAll(async () => {
  userUserId = await createAuthUserWithUsuario(EMAIL_USER)
  modUserId = await createModUser(EMAIL_MOD)

  const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: serie } = await db
    .from('serie')
    .select('id')
    .eq('slug', slugSerie(1))
    .single()
  if (!serie) throw new Error('Serie e2e-01 no encontrada en el seed')

  const { data: sug, error: sugError } = await db
    .from('episodio_sugerencia')
    .insert([
      {
        serie_id: serie.id,
        video_id_youtube: `vid-sug-1-${RUN_ID}`,
        titulo_detectado: 'S01E01 - Sugerencia 1',
        temporada_detectada: 3,
        numero_detectado: 1
      },
      {
        serie_id: serie.id,
        video_id_youtube: `vid-sug-2-${RUN_ID}`,
        titulo_detectado: 'S01E02 - Sugerencia 2',
        temporada_detectada: 3,
        numero_detectado: 2
      }
    ])
    .select('id')

  if (sugError) throw new Error(`No se pudieron crear las sugerencias: ${sugError.message}`)
  if (!sug || sug.length < 2) throw new Error('No se pudieron crear las sugerencias de prueba')

  ;[sugerenciaIdAprobar, sugerenciaIdRechazar] = sug.map((s) => s.id)
})

test.afterAll(async () => {
  // Limpieza defensiva: borra las sugerencias y episodios creados por este test
  // antes de los usuarios auth (el cascade de serie ya los habría limpiado,
  // pero este cleanup explícito evita huérfanos si la serie e2e-01 no existe).
  const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const ids = [sugerenciaIdAprobar, sugerenciaIdRechazar].filter(Boolean)
  if (ids.length > 0) {
    await db.from('episodio_sugerencia').delete().in('id', ids)
  }
  await db.from('episodio').delete().eq('video_id', `vid-sug-1-${RUN_ID}`)
  await db.from('episodio').delete().eq('video_id', `vid-sug-2-${RUN_ID}`)

  await deleteAuthUser(userUserId)
  await deleteAuthUser(modUserId)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
}

async function esperarAccion(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
}

test('usuario normal no puede ver /admin/sugerencias-episodios', async ({ page }) => {
  await login(page, EMAIL_USER)
  await page.goto('/admin/sugerencias-episodios')
  await expect(page.getByText('Página no encontrada')).toBeVisible()
})

test('mod aprueba y rechaza sugerencias', async ({ page }) => {
  await login(page, EMAIL_MOD)
  await page.goto('/admin/sugerencias-episodios')
  await esperarAccion(page)

  // Ve las sugerencias pendientes
  await expect(page.getByText('Sugerencia 1')).toBeVisible()
  await expect(page.getByText('Sugerencia 2')).toBeVisible()

  // Aprueba la primera
  await page
    .locator('li:has-text("Sugerencia 1")')
    .getByRole('button', { name: 'Aprobar' })
    .click()
  await esperarAccion(page)

  // Desaparece de la cola
  await expect(page.getByText('Sugerencia 1')).not.toBeVisible()
  await expect(page.getByText('Sugerencia 2')).toBeVisible()

  // El episodio aparece en la ficha pública de la serie
  await page.goto(`/series/${slugSerie(1)}`)
  await esperarAccion(page)
  await expect(page.getByText('S01E01 - Sugerencia 1')).toBeVisible()

  // Vuelve al panel y rechaza la segunda
  await page.goto('/admin/sugerencias-episodios')
  await esperarAccion(page)
  await page
    .locator('li:has-text("Sugerencia 2")')
    .getByRole('button', { name: 'Rechazar' })
    .click()
  await esperarAccion(page)

  // Desaparece de la cola
  await expect(page.getByText('Sugerencia 2')).not.toBeVisible()

  // La rechazada NO creó episodio: el único episodio con título "S01E01 - Sugerencia 1"
  // es el creado por la aprobación; "S01E02 - Sugerencia 2" no debe existir.
  await page.goto(`/series/${slugSerie(1)}`)
  await esperarAccion(page)
  await expect(page.getByText('S01E02 - Sugerencia 2')).not.toBeVisible()
})
