import { expect, test } from '@playwright/test'

import {
  createAuthUser,
  deleteAuthUser,
  slugSerie,
  TEST_PASSWORD
} from './global-setup'

// Usuario único por ejecución. Se crea SOLO en GoTrue (createAuthUser, sin
// fila en public.usuario) para cubrir el self-healing del fix F018/T3:
// accionSeguir llama a asegurarFilaUsuario antes de insertar el follow, así
// que seguir una serie sin haber visitado /perfil crea la fila de usuario.
// El cleanup borra el auth user; la FK cascade cubre la fila public.usuario
// y los follows (usuario_serie).
const RUN_ID = Date.now()
const EMAIL_FOLLOW = `e2e-fol-${RUN_ID}@iswdb.local`
// e2e-01 es una serie aprobada del fixture sin follows iniciales.
const SLUG_FICHA = slugSerie(1)

let followUserId: string

test.beforeAll(async () => {
  followUserId = await createAuthUser(EMAIL_FOLLOW)
})

test.afterAll(async () => {
  // Cascade: auth.users → public.usuario → usuario_serie.
  await deleteAuthUser(followUserId)
})

test.describe('Follow (FOL)', () => {
  // Flujo completo en un único test: las cookies de sesión solo viven dentro
  // del contexto de un test() (mismo patrón que auth/valoraciones; workers=1
  // serializa). El usuario no tiene fila en public.usuario antes de llegar:
  // el self-healing de accionSeguir debe crearla sin FK error.
  test('FOL flujo completo: seguir → visible en /perfil/seguidas → dejar de seguir', async ({
    page
  }) => {
    // Login vía UI con el usuario creado en beforeAll.
    await page.goto('/login')
    await page.getByLabel('Email').fill(EMAIL_FOLLOW)
    await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await page.waitForURL(/\/perfil/)

    // Ficha de la serie aprobada: botón "Seguir" inicial.
    await page.goto(`/series/${SLUG_FICHA}`)
    const seguir = page.getByRole('button', { name: 'Seguir', exact: true })
    await expect(seguir).toBeVisible()
    await seguir.click()

    // Botón cambia a "Siguiendo" sin error de FK (self-healing).
    await expect(page.getByRole('button', { name: 'Siguiendo', exact: true })).toBeVisible()

    // Navegar a /perfil/seguidas → serie visible con título y link.
    await page.goto('/perfil/seguidas')
    const tarjeta = page.getByRole('link', { name: 'Serie e2e 1' })
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta).toHaveAttribute('href', `/series/${SLUG_FICHA}`)

    // Volver a la ficha → click "Siguiendo" → botón cambia a "Seguir".
    await page.goto(`/series/${SLUG_FICHA}`)
    const siguiendo = page.getByRole('button', { name: 'Siguiendo', exact: true })
    await expect(siguiendo).toBeVisible()
    await siguiendo.click()
    await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible()

    // Volver a /perfil/seguidas → la serie ya no es visible (empty state).
    await page.goto('/perfil/seguidas')
    await expect(page.getByRole('link', { name: 'Serie e2e 1' })).toHaveCount(0)
    await expect(page.getByText('Aún no sigues ninguna serie')).toBeVisible()
  })

  test('FOL-05: /perfil/seguidas sin sesión redirige a /login', async ({ page }) => {
    await page.goto('/perfil/seguidas')
    await page.waitForURL(/\/login\?next=%2Fperfil%2Fseguidas/)
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  })
})
