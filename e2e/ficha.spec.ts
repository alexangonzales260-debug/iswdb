import { expect, test } from '@playwright/test'

import { FIXTURE, slugSerie } from './global-setup'

const SLUG_DOS_TEMPORADAS = FIXTURE.ficha.slugDosTemporadas
const SLUG_SIN_EPISODIOS = FIXTURE.ficha.slugSinEpisodios
const URL_YOUTUBE_PILOTO = `https://www.youtube.com/watch?v=${FIXTURE.ficha.videoIds['e2e-01-t1e1']}`

test.describe('Ficha de serie', () => {
  test('home → click en tarjeta → ficha renderiza', async ({ page }) => {
    await page.goto('/')
    // Hero = e2e-10 (la aprobada mejor valorada del fixture).
    await page.getByRole('link', { name: /Serie e2e 10/ }).first().click()
    await page.waitForURL(`**/series/${FIXTURE.heroSlug}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Serie e2e 10' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Temporada 1' })).toBeVisible()
  })

  test('catálogo → click en tarjeta de e2e-01 → ficha completa', async ({ page }) => {
    // e2e-01 no está en la home (últimas 10 = e2e-15..e2e-06); vive en la
    // página 2 del listado.
    await page.goto('/series?page=2')
    await page
      .getByRole('link')
      .filter({ has: page.getByRole('heading', { name: 'Serie e2e 1', exact: true }) })
      .click()
    await page.waitForURL(`**/series/${SLUG_DOS_TEMPORADAS}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Serie e2e 1' })).toBeVisible()
    await expect(page.getByText('Minecraft')).toBeVisible()
    await expect(page.getByText('Finalizada')).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Temporada 1' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Temporada 2' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Ver playlist en YouTube/ })).toHaveAttribute(
      'href',
      FIXTURE.ficha.playlistUrl
    )
  })

  test('episodio: link externo con target/rel y sin iframes', async ({ page }) => {
    await page.goto(`/series/${SLUG_DOS_TEMPORADAS}`)
    const episodio = page.getByRole('link', { name: /Ver Piloto en YouTube/ })
    await expect(episodio).toHaveAttribute('href', URL_YOUTUBE_PILOTO)
    await expect(episodio).toHaveAttribute('target', '_blank')
    const rel = await episodio.getAttribute('rel')
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
    expect(await page.locator('iframe').count()).toBe(0)
  })

  test('click en episodio abre nueva pestaña y solicita la URL de YouTube', async ({
    page,
    context
  }) => {
    await page.goto(`/series/${SLUG_DOS_TEMPORADAS}`)
    // Listener registrado antes del click para no perder el request inicial
    // de la nueva pestaña.
    const urlsSolicitadas: string[] = []
    context.on('request', (request) => urlsSolicitadas.push(request.url()))

    const [pestana] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: /Ver Piloto en YouTube/ }).click()
    ])

    // Sin waitForLoadState: el entorno puede no tener red externa; basta con
    // que la nueva pestaña solicite la URL de YouTube.
    await expect.poll(() => urlsSolicitadas).toContain(URL_YOUTUBE_PILOTO)
    expect(pestana.isClosed()).toBe(false)
  })

  test('serie sin episodios → empty state', async ({ page }) => {
    await page.goto(`/series/${SLUG_SIN_EPISODIOS}`)
    await expect(page.getByText('Aún no hay episodios registrados')).toBeVisible()
  })

  test('serie pendiente → 404', async ({ page }) => {
    const respuesta = await page.goto(`/series/${FIXTURE.slugPendiente}`)
    expect(respuesta?.status()).toBe(404)
    await expect(page.getByText('Página no encontrada')).toBeVisible()
  })

  test('slug inexistente → 404', async ({ page }) => {
    const respuesta = await page.goto('/series/no-existe')
    expect(respuesta?.status()).toBe(404)
    await expect(page.getByText('Página no encontrada')).toBeVisible()
  })

  test('reparto: canal con rol y link a la ficha del canal', async ({ page }) => {
    await page.goto(`/series/${SLUG_DOS_TEMPORADAS}`)
    const canal = page.getByRole('link', { name: /Canal Dos/ })
    await expect(canal).toBeVisible()
    await expect(canal).toHaveAttribute('href', '/canales/canal-dos')
    await expect(page.getByText('Colaborador')).toBeVisible()
  })

  test('metadata dinámica: title, description y OG', async ({ page }) => {
    await page.goto(`/series/${slugSerie(10)}`)
    await expect(page).toHaveTitle('Serie e2e 10 · ISWDB')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Serie e2e 10'
    )
  })
})
