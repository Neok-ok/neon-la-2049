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
  ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'];

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
    streakDrawn: s.streakDrawn ?? null,
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
    inFlight: s.inFlight ?? null,
  };
}

async function arm(page) {
  await page.evaluate(() => {
    if (!window.__x6raf) {
      const state = { worst: 0, last: performance.now() };
      const loop = (t) => {
        state.worst = Math.max(state.worst, t - state.last);
        state.last = t;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      window.__x6raf = state;
    }
    window.__x6raf.worst = 0;
    window.__x6raf.last = performance.now();
    window.__nla.resetPeaks?.();
  });
}

async function shrink(page) {
  await page.evaluate(() => {
    const r = window.__nla.app.renderer;
    r.setPixelRatio(0.2);
    r.setSize(innerWidth, innerHeight, false);
  });
}

async function restore(page) {
  await page.evaluate(() => {
    const app = window.__nla.app;
    const r = app.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, app.quality.pixelRatio));
    r.setSize(innerWidth, innerHeight, false);
    window.__nla.resetPeaks?.();
    if (window.__x6raf) {
      window.__x6raf.worst = 0;
      window.__x6raf.last = performance.now();
    }
  });
}

/** Teleport already happened. Stream at a tiny backing store (SwiftShader fill-rate),
 * then restore the tier pixel ratio and sample a few full-size frames. */
async function settle(page, timeout = 90_000) {
  const hitch = await page.evaluate(() => window.__x6raf?.worst ?? 0);
  await shrink(page);
  const t0 = Date.now();
  let st = null;
  let uploadPeak = 0;
  let peakDraws = 0;
  let peakTris = 0;
  let hidden = null;
  let stable = 0;
  let settled = false;
  while (Date.now() - t0 < timeout) {
    const snap = await page.evaluate(() => {
      const s = window.__nla.stats();
      return { s, hidden: document.hidden };
    });
    st = snap.s;
    hidden = snap.hidden;
    uploadPeak = Math.max(uploadPeak, st.uploadPeak ?? 0);
    peakDraws = Math.max(peakDraws, st.drawCalls ?? 0);
    peakTris = Math.max(peakTris, st.triangles ?? 0);
    const dressed = st.lod0 >= 4 || (st.drawCalls > 40 && st.lod0 === 0);
    const idle = dressed && st.inFlight === 0 && st.readyQueue === 0 && st.fps > 0;
    if (idle) {
      stable++;
      if (stable >= 2) { settled = true; break; }
    } else stable = 0;
    await page.waitForTimeout(200);
  }
  await restore(page);
  await page.evaluate(() => { if (typeof window.gc === 'function') window.gc(); }).catch(() => {});
  const t1 = Date.now();
  let worst = hitch;
  while (Date.now() - t1 < 2500) {
    const snap = await page.evaluate(() => {
      const s = window.__nla.stats();
      return { s, rafWorst: window.__x6raf?.worst ?? 0 };
    });
    st = snap.s;
    worst = Math.max(worst, snap.rafWorst, st.sessionWorstMs ?? 0, st.worstMs ?? 0);
    peakDraws = Math.max(peakDraws, st.drawCalls ?? 0);
    peakTris = Math.max(peakTris, st.triangles ?? 0);
    await page.waitForTimeout(300);
  }
  return { st, worst, uploadPeak, peakDraws, peakTris, hidden, settled };
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
    await page.waitForFunction(() => {
      const st = window.__nla?.stats?.();
      return st && st.drawCalls > 10 && st.fps > 0;
    }, null, { timeout: 180_000 }).catch(() => {});
    const litMs = Date.now() - t0;
    await page.waitForFunction(() => {
      const st = window.__nla?.stats?.();
      return st && st.interactiveMs > 0;
    }, null, { timeout: 20_000 }).catch(() => {});
    const bootStats = await page.evaluate(() => window.__nla.stats());
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
  const want = new Set((process.env.TIERS ?? 'low,medium,high,ultra,iphone').split(',').map((s) => s.trim()).filter(Boolean));
  const jobs = [
    ...['low', 'medium', 'high', 'ultra'].map((tier) => ({ tier, ctx: desktop, label: tier })),
    { tier: 'medium', ctx: iphone, label: 'iphone-390x844-dpr3-medium' },
  ].filter((j) => want.has(j.label) || want.has(j.tier) && j.label === j.tier || (want.has('iphone') && j.label.startsWith('iphone')));
  for (const job of jobs) {
    const ctx = await browser.newContext(job.ctx);
    const page = await ctx.newPage();
    const booted = await boot(page, `${BASE}?mode=fly&quality=${job.tier}&freeze=1&ui=0&hud=1&time=22.5&weather=rain${webgl}`);
    for (const [name, after] of spots) {
      await arm(page);
      await page.evaluate(after);
      const sampled = await settle(page, 90_000);
      const st = sampled.st;
      const row = {
        spot: name,
        job: job.label,
        errors: booted.errors.slice(0, 4),
        settled: sampled.settled,
        hidden: sampled.hidden,
        peakDraws: sampled.peakDraws,
        peakTris: Math.round(sampled.peakTris),
        ...pick(st),
        worstMs: Math.round(sampled.worst),
        uploadPeak: sampled.uploadPeak,
      };
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
  await arm(page);
  const opened = await settle(page, 180_000);
  await page.evaluate(() => { if (typeof window.gc === 'function') window.gc(); }).catch(() => {});
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
    await arm(page);
    await page.evaluate(({ x, z }) => window.__nla.setPose(x, 180, z, 40, -18), p);
    await page.waitForTimeout(400);
    await page.evaluate(({ x, z }) => window.__nla.setPose(x, 42, z, 20, -6), p);
    const sampled = await settle(page, 90_000);
    const st = sampled.st;
    const row = {
      id: p.id,
      stage: p.stage,
      settled: sampled.settled,
      hidden: sampled.hidden,
      peakDraws: sampled.peakDraws,
      peakTris: Math.round(sampled.peakTris),
      ...pick(st),
      worstMs: Math.round(sampled.worst),
      uploadPeak: sampled.uploadPeak,
    };
    samples.push(row);
    uploadPeak = Math.max(uploadPeak, sampled.uploadPeak, st?.uploadPeak ?? 0);
    worst = Math.max(worst, sampled.worst);
    console.log('FLY', JSON.stringify(row));
  }
  await page.evaluate(() => { if (typeof window.gc === 'function') window.gc(); }).catch(() => {});
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
