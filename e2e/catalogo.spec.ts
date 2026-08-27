import { expect, test, type Page } from '@playwright/test'

import { FIXTURE, slugSerie } from './global-setup'

const SLUGS_APROBADAS = Array.from({ length: FIXTURE.totalSeries - 1 }, (_, i) =>
  slugSerie(i + 1)
)

async function getCardHrefs(page: Page): Promise<string[]> {
  return page
    .locator('a[href^="/series/e2e-"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
}

test.describe('Catálogo público', () => {
  test('home: header, hero y chips de categoría', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Serie destacada' })).toBeVisible()
    // Hero = serie aprobada mejor valorada del fixture (AVG 9.5).
    await expect(
      page.getByRole('heading', { name: `Serie e2e ${10}` }).first()
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Minecraft' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'GTA' }).first()).toBeVisible()
  })

  test('filtro por categoría', async ({ page }) => {
    await page.goto('/series?categoria=minecraft')
    await expect(page.getByText('Categoría: Minecraft')).toBeVisible()
    await expect(page.getByText('8 series en el catálogo')).toBeVisible()
    const esperados = new Set(SLUGS_APROBADAS.slice(0, 8).map((slug) => `/series/${slug}`))
    expect(new Set(await getCardHrefs(page))).toEqual(esperados)
  })

  test('filtro por canal', async ({ page }) => {
    await page.goto('/series?canal=@canal-uno')
    await expect(page.getByText('Canal: @canal-uno')).toBeVisible()
    await expect(page.getByText('4 series en el catálogo')).toBeVisible()
    const esperados = new Set(
      FIXTURE.participa['@canal-uno'].map((slug) => `/series/${slug}`)
    )
    expect(new Set(await getCardHrefs(page))).toEqual(esperados)
  })

  test('paginación: 12 por página con prev/next', async ({ page }) => {
    await page.goto('/series')
    await expect(page.getByText('15 series en el catálogo')).toBeVisible()
    await expect(page.getByText('Página 1 de 2')).toBeVisible()
    const hrefsPagina1 = await getCardHrefs(page)
    expect(hrefsPagina1).toHaveLength(12)

    await page.getByRole('link', { name: /Siguiente/ }).click()
    await page.waitForURL('**/series?page=2')
    await expect(page.getByText('Página 2 de 2')).toBeVisible()
    const hrefsPagina2 = await getCardHrefs(page)
    expect(hrefsPagina2).toHaveLength(3)
    for (const href of hrefsPagina2) {
      expect(hrefsPagina1).not.toContain(href)
    }
  })

  test('la serie pendiente no aparece en ningún listado', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Serie e2e 16')).toHaveCount(0)
    await page.goto('/series')
    await expect(page.getByText('Serie e2e 16')).toHaveCount(0)
    await page.goto('/series?page=2')
    await expect(page.getByText('Serie e2e 16')).toHaveCount(0)
  })

  test('cada tarjeta enlaza a /series/<slug>', async ({ page }) => {
    await page.goto('/series')
    const hrefs = await getCardHrefs(page)
    expect(hrefs.length).toBeGreaterThan(0)
    const aprobadas = new Set(SLUGS_APROBADAS.map((slug) => `/series/${slug}`))
    for (const href of hrefs) {
      expect(href).toMatch(/^\/series\/e2e-\d{2}$/)
      expect(aprobadas.has(href)).toBe(true)
    }
  })
})
