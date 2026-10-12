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

  // Every street uses one planted figure. A crowd with umbrellas stands closer than the door and reads taller than the 2.2 m opening.
  const keepStreet = false;
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
    ? (p.kind === 'lantern'
      // Far enough to the side that the wall turns a corner, still on the door.
      ? { camLat: person && person.lat > 0 ? -3.4 : 3.4, out: 11.6, pitch: 0.04, mix: 0 }
      : { camLat: person && person.lat > 0 ? -1.15 : 1.15, out: 10.5, pitch: 0.02, mix: 0 })
    : (phase === 'final' ? posed[p.kind] : null);
  let camLat = 0.4;
  let out = 3.3;
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
  const maxStep = 8;
  for (let i = 0; i < maxStep && q.insideSolid(cx, p.ground + 1.2, cz, 0.3); i++) {
    cx += nx * step;
    cz += nz * step;
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
      const slide = sign * 1.35;
      cx += bx * slide + nx * 0.5;
      cz += bz * slide + nz * 0.5;
    }
  }

  const fieldKind = p.kind === 'screen-wall' || p.kind === 'flue-bank' || p.kind === 'shelf-row' || p.kind === 'flare-bed' || p.kind === 'holo-shaft';
  let framed = !fieldKind;
  if (fieldKind && phase === 'final') {
    // Fly climbs 10 m at a time when the pose is inside a solid. Stand where the
    // door and the figure both sit in the frame, and where that climb will not run.
    const fovY = (60 * Math.PI) / 180;
    const tanY = Math.tan(fovY / 2);
    const tanX = tanY * (innerWidth / Math.max(1, innerHeight));
    const project = (cam, look, point) => {
      const fx = look[0] - cam[0];
      const fy = look[1] - cam[1];
      const fz = look[2] - cam[2];
      const fl = Math.hypot(fx, fy, fz) || 1;
      const f = [fx / fl, fy / fl, fz / fl];
      const vx = point[0] - cam[0];
      const vy = point[1] - cam[1];
      const vz = point[2] - cam[2];
      const z = vx * f[0] + vy * f[1] + vz * f[2];
      if (z < 0.4) return null;
      const rx = -f[2];
      const rz = f[0];
      const rl = Math.hypot(rx, rz) || 1;
      const r = [rx / rl, 0, rz / rl];
      const ux = r[1] * f[2] - r[2] * f[1];
      const uy = r[2] * f[0] - r[0] * f[2];
      const uz = r[0] * f[1] - r[1] * f[0];
      return {
        x: (vx * r[0] + vy * r[1] + vz * r[2]) / z / tanX,
        y: (vx * ux + vy * uy + vz * uz) / z / tanY,
      };
    };
    const look = [p.door[0], p.ground + 1.15, p.door[1]];
    const doorPts = [];
    for (const dy of [0.25, 2.1]) {
      for (const lat of [-1.05, 1.05]) {
        doorPts.push([p.door[0] + bx * lat, p.ground + dy, p.door[1] + bz * lat]);
      }
    }
    const head = person ? [person.x, p.ground + 1.7, person.z] : null;
    const open = (x, z) => !q.insideSolid(x, p.ground + 2.45, z, 1.45) && !q.insideSolid(x, p.ground + 1.2, z, 0.6);
    const rayClear = (x, z) => {
      const y = p.ground + 1.7;
      const dx = look[0] - x;
      const dy = look[1] - y;
      const dz = look[2] - z;
      const ray = Math.hypot(dx, dy, dz) || 1;
      const steps = 7;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (ray * (1 - t) < 1.5) break;
        if (q.insideSolid(x + dx * t, y + dy * t, z + dz * t, 0.3)) return false;
      }
      return true;
    };
    let best = null;
    for (const strict of [true, false]) {
      if (best) break;
      for (const dist of [8, 10.5, 13, 17, 22]) {
        for (let k = 0; k < 24; k++) {
          const ang = Math.atan2(Math.sin(k * (Math.PI / 12)), Math.cos(k * (Math.PI / 12)));
          const dirx = nx * Math.cos(ang) + bx * Math.sin(ang);
          const dirz = nz * Math.cos(ang) + bz * Math.sin(ang);
          const x = p.door[0] + dirx * dist;
          const z = p.door[1] + dirz * dist;
          if (!open(x, z) || !rayClear(x, z)) continue;
          const cam = [x, p.ground + 2.9, z];
          let ok = true;
          const limitX = strict ? 0.5 : 0.78;
          for (const point of doorPts) {
            const n = project(cam, look, point);
            if (!n || Math.abs(n.x) > limitX || n.y < -0.82 || n.y > 0.28) { ok = false; break; }
          }
          if (!ok) continue;
          let pnx = 0;
          if (head && strict) {
            const n = project(cam, look, head);
            if (!n || Math.abs(n.x) > 0.86 || n.y < -0.9 || n.y > 0.4) continue;
            pnx = n.x;
          }
          // A screen wall's door sits on the dark plate. A small swing brings a windowed pier into the street frame.
          const prefer = p.kind === 'screen-wall' ? Math.abs(Math.abs(ang) - 0.65) : Math.abs(ang);
          const score = 2 - prefer * 0.35 - Math.abs(pnx) * 0.04 - dist * 0.01;
          if (!best || score > best.score) best = { score, x, z, dist, ang };
        }
      }
    }
    if (best) {
      cx = best.x;
      cz = best.z;
      out = best.dist;
      camLat = best.ang;
      framed = true;
    }
  }

  const mix = pose ? pose.mix : 0.3;
  const aimX = person && phase === 'final' ? p.door[0] * (1 - mix) + person.x * mix : p.door[0];
  const aimZ = person && phase === 'final' ? p.door[1] * (1 - mix) + person.z * mix : p.door[1];
  const lookX = aimX - cx;
  const lookZ = aimZ - cz;
  const heading = Math.atan2(lookX, -lookZ);
  // Positive pitch looks up in this camera. That drops the horizon and keeps feet in frame.
  const pitch = phase === 'final'
    ? (pose ? pose.pitch : (p.kind === 'flue-bank' ? 0.02 : hero ? 0.08 : 0.2))
    : 0.02;
  if (fieldKind && phase === 'final') {
    // Walk collision slides the eye into the next wall. A parked fly pose stays on the door.
    if (nla.app.cams.mode !== 'fly') nla.setMode('fly');
    const fly = nla.app.cams.fly;
    fly.cockpit = true;
    fly.vel.set(0, 0, 0);
    nla.setPose(cx, p.ground + 1.75, cz, (heading * 180) / Math.PI, (pitch * 180) / Math.PI);
    fly.vel.set(0, 0, 0);
    fly.spinner.visible = false;
  } else {
    if (nla.app.cams.mode !== 'walk') nla.setMode('walk');
    nla.setPose(cx, p.ground + 2, cz, (heading * 180) / Math.PI, (pitch * 180) / Math.PI);
    const w = nla.app.cams.walk;
    w.pos.set(cx, p.ground, cz);
    w.heading = heading;
    w.pitch = pitch;
    nla.app.cams.fly.spinner.visible = false;
  }
  const crowd = nla.app.crowd;
  const mesh = crowd?.mesh;
  if (crowd && mesh) {
    if (!crowd.__b1Orig) crowd.__b1Orig = crowd.update.bind(crowd);
    const field = p.kind === 'screen-wall' || p.kind === 'flue-bank' || p.kind === 'shelf-row' || p.kind === 'flare-bed';
    const hideKind = hero || field || p.kind === 'monolith' || p.kind === 'cantilever' || p.kind === 'band-slab' || p.kind === 'res-stack' || p.kind === 'lantern';
    if (planted && mesh.count > 0) planted.index = Math.min(planted.index, mesh.count - 1);
    const plant = () => {
      if (!planted) return;
      if (mesh.count < 1) mesh.count = 1;
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
      // A district with no sidewalk still needs one readable figure beside the door.
      const coat = mesh.geometry.getAttribute('iCoat');
      if (coat && field) {
        coat.setXYZ(i, 0.68, 0.64, 0.58);
        coat.needsUpdate = true;
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
    cx,
    cz,
    framed,
    eyeY: nla.app.cams.fly?.pos?.y ?? nla.app.cams.pose().position.y,
    doorDist: Math.hypot(cx - p.door[0], cz - p.door[1]),
    personDist: person ? Math.hypot(person.x - cx, person.z - cz) : null,
  };
}

/**
 * Frame a narrow tower so the whole mass is in the picture.
 * The kite uses a tall frame: a 16:9 crop that fits 480 m always includes the gate and the step.
 * A neighbour counts only when it is beside the kite, not when the kite hides it.
 */
function placeSubject(p) {
  const nla = window.__nla;
  const q = nla.app.query;
  const layout = q.layout;
  const kite = p.kind === 'hero-obelisk';
  const fovY = (60 * Math.PI) / 180;
  const tanY = Math.tan(fovY / 2);
  const tanX = tanY * (innerWidth / Math.max(1, innerHeight));
  const ax = p.ax;
  const az = p.az;
  const bx = p.bx;
  const bz = p.bz;
  const cx0 = p.center[0];
  const cz0 = p.center[1];
  const base = p.ground;
  const H = p.height;
  const aimY = base + H * 0.46;
  const profile = (y) => {
    if (!kite) return 1;
    const shoulder = 0.26;
    const foot = 0.34;
    const tipf = 0.045;
    const t = Math.max(0, Math.min(1, y));
    if (t <= shoulder) return foot + (1 - foot) * (t / shoulder);
    return 1 + (tipf - 1) * ((t - shoulder) / (1 - shoulder));
  };
  const mine = [];
  for (const yf of (kite ? [0.02, 0.26, 0.55, 0.98] : [0.05, 0.5, 0.96])) {
    const f = profile(yf);
    const hw = (p.w / 2) * f;
    const hd = (p.d / 2) * f;
    const y = base + H * yf;
    for (const ds of [-hd, hd]) {
      for (const dt of [-hw, hw]) {
        mine.push([cx0 + ax * ds + bx * dt, y, cz0 + az * ds + bz * dt]);
      }
    }
  }
  const others = [];
  if (kite) {
    for (const id of ['b1-gate', 'b1-step']) {
      const o = layout.landmarkById(id);
      if (!o) continue;
      const yaw = (o.bearingDeg * Math.PI) / 180;
      const oax = Math.sin(yaw);
      const oaz = -Math.cos(yaw);
      const obx = Math.cos(yaw);
      const obz = Math.sin(yaw);
      const hw = (o.baseWidth || 70) / 2;
      const hd = (o.baseDepth || 48) / 2;
      for (const y of [10, o.height * 0.4, o.height - 10]) {
        for (const ds of [-hd, hd]) {
          for (const dt of [-hw, hw]) {
            others.push([o.x + oax * ds + obx * dt, y, o.z + oaz * ds + obz * dt]);
          }
        }
      }
    }
  }
  const ndc = (cam, look, point) => {
    const fx = look[0] - cam[0];
    const fy = look[1] - cam[1];
    const fz = look[2] - cam[2];
    const fl = Math.hypot(fx, fy, fz) || 1;
    const f = [fx / fl, fy / fl, fz / fl];
    const vx = point[0] - cam[0];
    const vy = point[1] - cam[1];
    const vz = point[2] - cam[2];
    const z = vx * f[0] + vy * f[1] + vz * f[2];
    if (z < 1) return null;
    const rx = -f[2];
    const rz = f[0];
    const rl = Math.hypot(rx, rz) || 1;
    const r = [rx / rl, 0, rz / rl];
    const ux = r[1] * f[2] - r[2] * f[1];
    const uy = r[2] * f[0] - r[0] * f[2];
    const uz = r[0] * f[1] - r[1] * f[0];
    return {
      x: (vx * r[0] + vy * r[1] + vz * r[2]) / z / tanX,
      y: (vx * ux + vy * uy + vz * uz) / z / tanY,
    };
  };
  const look = [cx0, aimY, cz0];
  const dists = kite
    ? [460, 500, 540, 600, 680]
    : [Math.max(46, H * 0.9), Math.max(64, H * 1.15), Math.max(88, H * 1.45), Math.max(120, H * 1.8)];
  const yOffs = kite ? [140, 200, 260, 320] : [Math.max(16, H * 0.22), H * 0.38, H * 0.55, H * 0.72];
  const stop = Math.max(16, Math.hypot(p.w, p.d) * 0.62);
  const consider = (march) => {
    let found = null;
    for (const dist of dists) {
      for (const yOff of yOffs) {
        for (let si = -14; si <= 14; si++) {
          const swing = si * 0.18;
          const dirx = -ax * Math.cos(swing) + bx * Math.sin(swing);
          const dirz = -az * Math.cos(swing) + bz * Math.sin(swing);
          const len = Math.hypot(dirx, dirz) || 1;
          const px = cx0 + (dirx / len) * dist;
          const pz = cz0 + (dirz / len) * dist;
          const py = base + yOff;
          if (q.insideSolid(px, py, pz, march ? 6 : 3)) continue;
          if (!kite && q.insideLandmark(px, py, pz, 12)) continue;
          const cam = [px, py, pz];
          if (march) {
            const dx = cx0 - px;
            const dy = aimY - py;
            const dz = cz0 - pz;
            const ray = Math.hypot(dx, dy, dz) || 1;
            let blocked = false;
            const steps = Math.max(6, Math.min(18, Math.floor(ray / 32)));
            for (let i = 1; i < steps; i++) {
              const t = i / steps;
              if (ray * (1 - t) < stop) break;
              if (q.insideSolid(px + dx * t, py + dy * t, pz + dz * t, 1.2)) { blocked = true; break; }
            }
            if (blocked) continue;
          }
          let ok = true;
          let edge = 0;
          const seen = [];
          for (const point of mine) {
            const n = ndc(cam, look, point);
            if (!n || Math.abs(n.x) > 0.86 || Math.abs(n.y) > 0.9) { ok = false; break; }
            seen.push(n);
            edge = Math.max(edge, Math.abs(n.y), Math.abs(n.x));
          }
          if (!ok) continue;
          if (kite) {
            for (const s of others) {
              const n = ndc(cam, look, s);
              if (!n || Math.abs(n.x) >= 1.04 || Math.abs(n.y) >= 1.04) continue;
              const band = seen.filter((k) => Math.abs(k.y - n.y) < 0.14);
              const use = band.length ? band : seen;
              const left = Math.min(...use.map((k) => k.x));
              const right = Math.max(...use.map((k) => k.x));
              if (n.x < left - 0.04 || n.x > right + 0.04) { ok = false; break; }
            }
          }
          if (!ok) continue;
          const xs = seen.map((n) => n.x);
          const span = Math.max(...xs) - Math.min(...xs);
          if (span < (kite ? 0.1 : 0.16)) continue;
          // Front of a flue bank is the three shafts. A side swing collapses them.
          const prefer = p.kind === 'flue-bank'
            ? (p.shot === 'sky' ? Math.abs(Math.abs(swing) - 0.7) : Math.abs(swing))
            : p.kind === 'flare-bed'
              ? Math.abs(Math.abs(swing) - 0.36)
              : p.kind === 'shelf-row'
                ? (p.shot === 'sky' ? Math.abs(Math.abs(swing) - 0.9) : Math.abs(Math.abs(swing) - 0.36))
                : (p.shot === 'sky' ? Math.abs(Math.abs(swing) - 1.1) : 0);
          let score = edge + span * 0.35 - prefer * 0.28;
          if (!kite && H < 80) score -= Math.min(dist, 200) * 0.0025;
          if (!found || score > found.score) found = { score, px, py, pz, swing, dist, edge, march };
        }
      }
    }
    return found;
  };
  // A loaded neighbour can nick the ray after the first still. The second pass keeps the frame test.
  // A short bar in a tall frame is a small shape at the distance that clears the ray, and the
  // building behind it takes the picture. For those, a closer pose wins even if the ray nicks.
  const marched = consider(true);
  const relaxed = consider(false);
  let best = marched;
  if (relaxed && (!best || (!kite && H < 80 && relaxed.score > best.score + 0.06))) best = relaxed;
  if (!best) best = relaxed;
  if (!best || (kite && (best.edge || 0) < 0.45)) {
    if (kite) {
      const swing = 2.52;
      const dist = 460;
      const dirx = -ax * Math.cos(swing) + bx * Math.sin(swing);
      const dirz = -az * Math.cos(swing) + bz * Math.sin(swing);
      const len = Math.hypot(dirx, dirz) || 1;
      best = {
        px: cx0 + (dirx / len) * dist, py: base + 140, pz: cz0 + (dirz / len) * dist,
        dist, swing, edge: best && best.edge > 0.45 ? best.edge : 0.85, march: false,
      };
    } else {
      const dist = Math.max(80, H * 1.3);
      best = { px: cx0 - ax * dist, py: base + H * 0.42, pz: cz0 - az * dist, dist, swing: 0, edge: 0, march: false };
    }
  }
  const heading = Math.atan2(look[0] - best.px, -(look[2] - best.pz));
  const pitch = Math.atan2(look[1] - best.py, Math.hypot(look[0] - best.px, look[2] - best.pz));
  if (nla.app.cams.mode !== 'fly') nla.setMode('fly');
  nla.app.cams.fly.cockpit = true;
  nla.app.cams.fly.vel.set(0, 0, 0);
  nla.app.camera.aspect = innerWidth / Math.max(1, innerHeight);
  nla.app.camera.updateProjectionMatrix();
  nla.setPose(best.px, best.py, best.pz, (heading * 180) / Math.PI, (pitch * 180) / Math.PI);
  nla.app.cams.fly.vel.set(0, 0, 0);
  if (nla.app.cams.fly?.spinner) nla.app.cams.fly.spinner.visible = false;
  return {
    dist: best.dist,
    swing: Number(best.swing.toFixed(2)),
    y: best.py,
    edge: Number((best.edge || 0).toFixed(2)),
    aspect: Number((innerWidth / Math.max(1, innerHeight)).toFixed(3)),
    march: best.march !== false,
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

const SUBJECT = new Set(['hero-obelisk', 'flue-bank', 'shelf-row', 'flare-bed']);

async function useFrame(page, kind, view) {
  const [width, height] = view === 'street' ? [1600, 900]
    : kind === 'shelf-row' ? [900, 1500]
    : kind === 'flare-bed' ? [1280, 960]
    : kind === 'monolith' ? [520, 1400]
    : SUBJECT.has(kind) ? [400, 1680]
    : [1600, 900];
  const size = page.viewportSize();
  if (size && size.width === width && size.height === height) return;
  await page.setViewportSize({ width, height });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    const cam = window.__nla?.app?.camera;
    if (!cam) return;
    cam.aspect = innerWidth / Math.max(1, innerHeight);
    cam.updateProjectionMatrix();
  }).catch(() => {});
  await page.waitForTimeout(220);
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
      await useFrame(page, tower.kind, 'street');
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
      await page.waitForFunction(() => window.__nla.isIdle(), null, { timeout: 12_000 }).catch(() => {});
      let info = await page.evaluate(placeStreet, { tower, phase: 'final' });
      await settle(page, 350);
      // The walk controller can slide off a collider that streams in after the pose.
      const eye = await page.evaluate(() => {
        const p = window.__nla.app.cams.pose();
        return { x: p.position.x, z: p.position.z };
      });
      if (Math.hypot(eye.x - info.cx, eye.z - info.cz) > 2.5) {
        info = await page.evaluate(placeStreet, { tower, phase: 'final' });
        await settle(page, 120);
      }
      const file = `${tier}-${tower.kind}-street.png`;
      const held = await page.evaluate(() => {
        const p = window.__nla.app.cams.pose();
        return { x: p.position.x, z: p.position.z };
      });
      await shot(page, join(OUT, file));
      const st = await page.evaluate(() => window.__nla.stats());
      const eyeDist = Math.hypot(held.x - info.cx, held.z - info.cz);
      log.push({ file, ...info, eyeDist, fps: st.fps, draws: st.drawCalls, tris: st.triangles, idle: st.inFlight, crowd: st.crowd });
      console.log(file, JSON.stringify({
        person: info.person,
        doorDist: info.doorDist && Number(info.doorDist.toFixed(1)),
        personDist: info.personDist && Number(info.personDist.toFixed(1)),
        camLat: info.camLat && Number(info.camLat.toFixed(2)),
        out: info.out && Number(info.out.toFixed(2)),
        eyeDist: Number(eyeDist.toFixed(2)),
        framed: info.framed,
        eyeY: info.eyeY && Number(info.eyeY.toFixed(1)),
        occlude: info.occlude,
        crowd: st.crowd,
        draws: st.drawCalls,
        idle: st.inFlight,
      }));
    }
    if (views.includes('fly') && already(join(OUT, `${tier}-${tower.kind}-fly.png`))) {
      console.log('skip', `${tier}-${tower.kind}-fly.png`);
    } else if (views.includes('fly')) {
      await useFrame(page, tower.kind, 'fly');
      if (SUBJECT.has(tower.kind)) {
        const pose = await page.evaluate(placeSubject, { ...tower, shot: 'fly' });
        await settle(page, 2800);
        const file = `${tier}-${tower.kind}-fly.png`;
        await shot(page, join(OUT, file));
        const st = await page.evaluate(() => window.__nla.stats());
        log.push({ file, pose, fps: st.fps, draws: st.drawCalls, tris: st.triangles, idle: st.inFlight });
        console.log(file, JSON.stringify(pose), st.drawCalls, st.inFlight);
      } else {
      const fly = await page.evaluate((p) => {
        const nla = window.__nla;
        const q = nla.app.query;
        const holo = p.kind === 'holo-shaft';
        const zig = p.kind === 'ziggurat';
        const gate = p.kind === 'hero-gate';
        const cross = p.kind === 'lantern';
        // Gate normal points south, through Caldera Step. Shoot from the north.
        let face = gate ? -1 : 1;
        let y = p.ground + Math.min(160, Math.max(42, p.height * (zig ? 0.52 : 0.36)));
        let reach = Math.max(p.d, p.w) * 0.5 + Math.min(90, Math.max(56, p.height * 0.22));
        let lateral = 22;
        let aimF = 0.42;
        let ox = p.center[0];
        let oz = p.center[1];
        if (zig) {
          // A 480 m pull-back handed the frame to the neighbour shaft. Stay on a corner
          // close enough that the setbacks fill the picture.
          y = p.ground + p.height * 0.4;
          aimF = 0.5;
          const baseR = Math.max(p.d, p.w) * 0.9 + 28;
          const baseL = Math.max(p.w, p.d) * 0.85;
          const options = [
            [1, baseR, baseL],
            [1, baseR, -baseL],
            [-1, baseR * 1.05, baseL],
            [1, baseR * 1.3, baseL * 0.55],
            [-1, baseR * 1.15, -baseL * 0.65],
          ];
          reach = baseR;
          lateral = baseL;
          for (const pair of options) {
            const f = pair[0];
            const r = pair[1];
            const lat = pair[2];
            const tx = p.center[0] + p.normal[0] * r * f + p.bx * lat;
            const tz = p.center[1] + p.normal[1] * r * f + p.bz * lat;
            if (!q.insideSolid(tx, y, tz, 10) && !q.insideLandmark(tx, y, tz, 12)) {
              face = f;
              reach = r;
              lateral = lat;
              break;
            }
          }
        } else if (cross) {
          // The slit sits beside the door. Aim there, not at the footprint centre.
          // A head-on shot from the centre framed the neighbour.
          const wingW = Math.min(p.w * 0.92, 34);
          const barW = Math.min(12.5, wingW * 0.48);
          const off = barW / 2 - 0.7;
          ox = p.door[0] - p.bx * off;
          oz = p.door[1] - p.bz * off;
          // In front of the street face, on the stone belt. A wider offset
          // slid past the corner and the frame became the neighbour roof.
          const options = [
            [52, -8, 0.46, 0.5],
            [48, -8, 0.44, 0.5],
            [44, -6, 0.48, 0.52],
            [40, 0, 0.46, 0.5],
          ];
          reach = 52;
          lateral = -8;
          y = p.ground + p.height * 0.46;
          aimF = 0.5;
          for (const opt of options) {
            const r = opt[0];
            const lat = opt[1];
            const yy = p.ground + p.height * opt[2];
            const ay = p.ground + p.height * opt[3];
            const tx = ox + p.normal[0] * r * face + p.bx * lat;
            const tz = oz + p.normal[1] * r * face + p.bz * lat;
            let blocked = q.insideSolid(tx, yy, tz, 6) || q.insideLandmark(tx, yy, tz, 8);
            if (!blocked) {
              for (const side of [10, -10]) {
                if (q.insideSolid(tx + p.bx * side, yy, tz + p.bz * side, 3)) { blocked = true; break; }
              }
            }
            if (!blocked) {
              for (const u of [0.25, 0.5]) {
                const sx = tx + (ox - tx) * u;
                const sz = tz + (oz - tz) * u;
                const sy = yy + (ay - yy) * u;
                if (q.insideSolid(sx, sy, sz, 5)) { blocked = true; break; }
              }
            }
            if (!blocked) {
              reach = r;
              lateral = lat;
              y = yy;
              aimF = opt[3];
              break;
            }
          }
        } else if (p.kind === 'monolith') {
          // Crop into the street face so the slit sits in the frame and the side towers fall outside it.
          y = p.ground + p.height * 0.42;
          aimF = 0.48;
          reach = 108;
          lateral = 6;
          for (let i = 0; i < 5; i++) {
            const tx = p.center[0] + p.normal[0] * reach * face + p.bx * lateral;
            const tz = p.center[1] + p.normal[1] * reach * face + p.bz * lateral;
            if (!q.insideSolid(tx, y, tz, 8) && !q.insideLandmark(tx, y, tz, 10)) break;
            reach += 22;
            lateral = i % 2 === 0 ? -10 : 14;
          }
        } else if (holo) {
          // Corner of the shaft. A straight-on shot is a black wall; a long pull-back frames the neighbour.
          reach = Math.max(p.d, p.w) * 0.95 + 28;
          lateral = Math.max(p.w, p.d) * 0.9;
          y = p.ground + p.height * 0.42;
          aimF = 0.55;
        } else if (p.kind === 'buttress') {
          // Spinner distance: both windowed faces and the corner piers, not a wall fill.
          reach = Math.max(p.d, p.w) * 0.9 + 24;
          lateral = Math.max(p.w, p.d) * 0.98;
          y = p.ground + p.height * 0.4;
          aimF = 0.46;
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
        } else if (p.kind === 'screen-wall') {
          // High enough that the parapet and the gantry stay in the frame.
          reach = Math.max(100, p.height * 1.15);
          lateral = Math.max(p.w, p.d) * 0.42;
          y = p.ground + p.height * 0.62;
          aimF = 0.7;
        } else if (p.kind === 'flue-bank') {
          reach = Math.max(84, p.height * 1.05);
          lateral = Math.max(p.w, p.d) * 0.95;
          y = p.ground + p.height * 0.46;
          aimF = 0.52;
        } else if (p.kind === 'shelf-row' || p.kind === 'flare-bed') {
          reach = Math.max(70, p.height * 1.05);
          lateral = Math.max(p.w, p.d) * 0.8;
          y = p.ground + p.height * 0.42;
          aimF = 0.5;
        } else if (p.kind === 'hero-step') {
          reach = Math.max(100, p.height * 0.2);
          lateral = Math.max(80, Math.max(p.w, p.d) * 1.2);
          y = p.ground + p.height * 0.3;
          aimF = 0.4;
        } else if (gate) {
          // North of the gate. The step is south. Prefer a pose that is not kissing a neighbour wall.
          // Look into the slot. A large lateral reads as two separate towers.
          y = p.ground + p.height * 0.36;
          aimF = 0.46;
          reach = 230;
          lateral = 6;
          const options = [[240, 4], [220, -8], [260, 16], [200, 0], [190, -28], [170, 40]];
          for (const pair of options) {
            const r = pair[0];
            const lat = pair[1];
            const tx = p.center[0] + p.normal[0] * r * face + p.bx * lat;
            const tz = p.center[1] + p.normal[1] * r * face + p.bz * lat;
            if (!q.insideSolid(tx, y, tz, 18) && !q.insideLandmark(tx, y, tz, 20)) {
              reach = r;
              lateral = lat;
              break;
            }
          }
        }
        const nudge = p.kind === 'cantilever' || p.kind === 'band-slab' || p.kind === 'res-stack' || p.kind === 'lantern' || p.kind === 'hero-step' || p.kind === 'buttress' || p.kind === 'monolith' || p.kind === 'screen-wall' || p.kind === 'flue-bank' || p.kind === 'shelf-row' || p.kind === 'flare-bed';
        if (nudge) {
          for (let i = 0; i < 6; i++) {
            const tx = ox + p.normal[0] * reach * face + p.bx * lateral;
            const tz = oz + p.normal[1] * reach * face + p.bz * lateral;
            if (!q.insideSolid(tx, y, tz, 8) && !q.insideLandmark(tx, y, tz, 10)) break;
            lateral *= 0.7;
            reach += 14;
          }
        }
        const px = ox + p.normal[0] * reach * face + p.bx * lateral;
        const pz = oz + p.normal[1] * reach * face + p.bz * lateral;
        const ay = p.ground + p.height * aimF;
        const heading = Math.atan2(ox - px, -(oz - pz));
        const pitch = Math.atan2(ay - y, Math.hypot(ox - px, oz - pz));
        if (nla.app.cams.mode !== 'fly') nla.setMode('fly');
        nla.setPose(px, y, pz, (heading * 180) / Math.PI, (pitch * 180) / Math.PI);
        if (nla.app.cams.fly?.spinner) nla.app.cams.fly.spinner.visible = true;
        return { px, y, pz, reach, lateral, aimF };
      }, tower);
      await settle(page, 2800);
      const file = `${tier}-${tower.kind}-fly.png`;
      await shot(page, join(OUT, file));
      const st = await page.evaluate(() => window.__nla.stats());
      log.push({ file, fps: st.fps, draws: st.drawCalls, tris: st.triangles, idle: st.inFlight, pose: fly });
      console.log(file, st.drawCalls, st.inFlight, JSON.stringify(fly));
      }
    }
    if (views.includes('sky') && already(join(OUT, `${tier}-${tower.kind}-sky.png`))) {
      console.log('skip', `${tier}-${tower.kind}-sky.png`);
    } else if (views.includes('sky')) {
      if (SUBJECT.has(tower.kind)) {
        await useFrame(page, tower.kind, 'sky');
        const pose = await page.evaluate(placeSubject, { ...tower, shot: 'sky' });
        await settle(page, 2800);
        const file = `${tier}-${tower.kind}-sky.png`;
        await shot(page, join(OUT, file));
        const st = await page.evaluate(() => window.__nla.stats());
        log.push({ file, pose, fps: st.fps, draws: st.drawCalls, tris: st.triangles, idle: st.inFlight });
        console.log(file, JSON.stringify(pose), st.drawCalls, st.inFlight);
      } else {
      const sky = await page.evaluate((p) => {
        const nla = window.__nla;
        const q = nla.app.query;
        let face = 1;
        const framed = {};
        // Stay at the feature (billboard, shelf, balcony band). Step sideways
        // before climbing, so a blocked start does not become a roof shot.
        const feature = {
          'holo-shaft': [
            { dist: Math.max(p.d, p.w) * 0.95 + 28, y: p.ground + p.height * 0.42, sideM: Math.max(p.w, p.d) * 0.9, aim: 0.55 },
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
            { dist: 58, y: p.ground + p.height * 0.74, sideM: -6, aim: 0.86 },
          ],
          'hero-step': [
            { dist: Math.max(100, p.height * 0.2), y: p.ground + p.height * 0.3, sideM: Math.max(80, Math.max(p.w, p.d) * 1.2), aim: 0.4 },
          ],
          'screen-wall': [
            { dist: Math.max(100, p.height * 1.15), y: p.ground + p.height * 0.72, sideM: Math.max(p.w, p.d) * 0.35, aim: 0.86 },
          ],
          'flue-bank': [
            { dist: Math.max(84, p.height * 1.05), y: p.ground + p.height * 0.46, sideM: Math.max(p.w, p.d) * 0.95, aim: 0.52 },
          ],
          'shelf-row': [
            { dist: Math.max(70, p.height * 1.05), y: p.ground + p.height * 0.42, sideM: Math.max(p.w, p.d) * 0.8, aim: 0.5 },
          ],
          'flare-bed': [
            { dist: Math.max(78, p.height * 1.15), y: p.ground + p.height * 0.4, sideM: Math.max(p.w, p.d) * 0.7, aim: 0.46 },
          ],
          monolith: [
            { dist: Math.max(p.d, p.w) * 1.05 + 40, y: p.ground + p.height * 0.55, sideM: Math.max(p.w, p.d) * 0.38, aim: 0.58 },
          ],
          buttress: [
            // High enough that the core cage is in frame with the upper window grid.
            { dist: Math.max(p.d, p.w) * 1.15 + 36, y: p.ground + p.height * 0.74, sideM: Math.max(p.w, p.d) * 0.72, aim: 0.86 },
          ],
          'hero-gate': [
            { dist: 170, y: p.ground + p.height * 0.42, sideM: 40, aim: 0.48, face: -1 },
          ],
        };
        const tries = feature[p.kind];
        let dist;
        let y;
        let ox = p.center[0];
        let oz = p.center[1];
        let px = p.center[0];
        let pz = p.center[1];
        let aimF;
        if (tries) {
          const shot = tries[0];
          let sideM = shot.sideM;
          dist = shot.dist;
          y = shot.y;
          aimF = shot.aim;
          if (shot.face) face = shot.face;
          if (p.kind === 'lantern') {
            const wingW = Math.min(p.w * 0.92, 34);
            const barW = Math.min(12.5, wingW * 0.48);
            const off = barW / 2 - 0.7;
            ox = p.door[0] - p.bx * off;
            oz = p.door[1] - p.bz * off;
            const options = [[58, -6, 0.74, 0.86], [52, -8, 0.7, 0.84], [64, -4, 0.76, 0.9], [48, 0, 0.68, 0.82]];
            for (const opt of options) {
              const r = opt[0];
              const lat = opt[1];
              const yy = p.ground + p.height * opt[2];
              const ay = p.ground + p.height * opt[3];
              const tx = ox + p.normal[0] * r * face + p.bx * lat;
              const tz = oz + p.normal[1] * r * face + p.bz * lat;
              let blocked = q.insideSolid(tx, yy, tz, 6) || q.insideLandmark(tx, yy, tz, 8);
              if (!blocked) {
                for (const side of [10, -10]) {
                  if (q.insideSolid(tx + p.bx * side, yy, tz + p.bz * side, 3)) { blocked = true; break; }
                }
              }
              if (!blocked) {
                for (const u of [0.25, 0.5]) {
                  const sx = tx + (ox - tx) * u;
                  const sz = tz + (oz - tz) * u;
                  const sy = yy + (ay - yy) * u;
                  if (q.insideSolid(sx, sy, sz, 5)) { blocked = true; break; }
                }
              }
              if (!blocked) {
                dist = r;
                sideM = lat;
                y = yy;
                aimF = opt[3];
                break;
              }
            }
          }
          if (p.kind === 'hero-gate') {
            const options = [[170, 40], [190, 10], [160, -50], [200, -20], [150, 70], [180, -80], [210, 30]];
            for (const pair of options) {
              const r = pair[0];
              const lat = pair[1];
              const tx = p.center[0] + p.normal[0] * r * face + p.bx * lat;
              const tz = p.center[1] + p.normal[1] * r * face + p.bz * lat;
              if (!q.insideSolid(tx, y, tz, 18) && !q.insideLandmark(tx, y, tz, 20)) {
                dist = r;
                sideM = lat;
                break;
              }
            }
          }
          for (let i = 0; i < 6; i++) {
            px = ox + p.normal[0] * dist * face + p.bx * sideM;
            pz = oz + p.normal[1] * dist * face + p.bz * sideM;
            if (p.kind === 'hero-obelisk' || p.kind === 'hero-gate' || p.kind === 'holo-shaft' || p.kind === 'lantern') break;
            if (p.kind === 'monolith' || p.kind === 'ziggurat') {
              const blocked = q.insideSolid(px, y, pz, 6) || q.insideLandmark(px, y, pz, 8);
              if (!blocked) break;
              sideM += p.kind === 'hero-gate' ? 24 : 16;
              if (p.kind === 'hero-gate') dist = Math.max(140, dist - 8);
              else y += 4;
              continue;
            }
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
        const ay = p.ground + p.height * aimF;
        const heading = Math.atan2(ox - px, -(oz - pz));
        const pitch = Math.atan2(ay - y, Math.hypot(ox - px, oz - pz));
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
}

writeFileSync(join(OUT, 'log.json'), JSON.stringify({ log, errors: errors.slice(0, 12) }, null, 2));
await browser.close();
console.log('errors', errors.slice(0, 4));
