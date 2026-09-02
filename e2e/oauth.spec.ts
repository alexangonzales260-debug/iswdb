import { expect, test, type Page } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  TEST_PASSWORD
} from './global-setup'

// Feature 017 · T8: E2E de los botones de OAuth Google.
//
// NO se testea el flujo OAuth real con Google (requiere credenciales reales y
// flujo interactivo; se hace manualmente). Solo se verifica que el botón
// "Continuar con Google" existe y está habilitado en /login y /registro, y que
// el flujo email/password sigue intacto (regresión).
//
// El usuario se crea vía API (createAuthUserWithUsuario); afterAll borra el
// auth user vía psql (deleteAuthUserByEmail), la FK cascade cubre
// public.usuario → valoracion/reseña.

const RUN_ID = Date.now()
const EMAIL_FLUJO = `e2e-oauth-flujo-${RUN_ID}@iswdb.local`

test.afterAll(async () => {
  await deleteAuthUserByEmail(EMAIL_FLUJO)
})

async function verificarBotonesLogin(page: Page): Promise<void> {
  await page.goto('/login')
  await expect(page.getByText('O continúa con')).toBeVisible()
  const boton = page.getByRole('button', { name: /continuar con google/i })
  await expect(boton).toBeVisible()
  await expect(boton).toBeEnabled()
}

test('Botón Google visible en /login', async ({ page }) => {
  await verificarBotonesLogin(page)
})

test('Botón Google visible en /registro', async ({ page }) => {
  await page.goto('/registro')
  await expect(page.getByText('O continúa con')).toBeVisible()
  const boton = page.getByRole('button', { name: /continuar con google/i })
  await expect(boton).toBeVisible()
  await expect(boton).toBeEnabled()
})

// Regresión: el flujo email/password no se rompe por los botones de Google.
// Registro → login → perfil → logout → login, sin tocar el botón Google.
test('Regresión: flujo email/password intacto', async ({ page }) => {
  // Usuario creado vía API (no registro por UI) para el login/password.
  await createAuthUserWithUsuario(EMAIL_FLUJO)

  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL_FLUJO)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()

  await page.getByRole('button', { name: 'Salir' }).click()
  await page.waitForURL(/\/$/)
  await expect(page.getByRole('navigation', { name: 'Cuenta' })).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL_FLUJO)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
  await expect(page.getByRole('link', { name: EMAIL_FLUJO })).toBeVisible()
})
