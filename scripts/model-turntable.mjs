// Contact sheet for one spinner. Does not touch scripts/screenshots.mjs.
//   BASE_URL=http://127.0.0.1:5173/ SRC=legacy TITLE="legacy shell" OUT=/tmp/legacy.png npm run turntable
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const SRC = process.env.SRC ?? 'legacy';
const TITLE = process.env.TITLE ?? SRC;
const OUT = process.env.OUT ?? 'screenshots-tmp/turntable.png';
const CHROME = process.env.CHROME
  || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/usr/local/bin/google-chrome');

mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 2500, height: 1400 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const url = new URL('tools/model-harness/turntable/index.html', BASE);
url.searchParams.set('src', SRC);
url.searchParams.set('title', TITLE);
await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => window.__harness && (window.__harness.done || window.__harness.error), null, { timeout: 180_000 });
const harness = await page.evaluate(() => window.__harness);
if (!harness?.done) {
  console.error(JSON.stringify({ harness, errors }, null, 2));
  await browser.close();
  process.exit(1);
}
await page.locator('#sheet').screenshot({ path: OUT, type: 'png' });
console.log('SHEET', OUT, JSON.stringify(harness));
if (errors.length) console.log('PAGEERRORS', errors.slice(0, 8).join('\n'));
await browser.close();
