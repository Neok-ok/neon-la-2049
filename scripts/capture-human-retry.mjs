// Side views of a walker, four frames, plus the dancer and the doorway scale shot.
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const OUT = '/workspace/docs/humans/after';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ONLY = new Set((process.env.ONLY || '').split(',').filter(Boolean));
const TIER = process.env.TIER || 'both';
const SKIP_DANCER = process.env.SKIP_DANCER === '1';
const SKIP_DOOR = process.env.SKIP_DOOR === '1';
mkdirSync(OUT, { recursive: true });

const DISTRICTS = [
  ['little-tokyo-market', 'marketView', ['street', 'crowd']],
  ['historic-core', 'broadwayView', ['street']],
  ['dtla', 'dtlaView', ['street', 'walkway']],
  ['financial-megatowers', 'megaView', ['street']],
  ['k-megablock', 'kView', ['street', 'market']],
  ['hollywood', 'hollywoodView', ['street']],
  ['civic-center', 'civicView', ['steps', 'plaza']],
  ['south-la-megablocks', 'southLaView', ['street', 'market']],
  ['east-la', 'eastLaView', ['street', 'market']],
  ['long-beach', 'longBeachView', ['canyon', 'lanes']],
  ['westside', 'westsideView', ['street', 'strip']],
  ['lakewood-megablocks', 'lakewoodView', ['street', 'market']],
  ['basin-sprawl', 'basinView', ['street', 'strip']],
  ['arts-district', 'artsView', ['street', 'foundry']],
  ['southeast-industrial', 'southeastView', ['street', 'tanks', 'pipes']],
  ['south-bay-refineries', 'southBayView', ['street']],
  ['harbor', 'harborView', ['stacks', 'street']],
];

function note(msg, extra) {
  console.log(extra ? `${msg} ${JSON.stringify(extra)}` : msg);
}

function bodyStats(path, rect) {
  const py = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
x0, y0, x1, y1 = [float(v) for v in sys.argv[2:6]]
box = (max(0, int(x0 * w)), max(0, int(y0 * h)), min(w, int(x1 * w)), min(h, int(y1 * h)))
crop = im.crop(box)
px = list(crop.getdata())
if not px:
    print(json.dumps({"std": 0, "mean": 0, "span": 0, "n": 0}))
    raise SystemExit
lumas = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px]
mean = sum(lumas) / len(lumas)
var = sum((v - mean) ** 2 for v in lumas) / len(lumas)
print(json.dumps({"std": var ** 0.5, "mean": mean, "span": max(lumas) - min(lumas), "n": len(px)}))
`, path, String(rect.x0), String(rect.y0), String(rect.x1), String(rect.y1)], { encoding: 'utf8' });
  if (py.status !== 0) return { std: 0, mean: 0, span: 0, n: 0, err: py.stderr?.slice(0, 160) };
  return JSON.parse(py.stdout);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => note('pageerror', String(e).slice(0, 180)));

async function boot(quality) {
  const url = `http://127.0.0.1:5173/?mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=${quality}&webgl=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__nla && window.__nla.stats, { timeout: 90000 });
  await page.evaluate(() => {
    document.getElementById('loading')?.remove();
    const H = {};
    const app = () => window.__nla.app;
    const rain = () => app().atmosphere?.weather?.params?.rain ?? 0.8;
    function people() {
      const mesh = app().crowd.mesh;
      const arr = mesh.instanceMatrix.array;
      const out = [];
      for (let i = 0; i < mesh.count; i++) {
        const x = arr[i * 16 + 12];
        const y = arr[i * 16 + 13];
        const z = arr[i * 16 + 14];
        const s = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]);
        if (s < 0.3 || x > 1e5) continue;
        out.push({ i, x, y, z, s });
      }
      return out;
    }
    function realUpdate(dt, x, z) {
      const a = app();
      const c = a.crowd;
      const fn = c.__realUpdate || c.update.bind(c);
      fn(dt, x, z, a.query, a.quality, rain(), a.elapsed, a.cams.walk.heading);
    }
    function forgeKey(x, z) {
      const a = app();
      const c = a.crowd;
      const q = a.query;
      const district = q.district(x, z);
      const blocks = q.cachedBlocks(x, z, a.quality.crowdRadius);
      const bucket = rain() < 0.08 ? 0 : rain() < 0.35 ? 1 : rain() < 0.75 ? 2 : 3;
      const parts = String(c.loopKey || '').split(':');
      const want = parts[1] || '0';
      const seed0 = blocks[0]?.seed ?? 0;
      const seed1 = blocks.length ? blocks[blocks.length - 1].seed : 0;
      return `${district.id}:${want}:${blocks.length}:${seed0}:${seed1}:${Math.round(x / 20)}:${Math.round(z / 20)}:${bucket}`;
    }
    H.step = (dt) => {
      const a = app();
      const c = a.crowd;
      const w = a.cams.walk;
      if (c.__pin) c.loopKey = forgeKey(w.pos.x, w.pos.z);
      realUpdate(dt, w.pos.x, w.pos.z);
    };
    H.hold = () => {
      const a = app();
      const c = a.crowd;
      const w = a.cams.walk;
      const g = a.ground;
      if (!c.__realUpdate) c.__realUpdate = c.update.bind(c);
      c.update = () => {};
      if (!w.__realUpdate) w.__realUpdate = w.update.bind(w);
      w.update = () => {};
      if (g && !g.__realUpdate) g.__realUpdate = g.update.bind(g);
      if (g) g.update = () => {};
    };
    H.release = () => {
      const a = app();
      const c = a.crowd;
      c.__pin = false;
      if (c.__realUpdate) c.update = c.__realUpdate;
      if (a.cams.walk.__realUpdate) a.cams.walk.update = a.cams.walk.__realUpdate;
      if (a.ground?.__realUpdate) a.ground.update = a.ground.__realUpdate;
    };
    H.pump = () => {
      const a = app();
      const w = a.cams.walk;
      a.query.fabricAt(w.pos.x, w.pos.z);
      a.crowd.__pin = false;
      for (let i = 0; i < 12; i++) H.step(0.2);
      let n = 0;
      let nearest = 1e9;
      for (const p of people()) {
        const d = Math.hypot(p.x - w.pos.x, p.z - w.pos.z);
        if (d < 220) n++;
        if (d < nearest) nearest = d;
      }
      return { n, nearest: nearest > 1e8 ? null : Math.round(nearest * 10) / 10, count: a.crowd.count };
    };
    function ndc(x, y, z) {
      const cam = app().camera;
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      const e = cam.matrixWorldInverse.elements;
      const p = cam.projectionMatrix.elements;
      const vx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const vy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const vw = e[3] * x + e[7] * y + e[11] * z + e[15];
      const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12] * vw;
      const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13] * vw;
      const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15] * vw;
      if (!cw || vz > 0) return null;
      return { x: cx / cw, y: cy / cw };
    }
    function screenBox(head, feet) {
      const x = (head.x + feet.x) * 0.5;
      const top = Math.min(head.y, feet.y);
      const bot = Math.max(head.y, feet.y);
      const sx = x * 0.5 + 0.5;
      const sy0 = 1 - (bot * 0.5 + 0.5);
      const sy1 = 1 - (top * 0.5 + 0.5);
      const pad = 0.035;
      return {
        x0: Math.max(0, sx - pad),
        y0: Math.max(0, Math.min(sy0, sy1) - 0.01),
        x1: Math.min(1, sx + pad),
        y1: Math.min(1, Math.max(sy0, sy1) + 0.01),
      };
    }
    function clear(x, z, gy) {
      const q = app().query;
      if (q.insideSolid(x, gy + 0.4, z, 0.28, true)) return false;
      if (q.insideSolid(x, gy + 1.2, z, 0.22, true)) return false;
      return true;
    }
    function line(ax, az, bx, bz, gy) {
      const q = app().query;
      for (let t = 0.15; t <= 0.85; t += 0.14) {
        if (q.insideSolid(ax + (bx - ax) * t, gy + 1.15, az + (bz - az) * t, 0.12, true)) return false;
      }
      return true;
    }
    function apply(px, pz, gy, yaw, pitch) {
      const a = app();
      const w = a.cams.walk;
      w.pos.set(px, gy, pz);
      w.heading = yaw;
      w.pitch = pitch;
      a.camera.position.set(px, gy + 1.35, pz);
      a.camera.rotation.set(pitch, -yaw, 0, 'YXZ');
      a.camera.updateMatrixWorld();
    }
    H.movers = (reach) => {
      const anchor = app().cams.walk.pos;
      const before = people().filter((p) => Math.hypot(p.x - anchor.x, p.z - anchor.z) < reach);
      H.step(0.42);
      const after = new Map(people().map((p) => [p.i, p]));
      const moved = [];
      for (const p of before) {
        const q = after.get(p.i);
        if (!q) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < 0.28 || d > 1.3) continue;
        const dist = Math.hypot(q.x - anchor.x, q.z - anchor.z);
        moved.push({ ...q, vx: q.x - p.x, vz: q.z - p.z, travel: d, dist });
      }
      moved.sort((a, b) => a.dist - b.dist || b.travel - a.travel);
      return moved.slice(0, 10);
    };
    H.nearestTravel = (reach) => {
      const anchor = app().cams.walk.pos;
      const before = people().filter((p) => Math.hypot(p.x - anchor.x, p.z - anchor.z) < reach);
      H.step(0.42);
      const after = new Map(people().map((p) => [p.i, p]));
      let best = null;
      for (const p of before) {
        const q = after.get(p.i);
        if (!q) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        const dist = Math.hypot(q.x - anchor.x, q.z - anchor.z);
        if (!best || d > best.travel) best = { travel: Math.round(d * 100) / 100, dist: Math.round(dist), i: p.i };
      }
      return { seen: before.length, best };
    };
    H.place = (p) => {
      const q = app().query;
      const sp = Math.hypot(p.vx, p.vz) || 1;
      const fx = p.vx / sp;
      const fz = p.vz / sp;
      let best = null;
      for (const side of [1, -1]) {
        const rx = -fz * side;
        const rz = fx * side;
        for (const dist of [5.0, 4.3, 6.2]) {
          const px = p.x + rx * dist - fx * 0.35;
          const pz = p.z + rz * dist - fz * 0.35;
          const gy = q.groundHeight(px, pz);
          if (Math.abs(gy - p.y) > 1.8) continue;
          if (!clear(px, pz, gy)) continue;
          if (!line(px, pz, p.x, p.z, gy)) continue;
          const bx = p.x - rx * 5.5;
          const bz = p.z - rz * 5.5;
          let facade = 0;
          for (const h of [1.3, 3.2, 5.5]) {
            if (q.insideSolid(bx, p.y + h, bz, 0.35, true)) facade++;
          }
          const score = (facade > 0 ? 0 : 4) + Math.abs(dist - 5);
          if (!best || score < best.score) best = { px, pz, gy, score, facade, dist, fx, fz };
        }
      }
      if (!best) return { ok: false };
      const aimX = p.x + best.fx * 0.7;
      const aimZ = p.z + best.fz * 0.7;
      const aimY = p.y + 1.02 * p.s;
      const eyeY = best.gy + 1.35;
      const yaw = Math.atan2(aimX - best.px, -(aimZ - best.pz));
      const horiz = Math.hypot(aimX - best.px, aimZ - best.pz) || 1;
      const pitch = Math.atan2(aimY - eyeY, horiz);
      apply(best.px, best.pz, best.gy, yaw, pitch);
      return { ok: true, facade: best.facade, dist: Math.round(best.dist * 10) / 10, pitch: Math.round(pitch * 100) / 100 };
    };
    H.lock = (index) => {
      const a = app();
      a.crowd.__pin = true;
      const before = people().find((p) => p.i === index);
      H.step(0.42);
      const after = people().find((p) => p.i === index);
      if (!before || !after) return { ok: false, reason: 'lost' };
      const travel = Math.hypot(after.x - before.x, after.z - before.z);
      const head = ndc(after.x, after.y + 1.72 * after.s, after.z);
      const feet = ndc(after.x, after.y + 0.04, after.z);
      if (!head || !feet) return { ok: false, reason: 'offscreen', travel };
      const span = Math.abs(head.y - feet.y);
      const box = screenBox(head, feet);
      const centered = Math.abs((head.x + feet.x) * 0.5) < 0.42 && feet.y > -0.92 && head.y < 0.92;
      return {
        ok: travel >= 0.28 && travel <= 1.35 && span >= 0.36 && span <= 1.25 && centered,
        reason: 'framed',
        travel: Math.round(travel * 100) / 100,
        span: Math.round(span * 100) / 100,
        head, feet, box,
      };
    };
    function clearSpot(px, pz, gy) {
      const q = app().query;
      if (q.insideSolid(px, gy + 0.4, pz, 0.3, true)) return false;
      if (q.insideSolid(px, gy + 1.5, pz, 0.25, true)) return false;
      return true;
    }
    H.frameDancer = (id, dist) => {
      const spec = window.__nla.holoSpec(id);
      if (!spec) return { ok: false, reason: 'missing' };
      const a = app();
      const hem = spec.w > 20 ? spec.y - spec.h / 2 : spec.y - spec.h * (0.5 - 0.02);
      const nx = Math.sin(spec.yaw);
      const nz = Math.cos(spec.yaw);
      const lookY = hem + spec.h * 0.42;
      let placed = null;
      for (const side of [0, 0.18, -0.18, 0.32, -0.32]) {
        const px = spec.x + (nx * Math.cos(side) + nz * Math.sin(side)) * dist;
        const pz = spec.z + (nz * Math.cos(side) - nx * Math.sin(side)) * dist;
        const gy = a.query.groundHeight(px, pz);
        if (!clearSpot(px, pz, gy)) continue;
        let blocked = false;
        for (let t = 0.15; t <= 0.7; t += 0.1) {
          const x = px + (spec.x - px) * t;
          const y = gy + 1.7 + (lookY - (gy + 1.7)) * t;
          const z = pz + (spec.z - pz) * t;
          if (a.query.insideSolid(x, y, z, 0.3, true)) blocked = true;
        }
        if (blocked) continue;
        placed = { px, pz, gy, side };
        break;
      }
      if (!placed) return { ok: false, reason: 'blocked' };
      const eyeY = placed.gy + 1.7;
      const yaw = Math.atan2(spec.x - placed.px, -(spec.z - placed.pz));
      const horiz = Math.hypot(spec.x - placed.px, spec.z - placed.pz) || 1;
      const pitch = Math.atan2(lookY - eyeY, horiz);
      const w = a.cams.walk;
      w.pos.set(placed.px, placed.gy, placed.pz);
      w.heading = yaw;
      w.pitch = pitch;
      a.camera.position.set(placed.px, eyeY, placed.pz);
      a.camera.rotation.set(pitch, -yaw, 0, 'YXZ');
      a.camera.updateMatrixWorld();
      a.dancer.update(a.camera.position);
      H.hold();
      return { ok: true, shown: a.dancer.shown, side: placed.side, pitch: Math.round(pitch * 100) / 100 };
    };
    H.advanceDancer = () => {
      const a = app();
      a.elapsed += 0.48;
      a.atmosphere.update(0.05, a.elapsed, a.renderer, { storm: false, coastal: false, gentle: true });
      a.dancer.update(a.camera.position);
      return a.dancer.shown;
    };
    H.composeDoor = () => {
      H.hold();
      const a = app();
      const origin = a.cams.walk.pos;
      let door = null;
      a.scene.traverse((o) => {
        if (door || o.name !== 'arch-door-leaf') return;
        o.updateWorldMatrix(true, false);
        const e = o.matrixWorld.elements;
        if (Math.hypot(e[12] - origin.x, e[14] - origin.z) > 60) return;
        const gy = a.query.groundHeight(e[12], e[14]);
        if (e[13] - gy > 1.7 || e[13] < gy - 0.5) return;
        door = { x: e[12], y: e[13], z: e[14] };
      });
      if (!door) return { ok: false, reason: 'no-door' };
      const base = (5 / 8) * Math.PI * 2;
      const cam = a.camera;
      let pick = null;
      for (const dist of [8, 9, 10, 12]) {
        for (let lat = -8; lat <= 6.2; lat += 1.5) {
          const fx = Math.sin(base);
          const fz = Math.cos(base);
          const rx = Math.cos(base);
          const rz = -Math.sin(base);
          const px = door.x + fx * dist + rx * lat;
          const pz = door.z + fz * dist + rz * lat;
          const gy = a.query.groundHeight(px, pz);
          if (a.query.insideSolid(px, gy + 1.2, pz, 0.2, true)) continue;
          const eyeY = gy + 1.55;
          const yaw = Math.atan2(door.x - px, -(door.z - pz));
          const horiz = Math.hypot(door.x - px, door.z - pz) || 1;
          const pitch = Math.atan2((door.y + 1.25) - eyeY, horiz);
          cam.position.set(px, eyeY, pz);
          cam.rotation.set(pitch, -yaw, 0, 'YXZ');
          cam.updateMatrixWorld();
          const doorN = ndc(door.x, door.y + 1.1, door.z);
          if (!doorN || Math.abs(doorN.x) > 0.42 || Math.abs(doorN.y) > 0.45) continue;
          let car = null;
          a.scene.traverse((o) => {
            if (car || !o.isInstancedMesh || (o.name !== 'ground-car' && o.name !== 'ground-van')) return;
            const m = o.instanceMatrix.array;
            for (let i = 0; i < Math.min(o.count, 120); i++) {
              const x = m[i * 16 + 12];
              const y = m[i * 16 + 13];
              const z = m[i * 16 + 14];
              if (x > 1e5) continue;
              const d = Math.hypot(x - door.x, z - door.z);
              if (d < 4 || d > 22) continue;
              const n = ndc(x, y + 0.7, z);
              if (!n || Math.abs(n.x) > 0.86 || Math.abs(n.y) > 0.6) continue;
              if (Math.abs(n.x) < 0.18) continue;
              car = { name: o.name, d: Math.round(d * 10) / 10, n };
              return;
            }
          });
          if (!car) continue;
          let person = null;
          for (const p of people()) {
            const d = Math.hypot(p.x - door.x, p.z - door.z);
            if (d > 8) continue;
            const n = ndc(p.x, p.y + p.s, p.z);
            if (!n || Math.abs(n.x) > 0.78 || Math.abs(n.y) > 0.72) continue;
            if (!person || d < person.d) person = { d: Math.round(d * 10) / 10, n };
          }
          const score = Math.abs(doorN.x) + Math.abs(Math.abs(car.n.x) - 0.55) + (person ? 0 : 3);
          if (!pick || score < pick.score) {
            pick = { score, dist, lat, doorN, car, person, px, pz, gy, yaw, pitch };
          }
        }
      }
      if (!pick) {
        let cars = 0;
        a.scene.traverse((o) => {
          if (!o.isInstancedMesh || (o.name !== 'ground-car' && o.name !== 'ground-van')) return;
          const m = o.instanceMatrix.array;
          for (let i = 0; i < Math.min(o.count, 120); i++) {
            const x = m[i * 16 + 12];
            const z = m[i * 16 + 14];
            if (x > 1e5) continue;
            const d = Math.hypot(x - door.x, z - door.z);
            if (d < 30) cars++;
          }
        });
        return { ok: false, reason: 'no-pose', door, cars, people: people().length };
      }
      cam.position.set(pick.px, pick.gy + 1.55, pick.pz);
      cam.rotation.set(pick.pitch, -pick.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
      const w = a.cams.walk;
      w.pos.set(pick.px, pick.gy, pick.pz);
      w.heading = pick.yaw;
      w.pitch = pick.pitch;
      return { ok: true, dist: pick.dist, lat: pick.lat, doorN: pick.doorN, car: pick.car, person: pick.person };
    };
    window.__retry = H;
  });
}

async function frames() {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function go(fn, kind) {
  await page.evaluate(() => window.__retry.release());
  return page.evaluate(async ({ fn, kind }) => {
    const a = window.__nla.app;
    const r = window.__nla[fn](kind);
    if (r && typeof r.then === 'function') await r;
    const w = a.cams.walk;
    if (a.cams.mode !== 'walk') return { fly: true };
    a.camera.position.set(w.pos.x, w.pos.y + 1.7, w.pos.z);
    a.camera.rotation.set(w.pitch, -w.heading, 0, 'YXZ');
    a.camera.updateMatrixWorld();
    return { x: Math.round(w.pos.x), z: Math.round(w.pos.z) };
  }, { fn, kind });
}

async function shoot(id, tier) {
  const reach = 220;
  for (let attempt = 0; attempt < 6; attempt++) {
    const movers = await page.evaluate((r) => window.__retry.movers(r), reach);
    if (!movers.length) {
      const info = await page.evaluate((r) => window.__retry.nearestTravel(r), reach);
      note('no mover', { id, tier, attempt, info });
      continue;
    }
    const who = movers[attempt % movers.length];
    const placed = await page.evaluate((p) => window.__retry.place(p), who);
    if (!placed?.ok) continue;
    const locked = await page.evaluate((index) => window.__retry.lock(index), who.i);
    note('try', { id, tier, attempt, placed, locked });
    if (!locked?.ok) {
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    await page.evaluate(() => window.__retry.hold());
    await frames();
    const tmp0 = `${OUT}/.tmp-${id}-${tier}-f0.png`;
    await page.screenshot({ path: tmp0, timeout: 180000, animations: 'disabled' });
    const stats = bodyStats(tmp0, locked.box);
    note('body', { id, tier, attempt, std: Math.round((stats.std || 0) * 10) / 10, span: Math.round(stats.span || 0), mean: Math.round(stats.mean || 0) });
    if ((stats.span || 0) < 14 && attempt < 5) {
      note('flat', { id, tier, attempt });
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    renameSync(tmp0, `${OUT}/${id}-${tier}-f0.png`);
    for (let f = 1; f < 4; f++) {
      await page.evaluate(() => window.__retry.step(0.42));
      await frames();
      await page.screenshot({ path: `${OUT}/${id}-${tier}-f${f}.png`, timeout: 180000, animations: 'disabled' });
    }
    return true;
  }
  note('FAIL', { id, tier });
  return false;
}

async function district(id, fn, kinds, tier) {
  for (const kind of kinds) {
    let where;
    try { where = await go(fn, kind); } catch (err) {
      note('go fail', { id, kind, err: String(err).slice(0, 140) });
      continue;
    }
    if (where?.fly) continue;
    const settled = await page.evaluate(() => window.__retry.pump());
    note('settled', { id, kind, tier, settled });
    if (!settled.n) continue;
    await page.evaluate(() => window.__retry.hold());
    const ok = await shoot(id, tier);
    if (ok) return;
  }
  note('NO FRAME', { id, tier });
}

async function dancerStrip(name, id) {
  let framed = null;
  for (const dist of [40, 32, 50]) {
    framed = await page.evaluate(({ id, dist }) => window.__retry.frameDancer(id, dist), { id, dist });
    note('dancer frame', { name, framed });
    if (framed?.ok && framed.shown) break;
    framed = null;
  }
  if (!framed?.ok) {
    note('DANCER FAIL', { name });
    return;
  }
  await page.evaluate(() => window.__retry.hold());
  for (let f = 0; f < 4; f++) {
    if (f > 0) await page.evaluate(() => window.__retry.advanceDancer());
    await frames();
    await page.waitForTimeout(180);
    await page.screenshot({ path: `${OUT}/${name}-f${f}.png`, timeout: 180000, animations: 'disabled' });
  }
  note('dancer shot', { name });
}

async function doorShot(tier) {
  await go('broadwayView', 'bradbury');
  const settled = await page.evaluate(() => window.__retry.pump());
  note('door settled', { tier, settled });
  const found = await page.evaluate(() => window.__retry.composeDoor());
  note('door pose', { tier, found });
  if (!found?.ok) return;
  await frames();
  await page.screenshot({ path: `${OUT}/scale-door-car-${tier}.png`, timeout: 180000, animations: 'disabled' });
}

async function runTier(tier) {
  note('boot', tier);
  await boot(tier);
  for (const [id, fn, kinds] of DISTRICTS) {
    if (ONLY.size && !ONLY.has(id)) continue;
    await district(id, fn, kinds, tier);
  }
  if (!ONLY && !SKIP_DANCER) {
    await dancerStrip(`dancer-broadway-${tier}`, 'joi-bridge-dancer');
    await dancerStrip(`dancer-hollywood-${tier}`, 'hollywood-dancer');
  }
  if (!ONLY && !SKIP_DOOR) await doorShot(tier);
}

try {
  if (TIER === 'both' || TIER === 'medium') await runTier('medium');
  if (TIER === 'both' || TIER === 'ultra') await runTier('ultra');
} finally {
  await browser.close();
}
note('retry done');
