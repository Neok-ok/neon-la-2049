// Before/after stills for Detail Pass D4. SwiftShader WebGL2 unless GPU=1.
//   BASE_URL=http://127.0.0.1:4173/ OUT=/tmp/d4-before node scripts/d4-capture.mjs
// Same cameras, time 22.5, weather rain, freeze. Desktop shots are quality=high
// so the K aerial (about 220 m) is inside the parallax range. The phone shot is medium.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? 'screenshots-tmp/d4';
const GPU = process.env.GPU === '1';
mkdirSync(OUT, { recursive: true });

const webgl = GPU ? '' : '&webgl=1';
const args = GPU
  ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'];

const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const iphone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

async function settle(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    const idle = await page.evaluate(() => {
      const s = window.__nla?.stats?.();
      return !!(s && s.inFlight === 0 && s.readyQueue === 0 && s.fps > 0 && s.drawCalls > 10);
    });
    if (idle) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

async function boot(page, url) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__nla?.stats, null, { timeout: 180_000 });
  await settle(page);
  return errors;
}

async function shot(page, name) {
  await settle(page);
  // Pin the clock so rain streaks and the occupancy bucket match across the pair.
  // A SwiftShader frame can be longer than a second, so wait for the next frame
  // to upload U.time before the pixels are read.
  const frame = await page.evaluate(() => {
    const app = window.__nla.app;
    app.elapsed = 180;
    return app.frames;
  });
  await page.waitForFunction((n) => window.__nla.app.frames > n + 1, frame, { timeout: 30_000 });
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, type: 'png' });
  const stats = await page.evaluate(() => {
    const s = window.__nla.stats();
    return {
      draws: s.drawCalls, tris: s.triangles, tier: s.tier, backend: s.backend,
      canvas: `${s.canvasWidth}x${s.canvasHeight}`, dpr: s.pixelRatio,
      frameMs: s.frameMs, windows: s.windows ?? null,
      pose: {
        x: window.__nla.app.camera.position.x,
        y: window.__nla.app.camera.position.y,
        z: window.__nla.app.camera.position.z,
      },
    };
  });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(stats, null, 2));
  console.log('SHOT', name, JSON.stringify(stats));
  return file;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  args,
  headless: true,
});

const errors = [];

const desk = await browser.newContext(desktop);
const page = await desk.newPage();
errors.push(...await boot(page, `${BASE}?mode=fly&quality=high&freeze=1&ui=0&time=22.5&weather=rain${webgl}`));

await page.evaluate(() => window.__nla.kView('aerial'));
await shot(page, 'k-aerial');

await page.evaluate(() => window.__nla.broadwayView('street'));
await shot(page, 'broadway-street');

await page.evaluate(() => {
  const layout = window.__nla.app.query.layout;
  const l = layout.landmarkById('megatower-1');
  const g = layout.heightAt(l.x, l.z);
  const yaw = (-l.bearingDeg * Math.PI) / 180;
  const dist = 80;
  const x = l.x + Math.sin(yaw) * dist;
  const z = l.z + Math.cos(yaw) * dist;
  const y = g + l.height * 0.4;
  const lookY = g + l.height * 0.42;
  const heading = Math.atan2(l.x - x, -(l.z - z)) * 180 / Math.PI;
  const pitch = Math.atan2(lookY - y, dist) * 180 / Math.PI;
  window.__nla.setMode('fly');
  window.__nla.app.cams.fly.cockpit = true;
  window.__nla.setPose(x, y, z, heading, pitch);
});
await shot(page, 'financial-mid');

await page.evaluate(() => {
  const layout = window.__nla.app.query.layout;
  const l = layout.landmarkById('k-megablock-tower');
  const g = layout.heightAt(l.x, l.z);
  const yaw = (-l.bearingDeg * Math.PI) / 180;
  const seed = Math.fround(0.37);
  const u0 = 100 + seed * 1000;
  const SLAB_W = 230, HD = 42.5, CELL_W = 3.2, CELL_H = 3.1, Y0 = 3.6;
  const cellX = Math.floor((u0 + (-22 + SLAB_W / 2)) / CELL_W);
  const localX = (cellX + 0.5) * CELL_W - u0 - SLAB_W / 2;
  const cellY = Math.floor((46 - Y0) / CELL_H);
  const localY = Y0 + (cellY + 0.55) * CELL_H;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, ly, lz) => ({
    x: l.x + lx * c + lz * s,
    y: g + ly,
    z: l.z - lx * s + lz * c,
  });
  const eye = at(localX, localY, HD + 4.2);
  const win = at(localX, localY, HD);
  const heading = Math.atan2(win.x - eye.x, -(win.z - eye.z)) * 180 / Math.PI;
  const pitch = Math.atan2(win.y - eye.y, Math.hypot(win.x - eye.x, win.z - eye.z) || 1) * 180 / Math.PI;
  window.__nla.setMode('fly');
  window.__nla.app.cams.fly.cockpit = true;
  window.__nla.setWeather('rain', true);
  window.__nla.setTime(22.5);
  window.__nla.setPose(eye.x, eye.y, eye.z, heading, pitch);
});
await shot(page, 'window-rain');
await desk.close();

const phone = await browser.newContext(iphone);
const ip = await phone.newPage();
errors.push(...await boot(ip, `${BASE}?mode=walk&quality=medium&freeze=1&ui=0&time=22.5&weather=rain${webgl}`));
await ip.evaluate(() => window.__nla.broadwayView('street'));
await shot(ip, 'iphone-broadway');
await phone.close();

writeFileSync(join(OUT, 'errors.json'), JSON.stringify(errors, null, 2));
console.log('ERRORS', errors.length);
await browser.close();
