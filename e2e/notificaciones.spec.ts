import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import {
  createAuthUserWithUsuario,
  deleteAuthUser,
  slugSerie,
  TEST_PASSWORD
} from './global-setup'

const RUN_ID = Date.now()
const EMAIL_FOLLOWER = `e2e-not-fol-${RUN_ID}@iswdb.local`
const EMAIL_ADMIN = `e2e-not-admin-${RUN_ID}@iswdb.local`

// e2e-01 es una serie aprobada del fixture (2 temporadas, 3 episodios).
const SLUG_SERIE = slugSerie(1)

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const dbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

let followerUserId: string
let adminUserId: string
let serieId: string
let episodioId: string

test.beforeAll(async () => {
  // Crear seguidor (auth + fila usuario) y admin (auth + fila usuario con rol admin).
  followerUserId = await createAuthUserWithUsuario(EMAIL_FOLLOWER)

  // Admin: createAuthUserWithUsuario crea fila usuario con rol 'user';
  // actualizamos a 'admin' con service-role (bypass RLS).
  adminUserId = await createAuthUserWithUsuario(EMAIL_ADMIN)
  const { error: errRol } = await dbAdmin
    .from('usuario')
    .update({ rol: 'admin' })
    .eq('id', adminUserId)
  if (errRol) throw new Error(`update rol admin: ${errRol.message}`)

  // Obtener serie_id del fixture e2e-01.
  const { data: serie, error: errSerie } = await dbAdmin
    .from('serie')
    .select('id')
    .eq('slug', SLUG_SERIE)
    .single()
  if (errSerie || !serie) throw new Error(`serie ${SLUG_SERIE} no encontrada`)
  serieId = serie.id

  // Seguidor sigue la serie (replicar usuario_serie vía service-role).
  const { error: errFollow } = await dbAdmin
    .from('usuario_serie')
    .insert({ usuario_id: followerUserId, serie_id: serieId })
  if (errFollow) throw new Error(`follow: ${errFollow.message}`)

  // Admin crea un episodio nuevo en esa serie.
  const { data: ep, error: errEp } = await dbAdmin
    .from('episodio')
    .insert({
      serie_id: serieId,
      temporada: 99,
      numero: 1,
      titulo: 'Episodio Notificación E2E',
      video_id: `not-e2e-${RUN_ID}`
    })
    .select('id')
    .single()
  if (errEp || !ep) throw new Error(`episodio: ${errEp?.message}`)
  episodioId = ep.id

  // Generar notificación para cada seguidor (replicar notificarNuevoEpisodio).
  const { data: seguidores, error: errSeg } = await dbAdmin
    .from('usuario_serie')
    .select('usuario_id')
    .eq('serie_id', serieId)
  if (errSeg) throw new Error(`seguidores: ${errSeg.message}`)
  if (seguidores && seguidores.length > 0) {
    const { error: errNotif } = await dbAdmin.from('notificacion').upsert(
      seguidores.map((s) => ({
        usuario_id: s.usuario_id,
        serie_id: serieId,
        episodio_id: episodioId
      })),
      { onConflict: 'usuario_id,episodio_id', ignoreDuplicates: true }
    )
    if (errNotif) throw new Error(`notificacion: ${errNotif.message}`)
  }
})

test.afterAll(async () => {
  // Cleanup en orden: notificaciones → follow → episodio → auth users.
  if (episodioId) {
    await dbAdmin.from('notificacion').delete().eq('episodio_id', episodioId)
    await dbAdmin.from('episodio').delete().eq('id', episodioId)
  }
  if (followerUserId && serieId) {
    await dbAdmin
      .from('usuario_serie')
      .delete()
      .eq('usuario_id', followerUserId)
      .eq('serie_id', serieId)
  }
  if (followerUserId) await deleteAuthUser(followerUserId)
  if (adminUserId) await deleteAuthUser(adminUserId)
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/perfil/)
}

test.describe('Notificaciones (NOT)', () => {
  test('NOT flujo completo: seguir serie → admin crea episodio → badge → notificación → marcar leída', async ({
    page
  }) => {
    // Login como seguidor.
    await login(page, EMAIL_FOLLOWER)

    // Badge visible en header con contador 1.
    await page.goto('/')
    const badge = page.getByLabel('1 notificaciones sin leer')
    await expect(badge).toBeVisible()

    // Navegar a /perfil/notificaciones → notificación visible.
    await page.goto('/perfil/notificaciones')
    await expect(page.getByText('Nuevo episodio en Serie e2e 1')).toBeVisible()
    await expect(page.getByText('Episodio Notificación E2E')).toBeVisible()

    // Marcar como leída → botón desaparece.
    await page.getByRole('button', { name: 'Marcar como leída' }).click()
    await expect(page.getByRole('button', { name: 'Marcar como leída' })).toHaveCount(0)

    // Badge desaparece del header.
    await page.goto('/')
    await expect(badge).toHaveCount(0)
  })

  test('NOT-06 sin sesión: /perfil/notificaciones → redirect a /login', async ({ page }) => {
    await page.goto('/perfil/notificaciones')
    await page.waitForURL(/\/login\?next=%2Fperfil%2Fnotificaciones/)
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  })
})
