import { expect, test, type Page } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  createModUser,
  deleteAuthUser,
  getUserIdByEmail,
  slugSerie,
  TEST_PASSWORD
} from './global-setup'

// F012 · T4: E2E de reseñas.
//
// Orden dentro del archivo (importa: cada test usa contexto/cookies frescos,
// el estado compartido vive en la BD):
//   1. RES-05 anónimo.
//   2. RES-06 con sesión pero sin valoración (usuario B).
//   3. Flujo completo en un único test (usuario A se registra vía UI → valora
//      → crea → edita → elimina; sin recargas; la valoración sobrevive).
//   4. A crea una reseña que alimenta los tests de moderación.
//   5. Usuario normal (B) ve la reseña de A sin botón Eliminar.
//   6. Mod borra la reseña de A (RES-09).
// El test de mod va al final porque destruye la reseña que el test 5 observa.
//
// Orden alfabético entre archivos: resenas.spec.ts corre antes que
// valoraciones.spec.ts. El afterAll borra los auth users y la cascada
// usuario → valoracion/reseña deja e2e-01 sin valoraciones ni reseñas
// residuales (crítico para valoraciones.spec.ts).

const RUN_ID = Date.now()
const EMAIL_A = `e2e-res-a-${RUN_ID}@iswdb.local`
const EMAIL_B = `e2e-res-b-${RUN_ID}@iswdb.local`
const EMAIL_MOD = `e2e-res-mod-${RUN_ID}@iswdb.local`
const SLUG_FICHA = slugSerie(1) // e2e-01: sin valoraciones en el fixture.
const RESEÑA_A =
  'Reseña E2E de prueba: la serie me ha parecido muy buena y merece la pena verla completa.'
const RESEÑA_EDITADA =
  'Reseña E2E editada: actualizo mi opinión tras revisarla de nuevo, sigue mereciendo la pena.'
const EMAIL_A_TRUNCADO = 'e***@iswdb.local'

let userBId: string
let modId: string

test.beforeAll(async () => {
  // A se registra vía UI en el flujo completo; aquí solo B y el mod.
  userBId = await createAuthUserWithUsuario(EMAIL_B)
  modId = await createModUser(EMAIL_MOD)
})

test.afterAll(async () => {
  // deleteAuthUser borra el auth user; la cascada (M2) borra la fila de
  // public.usuario y con ella valoracion/reseña. A se resolvió por email al
  // haberse registrado vía UI.
  const userAId = await getUserIdByEmail(EMAIL_A)
  if (userAId) await deleteAuthUser(userAId)
  await deleteAuthUser(userBId)
  await deleteAuthUser(modId)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil/)
}

test('RES-05 sin sesión: "Inicia sesión para reseñar" con link a /login', async ({ page }) => {
  await page.goto(`/series/${SLUG_FICHA}`)
  const link = page.getByRole('link', { name: 'Inicia sesión para reseñar' })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', /^\/login\?next=%2Fseries%2Fe2e-01&msg=/)
  await expect(page.getByLabel('Tu reseña')).toHaveCount(0)
})

test('RES-06 con sesión pero sin valoración: mensaje + ancla al selector', async ({ page }) => {
  await login(page, EMAIL_B)
  await page.goto(`/series/${SLUG_FICHA}`)
  await expect(page.getByText('Debes valorar la serie antes de reseñarla')).toBeVisible()
  const ancla = page.getByRole('link', { name: 'Ir al selector de valoración' })
  await expect(ancla).toBeVisible()
  await expect(ancla).toHaveAttribute('href', '#valoraciones-heading')
  await expect(page.getByLabel('Tu reseña')).toHaveCount(0)
})

test('Flujo completo: registro → valorar → crear → editar → eliminar sin recargas (RES-01/03/04)', async ({
  page
}) => {
  // Registro vía UI (auto-login, como auth.spec.ts).
  await page.goto('/registro')
  await page.getByLabel('Email').fill(EMAIL_A)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await page.waitForURL(/\/perfil/)

  await page.goto(`/series/${SLUG_FICHA}`)

  // Sin valoración todavía → RES-06.
  await expect(page.getByText('Debes valorar la serie antes de reseñarla')).toBeVisible()

  // Valorar con 8 → el form se desbloquea (router.refresh, navegación suave).
  const grupo = page.getByRole('group', { name: 'Tu valoración' })
  await grupo.getByRole('button', { name: '8', exact: true }).click()
  await expect(page.getByText('8.0 · 1 valoración', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Tu reseña')).toBeVisible()

  // RES-01 "sin recargar la página": solo navegaciones suaves a partir de aquí.
  let recargas = 0
  page.on('load', () => {
    recargas += 1
  })

  // Crear reseña (≥50 chars) → aparece en la lista con el autor truncado.
  await page.getByLabel('Tu reseña').fill(RESEÑA_A)
  await expect(page.getByText(/\/2000 caracteres/)).toBeVisible()
  await page.getByRole('button', { name: 'Publicar reseña' }).click()
  await expect(page.getByText(RESEÑA_A)).toBeVisible()
  await expect(page.getByText(EMAIL_A_TRUNCADO)).toBeVisible()

  // El form pasa a modo edición inline.
  await expect(page.getByLabel('Edita tu reseña')).toBeVisible()

  // Editar → el contenido se actualiza en la lista.
  await page.getByLabel('Edita tu reseña').fill(RESEÑA_EDITADA)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText(RESEÑA_EDITADA)).toBeVisible()
  await expect(page.getByText(RESEÑA_A)).toHaveCount(0)

  // Eliminar (dueño) → desaparece; la valoración permanece intacta (RES-04).
  // exact: el botón de borrar valoración se llama "Eliminar valoración" y el
  // matching de name es por subcadena.
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(page.getByText(RESEÑA_EDITADA)).toHaveCount(0)
  await expect(page.getByText('Aún no hay reseñas')).toBeVisible()
  await expect(page.getByText('8.0 · 1 valoración', { exact: true })).toBeVisible()

  expect(recargas).toBe(0)
})

test('A crea la reseña para los tests de moderación', async ({ page }) => {
  await login(page, EMAIL_A)
  await page.goto(`/series/${SLUG_FICHA}`)
  // A conserva su valoración (8) del flujo completo y ya no tiene reseña.
  await expect(page.getByLabel('Tu reseña')).toBeVisible()
  await page.getByLabel('Tu reseña').fill(RESEÑA_A)
  await page.getByRole('button', { name: 'Publicar reseña' }).click()
  await expect(page.getByText(RESEÑA_A)).toBeVisible()
  await expect(page.getByText(EMAIL_A_TRUNCADO)).toBeVisible()
})

test('Usuario normal no ve el botón Eliminar en reseña ajena', async ({ page }) => {
  await login(page, EMAIL_B)
  await page.goto(`/series/${SLUG_FICHA}`)
  // B ve la reseña de A (autor truncado + contenido)…
  await expect(page.getByText(RESEÑA_A)).toBeVisible()
  await expect(page.getByText(EMAIL_A_TRUNCADO)).toBeVisible()
  // …pero sin botón Eliminar (no es dueño ni mod/admin). exact: evita
  // colisión con "Eliminar valoración" (matching por subcadena).
  await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(0)
})

test('Mod borra reseña ajena (RES-09)', async ({ page }) => {
  await login(page, EMAIL_MOD)
  await page.goto(`/series/${SLUG_FICHA}`)
  await expect(page.getByText(RESEÑA_A)).toBeVisible()
  const boton = page.getByRole('button', { name: 'Eliminar', exact: true })
  await expect(boton).toBeVisible()
  await boton.click()
  await expect(page.getByText(RESEÑA_A)).toHaveCount(0)
  await expect(page.getByText('Aún no hay reseñas')).toBeVisible()
})
