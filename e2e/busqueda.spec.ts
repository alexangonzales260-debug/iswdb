import { expect, test, type Page } from '@playwright/test'

// Usa el fixture global sin modificarlo: 'Canal Dos' (@canal-dos) participa en
// e2e-01 y e2e-09 (ambas aprobadas), suficiente para cubrir la búsqueda por
// canal, las dos secciones y el flujo barra → resultados → ficha.
// URLs de canal sin '@' (D15).

async function seccionSeries(page: Page) {
  return page.locator('section', {
    has: page.getByRole('heading', { level: 2, name: 'Series' })
  })
}

async function seccionCanales(page: Page) {
  return page.locator('section', {
    has: page.getByRole('heading', { level: 2, name: 'Canales' })
  })
}

test.describe('Búsqueda', () => {
  test('barra del header: término + Enter navega a /buscar?q=<termino>', async ({
    page
  }) => {
    await page.goto('/')
    await page.getByLabel('Buscar').fill('Canal Dos')
    await page.getByLabel('Buscar').press('Enter')
    await page.waitForURL('**/buscar?q=Canal+Dos')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Búsqueda: Canal Dos' })
    ).toBeVisible()
    // BUS-08: metadata dinámica (el template del layout añade " · ISWDB").
    await expect(page).toHaveTitle('Búsqueda: Canal Dos · ISWDB')
  })

  test('resultados por canal: secciones Series y Canales', async ({ page }) => {
    await page.goto('/buscar?q=Canal+Dos')

    // Series en las que participa Canal Dos (e2e-01 y e2e-09, aprobadas).
    const series = await seccionSeries(page)
    const hrefs = await series
      .locator('a[href^="/series/e2e-"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    expect(new Set(hrefs)).toEqual(new Set(['/series/e2e-01', '/series/e2e-09']))

    // Canal con avatar + handle visible con '@' y link sin '@' (D15).
    const canales = await seccionCanales(page)
    await expect(canales.getByText('@canal-dos')).toBeVisible()
    await expect(canales.getByRole('link', { name: /Canal Dos/ })).toHaveAttribute(
      'href',
      '/canales/canal-dos'
    )
  })

  test('insensible a mayúsculas: CANAL DOS → mismos resultados', async ({ page }) => {
    await page.goto('/buscar?q=CANAL+DOS')
    const series = await seccionSeries(page)
    await expect(
      series.getByRole('heading', { name: 'Serie e2e 1', exact: true })
    ).toBeVisible()
    await expect(
      series.getByRole('heading', { name: 'Serie e2e 9', exact: true })
    ).toBeVisible()
    const canales = await seccionCanales(page)
    await expect(canales.getByRole('link', { name: /Canal Dos/ })).toBeVisible()
  })

  test('click en serie de los resultados → ficha de la serie', async ({ page }) => {
    await page.goto('/buscar?q=Canal+Dos')
    const series = await seccionSeries(page)
    await series
      .getByRole('link')
      .filter({ has: page.getByRole('heading', { name: 'Serie e2e 1', exact: true }) })
      .click()
    await page.waitForURL('**/series/e2e-01')
    await expect(page.getByRole('heading', { level: 1, name: 'Serie e2e 1' })).toBeVisible()
  })

  test('sin resultados: EmptyState con link a /series', async ({ page }) => {
    await page.goto('/buscar?q=zzznoexiste')
    await expect(page.getByText("Sin resultados para 'zzznoexiste'")).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver todas las series' })).toHaveAttribute(
      'href',
      '/series'
    )
  })

  test('sin query: hint de búsqueda visible', async ({ page }) => {
    await page.goto('/buscar')
    await expect(
      page.getByText('Busca por título de serie o nombre de canal')
    ).toBeVisible()
    await expect(page).toHaveTitle('Buscar · ISWDB')
  })
})
