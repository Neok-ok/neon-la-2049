// Side view of one person at four walk phases, street distance, landscape phone.
// After D1 the phases are a stride. Before D1 the same camera shows the old slide.
//   BASE_URL=http://127.0.0.1:4173/ OUT=/tmp/d1-pose-after node scripts/d1-pose.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? 'screenshots-tmp/d1-pose';
const GPU = process.env.GPU === '1';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: GPU
    ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  headless: true,
});
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const q = `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=0&ui=0&quality=medium${GPU ? '' : '&webgl=1'}`;
await page.goto(`${BASE}?${q}`);
await page.waitForFunction(() => {
  const st = window.__nla?.stats?.();
  return st && st.lod0 >= 6 && st.queryPending === 0 && st.drawCalls > 40;
}, null, { timeout: 120_000, polling: 500 });
await page.evaluate(() => window.__nla.marketView('street'));
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

const phases = [0, 0.25, 0.5, 0.75];
for (const phase of phases) {
  const info = await page.evaluate((phase) => {
    const app = window.__nla.app;
    const crowd = app.crowd;
    crowd.update = () => {};
    const w = app.cams.walk;
    const H = w.heading;
    const fx = Math.sin(H);
    const fz = -Math.cos(H);
    const dist = 4.6;
    const px = w.pos.x + fx * dist;
    const pz = w.pos.z + fz * dist;
    const gy = app.query.groundHeight(px, pz);
    w.pitch = Math.atan2(0.95 - 1.7, dist);
    const yaw = Math.atan2(Math.cos(H), Math.sin(H));
    const mesh = crowd.mesh;
    const geo = mesh.geometry;
    mesh.count = 1;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // Same as Matrix4.makeRotationY(yaw): local +Z becomes (sin yaw, 0, cos yaw).
    const e = mesh.instanceMatrix.array;
    e[0] = c; e[1] = 0; e[2] = -s; e[3] = 0;
    e[4] = 0; e[5] = 1; e[6] = 0; e[7] = 0;
    e[8] = s; e[9] = 0; e[10] = c; e[11] = 0;
    e[12] = px; e[13] = gy; e[14] = pz; e[15] = 1;
    mesh.instanceMatrix.needsUpdate = true;
    const coat = geo.getAttribute('iCoat');
    if (coat) {
      coat.setXYZ(0, 0.45, 0.2, 0.1);
      coat.needsUpdate = true;
    }
    const canopy = geo.getAttribute('iCanopy');
    if (canopy) {
      canopy.setXYZ(0, 1, 0.2, 0.45);
      canopy.needsUpdate = true;
    }
    const motion = geo.getAttribute('iMotion');
    if (motion) {
      motion.setXYZW(0, phase, 1, 1, 0);
      motion.needsUpdate = true;
    }
    const style = geo.getAttribute('iStyle');
    if (style) {
      style.setXYZW(0, 0, 1, 0, 0);
      style.needsUpdate = true;
    }
    const agent = geo.getAttribute('iAgent');
    if (agent) {
      agent.setXYZW(0, phase, 1, 1, yaw);
      agent.needsUpdate = true;
    }
    const origin = geo.getAttribute('iOrigin');
    if (origin) {
      origin.setXYZ(0, 0, 1.7, 0);
      origin.needsUpdate = true;
    }
    document.querySelectorAll('.stick').forEach((el) => { el.style.display = 'none'; });
    return { px, pz, gy, yaw, H, pitch: w.pitch, hasMotion: !!motion };
  }, phase);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const file = join(OUT, `c${phase}.png`);
  await page.screenshot({ path: file, timeout: 180_000 });
  console.log('POSE', phase, JSON.stringify(info), file);
}

if (errors.length) console.log('ERRORS', errors.slice(0, 8).join('\n'));
else console.log('ERRORS none');
await browser.close();
