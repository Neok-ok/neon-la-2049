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
    ready: (sm) => sm.warm <= 12 && sm.launch >= 80,
  },
  {
    name: 'street',
    weather: 'rain',
    go: async () => { window.__nla.marketView('street'); },
    ready: (sm) => sm.warm <= 12 && sm.grate >= 24,
  },
  {
    name: 'stall',
    weather: 'rain',
    go: async () => { window.__nla.smokeView('stall'); },
    ready: (sm) => sm.warm <= 12 && sm.stall >= 12,
  },
  {
    name: 'refinery',
    weather: 'clear',
    go: async () => { await window.__nla.southBayView('flare'); },
    ready: (sm) => sm.warm <= 12 && sm.stack >= 24,
  },
  {
    name: 'traffic',
    weather: 'rain',
    go: async () => { window.__nla.trafficView('rain'); },
    ready: (sm) => sm.warm <= 12 && sm.exhaust >= 8,
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
    window.requestAnimationFrame = (cb) => window.setTimeout(() => {
      if (!window.__k1Frames) {
        window.__k1Held = cb;
        return;
      }
      run(cb);
    }, 16);
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
  await page.evaluate(() => { window.__k1Png = ''; window.__k1Err = ''; window.__k1Grab = true; });
  try {
    await page.waitForFunction(() => window.__k1Png && window.__k1Png.length > 64, null, { timeout: 45000 });
    const url = await page.evaluate(() => window.__k1Png);
    const comma = url.indexOf(',');
    return Buffer.from(url.slice(comma + 1), 'base64');
  } catch {
    const diag = await page.evaluate(() => ({
      err: window.__k1Err || '',
      grab: !!window.__k1Grab,
      png: (window.__k1Png || '').length,
      canvas: (() => {
        const c = document.querySelector('canvas');
        return c ? `${c.width}x${c.height}` : 'none';
      })(),
      smoke: window.__nla?.stats?.()?.smoke ?? null,
    }));
    log(`  canvas grab missed ${JSON.stringify(diag)}`);
    const session = await page.context().newCDPSession(page);
    const shot = await session.send('Page.captureScreenshot', { format: 'png' });
    await session.detach();
    return Buffer.from(shot.data, 'base64');
  }
}

async function boot(page, tier) {
  const q = `smoke=live&capture=1&freeze=1&seed=2049&time=22.5&ui=0&webgl=1&quality=${tier}&weather=clear&mode=fly`;
  await page.goto(`${BASE}?${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !!window.__nla?.stats, null, { timeout: 180000 });
}

async function settle(page, shot) {
  await page.evaluate((weather) => window.__nla.setWeather(weather, true), shot.weather);
  await page.evaluate(shot.go);
  if (shot.name === 'traffic') {
    const carDeadline = Date.now() + 45000;
    while (Date.now() < carDeadline) {
      const cars = await page.evaluate(() => window.__nla.stats().groundCars ?? 0);
      if (cars > 0) break;
      await sleep(400);
    }
    await page.evaluate(() => window.__nla.smokeView('exhaust'));
  }
  const deadline = Date.now() + 120000;
  let last = '';
  while (Date.now() < deadline) {
    const s = await page.evaluate((name) => {
      const st = window.__nla?.stats?.();
      const sm = st?.smoke;
      if (!st || !sm) return { ok: false, why: 'no-smoke' };
      const cars = st.groundCars ?? 0;
      let ok = false;
      if (name === 'launch') ok = sm.warm <= 12 && sm.launch >= 80;
      else if (name === 'street') ok = sm.warm <= 12 && sm.grate >= 24;
      else if (name === 'stall') ok = sm.warm <= 12 && sm.stall >= 12;
      else if (name === 'refinery') ok = sm.warm <= 12 && sm.stack >= 24;
      else if (name === 'traffic') ok = sm.warm <= 12 && sm.exhaust >= 8 && cars > 0;
      const cam = window.__nla?.app?.camera?.position;
      return {
        ok, cars, warm: sm.warm, launch: sm.launch, grate: sm.grate, stall: sm.stall,
        stack: sm.stack, exhaust: sm.exhaust, alive: sm.alive, mouths: sm.mouths,
        lod0: st.lod0, draws: st.drawCalls, far: st.farMs,
        cam: cam ? [Math.round(cam.x), Math.round(cam.y), Math.round(cam.z)] : null,
      };
    }, shot.name);
    last = JSON.stringify(s);
    if (s.ok && (s.draws ?? 0) > 30 && (s.lod0 ?? 0) > 0) return s;
    if (shot.name === 'traffic' && s.cars === 0 && s.warm <= 12) {
      await page.evaluate(shot.go);
    }
    await sleep(400);
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
      await sleep(500);
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
