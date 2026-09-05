import { expect, test } from '@playwright/test'
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

// F022 · T5: E2E del feed de actividad de los usuarios seguidos.
//
// B (seguido) se crea vía createAuthUserWithUsuario con username conocido y
// con actividad insertada por service_role: una valoración (nota 8) sobre
// e2e-01 (serie aprobada del fixture) y una lista pública con esa serie. A
// (seguidor) se crea igual para seguir a B y ver su actividad. El flujo se
// ejecuta con A con sesión vía UI (login), igual que follows/valoraciones
// (workers = 1: el fixture se comparte). El cleanup borra A y B por cascade:
// auth.users → public.usuario → usuario_usuario (ambas direcciones),
// valoracion, lista y lista_serie.

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const RUN_ID = Date.now()
const EMAIL_A = `e2e-fsu-a-${RUN_ID}@iswdb.local`
const EMAIL_B = `e2e-fsu-b-${RUN_ID}@iswdb.local`
const PASSWORD = TEST_PASSWORD
// e2e-01 es una serie aprobada del fixture sin valoraciones ni follows
// iniciales.
const SLUG_VALORADA = slugSerie(1)
const NOMBRE_LISTA = 'Lista FSU B'

const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function unwrap<T>(p: PromiseLike<PostgrestSingleResponse<T>>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

let userAId: string
let userBId: string
let usernameB: string

test.beforeAll(async () => {
  userBId = await createAuthUserWithUsuario(EMAIL_B)
  userAId = await createAuthUserWithUsuario(EMAIL_A)
  usernameB = usernameDesdeEmail(EMAIL_B, userBId)

  // Actividad de B vía service_role: valoración 8 sobre e2e-01 y lista
  // pública con esa serie aprobada.
  const serie = await unwrap(
    db.from('serie').select('id').eq('slug', SLUG_VALORADA).single()
  )
  await unwrap(
    db.from('valoracion').insert({ user_id: userBId, serie_id: serie.id, nota: 8 })
  )
  const lista = await unwrap(
    db
      .from('lista')
      .insert({ user_id: userBId, nombre: NOMBRE_LISTA, es_publica: true })
      .select('id')
      .single()
  )
  await unwrap(
    db.from('lista_serie').insert({ lista_id: lista.id, serie_id: serie.id, posicion: 1 })
  )
})

test.afterAll(async () => {
  // Cascade: auth.users → public.usuario → usuario_usuario (ambas
  // direcciones), valoracion, lista y lista_serie.
  await deleteAuthUserByEmail(EMAIL_B)
  await deleteAuthUserByEmail(EMAIL_A)
})

test('FSU flujo completo: seguir → feed con actividad → dejar de seguir → feed vacío', async ({
  page
}) => {
  // Login de A vía UI.
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL_A)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil/)

  // Perfil B: "Seguir" → click → "Siguiendo" + contador "Seguidores 1".
  await page.goto(`/usuarios/${usernameB}`)
  const seguir = page.getByRole('button', { name: 'Seguir', exact: true })
  await expect(seguir).toBeVisible()
  await seguir.click()
  await expect(page.getByRole('button', { name: 'Siguiendo', exact: true })).toBeVisible()
  await expect(page.getByText(/Seguidores 1/)).toBeVisible()

  // /feed muestra la actividad de B (valoración y lista pública).
  await page.goto('/feed')
  await expect(page.getByText('Valoró Serie e2e 1 con 8/10')).toBeVisible()
  await expect(page.getByText(`Creó la lista ${NOMBRE_LISTA}`)).toBeVisible()

  // Volver al perfil B → "Siguiendo" → click → "Seguir".
  await page.goto(`/usuarios/${usernameB}`)
  const siguiendo = page.getByRole('button', { name: 'Siguiendo', exact: true })
  await expect(siguiendo).toBeVisible()
  await siguiendo.click()
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible()

  // /feed sin la actividad de B → empty state.
  await page.goto('/feed')
  await expect(page.getByText('Tu feed está vacío')).toBeVisible()
  await expect(page.getByText('Valoró Serie e2e 1 con 8/10')).toHaveCount(0)

  // Propio perfil: NO muestra el botón "Seguir" (esPropio).
  const usernameA = usernameDesdeEmail(EMAIL_A, userAId)
  await page.goto(`/usuarios/${usernameA}`)
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Siguiendo', exact: true })).toHaveCount(0)
})

test('FSU-07: /feed sin sesión redirige a /login', async ({ page }) => {
  await page.goto('/feed')
  await page.waitForURL(/\/login\?next=%2Ffeed/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})
