import { expect, test as base, type Page } from '@playwright/test'

/**
 * Shared ways in. Every test starts from a loaded catalog, so each one says
 * what it is about rather than repeating four lines of waiting.
 */

export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // The list arriving is the signal that the API answered and the client
    // parsed it against the shared schema.
    await expect(page.getByLabel('Search channels')).toBeVisible()
    await expect(rows(page).first()).toBeVisible({ timeout: 30_000 })
    await use(page)
  },
})

export { expect }

/** Every channel row carries a title attribute summarising its sources. */
export const rows = (page: Page) => page.locator('section[aria-label="Channels"] button[title]')

export const countText = (page: Page) =>
  page.locator('section[aria-label="Channels"] header p').innerText()

/** The number the list header reports, which is the server's `total`. */
export async function listedCount(page: Page): Promise<number> {
  const text = await countText(page)
  return Number(text.replace(/[^\d]/g, ''))
}

export async function search(page: Page, term: string) {
  await page.getByLabel('Search channels').fill(term)
  // The field is debounced, then the query round-trips.
  await page.waitForTimeout(900)
}

export async function openFilters(page: Page) {
  await page.getByRole('button', { name: /filters/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/**
 * Tunes the first row and waits for the player to stop trying.
 *
 * These are public streams: a given one may well be dead, and the point of
 * the assertion is that the player *says* which it is, not that it plays.
 */
export async function tuneFirst(page: Page) {
  await rows(page).first().click()
  const status = page.locator('section[aria-label="Player"]')
  await expect(status).toBeVisible()
  await page.waitForFunction(
    () => {
      const section = document.querySelector('section[aria-label="Player"]')
      return Boolean(section?.textContent?.match(/Playing|Not playing/))
    },
    undefined,
    { timeout: 45_000 },
  )
}

/** The overlay only shows while someone is moving, so wake it first. */
export async function wakeControls(page: Page) {
  const stage = page.locator('section[aria-label="Player"]')
  await stage.hover({ position: { x: 100, y: 100 } })
  await page.waitForTimeout(250)
}
