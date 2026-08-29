import { expect, test, type Page } from '@playwright/test'

import {
  createModUser,
  deleteAuthUser,
  deleteSeriesBySlugLike,
  FIXTURE,
  TEST_PASSWORD
} from './global-setup'

// F011 · T5: E2E de propuestas.
//
// Orden dentro del archivo (importa: cada test usa contexto/cookies frescos;
// el estado compartido vive en la BD, workers=1 serializa archivos y tests):
//   1. PRO-01 anónimo ve el formulario público.
//   2. Flujo de propuesta en un ÚNICO test (las cookies de sesión/form solo
//      viven dentro de un test()): rellenar → submit → redirect a
//      /propuesta-enviada con "Gracias".
//   3. Mod ve la propuesta pendiente en la cola de /admin (PRO-07).
//   4. Mod la aprueba → visible en /series y en la ficha con los datos del
//      proponente (PRO-08).
//
// Orden alfabético entre archivos: propuestas.spec.ts corre después de ficha
// (f) y antes de resenas (r) y valoraciones (v). Por eso el afterAll BORRA las
// series de propuesta (slug con el marcador '-prop-'; cascade cubre participa)
// y al mod, dejando el catálogo en los 15 del fixture para los specs de F012.
const RUN_ID = Date.now()
const EMAIL_MOD = `e2e-prop-mod-${RUN_ID}@iswdb.local`

const TITULO_PROPUESTA = 'Serie E2E Propuesta'
const DESCRIPCION_PROPUESTA =
  'Descripción de la serie propuesta para el test E2E, más de diez caracteres.'

let modUserId: string

test.beforeAll(async () => {
  modUserId = await createModUser(EMAIL_MOD)
})

test.afterAll(async () => {
  // El slug que genera crearPropuesta es <slugify(titulo)>-prop-<ts>-<rand>.
  // '%prop-%' (y no '-prop-%'): el '%' inicial cubre el prefijo del título que
  // la propuesta siempre lleva delante del marcador '-prop-'.
  await deleteSeriesBySlugLike('%prop-%')
  await deleteAuthUser(modUserId)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
}

function colaPendientes(page: Page) {
  return page.locator('section', {
    has: page.getByRole('heading', { name: 'Pendientes de moderación' })
  })
}

async function llenarFormularioPropuesta(page: Page) {
  await page.getByLabel('Título').fill(TITULO_PROPUESTA)
  await page.getByLabel('Descripción').fill(DESCRIPCION_PROPUESTA)
  await page.getByLabel('Categoría').selectOption(FIXTURE.categorias[0].slug)
  // Handle 'canal-uno' sin @ (placeholder del form): resolverCanales (lib) lo
  // normaliza a '@canal-uno' del fixture.
  await page.getByLabel('Handle del canal 1 (sin @)').fill('canal-uno')
  await page.getByLabel('Rol del canal 1').selectOption('principal')
  await page
    .getByLabel('Enlace a playlist / trailer (opcional)')
    .fill('https://www.youtube.com/playlist?list=PLprop')
  await page
    .getByLabel('Email de contacto (opcional)')
    .fill('propuesta@e2e.example.com')
}

test('anónimo: /proponer-serie muestra el formulario público (PRO-01)', async ({ page }) => {
  await page.goto('/proponer-serie')
  await expect(page.getByRole('heading', { name: 'Proponer una serie' })).toBeVisible()
  await expect(page.getByLabel('Título')).toBeVisible()
  await expect(page.getByLabel('Descripción')).toBeVisible()
  await expect(page.getByLabel('Categoría')).toBeVisible()
  await expect(page.getByLabel('Handle del canal 1 (sin @)')).toBeVisible()
  await expect(page.getByLabel('Rol del canal 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Proponer serie' })).toBeVisible()
})

test('flujo de propuesta en un único test: submit → /propuesta-enviada con "Gracias" (PRO-01)', async ({
  page
}) => {
  await page.goto('/proponer-serie')
  await llenarFormularioPropuesta(page)

  await page.getByRole('button', { name: 'Proponer serie' }).click()

  await page.waitForURL(/\/propuesta-enviada$/)
  await expect(page.getByRole('heading', { name: 'Propuesta enviada' })).toBeVisible()
  await expect(
    page.getByText('Gracias. Tu propuesta será revisada por el equipo.')
  ).toBeVisible()
})

test('mod: la propuesta pendiente aparece en la cola de /admin (PRO-07)', async ({ page }) => {
  await login(page, EMAIL_MOD)
  await page.goto('/admin')

  const cola = colaPendientes(page)
  await expect(cola).toBeVisible()
  const item = cola.getByRole('listitem').filter({ hasText: TITULO_PROPUESTA })
  await expect(item).toBeVisible()
  await expect(item.getByText('Canal Uno')).toBeVisible()
})

test('mod: aprueba la propuesta → visible en /series con los datos del proponente (PRO-08)', async ({
  page
}) => {
  await login(page, EMAIL_MOD)
  await page.goto('/admin')

  const cola = colaPendientes(page)
  const item = cola.getByRole('listitem').filter({ hasText: TITULO_PROPUESTA })
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: /Aprobar/ }).click()

  // Sale de la cola (router.refresh). La aserción va acotada a la cola: el
  // listado "Todas las series" sigue mostrando el título como aprobada.
  await expect(cola.getByText(TITULO_PROPUESTA)).toHaveCount(0)

  // Visible en el catálogo público y la ficha expone los datos del proponente.
  await page.goto('/series')
  const enlace = page.getByRole('link', { name: TITULO_PROPUESTA })
  await expect(enlace).toBeVisible()
  await enlace.click()
  await expect(page.getByRole('heading', { name: TITULO_PROPUESTA })).toBeVisible()
  await expect(page.getByText(DESCRIPCION_PROPUESTA)).toBeVisible()
  await expect(page.getByText('Canal Uno')).toBeVisible()
  await expect(page.getByText('Principal', { exact: true })).toBeVisible()
})
