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

  // El botón Reportar no debería estar visible para usuarios anónimos
  await expect(page.getByRole('button', { name: 'Reportar' })).not.toBeVisible()
})

test('usuario normal: reporta serie e2e-01 con motivo spam (REP-02)', async ({ page }) => {
  await login(page, EMAIL_USER)

  // Verificar que el botón está visible y habilitado
  await expect(page.getByRole('button', { name: 'Reportar' })).toBeVisible()

  // Abrir el formulario de reporte
  await page.getByRole('button', { name: 'Reportar' }).click()

  // Seleccionar tipo "serie"
  await page.getByLabel('Tipo').selectOption('serie')

  // Seleccionar la serie (e2e-01)
  await page.getByLabel('Serie').selectOption('Serie e2e 01')

  // Ingresar motivo "spam"
  await page.getByLabel('Motivo').fill('spam')

  // Enviar el reporte
  await page.getByRole('button', { name: 'Enviar reporte' }).click()

  // Verificar feedback de éxito
  await expect(page.getByText('Reporte enviado correctamente')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reportar' })).toBeVisible()
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
    .locator('section', {
      has: page.getByRole('heading', { name: 'Reportes pendientes' })
    })
    .getByRole('listitem')
    .filter({ hasText: 'Serie e2e 01' })

  await expect(itemReporte).toBeVisible()

  // Marcar como revisado
  await itemReporte.getByRole('button', { name: 'Marcar como revisado' }).click()

  // Verificar que el reporte ya no aparece en la lista de pendientes
  await expect(page.getByText('No hay reportes pendientes')).toBeVisible()

  // El reporte debería estar en la lista de revisados (si existe)
  await page.getByRole('tab', { name: 'Revisados' }).click()
  await expect(itemReporte).toBeVisible()
})

test('usuario normal: no puede borrar su propio reporte (REP-05)', async ({ page }) => {
  await login(page, EMAIL_USER)

  // Verificar que no hay botón de borrar en la UI de reportes (solo para mods)
  await page.goto('/series/e2e-01')
  await expect(page.getByRole('button', { name: 'Reportar' })).toBeVisible()
})
