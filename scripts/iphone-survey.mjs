// Re-runnable Stage X6 survey. SwiftShader WebGL2 unless GPU=1.
//   npm run preview   (or BASE_URL=http://localhost:5173/)
//   node scripts/iphone-survey.mjs
// Env: BASE_URL, OUT, CHROME, GPU=1, PART=load|spots|flyover|guard (default all)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'screenshots-tmp/x6';
const GPU = process.env.GPU === '1';
const PART = new Set((process.env.PART ?? 'load,spots,flyover').split(',').map((s) => s.trim()).filter(Boolean));
mkdirSync(OUT, { recursive: true });

const webgl = GPU ? '' : '&webgl=1';
const args = GPU
  ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const iphone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};
const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };

function pick(s) {
  if (!s) return null;
  return {
    draws: s.drawCalls,
    tris: s.triangles,
    fps: s.fps,
    frameMs: s.frameMs,
    worstMs: s.worstMs,
    sessionWorstMs: s.sessionWorstMs ?? null,
    streaks: s.streaks,
    streakBins: s.streakBins ?? null,
    streakBinsDrawn: s.streakBinsDrawn ?? null,
    canvas: s.canvasPixels ?? null,
    canvasSize: s.canvasWidth ? `${s.canvasWidth}x${s.canvasHeight}` : null,
    dpr: s.pixelRatio ?? null,
    gpuGeomMB: s.gpuGeomBytes != null ? Math.round(s.gpuGeomBytes / 1e6 * 10) / 10 : null,
    jsHeapMB: s.jsHeap != null ? Math.round(s.jsHeap / 1e6 * 10) / 10 : null,
    uploads: s.uploads ?? null,
    uploadPeak: s.uploadPeak ?? null,
    uploadMs: s.uploadMs ?? null,
    tier: s.tier,
    backend: s.backend,
    querySyncs: s.querySyncs,
    queryUnpacks: s.queryUnpacks ?? null,
    district: s.district ?? null,
    lod0: s.lod0,
    readyQueue: s.readyQueue,
  };
}

async function waitDressed(page, timeout = 120_000) {
  await page.waitForFunction(() => {
    const st = window.__nla?.stats?.();
    if (!st) return false;
    const dressed = st.lod0 >= 4 || (st.drawCalls > 40 && st.lod0 === 0);
    return dressed && st.inFlight === 0 && st.readyQueue === 0 && st.fps > 0;
  }, null, { timeout, polling: 500 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function boot(page, url) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__nla?.stats, null, { timeout: 120_000 });
  const first = Date.now() - t0;
  return { errors, firstMs: first };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args, headless: true });
const report = { base: BASE, gpu: GPU, swiftshader: !GPU, parts: {} };

if (PART.has('load')) {
  const loads = [];
  for (const throttle of [false, true]) {
    const ctx = await browser.newContext({ ...iphone });
    const page = await ctx.newPage();
    if (throttle) {
      const client = await ctx.newCDPSession(page);
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
    }
    const t0 = Date.now();
    await page.goto(`${BASE}?mode=fly&quality=medium&freeze=1&ui=0&hud=1${webgl}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__nla?.stats, null, { timeout: 180_000 });
    const statsAtApi = Date.now() - t0;
    const bootStats = await page.evaluate(() => window.__nla.stats());
    await page.waitForFunction(() => {
      const st = window.__nla?.stats?.();
      return st && st.drawCalls > 10 && st.fps > 0;
    }, null, { timeout: 180_000 }).catch(() => {});
    const litMs = Date.now() - t0;
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({
      name: r.name.split('/').slice(-1)[0],
      transfer: r.transferSize,
      encoded: r.encodedBodySize,
      decoded: r.decodedBodySize,
      dur: Math.round(r.duration),
    })));
    const transfer = resources.reduce((a, r) => a + (r.transfer || r.encoded || 0), 0);
    loads.push({
      throttle: throttle ? 'slow-lte-1.6Mbps-150ms' : 'uncapped',
      apiMs: statsAtApi,
      litMs,
      initMs: bootStats.initMs ?? null,
      firstFrameMs: bootStats.firstFrameMs ?? null,
      interactiveMs: bootStats.interactiveMs ?? null,
      transferBytes: transfer,
      resources,
    });
    await ctx.close();
  }
  report.parts.load = loads;
  console.log('LOAD', JSON.stringify(loads, null, 2));
}

if (PART.has('spots')) {
  const spots = [
    ['dtla', () => window.__nla.dtlaView('street')],
    ['little-tokyo', () => window.__nla.marketView('street')],
    ['hollywood', () => window.__nla.hollywoodView('street')],
    ['lax', () => window.__nla.laxView('gantry')],
    ['long-beach', () => window.__nla.longBeachView('canyon')],
    ['east-la-interchange', () => window.__nla.eastLaView('interchange')],
    ['east-la-market', () => window.__nla.eastLaView('market')],
  ];
  const rows = [];
  const jobs = [
    ...['low', 'medium', 'high', 'ultra'].map((tier) => ({ tier, ctx: desktop, label: tier })),
    { tier: 'medium', ctx: iphone, label: 'iphone-390x844-dpr3-medium' },
  ];
  for (const job of jobs) {
    const ctx = await browser.newContext(job.ctx);
    const page = await ctx.newPage();
    const booted = await boot(page, `${BASE}?mode=fly&quality=${job.tier}&freeze=1&ui=0&hud=1&time=22.5&weather=rain${webgl}`);
    for (const [name, after] of spots) {
      await page.evaluate(after);
      await waitDressed(page);
      await page.evaluate(after);
      await page.waitForTimeout(800);
      if (page.evaluate) await page.evaluate(() => window.__nla.resetPeaks?.());
      await page.waitForTimeout(1200);
      const st = await page.evaluate(() => window.__nla.stats());
      const row = { spot: name, job: job.label, errors: booted.errors.slice(0, 4), ...pick(st) };
      rows.push(row);
      console.log('SPOT', JSON.stringify(row));
    }
    await ctx.close();
  }
  report.parts.spots = rows;
}

if (PART.has('flyover')) {
  const ctx = await browser.newContext(iphone);
  const page = await ctx.newPage();
  const booted = await boot(page, `${BASE}?mode=fly&quality=medium&freeze=1&ui=0&hud=1&time=22&weather=drizzle${webgl}`);
  await waitDressed(page, 180_000);
  const start = await page.evaluate(() => window.__nla.stats());
  const places = await page.evaluate(() => {
    const layout = window.__nla.app.query.layout;
    const list = layout.districts.map((d) => {
      const [x0, z0, x1, z1] = d.bbox;
      return { id: d.id, name: d.name, stage: d.stage, x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    });
    const basin = layout.poiById?.('basin-strip') ?? layout.defaultDistrict;
    if (basin && basin.x !== undefined) list.unshift({ id: 'basin-sprawl', name: 'Basin Sprawl', stage: 14, x: basin.x, z: basin.z });
    return list;
  });
  const samples = [];
  let uploadPeak = 0;
  let worst = 0;
  for (const p of places) {
    await page.evaluate(() => window.__nla.resetPeaks?.());
    await page.evaluate(({ x, z }) => window.__nla.setPose(x, 180, z, 40, -18), p);
    await page.waitForTimeout(700);
    await page.evaluate(({ x, z }) => window.__nla.setPose(x, 42, z, 20, -6), p);
    await waitDressed(page, 90_000);
    const st = await page.evaluate(() => window.__nla.stats());
    const row = { id: p.id, stage: p.stage, ...pick(st) };
    samples.push(row);
    uploadPeak = Math.max(uploadPeak, st.uploadPeak ?? 0, st.readyQueue ?? 0);
    worst = Math.max(worst, st.sessionWorstMs ?? st.worstMs ?? 0);
    console.log('FLY', JSON.stringify(row));
  }
  const end = await page.evaluate(() => window.__nla.stats());
  report.parts.flyover = {
    errors: booted.errors.slice(0, 6),
    districts: places.length,
    start: pick(start),
    end: pick(end),
    uploadPeak,
    worst,
    samples,
  };
  await ctx.close();
}

writeFileSync(join(OUT, 'survey.json'), JSON.stringify(report, null, 2));
console.log('WROTE', join(OUT, 'survey.json'));
await browser.close();
