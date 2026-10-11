// Before/after stills for refinement R1. SwiftShader WebGL2, medium tier.
//   BASE_URL=http://127.0.0.1:4173/ OUT=/opt/cursor/artifacts/r1/before node scripts/r1-capture.mjs
// SHOTS=skyline-clear,market-rain limits the set. PHONE=0 skips the portrait pass.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? 'screenshots-tmp/r1';
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

async function settle(page, full = false) {
  const t0 = Date.now();
  const limit = full ? 240_000 : 75_000;
  let last = null;
  let stable = 0;
  let lastLod = -1;
  while (Date.now() - t0 < limit) {
    last = await page.evaluate(() => {
      const s = window.__nla?.stats?.();
      if (!s) return null;
      return {
        idle: window.__nla.isIdle() && s.drawCalls > 8,
        draws: s.drawCalls,
        queue: s.readyQueue,
        flight: s.inFlight,
        lod0: s.lod0,
      };
    });
    if (last?.idle) {
      await page.waitForTimeout(350);
      return true;
    }
    if (!full && last && last.flight === 0 && last.lod0 >= 4 && last.lod0 === lastLod && last.draws > 8) {
      stable++;
      if (stable >= 4) return true;
    } else stable = 0;
    lastLod = last?.lod0 ?? -1;
    await page.waitForTimeout(450);
  }
  console.log('SETTLE TIMEOUT', full ? 'full' : 'look', JSON.stringify(last));
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
  await page.evaluate(() => {
    window.__r1wx = (id, hours) => {
      window.__nla.setTime(hours);
      window.__nla.setWeather(id, true);
      const w = window.__nla.app.atmosphere.weather;
      w.wetness = w.params.wetTarget;
      w.snowCover = id === 'snow' ? 0.75 : 0;
    };
  });
  await settle(page, false);
  return errors;
}

async function shot(page, name, full) {
  await settle(page, full);
  const frame = await page.evaluate(() => window.__nla.app.frames);
  await page.waitForFunction((n) => window.__nla.app.frames > n + 1, frame, { timeout: 40_000 });
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, type: 'png', timeout: 120_000 });
  const stats = await page.evaluate(() => {
    const s = window.__nla.stats();
    const c = window.__nla.app.camera;
    return {
      draws: s.drawCalls,
      tris: s.triangles,
      tier: s.tier,
      backend: s.backend,
      canvas: `${s.canvasWidth}x${s.canvasHeight}`,
      dpr: s.pixelRatio,
      lod0: s.lod0,
      crowd: s.crowd,
      queue: s.readyQueue,
      flight: s.inFlight,
      pose: { x: c.position.x, y: c.position.y, z: c.position.z },
      hours: window.__nla.app.atmosphere.dayNight.hours,
      weather: window.__nla.app.atmosphere.weather.current,
    };
  });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(stats, null, 2));
  console.log('SHOT', name, JSON.stringify(stats));
  return stats;
}

const ONLY = new Set((process.env.SHOTS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const want = (name) => ONLY.size === 0 || ONLY.has(name);
const PHONE = process.env.PHONE !== '0';

/** @type {{ name: string, phone?: boolean, full?: boolean, apply: string }[]} */
const SHOTS = [
  { name: 'opening-smog', apply: `() => { window.__r1wx('smog', 15.2); window.__nla.setMode('fly'); }` },
  { name: 'skyline-clear', apply: `() => { window.__r1wx('clear', 14); return window.__nla.megaView('skyline'); }` },
  { name: 'approach-dusk', apply: `() => { window.__r1wx('rain', 18); return window.__nla.megaView('approach'); }` },
  { name: 'market-rain', apply: `() => { window.__r1wx('rain', 22.5); return window.__nla.marketView('street'); }` },
  { name: 'broadway-bridge', apply: `() => { window.__r1wx('rain', 22.5); return window.__nla.broadwayView('bridge'); }` },
  { name: 'hollywood-street', apply: `() => { window.__r1wx('rain', 22.5); return window.__nla.hollywoodView('street'); }` },
  { name: 'hollywood-hills', apply: `() => { window.__r1wx('rain', 22.5); return window.__nla.hollywoodView('hills'); }` },
  { name: 'lakewood-street', apply: `() => { window.__r1wx('rain', 22.5); return window.__nla.lakewoodView('street'); }` },
  { name: 'southla-street', apply: `() => { window.__r1wx('rain', 22.5); return window.__nla.southLaView('street'); }` },
  { name: 'coast-apron', apply: `() => { window.__r1wx('rain', 22.5); return window.__nla.coastView('apron'); }` },
  { name: 'coast-snow', phone: false, apply: `() => { window.__r1wx('snow', 22.5); return window.__nla.coastView('apron'); }` },
  { name: 'arts-street', apply: `() => { window.__r1wx('clear', 14); return window.__nla.artsView('street'); }` },
  { name: 'k-market', apply: `() => { window.__r1wx('clear', 14); return window.__nla.kView('market'); }` },
  { name: 'dtla-clear', apply: `() => { window.__r1wx('clear', 14); return window.__nla.dtlaView('street'); }` },
  { name: 'arts-stacks', phone: false, full: true, apply: `() => { window.__r1wx('rain', 22.5); return window.__nla.artsView('stacks'); }` },
  { name: 'dtla-lanes-night', phone: false, full: true, apply: `() => { window.__r1wx('rain', 22.5); return window.__nla.dtlaView('lanes'); }` },
  { name: 'dtla-lanes-dusk', phone: false, full: true, apply: `() => { window.__r1wx('rain', 18); return window.__nla.dtlaView('lanes'); }` },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  args,
  headless: true,
});

const errors = [];
const rows = [];

async function runPass(label, contextOpts, query) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  errors.push(...(await boot(page, `${BASE}?mode=fly&quality=medium&freeze=1&ui=0&hud=0&time=22.5&weather=rain${query}${webgl}`)).map((e) => `${label}: ${e}`));
  for (const spec of SHOTS) {
    const name = `${label}-${spec.name}`;
    if (!want(spec.name) && !want(name)) continue;
    if (label === 'phone' && spec.phone === false) continue;
    const ok = await page.evaluate((src) => (0, eval)(`(${src})`)(), spec.apply);
    if (ok === false) console.log('APPLY FALSE', name);
    const stats = await shot(page, name, !!spec.full);
    rows.push({ name, ...stats });
  }
  await ctx.close();
}

await runPass('desk', desktop, '');
if (PHONE) await runPass('phone', iphone, '&touch=1');

writeFileSync(join(OUT, 'errors.json'), JSON.stringify(errors, null, 2));
writeFileSync(join(OUT, 'table.json'), JSON.stringify(rows, null, 2));
console.log('ERRORS', errors.length);
await browser.close();
