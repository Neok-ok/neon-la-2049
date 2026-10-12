// Night-rain stills for the road passes. SwiftShader unless GPU=1.
//   BASE_URL=http://127.0.0.1:5174/ OUT=/tmp/roads-before node scripts/roads-d7-capture.mjs
import { chromium } from 'playwright';
import { existsSync, mkdirSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT ?? '/tmp/roads-d7';
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

const places = [
  ['broadway-street', () => { window.__nla.broadwayView('street'); }],
  ['broadway-2m', () => { window.__nla.broadwayView('street'); window.__nla.survey(0.35, 1.6, -38); }],
  ['broadway-20m', () => { window.__nla.broadwayView('street'); window.__nla.survey(3.2, 18, -14); }],
  ['southla-spine', async () => { await window.__nla.southLaView('spine'); }],
  ['southla-2m', async () => { await window.__nla.southLaView('spine'); window.__nla.survey(0.35, 1.6, -38); }],
  ['lakewood-street', async () => { await window.__nla.lakewoodView('street'); }],
  ['lakewood-up', async () => { await window.__nla.lakewoodView('street'); window.__nla.survey(43, 8, -58); }],
  ['k-street', () => { window.__nla.kView('street'); }],
  ['coast-blocks', () => { window.__nla.coastView('blocks'); }],
  ['broadway-lamp', () => { window.__nla.broadwayView('street'); window.__nla.lampShot(9, -16, 0, 0); }],
  ['lakewood-lamp', async () => { await window.__nla.lakewoodView('street'); window.__nla.lampShot(9, -16, 0, 0); }],
];

const shots = [];
for (const [name, after] of places) {
  shots.push({ name: `${name}-high`, ctx: desktop, q: `mode=walk&quality=high&${common}`, after });
}
shots.push({
  name: 'broadway-refl-high',
  ctx: desktop,
  q: `mode=walk&quality=high&refl=1&${common}`,
  after: () => { window.__nla.broadwayView('street'); },
});
for (const name of ['broadway-street', 'lakewood-street', 'lakewood-up', 'k-street', 'coast-blocks']) {
  const after = places.find((p) => p[0] === name)[1];
  shots.push({ name: `${name}-phone`, ctx: phone, q: `mode=walk&quality=medium&${common}`, after });
}

const args = GPU
  ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function log(line) {
  writeSync(1, `${line}\n`);
}

function groupKey(s) {
  const v = s.ctx.viewport;
  return `${v.width}x${v.height}:${s.q}`;
}

const selected = shots.filter((s) => !only.size || only.has(s.name));
const byKey = new Map();
for (const s of selected) {
  const key = groupKey(s);
  const list = byKey.get(key);
  if (list) list.push(s);
  else byKey.set(key, [s]);
}

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
  }, null, { timeout: 180_000, polling: 400 }).catch(() => log(`${label}: stream slow`));
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
    await page.waitForTimeout(500);
    await page.evaluate(s.after);
    await page.waitForFunction(() => {
      const st = window.__nla?.stats?.();
      return st && st.fps > 0 && st.drawCalls > 20 && st.lod0 >= 4;
    }, null, { timeout: 90_000, polling: 400 }).catch(() => log(`${s.name}: still streaming`));
    await page.evaluate(s.after);
    await page.waitForTimeout(1100);
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
  }
  const stats = await page.evaluate(() => {
    const st = window.__nla?.stats?.() ?? null;
    const c = window.__nla?.app?.camera;
    return {
      st,
      pose: c ? { x: c.position.x, y: c.position.y, z: c.position.z } : null,
    };
  });
  if (!stats.st) throw new Error('debug api missing');
  await page.evaluate(() => window.__nlaPauseFrame?.());
  const client = await page.context().newCDPSession(page);
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${s.name}.png`), Buffer.from(shot.data, 'base64'));
  writeFileSync(join(OUT, `${s.name}.json`), JSON.stringify(stats, null, 2));
  await client.detach();
  await page.evaluate(() => window.__nlaResumeFrame?.());
  const light = stats.st.lighting ?? null;
  log(`${s.name}: ${((Date.now() - t0) / 1000).toFixed(1)}s fps=${stats.st.fps} draws=${stats.st.drawCalls} lod0=${stats.st.lod0} tier=${stats.st.tier} pose=${stats.pose ? `${stats.pose.x.toFixed(1)},${stats.pose.y.toFixed(1)},${stats.pose.z.toFixed(1)}` : '-'} lights=${light ? JSON.stringify(light) : '-'}${errors.length ? ' ERR ' + errors[0] : ''}`);
  errors.length = 0;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  headless: true,
  args,
});
for (const [key, list] of byKey) {
  const pending = list.filter((s) => !already(s.name));
  if (!pending.length) {
    log(`${key}: resume skip`);
    continue;
  }
  const first = list[0];
  let ctx = await browser.newContext(first.ctx);
  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page, first.q, first.name);
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
        await boot(page, first.q, s.name);
        await grab(page, s, errors);
      } catch (err2) {
        log(`${s.name}: FAILED ${err2 instanceof Error ? err2.message : err2}`);
      }
    }
  }
  await ctx.close().catch(() => {});
}
await browser.close();
