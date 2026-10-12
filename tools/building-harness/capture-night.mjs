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

  const keepStreet = p.kind === 'ziggurat' || p.kind === 'res-stack' || p.kind === 'holo-shaft' || p.kind === 'hero-gate';
  const scaleShot = phase === 'final' && !keepStreet;
  let person = null;
  let planted = null;
  let found = [];
  if (scaleShot) {
    // The flight climbs one side of the opening. Stand on the side whose floor matches the sill.
    const gyDoor = q.groundHeight(p.door[0], p.door[1]);
    let lat = -2.5;
    let dep = 0.45;
    let best = 1e9;
    for (const tryLat of [-2.5, 2.5, -3.4, 3.4]) {
      const x = p.door[0] + bx * tryLat + nx * 0.45;
      const z = p.door[1] + bz * tryLat + nz * 0.45;
      const gy = q.groundHeight(x, z);
      const top = typeof q.floorBelow === 'function' ? q.floorBelow(x, gy + 2.4, z, true) : gy;
      const rise = top - gyDoor;
      const score = Math.abs(rise) + (rise > 0.08 ? 4 : 0);
      if (score < best) {
        best = score;
        lat = tryLat;
        dep = 0.45;
      }
    }
    const x = p.door[0] + bx * lat + nx * dep;
    const z = p.door[1] + bz * lat + nz * dep;
    planted = { x, z, d: Math.hypot(lat, dep), lat, dep, index: 0 };
    person = planted;
  } else if (phase === 'final') {
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
    const beside = found.filter((c) => Math.abs(c.lat) > 1.5 && Math.abs(c.lat) < 5.5 && c.dep > 0.5 && c.dep < 2.8);
    beside.sort((a, b) => Math.abs(a.dep - 1.4) - Math.abs(b.dep - 1.4) || Math.abs(a.lat) - Math.abs(b.lat));
    person = beside[0] ?? found.find((c) => Math.abs(c.lat) > 1.2) ?? found[0] ?? null;
  }

  const posed = {
    'res-stack': { camLat: 1.3, out: 13.5, pitch: 0.12, mix: 0 },
  };
  const pose = scaleShot
    ? { camLat: person && person.lat > 0 ? -1.15 : 1.15, out: 10.5, pitch: 0.02, mix: 0 }
    : (phase === 'final' ? posed[p.kind] : null);
  let camLat = lantern ? -4.5 : 0.4;
  let out = lantern ? 10 : 3.3;
  if (pose) {
    camLat = pose.camLat;
    out = pose.out;
  } else if (phase === 'final') {
    if (hero) {
      camLat = 2.4;
      out = 12.5;
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
  if (lantern && !scaleShot) {
    for (let i = 0; i < 8 && q.insideSolid(cx, p.ground + 1.2, cz, 0.3); i++) {
      cx += nx * 0.6 - bx * 0.8;
      cz += nz * 0.6 - bz * 0.8;
    }
  }
  if (person && phase === 'final' && !pose && !lantern) {
    for (let i = 0; i < 6 && Math.hypot(person.x - cx, person.z - cz) < 5.6; i++) {
      cx += nx * 0.45;
      cz += nz * 0.45;
    }
  }
  if (phase === 'final' && !hero && !pose) {
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

  const mix = pose ? pose.mix : 0.3;
  const aimX = person && phase === 'final' ? p.door[0] * (1 - mix) + person.x * mix : p.door[0];
  const aimZ = person && phase === 'final' ? p.door[1] * (1 - mix) + person.z * mix : p.door[1];
  const lookX = aimX - cx;
  const lookZ = aimZ - cz;
  const heading = Math.atan2(lookX, -lookZ);
  // Positive pitch looks up in this camera. That drops the horizon and keeps feet in frame.
  const pitch = phase === 'final' ? (pose ? pose.pitch : (hero ? 0.08 : 0.2)) : 0.02;
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
    const hideKind = hero || p.kind === 'monolith' || p.kind === 'cantilever' || p.kind === 'band-slab' || p.kind === 'res-stack' || p.kind === 'lantern';
    if (planted && mesh.count > 0) planted.index = Math.min(planted.index, mesh.count - 1);
    const plant = () => {
      if (!planted || mesh.count < 1) return;
      const e = mesh.instanceMatrix.array;
      const i = planted.index;
      const yaw = Math.atan2(nx, -nz);
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const o = i * 16;
      const gy = q.groundHeight(planted.x, planted.z);
      e[o] = c; e[o + 1] = 0; e[o + 2] = -s; e[o + 3] = 0;
      e[o + 4] = 0; e[o + 5] = 1; e[o + 6] = 0; e[o + 7] = 0;
      e[o + 8] = s; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0;
      e[o + 12] = planted.x; e[o + 13] = gy; e[o + 14] = planted.z; e[o + 15] = 1;
      const motion = mesh.geometry.getAttribute('iMotion');
      if (motion) {
        // Index 0 may be a vendor. A neutral stance keeps the 1.80 m body readable.
        motion.array[i * 4] = 0;
        motion.array[i * 4 + 1] = 0;
        motion.array[i * 4 + 2] = 0;
        motion.array[i * 4 + 3] = 0;
        motion.needsUpdate = true;
      }
      const style = mesh.geometry.getAttribute('iStyle');
      if (style) {
        style.array[i * 4] = style.array[i * 4 + 1] = style.array[i * 4 + 2] = style.array[i * 4 + 3] = 0;
        style.needsUpdate = true;
      }
    };
    const hide = (x, z, i) => {
      if (scaleShot) {
        if (planted && i === planted.index) return false;
        return true;
      }
      if (!hideKind || phase !== 'final') return false;
      if (person && Math.hypot(x - person.x, z - person.z) < 0.45) return false;
      if (Math.hypot(x - cx, z - cz) < 7.2) return true;
      const lat = latOf(x, z);
      const dep = depOf(x, z);
      if (dep > 3.2) return true;
      if (hero && Math.abs(lat) > 6.2) return true;
      const half = p.kind === 'hero-obelisk' ? 2.4 : 1.45;
      if (Math.abs(lat) < half && dep > -0.6 && dep < 8) return true;
      if (p.kind !== 'hero-obelisk') return false;
      for (const sample of [-1.15, -0.4, 0.4, 1.15]) {
        const dx = p.door[0] + bx * sample;
        const dz = p.door[1] + bz * sample;
        const vx = dx - cx;
        const vz = dz - cz;
        const len2 = vx * vx + vz * vz || 1;
        const u = ((x - cx) * vx + (z - cz) * vz) / len2;
        if (u < 0.08 || u > 0.92) continue;
        if (Math.hypot(x - (cx + vx * u), z - (cz + vz * u)) < 1.45) return true;
      }
      return false;
    };
    const apply = () => {
      plant();
      const e = mesh.instanceMatrix.array;
      let n = 0;
      for (let i = 0; i < mesh.count; i++) {
        const x = e[i * 16 + 12];
        const z = e[i * 16 + 14];
        if (!hide(x, z, i)) continue;
        n++;
        e[i * 16] = e[i * 16 + 1] = e[i * 16 + 2] = 0;
        e[i * 16 + 4] = e[i * 16 + 5] = e[i * 16 + 6] = 0;
        e[i * 16 + 8] = e[i * 16 + 9] = e[i * 16 + 10] = 0;
      }
      mesh.instanceMatrix.needsUpdate = true;
      return n;
    };
    if ((hideKind || scaleShot) && phase === 'final') {
      crowd.update = function (...args) {
        crowd.__b1Orig.apply(crowd, args);
        apply();
      };
      occlude = apply();
    } else {
      crowd.update = crowd.__b1Orig;
    }
  }
  if (scaleShot && nla.app.scene) {
    nla.app.scene.traverse((obj) => {
      if (!obj.name) return;
      if (obj.name.indexOf('-fade') >= 0) obj.visible = false;
      // A steam cross on the door centreline reads as a pale wedge over the opening.
      if (obj.name.indexOf('steam') >= 0) obj.visible = false;
    });
  }
  return {
    person: person ? { x: person.x, z: person.z, d: person.d, lat: person.lat } : null,
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
        const q = nla.app.query;
        const holo = p.kind === 'holo-shaft';
        const zig = p.kind === 'ziggurat';
        const gate = p.kind === 'hero-gate';
        const cross = p.kind === 'lantern';
        const face = 1;
        let y = p.ground + Math.min(160, Math.max(42, p.height * (zig ? 0.52 : 0.36)));
        let reach = Math.max(p.d, p.w) * 0.5 + Math.min(90, Math.max(56, p.height * 0.22));
        let lateral = 22;
        let aimF = 0.42;
        if (zig) {
          reach = Math.max(p.d, p.w) * 1.15 + p.height * 0.28;
          lateral = Math.max(p.w, p.d) * 0.72;
          aimF = 0.38;
        } else if (cross) {
          // Just above the roof, off a corner, so both standing arms show their lit sides.
          reach = 48;
          lateral = 42;
          y = p.ground + p.height + 10;
          aimF = 1.01;
        } else if (p.kind === 'monolith') {
          reach = Math.max(p.d, p.w) * 0.72 + 28;
          lateral = Math.max(p.w, p.d) * 0.95;
          y = p.ground + p.height * 0.42;
          aimF = 0.4;
        } else if (holo) {
          reach = Math.max(p.d, p.w) * 0.9 + Math.min(70, p.height * 0.16);
          lateral = 22;
          y = p.ground + p.height * 0.42;
          aimF = 0.46;
        } else if (p.kind === 'buttress') {
          reach = Math.max(p.d, p.w) * 0.62 + 18;
          lateral = Math.max(p.w, p.d) * 0.72;
          y = p.ground + p.height * 0.34;
        } else if (p.kind === 'cantilever') {
          reach = 58;
          lateral = Math.max(p.w, p.d) * 0.95;
          y = p.ground + p.height * 0.3;
          aimF = 0.28;
        } else if (p.kind === 'band-slab') {
          reach = Math.max(p.d, p.w) * 0.7 + 18;
          lateral = Math.max(p.w, p.d) * 0.72;
          y = p.ground + p.height * 0.34;
          aimF = 0.4;
        } else if (p.kind === 'res-stack') {
          reach = Math.max(p.d, p.w) * 0.62 + 16;
          lateral = Math.max(p.w, p.d) * 0.85;
          y = p.ground + p.height * 0.4;
          aimF = 0.46;
        } else if (p.kind === 'hero-step') {
          reach = Math.max(100, p.height * 0.2);
          lateral = Math.max(80, Math.max(p.w, p.d) * 1.2);
          y = p.ground + p.height * 0.3;
          aimF = 0.4;
        } else if (gate) {
          reach = Math.max(120, p.height * 0.32);
          lateral = 52;
          y = p.ground + p.height * 0.3;
        }
        const nudge = p.kind === 'cantilever' || p.kind === 'band-slab' || p.kind === 'res-stack' || p.kind === 'lantern' || p.kind === 'hero-step' || p.kind === 'monolith' || p.kind === 'buttress';
        if (nudge) {
          for (let i = 0; i < 6; i++) {
            const tx = p.center[0] + p.normal[0] * reach * face + p.bx * lateral;
            const tz = p.center[1] + p.normal[1] * reach * face + p.bz * lateral;
            if (!q.insideSolid(tx, y, tz, 8) && !q.insideLandmark(tx, y, tz, 10)) break;
            lateral *= 0.7;
            reach += 14;
          }
        }
        const px = p.center[0] + p.normal[0] * reach * face + p.bx * lateral;
        const pz = p.center[1] + p.normal[1] * reach * face + p.bz * lateral;
        const ax = p.center[0];
        const az = p.center[1];
        const ay = p.ground + p.height * aimF;
        const heading = Math.atan2(ax - px, -(az - pz));
        const pitch = Math.atan2(ay - y, Math.hypot(ax - px, az - pz));
        if (nla.app.cams.mode !== 'fly') nla.setMode('fly');
        nla.setPose(px, y, pz, (heading * 180) / Math.PI, (pitch * 180) / Math.PI);
        if (nla.app.cams.fly?.spinner) nla.app.cams.fly.spinner.visible = true;
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
        const face = 1;
        const framed = {
          'hero-gate': { dist: 340, yF: 0.28, side: 0.5, aim: 0.46 },
        };
        // Stay at the feature (billboard, shelf, balcony band). Step sideways
        // before climbing, so a blocked start does not become a roof shot.
        const feature = {
          'holo-shaft': [
            { dist: Math.max(p.d, p.w) * 0.9 + Math.min(70, p.height * 0.16), y: p.ground + p.height * 0.42, sideM: 22, aim: 0.46 },
          ],
          cantilever: [
            { dist: 58, y: p.ground + p.height * 0.3, sideM: Math.max(p.w, p.d) * 0.95, aim: 0.28 },
          ],
          'band-slab': [
            { dist: Math.max(p.d, p.w) * 0.7 + 18, y: p.ground + p.height * 0.34, sideM: Math.max(p.w, p.d) * 0.72, aim: 0.4 },
          ],
          'res-stack': [
            { dist: Math.max(p.d, p.w) * 0.62 + 16, y: p.ground + p.height * 0.4, sideM: Math.max(p.w, p.d) * 0.85, aim: 0.46 },
          ],
          lantern: [
            { dist: 48, y: p.ground + p.height + 10, sideM: 42, aim: 1.01 },
          ],
          'hero-step': [
            { dist: Math.max(100, p.height * 0.2), y: p.ground + p.height * 0.3, sideM: Math.max(80, Math.max(p.w, p.d) * 1.2), aim: 0.4 },
          ],
          'hero-obelisk': [
            { dist: Math.max(p.d, p.w) * 0.5 + Math.min(90, Math.max(56, p.height * 0.22)), y: p.ground + Math.min(160, Math.max(42, p.height * 0.36)), sideM: 22, aim: 0.42 },
          ],
          monolith: [
            { dist: Math.max(p.d, p.w) * 0.72 + 28, y: p.ground + p.height * 0.42, sideM: Math.max(p.w, p.d) * 0.95, aim: 0.4 },
          ],
          buttress: [
            { dist: Math.max(p.d, p.w) * 0.62 + 18, y: p.ground + p.height * 0.34, sideM: Math.max(p.w, p.d) * 0.72, aim: 0.42 },
          ],
        };
        const tries = feature[p.kind];
        let dist;
        let y;
        let px = p.center[0];
        let pz = p.center[1];
        let aimF;
        if (tries) {
          const shot = tries[0];
          let sideM = shot.sideM;
          dist = shot.dist;
          y = shot.y;
          aimF = shot.aim;
          for (let i = 0; i < 6; i++) {
            px = p.center[0] + p.normal[0] * dist * face + p.bx * sideM;
            pz = p.center[1] + p.normal[1] * dist * face + p.bz * sideM;
            if (p.kind === 'holo-shaft' || p.kind === 'hero-obelisk') break;
            const blocked = q.insideSolid(px, y, pz, 8) || q.insideLandmark(px, y, pz, 10);
            if (!blocked) break;
            sideM *= 0.7;
            dist += 14;
          }
        } else {
          const shot = framed[p.kind];
          const side = shot ? shot.side : 0.06;
          dist = shot ? shot.dist : Math.max(480, p.height * 1.35);
          y = p.ground + (shot ? p.height * shot.yF : Math.max(80, Math.min(240, p.height * 0.42)));
          aimF = shot ? shot.aim : 0.62;
          for (let i = 0; i < 7; i++) {
            px = p.center[0] + p.normal[0] * dist * face + p.bx * dist * side;
            pz = p.center[1] + p.normal[1] * dist * face + p.bz * dist * side;
            const blocked = q.insideSolid(px, y, pz, 14) || q.insideLandmark(px, y, pz, 18);
            if (!blocked) break;
            dist += shot ? 80 : 140;
            y += shot ? 24 : 45;
          }
        }
        const ax = p.center[0];
        const az = p.center[1];
        const ay = p.ground + p.height * aimF;
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
