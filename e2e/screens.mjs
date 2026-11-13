// Playwright-Check im iPhone-Format: startet `vite preview`, öffnet alle Ansichten,
// prüft auf Konsolenfehler und speichert Screenshots in ./screenshots
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// Playwright ist global vorinstalliert (lokal: npm i -D playwright)
const { chromium, devices } = require('playwright')
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const PORT = 4179
const BASE = `http://localhost:${PORT}`
const DATE = process.env.DATE ?? '2026-11-17'
const out = 'screenshots'
mkdirSync(out, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const errors = []
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const shot = async (name, path, opts = {}) => {
  await page.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}date=${DATE}`)
  await page.waitForTimeout(600)
  if (opts.action) await opts.action()
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: opts.full ?? true })
  console.log('✓', name)
}

try {
  // Onboarding (frischer Zustand)
  await shot('00-onboarding', '/', { full: false })
  await page.getByRole('button', { name: "Los geht's" }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.screenshot({ path: `${out}/01-onboarding-schicht.png` })
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Später machen' }).click()
  await page.screenshot({ path: `${out}/02-onboarding-rennwoche.png` })
  await page.getByRole('button', { name: 'Plan starten' }).click()
  // Demo-Daten an
  await page.evaluate(() => {
    const k = 'ehrwald-trainer:state'
    const s = JSON.parse(localStorage.getItem(k))
    s.demoMode = true
    localStorage.setItem(k, JSON.stringify(s))
  })
  await shot('10-heute', '/')
  await shot('11-zyklus', '/zyklus')
  await shot('12-zyklus-override', '/zyklus', { full: false, action: async () => { await page.locator('button:has-text("Frei")').nth(1).click(); await page.waitForTimeout(300) } })
  await shot('13-plan', '/plan')
  await shot('14-erholung', '/erholung')
  await shot('15-kraft', '/kraft')
  await shot('16-mehr', '/mehr')
  await shot('17-rennwoche', '/rennwoche')
  await shot('18-einstellungen', '/einstellungen')
  // Einheit-Detail über Heute
  await page.goto(`${BASE}/?date=${DATE}`)
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Details' }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/19-einheit.png`, fullPage: true })
  console.log('✓ 19-einheit')
  // Erledigt abhaken → Tracking
  await page.goto(`${BASE}/?date=${DATE}`)
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Erledigt' }).first().click()
  await shot('20-tracking', '/tracking')
  // Weitere Tage: Schlaftag, freier Tag, Rennwoche
  for (const [n, d] of [['21-schlaftag', '2026-11-18'], ['22-frei-langer-lauf', '2027-04-28'], ['23-renntag', '2027-06-18']]) {
    await page.goto(`${BASE}/?date=${d}`)
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${out}/${n}.png`, fullPage: true })
    console.log('✓', n)
  }
  // Breite prüfen: kein horizontales Scrollen
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (overflow) errors.push('Horizontaler Overflow')
} finally {
  await browser.close()
  server.kill()
}
if (errors.length) {
  console.error('Fehler:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('Keine Konsolenfehler.')
