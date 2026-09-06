import { expect, test, type Page } from '@playwright/test'
import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient
} from '@supabase/supabase-js'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  slugSerie,
  TEST_PASSWORD,
  usernameDesdeEmail
} from './global-setup'

// F025 · T4: E2E de comentarios en reseñas.
//
// Orden dentro del archivo (importa: cada test usa contexto/cookies frescos,
// el estado compartido vive en la BD):
//   1. Sin sesión: desde la ficha /series/e2e-01 el link "Comentar" de la
//      reseña de A navega a /resenas/<id> (COM-07) y la sección "Comentarios"
//      se renderiza sin form + aviso de solo lectura (COM-04).
//   2. B (sesión): añade comentario → visible con su username → edita inline →
//      contenido actualizado → borra → desaparece (COM-01/02/03).
//   3. B crea otro comentario para el test 4 (el flujo 2 lo borró todo;
//      patrón resenas.spec.ts).
//   4. C (ajeno): ve el comentario de B sin botones Editar/Borrar (COM-05) y
//      el link "Comentar" del perfil público /usuarios/<usernameB> navega a
//      /resenas/<id> (COM-08).
//
// El setup inyecta las reseñas por service-role (la UI exige valoración
// previa, RES-07; ese flujo ya lo cubre resenas.spec.ts): A en e2e-01 (la que
// se comenta) y B en e2e-02 (para que su perfil tenga el link COM-08). El
// cleanup con deleteAuthUserByEmail cascada auth.users → public.usuario →
// reseña/comentario, así que e2e-01 queda sin reseñas residuales para
// resenas.spec.ts (corre más tarde por orden alfabético).

const RUN_ID = Date.now()
const EMAIL_A = `e2e-com-a-${RUN_ID}@iswdb.local`
const EMAIL_B = `e2e-com-b-${RUN_ID}@iswdb.local`
const EMAIL_C = `e2e-com-c-${RUN_ID}@iswdb.local`

const RESEÑA_A =
  'Reseña E2E de la serie de prueba: una opinión amplia y con varios detalles sobre la serie para poder comentarla.'
const RESEÑA_B =
  'Reseña E2E de B: otra opinión sobre una serie del fixture para que el perfil público tenga un enlace a comentar.'
const COM_B_INICIAL = 'Comentario E2E de B: la reseña me ha parecido muy completa y bien explicada.'
const COM_B_EDITADO =
  'Comentario E2E de B editado: añado más detalle porque me ha convencido aún más la reseña.'
const COM_B_PERSISTENTE =
  'Comentario E2E de B persistente: otra opinión para comprobar los permisos con un tercer usuario.'

// Claves públicas de desarrollo local de Supabase (no son secretos:
// las imprime `supabase status` y son iguales en todo proyecto local).
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

async function unwrap<T>(p: PromiseLike<PostgrestSingleResponse<T>>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

let userAId: string
let userBId: string
let usernameB: string
let reseñaAId: string
let reseñaBId: string

test.beforeAll(async () => {
  userAId = await createAuthUserWithUsuario(EMAIL_A)
  userBId = await createAuthUserWithUsuario(EMAIL_B)
  await createAuthUserWithUsuario(EMAIL_C)
  usernameB = usernameDesdeEmail(EMAIL_B, userBId)

  const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const serie1 = (await unwrap(
    db.from('serie').select('id').eq('slug', slugSerie(1)).single()
  )) as { id: string }
  const serie2 = (await unwrap(
    db.from('serie').select('id').eq('slug', slugSerie(2)).single()
  )) as { id: string }

  reseñaAId = (
    (await unwrap(
      db
        .from('reseña')
        .insert({ user_id: userAId, serie_id: serie1.id, contenido: RESEÑA_A })
        .select('id')
        .single()
    )) as { id: string }
  ).id
  reseñaBId = (
    (await unwrap(
      db
        .from('reseña')
        .insert({ user_id: userBId, serie_id: serie2.id, contenido: RESEÑA_B })
        .select('id')
        .single()
    )) as { id: string }
  ).id
})

test.afterAll(async () => {
  // La cascada cubre comentario y reseña (auth.users → public.usuario).
  await deleteAuthUserByEmail(EMAIL_C)
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

test('sin sesión: link de la reseña en la ficha → /resenas/<id> (COM-07) y sección de solo lectura (COM-04)', async ({
  page
}) => {
  await page.goto(`/series/${slugSerie(1)}`)

  // COM-07: la ficha enlaza cada reseña a su página individual.
  const article = page.locator('article').filter({ hasText: RESEÑA_A })
  await expect(article.getByRole('link', { name: 'Comentar' })).toBeVisible()
  await article.getByRole('link', { name: 'Comentar' }).click()
  await page.waitForURL(new RegExp(`/resenas/${reseñaAId}$`))

  // COM-04: sección visible, sin form y con el aviso de solo lectura (anon).
  await expect(page.getByRole('heading', { name: 'Comentarios' })).toBeVisible()
  await expect(page.getByText(/los comentarios son de solo lectura sin sesión/)).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
})

test('B con sesión: añade → edita inline → borra su comentario (COM-01/02/03)', async ({ page }) => {
  await login(page, EMAIL_B)
  await page.goto(`/resenas/${reseñaAId}`)

  // COM-01: añade el comentario y aparece con su username.
  await page.getByPlaceholder('Escribe un comentario…').fill(COM_B_INICIAL)
  await page.getByRole('button', { name: 'Comentar', exact: true }).click()
  await expect(page.getByText(COM_B_INICIAL)).toBeVisible()
  await expect(page.getByRole('link', { name: usernameB })).toBeVisible()

  // COM-02: edición inline con el form prefilled. Sin reload: el textarea de
  // edición tiene id único (comentario-contenido-<id>) y el label "Edita tu
  // comentario" enlaza a él, distinto del form de crear
  // (comentario-contenido-nuevo-<useId>).
  await page.getByRole('button', { name: 'Editar' }).click()
  const editForm = page.locator('form').filter({ hasText: 'Edita tu comentario' })
  await expect(editForm).toBeVisible()
  const textarea = page.getByLabel('Edita tu comentario')
  await expect(textarea).toHaveValue(COM_B_INICIAL)
  await textarea.fill(COM_B_EDITADO)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(COM_B_EDITADO)).toBeVisible()
  await expect(page.getByText(COM_B_INICIAL, { exact: true })).toHaveCount(0)

  // COM-03: borra → el comentario desaparece y vuelve el empty state.
  await page.getByRole('button', { name: 'Borrar' }).click()
  await expect(page.getByText(COM_B_EDITADO, { exact: true })).toHaveCount(0)
  await expect(page.getByText('Aún no hay comentarios')).toBeVisible()
})

test('B deja un comentario para el test de permisos de C', async ({ page }) => {
  await login(page, EMAIL_B)
  await page.goto(`/resenas/${reseñaAId}`)

  await page.getByPlaceholder('Escribe un comentario…').fill(COM_B_PERSISTENTE)
  await page.getByRole('button', { name: 'Comentar', exact: true }).click()
  await expect(page.getByText(COM_B_PERSISTENTE)).toBeVisible()
  await expect(page.getByRole('link', { name: usernameB })).toBeVisible()
})

test('C (ajeno): ve el comentario de B sin Editar/Borrar (COM-05) y el perfil de B enlaza a /resenas/<id> (COM-08)', async ({
  page
}) => {
  await login(page, EMAIL_C)
  await page.goto(`/resenas/${reseñaAId}`)

  // COM-05: el comentario de B se ve con su username pero sin botones.
  await expect(page.getByText(COM_B_PERSISTENTE)).toBeVisible()
  await expect(page.getByRole('link', { name: usernameB })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Borrar' })).toHaveCount(0)

  // COM-08: el perfil público de B enlaza su reseña a su página individual.
  await page.goto(`/usuarios/${usernameB}`)
  const link = page.getByRole('link', { name: 'Comentar' })
  await expect(link).toBeVisible()
  await link.click()
  await page.waitForURL(new RegExp(`/resenas/${reseñaBId}$`))
  await expect(page.getByRole('heading', { name: 'Comentarios' })).toBeVisible()
})
