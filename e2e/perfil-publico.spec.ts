import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  getUserIdByEmail,
  slugSerie,
  TEST_PASSWORD,
  usernameDesdeEmail
} from './global-setup'

// F021 · T4: E2E del perfil público (/usuarios/<username>).
//
// Cuatro tests en orden: el usuario PRINCIPAL se registra vía UI (test 1), se
// edita su username (test 2), y su perfil público se lee sin sesión (test 3) y
// con 404 (test 4). Cada test() tiene contexto propio (cookies por test),
// así que los tests que necesitan sesión hacen login vía UI por su cuenta.
// El cleanup borra ambos auth users vía psql (deleteAuthUserByEmail); la FK
// cascade cubre public.usuario, los follows (usuario_serie) y la valoración
// creada en el test 1.

const RUN_ID = Date.now()
const RUN = String(RUN_ID).slice(-10)
const EMAIL_PRINCIPAL = `e2e-pp-${RUN_ID}@iswdb.local`
const EMAIL_DUPLICADO = `e2e-pp-dup-${RUN_ID}@iswdb.local`
const PASSWORD = TEST_PASSWORD
// Determinista y válido según el schema (^[a-z0-9_-]{3,20}$): lo comparten
// los tests 2 (edición) y 3 (perfil público) sin depender del orden.
const USERNAME_NUEVO = `e2ep${RUN}`
const USERNAME_INVALIDO = 'Inválido!'
const USERNAME_INEXISTENTE = `no-existe-${RUN}`
// e2e-01 es una serie aprobada del fixture sin valoraciones ni follows
// iniciales (el resto de specs hacen cleanup; valoraciones.spec corre después).
const SLUG_FICHA = slugSerie(1)

let userDuplicadoId: string

function ddDe(dtTexto: string, page: Page): Locator {
  return page.locator('dt', { hasText: dtTexto }).locator('xpath=following-sibling::dd[1]')
}

test.beforeAll(async () => {
  // Segundo usuario con username conocido (fila public.usuario incluida):
  // sirve para el caso duplicado al editar el username del principal.
  userDuplicadoId = await createAuthUserWithUsuario(EMAIL_DUPLICADO)
})

test.afterAll(async () => {
  // Cascade: auth.users → public.usuario → usuario_serie/valoracion/reseña.
  await deleteAuthUserByEmail(EMAIL_DUPLICADO)
  await deleteAuthUserByEmail(EMAIL_PRINCIPAL)
})

test('PP-01: registro por UI → username generado en "Datos de la cuenta" + link', async ({
  page
}) => {
  await page.goto('/registro')
  await page.getByLabel('Email').fill(EMAIL_PRINCIPAL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  // Registro → /perfil?bienvenida=1 con la confirmación (AUTH-01).
  await page.waitForURL(/\/perfil\?bienvenida=1/)
  await expect(page.getByText('Cuenta creada correctamente')).toBeVisible()

  // El username generado es la regla única (TS mirror del backfill SQL).
  const userId = await getUserIdByEmail(EMAIL_PRINCIPAL)
  expect(userId).toBeTruthy()
  const usernameEsperado = usernameDesdeEmail(EMAIL_PRINCIPAL, userId!)
  await expect(ddDe('Nombre de usuario (URL)', page)).toHaveText(usernameEsperado)

  // Link al perfil público apuntando al username generado.
  const link = page.getByRole('link', { name: 'Ver mi perfil público' })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', `/usuarios/${usernameEsperado}`)

  // Actividad pública para el test 3: seguir e2e-01 y valorar 8.
  await page.goto(`/series/${SLUG_FICHA}`)
  await page.getByRole('button', { name: 'Seguir', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Siguiendo', exact: true })).toBeVisible()
  const grupo = page.getByRole('group', { name: 'Tu valoración' })
  await grupo.getByRole('button', { name: '8', exact: true }).click()
  await expect(page.getByText('8.0 · 1 valoración', { exact: true })).toBeVisible()
})

test('PP-02: edición de username → validación, duplicado y formato inválido', async ({
  page
}) => {
  // El username del duplicado solo se conoce con el id real (beforeAll).
  const usernameDuplicado = usernameDesdeEmail(EMAIL_DUPLICADO, userDuplicadoId)

  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL_PRINCIPAL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil/)

  const form = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Cambiar nombre de usuario', exact: true })
  })
  const input = form.getByLabel('Nuevo nombre de usuario')

  // Valor válido → visible en "Datos de la cuenta" tras la revalidación.
  await input.fill(USERNAME_NUEVO)
  await form.getByRole('button', { name: 'Cambiar nombre de usuario', exact: true }).click()
  await expect(form.getByRole('status')).toHaveText('Nombre de usuario actualizado')
  await expect(ddDe('Nombre de usuario (URL)', page)).toHaveText(USERNAME_NUEVO)

  // Duplicado → mensaje amigable (23505 → usernameEnUso), no crudo.
  await input.fill(usernameDuplicado)
  await form.getByRole('button', { name: 'Cambiar nombre de usuario', exact: true }).click()
  await expect(form.getByRole('alert')).toHaveText('Ese nombre de usuario ya está en uso')
  await expect(ddDe('Nombre de usuario (URL)', page)).toHaveText(USERNAME_NUEVO)

  // Formato inválido (mayúsculas/acentos/! fuera de [a-z0-9_-]) → error de schema.
  await input.fill(USERNAME_INVALIDO)
  await form.getByRole('button', { name: 'Cambiar nombre de usuario', exact: true }).click()
  await expect(form.getByRole('alert')).toHaveText(
    'El nombre de usuario debe tener entre 3 y 20 caracteres y solo letras, números, guiones o guiones bajos'
  )
})

test('PP-03: /usuarios/<username> sin sesión → cabecera + actividad, sin email', async ({
  page
}) => {
  await page.goto(`/usuarios/${USERNAME_NUEVO}`)

  // Cabecera: username en h1, display_name y "Miembro desde".
  await expect(page.getByRole('heading', { level: 1, name: USERNAME_NUEVO })).toBeVisible()
  await expect(page.getByText(/^Miembro desde /)).toBeVisible()

  // Secciones de actividad pública.
  const seccionSeguidas = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Series seguidas' }) })
  await expect(seccionSeguidas.getByRole('link', { name: 'Serie e2e 1' })).toBeVisible()
  const seccionValoraciones = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Valoraciones' }) })
  await expect(seccionValoraciones.getByText('8/10', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reseñas públicas' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Listas públicas' })).toBeVisible()

  // El HTML del perfil público NO contiene el email del usuario.
  await expect(page.locator('body')).not.toContainText(EMAIL_PRINCIPAL)
})

test('PP-04: /usuarios/<username-inexistente> → HTTP 404', async ({ page }) => {
  const respuesta = await page.goto(`/usuarios/${USERNAME_INEXISTENTE}`)
  expect(respuesta?.status()).toBe(404)
  await expect(page.getByText('Página no encontrada')).toBeVisible()
})
