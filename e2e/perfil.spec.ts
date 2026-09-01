import { expect, test, type Page } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  getEmailChangeLink,
  TEST_PASSWORD
} from './global-setup'

// F015 · T7: E2E de edición de perfil.
//
// Flujo completo en un único test() porque las cookies de sesión solo viven
// dentro del contexto de un test (workers=1 ya serializa el archivo). El
// usuario se crea vía API (createAuthUserWithUsuario), no por registro por UI.
// afterAll borra el auth user vía psql (deleteAuthUserByEmail); la FK cascade
// cubre public.usuario → valoracion/reseña.

const RUN_ID = Date.now()
const EMAIL_FLUJO = `e2e-perfil-flujo-${RUN_ID}@iswdb.local`
const EMAIL_NUEVO = `e2e-perfil-nuevo-${RUN_ID}@iswdb.local`
const PASSWORD_NUEVA = 'e2e-perfil-nueva-456'
const DISPLAY_NAME = 'Perfil E2E'

test.beforeAll(async () => {
  await createAuthUserWithUsuario(EMAIL_FLUJO)
})

test.afterAll(async () => {
  await deleteAuthUserByEmail(EMAIL_FLUJO)
  await deleteAuthUserByEmail(EMAIL_NUEVO)
})

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

test('PER flujo completo: display_name → password → email', async ({ page }) => {
  // 1) Login con la password inicial → /perfil.
  await login(page, EMAIL_FLUJO, TEST_PASSWORD)
  await page.waitForURL(/\/perfil$/)
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()

  // 2) Cambiar display_name → visible en "Datos de la cuenta".
  const formNombre = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Cambiar nombre' })
  })
  await formNombre.getByLabel('Nuevo nombre de usuario').fill(DISPLAY_NAME)
  await formNombre.getByRole('button', { name: 'Cambiar nombre' }).click()
  await expect(formNombre.getByRole('status')).toHaveText('Nombre mostrado actualizado')
  await expect(page.locator('dd').filter({ hasText: DISPLAY_NAME })).toBeVisible()

  // 3) Cambiar password (reauth con la actual) → logout → login con la nueva.
  const formPassword = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Cambiar password' })
  })
  await formPassword.getByLabel('Contraseña actual').fill(TEST_PASSWORD)
  await formPassword
    .getByLabel('Nueva contraseña', { exact: true })
    .fill(PASSWORD_NUEVA)
  await formPassword
    .getByLabel('Confirmar nueva contraseña', { exact: true })
    .fill(PASSWORD_NUEVA)
  await formPassword.getByRole('button', { name: 'Cambiar password' }).click()
  await expect(formPassword.getByRole('status')).toHaveText(
    'Contraseña actualizada correctamente'
  )

  await page.getByRole('button', { name: 'Salir' }).click()
  await page.waitForURL(/\/$/)
  await login(page, EMAIL_FLUJO, PASSWORD_NUEVA)
  await page.waitForURL(/\/perfil$/)
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()

  // 4) Cambiar email → confirmar vía Mailpit → logout → login con el nuevo.
  const formEmail = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Cambiar email' })
  })
  await formEmail.getByLabel('Nuevo email').fill(EMAIL_NUEVO)
  await formEmail.getByRole('button', { name: 'Cambiar email' }).click()
  await expect(formEmail.getByRole('status')).toHaveText(
    'Te hemos enviado un link de confirmación al nuevo email'
  )

  // Abrir el link de confirmación (verifica el cambio en GoTrue y redirige al
  // origin de la app), igual que getRecoveryLink en F014.
  const linkEmail = await getEmailChangeLink(EMAIL_NUEVO)
  await page.goto(linkEmail)
  await page.waitForURL((url) => url.origin === 'http://127.0.0.1:3000')

  await page.getByRole('button', { name: 'Salir' }).click()
  await page.waitForURL(/\/$/)
  await login(page, EMAIL_NUEVO, PASSWORD_NUEVA)
  await page.waitForURL(/\/perfil$/)
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
})

test('PER-06: /perfil sin sesión redirige a /login conservando la ruta', async ({ page }) => {
  await page.goto('/perfil')
  await page.waitForURL(/\/login\?next=%2Fperfil/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})
