import { expect, test, type Page } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  createModUser,
  deleteAuthUser,
  deleteSeriesBySlugLike,
  FIXTURE,
  setModerationStatus,
  TEST_PASSWORD
} from './global-setup'

// admin.spec.ts corre PRIMERO alfabéticamente (workers=1): si el test de
// moderación aprobara e2e-16 y no la restaurara, catalogo/ficha/valoraciones
// verían 16 series en vez de 15. El afterAll restaura el fixture exactamente
// (riesgo 5 del plan), incluso si algún test falla a medias.
const RUN_ID = Date.now()
const EMAIL_USER = `e2e-admin-user-${RUN_ID}@iswdb.local`
const EMAIL_MOD = `e2e-admin-mod-${RUN_ID}@iswdb.local`

// El slug lo genera el servicio (slugify del título): predecible y único por
// ejecución. El patrón de borrado cubre también un eventual sufijo -2.
const TITULO_NUEVA = `Serie Admin E2E ${RUN_ID}`
const TITULO_EDITADA = `Serie Admin E2E Editada ${RUN_ID}`
const SLUG_NUEVA = `serie-admin-e2e-${RUN_ID}`

let userUserId: string
let modUserId: string

test.beforeAll(async () => {
  userUserId = await createAuthUserWithUsuario(EMAIL_USER)
  modUserId = await createModUser(EMAIL_MOD)
})

test.afterAll(async () => {
  await setModerationStatus(FIXTURE.slugPendiente, 'pendiente')
  await deleteSeriesBySlugLike(`${SLUG_NUEVA}%`)
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

test('anónimo: /admin → 404 (ADM-04)', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByText('Página no encontrada')).toBeVisible()
})

test('user normal: /admin y subruta → 404 (ADM-04)', async ({ page }) => {
  await login(page, EMAIL_USER)

  await page.goto('/admin')
  await expect(page.getByText('Página no encontrada')).toBeVisible()

  await page.goto('/admin/series/nueva')
  await expect(page.getByText('Página no encontrada')).toBeVisible()
})

test('mod: ve e2e-16 en la cola, la aprueba y aparece en el catálogo (ADM-01/ADM-02)', async ({
  page
}) => {
  await login(page, EMAIL_MOD)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Panel de moderación' })).toBeVisible()

  const itemCola = page
    .locator('section', {
      has: page.getByRole('heading', { name: 'Pendientes de moderación' })
    })
    .getByRole('listitem')
    .filter({ hasText: 'Serie e2e 16' })
  await expect(itemCola).toBeVisible()
  await itemCola.getByRole('button', { name: 'Aprobar Serie e2e 16' }).click()

  // e2e-16 era la única pendiente del fixture: la cola queda vacía
  // (router.refresh() re-renderiza el payload RSC sin recarga).
  await expect(page.getByText('No hay series pendientes')).toBeVisible()

  // Visible en el catálogo público: contador y ficha.
  await page.goto('/series')
  await expect(page.getByText('16 series en el catálogo')).toBeVisible()
  await page.goto(`/series/${FIXTURE.slugPendiente}`)
  await expect(page.getByRole('heading', { name: 'Serie e2e 16' })).toBeVisible()

  // Restaurar aquí (y de nuevo en afterAll como red de seguridad) para que
  // los specs posteriores vean el fixture intacto.
  await setModerationStatus(FIXTURE.slugPendiente, 'pendiente')
})

test('mod: crea una serie por UI con canal y episodio, y la edita (ADM-05/ADM-06)', async ({
  page
}) => {
  await login(page, EMAIL_MOD)
  await page.goto('/admin/series/nueva')

  await page.getByLabel('Título', { exact: true }).fill(TITULO_NUEVA)
  await page.getByLabel('Descripción').fill('Serie creada por el E2E de admin.')
  await page.getByLabel('Categoría').selectOption('gta')
  await page.getByLabel('Año de inicio').fill('2026')

  await page.getByRole('button', { name: 'Añadir canal' }).click()
  // exact: sin él, 'Canal 1' también casa con 'Rol del canal 1' y
  // 'Eliminar canal 1' (getByLabel busca subcadena).
  await page.getByLabel('Canal 1', { exact: true }).selectOption({
    label: 'Canal Uno (@canal-uno)'
  })

  await page.getByRole('button', { name: 'Añadir episodio' }).click()
  await page.getByLabel('Temporada del episodio 1').fill('1')
  await page.getByLabel('Número del episodio 1').fill('1')
  await page.getByLabel('Título del episodio 1').fill('Piloto admin')
  await page.getByLabel('Video ID del episodio 1').fill(`admin-e2e-t1e1-${RUN_ID}`)

  await page.getByRole('button', { name: 'Crear serie' }).click()
  await page.waitForURL(/\/admin$/)

  // Visible en el catálogo público con su categoría, canal y episodio.
  await page.goto(`/series/${SLUG_NUEVA}`)
  await expect(page.getByRole('heading', { name: TITULO_NUEVA })).toBeVisible()
  // .first(): el badge de la cabecera; los de "Series similares" (es un GTA)
  // también dicen "GTA" (REC-04).
  await expect(page.getByText('GTA', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Canal Uno')).toBeVisible()
  await expect(page.getByText('Principal', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Temporada 1' })).toBeVisible()
  await expect(page.getByText('Piloto admin')).toBeVisible()

  // Edición: cambiar título + añadir episodio 2. El slug es inmutable.
  await page.goto(`/admin/series/${SLUG_NUEVA}/editar`)
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue(TITULO_NUEVA)
  await page.getByLabel('Título', { exact: true }).fill(TITULO_EDITADA)

  await page.getByRole('button', { name: 'Añadir episodio' }).click()
  await page.getByLabel('Temporada del episodio 2').fill('1')
  await page.getByLabel('Número del episodio 2').fill('2')
  await page.getByLabel('Título del episodio 2').fill('Segundo admin')
  await page.getByLabel('Video ID del episodio 2').fill(`admin-e2e-t1e2-${RUN_ID}`)

  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await page.waitForURL(/\/admin$/)

  // Verificación: mismo slug (inmutable), título nuevo, episodios 1 y 2.
  await page.goto(`/series/${SLUG_NUEVA}`)
  await expect(page.getByRole('heading', { name: TITULO_EDITADA })).toBeVisible()
  await expect(page.getByText('Piloto admin')).toBeVisible()
  await expect(page.getByText('Segundo admin')).toBeVisible()
})
