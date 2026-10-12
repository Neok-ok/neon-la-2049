// Screenshots for the B1 harness and a short before/after city set.
//   CHROME=/usr/bin/google-chrome node tools/building-harness/capture.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? '/opt/cursor/artifacts/b1';
const AFTER = process.env.AFTER ?? 'http://127.0.0.1:5173/';
const BEFORE = process.env.BEFORE ?? 'http://127.0.0.1:5174/';
mkdirSync(OUT, { recursive: true });

const chrome = process.env.CHROME || '/usr/bin/google-chrome';
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function harness() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${AFTER}tools/building-harness/turntable.html`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120_000 });
  for (const id of ['day', 'night', 'street', 'skyline']) {
    const el = page.locator('#' + id);
    await el.screenshot({ path: join(OUT, `harness-${id}.png`) });
  }
  writeFileSync(join(OUT, 'harness-errors.json'), JSON.stringify(errors, null, 2));
  await ctx.close();
  console.log('harness', errors.slice(0, 4));
}

const q = 'freeze=1&ui=0&webgl=1&weather=rain&time=21.5';

const shots = [
  { name: 'opening', ctx: desktop, query: `mode=fly&quality=high&${q}` },
  { name: 'opening-phone', ctx: phone, query: `mode=fly&quality=medium&touch=1&${q}` },
  { name: 'mega-street', ctx: desktop, query: `mode=walk&at=megatower-1&quality=high&${q}`, after: () => window.__nla.megaView('street') },
  { name: 'mega-skyline', ctx: desktop, query: `mode=fly&at=megatower-1&quality=high&weather=clear&time=14&freeze=1&ui=0&webgl=1`, after: () => window.__nla.megaView('skyline') },
  { name: 'mega-lanes', ctx: desktop, query: `mode=fly&at=megatower-1&quality=high&${q}`, after: () => window.__nla.megaView('lanes') },
  { name: 'dtla-street', ctx: desktop, query: `mode=walk&at=dtla-canyon&quality=high&${q}`, after: () => window.__nla.dtlaView('street') },
  { name: 'dtla-phone', ctx: phone, query: `mode=walk&at=dtla-canyon&quality=medium&touch=1&${q}`, after: () => window.__nla.dtlaView('street') },
  { name: 'hero-flight', ctx: desktop, query: `mode=fly&quality=high&${q}`, after: () => window.__nla.setPose(-980, 340, 180, -96, 8) },
  { name: 'hero-street', ctx: desktop, query: `mode=walk&quality=high&${q}`, after: () => window.__nla.setPose(-1660, 2, 160, -50, 55) },
];

const tiers = ['low', 'medium', 'high', 'ultra'].map((tier) => ({
  name: `tier-${tier}`,
  ctx: desktop,
  query: `mode=fly&at=megatower-1&quality=${tier}&${q}`,
  after: () => window.__nla.megaView('lanes'),
}));

async function city(base, prefix, list) {
  const stats = [];
  for (const s of list) {
    const ctx = await browser.newContext(s.ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const t0 = Date.now();
    await page.goto(`${base}?${s.query}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => window.__nla?.stats?.()?.fps > 0, null, { timeout: 90_000, polling: 500 }).catch(() => {});
    if (s.after) {
      await page.evaluate(s.after);
      await page.waitForTimeout(500);
      await page.evaluate(s.after);
    }
    await page.waitForFunction(() => {
      const st = window.__nla?.stats?.();
      return st && st.fps > 0 && st.inFlight === 0 && st.readyQueue === 0 && st.drawCalls > 10;
    }, null, { timeout: 120_000, polling: 500 }).catch(() => console.warn(prefix + s.name, 'still streaming'));
    await page.waitForTimeout(800);
    const st = await page.evaluate(() => {
      const s = window.__nla?.stats?.() ?? {};
      const c = window.__nla?.app?.camera;
      return {
        fps: s.fps, drawCalls: s.drawCalls, triangles: s.triangles, tier: s.tier,
        lod0: s.lod0, inFlight: s.inFlight, cam: c ? [c.position.x, c.position.y, c.position.z] : null,
      };
    });
    const file = `${prefix}${s.name}.png`;
    await page.screenshot({ path: join(OUT, file), timeout: 60_000 });
    stats.push({ file, ...st, ms: Date.now() - t0, errors: errors.slice(0, 3) });
    console.log(file, JSON.stringify(st));
    await ctx.close();
  }
  return stats;
}

await harness();
const after = await city(AFTER, 'after-', [...shots, ...tiers]);
const before = await city(BEFORE, 'before-', shots.filter((s) => !s.name.startsWith('hero')));
writeFileSync(join(OUT, 'stats.json'), JSON.stringify({ after, before }, null, 2));
await browser.close();
