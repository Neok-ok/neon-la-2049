// Six frames of one street-level crowd, unfrozen, so a walk reads.
// Not a performance harness. SwiftShader WebGL2 unless GPU=1.
//   BASE_URL=http://127.0.0.1:4173/ OUT=/tmp/d1-walk-before node scripts/d1-walkstrip.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? 'screenshots-tmp/d1-walk';
const GPU = process.env.GPU === '1';
const FRAMES = Number(process.env.FRAMES ?? 6);
mkdirSync(OUT, { recursive: true });

const iphone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

const args = GPU
  ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args,
  headless: true,
});
const ctx = await browser.newContext(iphone);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const q = `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=0&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`;
await page.goto(`${BASE}?${q}`);
await page.waitForFunction(() => {
  const st = window.__nla?.stats?.();
  return st && st.lod0 >= 6 && st.queryPending === 0 && st.drawCalls > 40;
}, null, { timeout: 120_000, polling: 500 });
await page.evaluate(() => window.__nla.marketView('crowd'));
await page.waitForTimeout(2500);
await page.evaluate(() => window.__nla.marketView('crowd'));
await page.waitForFunction(() => (window.__nla?.stats?.().crowd ?? 0) > 8, null, { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(800);

for (let i = 0; i < FRAMES; i++) {
  const file = join(OUT, `walk-${i}.png`);
  await page.screenshot({ path: file, timeout: 180_000 });
  const st = await page.evaluate(() => {
    const s = window.__nla.stats();
    return {
      crowd: s.crowd, crowdAnimated: s.crowdAnimated ?? null, crowdIdle: s.crowdIdle ?? null,
      draws: s.drawCalls, tris: s.triangles, backend: s.backend,
    };
  });
  console.log(`FRAME ${i}`, JSON.stringify(st), file);
  await page.waitForTimeout(420);
}

if (errors.length) console.log('ERRORS', errors.slice(0, 8).join('\n'));
else console.log('ERRORS none');
await browser.close();
