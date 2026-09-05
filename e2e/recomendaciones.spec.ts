import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import {
  createAuthUserWithUsuario,
  deleteAuthUser,
  slugSerie,
  TEST_PASSWORD
} from './global-setup'

const RUN_ID = Date.now()
const EMAIL_RECOM = `e2e-rec-${RUN_ID}@iswdb.local`
// e2e-01 es del fixture ('minecraft'): seguirlo activa las recomendaciones de
// la misma categoría (e2e-02..08) con razón "Porque sigues Serie e2e 1".
const SLUG_FUENTE = slugSerie(1)

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const dbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

let recomUserId: string

test.beforeAll(async () => {
  // Usuario con fila en public.usuario (FK de usuario_serie) + follow a
  // e2e-01 vía service-role (el RLS own solo deja insertar la fila propia).
  recomUserId = await createAuthUserWithUsuario(EMAIL_RECOM)
  const { data: serie, error: errSerie } = await dbAdmin
    .from('serie')
    .select('id')
    .eq('slug', SLUG_FUENTE)
    .single()
  if (errSerie || !serie) throw new Error(`serie ${SLUG_FUENTE} no encontrada`)
  const { error: errFollow } = await dbAdmin.from('usuario_serie').insert({
    usuario_id: recomUserId,
    serie_id: serie.id
  })
  if (errFollow) throw new Error(`follow: ${errFollow.message}`)
})

test.afterAll(async () => {
  if (recomUserId) {
    await dbAdmin.from('usuario_serie').delete().eq('usuario_id', recomUserId)
  }
  if (recomUserId) await deleteAuthUser(recomUserId)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil/)
}

test.describe('Recomendaciones (REC)', () => {
  test('REC con sesión: home muestra "Recomendado para ti" con razón', async ({ page }) => {
    await login(page, EMAIL_RECOM)

    // Home → sección con el h2 aria-labelledby y tarjetas de la misma
    // categoría (grid 6) con la razón de la fuente seguida.
    await page.goto('/')
    const seccion = page.getByRole('region', { name: 'Recomendado para ti' })
    await expect(seccion).toBeVisible()
    await expect(seccion.getByRole('link', { name: 'Serie e2e 3' })).toBeVisible()
    await expect(seccion.getByText('Porque sigues Serie e2e 1').first()).toBeVisible()
  })

  test('REC-05 sin sesión: home NO muestra "Recomendado para ti"', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Recomendado para ti' })).toHaveCount(0)
  })

  test('REC-04 ficha: "Series similares" de la misma categoría sin la actual', async ({
    page
  }) => {
    await page.goto(`/series/${SLUG_FUENTE}`)
    const seccion = page.getByRole('region', { name: 'Series similares' })
    await expect(seccion).toBeVisible()
    await expect(seccion.getByRole('link', { name: 'Serie e2e 8' })).toBeVisible()
    await expect(seccion.getByRole('link', { name: 'Serie e2e 1' })).toHaveCount(0)
  })
})
