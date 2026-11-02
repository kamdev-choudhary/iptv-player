import { expect, rows, test } from '../fixtures.ts'

/**
 * The frame. One rule at both sizes: nothing scrolls the page, the list
 * scrolls inside itself, and the picture never leaves the screen — because
 * otherwise you cannot see whether what you just tapped started playing.
 */

test('the page itself never scrolls', async ({ app }) => {
  const overflow = await app.evaluate(() => {
    const el = document.scrollingElement!
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
  })
  // A pixel of slack for sub-pixel layout rounding.
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight + 2)
})

test('the channel list scrolls inside its own container', async ({ app }) => {
  const scroller = app.locator('section[aria-label="Channels"] > div').last()
  const before = await scroller.evaluate((el) => el.scrollTop)
  await scroller.evaluate((el) => el.scrollBy(0, 600))
  await app.waitForTimeout(300)
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(before)
})

test('the picture stays on screen while the list is scrolled', async ({ app }) => {
  const stage = app.locator('section[aria-label="Player"]')
  const before = await stage.boundingBox()

  const scroller = app.locator('section[aria-label="Channels"] > div').last()
  await scroller.evaluate((el) => el.scrollBy(0, 2000))
  await app.waitForTimeout(400)

  const after = await stage.boundingBox()
  expect(after!.y).toBeCloseTo(before!.y, 0)
  await expect(stage).toBeInViewport()
})

test('reaches a channel far down the list without losing the picture', async ({ app }) => {
  const scroller = app.locator('section[aria-label="Channels"] > div').last()
  await scroller.evaluate((el) => el.scrollBy(0, 1500))
  await app.waitForTimeout(600)

  const visible = rows(app).filter({ visible: true })
  await visible.last().click()
  await app.waitForTimeout(1500)

  await expect(app.locator('section[aria-label="Player"]')).toBeInViewport()
})

test('filters open over the page and close again', async ({ app }) => {
  await app.getByRole('button', { name: /filters/i }).click()
  const sheet = app.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Country')

  await app.keyboard.press('Escape')
  await expect(sheet).not.toBeVisible()
})

test('settings open, and the operator panel stays locked without a token', async ({ app }) => {
  await app.getByRole('button', { name: /settings/i }).click()
  const dialog = app.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('tab', { name: /operate/i }).click()
  await expect(dialog).toContainText('Admin token')
  // No token pasted, so nothing that writes is on screen.
  await expect(dialog.getByText('Fix a stream address')).toHaveCount(0)
})
