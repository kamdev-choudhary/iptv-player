import AxeBuilder from '@axe-core/playwright'
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
 */

const scan = (page: Parameters<typeof tuneFirst>[0]) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])

/** `rule: selector` per violation, which is enough to find it without a trace. */
function describe(results: Awaited<ReturnType<ReturnType<typeof scan>['analyze']>>) {
  return results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))
}

test('the lineup and the stage have no violations', async ({ app }) => {
  expect(describe(await scan(app).analyze())).toEqual([])
})

test('the filter sheet has none either', async ({ app }) => {
  await app.getByRole('button', { name: /filters/i }).click()
  await expect(app.getByRole('dialog')).toBeVisible()
  expect(describe(await scan(app).analyze())).toEqual([])
})

test('nor does the settings dialog', async ({ app }) => {
  await app.getByRole('button', { name: /settings/i }).click()
  await expect(app.getByRole('dialog')).toBeVisible()
  expect(describe(await scan(app).analyze())).toEqual([])
})

test('nor the controls over a tuned picture', async ({ app }) => {
  await tuneFirst(app)
  await wakeControls(app)
  expect(describe(await scan(app).analyze())).toEqual([])
})
