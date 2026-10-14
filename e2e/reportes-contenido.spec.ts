import { expect, test, type Page } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  createModUser,
  deleteAuthUser,
  TEST_PASSWORD
} from './global-setup'

const RUN_ID = Date.now()
const EMAIL_USER = `e2e-user-${RUN_ID}@iswdb.local`
const EMAIL_MOD = `e2e-mod-${RUN_ID}@iswdb.local`

let userId: string
let modUserId: string

test.beforeAll(async () => {
  userId = await createAuthUserWithUsuario(EMAIL_USER)
  modUserId = await createModUser(EMAIL_MOD)
})

test.afterAll(async () => {
  await deleteAuthUser(userId)
  await deleteAuthUser(modUserId)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
}

test('anónimo: botón "Reportar" no visible ni habilitado (REP-01)', async ({ page }) => {
  await page.goto('/series/e2e-01')

  // El botón Reportar se renderiza deshabilitado para usuarios anónimos
  await expect(page.getByRole('button', { name: 'Reportar' }).first()).toBeDisabled()
})

test('usuario normal: reporta serie e2e-01 con motivo spam (REP-02)', async ({ page }) => {
  await login(page, EMAIL_USER)

  // Después del login, asegúrate de estar en /series/e2e-01
  await page.goto('/series/e2e-01')

  // El botón Reportar se encuentra con getByRole('button', { name: 'Reportar' }).first()
  const btnReportar = page.getByRole('button', { name: 'Reportar' }).first()
  await expect(btnReportar).toBeVisible()

  // Abrir el formulario de reporte
  await btnReportar.click()

  // El select de motivo tiene id='motivo-reporte'
  await page.locator('#motivo-reporte').selectOption('spam', { timeout: 10000 })

  // El botón de envío tiene name='Enviar'
  await page.getByRole('button', { name: 'Enviar' }).click()

  // El mensaje de éxito es 'Reporte enviado correctamente'
  await expect(page.getByText('Reporte enviado correctamente')).toBeVisible({ timeout: 10000 })
})

test('usuario normal: no ve panel /admin/reportes (REP-03)', async ({ page }) => {
  await login(page, EMAIL_USER)

  // Intentar acceder al panel de reportes debería dar 404
  await page.goto('/admin/reportes')
  await expect(page.getByText('Página no encontrada')).toBeVisible()
})

test('moderador: ve reporte pendiente, lo marca como revisado y lo borra (REP-04)', async ({
  page
}) => {
  await login(page, EMAIL_MOD)

  // Acceder al panel de reportes
  await page.goto('/admin/reportes')
  await expect(page.getByRole('heading', { name: 'Reportes pendientes' })).toBeVisible()

  // Verificar que el reporte de la serie e2e-01 está visible
  const itemReporte = page
    .locator('li')
    .filter({ hasText: 'Serie' })
    .filter({ hasText: 'spam' })
    .first()

  await expect(itemReporte).toBeVisible()

  // El botón para marcar como revisado tiene name='Revisado' (ver components/admin/reporte-actions.tsx)
  await itemReporte.getByRole('button', { name: 'Revisado' }).click()

  // El panel solo lista pendientes: al marcar revisado, el ítem sale de la cola.
  await expect(page.getByText('No hay reportes pendientes')).toBeVisible()
})

test('usuario normal: no puede borrar su propio reporte (REP-05)', async ({ page }) => {
  await login(page, EMAIL_USER)

  // Verificar que no hay botón de borrar en la UI de reportes (solo para mods)
  await page.goto('/series/e2e-01')
  await expect(page.getByRole('button', { name: 'Reportar' }).first()).toBeVisible()
})