import { expect, test } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  deleteAuthUser,
  FIXTURE,
  slugSerie,
  TEST_PASSWORD
} from './global-setup'

// Usuario único por ejecución (createAuthUserWithUsuario = auth user + fila
// public.usuario, FK de valoracion). El cleanup borra el auth user; la FK
// cascade cubre public.usuario y las valoraciones creadas en el flujo.
const RUN_ID = Date.now()
const EMAIL_VALORACION = `e2e-val-${RUN_ID}@iswdb.local`
// e2e-01 no tiene notas en el fixture: el agregado parte de "Sin valoraciones"
// y cada paso del flujo (valorar → cambiar → eliminar) es observable.
const SLUG_FICHA = slugSerie(1)

let valoracionUserId: string

test.beforeAll(async () => {
  valoracionUserId = await createAuthUserWithUsuario(EMAIL_VALORACION)
})

test.afterAll(async () => {
  // Cascade: auth.users → public.usuario → valoracion.
  await deleteAuthUser(valoracionUserId)
})

test.describe('Valoraciones', () => {
  // Flujo completo en un único test: las cookies de sesión solo viven dentro
  // del contexto de un test() (mismo patrón que auth.spec; workers=1 serializa).
  test('flujo completo: valorar → cambiar → eliminar sin recarga (VAL-01/VAL-02)', async ({
    page
  }) => {
    // Login vía UI con el usuario creado en beforeAll.
    await page.goto('/login')
    await page.getByLabel('Email').fill(EMAIL_VALORACION)
    await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await page.waitForURL(/\/perfil/)

    await page.goto(`/series/${SLUG_FICHA}`)
    const grupo = page.getByRole('group', { name: 'Tu valoración' })
    await expect(grupo).toBeVisible()
    await expect(grupo.getByRole('button')).toHaveCount(10)

    // Estado inicial: e2e-01 sin valoraciones en el fixture.
    await expect(page.getByText('Sin valoraciones', { exact: true })).toBeVisible()
    await expect(page.getByText('Sin valoraciones todavía')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Eliminar valoración' })).toHaveCount(0)

    // VAL-01 "sin recargar": tras los clicks solo hay soft navigations
    // (server action + router.refresh()); una recarga completa dispararía
    // otro evento load.
    let recargas = 0
    page.on('load', () => {
      recargas += 1
    })

    // Valorar 8 → agregado e histograma se actualizan; botón 8 queda activo.
    await grupo.getByRole('button', { name: '8', exact: true }).click()
    await expect(page.getByText('8.0 · 1 valoración', { exact: true })).toBeVisible()
    await expect(page.getByRole('listitem', { name: '8 estrellas: 1 votos' })).toBeVisible()
    await expect(grupo.getByRole('button', { name: '8', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    // Cambiar a 9 → upsert: el agregado y el histograma reflejan la nueva nota.
    await grupo.getByRole('button', { name: '9', exact: true }).click()
    await expect(page.getByText('9.0 · 1 valoración', { exact: true })).toBeVisible()
    await expect(page.getByRole('listitem', { name: '9 estrellas: 1 votos' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: '8 estrellas: 0 votos' })).toBeVisible()
    await expect(grupo.getByRole('button', { name: '9', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(grupo.getByRole('button', { name: '8', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    // Eliminar → agregado e histograma vuelven al estado inicial.
    await page.getByRole('button', { name: 'Eliminar valoración' }).click()
    await expect(page.getByText('Sin valoraciones', { exact: true })).toBeVisible()
    await expect(page.getByText('Sin valoraciones todavía')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Eliminar valoración' })).toHaveCount(0)
    await expect(grupo.getByRole('button', { pressed: true })).toHaveCount(0)

    expect(recargas).toBe(0)
  })

  test('sin sesión → AUTH-06: "Inicia sesión para valorar" con link a /login', async ({
    page
  }) => {
    await page.goto(`/series/${SLUG_FICHA}`)
    const link = page.getByRole('link', { name: 'Inicia sesión para valorar' })
    await expect(link).toBeVisible()
    // next conserva la ficha de vuelta (AUTH-06); el msg lo pinta /login.
    await expect(link).toHaveAttribute('href', /^\/login\?next=%2Fseries%2Fe2e-01&msg=/)
  })

  test('histograma: barras 10→1 con los conteos del fixture', async ({ page }) => {
    // e2e-01 no tiene notas en el fixture (su histograma se cubre en el flujo
    // completo); el histograma con datos del seed se verifica en e2e-10, la
    // del hero: notas 10 y 9 → una barra de cada, el resto a cero.
    await page.goto(`/series/${slugSerie(10)}`)
    const filas = page.getByRole('listitem', { name: /estrellas: \d+ votos/ })
    await expect(filas).toHaveCount(10)
    await expect(filas.first()).toHaveAttribute('aria-label', '10 estrellas: 1 votos')
    await expect(filas.last()).toHaveAttribute('aria-label', '1 estrellas: 0 votos')
    await expect(page.getByRole('listitem', { name: '9 estrellas: 1 votos' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: '8 estrellas: 0 votos' })).toBeVisible()
  })

  test('serie pendiente → 404: no se puede valorar porque no se puede ver', async ({ page }) => {
    // El rechazo de VAL-07 queda cubierto a nivel de servicio (T3); en la UI
    // la ficha de una serie pendiente directamente no existe (FIC-04).
    const respuesta = await page.goto(`/series/${FIXTURE.slugPendiente}`)
    expect(respuesta?.status()).toBe(404)
    await expect(page.getByText('Página no encontrada')).toBeVisible()
  })
})
