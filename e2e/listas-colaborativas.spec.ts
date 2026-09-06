import { expect, test, type Page } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  slugSerie,
  TEST_PASSWORD,
  usernameDesdeEmail
} from './global-setup'

// F024 · T5: E2E de listas colaborativas.
//
// Flujo completo en un ÚNICO test (las cookies de sesión solo viven dentro de
// un test() y el flujo depende de una sola lista privada compartida entre
// cuatro usuarios): un worker con un test es más robusto que pasar el id por
// process.env — si un test previo falla Playwright reinicia el worker y se
// pierde el estado (cascada de "listaId no inicializado").
//
// Escenarios (en orden):
//   1. A (dueño) crea una lista privada → sección "Colaboradores" lo muestra
//      como editor con badge "tú"; NO hay indicador colaborativo (1 editor,
//      COL-08 negativa).
//   2. A invita a B (editor) → indicador "Lista colaborativa" (2 editores,
//      COL-08); B añade e2e-01 y e2e-10 desde la ficha y reordena en
//      /listas/<id> (COL-01/02).
//   3. A cambia a B a 'lector' → B ve la lista privada pero sin controles
//      (COL-02/04) y el dropdown de la ficha queda deshabilitado.
//   4. A invita a C (lector) → C ve la lista privada sin editar (COL-03).
//   5. A quita a B → B recibe 404 en /listas/<id> (COL-04/07).
//   6. D (ajeno) no ve la lista privada (404, COL-07).
//
// El cleanup borra los usuarios de test por cascade: auth.users → public.usuario
// → lista → lista_serie y lista_colaborador (la lista de A y las filas donde
// colaboran B/C/D).
const RUN_ID = Date.now()
const EMAIL_A = `e2e-lc-a-${RUN_ID}@iswdb.local`
const EMAIL_B = `e2e-lc-b-${RUN_ID}@iswdb.local`
const EMAIL_C = `e2e-lc-c-${RUN_ID}@iswdb.local`
const EMAIL_D = `e2e-lc-d-${RUN_ID}@iswdb.local`

const NOMBRE_LISTA = 'Colaborativa'

let userAId: string
let userBId: string
let userCId: string
let usernameA: string
let usernameB: string
let usernameC: string

test.beforeAll(async () => {
  userAId = await createAuthUserWithUsuario(EMAIL_A)
  userBId = await createAuthUserWithUsuario(EMAIL_B)
  userCId = await createAuthUserWithUsuario(EMAIL_C)
  await createAuthUserWithUsuario(EMAIL_D)
  usernameA = usernameDesdeEmail(EMAIL_A, userAId)
  usernameB = usernameDesdeEmail(EMAIL_B, userBId)
  usernameC = usernameDesdeEmail(EMAIL_C, userCId)
})

test.afterAll(async () => {
  await deleteAuthUserByEmail(EMAIL_D)
  await deleteAuthUserByEmail(EMAIL_C)
  await deleteAuthUserByEmail(EMAIL_B)
  await deleteAuthUserByEmail(EMAIL_A)
})

// Cambia de usuario: limpia las cookies de sesión para que /login sea
// accesible desde un usuario autenticado distinto dentro del mismo test().
async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
}

// Crea una lista privada por UI (LIS-01): el redirect de accionCrearLista
// navega a /listas/<id>.
async function crearListaPrivada(page: Page, nombre: string): Promise<string> {
  await page.goto('/listas')
  await page.getByLabel('Nombre').fill(nombre)
  await page.getByRole('button', { name: 'Crear lista' }).click()
  await page.waitForURL(/\/listas\/[0-9a-f-]{36}$/)
  return page.url().split('/').pop()!
}

// Sección "Colaboradores" (solo la ve el dueño): el <section> que contiene el
// heading homónimo, para acotar username/badges por fila.
function seccionColaboradores(page: Page) {
  return page.locator('section', {
    has: page.getByRole('heading', { name: 'Colaboradores' })
  })
}

// Fila de un colaborador dentro de la sección.
function filaColaborador(page: Page, username: string) {
  return seccionColaboradores(page).locator('li', { hasText: username })
}

// Badge de rol de una fila. .first(): el texto del rol también aparece en el
// <option> del select de cambiar rol de la misma fila.
function badgeRol(page: Page, username: string, rol: string) {
  return filaColaborador(page, username).getByText(rol, { exact: true }).first()
}

// Añade la serie desde el dropdown "Añadir a lista" de su ficha (LIS-10). La
// lista del colaborador aparece porque el dropdown usa listListasParaAnadir
// (propias + colaboración como editor, COL-02). Espera el POST de la server
// action antes de continuar (misma técnica que listas.spec.ts).
async function añadirSerieDesdeFicha(page: Page, slug: string, listaId: string): Promise<void> {
  await page.goto(`/series/${slug}`)
  const post = page.waitForResponse((r) => r.request().method() === 'POST')
  await page.getByLabel('Añadir a lista').selectOption(listaId)
  await post
  await expect(
    page
      .locator('div', { has: page.getByLabel('Añadir a lista') })
      .getByRole('alert')
  ).toHaveCount(0)
}

// Los enlaces del detalle en orden manual: cada <li> enlaza /series/<slug>.
function enlacesEnOrden(page: Page) {
  return page.locator('main ul > li > a')
}

test('flujo completo invitar → editar → quitar + lectores y ajenos (COL-01..08)', async ({
  page
}) => {
  // 1. A (dueño) crea la lista privada; sección Colaboradores con su fila
  //    como editor y badge "tú"; sin indicador (1 solo editor).
  await login(page, EMAIL_A)
  const listaId = await crearListaPrivada(page, NOMBRE_LISTA)
  await expect(page.getByRole('heading', { name: NOMBRE_LISTA })).toBeVisible()
  await expect(page.getByText(/Esta lista aún no tiene series/)).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Colaboradores' })).toBeVisible()
  await expect(filaColaborador(page, usernameA)).toBeVisible()
  await expect(badgeRol(page, usernameA, 'Editor')).toBeVisible()
  await expect(filaColaborador(page, usernameA).getByText('tú', { exact: true })).toBeVisible()
  await expect(page.getByText('Lista colaborativa', { exact: true })).toHaveCount(0)

  // 2. A invita a B (editor) → indicador colaborativo (COL-08) …
  await page.getByLabel('Nombre de usuario').fill(usernameB)
  await page.getByLabel('Rol').selectOption('editor')
  await page.getByRole('button', { name: 'Invitar', exact: true }).click()
  await expect(filaColaborador(page, usernameB)).toBeVisible()
  await expect(badgeRol(page, usernameB, 'Editor')).toBeVisible()
  await expect(page.getByText('Lista colaborativa', { exact: true })).toBeVisible()

  // … B añade e2e-01 y e2e-10 desde la ficha (COL-02) …
  await login(page, EMAIL_B)
  await añadirSerieDesdeFicha(page, slugSerie(1), listaId)
  await añadirSerieDesdeFicha(page, slugSerie(10), listaId)

  // … y reordena en /listas/<id> (controles ↑/↓ visibles para editor).
  await page.goto(`/listas/${listaId}`)
  const enlaces = enlacesEnOrden(page)
  await expect(enlaces).toHaveCount(2)
  await expect(enlaces.nth(0)).toHaveText('Serie e2e 1')
  await expect(enlaces.nth(1)).toHaveText('Serie e2e 10')
  await page.getByRole('button', { name: 'Mover arriba Serie e2e 10' }).click()
  await expect(enlaces.nth(0)).toHaveText('Serie e2e 10')
  await expect(enlaces.nth(1)).toHaveText('Serie e2e 1')

  // 3. A cambia a B a 'lector' → su fila queda como lector y el indicador
  //    desaparece (queda 1 solo editor).
  await login(page, EMAIL_A)
  await page.goto(`/listas/${listaId}`)
  await expect(badgeRol(page, usernameB, 'Editor')).toBeVisible()
  await filaColaborador(page, usernameB).getByRole('combobox').selectOption('lector')
  await expect(badgeRol(page, usernameB, 'Lector')).toBeVisible()
  await expect(page.getByText('Lista colaborativa', { exact: true })).toHaveCount(0)

  // B ve la lista privada (COL-03) y sus series…
  await login(page, EMAIL_B)
  await page.goto(`/listas/${listaId}`)
  await expect(page.getByRole('heading', { name: NOMBRE_LISTA })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Serie e2e 1', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Serie e2e 10', exact: true })).toBeVisible()

  // … pero sin controles de edición (COL-02) y sin la sección Colaboradores.
  await expect(page.getByRole('button', { name: 'Renombrar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Descripción' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Mover arriba|Mover abajo/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Quitar Serie e2e 1 de la lista' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Colaboradores' })).toHaveCount(0)

  // En la ficha ya no puede añadir: el dropdown queda sin listas editables.
  await page.goto(`/series/${slugSerie(1)}`)
  await expect(page.getByLabel('Añadir a lista')).toBeDisabled()

  // 4. A invita a C (lector) → C ve la lista privada pero no edita (COL-03).
  await login(page, EMAIL_A)
  await page.goto(`/listas/${listaId}`)
  await page.getByLabel('Nombre de usuario').fill(usernameC)
  await page.getByLabel('Rol').selectOption('lector')
  await page.getByRole('button', { name: 'Invitar', exact: true }).click()
  await expect(filaColaborador(page, usernameC)).toBeVisible()
  await expect(badgeRol(page, usernameC, 'Lector')).toBeVisible()

  await login(page, EMAIL_C)
  await page.goto(`/listas/${listaId}`)
  await expect(page.getByRole('heading', { name: NOMBRE_LISTA })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Serie e2e 10', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Renombrar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Mover arriba|Mover abajo/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Colaboradores' })).toHaveCount(0)

  // 5. A quita a B → su fila desaparece y B recibe 404 (COL-04/07).
  await login(page, EMAIL_A)
  await page.goto(`/listas/${listaId}`)
  await filaColaborador(page, usernameB).getByRole('button', { name: `Quitar a ${usernameB}` }).click()
  await expect(filaColaborador(page, usernameB)).toHaveCount(0)

  await login(page, EMAIL_B)
  const respuestaB = await page.goto(`/listas/${listaId}`)
  expect(respuestaB?.status()).toBe(404)
  await expect(page.getByText('Página no encontrada')).toBeVisible()

  // 6. D (ajeno) no ve la lista privada (COL-07).
  await login(page, EMAIL_D)
  const respuestaD = await page.goto(`/listas/${listaId}`)
  expect(respuestaD?.status()).toBe(404)
  await expect(page.getByText('Página no encontrada')).toBeVisible()
})