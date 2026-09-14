import { expect, test, type Page } from '@playwright/test'
import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient
} from '@supabase/supabase-js'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  slugSerie,
  TEST_PASSWORD,
  usernameDesdeEmail
} from './global-setup'

// F026 · T4: E2E de notificaciones de comentarios en reseñas.
//
// A (autor de reseña) y B (comentarista) se crean vía createAuthUserWithUsuario.
// Setup: reseña pública de A en e2e-01 insertada por service-role.
// Flujos:
//   1. B comenta la reseña de A → A ve "<usernameB> comentó tu reseña en
//      Serie e2e 1" con link → click navega a /resenas/<id>#comentario-<id> y
//      el comentario con su contenido es visible (anchor hace scroll).
//   2. B comenta de nuevo → A ve 2 notificaciones (NOTC-04).
//   3. A comenta su propia reseña → sin notificación nueva (NOTC-03; el conteo
//      sigue en 2).
//   4. Marcar leída → badge del header actualiza/desaparece.
// afterAll: deleteAuthUserByEmail de A y B (cascade cubre comentario, reseña
// y notificaciones).

const RUN_ID = Date.now()
const EMAIL_A = `e2e-nc-a-${RUN_ID}@iswdb.local`
const EMAIL_B = `e2e-nc-b-${RUN_ID}@iswdb.local`

const RESEÑA_A =
  'Reseña E2E para notificaciones de comentarios: una opinión amplia y con detalles sobre la serie de prueba.'
const COM_B_1 =
  'Primer comentario E2E de B: la reseña me ha parecido muy completa y bien argumentada.'
const COM_B_2 =
  'Segundo comentario E2E de B: añado otra perspectiva sobre la serie.'
const COM_A =
  'Comentario E2E de A sobre su propia reseña: agradezco los comentarios.'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

async function unwrap<T>(p: PromiseLike<PostgrestSingleResponse<T>>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

let userAId: string
let userBId: string
let usernameA: string
let usernameB: string
let reseñaAId: string

test.beforeAll(async () => {
  userAId = await createAuthUserWithUsuario(EMAIL_A)
  userBId = await createAuthUserWithUsuario(EMAIL_B)
  usernameA = usernameDesdeEmail(EMAIL_A, userAId)
  usernameB = usernameDesdeEmail(EMAIL_B, userBId)

  const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const serie1 = (await unwrap(
    db.from('serie').select('id').eq('slug', slugSerie(1)).single()
  )) as { id: string }

  reseñaAId = (
    (await unwrap(
      db
        .from('reseña')
        .insert({ user_id: userAId, serie_id: serie1.id, contenido: RESEÑA_A })
        .select('id')
        .single()
    )) as { id: string }
  ).id
})

test.afterAll(async () => {
  await deleteAuthUserByEmail(EMAIL_B)
  await deleteAuthUserByEmail(EMAIL_A)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil/)
}

test.describe('Notificaciones de comentarios (NC)', () => {
  test('NC-01: B comenta reseña de A → notificación con MessageSquareText y link al anchor', async ({
    page
  }) => {
    // B comenta la reseña de A.
    await login(page, EMAIL_B)
    await page.goto(`/resenas/${reseñaAId}`)
    await page.getByPlaceholder('Escribe un comentario…').fill(COM_B_1)
    await page.getByRole('button', { name: 'Comentar', exact: true }).click()
    await expect(page.getByText(COM_B_1)).toBeVisible()

    // Logout de B → login de A.
    await page.getByRole('button', { name: 'Salir' }).click()
    await page.waitForURL(/\/$/)
    await login(page, EMAIL_A)

    // Badge del header con ≥1 notificación.
    await page.goto('/')
    await expect(page.getByLabel(/notificaciones sin leer/)).toBeVisible()

    // /perfil/notificaciones: ítem con MessageSquareText y texto esperado.
    await page.goto('/perfil/notificaciones')
    const item = page.locator('li').filter({
      hasText: new RegExp(`${usernameB} comentó tu reseña en Serie e2e 1`)
    })
    await expect(item).toHaveCount(1)
    await expect(item.locator('svg.lucide-message-square-text')).toBeVisible()

    // Link del username de B apunta a su perfil.
    const linkUsername = item.getByRole('link', { name: usernameB })
    await expect(linkUsername).toHaveAttribute('href', `/usuarios/${usernameB}`)

    // Link de "Serie e2e 1" apunta a /resenas/<id>#comentario-<id>.
    const linkSerie = item.getByRole('link', { name: 'Serie e2e 1' })
    const href = await linkSerie.getAttribute('href')
    expect(href).toMatch(/^\/resenas\/[a-f0-9-]+#comentario-[a-f0-9-]+$/)

    // Click en el link → navega a la reseña con el anchor.
    await linkSerie.click()
    await page.waitForURL(new RegExp(`/resenas/${reseñaAId}#comentario-`))

    // El comentario de B es visible (anchor hace scroll).
    await expect(page.getByText(COM_B_1)).toBeVisible()
    await expect(page.getByRole('link', { name: usernameB })).toBeVisible()
  })

  test('NC-02: B comenta de nuevo → A ve 2 notificaciones (NOTC-04)', async ({ page }) => {
    // B comenta de nuevo.
    await login(page, EMAIL_B)
    await page.goto(`/resenas/${reseñaAId}`)
    await page.getByPlaceholder('Escribe un comentario…').fill(COM_B_2)
    await page.getByRole('button', { name: 'Comentar', exact: true }).click()
    await expect(page.getByText(COM_B_2)).toBeVisible()

    // Logout de B → login de A.
    await page.getByRole('button', { name: 'Salir' }).click()
    await page.waitForURL(/\/$/)
    await login(page, EMAIL_A)

    // /perfil/notificaciones: 2 ítems de comentarios.
    await page.goto('/perfil/notificaciones')
    const items = page.locator('li').filter({
      hasText: new RegExp(`${usernameB} comentó tu reseña en Serie e2e 1`)
    })
    await expect(items).toHaveCount(2)
  })

  test('NC-03: A comenta su propia reseña → sin notificación nueva (conteo sigue en 2)', async ({
    page
  }) => {
    await login(page, EMAIL_A)
    await page.goto(`/resenas/${reseñaAId}`)
    await page.getByPlaceholder('Escribe un comentario…').fill(COM_A)
    await page.getByRole('button', { name: 'Comentar', exact: true }).click()
    await expect(page.getByText(COM_A)).toBeVisible()

    // /perfil/notificaciones: sigue habiendo solo 2 notificaciones de comentarios.
    await page.goto('/perfil/notificaciones')
    const items = page.locator('li').filter({
      hasText: new RegExp(`${usernameB} comentó tu reseña en Serie e2e 1`)
    })
    await expect(items).toHaveCount(2)

    // El comentario de A NO genera notificación.
    await expect(
      page.locator('li').filter({ hasText: new RegExp(`${usernameA} comentó`) })
    ).toHaveCount(0)
  })

  test('NC-04: marcar leída → badge desaparece', async ({ page }) => {
    await login(page, EMAIL_A)

    // Verificar badge.
    await page.goto('/')
    await expect(page.getByLabel(/notificaciones sin leer/)).toBeVisible()

    // Marcar todas como leídas.
    await page.goto('/perfil/notificaciones')
    await page.getByRole('button', { name: 'Marcar todas como leídas' }).click()
    await expect(
      page.getByRole('button', { name: 'Marcar como leída' })
    ).toHaveCount(0)

    // Badge desaparece.
    await page.goto('/')
    await expect(page.getByLabel(/notificaciones sin leer/)).toHaveCount(0)
  })
})
