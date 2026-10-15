// Night stills for the particle smoke pass. One browser per tier, five cameras.
//   BASE_URL=http://127.0.0.1:5173 OUT=/tmp/k1-shots node scripts/k1-capture.mjs
// ONLY=low,medium  SCENES=launch,street
// Headless SwiftShader does not deliver requestAnimationFrame, so the script pumps frames
// and reads the canvas in the same turn as the draw.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT ?? '/tmp/k1-shots';
mkdirSync(OUT, { recursive: true });

const TIERS = (process.env.ONLY ?? 'low,medium,high,ultra').split(',').map((s) => s.trim()).filter(Boolean);
const SCENES = new Set((process.env.SCENES ?? 'launch,street,stall,refinery,traffic').split(',').map((s) => s.trim()).filter(Boolean));

const shots = [
  {
    name: 'launch',
    weather: 'clear',
    go: async () => { await window.__nla.laxView('burn'); },
    ready: (sm) => sm.warm <= 16 && sm.launch >= 60,
  },
  {
    name: 'street',
    weather: 'rain',
    go: async () => { window.__nla.smokeView('street'); },
    ready: (sm) => sm.warm <= 16 && sm.grate >= 28,
  },
  {
    name: 'stall',
    weather: 'rain',
    go: async () => { window.__nla.smokeView('stall'); },
    ready: (sm) => sm.warm <= 16 && sm.stall >= 8,
  },
  {
    name: 'refinery',
    weather: 'clear',
    go: async () => { await window.__nla.southBayView('flare'); },
    ready: (sm) => sm.warm <= 16 && sm.stack >= 36,
  },
  {
    name: 'traffic',
    weather: 'rain',
    go: async () => { window.__nla.trafficView('rain'); },
    ready: (sm) => sm.warm <= 16 && sm.exhaust >= 12,
  },
];

function log(line) {
  process.stdout.write(`${line}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pump(context) {
  await context.addInitScript(() => {
    window.__k1Frames = true;
    window.__k1Grab = false;
    window.__k1Png = '';
    window.__k1Err = '';
    window.__k1Held = null;
    const run = (cb) => {
      window.__k1Held = null;
      try {
        cb(performance.now());
        if (window.__k1Grab) {
          const canvas = window.__nla?.app?.canvas ?? document.querySelector('canvas');
          const gl = canvas?.getContext?.('webgl2');
          if (gl && gl.drawingBufferWidth > 0) {
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
          }
          window.__k1Png = canvas ? canvas.toDataURL('image/png') : '';
          window.__k1Grab = false;
        }
      } catch (err) {
        const message = err instanceof Error ? (err.stack || err.message) : String(err);
        window.__k1Err = message;
        window.__k1Grab = false;
        console.error(message);
      }
    };
    window.__k1Pump = (n) => {
      const cb = window.__k1Held;
      if (!cb) return 0;
      const count = Math.max(0, n | 0);
      for (let i = 0; i < count; i++) run(cb);
      return count;
    };
    window.requestAnimationFrame = (cb) => {
      window.__k1Held = cb;
      return window.setTimeout(() => {
        if (!window.__k1Frames) return;
        run(cb);
      }, 16);
    };
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    window.setInterval(() => {
      const held = window.__k1Held;
      if (held && window.__k1Frames) run(held);
    }, 32);
    const hide = { configurable: true, get: () => false };
    const show = { configurable: true, get: () => 'visible' };
    try { Object.defineProperty(Document.prototype, 'hidden', hide); } catch { /* native getter stays */ }
    try { Object.defineProperty(Document.prototype, 'visibilityState', show); } catch { /* native getter stays */ }
  });
}

async function grab(page) {
  const session = await page.context().newCDPSession(page);
  const shot = await session.send('Page.captureScreenshot', { format: 'png' });
  await session.detach();
  return Buffer.from(shot.data, 'base64');
}

async function boot(page, tier) {
  const q = `smoke=live&capture=1&freeze=1&seed=2049&time=22.5&ui=0&webgl=1&quality=${tier}&weather=clear&mode=fly`;
  await page.goto(`${BASE}?${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !!window.__nla?.stats, null, { timeout: 180000 });
}

async function settle(page, shot) {
  await page.evaluate((weather) => window.__nla.setWeather(weather, true), shot.weather);
  await page.evaluate(shot.go);
  let posed = shot.name !== 'traffic';
  if (shot.name === 'traffic') {
    const carDeadline = Date.now() + 20000;
    while (Date.now() < carDeadline) {
      const cars = await page.evaluate(() => window.__nla.stats().groundCars ?? 0);
      if (cars > 0) break;
      await sleep(300);
    }
    await sleep(400);
    posed = await page.evaluate(() => window.__nla.smokeView('exhaust') === true);
  }
  // SwiftShader delivers few timers while the page is busy. Step the sim here so
  // the plume has aged before the still, instead of photographing the first puffs.
  page.setDefaultTimeout(180000);
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 64; i++) {
      if (typeof window.__k1Pump === 'function') window.__k1Pump(1);
      const warm = window.__nla?.stats?.()?.smoke?.warm ?? 40;
      if (i > 10 && warm <= 4 && window.__k1Held) break;
      await wait(0);
    }
  });
  const deadline = Date.now() + 20000;
  let last = '';
  while (Date.now() < deadline) {
    const s = await page.evaluate((name) => {
      const st = window.__nla?.stats?.();
      const sm = st?.smoke;
      if (!st || !sm) return { ok: false, why: 'no-smoke' };
      const cars = st.groundCars ?? 0;
      const aged = sm.warm <= 16;
      let ok = false;
      if (name === 'launch') ok = aged && sm.launch >= 60;
      else if (name === 'street') ok = aged && sm.grate >= 28;
      else if (name === 'stall') ok = aged && sm.stall >= 8;
      else if (name === 'refinery') ok = aged && sm.stack >= 36;
      else if (name === 'traffic') ok = aged && sm.exhaust >= 12 && cars > 0;
      const cam = window.__nla?.app?.camera?.position;
      return {
        ok, cars, warm: sm.warm, launch: sm.launch, grate: sm.grate, stall: sm.stall,
        stack: sm.stack, exhaust: sm.exhaust, alive: sm.alive, mouths: sm.mouths,
        lod0: st.lod0, draws: st.drawCalls, far: st.farMs,
        cam: cam ? [Math.round(cam.x), Math.round(cam.y), Math.round(cam.z)] : null,
      };
    }, shot.name);
    last = JSON.stringify(s);
    if (!posed && shot.name === 'traffic' && (s.cars ?? 0) > 0) {
      posed = await page.evaluate(() => window.__nla.smokeView('exhaust') === true);
    }
    if (s.ok && (s.draws ?? 0) > 30 && (s.lod0 ?? 0) > 0) return s;
    await sleep(300);
  }
  log(`  wait timeout ${shot.name} ${last}`);
  return JSON.parse(last || '{}');
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

for (const tier of TIERS) {
  for (const shot of shots) {
    if (!SCENES.has(shot.name)) continue;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await pump(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 400));
    });
    const t0 = Date.now();
    try {
      await boot(page, tier);
      const snap = await settle(page, shot);
      await page.evaluate(() => document.getElementById('loading')?.remove());
      await sleep(600);
      const png = await grab(page);
      const file = join(OUT, `k1-2026-10-15-${shot.name}-${tier}.png`);
      writeFileSync(file, png);
      log(`${tier} ${shot.name} ${((Date.now() - t0) / 1000).toFixed(1)}s ${png.length}b ${JSON.stringify(snap)} err=${errors.at(-1) ?? ''}`);
    } catch (err) {
      log(`${tier} ${shot.name} FAIL ${err instanceof Error ? err.message : err} ${errors.at(-1) ?? ''}`);
    }
    await ctx.close();
  }
}

await browser.close();
