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

const land = process.env.LAND === '1';
const iphone = {
  viewport: land ? { width: 844, height: 390 } : { width: 390, height: 844 },
  deviceScaleFactor: 1,
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

const view = process.env.VIEW ?? 'street';
const q = `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=0&ui=0&quality=medium${GPU ? '' : '&webgl=1'}`;
await page.goto(`${BASE}?${q}`);
await page.waitForFunction(() => {
  const st = window.__nla?.stats?.();
  return st && st.lod0 >= 6 && st.queryPending === 0 && st.drawCalls > 40;
}, null, { timeout: 120_000, polling: 500 });
await page.evaluate((view) => window.__nla.marketView(view), view);
await page.waitForTimeout(2500);
await page.evaluate((view) => window.__nla.marketView(view), view);
await page.waitForFunction(() => (window.__nla?.stats?.().crowd ?? 0) > 8, null, { timeout: 30_000 }).catch(() => {});
// The street preset looks along the lane. Turn toward the sidewalk so a walker fills the frame.
const aim = Number(process.env.AIM ?? 110);
const pitch = Number(process.env.PITCH ?? -12);
await page.evaluate(({ aim, pitch }) => {
  const w = window.__nla.app.cams.walk;
  const yaw = (w.heading * 180) / Math.PI + aim;
  window.__nla.setPose(w.pos.x, w.pos.y + 1.7, w.pos.z, yaw, pitch);
  document.querySelectorAll('.stick').forEach((el) => { el.style.display = 'none'; });
}, { aim, pitch });
await page.waitForTimeout(600);

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
