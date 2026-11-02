import { chromium } from 'playwright'

const out = process.argv[2]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// Tune the first channel that the prober found live, so the list shows a mix
// of states and the stage shows a real attempt rather than the idle slate.
await page.getByLabel('Search channels').fill('india')
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}/list.png` })

const rows = page.locator('section[aria-label="Channels"] button[title]')
if (await rows.count()) {
  await rows.first().click()
  await page.waitForTimeout(3500)
}
await page.screenshot({ path: `${out}/tuned.png` })
if (errors.length) console.log('page errors:', errors.slice(0, 3))
await browser.close()
console.log('done')
