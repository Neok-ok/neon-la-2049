// Still and motion captures for the smoke pass.
//   BASE_URL=http://127.0.0.1:5173 OUT=/tmp/k1-before PHASE=before node scripts/k1-capture.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT ?? '/tmp/k1-shots';
const PHASE = process.env.PHASE ?? 'after';
mkdirSync(OUT, { recursive: true });

const common = `freeze=1&capture=1&ui=0&time=22.5&webgl=1${process.env.EXTRA ? `&${process.env.EXTRA}` : ''}`;

/** @type {Array<{name:string,q:string,after:Function,frames?:number}>} */
const shots = [
  {
    name: 'launch',
    q: `mode=fly&quality=ultra&weather=clear&${common}`,
    frames: 6,
    after: async () => { await window.__nla.laxView('burn'); },
  },
  {
    name: 'market-rain',
    q: `mode=walk&quality=ultra&weather=rain&${common}`,
    frames: 6,
    after: () => { window.__nla.marketView('street'); },
  },
  {
    name: 'refinery',
    q: `mode=walk&quality=ultra&weather=clear&${common}`,
    frames: 6,
    after: async () => { await window.__nla.southBayView('flare'); },
  },
  {
    name: 'refinery-street',
    q: `mode=walk&quality=ultra&weather=clear&${common}`,
    frames: 2,
    after: async () => { await window.__nla.southBayView('street'); },
  },
  {
    name: 'market-stall',
    q: `mode=walk&quality=ultra&weather=clear&${common}`,
    frames: 2,
    after: () => { window.__nla.marketView('bibi'); },
  },
  {
    name: 'market-roof',
    q: `mode=fly&quality=ultra&weather=clear&${common}`,
    frames: 2,
    after: () => { window.__nla.marketView('roof'); },
  },
  {
    name: 'traffic-rain',
    q: `mode=walk&quality=ultra&weather=rain&${common}`,
    frames: 4,
    after: () => { window.__nla.trafficView('rain'); },
  },
  {
    name: 'launch-medium',
    q: `mode=fly&quality=medium&weather=clear&${common}`,
    frames: 1,
    after: async () => { await window.__nla.laxView('burn'); },
  },
  {
    name: 'launch-low',
    q: `mode=fly&quality=low&weather=clear&${common}`,
    frames: 1,
    after: async () => { await window.__nla.laxView('burn'); },
  },
  {
    name: 'market-high',
    q: `mode=walk&quality=high&weather=rain&${common}`,
    frames: 1,
    after: () => { window.__nla.marketView('street'); },
  },
];

const only = new Set((process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const tierOverride = process.env.TIER;
const frameCap = process.env.FRAMES ? Number(process.env.FRAMES) : 0;
const selected = shots.filter((s) => !only.size || only.has(s.name)).map((s) => ({
  ...s,
  q: tierOverride ? s.q.replace(/quality=[a-z]+/, `quality=${tierOverride}`) : s.q,
  frames: frameCap > 0 ? frameCap : s.frames,
}));

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

function log(line) {
  process.stdout.write(`${line}\n`);
}

async function boot(page, q, after) {
  await page.goto(`${BASE}?${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!window.__nla?.stats, null, { timeout: 120000 });
  // Move before capture holds the opening stream, so the shot's district is what loads.
  await page.evaluate(after);
  await page.waitForFunction(() => {
    const st = window.__nla?.stats?.();
    return st && st.drawCalls > 40 && st.lod0 > 2 && st.fps > 0;
  }, null, { timeout: 240000 });
  await page.evaluate(() => document.getElementById('loading')?.remove());
}

for (const s of selected) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  const t0 = Date.now();
  try {
    await boot(page, s.q, s.after);
    await page.evaluate(s.after);
    await page.waitForFunction((name) => {
      const st = window.__nla?.stats?.();
      const sm = st?.smoke;
      if (!st || !sm || st.drawCalls < 30) return false;
      const off = new URLSearchParams(location.search).get('smoke') === 'off';
      if (off) return st.lod0 > 2 && st.drawCalls > 40;
      if (String(name).startsWith('launch')) return sm.launch && sm.shells > 4;
      if (String(name).startsWith('traffic')) return sm.shells > 0 || st.groundCars > 0;
      return sm.emitters > 0 && sm.shells > 2;
    }, s.name, { timeout: 90000 });
    await page.evaluate(s.after);
    await page.waitForTimeout(1500);
    const n = s.frames ?? 1;
    const stats = [];
    for (let i = 0; i < n; i++) {
      if (i > 0) await page.waitForTimeout(380);
      const st = await page.evaluate(() => window.__nla.stats());
      stats.push(st);
      const session = await page.context().newCDPSession(page);
      const shot = await session.send('Page.captureScreenshot', { format: 'png' });
      await session.detach();
      writeFileSync(join(OUT, `${PHASE}-${s.name}-f${i}.png`), Buffer.from(shot.data, 'base64'));
    }
    const last = stats[stats.length - 1];
    log(`${PHASE}-${s.name}: ${((Date.now() - t0) / 1000).toFixed(1)}s fps=${last?.fps} draws=${last?.drawCalls} tier=${last?.tier} smoke=${JSON.stringify(last?.smoke ?? null)} err=${errors[0] ?? ''}`);
  } catch (err) {
    log(`${PHASE}-${s.name}: FAIL ${err instanceof Error ? err.message : err} ${errors[0] ?? ''}`);
  }
  await ctx.close();
}
await browser.close();
