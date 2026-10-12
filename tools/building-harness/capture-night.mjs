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

/** Street camera: a 1.8 m figure beside the 2.2 m door, with the flight in profile. */
function placeStreet(arg) {
  const p = arg.tower;
  const phase = arg.phase;
  const nla = window.__nla;
  const q = nla.app.query;
  const nx = p.normal[0];
  const nz = p.normal[1];
  const bx = p.bx;
  const bz = p.bz;
  const latOf = (x, z) => (x - p.door[0]) * bx + (z - p.door[1]) * bz;
  const depOf = (x, z) => (x - p.door[0]) * nx + (z - p.door[1]) * nz;
  const lantern = p.kind === 'lantern';
  const hero = String(p.kind).startsWith('hero');

  let person = null;
  let found = [];
  if (phase === 'final') {
    const mesh = nla.app.crowd?.mesh;
    const e = mesh?.instanceMatrix?.array;
    if (e) {
      for (let i = 0; i < mesh.count; i++) {
        const scale = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
        if (scale < 0.2) continue;
        const x = e[i * 16 + 12];
        const z = e[i * 16 + 14];
        const d = Math.hypot(x - p.door[0], z - p.door[1]);
        if (d > 14 || depOf(x, z) < -0.4) continue;
        found.push({ x, z, d, lat: latOf(x, z), dep: depOf(x, z) });
      }
    }
    found.sort((a, b) => a.d - b.d);
    person = found.find((c) => c.d < 7) ?? found[0] ?? null;
  }

  // Seed stands on the queue so that spot wins the idle budget. The shot then steps back,
  // still inside the same crowd cell, and looks up so the black street does not eat the frame.
  // Stairs run toward +t, except the lantern, whose flight is on the open arm of the cross.
  let camLat = lantern ? -1.1 : 0.4;
  let out = lantern ? 3.6 : 3.3;
  if (phase === 'final') {
    if (p.kind === 'hero-obelisk') {
      // Same side as the medium frame. Coats standing in the opening are hidden below.
      camLat = -4.6;
      out = 9.4;
    } else if (p.kind === 'band-slab') {
      // The +t side of this door clips a foreground shard. Stand on the queue side.
      camLat = -5.2;
      out = 10.5;
    } else if (hero) {
      // Far enough that the apron reads as a few coats beside the door, not a cropped wall.
      camLat = 2.4;
      out = 12.5;
    } else if (lantern) {
      camLat = -2.4;
      out = 7.8;
    } else {
      camLat = 2.15;
      out = 6.7;
      if (person && person.lat > 3) camLat = -2.15;
      if (person && person.dep > 0.4) out = Math.max(out, Math.min(9.0, person.dep + 5.4));
    }
  }

  let cx = p.door[0] + nx * out + bx * camLat;
  let cz = p.door[1] + nz * out + bz * camLat;
  let occlude = null;
  const step = phase === 'final' ? 0.7 : 0.45;
  const maxStep = lantern ? 2 : 8;
  for (let i = 0; i < maxStep && q.insideSolid(cx, p.ground + 1.2, cz, 0.3); i++) {
    cx += nx * step;
    cz += nz * step;
  }
  if (lantern) {
    for (let i = 0; i < 8 && q.insideSolid(cx, p.ground + 1.2, cz, 0.3); i++) {
      cx += nx * 0.6 - bx * 0.8;
      cz += nz * 0.6 - bz * 0.8;
    }
  }
  if (person && phase === 'final' && !lantern && p.kind !== 'hero-obelisk') {
    for (let i = 0; i < 6 && Math.hypot(person.x - cx, person.z - cz) < 5.6; i++) {
      cx += nx * 0.45;
      cz += nz * 0.45;
    }
  }
  if (phase === 'final' && !hero) {
    const mesh = nla.app.crowd?.mesh;
    const e = mesh?.instanceMatrix?.array;
    for (let n = 0; n < 4; n++) {
      let near = null;
      let nearD = 1e9;
      if (e) {
        for (let i = 0; i < mesh.count; i++) {
          const scale = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
          if (scale < 0.2) continue;
          const x = e[i * 16 + 12];
          const z = e[i * 16 + 14];
          const cd = Math.hypot(x - cx, z - cz);
          if (cd < nearD) nearD = cd, near = { x, z };
        }
      }
      // A coat inside this radius becomes a cropped umbrella, including one standing at the door.
      const limit = 5.2;
      if (!near || nearD >= limit) break;
      const sign = latOf(near.x, near.z) > latOf(cx, cz) ? -1 : 1;
      const slide = lantern ? -0.45 : sign * 1.35;
      cx += bx * slide + nx * 0.5;
      cz += bz * slide + nz * 0.5;
    }
  }

  const mix = p.kind === 'hero-obelisk' ? 0 : 0.3;
  const aimX = person && phase === 'final' ? p.door[0] * (1 - mix) + person.x * mix : p.door[0];
  const aimZ = person && phase === 'final' ? p.door[1] * (1 - mix) + person.z * mix : p.door[1];
  const lookX = aimX - cx;
  const lookZ = aimZ - cz;
  const heading = Math.atan2(lookX, -lookZ);
  // Positive pitch looks up in this camera. That drops the horizon and keeps feet in frame.
  const pitch = phase === 'final' ? (hero ? (p.kind === 'hero-obelisk' ? 0.16 : 0.08) : 0.2) : 0.02;
  if (nla.app.cams.mode !== 'walk') nla.setMode('walk');
  nla.setPose(cx, p.ground + 2, cz, (heading * 180) / Math.PI, (pitch * 180) / Math.PI);
  const w = nla.app.cams.walk;
  w.pos.set(cx, p.ground, cz);
  w.heading = heading;
  w.pitch = pitch;
  nla.app.cams.fly.spinner.visible = false;
  const crowd = nla.app.crowd;
  const mesh = crowd?.mesh;
  if (crowd && mesh) {
    if (!crowd.__b1Orig) crowd.__b1Orig = crowd.update.bind(crowd);
    const hide = (x, z) => {
      if (p.kind !== 'hero-obelisk') return false;
      for (const lat of [-1.15, -0.4, 0.4, 1.15]) {
        const dx = p.door[0] + bx * lat;
        const dz = p.door[1] + bz * lat;
        const vx = dx - cx;
        const vz = dz - cz;
        const len2 = vx * vx + vz * vz || 1;
        const u = ((x - cx) * vx + (z - cz) * vz) / len2;
        if (u < 0.08 || u > 0.92) continue;
        if (Math.hypot(x - (cx + vx * u), z - (cz + vz * u)) < 1.05) return true;
      }
      return false;
    };
    const apply = () => {
      const e = mesh.instanceMatrix.array;
      let n = 0;
      for (let i = 0; i < mesh.count; i++) {
        const x = e[i * 16 + 12];
        const z = e[i * 16 + 14];
        if (!hide(x, z)) continue;
        n++;
        e[i * 16] = e[i * 16 + 1] = e[i * 16 + 2] = 0;
        e[i * 16 + 4] = e[i * 16 + 5] = e[i * 16 + 6] = 0;
        e[i * 16 + 8] = e[i * 16 + 9] = e[i * 16 + 10] = 0;
      }
      mesh.instanceMatrix.needsUpdate = true;
      return n;
    };
    if (p.kind === 'hero-obelisk') {
      crowd.update = function (...args) {
        crowd.__b1Orig.apply(crowd, args);
        apply();
      };
      occlude = apply();
    } else {
      crowd.update = crowd.__b1Orig;
    }
  }
  return {
    person: person ? { x: person.x, z: person.z, d: person.d } : null,
    out,
    camLat,
    pitch,
    occlude,
    doorDist: Math.hypot(cx - p.door[0], cz - p.door[1]),
    personDist: person ? Math.hypot(person.x - cx, person.z - cz) : null,
  };
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
  if (booted) await page.goto('about:blank').catch(() => {});
  await boot(page, tier, towers[0]);
  booted = true;
  for (const tower of towers) {
    if (views.includes('street') && already(join(OUT, `${tier}-${tower.kind}-street.png`))) {
      console.log('skip', `${tier}-${tower.kind}-street.png`);
    } else if (views.includes('street')) {
      await page.evaluate(placeStreet, { tower, phase: 'near' });
      await settle(page, 1600);
      await page.evaluate(placeStreet, { tower, phase: 'near' });
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
        return best < 6.5;
      }, tower.door, { timeout: 12_000 }).catch(() => {});
      await page.evaluate(placeStreet, { tower, phase: 'final' });
      await settle(page, 700);
      const info = await page.evaluate(placeStreet, { tower, phase: 'final' });
      await settle(page, 220);
      const file = `${tier}-${tower.kind}-street.png`;
      await shot(page, join(OUT, file));
      const st = await page.evaluate(() => window.__nla.stats());
      log.push({ file, ...info, fps: st.fps, draws: st.drawCalls, tris: st.triangles, idle: st.inFlight, crowd: st.crowd });
      console.log(file, JSON.stringify({
        person: info.person,
        doorDist: info.doorDist && Number(info.doorDist.toFixed(1)),
        personDist: info.personDist && Number(info.personDist.toFixed(1)),
        camLat: info.camLat && Number(info.camLat.toFixed(2)),
        out: info.out && Number(info.out.toFixed(2)),
        occlude: info.occlude,
        crowd: st.crowd,
        draws: st.drawCalls,
        idle: st.inFlight,
      }));
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
