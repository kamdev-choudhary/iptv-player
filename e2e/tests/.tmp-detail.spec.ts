import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '../fixtures.ts'

test('detail', async ({ app }) => {
  await app.getByRole('button', { name: /settings/i }).click()
  await expect(app.getByRole('dialog')).toBeVisible()
  const r = await new AxeBuilder({ page: app }).withTags(['wcag2a', 'wcag2aa']).analyze()
  for (const v of r.violations)
    for (const n of v.nodes)
      console.log('VIOLATION', v.id, JSON.stringify(n.target), '|', n.any.map((a) => a.message).join(' // '))
})
