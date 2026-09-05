import { expect, test, type Page } from '@playwright/test'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  TEST_PASSWORD,
  usernameDesdeEmail
} from './global-setup'

// F023 · T5: E2E de notificaciones de nuevos seguidores.
//
// A (seguidor) y B (seguido) se crean vía createAuthUserWithUsuario con
// username conocido. El flujo UI sigue el patrón de follows/notificaciones
// (workers = 1): login con A → seguir a B → login con B → badge +
// /perfil/notificaciones con icono UserPlus y link al perfil de A → marcar
// leída → badge desaparece. Test 2 verifica NOT-11 (cada follow notifica; el
// refollow crea una fila nueva, no sobrescribe). Test 3 verifica que el
// autofollow no genera notificaciones (CHECK M15 + app-side).
// El cleanup borra A y B: cascade auth.users → public.usuario →
// notificacion (usuario_id y seguidor_id on delete cascade) y usuario_usuario
// en ambas direcciones.

const RUN_ID = Date.now()
const EMAIL_A = `e2e-nsf-a-${RUN_ID}@iswdb.local`
const EMAIL_B = `e2e-nsf-b-${RUN_ID}@iswdb.local`
const PASSWORD = TEST_PASSWORD

let userAId: string
let userBId: string
let usernameA: string
let usernameB: string

test.beforeAll(async () => {
  userAId = await createAuthUserWithUsuario(EMAIL_A)
  userBId = await createAuthUserWithUsuario(EMAIL_B)
  usernameA = usernameDesdeEmail(EMAIL_A, userAId)
  usernameB = usernameDesdeEmail(EMAIL_B, userBId)
})

test.afterAll(async () => {
  await deleteAuthUserByEmail(EMAIL_A)
  await deleteAuthUserByEmail(EMAIL_B)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil/)
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.waitForURL(/\/$/)
}

test.describe('Notificaciones de seguidores (NS)', () => {
  test('NS flujo completo: seguir → badge → notificación con UserPlus y link → marcar leída', async ({
    page
  }) => {
    // A sigue a B.
    await login(page, EMAIL_A)
    await page.goto(`/usuarios/${usernameB}`)
    await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Seguir', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Siguiendo', exact: true })).toBeVisible()

    // Logout de A → login de B.
    await logout(page)
    await login(page, EMAIL_B)

    // Badge del header con ≥1 notificación.
    await page.goto('/')
    await expect(page.getByLabel(/notificaciones sin leer/)).toBeVisible()

    // /perfil/notificaciones: ítem "ahora te sigue" con UserPlus y link a A.
    await page.goto('/perfil/notificaciones')
    const item = page.locator('li').filter({ hasText: /ahora te sigue/ })
    await expect(item).toHaveCount(1)
    await expect(item.locator('svg.lucide-user-plus')).toBeVisible()
    const linkA = item.getByRole('link', { name: `@${usernameA}` })
    await expect(linkA).toHaveAttribute('href', `/usuarios/${usernameA}`)

    // Click en el link → perfil de A.
    await linkA.click()
    await page.waitForURL(new RegExp(`/usuarios/${usernameA}$`))
    await expect(page.getByRole('heading', { name: usernameA })).toBeVisible()

    // Marcar leída → botón desaparece → badge desaparece (única notificación).
    await page.goto('/perfil/notificaciones')
    await page.getByRole('button', { name: 'Marcar como leída' }).click()
    await expect(page.getByRole('button', { name: 'Marcar como leída' })).toHaveCount(0)

    await page.goto('/')
    await expect(page.getByLabel(/notificaciones sin leer/)).toHaveCount(0)
  })

  test('NS no idempotente (NOT-11): refollow → 2 notificaciones sin sobrescribir', async ({
    page
  }) => {
    // A deja de seguir a B y lo sigue de nuevo (la notificación de T1/NS
    // sigue en la BD; el refollow añade una fila nueva).
    await login(page, EMAIL_A)
    await page.goto(`/usuarios/${usernameB}`)
    await expect(page.getByRole('button', { name: 'Siguiendo', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Siguiendo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Seguir', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Siguiendo', exact: true })).toBeVisible()

    // Logout de A → login de B: dos notificaciones de A.
    await logout(page)
    await login(page, EMAIL_B)
    await page.goto('/perfil/notificaciones')
    await expect(page.locator('li').filter({ hasText: /ahora te sigue/ })).toHaveCount(2)
  })

  test('NS auto-follow no notifica: perfil propio sin botón Seguir y sin notificaciones', async ({
    page
  }) => {
    await login(page, EMAIL_A)

    // Propio perfil: sin botón Seguir/Siguiendo (esPropio).
    await page.goto(`/usuarios/${usernameA}`)
    await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Siguiendo', exact: true })).toHaveCount(0)

    // A no recibe notificaciones de sí mismo.
    await page.goto('/perfil/notificaciones')
    await expect(page.getByText('No tienes notificaciones')).toBeVisible()
    await expect(page.locator('li').filter({ hasText: /ahora te sigue/ })).toHaveCount(0)
  })
})
