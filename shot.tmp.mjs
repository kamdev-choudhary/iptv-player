import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch()
for (const [name, viewport] of [
  ['d2', { width: 1440, height: 900 }],
  ['m2', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await page.goto('http://localhost:12995/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.getByLabel('Search channels').fill('news')
  await page.waitForTimeout(1500)
  const rows = page.locator('section[aria-label="Channels"] button[title]')
  if (await rows.count()) { await rows.first().click(); await page.waitForTimeout(4000) }
  await page.screenshot({ path: `${out}/${name}.png` })
  if (errors.length) console.log(name, 'errors:', errors)
  await page.close()
}
await browser.close()
console.log('done')
