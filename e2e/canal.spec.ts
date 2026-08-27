import { expect, test } from '@playwright/test'

import { FIXTURE } from './global-setup'

// URLs sin '@': Next.js trata los segmentos que empiezan por '@' como slots
// de parallel routes y devuelve 404 (decisión aprobada F005, ver plan.md).
const SLUG_DOS_TEMPORADAS = FIXTURE.ficha.slugDosTemporadas

test.describe('Ficha de canal', () => {
  test('navegación desde reparto: ficha de serie → ficha del canal', async ({ page }) => {
    // e2e-01 vive en la página 2 del listado (created_at desc).
    await page.goto('/series?page=2')
    await page
      .getByRole('link')
      .filter({ has: page.getByRole('heading', { name: 'Serie e2e 1', exact: true }) })
      .click()
    await page.waitForURL(`**/series/${SLUG_DOS_TEMPORADAS}`)
    await page.getByRole('link', { name: /Canal Dos/ }).click()
    await page.waitForURL('**/canales/canal-dos')
    await expect(page.getByRole('heading', { level: 1, name: 'Canal Dos' })).toBeVisible()
    await expect(page.getByText('2 series aprobadas')).toBeVisible()
  })

  test('orden de filmografía (anio desc, rating desc) y badge de rol', async ({ page }) => {
    await page.goto('/canales/canal-uno')
    await expect(page.getByRole('heading', { level: 1, name: 'Canal Uno' })).toBeVisible()
    await expect(page.getByText('4 series aprobadas')).toBeVisible()

    const hrefs = await page
      .locator('a[href^="/series/e2e-"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    // CAN-01: e2e-02 primero (anio 2025) → e2e-13 (rating 6.5) → empate sin
    // rating resuelto por created_at desc (e2e-09 > e2e-05).
    expect(hrefs).toEqual(['/series/e2e-02', '/series/e2e-13', '/series/e2e-09', '/series/e2e-05'])

    // CAN-02: el badge con el rol del canal está sobre la tarjeta de e2e-09.
    const badge = page.getByText('Principal', { exact: true })
    await expect(badge).toBeVisible()
    await expect(badge.locator('xpath=..').locator('a[href="/series/e2e-09"]')).toBeVisible()
  })

  test('metadata dinámica: title y description', async ({ page }) => {
    await page.goto('/canales/canal-uno')
    await expect(page).toHaveTitle('Canal Uno · ISWDB')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'Canal Uno en ISWDB: 4 series como Principal.'
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Canal Uno'
    )
  })

  test('OG con avatar cuando existe', async ({ page }) => {
    await page.goto('/canales/canal-dos')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://img.youtube.com/vi/canaldos/avatar.jpg'
    )
  })

  test('canal con solo series pendientes → 404', async ({ page }) => {
    const respuesta = await page.goto('/canales/canal-tres')
    expect(respuesta?.status()).toBe(404)
    await expect(page.getByText('Página no encontrada')).toBeVisible()
  })

  test('handle inexistente → 404', async ({ page }) => {
    const respuesta = await page.goto('/canales/no-existe')
    expect(respuesta?.status()).toBe(404)
    await expect(page.getByText('Página no encontrada')).toBeVisible()
  })
})
