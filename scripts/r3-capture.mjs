// Before/after stills for refinement R3 (interiors). SwiftShader WebGL2 unless GPU=1.
//   BASE_URL=http://127.0.0.1:4173/ OUT=/opt/cursor/artifacts/r3-before node scripts/r3-capture.mjs
// Desktop and 390×844 are both medium, night rain, DPR 1, so the frame matches the budget tier.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? 'screenshots-tmp/r3';
const GPU = process.env.GPU === '1';
mkdirSync(OUT, { recursive: true });

const webgl = GPU ? '' : '&webgl=1';
const args = GPU
  ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'];

const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const iphone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

const VIEWS = [
  { id: 'k-apartment', go: "window.__nla.kView('apartment')" },
  { id: 'wallace-atrium', go: "window.__nla.wallaceView('atrium')" },
  { id: 'bradbury-court', go: "window.__nla.interiorView('court')" },
  { id: 'east-la-counter', go: "window.__nla.eastLaView('interior')" },
  { id: 'lapd-lobby', go: "window.__nla.civicView('lobby')" },
];

const SHOTS = [];
for (const view of ['desktop', 'iphone']) {
  for (const v of VIEWS) {
    SHOTS.push({
      name: view === 'iphone' ? `iphone-${v.id}` : v.id,
      view, quality: 'medium', time: '22.5', weather: 'rain', go: v.go,
    });
  }
}

async function settle(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000) {
    const idle = await page.evaluate(() => {
      const s = window.__nla?.stats?.();
      return !!(s && s.inFlight === 0 && s.readyQueue === 0 && s.fps > 0 && s.drawCalls > 2);
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
  await page.waitForFunction((n) => window.__nla.app.frames > n + 2, frame, { timeout: 60_000 });
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
      interior: s.interior,
      interiorOccluded: s.interiorOccluded,
      interiorTris: s.interiorTris,
      interiorMeshes: s.interiorMeshes,
      frameMs: s.frameMs,
      pose: { x: Math.round(c.x), y: Math.round(c.y), z: Math.round(c.z) },
    };
  });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(stats, null, 2));
  console.log('SHOT', name, JSON.stringify(stats));
  return stats;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args,
  headless: true,
});
const errors = [];
const pages = new Map();

async function pageFor(spec) {
  const key = `${spec.view}|${spec.quality}|${spec.time}|${spec.weather}`;
  if (pages.has(key)) return pages.get(key);
  for (const [k, old] of pages) {
    await old.context().close();
    pages.delete(k);
  }
  const ctx = await browser.newContext(spec.view === 'iphone' ? iphone : desktop);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = `${BASE}?mode=fly&quality=${spec.quality}&freeze=1&ui=0&hud=0&time=${spec.time}&weather=${spec.weather}&refl=0${webgl}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction(() => window.__nla?.stats, null, { timeout: 300_000 });
  await settle(page);
  pages.set(key, page);
  return page;
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const table = [];
for (const spec of SHOTS) {
  if (only && !only.has(spec.name)) continue;
  const page = await pageFor(spec);
  const ok = await page.evaluate((src) => {
    const fn = new Function(`return ${src}`);
    return fn();
  }, spec.go);
  if (!ok) console.log('VIEW MISS', spec.name);
  const stats = await shot(page, spec.name);
  table.push({ name: spec.name, ...stats });
}

writeFileSync(join(OUT, 'budget.json'), JSON.stringify(table, null, 2));
writeFileSync(join(OUT, 'errors.json'), JSON.stringify(errors.slice(0, 40), null, 2));
console.log('WROTE', OUT, 'errors', errors.length);
await browser.close();
