import { expect, test, type Page } from '@playwright/test'
import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient
} from '@supabase/supabase-js'

import {
  createAuthUserWithUsuario,
  deleteAuthUserByEmail,
  TEST_PASSWORD
} from './global-setup'

// F016 · T7: E2E del dashboard "Mi actividad".
//
// Flujo completo en un único test(): las cookies de sesión solo viven dentro
// del contexto de un test (workers=1 ya serializa el archivo). El usuario se
// crea vía API (createAuthUserWithUsuario) y el seed de actividad se hace con
// un cliente service-role (dbAdmin) sobre series aprobadas del fixture global.
//
// Cleanup (regla de T7: BD limpia tras el archivo): deleteAuthUserByEmail
// cascada auth.users → public.usuario → valoracion/reseña/lista →
// lista_serie. Las 3 propuestas son filas de serie y serie.user_id es
// ON DELETE SET NULL, así que NO se borran por cascade: se eliminan de forma
// explícita por slug. Esto ES obligatorio: el archivo corre primero por
// orden alfabético y la propuesta aprobada añadiría una tarjeta al catálogo,
// rompiendo los conteos de catalogo.spec (F003).

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

const RUN_ID = Date.now()
const EMAIL = `e2e-actividad-${RUN_ID}@iswdb.local`
const LISTA_NOMBRE = 'Mi lista E2E'

// Misma firma que formatFecha en actividad-dashboard.tsx; se ejecuta en el
// mismo runtime/TZ que el servidor de Next, así que la expectativa es
// determinista (mismo resultado esté la máquina en la TZ que esté).
function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

let userId: string
let listaId: string
let serieValoracionSlug: string
let serieValoracionTitulo: string
let serieResenaSlug: string
let serieResenaTitulo: string
let propuestaAprobadaSlug: string

test.beforeAll(async () => {
  const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  userId = await createAuthUserWithUsuario(EMAIL)

  // 4 series aprobadas del fixture global (e2e-01..15): 2 para valoración/
  // reseña y 2 para la lista.
  const series = (await unwrap(
    db
      .from('serie')
      .select('id, slug, titulo')
      .like('slug', 'e2e-%')
      .eq('moderation_status', 'aprobada')
      .limit(4)
  )) as unknown as { id: string; slug: string; titulo: string }[]
  const [s1, s2, s3, s4] = series
  if (!s1 || !s2 || !s3 || !s4) {
    throw new Error('No hay suficientes series aprobadas en el fixture')
  }

  serieValoracionSlug = s1.slug
  serieValoracionTitulo = s1.titulo
  serieResenaSlug = s2.slug
  serieResenaTitulo = s2.titulo

  // 1 valoración propia + la valoración previa que exige la reseña (RES-07).
  // created_at fijo (UTC) para aserciones deterministas de fecha en los tabs.
  await unwrap(
    db.from('valoracion').insert([
      { user_id: userId, serie_id: s1.id, nota: 8, created_at: '2026-01-10T10:00:00+00:00' },
      { user_id: userId, serie_id: s2.id, nota: 7, created_at: '2026-02-20T10:00:00+00:00' }
    ])
  )

  // 1 reseña en la misma serie que su valoración previa (mín. 50 chars).
  await unwrap(
    db.from('reseña').insert({
      user_id: userId,
      serie_id: s2.id,
      contenido:
        'Esta es una reseña de prueba para el E2E de actividad. Tiene más de 50 caracteres para pasar la validación.'
    })
  )

  // 1 lista pública con 2 series del fixture.
  listaId = (
    await unwrap(
      db
        .from('lista')
        .insert({
          user_id: userId,
          nombre: LISTA_NOMBRE,
          descripcion: 'Lista creada por el test E2E',
          es_publica: true
        })
        .select('id')
        .single()
    )
  ).id
  await unwrap(
    db.from('lista_serie').insert([
      { lista_id: listaId, serie_id: s3.id, posicion: 1 },
      { lista_id: listaId, serie_id: s4.id, posicion: 2 }
    ])
  )

  // 3 propuestas del usuario: pendiente, aprobada, rechazada.
  const categoria = await unwrap(db.from('categoria').select('id').limit(1).single())
  const propuestas = (await unwrap(
    db
      .from('serie')
      .insert([
        {
          user_id: userId,
          titulo: 'Propuesta Pendiente E2E',
          slug: `prop-pendiente-${RUN_ID}`,
          categoria_id: categoria.id,
          moderation_status: 'pendiente'
        },
        {
          user_id: userId,
          titulo: 'Propuesta Aprobada E2E',
          slug: `prop-aprobada-${RUN_ID}`,
          categoria_id: categoria.id,
          moderation_status: 'aprobada'
        },
        {
          user_id: userId,
          titulo: 'Propuesta Rechazada E2E',
          slug: `prop-rechazada-${RUN_ID}`,
          categoria_id: categoria.id,
          moderation_status: 'rechazada'
        }
      ])
      .select('id, slug, moderation_status')
  )) as unknown as { slug: string; moderation_status: string }[]
  const aprobada = propuestas.find((p) => p.moderation_status === 'aprobada')
  if (!aprobada) throw new Error('No se pudo crear la propuesta aprobada')
  propuestaAprobadaSlug = aprobada.slug
})

test.afterAll(async () => {
  // Cascade: auth.users → public.usuario → valoracion/reseña/lista →
  // lista_serie; serie.user_id es ON DELETE SET NULL, así que las propuestas
  // NO se borran por cascade y se limpian explícitamente (regla de T7).
  await deleteAuthUserByEmail(EMAIL)
  const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    await unwrap(db.from('serie').delete().like('slug', `prop-%-${RUN_ID}`))
  } catch (error) {
    console.warn(`actividad: no se pudieron borrar las propuestas: ${(error as Error).message}`)
  }
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil$/)
}

test('ACT flujo completo: login → /perfil/actividad → agregados y 4 tabs', async ({ page }) => {
  await login(page, EMAIL)
  await page.goto('/perfil/actividad')
  await page.waitForURL(/\/perfil\/actividad$/)

  // 5 cards de agregados con valores correctos. La reseña exige una
  // valoración previa, así que el total es 2 = (8 + 7)/2 = 7.5 de promedio.
  const resumen = page.locator('section[aria-label="Resumen de actividad"]')
  await expect(resumen.getByText('Valoraciones')).toBeVisible()
  await expect(resumen.getByText('2', { exact: true })).toBeVisible()
  await expect(resumen.getByText('Promedio dado')).toBeVisible()
  await expect(resumen.getByText('7.5', { exact: true })).toBeVisible()
  await expect(resumen.getByText('Reseñas')).toBeVisible()
  await expect(resumen.getByText('Listas')).toBeVisible()
  await expect(resumen.getByText('1', { exact: true })).toHaveCount(2)
  await expect(resumen.getByText('Propuestas')).toBeVisible()
  await expect(resumen.getByText('3', { exact: true })).toBeVisible()

  // Tab Valoraciones: link a /series/<slug>, nota y fecha.
  await page.getByRole('link', { name: 'Valoraciones' }).click()
  const valoraciones = page.locator('#valoraciones')
  await expect(valoraciones).toBeVisible()
  for (const [slug, titulo] of [
    [serieValoracionSlug, serieValoracionTitulo],
    [serieResenaSlug, serieResenaTitulo]
  ] as const) {
    const link = valoraciones.locator(`a[href="/series/${slug}"]`)
    await expect(link).toBeVisible()
    await expect(link).toHaveText(titulo)
  }
  await expect(valoraciones.getByText('8/10')).toBeVisible()
  await expect(valoraciones.getByText('7/10')).toBeVisible()
  await expect(valoraciones.getByText(formatFecha('2026-01-10T10:00:00+00:00'))).toBeVisible()
  await expect(valoraciones.getByText(formatFecha('2026-02-20T10:00:00+00:00'))).toBeVisible()

  // Tab Reseñas: extracto y link a /series/<slug>.
  await page.getByRole('link', { name: 'Reseñas' }).click()
  const reseñas = page.locator('#reseñas')
  await expect(reseñas).toBeVisible()
  await expect(
    reseñas.getByText('Esta es una reseña de prueba para el E2E de actividad')
  ).toBeVisible()
  await expect(reseñas.locator(`a[href="/series/${serieResenaSlug}"]`)).toBeVisible()

  // Tab Listas: link a /listas/<id> y badge Pública.
  await page.getByRole('link', { name: 'Listas' }).click()
  const listas = page.locator('#listas')
  await expect(listas).toBeVisible()
  const linkLista = listas.locator(`a[href="/listas/${listaId}"]`)
  await expect(linkLista).toBeVisible()
  await expect(linkLista).toHaveText(LISTA_NOMBRE)
  await expect(listas.getByText('Pública')).toBeVisible()
  await expect(listas.getByText('2 series')).toBeVisible()

  // Tab Propuestas: badges de estado y link a la ficha solo si aprobada.
  await page.getByRole('link', { name: 'Propuestas' }).click()
  const propuestas = page.locator('#propuestas')
  await expect(propuestas).toBeVisible()
  await expect(propuestas.locator('[data-variant="secondary"]')).toHaveText('Pendiente')
  await expect(propuestas.locator('[data-variant="default"]')).toHaveText('Aprobada')
  await expect(propuestas.locator('[data-variant="destructive"]')).toHaveText('Rechazada')

  // Exactamente un enlace a ficha en toda la sección: la propuesta aprobada.
  const linkAprobada = propuestas.locator(`a[href="/series/${propuestaAprobadaSlug}"]`)
  await expect(linkAprobada).toBeVisible()
  await expect(linkAprobada).toHaveText('Propuesta Aprobada E2E')
  await expect(propuestas.locator('a[href*="/series/"]')).toHaveCount(1)
  // Pendiente y rechazada se muestran como texto plano (sin enlace).
  await expect(propuestas.getByText('Propuesta Pendiente E2E')).toBeVisible()
  await expect(propuestas.getByText('Propuesta Rechazada E2E')).toBeVisible()

  // Los links del dashboard funcionan: detalle de la lista (pública) y ficha
  // de la serie valorada.
  await page.goto(`/listas/${listaId}`)
  await page.waitForURL(`**/listas/${listaId}`)
  await expect(page.getByRole('heading', { level: 1, name: LISTA_NOMBRE })).toBeVisible()

  await page.goto(`/series/${serieValoracionSlug}`)
  await page.waitForURL(`**/series/${serieValoracionSlug}`)
  await expect(page.getByRole('heading', { level: 1, name: serieValoracionTitulo })).toBeVisible()
})

test('ACT-07: /perfil/actividad sin sesión redirige a /login', async ({ page }) => {
  await page.goto('/perfil/actividad')
  await page.waitForURL(/\/login\?next=%2Fperfil%2Factividad/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})