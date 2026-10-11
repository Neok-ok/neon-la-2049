// Night street, spinner flyby, and skyline frames for each B1 tower.
//   TIERS=ultra,medium VIEWS=street,fly,sky ONLY=band-slab node tools/building-harness/capture-night.mjs
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? '/opt/cursor/artifacts/b1/night';
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173/';
const catalog = JSON.parse(readFileSync(process.env.CATALOG ?? '/opt/cursor/artifacts/b1/catalog.json', 'utf8'));
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const tiers = (process.env.TIERS ?? 'ultra,medium').split(',');
const views = (process.env.VIEWS ?? 'street,fly,sky').split(',');
let towers = catalog.towers;
if (only.length) towers = towers.filter((t) => only.includes(t.kind) || only.includes(t.id));
towers = [...towers].sort((a, b) => a.door[1] - b.door[1] || a.door[0] - b.door[0]);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const q = 'freeze=1&ui=0&webgl=1&weather=rain&time=21.5';
const log = [];

async function boot(page, tier, tower) {
  const yaw = (tower.heading * 180) / Math.PI;
  const url = `${BASE}?mode=walk&quality=${tier}&${q}&x=${tower.stand[0]}&y=${tower.ground + 1.7}&z=${tower.stand[1]}&yaw=${yaw}&pitch=10`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__nla?.stats?.()?.fps > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__nla.isIdle(), null, { timeout: 45_000 }).catch(() => {});
}

async function settle(page, ms) {
  await page.waitForTimeout(ms);
}

function already(file) {
  try { return existsSync(file) && statSync(file).size > 40000; } catch { return false; }
}

async function shot(page, file) {
  if (already(file)) {
    console.log('skip', file);
    return false;
  }
  for (let i = 0; i < 2; i++) {
    try {
      await page.screenshot({ path: file, timeout: 90_000 });
      return true;
    } catch (err) {
      console.warn('retry', file, String(err).slice(0, 120));
      await page.waitForTimeout(2000);
    }
  }
  console.warn('missed', file);
  return false;
}

const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let booted = false;
for (const tier of tiers) {
  if (!booted) {
    await boot(page, tier, towers[0]);
    booted = true;
  } else {
    await page.evaluate((t) => window.__nla.app.setQuality(t), tier);
    await page.waitForTimeout(500);
    await settle(page, 50_000);
  }
  for (const tower of towers) {
    if (views.includes('street') && already(join(OUT, `${tier}-${tower.kind}-street.png`))) {
      console.log('skip', `${tier}-${tower.kind}-street.png`);
    } else if (views.includes('street')) {
      await page.evaluate((p) => {
        const hero = String(p.kind).startsWith('hero');
        const lantern = p.kind === 'lantern';
        // Heroes stay just off the apron ring. The lantern door sits on the open arm, away from the cross.
        const dist = hero ? 5.2 : lantern ? Math.max(16, (p.gap ?? 24) - 8) : 6.4;
        const side = lantern ? -8 : 2.8;
        const nla = window.__nla;
        const q = nla.app.query;
        let cx = p.door[0] + p.normal[0] * dist + p.bx * side;
        let cz = p.door[1] + p.normal[1] * dist + p.bz * side;
        if (!lantern && q.insideSolid(cx, p.ground + 1.2, cz, 0.4)) {
          cx = p.door[0] + p.normal[0] * dist + p.bx * -side;
          cz = p.door[1] + p.normal[1] * dist + p.bz * -side;
        }
        for (let i = 0; i < 18 && q.insideSolid(cx, p.ground + 1.2, cz, 0.4); i++) {
          cx += p.normal[0] * 1.5;
          cz += p.normal[1] * 1.5;
        }
        const aimX = p.door[0] + p.bx * 0.3;
        const aimZ = p.door[1] + p.bz * 0.3;
        const lookX = aimX - cx;
        const lookZ = aimZ - cz;
        const heading = Math.atan2(lookX, -lookZ);
        const pitch = Math.atan2(1.3 - 1.7, Math.hypot(lookX, lookZ) || 1);
        if (nla.app.cams.mode !== 'walk') nla.setMode('walk');
        nla.setPose(cx, p.ground + 2, cz, (heading * 180) / Math.PI, (pitch * 180) / Math.PI);
        const w = nla.app.cams.walk;
        w.pos.set(cx, p.ground, cz);
        w.heading = heading;
        w.pitch = pitch;
        nla.app.cams.fly.spinner.visible = false;
      }, tower);
      await settle(page, 1600);
      await page.evaluate((p) => {
        const nla = window.__nla;
        const q = nla.app.query;
        const w = nla.app.cams.walk;
        const hero = String(p.kind).startsWith('hero');
        const lantern = p.kind === 'lantern';
        const dist = hero ? 5.2 : lantern ? Math.max(16, (p.gap ?? 24) - 8) : 6.4;
        let side = lantern ? -8 : 2.8;
        let cx = p.door[0] + p.normal[0] * dist + p.bx * side;
        let cz = p.door[1] + p.normal[1] * dist + p.bz * side;
        if (!lantern && q.insideSolid(cx, p.ground + 1.2, cz, 0.35)) {
          side = -4.2;
          cx = p.door[0] + p.normal[0] * dist + p.bx * side;
          cz = p.door[1] + p.normal[1] * dist + p.bz * side;
        }
        for (let i = 0; i < 22 && q.insideSolid(cx, p.ground + 1.2, cz, 0.35); i++) {
          cx += p.normal[0] * 1.6;
          cz += p.normal[1] * 1.6;
        }
        w.pos.x = cx;
        w.pos.z = cz;
        const lookX = p.door[0] - cx;
        const lookZ = p.door[1] - cz;
        w.heading = Math.atan2(lookX, -lookZ);
        w.pitch = Math.atan2(1.3 - 1.7, Math.hypot(lookX, lookZ) || 1);
      }, tower);
      await page.waitForFunction((door) => {
        const mesh = window.__nla?.app?.crowd?.mesh;
        if (!mesh || mesh.count < 1) return false;
        const e = mesh.instanceMatrix.array;
        let best = 1e9;
        const n = Math.min(mesh.count, 680);
        for (let i = 0; i < n; i++) {
          const scale = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
          if (scale < 0.2) continue;
          const d = Math.hypot(e[i * 16 + 12] - door[0], e[i * 16 + 14] - door[1]);
          if (d < best) best = d;
        }
        return best < 12;
      }, tower.door, { timeout: 10_000 }).catch(() => {});
      await page.evaluate((p) => {
        const nla = window.__nla;
        const mesh = nla.app.crowd.mesh;
        const e = mesh.instanceMatrix.array;
        let px = 0;
        let pz = 0;
        let best = 1e9;
        for (let i = 0; i < mesh.count; i++) {
          const scale = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
          if (scale < 0.2) continue;
          const x = e[i * 16 + 12];
          const z = e[i * 16 + 14];
          const d = Math.hypot(x - p.door[0], z - p.door[1]);
          if (d < best) { best = d; px = x; pz = z; }
        }
        if (best > 14 || String(p.kind).startsWith('hero') || p.kind === 'lantern') return;
        // Stand a few metres beside that person, outward of the door, so both read at human scale.
        const dx = p.door[0] - px;
        const dz = p.door[1] - pz;
        const len = Math.hypot(dx, dz) || 1;
        let sx = -dz / len;
        let sz = dx / len;
        if (sx * p.normal[0] + sz * p.normal[1] < 0) { sx = -sx; sz = -sz; }
        const q = nla.app.query;
        let cx = px + sx * 4.4 + p.normal[0] * 1.4;
        let cz = pz + sz * 4.4 + p.normal[1] * 1.4;
        if (q.insideSolid(cx, p.ground + 1.2, cz, 0.35)) {
          cx = px - sx * 4.4 + p.normal[0] * 1.4;
          cz = pz - sz * 4.4 + p.normal[1] * 1.4;
        }
        for (let i = 0; i < 14 && q.insideSolid(cx, p.ground + 1.2, cz, 0.35); i++) {
          cx += p.normal[0] * 1.3;
          cz += p.normal[1] * 1.3;
        }
        const doorDist = Math.hypot(cx - p.door[0], cz - p.door[1]);
        if (doorDist < 5.4) {
          cx += p.normal[0] * (5.8 - doorDist);
          cz += p.normal[1] * (5.8 - doorDist);
        }
        const aimX = p.door[0] * 0.62 + px * 0.38;
        const aimZ = p.door[1] * 0.62 + pz * 0.38;
        const lookX = aimX - cx;
        const lookZ = aimZ - cz;
        const w = nla.app.cams.walk;
        w.pos.set(cx, p.ground, cz);
        w.heading = Math.atan2(lookX, -lookZ);
        w.pitch = Math.atan2(1.25 - 1.7, Math.hypot(lookX, lookZ) || 1);
      }, tower);
      const info = await page.evaluate((p) => {
        const nla = window.__nla;
        const mesh = nla.app.crowd.mesh;
        const e = mesh.instanceMatrix.array;
        let best = null;
        let bestD = 1e9;
        for (let i = 0; i < mesh.count; i++) {
          const scale = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
          if (scale < 0.2) continue;
          const x = e[i * 16 + 12];
          const z = e[i * 16 + 14];
          const d = Math.hypot(x - p.door[0], z - p.door[1]);
          if (d < bestD) bestD = d, best = { x, z, d };
        }
        const w = nla.app.cams.walk;
        const cam = nla.app.camera.position;
        return {
          person: best,
          count: mesh.count,
          cam: [Number(cam.x.toFixed(1)), Number(cam.y.toFixed(1)), Number(cam.z.toFixed(1))],
          feet: [Number(w.pos.x.toFixed(1)), Number(w.pos.z.toFixed(1))],
        };
      }, tower);
      await settle(page, 900);
      const file = `${tier}-${tower.kind}-street.png`;
      await shot(page, join(OUT, file));
      const st = await page.evaluate(() => window.__nla.stats());
      log.push({ file, ...info, fps: st.fps, draws: st.drawCalls, tris: st.triangles, idle: st.inFlight, crowd: st.crowd });
      console.log(file, JSON.stringify({ person: info.person, crowd: st.crowd, draws: st.drawCalls, idle: st.inFlight }));
    }
    if (views.includes('fly') && already(join(OUT, `${tier}-${tower.kind}-fly.png`))) {
      console.log('skip', `${tier}-${tower.kind}-fly.png`);
    } else if (views.includes('fly')) {
      await page.evaluate((p) => {
        const nla = window.__nla;
        const y = p.ground + Math.min(150, Math.max(42, p.height * 0.36));
        const reach = Math.max(p.d, p.w) * 0.5 + Math.min(90, Math.max(56, p.height * 0.22));
        const px = p.center[0] + p.normal[0] * reach + p.bx * 22;
        const pz = p.center[1] + p.normal[1] * reach + p.bz * 22;
        const ax = p.center[0];
        const az = p.center[1];
        const ay = p.ground + p.height * 0.42;
        const heading = Math.atan2(ax - px, -(az - pz));
        const pitch = Math.atan2(ay - y, Math.hypot(ax - px, az - pz));
        if (nla.app.cams.mode !== 'fly') nla.setMode('fly');
        nla.setPose(px, y, pz, (heading * 180) / Math.PI, (pitch * 180) / Math.PI);
      }, tower);
      await settle(page, 2800);
      const file = `${tier}-${tower.kind}-fly.png`;
      await shot(page, join(OUT, file));
      const st = await page.evaluate(() => window.__nla.stats());
      log.push({ file, fps: st.fps, draws: st.drawCalls, tris: st.triangles, idle: st.inFlight });
      console.log(file, st.drawCalls, st.inFlight);
    }
    if (views.includes('sky') && already(join(OUT, `${tier}-${tower.kind}-sky.png`))) {
      console.log('skip', `${tier}-${tower.kind}-sky.png`);
    } else if (views.includes('sky')) {
      const sky = await page.evaluate((p) => {
        const nla = window.__nla;
        const q = nla.app.query;
        let dist = Math.max(480, p.height * 1.35);
        let y = p.ground + Math.max(80, Math.min(240, p.height * 0.42));
        let px = p.center[0];
        let pz = p.center[1];
        for (let i = 0; i < 7; i++) {
          px = p.center[0] + p.normal[0] * dist + p.bx * dist * 0.06;
          pz = p.center[1] + p.normal[1] * dist + p.bz * dist * 0.06;
          const blocked = q.insideSolid(px, y, pz, 14) || q.insideLandmark(px, y, pz, 18);
          if (!blocked) break;
          dist += 140;
          y += 45;
        }
        const ax = p.center[0];
        const az = p.center[1];
        const ay = p.ground + p.height * 0.62;
        const heading = Math.atan2(ax - px, -(az - pz));
        const pitch = Math.atan2(ay - y, Math.hypot(ax - px, az - pz));
        if (nla.app.cams.mode !== 'fly') nla.setMode('fly');
        nla.setPose(px, y, pz, (heading * 180) / Math.PI, (pitch * 180) / Math.PI);
        return { px, y, pz, dist };
      }, tower);
      await settle(page, 2800);
      const file = `${tier}-${tower.kind}-sky.png`;
      await shot(page, join(OUT, file));
      const st = await page.evaluate(() => window.__nla.stats());
      log.push({ file, fps: st.fps, draws: st.drawCalls, tris: st.triangles, idle: st.inFlight });
      console.log(file, st.drawCalls, st.inFlight, JSON.stringify(sky));
    }
  }
}

writeFileSync(join(OUT, 'log.json'), JSON.stringify({ log, errors: errors.slice(0, 12) }, null, 2));
await browser.close();
console.log('errors', errors.slice(0, 4));
