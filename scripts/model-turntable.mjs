// Contact sheet for one spinner. Does not touch scripts/screenshots.mjs.
//   BASE_URL=http://127.0.0.1:5173/ SRC=legacy TITLE="legacy shell" OUT=/tmp/legacy.png npm run turntable
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const SRC = process.env.SRC ?? 'legacy';
const TITLE = process.env.TITLE ?? SRC;
const MODE = process.env.MODE ?? 'sheet';
const OUT = process.env.OUT ?? 'screenshots-tmp/turntable.png';
const CHROME = process.env.CHROME
  || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/usr/local/bin/google-chrome');

mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 2800, height: 1600 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const url = new URL('tools/model-harness/turntable/index.html', BASE);
url.searchParams.set('src', SRC);
url.searchParams.set('title', TITLE);
url.searchParams.set('mode', MODE);
await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => window.__harness && (window.__harness.done || window.__harness.error), null, { timeout: 180_000 });
const harness = await page.evaluate(() => window.__harness);
if (!harness?.done) {
  console.error(JSON.stringify({ harness, errors }, null, 2));
  await browser.close();
  process.exit(1);
}
if (MODE === 'sheet') {
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('#labels img')];
    return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, null, { timeout: 60_000 });
}
const metaPath = OUT.replace(/\.png$/, '.json');
writeFileSync(metaPath, JSON.stringify(harness, null, 2));
if (MODE === 'silhouette') {
  await page.locator('#view').screenshot({ path: OUT, type: 'png' });
  const sheet = OUT.replace(/\.png$/, '-sheet.png');
  await page.locator('#sheet').screenshot({ path: sheet, type: 'png' });
  console.log('MASK', OUT, 'SHEET', sheet, JSON.stringify({ size: harness.size, tris: harness.tris, panels: harness.panels }));
} else {
  await page.locator('#sheet').screenshot({ path: OUT, type: 'png' });
  console.log('SHEET', OUT, JSON.stringify({ mode: harness.mode, size: harness.size, tris: harness.tris, scale: harness.scale }));
}
if (errors.length) console.log('PAGEERRORS', errors.slice(0, 8).join('\n'));
await browser.close();
