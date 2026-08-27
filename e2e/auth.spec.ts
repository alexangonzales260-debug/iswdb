import { expect, test } from '@playwright/test'

import {
  createAuthUser,
  deleteAuthUser,
  deleteAuthUserByEmail,
  TEST_PASSWORD
} from './global-setup'

// Usuarios únicos por ejecución: EMAIL_FLUJO se registra vía UI en el test 1;
// EMAIL_LOGIN lo crea la API de admin para los tests de login/AUTH-05/AUTH-06.
const RUN_ID = Date.now()
const EMAIL_FLUJO = `e2e-auth-flujo-${RUN_ID}@iswdb.local`
const PASSWORD_FLUJO = 'e2e-auth-password-123'
const EMAIL_LOGIN = `e2e-auth-login-${RUN_ID}@iswdb.local`

let loginUserId: string

test.beforeAll(async () => {
  // GoTrue ya está templado por el global-setup (fixture del catálogo).
  loginUserId = await createAuthUser(EMAIL_LOGIN)
})

test.afterAll(async () => {
  await deleteAuthUserByEmail(EMAIL_FLUJO)
  await deleteAuthUser(loginUserId)
})

// Flujo completo en un único test: las cookies de sesión solo viven dentro
// del contexto de un test(), así que registro → login → perfil → logout
// comparten contexto aquí (workers=1 ya serializa el archivo).
test('flujo completo: registro → perfil → logout → login → perfil', async ({ page }) => {
  // Header anónimo (AUTH-09).
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Cuenta' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Registro' })).toBeVisible()

  // Registro (AUTH-01).
  await page.goto('/registro')
  await page.getByLabel('Email').fill(EMAIL_FLUJO)
  await page.getByLabel('Contraseña').fill(PASSWORD_FLUJO)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  // Perfil: confirmación + datos + empty state de valoraciones (AUTH-03).
  await page.waitForURL(/\/perfil\?bienvenida=1/)
  await expect(page.getByText('Cuenta creada correctamente')).toBeVisible()
  await expect(page.locator('dd').filter({ hasText: EMAIL_FLUJO })).toBeVisible()
  await expect(page.getByText('User', { exact: true })).toBeVisible()
  await expect(page.getByText('Aún no has valorado ninguna serie')).toBeVisible()

  // Logout → home con header anónimo (AUTH-04).
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.waitForURL(/\/$/)
  await expect(page.getByRole('navigation', { name: 'Cuenta' })).toBeVisible()

  // Login con las mismas credenciales → perfil con email en el header.
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL_FLUJO)
  await page.getByLabel('Contraseña').fill(PASSWORD_FLUJO)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil/)
  await expect(page.getByRole('link', { name: EMAIL_FLUJO })).toBeVisible()
})

test('login incorrecto: error visible sin salir de /login (AUTH-02)', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL_LOGIN)
  await page.getByLabel('Contraseña').fill('password-incorrecto-1')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()

  // Acotado al form: el route announcer de Next.js también tiene role="alert".
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'Email o contraseña incorrectos'
  )
  await expect(page).toHaveURL(/\/login/)
})

test('/perfil sin sesión redirige a /login conservando la ruta (AUTH-06)', async ({ page }) => {
  await page.goto('/perfil')
  await page.waitForURL(/\/login\?next=%2Fperfil/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})

test('AUTH-05: /login y /registro con sesión redirigen a /perfil', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL_LOGIN)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
  // La página renderiza datos (defensa: un /perfil con página de error no cuela).
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()

  await page.goto('/login')
  await page.waitForURL(/\/perfil$/)

  await page.goto('/registro')
  await page.waitForURL(/\/perfil$/)
})

test('AUTH-06: /login con msg y next muestra banner y vuelve a la ruta', async ({ page }) => {
  await page.goto('/login?msg=Debes iniciar sesión para valorar&next=/series')
  await expect(page.getByRole('status')).toHaveText('Debes iniciar sesión para valorar')

  await page.getByLabel('Email').fill(EMAIL_LOGIN)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/series$/)
})
