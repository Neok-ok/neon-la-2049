// Fixed-camera lighting shots. Desktop 1280×720 and a phone viewport.
//   BASE_URL=http://localhost:5173 OUT=/tmp/l1-before node scripts/l1-capture.mjs
// ONLY=little-tokyo,dtla  GPU=1
import { chromium } from 'playwright';
import { existsSync, mkdirSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? '/tmp/l1-shots';
const GPU = process.env.GPU === '1';
mkdirSync(OUT, { recursive: true });

const webgl = GPU ? '' : '&webgl=1';
const common = `freeze=1&ui=0&weather=rain&time=22.5${webgl}`;
const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const only = new Set((process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean));

/** Night stills: every district, plus a neon close-up and a wet street, on ultra and medium. */
const places = [
  ['little-tokyo', () => { window.__nla.marketView('street'); window.__nla.survey(5, -4, -16); }],
  ['historic-core', () => { window.__nla.broadwayView('street'); window.__nla.survey(8, 1, -22); }],
  ['dtla', () => { window.__nla.dtlaView('street'); window.__nla.survey(); }],
  ['financial', () => { window.__nla.megaView('street'); window.__nla.lampShot(11); }],
  ['civic', () => { window.__nla.civicView('plaza'); window.__nla.lampShot(12); }],
  ['hollywood', async () => { await window.__nla.hollywoodView('street'); window.__nla.survey(11, 2, -26); }],
  ['k-megablock', () => { window.__nla.kView('street'); window.__nla.lampShot(10); }],
  ['arts-district', () => { window.__nla.artsView('street'); window.__nla.lampShot(10); }],
  ['east-la', async () => { await window.__nla.eastLaView('street'); window.__nla.survey(6, -6, -18); }],
  ['wallace', () => { window.__nla.wallaceView('plaza'); window.__nla.survey(5, -2, -18); }],
  ['lakewood', async () => { await window.__nla.lakewoodView('street'); window.__nla.survey(); }],
  ['south-la', async () => { await window.__nla.southLaView('street'); window.__nla.survey(); }],
  ['westside', async () => { await window.__nla.westsideView('street'); }],
  ['basin', async () => { await window.__nla.basinView('street'); }],
  ['southeast', async () => { await window.__nla.southeastView('street'); window.__nla.survey(4, -8, -12); }],
  ['lax', async () => { await window.__nla.laxView('terminal'); window.__nla.lampShot(11); }],
  ['south-bay', async () => { await window.__nla.southBayView('street'); window.__nla.survey(4, -8, -12); }],
  ['harbor', async () => { await window.__nla.harborView('street'); window.__nla.survey(); }],
  ['long-beach', async () => { await window.__nla.longBeachView('canyon'); }],
  ['coastal', () => { window.__nla.coastView('blocks'); window.__nla.survey(); }],
  ['road', () => { window.__nla.roadView('historic-core'); window.__nla.survey(11, 3, -28); }],
  ['neon-closeup', () => { window.__nla.holoView('street'); window.__nla.survey(); }],
  ['wet-street', () => { window.__nla.trafficView('rain'); window.__nla.survey(); }],
];

/** @type {Array<{name:string, ctx:object, q:string, after?:Function}>} */
const shots = [];
for (const quality of ['ultra', 'medium']) {
  for (const [name, after] of places) {
    shots.push({
      name: `${name}-${quality}`,
      ctx: desktop,
      q: `mode=walk&quality=${quality}&${common}`,
      after,
    });
  }
}


const tonemap = process.env.TONEMAP;
const args = GPU
  ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function log(line) {
  writeSync(1, `${line}\n`);
}

function groupKey(s) {
  const quality = /quality=([a-z]+)/.exec(s.q)?.[1] ?? '';
  const v = s.ctx.viewport;
  return `${v.width}x${v.height}:${quality}:${s.ctx.isMobile ? 1 : 0}`;
}

/** One page per viewport and tier, then the bookmark cameras. A fresh document recompiles every shader. */
const selected = shots.filter((s) => !only.size || only.has(s.name));
const byKey = new Map();
for (const s of selected) {
  const key = groupKey(s);
  const list = byKey.get(key);
  if (list) list.push(s);
  else byKey.set(key, [s]);
}
const groups = [...byKey.entries()].map(([key, list]) => ({ key, shots: list }));

const resume = process.env.RESUME === '1';

function already(name) {
  if (!resume) return false;
  const p = join(OUT, `${name}.png`);
  if (!existsSync(p)) return false;
  try { return statSync(p).size > 8000; } catch { return false; }
}

async function boot(page, q, label) {
  await page.goto(`${BASE}?${q}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => {
    const st = window.__nla?.stats?.();
    return st && st.drawCalls > 30 && st.fps > 0 && st.lod0 >= 4;
  }, null, { timeout: 120_000, polling: 400 }).catch(() => log(`${label}: stream slow`));
  await page.evaluate(() => {
    const native = window.requestAnimationFrame.bind(window);
    let paused = false;
    let pending = null;
    window.requestAnimationFrame = (cb) => {
      if (paused) {
        pending = cb;
        return 0;
      }
      return native(cb);
    };
    window.__nlaPauseFrame = () => { paused = true; };
    window.__nlaResumeFrame = () => {
      paused = false;
      if (pending) {
        const cb = pending;
        pending = null;
        native(cb);
      }
    };
  });
}

async function grab(page, s, errors) {
  const t0 = Date.now();
  if (s.after) {
    await page.evaluate(s.after);
    await page.waitForTimeout(400);
    await page.evaluate(s.after);
    await page.waitForFunction(() => {
      const st = window.__nla?.stats?.();
      return st && st.fps > 0 && st.drawCalls > 20 && st.lod0 >= 4;
    }, null, { timeout: 75_000, polling: 400 }).catch(() => log(`${s.name}: still streaming`));
    // Lamps stream in with the chunk. Frame again once they exist.
    await page.evaluate(s.after);
    await page.waitForTimeout(900);
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
  }
  const stats = await page.evaluate(() => window.__nla?.stats?.() ?? null);
  if (!stats) throw new Error('debug api missing');
  await page.evaluate(() => window.__nlaPauseFrame?.());
  const client = await page.context().newCDPSession(page);
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${s.name}.png`), Buffer.from(shot.data, 'base64'));
  await client.detach();
  await page.evaluate(() => window.__nlaResumeFrame?.());
  const light = stats?.lighting ?? null;
  log(`${s.name}: ${((Date.now() - t0) / 1000).toFixed(1)}s fps=${stats?.fps} draws=${stats?.drawCalls} lod0=${stats?.lod0} tier=${stats?.tier} lights=${light ? JSON.stringify(light) : '-'}${errors.length ? ' ERR ' + errors[0] : ''}`);
  errors.length = 0;
}

const browser = await chromium.launch({ headless: true, args });
for (const group of groups) {
  const pending = group.shots.filter((s) => !already(s.name));
  if (!pending.length) {
    log(`${group.key}: resume skip`);
    continue;
  }
  const first = group.shots[0];
  const q = tonemap ? `${first.q}&tonemap=${tonemap}` : first.q;
  let ctx = await browser.newContext(first.ctx);
  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page, q, first.name);
  for (const s of pending) {
    try {
      await grab(page, s, errors);
    } catch (err) {
      log(`${s.name}: ${err instanceof Error ? err.message : err} — reloading`);
      await ctx.close().catch(() => {});
      ctx = await browser.newContext(first.ctx);
      page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      try {
        await boot(page, q, s.name);
        await grab(page, s, errors);
      } catch (err2) {
        log(`${s.name}: FAILED ${err2 instanceof Error ? err2.message : err2}`);
      }
    }
  }
  await ctx.close().catch(() => {});
}
await browser.close();
