import { expect, test, type Page } from '@playwright/test'

import { createAuthUserWithUsuario, deleteAuthUser, slugSerie, TEST_PASSWORD } from './global-setup'

// F013 · T4: E2E de listas.
//
// Orden dentro del archivo (cada test usa contexto/cookies frescos; el estado
// compartido vive en la BD; el id de la lista privada de LIS-08 se pasa entre
// tests vía process.env porque Playwright re-ejecuta el módulo por test):
//   1. Sin sesión → /listas → redirect a /login?next=/listas (LIS-09).
//   2. Flujo completo en un ÚNICO test (las cookies de sesión solo viven
//      dentro de un test()): login → crear "Favoritas" en /listas → añadir
//      e2e-01 desde el botón de la ficha (LIS-10) → verla en /listas/<id> →
//      añadir e2e-10 → reordenar con ↑/↓ → posición cambiada (LIS-01..06).
//   3. Lista pública creada con el checkbox → logout → visitante anónimo la
//      ve en solo lectura, sin botones (LIS-07).
//   4. La lista privada del usuario A → 404 para el usuario B (LIS-08);
//      se reutiliza la lista "Favoritas" que creó el test 2.
//
// Orden alfabético entre archivos: listas.spec.ts corre después de ficha (f)
// y antes de propuestas (p). Por eso el afterAll BORRA los usuarios de test
// A y B (la FK cascade cubre usuario → lista → lista_serie), dejando el
// catálogo y el fixture de valoraciones/reseñas intactos para los specs de
// F011/F012.
const RUN_ID = Date.now()
const EMAIL_A = `e2e-list-a-${RUN_ID}@iswdb.local`
const EMAIL_B = `e2e-list-b-${RUN_ID}@iswdb.local`

let userAId: string
let userBId: string
// Id capturado del redirect de accionCrearLista en el test 2: el test 4 lo usa
// para pedir la lista privada de A con la sesión de B (los test() no comparten
// cookies Y Playwright re-ejecuta el módulo por cada test, así que NO basta un
// `let` de módulo: se persiste en process.env para sobrevivir a la re-carga).
function getListaPrivadaId(): string {
  const id = process.env.ISWDB_E2E_LISTA_PRIVADA_ID
  if (!id) throw new Error('listaPrivadaId no inicializado por el test 2')
  return id
}

test.beforeAll(async () => {
  userAId = await createAuthUserWithUsuario(EMAIL_A)
  userBId = await createAuthUserWithUsuario(EMAIL_B)
})

test.afterAll(async () => {
  // Cascade: auth.users → public.usuario → lista → lista_serie.
  await deleteAuthUser(userAId)
  await deleteAuthUser(userBId)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
}

// Crea una lista por UI (LIS-01) y devuelve su id (el redirect de
// accionCrearLista navega a /listas/<id>). publica marca el checkbox;
// si guardarComoPrivada, guarda el id en process.env para el test de LIS-08.
async function crearLista(
  page: Page,
  nombre: string,
  publica: boolean,
  guardarComoPrivada = false
): Promise<string> {
  await page.goto('/listas')
  await page.getByLabel('Nombre').fill(nombre)
  if (publica) await page.getByLabel('Lista pública (visible para todos)').check()
  await page.getByRole('button', { name: 'Crear lista' }).click()
  await page.waitForURL(/\/listas\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()!
  if (guardarComoPrivada) process.env.ISWDB_E2E_LISTA_PRIVADA_ID = id
  return id
}

// Añade la serie desde el dropdown "Añadir a lista" de su ficha (LIS-10).
// Espera el POST de la server action antes de continuar: la navegación
// posterior ("sin recarga las cookies") no debe abortar el insert pendiente.
async function añadirSerieDesdeFicha(page: Page, slug: string, listaId: string): Promise<void> {
  await page.goto(`/series/${slug}`)
  const post = page.waitForResponse((r) => r.request().method() === 'POST')
  await page.getByLabel('Añadir a lista').selectOption(listaId)
  await post
  // La action no debe devolver error (LIS-04). La aserción va acotada al
  // contenedor del dropdown: el route announcer de Next.js también usa
  // role="alert" tras router.refresh() (mismo quirk que AUTH-02).
  const alertaAñadir = page
    .locator('div', { has: page.getByLabel('Añadir a lista') })
    .getByRole('alert')
  await expect(alertaAñadir).toHaveCount(0)
}

// Los enlaces del detalle en orden manual: cada <li> enlaza /series/<slug>.
function enlacesEnOrden(page: Page) {
  return page.locator('main ul > li > a')
}

test('sin sesión: /listas redirige a /login conservando la ruta (LIS-09)', async ({ page }) => {
  await page.goto('/listas')
  await page.waitForURL(/\/login\?next=%2Flistas$/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})

test('flujo completo: crear lista → añadir series desde la ficha → reordenar (LIS-01..06)', async ({
  page
}) => {
  await login(page, EMAIL_A)

  // Crear lista privada "Favoritas" (LIS-01) → redirect al detalle, vacía.
  // Se guarda como "privada de referencia" (process.env): el test 4 (LIS-08)
  // la pide con la sesión del usuario B — los test() no comparten cookies ni
  // estado de módulo (Playwright re-ejecuta el modulo por test).
  const listaPrivadaId = await crearLista(page, 'Favoritas', false, true)
  await expect(page.getByRole('heading', { name: 'Favoritas' })).toBeVisible()
  await expect(page.getByText(/Esta lista aún no tiene series/)).toBeVisible()

  // Añadir e2e-01 desde el botón de la ficha (LIS-10).
  await añadirSerieDesdeFicha(page, slugSerie(1), listaPrivadaId)

  // Grid: la tarjeta muestra "Privada" y el conteo (LIS-09).
  await page.goto('/listas')
  const tarjeta = page.getByRole('link', { name: /Favoritas/ })
  await expect(tarjeta).toBeVisible()
  await expect(tarjeta.getByText('Privada')).toBeVisible()
  await expect(tarjeta.getByText('1 serie', { exact: true })).toBeVisible()

  // Detalle: e2e-01 en orden (LIS-04, posicion + 1 + MAX).
  await page.goto(`/listas/${listaPrivadaId}`)
  let enlaces = enlacesEnOrden(page)
  await expect(enlaces).toHaveCount(1)
  await expect(enlaces.first()).toHaveText('Serie e2e 1')

  // Añadir e2e-10 → 2 series en orden de adición [e2e-01, e2e-10].
  await añadirSerieDesdeFicha(page, slugSerie(10), listaPrivadaId)
  await page.goto('/listas')
  await expect(tarjeta.getByText('2 series', { exact: true })).toBeVisible()
  await page.goto(`/listas/${listaPrivadaId}`)
  enlaces = enlacesEnOrden(page)
  await expect(enlaces).toHaveCount(2)
  await expect(enlaces.nth(0)).toHaveText('Serie e2e 1')
  await expect(enlaces.nth(1)).toHaveText('Serie e2e 10')

  // Reordenar con ↑: mover e2e-10 arriba → posición cambiada (LIS-06).
  await page.getByRole('button', { name: 'Mover arriba Serie e2e 10' }).click()
  await expect(enlaces.nth(0)).toHaveText('Serie e2e 10')
  await expect(enlaces.nth(1)).toHaveText('Serie e2e 1')
})

test('lista pública: anónimo la ve en solo lectura sin botones (LIS-07)', async ({ page }) => {
  await login(page, EMAIL_A)

  // La única vía UI (T3) para una lista visible es crearla con el checkbox
  // "Lista pública"; el detalle no ofrece toggle post-creación.
  const listaPublicaId = await crearLista(page, 'Mis públicas', true)
  await añadirSerieDesdeFicha(page, slugSerie(1), listaPublicaId)

  // Grid: la tarjeta la marca como Pública.
  await page.goto('/listas')
  const tarjeta = page.getByRole('link', { name: /Mis públicas/ })
  await expect(tarjeta).toBeVisible()
  // exact: el título "Mis públicas" contiene "públicas", no el badge.
  await expect(tarjeta.getByText('Pública', { exact: true })).toBeVisible()

  // Logout → visitante anónimo.
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.waitForURL(/\/$/)

  // Sigue viendo el detalle (LIS-07)…
  await page.goto(`/listas/${listaPublicaId}`)
  await expect(page.getByRole('heading', { name: 'Mis públicas' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Serie e2e 1' })).toBeVisible()
  // …pero en solo lectura: sin botones de gestión (renombrar/eliminar/↑↓).
  await expect(page.getByRole('button', { name: 'Renombrar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Mover arriba|Mover abajo/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Eliminar lista' })).toHaveCount(0)
})

test('lista privada de otro usuario → 404 (LIS-08)', async ({ page }) => {
  // login como B: la "Favoritas" del usuario A (creada en el test 2) sigue
  // siendo privada.
  await login(page, EMAIL_B)
  const listaPrivadaId = getListaPrivadaId()
  const respuesta = await page.goto(`/listas/${listaPrivadaId}`)
  expect(respuesta?.status()).toBe(404)
  await expect(page.getByText('Página no encontrada')).toBeVisible()
})
