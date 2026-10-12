// Headless visual regression.
//   npm run build
//   npm run visual                 compare against tests/visual/baselines
//   npm run visual:update          write those baselines (the only update path besides the CI label)
//
// Env:
//   BASE_URL     use a server that is already up (otherwise `vite preview` of dist/)
//   ONLY         comma-separated shot ids
//   VIEWS        desktop,phone (default both)
//   QUALITIES    medium,ultra (default both)
//   MAX_DIFF     mismatch ratio, default 0.02
//   GPU=1        real GPU instead of SwiftShader. Refuses --update (baselines are SwiftShader).
//   REPEAT=2     capture each image twice and fail if the two frames disagree
import { spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { comparePng } from './compare.mjs';
import {
  EXPECT_SIM_TIME,
  MAX_DIFF_RATIO,
  PIXEL_THRESHOLD,
  QUALITIES,
  SEED,
  VIEWS,
  assertCatalog,
  fileName,
  queryFor,
  shots,
} from './shots.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINES = join(ROOT, 'tests/visual/baselines');
const OUT = join(ROOT, 'tests/visual/output');
const ACTUAL = join(OUT, 'actual');
const DIFF = join(OUT, 'diff');

const update = process.argv.includes('--update');
const gpu = process.env.GPU === '1';
const repeat = Math.max(1, Number(process.env.REPEAT ?? 1) || 1);
const maxRatio = Number(process.env.MAX_DIFF ?? MAX_DIFF_RATIO);
const only = new Set((process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const viewNames = (process.env.VIEWS ?? 'desktop,phone').split(',').map((s) => s.trim()).filter(Boolean);
const qualities = (process.env.QUALITIES ?? QUALITIES.join(',')).split(',').map((s) => s.trim()).filter(Boolean);

function pick(list, allowed, label) {
  const bad = list.filter((name) => !allowed.includes(name));
  if (bad.length) throw new Error(`unknown ${label}: ${bad.join(', ')}`);
  return list;
}

/**
 * Headless Chrome stops delivering requestAnimationFrame once the page is occluded,
 * which freezes chunk upload. A timer keeps the loop alive. ?seed= holds the sim
 * clock, so the extra frames do not move rain, traffic or the ocean.
 *
 * Page.captureScreenshot never returns on this SwiftShader headless build. The
 * grab flag reads the canvas in the same turn as the frame that drew it.
 */
async function keepFrames(context) {
  await context.addInitScript(() => {
    window.__visualFrames = true;
    window.__visualDraw = false;
    window.__rafIdle = true;
    window.__grabFrame = false;
    window.__warmLeft = 0;
    window.__lastPng = '';
    window.__grabErr = '';
    window.__held = null;
    // Rasterize one pixel while chunks upload. setSize wedges SwiftShader;
    // the viewport leaves the drawing buffer alone.
    const armDraw = () => {
      const renderer = window.__nla?.app?.renderer;
      if (!renderer) return;
      if (window.__visualDraw) renderer.setViewport(0, 0, innerWidth, innerHeight);
      else renderer.setViewport(0, 0, 1, 1);
    };
    const run = (cb) => {
      window.__held = null;
      window.__rafIdle = false;
      try {
        armDraw();
        const shot = window.__visualDraw && window.__warmLeft === 0 && window.__grabFrame;
        const tDraw = performance.now();
        cb(performance.now());
        if (shot) window.__shotFrame = performance.now() - tDraw;
        if (window.__visualDraw && window.__warmLeft > 0) window.__warmLeft--;
        else if (window.__grabFrame) {
          const canvas = window.__nla?.app?.canvas ?? document.querySelector('canvas');
          const gl = canvas?.getContext?.('webgl2');
          if (gl && gl.drawingBufferWidth > 0) {
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
          }
          window.__lastPng = canvas ? canvas.toDataURL('image/png') : '';
          window.__grabFrame = false;
          window.__visualFrames = false;
          window.__visualDraw = false;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        window.__grabErr = message;
        console.error(`visual frame: ${message}`);
        if (window.__grabFrame) {
          window.__grabFrame = false;
          window.__visualFrames = false;
          window.__visualDraw = false;
        }
      } finally {
        window.__rafIdle = true;
      }
    };
    window.requestAnimationFrame = (cb) => window.setTimeout(() => {
      if (!window.__visualFrames) {
        window.__rafIdle = true;
        window.__held = cb;
        return;
      }
      run(cb);
    }, 16);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    window.setInterval(() => {
      const held = window.__held;
      if (!held || !window.__visualFrames) return;
      run(held);
    }, 32);
    const hide = { configurable: true, get: () => false };
    const show = { configurable: true, get: () => 'visible' };
    try { Object.defineProperty(Document.prototype, 'hidden', hide); } catch { /* native getter stays */ }
    try { Object.defineProperty(Document.prototype, 'visibilityState', show); } catch { /* native getter stays */ }
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  let last = 'not up';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await sleep(300);
  }
  throw new Error(`preview did not start (${last})`);
}

function startPreview() {
  const port = 4173;
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout?.on('data', (b) => { log += b; });
  child.stderr?.on('data', (b) => { log += b; });
  child.on('exit', (code) => {
    if (code && code !== 0 && !child.killed) console.error(log.slice(-2000));
  });
  return {
    url,
    async stop() {
      if (!child.killed) child.kill('SIGTERM');
    },
  };
}

async function settle(page) {
  await page.evaluate(() => {
    window.__visualFrames = true;
    window.__visualDraw = false;
  });
  await page.waitForFunction(() => {
    if (window.__nlaFrameError) return true;
    if (!window.__nla?.stats) return false;
    const want = new URLSearchParams(location.search).get('frame');
    if (!want) return true;
    return window.__nlaFrame === want;
  }, null, { timeout: 240_000, polling: 200 });
  const frameError = await page.evaluate(() => window.__nlaFrameError || '');
  if (frameError) throw new Error(frameError);
  await page.evaluate(() => {
    window.__idleN = 0;
    window.__camStill = 0;
    window.__cam = null;
  });
  const settleDeadline = Date.now() + 900_000;
  let ready = false;
  let polls = 0;
  while (Date.now() < settleDeadline) {
    const s = await page.evaluate(() => {
      const nla = window.__nla;
      const idle = !!(nla?.isIdle?.() && nla.stats().queryPending === 0);
      window.__idleN = idle ? (window.__idleN || 0) + 1 : 0;
      const c = nla?.app?.camera;
      if (!c) return { ready: false };
      const p = [c.position.x, c.position.y, c.position.z, c.rotation.x, c.rotation.y, c.rotation.z];
      const prev = window.__cam;
      window.__cam = p;
      let moved = 0;
      if (!prev) window.__camStill = 0;
      else {
        moved = Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
        for (let i = 3; i < 6; i++) moved += Math.abs(p[i] - prev[i]);
        window.__camStill = moved < 0.03 ? (window.__camStill || 0) + 1 : 0;
      }
      const st = nla.stats();
      return {
        ready: window.__idleN >= 3 && window.__camStill >= 6 && !!nla.app?.farApplied,
        idleN: window.__idleN,
        camStill: window.__camStill,
        moved: Math.round(moved * 1000) / 1000,
        lod0: st.lod0,
        queue: st.readyQueue,
        inflight: st.inFlight,
        pending: st.queryPending,
        draws: st.drawCalls,
        frame: Math.round(st.frameMs),
        frames: nla.app?.frames,
        far: !!nla.app?.farApplied,
        err: window.__grabErr || '',
      };
    });
    if (s.ready) {
      ready = true;
      trace(`settled lod0=${s.lod0} draws=${s.draws} frame=${s.frame}ms frames=${s.frames}`);
      break;
    }
    if (polls % 8 === 0) {
      trace(`wait idle=${s.idleN} cam=${s.camStill} far=${s.far ? 1 : 0} lod0=${s.lod0} q=${s.queue} fly=${s.inflight} pend=${s.pending} draws=${s.draws} frame=${s.frame}ms frames=${s.frames} ${s.err}`);
    }
    polls++;
    await sleep(400);
  }
  if (!ready) throw new Error('timed out waiting for the city to settle');
  await page.evaluate(() => document.getElementById('loading')?.remove());
}

async function readStats(page) {
  return page.evaluate(() => {
    const s = window.__nla?.stats?.() ?? null;
    const c = window.__nla?.app?.camera;
    if (s && window.__shotFrame) s.frameMs = window.__shotFrame;
    if (s && c) {
      s.cam = [c.position.x, c.position.y, c.position.z].map((n) => Math.round(n * 10) / 10);
    }
    return s;
  });
}

function assertShotStats(stats, quality) {
  if (!stats) return 'no stats';
  if (stats.tier !== quality) return `tier ${stats.tier}, expected ${quality}`;
  if (stats.seed !== SEED) return `seed ${stats.seed}, expected ${SEED}`;
  if (Math.abs(stats.simTime - EXPECT_SIM_TIME) > 0.001) return `simTime ${stats.simTime}, expected ${EXPECT_SIM_TIME}`;
  if (stats.backend !== 'WebGL2') return `backend ${stats.backend}, expected WebGL2`;
  if (!stats.drawCalls || stats.drawCalls < 10) return `drawCalls ${stats.drawCalls}`;
  return null;
}

function pct(ratio) {
  return `${(ratio * 100).toFixed(3)}%`;
}

function markdown(rows, started) {
  const failed = rows.filter((r) => !r.ok);
  const lines = [
    '<!-- visual-regression -->',
    '## Visual regression',
    '',
    `Night rain, seed ${SEED}, sim clock ${EXPECT_SIM_TIME}s, SwiftShader WebGL2. Tolerance ${pct(maxRatio)} of pixels (pixelmatch threshold ${PIXEL_THRESHOLD}, anti-aliasing ignored).`,
    '',
    failed.length
      ? `**${failed.length} of ${rows.length} images failed.**`
      : `**${rows.length} image${rows.length === 1 ? '' : 's'} matched.**`,
    '',
    '| Shot | View | Quality | Result | Mismatch | Frame ms | Draws | Triangles | LOD0 |',
    '|---|---|---|---|---:|---:|---:|---:|---:|',
  ];
  for (const r of rows) {
    const result = r.ok ? (r.updated ? 'updated' : 'pass') : r.reason;
    lines.push(`| ${r.id} | ${r.view} | ${r.quality} | ${result} | ${r.ratio == null ? '' : pct(r.ratio)} | ${r.frameMs ?? ''} | ${r.draws ?? ''} | ${r.tris ?? ''} | ${r.lod0 ?? ''} |`);
  }
  lines.push('', 'Measurements are reported only. There is no frame-time gate.', '');
  lines.push(`Captured in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
  if (failed.length) {
    lines.push('', 'Diff images are in the `visual-diff-report` artifact under `diff/`.');
  }
  return `${lines.join('\n')}\n`;
}

function writeDataUrl(dest, dataUrl) {
  const comma = String(dataUrl).indexOf(',');
  if (comma < 0) throw new Error('canvas readback was empty');
  writeFileSync(dest, Buffer.from(String(dataUrl).slice(comma + 1), 'base64'));
}

async function grabCanvas(page, dest) {
  trace('draw');
  await page.evaluate(() => {
    window.__lastPng = '';
    window.__grabErr = '';
    window.__visualFrames = true;
    window.__visualDraw = true;
    window.__warmLeft = 1;
    window.__grabFrame = true;
  });
  // Ultra desktop readback on SwiftShader can sit in toDataURL for well over eight minutes.
  await page.waitForFunction(() => !!(window.__lastPng || window.__grabErr), null, { timeout: 2_400_000, polling: 200 });
  const dataUrl = await page.evaluate(() => {
    if (window.__grabErr) throw new Error(window.__grabErr);
    return window.__lastPng;
  });
  writeDataUrl(dest, dataUrl);
}

async function captureOne(page, dest) {
  await settle(page);
  mkdirSync(dirname(dest), { recursive: true });
  await grabCanvas(page, dest);
  return readStats(page);
}

function trace(line) {
  appendFileSync(join(OUT, 'run.log'), `${line}\n`);
  console.log(line);
}

async function main() {
  assertCatalog();
  if (update && gpu) throw new Error('refusing --update with GPU=1; baselines are SwiftShader WebGL2');
  const views = pick(viewNames, Object.keys(VIEWS), 'view');
  const tiers = pick(qualities, QUALITIES, 'quality');
  const selected = shots.filter((s) => !only.size || only.has(s.id));
  if (!selected.length) throw new Error('no shots selected');

  mkdirSync(ACTUAL, { recursive: true });
  mkdirSync(DIFF, { recursive: true });
  mkdirSync(BASELINES, { recursive: true });

  let preview = null;
  const base = process.env.BASE_URL ?? null;
  let url = base;
  if (!url) {
    if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('dist/ is missing. Run npm run build first, or set BASE_URL.');
    preview = startPreview();
    url = preview.url;
    await waitForServer(url);
  }
  if (!url.endsWith('/')) url += '/';

  const args = [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    ...(gpu
      ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
  ];
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    headless: true,
    args,
  });

  const started = Date.now();
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];

  const shoot = async (page, shot, view, quality) => {
    const name = fileName(shot.id, view, quality);
    const actual = join(ACTUAL, name);
    const baseline = join(BASELINES, name);
    const diff = join(DIFF, name);
    const t0 = Date.now();
    try {
      trace(`start ${name}`);
      const stats = await captureOne(page, actual);
      const bad = assertShotStats(stats, quality);
      if (bad) throw new Error(bad);
      if (repeat > 1) {
        const again = join(ACTUAL, `repeat-${name}`);
        await captureOne(page, again);
        const self = comparePng(again, actual, join(DIFF, `repeat-${name}`), { threshold: PIXEL_THRESHOLD, maxRatio });
        if (!self.ok) throw new Error(`unstable capture (${pct(self.ratio)} between two frames)`);
      }
      let result;
      if (!existsSync(baseline)) {
        result = { ok: update, reason: update ? 'added' : 'missing baseline', ratio: null };
      } else {
        result = comparePng(actual, baseline, diff, { threshold: PIXEL_THRESHOLD, maxRatio });
      }
      if (update && result.reason !== 'match') {
        copyFileSync(actual, baseline);
        result = { ...result, ok: true, updated: true, reason: 'updated' };
      }
      const row = {
        id: shot.id,
        view,
        quality,
        place: shot.place,
        href: `?${queryFor(shot, quality)}`,
        ok: !!result.ok,
        reason: result.reason,
        updated: !!result.updated,
        ratio: result.ratio,
        mismatch: result.mismatch ?? null,
        frameMs: stats.frameMs != null ? Math.round(stats.frameMs * 10) / 10 : null,
        draws: stats.drawCalls ?? null,
        tris: stats.triangles != null ? Math.round(stats.triangles) : null,
        lod0: stats.lod0 ?? null,
        cam: stats.cam ?? null,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
      };
      rows.push(row);
      trace(`${name}: ${row.reason}${row.ratio == null ? '' : ` ${pct(row.ratio)}`} ${row.seconds}s  frame ${row.frameMs} ms  draws ${row.draws}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      rows.push({ id: shot.id, view, quality, place: shot.place, ok: false, reason: message, ratio: null });
      console.error(`${name}: ${message}`);
    }
  };

  try {
    for (const shot of selected) {
      for (const quality of tiers) {
        const share = shot.mode === 'walk' && views.length > 1;
        if (share) {
          const ctx = await browser.newContext({ viewport: VIEWS[views[0]], deviceScaleFactor: 1 });
          await keepFrames(ctx);
          const page = await ctx.newPage();
          page.setDefaultTimeout(180_000);
          const errors = [];
          page.on('pageerror', (err) => errors.push(String(err)));
          page.on('console', (msg) => {
            if (msg.type() === 'error' || msg.text().startsWith('visual ')) trace(`console ${msg.text()}`);
          });
          await page.goto(`${url}?${queryFor(shot, quality)}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
          for (const view of views) {
            await page.setViewportSize(VIEWS[view]);
            await shoot(page, shot, view, quality);
          }
          if (errors.length) console.warn(`${shot.id} ${quality}: ${errors.slice(0, 3).join(' | ')}`);
          await ctx.close();
        } else {
          for (const view of views) {
            const ctx = await browser.newContext({ viewport: VIEWS[view], deviceScaleFactor: 1 });
            await keepFrames(ctx);
            const page = await ctx.newPage();
            page.setDefaultTimeout(180_000);
            const errors = [];
            page.on('pageerror', (err) => errors.push(String(err)));
            page.on('console', (msg) => {
              if (msg.type() === 'error' || msg.text().startsWith('visual ')) trace(`console ${msg.text()}`);
            });
            await page.goto(`${url}?${queryFor(shot, quality)}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
            await shoot(page, shot, view, quality);
            if (errors.length) console.warn(`${shot.id} ${view} ${quality}: ${errors.slice(0, 3).join(' | ')}`);
            await ctx.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
    await preview?.stop();
  }

  const body = markdown(rows, started);
  writeFileSync(join(OUT, 'report.md'), body);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({
    seed: SEED,
    simTime: EXPECT_SIM_TIME,
    maxRatio,
    pixelThreshold: PIXEL_THRESHOLD,
    update,
    rows,
  }, null, 2));
  console.log(body);
  const failed = rows.filter((r) => !r.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
