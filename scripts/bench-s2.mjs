// Baseline / after load bench. SwiftShader WebGL2.
import { chromium } from 'playwright';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? '/tmp/s2-bench.json';

function distBytes() {
  const root = 'dist';
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else files.push({ path: p, bytes: st.size });
    }
  };
  try { walk(root); } catch { return { files: [], total: 0 }; }
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const js = files.filter((f) => f.path.endsWith('.js'));
  return {
    total,
    js: js.reduce((s, f) => s + f.bytes, 0),
    files: files.sort((a, b) => b.bytes - a.bytes).map((f) => ({ path: f.path, bytes: f.bytes })),
  };
}

const args = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage',
];

async function boot(page, url) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__nla && window.__nla.stats && window.__nla.stats().firstFrameMs > 0, null, { timeout: 120_000 });
  const first = await page.evaluate(() => window.__nla.stats());
  await page.waitForFunction(() => {
    const s = window.__nla.stats();
    return s.interactiveMs > 0 || (window.__nla.isIdle() && s.firstFrameMs > 0);
  }, null, { timeout: 180_000 });
  const idle = await page.evaluate(() => window.__nla.stats());
  return { wallMs: Date.now() - t0, first, idle };
}

async function sampleFrames(page, ms = 1500) {
  return page.evaluate(async (dur) => {
    window.__nla.resetPeaks();
    const frames = [];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        const s = window.__nla.stats();
        frames.push(s.frameMs);
        if (performance.now() - t0 >= dur) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const s = window.__nla.stats();
    const sorted = frames.filter((n) => n > 0).sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
    return {
      tier: s.tier,
      samples: sorted.length,
      medianMs: Math.round(mid * 10) / 10,
      worstMs: s.worstMs,
      sessionWorstMs: s.sessionWorstMs,
      draws: s.drawCalls,
      tris: s.triangles,
      canvas: `${s.canvasWidth}x${s.canvasHeight}`,
      pixels: s.canvasPixels,
      dpr: s.pixelRatio,
      backend: s.backend,
    };
  }, ms);
}

async function tiers(page) {
  const out = {};
  for (const tier of ['low', 'medium', 'high', 'ultra']) {
    await page.evaluate((t) => window.__nla.app.setQuality(t), tier);
    await page.waitForFunction(() => window.__nla.isIdle(), null, { timeout: 180_000 }).catch(() => {});
    await page.waitForTimeout(400);
    out[tier] = await sampleFrames(page, 1200);
  }
  return out;
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args });
const result = { base: BASE, bundle: distBytes(), desktop: null, phone: null, desktopRepeat: null };

const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const dpage = await desktop.newPage();
const q = 'mode=fly&ui=0&freeze=1&hud=1&quality=medium&webgl=1';
result.desktop = { boot: await boot(dpage, `${BASE}?${q}`), tiers: await tiers(dpage) };
result.desktopRepeat = { boot: await boot(dpage, `${BASE}?${q}`) };
await desktop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});
const ppage = await phone.newPage();
result.phone = { boot: await boot(ppage, `${BASE}?${q}`), tiers: await tiers(ppage) };
await phone.close();
await browser.close();

const slim = (boot) => boot && ({
  wallMs: boot.wallMs,
  initMs: Math.round(boot.idle.initMs),
  firstFrameMs: Math.round(boot.idle.firstFrameMs),
  interactiveMs: Math.round(boot.idle.interactiveMs),
  backend: boot.idle.backend,
  tier: boot.idle.tier,
});
result.summary = {
  bundleJs: result.bundle.js,
  bundleTotal: result.bundle.total,
  entry: result.bundle.files.filter((f) => f.path.includes('/index-') && f.path.endsWith('.js')).map((f) => f.bytes),
  desktop: { boot: slim(result.desktop.boot), repeat: slim(result.desktopRepeat.boot), tiers: result.desktop.tiers },
  phone: { boot: slim(result.phone.boot), tiers: result.phone.tiers },
};
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary, null, 2));
