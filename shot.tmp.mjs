import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.getByLabel('Search channels').fill('india')
await page.waitForTimeout(1500)
// The page itself scrolls on a phone; prove the list is reachable.
await page.mouse.wheel(0, 900)
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/mobile2.png` })
await browser.close()
console.log('done')
