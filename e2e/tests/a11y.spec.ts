import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test, tuneFirst, wakeControls } from '../fixtures.ts'

/**
 * The accessibility floor, checked by a machine.
 *
 * This suite exists because a hand-written test found a filter button that
 * rendered with no accessible name below `md` — one `aria-label`, invisible in
 * review, shipped to production. Writing a test per control does not scale;
 * scanning the rendered page does.
 *
 * A dark palette makes contrast the other live risk here, so it is deliberately
 * not excluded. Axe cannot see everything, and a clean run is a floor rather
 * than a verdict.
 *
 * Motion is turned off for the whole file. A panel caught mid-animation is
 * half transparent, and axe measures the colours it finds: scanning during the
 * fade reported a different element every run. `tokens.css` already collapses
 * every duration under `prefers-reduced-motion`, so this makes the scan
 * deterministic without the tests knowing anything about the animations.
 */

test.use({ reducedMotion: 'reduce' })

const scan = (page: Parameters<typeof tuneFirst>[0]) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])

/** Visible and fully opaque, which is what makes a colour measurement mean something. */
async function settled(panel: ReturnType<Page['getByRole']>) {
  await expect(panel).toBeVisible()
  await expect(panel).toHaveCSS('opacity', '1')
}

/** `rule: selector` per violation, which is enough to find it without a trace. */
function describe(results: Awaited<ReturnType<ReturnType<typeof scan>['analyze']>>) {
  return results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))
}

test('the lineup and the stage have no violations', async ({ app }) => {
  expect(describe(await scan(app).analyze())).toEqual([])
})

test('the filter sheet has none either', async ({ app }) => {
  await app.getByRole('button', { name: /filters/i }).click()
  await settled(app.getByRole('dialog'))
  expect(describe(await scan(app).analyze())).toEqual([])
})

test('nor does the settings dialog', async ({ app }) => {
  await app.getByRole('button', { name: /settings/i }).click()
  await settled(app.getByRole('dialog'))
  expect(describe(await scan(app).analyze())).toEqual([])
})

test('nor the controls over a tuned picture', async ({ app }) => {
  await tuneFirst(app)
  await wakeControls(app)
  expect(describe(await scan(app).analyze())).toEqual([])
})
