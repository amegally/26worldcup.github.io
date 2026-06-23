// Regenerates favicons, PWA icons, apple-touch icon and the OG share image
// from the brand sources in brand/. Run after changing the logo or icon:
//   CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" bun run genbrand
// Uses headless Chrome (puppeteer-core) so each asset is composited + flattened
// crisply: transparent icons stay transparent, opaque assets get the brand bg.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || process.env.CHROME_BIN || '/usr/bin/google-chrome'
const BG = '#f4efe3' // app theme/background color
const root = resolve(import.meta.dirname, '..')
const dataUri = (p) => `data:image/png;base64,${readFileSync(resolve(root, p)).toString('base64')}`
const ICON = dataUri('brand/icon.png')
const LOGO = dataUri('brand/logo.png')
const OG = dataUri('brand/og.png') // hand-designed 1.91:1 share card

// each target: out path, pixel size, the <body> html, and whether bg is transparent
const page = (w, h, inner, transparent) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0}
  body{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;
       background:${transparent ? 'transparent' : BG}}
  img{display:block}
</style></head><body>${inner}</body></html>`

const sq = (src, scale) => `<img src="${src}" style="width:${scale}%;height:${scale}%;object-fit:contain">`

const TARGETS = [
  // favicons (transparent)
  { out: 'public/favicon-16.png', w: 16, h: 16, transparent: true, inner: sq(ICON, 100) },
  { out: 'public/favicon-32.png', w: 32, h: 32, transparent: true, inner: sq(ICON, 100) },
  { out: 'public/favicon-48.png', w: 48, h: 48, transparent: true, inner: sq(ICON, 100) },
  // PWA "any" icons (transparent — source has its own margin)
  { out: 'public/icons/icon-192.png', w: 192, h: 192, transparent: true, inner: sq(ICON, 100) },
  { out: 'public/icons/icon-512.png', w: 512, h: 512, transparent: true, inner: sq(ICON, 100) },
  // maskable: opaque brand bg, logo within the central safe zone (~76%)
  { out: 'public/icons/icon-maskable-512.png', w: 512, h: 512, transparent: false, inner: sq(ICON, 76) },
  // apple-touch must be opaque; slight margin (Apple rounds the corners)
  { out: 'public/icons/apple-touch-icon.png', w: 180, h: 180, transparent: false, inner: sq(ICON, 82) },
  // OG / Twitter share card: logo centered on the brand bg
  {
    out: 'public/og.png',
    w: 1200,
    h: 630,
    transparent: false,
    inner: `<img src="${OG}" style="width:100%;height:100%;object-fit:cover">`,
  },
]

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
})
try {
  const tab = await browser.newPage()
  for (const t of TARGETS) {
    await tab.setViewport({ width: t.w, height: t.h, deviceScaleFactor: 1 })
    await tab.setContent(page(t.w, t.h, t.inner, t.transparent), { waitUntil: 'load' })
    await tab.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
    const outPath = resolve(root, t.out)
    mkdirSync(dirname(outPath), { recursive: true })
    const buf = await tab.screenshot({
      clip: { x: 0, y: 0, width: t.w, height: t.h },
      omitBackground: t.transparent,
      type: 'png',
    })
    writeFileSync(outPath, buf)
    console.log(`✓ ${t.out} (${t.w}×${t.h}${t.transparent ? ', transparent' : ', ' + BG})`)
  }
} finally {
  await browser.close()
}
