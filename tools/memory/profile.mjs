// Headless memory route for Neon LA 2049.
// Simulates an Android phone in Chromium (mobile viewport, Android UA, deviceMemory=4,
// CPU throttle) and records JS heap, three.js GPU counters, and a scene-graph estimate
// along a scripted route: opening, a walk, a spinner flight, an interior, photo mode.
//
//   node tools/memory/profile.mjs
// Env:
//   BASE_URL   default http://127.0.0.1:4173/
//   OUT        default tools/memory/out/before
//   TIERS      comma list, default low,medium,high,ultra
//   ROUTE_SEC  default 600
//   SAMPLE_SEC default 5
//   CHROME     executable, default /opt/google/chrome/chrome
//   SHOTS      1 to save phase frames (default 1)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? 'tools/memory/out/before';
const TIERS = (process.env.TIERS ?? 'low,medium,high,ultra').split(',').map((s) => s.trim()).filter(Boolean);
const ROUTE_SEC = Number(process.env.ROUTE_SEC ?? 600);
const SAMPLE_SEC = Number(process.env.SAMPLE_SEC ?? 5);
const CHROME = process.env.CHROME ?? '/opt/google/chrome/chrome';
const SHOTS = process.env.SHOTS !== '0';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

/** Wall-clock shares of the 10-minute route. Flight is the long cross-district leg. */
const PHASES = [
  { name: 'opening', share: 0.15 },
  { name: 'walk', share: 0.15 },
  { name: 'flight', share: 0.35 },
  { name: 'interior', share: 0.15 },
  { name: 'photo', share: 0.20 },
];

mkdirSync(OUT, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function samplePage(page) {
  return page.evaluate(() => {
    const nla = window.__nla;
    if (!nla?.app) return { ready: false };
    const app = nla.app;
    const renderer = app.renderer;
    const info = renderer.info;
    const mem = performance.memory;
    const geos = new Set();
    const textures = new Set();
    const materials = new Map();
    const dup = new Map();
    const byName = new Map();
    let meshCount = 0;
    let instanced = 0;
    let geoBytes = 0;
    let texBytes = 0;
    let disposedStillHeld = 0;

    const geoBytesOf = (g) => {
      let n = 0;
      const attrs = g.attributes ?? {};
      for (const k in attrs) {
        const a = attrs[k];
        if (a?.array?.byteLength) n += a.array.byteLength;
      }
      if (g.index?.array?.byteLength) n += g.index.array.byteLength;
      if (g.morphAttributes) {
        for (const k in g.morphAttributes) {
          const list = g.morphAttributes[k] ?? [];
          for (const a of list) if (a?.array?.byteLength) n += a.array.byteLength;
        }
      }
      return n;
    };

    const texBytesOf = (t) => {
      let n = 0;
      const add = (img) => {
        if (!img) return;
        if (img.data?.byteLength) n += img.data.byteLength;
        else if (typeof img.width === 'number' && typeof img.height === 'number' && img.width > 0) {
          n += img.width * img.height * 4;
        }
      };
      add(t.image);
      if (Array.isArray(t.mipmaps)) for (const m of t.mipmaps) add(m);
      return n;
    };

    const fp = (g) => {
      const pos = g.attributes?.position;
      const a = pos?.array;
      const head = a ? [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[Math.min(9, a.length - 1)] ?? 0].map((v) => Math.round(v)).join(',') : '';
      return `${g.type}:${pos?.count ?? 0}:${pos?.array?.byteLength ?? 0}:${g.index?.count ?? 0}:${head}`;
    };

    const noteMat = (m) => {
      if (!m) return;
      const key = `${m.type}:${m.uuid}`;
      materials.set(key, (materials.get(key) ?? 0) + 1);
      const texSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'envMap', 'lightMap', 'alphaMap'];
      for (const slot of texSlots) if (m[slot]?.isTexture) textures.add(m[slot]);
      // Node materials keep textures on userData or uniforms; walk own props one level.
      for (const k in m) {
        const v = m[k];
        if (v?.isTexture) textures.add(v);
      }
    };

    app.scene.traverse((o) => {
      meshCount++;
      if (o.isInstancedMesh) instanced++;
      if (o.geometry) {
        const g = o.geometry;
        if (!geos.has(g)) {
          geos.add(g);
          const bytes = geoBytesOf(g);
          geoBytes += bytes;
          const key = fp(g);
          const hit = dup.get(key) ?? { count: 0, bytes, name: o.name || g.name || g.type };
          hit.count++;
          if (bytes > hit.bytes) hit.bytes = bytes;
          dup.set(key, hit);
          const label = (o.name || g.type || 'mesh').replace(/@L\d+$/, '').replace(/\d+$/, '') || 'mesh';
          const bucket = byName.get(label) ?? { name: label, bytes: 0, count: 0 };
          bucket.bytes += bytes;
          bucket.count++;
          byName.set(label, bucket);
        }
        if (g.userData?.disposed) disposedStillHeld++;
      }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) noteMat(m);
    });

    for (const t of textures) texBytes += texBytesOf(t);

    const duplicates = [...dup.values()].filter((d) => d.count > 1 && d.bytes > 2048)
      .sort((a, b) => b.count * b.bytes - a.count * a.bytes)
      .slice(0, 12);
    const topGeometries = [...byName.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 15);

    const matByType = new Map();
    for (const key of materials.keys()) {
      const type = key.split(':')[0];
      matByType.set(type, (matByType.get(type) ?? 0) + 1);
    }

    const w = app.canvas.width;
    const h = app.canvas.height;
    const bloom = app.quality?.bloom ? 2.4 : 1;
    const samples = app.quality?.antialias ? 4 : 1;
    const rtBytes = Math.round(w * h * (4 * samples * bloom + 4));

    const s = app.streamer?.stats ?? {};
    const managed = nla.memory?.() ?? null;
    return {
      ready: true,
      t: performance.now(),
      jsHeap: mem?.usedJSHeapSize ?? 0,
      jsTotal: mem?.totalJSHeapSize ?? 0,
      jsLimit: mem?.jsHeapSizeLimit ?? 0,
      geoBytes,
      texBytes,
      rtBytes,
      geometries: geos.size,
      textures: textures.size,
      materials: materials.size,
      materialTypes: Object.fromEntries(matByType),
      meshes: meshCount,
      instanced,
      duplicates,
      topGeometries,
      disposedStillHeld,
      renderer: {
        geometries: info.memory?.geometries ?? 0,
        textures: info.memory?.textures ?? 0,
        texturesSize: info.memory?.texturesSize ?? 0,
        attributesSize: info.memory?.attributesSize ?? 0,
        indexSize: info.memory?.indexAttributesSize ?? 0,
        renderTargets: info.memory?.renderTargets ?? 0,
        programs: info.memory?.programs ?? 0,
        programsSize: info.memory?.programsSize ?? 0,
        total: info.memory?.total ?? 0,
        drawCalls: info.render?.drawCalls ?? info.render?.calls ?? 0,
        triangles: info.render?.triangles ?? 0,
      },
      stream: {
        far: s.supersFar ?? 0,
        near: s.chunksNear ?? 0,
        lod0: s.lod0 ?? 0,
        inFlight: s.inFlight ?? 0,
        queue: s.readyQueue ?? 0,
      },
      canvas: { w, h, pr: renderer.getPixelRatio?.() ?? 1 },
      tier: app.quality?.tier ?? '',
      mode: app.cams?.mode ?? '',
      pos: { x: app.camera.position.x, y: app.camera.position.y, z: app.camera.position.z },
      managed,
    };
  });
}

async function drive(page, phase, flightStep) {
  await page.evaluate(async ({ phase, flightStep }) => {
    const nla = window.__nla;
    if (!nla) return;
    if (phase === 'opening') {
      nla.setMode('fly');
      nla.holdShot?.(true);
      const p = nla.app.camera.position;
      nla.setPose(p.x, Math.max(420, p.y), p.z, 140, -12);
      return;
    }
    if (phase === 'walk') {
      nla.marketView?.('street');
      return;
    }
    if (phase === 'interior') {
      if (nla.photo?.active) nla.photo.exit();
      nla.interiorView?.('court');
      return;
    }
    if (phase === 'photo') {
      nla.megaView?.('skyline');
      await nla.photo.enter();
      return;
    }
    if (phase === 'flight') {
      if (nla.photo?.active) nla.photo.exit();
      const layout = nla.app.query.layout;
      const ids = [
        'megatower-1', 'wallace-pyramid', 'lapd-hq', 'k-megablock-tower',
        'lax-tower', 'harbor-crane', 'hollywood-sign', 'east-la-market',
        'long-beach-tower', 'south-bay-stack',
      ];
      const pts = [];
      for (const id of ids) {
        const l = layout.landmarkById?.(id) ?? layout.poiById?.(id);
        if (l) pts.push(l);
      }
      if (!pts.length && layout.landmarks?.length) {
        const all = layout.landmarks;
        for (let i = 0; i < all.length; i += Math.ceil(all.length / 8)) pts.push(all[i]);
      }
      const p = pts[flightStep % Math.max(1, pts.length)];
      if (!p) return;
      const y = Math.max(280, Math.min(900, (p.height ?? 200) * 0.55 + 180));
      nla.setMode('fly');
      nla.setPose(p.x - 380, y, p.z + 380, 40, -18);
    }
  }, { phase, flightStep });
}

function slopeMbPerMin(series) {
  const rows = series.filter((s) => s.ready && s.jsHeap > 0);
  if (rows.length < 4) return 0;
  const t0 = rows[0].t;
  // Skip the first 45s of loading so the slope is residency, not boot.
  const used = rows.filter((s) => s.t - t0 > 45000);
  const pts = used.length >= 4 ? used : rows;
  const x0 = pts[0].t;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    const x = (p.t - x0) / 60000;
    const y = p.jsHeap / (1024 * 1024);
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-6) return 0;
  return (n * sxy - sx * sy) / den;
}

function summarize(tier, series, crashes) {
  const ready = series.filter((s) => s.ready);
  const heap = ready.map((s) => s.jsHeap);
  const gpu = ready.map((s) => (s.renderer?.total ?? 0) + (s.rtBytes ?? 0));
  const peak = (xs) => xs.reduce((m, v) => Math.max(m, v), 0);
  const steady = ready.slice(Math.floor(ready.length * 0.7));
  const avg = (xs, f) => xs.length ? xs.reduce((s, r) => s + f(r), 0) / xs.length : 0;
  const dupScore = new Map();
  for (const row of ready) {
    for (const d of row.duplicates ?? []) {
      const prev = dupScore.get(d.name) ?? { name: d.name, count: 0, bytes: d.bytes };
      prev.count = Math.max(prev.count, d.count);
      prev.bytes = Math.max(prev.bytes, d.bytes);
      dupScore.set(d.name, prev);
    }
  }
  return {
    tier,
    samples: ready.length,
    crashes,
    jsHeapPeak: peak(heap),
    jsHeapSteady: avg(steady, (r) => r.jsHeap),
    jsLimit: ready.at(-1)?.jsLimit ?? 0,
    gpuCounterPeak: peak(ready.map((s) => s.renderer?.total ?? 0)),
    gpuCounterSteady: avg(steady, (r) => r.renderer?.total ?? 0),
    gpuTexturesPeak: peak(ready.map((s) => s.renderer?.texturesSize ?? 0)),
    gpuAttributesPeak: peak(ready.map((s) => s.renderer?.attributesSize ?? 0)),
    programsSizePeak: peak(ready.map((s) => s.renderer?.programsSize ?? 0)),
    geoPeak: peak(ready.map((s) => s.geoBytes)),
    texPeak: peak(ready.map((s) => s.texBytes)),
    rtPeak: peak(ready.map((s) => s.rtBytes)),
    estimatedPeak: peak(ready.map((s) => s.jsHeap + s.geoBytes + s.texBytes + s.rtBytes)),
    slopeMbPerMin: slopeMbPerMin(ready),
    geometriesPeak: peak(ready.map((s) => s.geometries)),
    texturesPeak: peak(ready.map((s) => s.textures)),
    materialsPeak: peak(ready.map((s) => s.materials)),
    programsPeak: peak(ready.map((s) => s.renderer?.programs ?? 0)),
    chunks: ready.at(-1)?.stream ?? {},
    duplicateNote: 'A duplicate fingerprint matches position data only. Instanced meshes that share a plane (traffic streaks) group together even when their instance buffers differ. Rank consumers by topGeometries, which sums bytes per mesh name.',
    duplicates: [...dupScore.values()].sort((a, b) => b.count * b.bytes - a.count * a.bytes).slice(0, 8),
    topGeometries: (ready.reduce((best, row) => (row.geoBytes > (best?.geoBytes ?? 0) ? row : best), null)?.topGeometries ?? []).slice(0, 12),
    last: ready.at(-1) ?? null,
    gpuSeriesNote: 'renderer.info.memory.total is three.js GPU buffer accounting; rtBytes is a canvas estimate (color × samples × bloom + depth).',
  };
}

async function runTier(browser, tier) {
  const dir = join(OUT, tier);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  });
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 4, configurable: true });
    } catch { /* some builds lock it */ }
  });
  const page = await context.newPage();
  const crashes = [];
  page.on('crash', () => crashes.push('page-crash'));
  page.on('console', (msg) => {
    const t = msg.text();
    if (/out of memory|OOM|Aw, Snap|WebGL context lost/i.test(t)) crashes.push(t.slice(0, 240));
  });
  const client = await context.newCDPSession(page);
  try {
    await client.send('Performance.enable');
    await client.send('HeapProfiler.enable');
  } catch (err) {
    crashes.push(`cdp-setup:${err instanceof Error ? err.message : String(err)}`);
  }

  const q = `webgl=1&ui=0&hud=0&freeze=1&quality=${tier}&mem=1&mode=fly&time=22&weather=rain`;
  const url = new URL(BASE);
  url.search = q;
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const born = Date.now();
  let ready = false;
  while (Date.now() - born < 90000) {
    ready = await page.evaluate(() => !!window.__nla?.isIdle || !!window.__nla?.app).catch(() => false);
    const has = await page.evaluate(() => !!window.__nla?.app).catch(() => false);
    if (has) { ready = true; break; }
    await sleep(500);
  }
  if (!ready) {
    const fail = { tier, error: 'app did not boot', crashes };
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(fail, null, 2));
    await context.close();
    return fail;
  }
  // Let the first street settle before the clock starts.
  await sleep(4000);

  const series = [];
  const started = Date.now();
  let phaseIndex = 0;
  let phaseUntil = started;
  let flightStep = 0;
  let nextFlight = started;
  const marks = PHASES.map((p) => ({ ...p, shot: false }));
  let elapsedTarget = 0;
  for (const p of marks) {
    p.start = elapsedTarget;
    elapsedTarget += p.share * ROUTE_SEC * 1000;
    p.end = elapsedTarget;
  }

  while (Date.now() - started < ROUTE_SEC * 1000) {
    if (crashes.some((c) => c === 'page-crash')) break;
    const elapsed = Date.now() - started;
    while (phaseIndex < marks.length - 1 && elapsed >= marks[phaseIndex].end) phaseIndex++;
    const phase = marks[phaseIndex];
    if (phase.name === 'flight') {
      if (Date.now() >= nextFlight) {
        await drive(page, 'flight', flightStep).catch((e) => crashes.push(String(e)));
        flightStep++;
        nextFlight = Date.now() + 15000;
      }
    } else if (!phase.entered) {
      phase.entered = true;
      await drive(page, phase.name, 0).catch((e) => crashes.push(String(e)));
    }
    const row = await samplePage(page).catch((e) => ({ ready: false, error: String(e) }));
    row.phase = phase.name;
    row.wallMs = elapsed;
    series.push(row);
    if (series.length === 1 || series.length % 12 === 0) {
      const mbNow = ((row.jsHeap ?? 0) / (1024 * 1024)).toFixed(0);
      process.stdout.write(`  ${tier} ${phase.name} t=${Math.round(elapsed / 1000)}s heap=${mbNow}MB\n`);
    }
    if (SHOTS && !phase.shot && phase.entered && elapsed > phase.start + 8000 && row.ready) {
      phase.shot = true;
      await page.evaluate(() => {
        const el = document.querySelector('.mem-overlay');
        if (el) el.style.display = 'none';
      }).catch(() => {});
      await page.screenshot({ path: join(dir, `${phase.name}.png`) }).catch(() => {});
    }
    await sleep(SAMPLE_SEC * 1000);
  }

  try {
    await client.send('HeapProfiler.collectGarbage');
  } catch { /* optional */ }
  let metrics = null;
  try {
    metrics = await client.send('Performance.getMetrics');
  } catch { /* optional */ }
  const end = await samplePage(page).catch(() => ({ ready: false }));
  end.phase = 'end';
  end.wallMs = Date.now() - started;
  series.push(end);

  const summary = summarize(tier, series, crashes);
  summary.cdpMetrics = metrics?.metrics ?? null;
  summary.routeSec = ROUTE_SEC;
  writeFileSync(join(dir, 'series.json'), JSON.stringify(series));
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  await context.close();
  return summary;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--enable-precise-memory-info',
    '--use-angle=swiftshader',
    '--disable-dev-shm-usage',
    '--disable-gpu-sandbox',
    '--js-flags=--max-old-space-size=768',
    '--ignore-gpu-blocklist',
  ],
});

const summaries = [];
for (const tier of TIERS) {
  process.stdout.write(`\n=== tier ${tier} ===\n`);
  try {
    const summary = await runTier(browser, tier);
    summaries.push(summary);
    const mb = (n) => (n / (1024 * 1024)).toFixed(1);
    process.stdout.write(
      `${tier} heap peak ${mb(summary.jsHeapPeak ?? 0)} MB steady ${mb(summary.jsHeapSteady ?? 0)} MB slope ${summary.slopeMbPerMin?.toFixed?.(2) ?? '?'} MB/min crashes ${summary.crashes?.length ?? 0}\n`,
    );
  } catch (err) {
    const fail = { tier, error: err instanceof Error ? err.stack ?? err.message : String(err) };
    summaries.push(fail);
    process.stdout.write(String(fail.error) + '\n');
  }
}
writeFileSync(join(OUT, 'summaries.json'), JSON.stringify(summaries, null, 2));
await browser.close();
process.stdout.write('done\n');
