// Cold-load profile. Headless Chromium, SwiftShader, optional CPU throttle.
//   node scripts/profile-load.mjs
// Env: BASE_URL, QUALITY (default high), MODE (default fly), THROTTLE (default 4),
//      WEBGL=1, TIMEOUT_MS, BUDGET_MS (fail when a load task exceeds it)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const quality = process.env.QUALITY ?? 'high';
const mode = process.env.MODE ?? 'fly';
const throttle = Number(process.env.THROTTLE ?? 4);
const budgetMs = process.env.BUDGET_MS ? Number(process.env.BUDGET_MS) : 0;
const timeoutMs = Number(process.env.TIMEOUT_MS ?? 150000);
const webgl = process.env.WEBGL === '0' ? '' : '&webgl=1';
const outPath = process.env.OUT ?? '/tmp/load-profile.json';

function startPreview() {
  const port = 4173;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { child, url: `http://127.0.0.1:${port}/` };
}

async function waitForServer(url) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview did not start: ${url}`);
}

function summarizeProfile(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const node = byId.get(samples[i]);
    if (!node) continue;
    const us = deltas[i] ?? 0;
    const frame = node.callFrame ?? {};
    const url = (frame.url ?? '').split('/').slice(-2).join('/');
    const key = `${frame.functionName || '(anonymous)'} ${url}:${frame.lineNumber ?? 0}`;
    const row = self.get(key) ?? { key, us: 0, hits: 0 };
    row.us += us;
    row.hits++;
    self.set(key, row);
  }
  return [...self.values()].sort((a, b) => b.us - a.us).slice(0, 40).map((r) => ({
    ms: Math.round(r.us / 1000),
    hits: r.hits,
    fn: r.key,
  }));
}

const preview = process.env.BASE_URL ? null : startPreview();
const base = process.env.BASE_URL ?? preview.url;
if (preview) await waitForServer(base);

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
await cdp.send('Profiler.enable');
await page.addInitScript(() => {
  window.__longtasks = [];
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const att = e.attribution?.[0];
      window.__longtasks.push({
        start: Math.round(e.startTime),
        duration: Math.round(e.duration),
        name: e.name,
        src: att?.containerSrc ?? att?.containerName ?? '',
      });
    }
  });
  obs.observe({ type: 'longtask', buffered: true });
});
page.on('console', (msg) => {
  const t = msg.text();
  if (t.startsWith('LT') || msg.type() === 'error') console.log('page', msg.type(), t.slice(0, 300));
});
page.on('pageerror', (err) => console.log('pageerror', err.message));

const url = `${base}?mode=${mode}&ui=0&hud=1&quality=${quality}${webgl}&loadprobe=1`;
console.log('goto', url, 'throttle', throttle);
const t0 = Date.now();
await cdp.send('Profiler.start');
await page.goto(url, { waitUntil: 'commit', timeout: 60000 });

let stats = null;
let interactive = false;
const deadline = Date.now() + timeoutMs;
while (Date.now() < deadline) {
  const snap = await page.evaluate(() => {
    const tasks = window.__longtasks ?? [];
    const worst = tasks.reduce((m, t) => Math.max(m, t.duration), 0);
    const loading = !!document.getElementById('loading');
    const nla = window.__nla;
    const s = nla?.stats?.() ?? null;
    return {
      tasks: tasks.length,
      worst,
      loading,
      hasApp: !!nla,
      initMs: s?.initMs ?? 0,
      firstFrameMs: s?.firstFrameMs ?? 0,
      interactiveMs: s?.interactiveMs ?? 0,
      shaderQueue: s?.shaderQueue ?? null,
      streamerIdle: s?.streamerIdle ?? null,
      frames: s ? true : false,
    };
  }).catch((err) => ({ error: String(err) }));
  if (snap.error) {
    console.log('eval', snap.error);
  } else if (snap.hasApp && !snap.loading && snap.interactiveMs > 0) {
    interactive = true;
    console.log('interactive', JSON.stringify(snap), 'wall', Date.now() - t0);
    break;
  } else if ((Date.now() - t0) % 5000 < 400) {
    console.log('wait', JSON.stringify(snap), 'wall', Date.now() - t0);
  }
  await page.waitForTimeout(400);
}

stats = await page.evaluate(() => {
  const mem = performance.memory;
  const s = window.__nla?.stats?.() ?? null;
  const resources = performance.getEntriesByType('resource').map((r) => ({
    name: r.name.split('/').slice(-1)[0],
    ms: Math.round(r.duration),
    bytes: r.transferSize || r.encodedBodySize || 0,
  })).sort((a, b) => b.bytes - a.bytes).slice(0, 12);
  const tasks = (window.__longtasks ?? []).slice().sort((a, b) => b.duration - a.duration);
  return {
    gpu: (() => {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        return String(name);
      } catch (e) {
        return String(e);
      }
    })(),
    stats: s,
    heap: mem ? { used: mem.usedJSHeapSize, total: mem.totalJSHeapSize, limit: mem.jsHeapSizeLimit } : null,
    resources,
    boot: window.__boot ?? [],
    tasks,
    links: window.__shaderLinks ?? [],
    taskCount: tasks.length,
    over200: tasks.filter((t) => t.duration > 200).length,
    longest: tasks[0]?.duration ?? 0,
    loading: !!document.getElementById('loading'),
  };
}).catch((err) => ({ error: String(err) }));

const { profile } = await cdp.send('Profiler.stop');
const top = summarizeProfile(profile);
const report = {
  url,
  throttle,
  wallMs: Date.now() - t0,
  interactive,
  top,
  ...stats,
};
const interactiveAt = (report.boot ?? []).find((m) => m.n === 'interactive')?.t;
const loadTasks = (interactiveAt == null
  ? (report.tasks ?? [])
  : (report.tasks ?? []).filter((t) => t.start <= interactiveAt)
).slice().sort((a, b) => b.duration - a.duration);
const spans = report.links ?? [];
const classified = loadTasks.map((task) => {
  const inside = spans.filter((l) => l.t >= task.start - 8 && l.t <= task.start + task.duration + 8);
  const linkMs = inside.filter((l) => l.kind === 'link').reduce((s, l) => s + l.ms, 0);
  const drawMs = inside.filter((l) => l.kind === 'draw').reduce((s, l) => s + l.ms, 0);
  const reflectMs = inside.filter((l) => l.kind === 'reflect').reduce((s, l) => s + l.ms, 0);
  const uploadMs = inside.filter((l) => l.kind === 'upload').reduce((s, l) => s + l.ms, 0);
  const linkCount = inside.filter((l) => l.kind === 'link').length;
  const js = Math.max(0, task.duration - linkMs - drawMs - reflectMs - uploadMs);
  return {
    start: task.start,
    duration: task.duration,
    links: linkCount,
    linkMs: Math.round(linkMs),
    drawMs: Math.round(drawMs),
    reflectMs: Math.round(reflectMs),
    uploadMs: Math.round(uploadMs),
    js: Math.round(js),
  };
});
const loadLongest = loadTasks.reduce((m, t) => Math.max(m, t.duration), 0);
const jsWorst = classified.reduce((m, t) => Math.max(m, t.js), 0);
const limit = budgetMs || 200;
// One drawable can link a few passes (color, depth, and a second material).
// More than four in one task means the frame compiled a batch of meshes.
const batched = classified.filter((t) => t.links > 4 && t.duration > limit);
const jsOver = classified.filter((t) => t.js > limit);
report.loadLongest = loadLongest;
report.jsWorst = jsWorst;
report.loadClassified = classified.slice(0, 16);
report.linkCount = spans.filter((l) => l.kind === 'link').length;
report.drawSpanCount = spans.filter((l) => l.kind === 'draw').length;
delete report.links;
report.tasks = (report.tasks ?? []).slice().sort((a, b) => b.duration - a.duration).slice(0, 25);
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wallMs: report.wallMs,
  interactive,
  longest: report.longest,
  over200: report.over200,
  taskCount: report.taskCount,
  tier: report.stats?.tier,
  initMs: report.stats?.initMs,
  firstFrameMs: report.stats?.firstFrameMs,
  interactiveMs: report.stats?.interactiveMs,
  drawCalls: report.stats?.drawCalls,
  heap: report.heap?.used,
  backend: report.stats?.backend,
  gpu: report.gpu,
  top: top.slice(0, 12),
  boot: report.boot,
  tasks: report.tasks?.slice(0, 12),
}, null, 2));

await browser.close();
preview?.child.kill('SIGTERM');
console.log('load tasks', JSON.stringify({
  loadLongest, jsWorst, interactiveAt,
  batched: batched.slice(0, 6),
  jsOver: jsOver.slice(0, 6),
  longest: classified.slice(0, 8),
}));
const overBudget = budgetMs > 0 && (!interactive || jsOver.length > 0 || batched.length > 0);
if (overBudget) {
  console.error(`load budget failed: js ${jsWorst} ms, batched ${batched.length}, interactive ${interactive}, limit ${budgetMs} ms`);
  process.exit(1);
}
process.exit(0);
