import { expect, rows, test, tuneFirst, wakeControls } from '../fixtures.ts'

/**
 * The player. These do not assert that a given stream plays — half of any
 * public list is dead at a given moment, and that is the application's subject
 * rather than a flaw in it. They assert that the player always *says* which it
 * is, and that everything you need is reachable over the picture.
 */

test('starts idle with an instruction rather than a blank frame', async ({ app }) => {
  const stage = app.locator('section[aria-label="Player"]')
  await expect(stage).toContainText('No signal')
  await expect(stage).toContainText('Pick a channel')
})

test('says whether the channel it tuned is playing', async ({ app }) => {
  await tuneFirst(app)
  const stage = app.locator('section[aria-label="Player"]')
  // One or the other, never silence.
  await expect(stage).toContainText(/Playing|Not playing/)
})

test('marks the tuned row in the list', async ({ app }) => {
  const name = await rows(app).first().innerText()
  await rows(app).first().click()
  await app.waitForTimeout(1500)
  await expect(app.locator('section[aria-label="Player"]')).toContainText(name.split('\n')[0]!)
})

test('keeps its controls over the picture, not beside it', async ({ app }) => {
  await tuneFirst(app)
  await wakeControls(app)

  const stage = app.locator('section[aria-label="Player"]')
  const play = stage.getByRole('button', { name: /play|pause/i })
  await expect(play).toBeVisible()

  // Overlaid means inside the stage's own box, not in a strip under it.
  const stageBox = (await stage.boundingBox())!
  const playBox = (await play.boundingBox())!
  expect(playBox.y).toBeGreaterThanOrEqual(stageBox.y)
  expect(playBox.y + playBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1)
})

test('puts the rest of the options behind one menu', async ({ app }) => {
  await tuneFirst(app)
  await wakeControls(app)

  await app.getByRole('button', { name: /more options/i }).click()
  const menu = app.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('Picture in picture')
  await expect(menu).toContainText('Copy link to channel')
})

test('offers a way out when nothing played', async ({ app }) => {
  await tuneFirst(app)
  const stage = app.locator('section[aria-label="Player"]')

  if (await stage.getByText('Not playing').isVisible().catch(() => false)) {
    // A dead channel must never be a dead end: the slate names the cause and
    // offers whatever could still change the outcome.
    const slate = stage.locator('h2')
    await expect(slate).toBeVisible()
    const buttons = await stage.getByRole('button').allInnerTexts()
    expect(buttons.join(' ')).toMatch(/Try|server/i)
  }
})

test('mute is reachable and reports its own state', async ({ app }) => {
  await tuneFirst(app)
  await wakeControls(app)

  const stage = app.locator('section[aria-label="Player"]')
  const mute = stage.getByRole('button', { name: /mute/i })
  const before = await mute.getAttribute('aria-label')
  await mute.click()
  await expect(mute).not.toHaveAttribute('aria-label', before!)
})

test('a channel is linkable and comes back on that link', async ({ app }) => {
  await rows(app).first().click()
  await app.waitForTimeout(2000)

  const url = app.url()
  expect(url).toContain('#c=')

  await app.goto(url, { waitUntil: 'domcontentloaded' })
  await expect(app.locator('section[aria-label="Player"]')).toContainText(
    /Playing|Not playing|Connecting/,
    { timeout: 45_000 },
  )
})
