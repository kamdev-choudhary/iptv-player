import { expect, listedCount, openFilters, rows, search, test } from '../fixtures.ts'

/**
 * The catalog, from the browser's side: that the server's filtering and paging
 * actually reach the list, and that what the panel says matches what it shows.
 */

test('lists channels and reports how many there are', async ({ app }) => {
  expect(await listedCount(app)).toBeGreaterThan(100)
  expect(await rows(app).count()).toBeGreaterThan(5)
})

test('search narrows the list and says what it matched', async ({ app }) => {
  const before = await listedCount(app)
  await search(app, 'news')

  const after = await listedCount(app)
  expect(after).toBeLessThan(before)
  expect(after).toBeGreaterThan(0)
  await expect(app.locator('section[aria-label="Channels"] header')).toContainText('matching')
})

test('a search with no matches offers a way back', async ({ app }) => {
  await search(app, 'zzzznotachannelzzzz')
  await expect(app.getByText('Nothing matches')).toBeVisible()
  await app.getByRole('button', { name: /clear filters/i }).click()
  await expect(rows(app).first()).toBeVisible()
})

test('paging appends rather than replacing', async ({ app }) => {
  const first = await rows(app).count()
  await rows(app).last().scrollIntoViewIfNeeded()
  await app.waitForTimeout(1500)
  expect(await rows(app).count()).toBeGreaterThan(first)
})

test('the country filter is searchable and narrows the list', async ({ app }) => {
  const before = await listedCount(app)
  await openFilters(app)

  await app.getByLabel('Country').click()
  // 180 countries is past the point where a plain listbox is usable, so the
  // control becomes a combobox with a filter.
  await app.keyboard.type('ind')
  const options = app.locator('[cmdk-item]')
  await expect(options.first()).toBeVisible()
  expect(await options.count()).toBeLessThan(5)

  await options.first().click()
  await app.keyboard.press('Escape')
  await app.waitForTimeout(1200)

  expect(await listedCount(app)).toBeLessThan(before)
  await expect(app.getByRole('button', { name: /filters/i })).toContainText('1')
})

test('a chosen country survives a reload', async ({ app }) => {
  await openFilters(app)
  await app.getByLabel('Country').click()
  await app.keyboard.type('ind')
  await app.locator('[cmdk-item]').first().click()
  await app.keyboard.press('Escape')
  await app.waitForTimeout(800)

  await app.reload({ waitUntil: 'domcontentloaded' })
  await expect(rows(app).first()).toBeVisible({ timeout: 30_000 })
  // Persisted by the store, so the filter badge is still showing one.
  await expect(app.getByRole('button', { name: /filters/i })).toContainText('1')
})

test('the probe counts add up to the catalog', async ({ app }) => {
  const facets = await app.evaluate(async () => {
    const response = await fetch('/api/facets')
    return response.json() as Promise<{
      sourceCount: number
      liveSourceCount: number
      deadSourceCount: number
    }>
  })

  // Live, failing and unchecked are reported separately on purpose: calling
  // every unprobed source "not answering" was a panel telling a lie.
  expect(facets.liveSourceCount + facets.deadSourceCount).toBeLessThanOrEqual(facets.sourceCount)
})
