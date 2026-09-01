import { expect, test, type Page } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  getRecoveryLink
} from './global-setup'

// F014 · T4: E2E de recuperación de password.
//
// Orden alfabético entre archivos: recuperacion.spec.ts corre entre
// propuestas y resenas. Usuarios únicos por ejecución (RUN_ID). El flujo
// completo va en un único test() porque las cookies de sesión solo viven
// dentro del contexto de un test (workers=1 ya serializa el archivo).
//
// El afterAll usa deleteAuthUserByEmail (borra vía psql el auth user); la FK
// cascade cubre public.usuario → valoracion/reseña.

const RUN_ID = Date.now()
const EMAIL_FLUJO = `e2e-recup-flujo-${RUN_ID}@iswdb.local`
const PASSWORD_VIEJA = 'e2e-recup-vieja-123'
const PASSWORD_NUEVA = 'e2e-recup-nueva-456'
const EMAIL_INEXISTENTE = `e2e-recup-no-existe-${RUN_ID}@iswdb.local`

test.beforeAll(async () => {
  // El usuario del flujo completo existe desde el inicio (a diferencia del
  // registro vía UI de auth.spec.ts, aquí no se registra: se pide el reset).
  await createAuthUserWithUsuario(EMAIL_FLUJO)
})

test.afterAll(async () => {
  await deleteAuthUserByEmail(EMAIL_FLUJO)
  await deleteAuthUserByEmail(EMAIL_INEXISTENTE)
})

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

test('REC-01/REC-04 flujo completo: pedir link → cambiar password → login nueva OK, antigua falla', async ({
  page
}) => {
  // Punto de entrada (REC-06): link "¿Olvidaste tu contraseña?" en /login.
  await page.goto('/login')
  const link = page.getByRole('link', { name: '¿Olvidaste tu contraseña?' })
  await expect(link).toBeVisible()
  await link.click()
  await page.waitForURL(/\/recuperar$/)
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible()

  // Pedir el link (REC-01/REC-02).
  await page.getByLabel('Email').fill(EMAIL_FLUJO)
  await page.getByRole('button', { name: 'Enviar link' }).click()
  await page.waitForURL(/\/recuperar\/enviado$/)
  await expect(page.getByRole('heading', { name: 'Revisa tu email' })).toBeVisible()

  // Leer el link del correo en Mailpit (poll con timeout) y abrirlo; el route
  // handler /auth/reset intercambia el token y fija la sesión de recovery.
  const linkRecuperacion = await getRecoveryLink(EMAIL_FLUJO)
  await page.goto(linkRecuperacion)
  await page.waitForURL(/\/recuperar\/confirmar$/)
  await expect(page.getByRole('heading', { name: 'Nueva contraseña' })).toBeVisible()

  // Nueva password (min 8) → redirige a /login con banner (role=status).
  await page.getByLabel('Nueva contraseña').fill(PASSWORD_NUEVA)
  await page.getByLabel('Confirmar contraseña').fill(PASSWORD_NUEVA)
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await page.waitForURL(/\/login\?msg=/)
  await expect(page.getByRole('status')).toBeVisible()

  // Login con la nueva password → llega a /perfil (REC-04).
  await login(page, EMAIL_FLUJO, PASSWORD_NUEVA)
  await page.waitForURL(/\/perfil$/)
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()

  // Logout → home anónima.
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.waitForURL(/\/$/)

  // Login con la antigua password falla (REC-04).
  await login(page, EMAIL_FLUJO, PASSWORD_VIEJA)
  await page.waitForURL(/\/login$/)
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'Email o contraseña incorrectos'
  )
})

test('REC-01 anti-enumeración: email inexistente → misma pantalla /enviado', async ({ page }) => {
  await page.goto('/recuperar')
  await page.getByLabel('Email').fill(EMAIL_INEXISTENTE)
  await page.getByRole('button', { name: 'Enviar link' }).click()

  // No revela si el email existe: redirige a la misma pantalla de éxito.
  await page.waitForURL(/\/recuperar\/enviado$/)
  await expect(page.getByRole('heading', { name: 'Revisa tu email' })).toBeVisible()
  await expect(page.getByText('Si existe una cuenta con ese email, te hemos enviado un link.')).toBeVisible()
})
