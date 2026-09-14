import { expect, test, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  slugSerie,
  TEST_PASSWORD
} from './global-setup'

// F027 · T4: E2E de likes en reseñas.
//
// Orden dentro del archivo (importa: cada test usa contexto/cookies frescos,
// el estado compartido vive en la BD):
//   1. Sin sesión: contador "0" visible y botón "Útil" deshabilitado en la
//      ficha /series/e2e-01 y en /resenas/<id> (LIKE-04/06).
//   2. B da like y lo quita desde la ficha: contador 1→0, icono relleno→vacío
//      (LIKE-01/02/03). Al acabar B no deja like.
//   3. B deja like en la ficha → en /resenas/<id> el contador llega
//      sincronizado (revalidación de ambas rutas).
//   4. A da like a su propia reseña → contador 1 (auto-like, LIKE-07).
//   5. B con doble click rápido no duplica (UNIQUE idempotente, LIKE-05): la
//      BD acaba con 1 fila de B como máximo y el contador coincide con el
//      conteo real (nunca 3).
//
// El setup inyecta la reseña de A por service-role (la UI exige valoración
// previa, RES-07; ese flujo ya lo cubre resenas.spec.ts). El cleanup con
// deleteAuthUserByEmail cascada auth.users → public.usuario → reseña_like /
// reseña, así que e2e-01 queda sin likes ni reseñas residuales.

const RUN_ID = Date.now()
const EMAIL_A = `e2e-likes-a-${RUN_ID}@iswdb.local`
const EMAIL_B = `e2e-likes-b-${RUN_ID}@iswdb.local`

const RESEÑA_A =
  'Reseña E2E de likes: una opinión detallada y con varios argumentos sobre la serie para probar el contador de útiles.'

const SLUG_FICHA = slugSerie(1) // e2e-01: serie aprobada del fixture.

// Claves públicas de desarrollo local de Supabase (no son secretos:
// las imprime `supabase status` y son iguales en todo proyecto local).
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const dbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

let userAId: string
let userBId: string
let reseñaAId: string

test.beforeAll(async () => {
  userAId = await createAuthUserWithUsuario(EMAIL_A)
  userBId = await createAuthUserWithUsuario(EMAIL_B)

  const serie = await dbAdmin.from('serie').select('id').eq('slug', SLUG_FICHA).single()
  if (serie.error) throw new Error(`serie e2e-01: ${serie.error.message}`)

  const reseña = await dbAdmin
    .from('reseña')
    .insert({ user_id: userAId, serie_id: serie.data.id, contenido: RESEÑA_A })
    .select('id')
    .single()
  if (reseña.error) throw new Error(`reseña: ${reseña.error.message}`)
  reseñaAId = reseña.data.id
})

test.afterAll(async () => {
  // La cascada cubre reseña_like, reseña y comentarios (auth.users → usuario).
  await deleteAuthUserByEmail(EMAIL_B)
  await deleteAuthUserByEmail(EMAIL_A)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil/)
}

// El span del contador usa aria-label "<N> útiles": selector por atributo.
function contador(boton: Locator): Locator {
  return boton.locator('span[aria-label]')
}

async function botonUtil(page: Page): Promise<Locator> {
  const boton = page
    .locator('article')
    .filter({ hasText: RESEÑA_A })
    .getByRole('button', { name: /Útil/ })
  await expect(boton).toBeVisible()
  return boton
}

async function likesEnBd(): Promise<number> {
  const { data } = await dbAdmin
    .from('reseña_like')
    .select('reseña_id')
    .eq('reseña_id', reseñaAId)
  return (data ?? []).length
}

// Espera a que el conteo en BD se estabilice tras las actions (el doble click
// dispara 1-2 de ellas; el UNIQUE las hace idempotentes). Dos mediciones
// consecutivas iguales = acciones asentadas.
async function likesBdEstable(page: Page): Promise<number> {
  let prev = -1
  let estable = 0
  for (let i = 0; i < 15; i++) {
    const ahora = await likesEnBd()
    if (ahora === prev) {
      estable += 1
      if (estable >= 2) return ahora
    } else {
      estable = 0
    }
    prev = ahora
    await page.waitForTimeout(300)
  }
  return prev
}

test('LIKE-06 sin sesión: contador visible y botón "Útil" deshabilitado en ficha y en /resenas/<id>', async ({
  page
}) => {
  await page.goto(`/series/${SLUG_FICHA}`)
  const boton = await botonUtil(page)
  await expect(boton).toBeDisabled()
  await expect(boton).toHaveAttribute('title', 'Inicia sesión para votar')
  await expect(contador(boton)).toHaveText('0')
  await expect(contador(boton)).toHaveAttribute('aria-label', '0 útiles')

  await page.goto(`/resenas/${reseñaAId}`)
  const botonReseña = page.getByRole('button', { name: /Útil/ })
  await expect(botonReseña).toBeVisible()
  await expect(botonReseña).toBeDisabled()
  await expect(contador(botonReseña)).toHaveText('0')
})

test('LIKE-01/02/03: B da like (contador 1, icono relleno) y lo quita (contador 0, icono vacío)', async ({
  page
}) => {
  await login(page, EMAIL_B)
  await page.goto(`/series/${SLUG_FICHA}`)

  const boton = await botonUtil(page)
  await expect(boton).toBeEnabled()
  await boton.click()
  await expect(contador(boton)).toHaveText('1')
  await expect(boton.locator('svg')).toHaveAttribute('fill', 'currentColor')

  await boton.click()
  await expect(contador(boton)).toHaveText('0')
  await expect(boton.locator('svg')).toHaveAttribute('fill', 'none')

  // Espera a que el dar/quitar de B asiente en BD (0 likes finales).
  expect(await likesBdEstable(page)).toBe(0)
})

test('LIKE: like en la ficha → contador sincronizado en /resenas/<id>', async ({ page }) => {
  await login(page, EMAIL_B)
  await page.goto(`/series/${SLUG_FICHA}`)

  const boton = await botonUtil(page)
  await expect(boton).toBeEnabled()
  await boton.click()
  await expect(contador(boton)).toHaveText('1')
  await expect.poll(async () => likesEnBd()).toBe(1)

  await page.goto(`/resenas/${reseñaAId}`)
  const botonReseña = page.getByRole('button', { name: /Útil/ })
  await expect(botonReseña).toBeEnabled()
  await expect(contador(botonReseña)).toHaveText('1')

  await botonReseña.click()
  await expect(contador(botonReseña)).toHaveText('0')
  await expect.poll(async () => likesEnBd()).toBe(0)
})

test('LIKE-07: A da like a su propia reseña (auto-like) → contador 1', async ({ page }) => {
  await login(page, EMAIL_A)
  await page.goto(`/series/${SLUG_FICHA}`)

  const boton = await botonUtil(page)
  await expect(boton).toBeEnabled()
  await boton.click()
  await expect(contador(boton)).toHaveText('1')
  await expect(boton.locator('svg')).toHaveAttribute('fill', 'currentColor')
})

test('LIKE-05: doble click rápido de B no duplica el like (UNIQUE idempotente)', async ({ page }) => {
  await login(page, EMAIL_B)
  await page.goto(`/series/${SLUG_FICHA}`)

  // Tras el test anterior, A dejó 1 like; B aún no ha votado (contador = 1).
  const boton = await botonUtil(page)
  await expect(contador(boton)).toHaveText('1')
  await boton.dblclick({ delay: 10 })

  // El doble click manda 1-2 actions "dar" de B; el UNIQUE debe dejar como
  // mucho 1 fila de B y el contador final nunca superar 2 (A + B).
  const total = await likesBdEstable(page)
  expect(total).toBeGreaterThanOrEqual(1)
  expect(total).toBeLessThanOrEqual(2)
  const { data: filasB } = await dbAdmin
    .from('reseña_like')
    .select('reseña_id')
    .eq('reseña_id', reseñaAId)
    .eq('user_id', userBId)
  expect((filasB ?? []).length).toBeLessThanOrEqual(1)

  // Tras recargar, el contador de la UI coincide con el conteo real en BD.
  await page.reload()
  const botonFinal = await botonUtil(page)
  await expect(contador(botonFinal)).toHaveText(String(total))
  await expect(contador(botonFinal)).toHaveAttribute('aria-label', `${total} útiles`)
})
