// Before/after stills for Detail Pass D5. SwiftShader WebGL2 unless GPU=1.
//   BASE_URL=http://127.0.0.1:4173/ OUT=/opt/cursor/artifacts/d5-before node scripts/d5-capture.mjs
// Same cameras, freeze, time. Desktop is high. Phone is 390×844, DPR 3, medium.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? 'screenshots-tmp/d5';
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

const SHOTS = [
  { name: 'skyline', view: 'desktop', quality: 'high', time: '22.5', weather: 'rain', go: "window.__nla.megaView('skyline')" },
  { name: 'broadway', view: 'desktop', quality: 'high', time: '22.5', weather: 'rain', go: "window.__nla.broadwayView('street')" },
  { name: 'searchlight', view: 'desktop', quality: 'high', time: '22.5', weather: 'rain', go: "window.__nla.broadwayView('spinner')" },
  { name: 'little-tokyo', view: 'desktop', quality: 'high', time: '22.5', weather: 'rain', go: "window.__nla.marketView('street')" },
  { name: 'open-rain', view: 'desktop', quality: 'high', time: '22.5', weather: 'rain', go: '' },
  { name: 'open-clear', view: 'desktop', quality: 'high', time: '12', weather: 'clear', go: '' },
  { name: 'iphone-skyline', view: 'iphone', quality: 'medium', time: '22.5', weather: 'rain', go: "window.__nla.megaView('skyline')" },
  { name: 'iphone-broadway', view: 'iphone', quality: 'medium', time: '22.5', weather: 'rain', go: "window.__nla.broadwayView('street')" },
  { name: 'iphone-searchlight', view: 'iphone', quality: 'medium', time: '22.5', weather: 'rain', go: "window.__nla.broadwayView('spinner')" },
  { name: 'iphone-little-tokyo', view: 'iphone', quality: 'medium', time: '22.5', weather: 'rain', go: "window.__nla.marketView('street')" },
  { name: 'iphone-open-rain', view: 'iphone', quality: 'medium', time: '22.5', weather: 'rain', go: '' },
  { name: 'arts-stacks', view: 'desktop', quality: 'medium', time: '22.5', weather: 'rain', go: "window.__nla.artsView('stacks')" },
  { name: 'dtla-lanes', view: 'desktop', quality: 'medium', time: '22.5', weather: 'rain', go: "window.__nla.dtlaView('lanes')" },
  { name: 'dtla-lanes-dusk', view: 'desktop', quality: 'medium', time: '18.7', weather: 'rain', go: "window.__nla.dtlaView('lanes')" },
];

async function settle(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000) {
    const idle = await page.evaluate(() => {
      const s = window.__nla?.stats?.();
      return !!(s && s.inFlight === 0 && s.readyQueue === 0 && s.fps > 0 && s.drawCalls > 8);
    });
    if (idle) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

async function shot(page, name) {
  await settle(page);
  const frame = await page.evaluate(() => {
    const app = window.__nla.app;
    app.elapsed = 180;
    return app.frames;
  });
  await page.waitForFunction((n) => window.__nla.app.frames > n + 1, frame, { timeout: 60_000 });
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, type: 'png', timeout: 180_000 });
  const stats = await page.evaluate(() => {
    const s = window.__nla.stats();
    const c = window.__nla.app.camera.position;
    return {
      draws: s.drawCalls,
      tris: s.triangles,
      tier: s.tier,
      backend: s.backend,
      canvas: `${s.canvasWidth}x${s.canvasHeight}`,
      dpr: s.pixelRatio,
      pixels: s.canvasPixels,
      frameMs: s.frameMs,
      worstMs: s.worstMs,
      gpuGeomMB: s.gpuGeomBytes != null ? Math.round(s.gpuGeomBytes / 1e6 * 10) / 10 : null,
      jsHeapMB: s.jsHeap != null ? Math.round(s.jsHeap / 1e6 * 10) / 10 : null,
      air: s.air ?? null,
      pose: { x: c.x, y: c.y, z: c.z },
    };
  });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(stats, null, 2));
  console.log('SHOT', name, JSON.stringify(stats));
  return stats;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args, headless: true });
const errors = [];
const pages = new Map();

async function pageFor(spec) {
  const key = `${spec.view}|${spec.quality}|${spec.time}|${spec.weather}`;
  if (pages.has(key)) return pages.get(key);
  // One city at a time. A second live page saturates SwiftShader and the next navigation never finishes.
  for (const [k, old] of pages) {
    await old.context().close();
    pages.delete(k);
  }
  const ctx = await browser.newContext(spec.view === 'iphone' ? iphone : desktop);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = `${BASE}?mode=fly&quality=${spec.quality}&freeze=1&ui=0&time=${spec.time}&weather=${spec.weather}${webgl}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction(() => window.__nla?.stats, null, { timeout: 300_000 });
  await settle(page);
  pages.set(key, page);
  return page;
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
for (const spec of SHOTS) {
  if (only && !only.has(spec.name)) continue;
  const page = await pageFor(spec);
  const go = spec.go || `(() => {
    const nla = window.__nla;
    const [x, z] = nla.geoToLocal(34.0505, -118.2405);
    const [px, pz] = nla.geoToLocal(34.005, -118.2);
    const dist = Math.hypot(px - x, pz - z) || 1;
    const y = 540;
    const pitch = Math.atan2(1100 - y, dist);
    const heading = Math.atan2(px - x, -(pz - z));
    nla.setMode('fly');
    nla.setPose(x, y, z, heading * 180 / Math.PI, pitch * 180 / Math.PI);
    return true;
  })()`;
  const ok = await page.evaluate((src) => {
    const fn = new Function(`return ${src}`);
    return fn();
  }, go);
  if (!ok) console.log('VIEW MISS', spec.name);
  await shot(page, spec.name);
}

writeFileSync(join(OUT, 'errors.json'), JSON.stringify(errors.slice(0, 30), null, 2));
console.log('WROTE', OUT, 'errors', errors.length);
await browser.close();
