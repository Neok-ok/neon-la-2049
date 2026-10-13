// Side views of a walker, four frames, plus the dancer and the doorway scale shot.
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const OUT = '/workspace/docs/humans/after';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ONLY = new Set((process.env.ONLY || '').split(',').filter(Boolean));
const TIER = process.env.TIER || 'both';
const SKIP_DANCER = process.env.SKIP_DANCER === '1';
const SKIP_DOOR = process.env.SKIP_DOOR === '1';
const DANCER_ONLY = process.env.DANCER_ONLY === '1';
const DOOR_ONLY = process.env.DOOR_ONLY === '1';
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
  ['harbor', 'harborView', ['street', 'stacks', 'wall']],
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
  await page.evaluate((side) => { window.__side = side; }, Number(process.env.SIDE || '1.45'));
  await page.evaluate((d) => { window.__minDist = d; }, Number(process.env.MIN_DIST || '0'));
  await page.evaluate((d) => { window.__lead = d; }, Number(process.env.LEAD || '0.15'));
  await page.evaluate(async () => {
    document.getElementById('loading')?.remove();
    const sg = await import('/src/vehicles/streetGraph.ts');
    const pr = await import('/src/roads/profile.ts');
    const H = {};
    const app = () => window.__nla.app;
    function edgeHits(x, z) {
      const g = sg.streetGraph(app().query.layout);
      const found = [];
      const max2 = 28 * 28;
      sg.visitBins(x, z, 28 + 130, (key) => {
        const list = g.bins.get(key);
        if (!list) return;
        for (const idx of list) {
          const e = g.edges[idx];
          if (!e || e.kind === 'freeway') continue;
          const a = g.nodes[e.a], b = g.nodes[e.b];
          const along = (x - a.x) * e.fx + (z - a.z) * e.fz;
          if (along < -1.2 || along > e.length + 1.2) continue;
          const dx = b.x - a.x, dz = b.z - a.z;
          const L2 = dx * dx + dz * dz || 1;
          let t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
          t = Math.max(0, Math.min(1, t));
          const px = a.x + dx * t, pz = a.z + dz * t;
          const d2 = (px - x) ** 2 + (pz - z) ** 2;
          if (d2 > max2) continue;
          found.push({ edge: idx, t, dist: Math.sqrt(d2) });
        }
      });
      found.sort((p, q) => p.dist - q.dist);
      const out = [];
      const seen = new Set();
      for (const h of found) {
        if (seen.has(h.edge)) continue;
        seen.add(h.edge);
        out.push(h);
        if (out.length === 4) break;
      }
      return { g, hits: out };
    }
    function classify(x, z, yaw) {
      const { g, hits } = edgeHits(x, z);
      if (!hits.length) return null;
      const tx = Math.sin(yaw), tz = Math.cos(yaw);
      let hit = hits[0];
      let best = 1e9;
      for (const h of hits) {
        const e = g.edges[h.edge];
        const align = Math.abs(e.fx * tx + e.fz * tz);
        const score = h.dist + (1 - align) * 6;
        if (score < best) { best = score; hit = h; }
      }
      const e = g.edges[hit.edge];
      const a = g.nodes[e.a], b = g.nodes[e.b];
      const ex = a.x + (b.x - a.x) * hit.t;
      const ez = a.z + (b.z - a.z) * hit.t;
      const rx = e.fz, rz = -e.fx;
      const side = (x - ex) * rx + (z - ez) * rz;
      const absSide = Math.abs(side);
      const street = app().query.layout.districtAt(ex, ez).grid.street;
      const profile = pr.streetProfile(street, e.lane, e.kind === 'canyon' ? 'canyon' : 'street');
      const curbOuter = profile.carriageHalf + pr.CURB_W;
      const outer = curbOuter + profile.sidewalk;
      let band = 'outside';
      if (absSide <= profile.carriageHalf) band = 'road';
      else if (absSide <= curbOuter + 0.04) band = 'curb';
      else if (absSide <= outer + 0.15) band = 'walk';
      return {
        band, absSide, sign: Math.sign(side) || 1,
        curbOuter, outer, carriage: profile.carriageHalf,
        ex, ez, rx, rz, efx: e.fx, efz: e.fz,
      };
    }
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
      // A dancer pin, when one is set, has to survive hold(). Crowd shots leave it null.
      w.update = () => { window.__pinDancerCam?.(); };
      if (g && !g.__realUpdate) g.__realUpdate = g.update.bind(g);
      if (g) g.update = () => {};
    };
    H.release = () => {
      const a = app();
      const c = a.crowd;
      c.__pin = false;
      window.__pinDancerCam = null;
      window.__dancerPose = null;
      if (c.__realUpdate) c.update = c.__realUpdate;
      if (a.cams.walk.__realUpdate) a.cams.walk.update = a.cams.walk.__realUpdate;
      if (a.ground?.__realUpdate) a.ground.update = a.ground.__realUpdate;
    };
    // One quarter of the walk, coupled to travel, so the strip shows plant and lift.
    H.quarter = (index) => {
      const c = app().crowd;
      const agent = c.agents[index];
      if (!agent) return { ok: false };
      const motion = c.motionAttr && c.motionAttr.array;
      const umbrella = motion && motion[index * 4 + 2] > 0.5;
      const gait = 1.42 * (agent.height / 1.8) * (umbrella ? 1 : (agent.strideScale || 1));
      const speed = Math.max(agent.speed || agent.base || 1.3, 0.5);
      const dt = (0.25 * gait) / speed;
      const before = agent.cycle;
      H.step(Math.min(dt, 0.45));
      return {
        ok: true,
        dt: Math.round(dt * 1000) / 1000,
        before: Math.round(before * 100) / 100,
        cycle: Math.round(agent.cycle * 100) / 100,
      };
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
    H.standStreet = (districtId) => {
      const layout = app().query.layout;
      const g = sg.streetGraph(layout);
      const q = app().query;
      const cands = [];
      for (let i = 0; i < g.edges.length; i++) {
        const e = g.edges[i];
        if (!e || e.kind === 'freeway' || e.length < 28) continue;
        const a = g.nodes[e.a];
        const b = g.nodes[e.b];
        const mx = (a.x + b.x) * 0.5;
        const mz = (a.z + b.z) * 0.5;
        const here = layout.districtAt(mx, mz);
        if (!here || here.id !== districtId) continue;
        const profile = pr.streetProfile(here.grid.street, e.lane, e.kind === 'canyon' ? 'canyon' : 'street');
        if (profile.sidewalk < 1.5) continue;
        cands.push({ e, a, b, mx, mz, profile });
      }
      if (!cands.length) return { ok: false, reason: 'no-edge' };
      const step = Math.max(1, Math.floor(cands.length / 12));
      let best = null;
      for (let i = 0; i < cands.length; i += step) {
        const c = cands[i];
        q.fabricAt(c.mx, c.mz);
        const rx = c.e.fz;
        const rz = -c.e.fx;
        const lat = c.profile.carriageHalf + pr.CURB_W + Math.min(1.5, c.profile.sidewalk * 0.5);
        const gy = q.groundHeight(c.mx, c.mz);
        let wall = null;
        for (const s of [1, -1]) {
          for (const d of [2.2, 3.6, 5.5, 8, 12, 16]) {
            const x = c.mx + rx * s * (lat + d);
            const z = c.mz + rz * s * (lat + d);
            if (q.insideSolid(x, gy + 1.8, z, 0.4, true) || q.insideSolid(x, gy + 5, z, 0.4, true)) {
              wall = { s, d };
              break;
            }
          }
          if (wall) break;
        }
        if (!wall) continue;
        const score = wall.d + (c.e.kind === 'canyon' ? 0 : 1.2);
        if (!best || score < best.score) best = { score, c, rx, rz, lat, wall, gy };
      }
      if (!best) return { ok: false, reason: 'no-wall', edges: cands.length };
      const s = best.wall.s;
      const x = best.c.mx + best.rx * s * best.lat;
      const z = best.c.mz + best.rz * s * best.lat;
      const gy = q.groundHeight(x, z);
      const yaw = Math.atan2(best.c.e.fx, best.c.e.fz);
      apply(x, z, gy, yaw, 0.02);
      return { ok: true, x: Math.round(x), z: Math.round(z), wall: best.wall.d, edges: cands.length };
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
      const arr = app().crowd.mesh.instanceMatrix.array;
      for (const p of before) {
        const q = after.get(p.i);
        if (!q) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < 0.28 || d > 1.3) continue;
        const dist = Math.hypot(q.x - anchor.x, q.z - anchor.z);
        const base = q.i * 16;
        const sc = Math.hypot(arr[base], arr[base + 1], arr[base + 2]) || 1;
        const faceX = arr[base + 8] / sc;
        const faceZ = arr[base + 10] / sc;
        const dispX = (q.x - p.x) / d;
        const dispZ = (q.z - p.z) / d;
        const faceDot = dispX * faceX + dispZ * faceZ;
        const useFace = Math.abs(faceDot) > 0.65 && Math.hypot(faceX, faceZ) > 0.2;
        const fx = useFace ? faceX * Math.sign(faceDot) : dispX;
        const fz = useFace ? faceZ * Math.sign(faceDot) : dispZ;
        const style = app().crowd.mesh.geometry.getAttribute('iStyle');
        const shortCoat = style ? style.getW(q.i) : 0;
        const yaw = Math.atan2(fx, fz);
        const info = classify(q.x, q.z, yaw);
        const band = info?.band || 'none';
        moved.push({ ...q, vx: fx, vz: fz, faceDot, travel: d, dist, wall: nearestWall(q), stackGap: stackGap(q), shortCoat, band });
      }
      const bandRank = (b) => (b === 'walk' ? 0 : b === 'outside' ? 1 : b === 'none' ? 2 : 3);
      const stackRank = (g) => (g < 1.5 ? 40 + g : g < 16 ? g : 20 + g);
      moved.sort((a, b) => {
        const br = bandRank(a.band) - bandRank(b.band);
        if (br) return br;
        if (a.stackGap < 40 || b.stackGap < 40) return stackRank(a.stackGap) - stackRank(b.stackGap);
        return a.wall - b.wall || a.dist - b.dist || b.travel - a.travel;
      });
      const onWalk = (p) => p.band === 'walk' || p.band === 'outside';
      let pool = moved.filter(onWalk);
      if (window.__wantShort) {
        const shorts = moved.filter((p) => p.shortCoat > 0.5 && onWalk(p));
        const anyShort = moved.filter((p) => p.shortCoat > 0.5);
        pool = shorts.length ? shorts : (anyShort.length ? anyShort : pool);
      }
      if (!pool.length) pool = moved;
      return pool.slice(0, 16);
    };
    function stackBoxes() {
      if (H._stacks) return H._stacks;
      const out = [];
      app().scene.traverse((o) => {
        if (!o.isInstancedMesh || o.name !== 'harbor-stacks') return;
        const m = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          const b = i * 16;
          const x = m[b + 12];
          const y = m[b + 13];
          const z = m[b + 14];
          if (x > 1e5) continue;
          const sx = Math.hypot(m[b], m[b + 1], m[b + 2]);
          const sy = Math.hypot(m[b + 4], m[b + 5], m[b + 6]);
          const sz = Math.hypot(m[b + 8], m[b + 9], m[b + 10]);
          if (sy < 1 || sx < 0.2) continue;
          const longX = sx >= sz;
          const ax = longX ? m[b] / sx : m[b + 8] / sz;
          const az = longX ? m[b + 2] / sx : m[b + 10] / sz;
          out.push({ x, y, z, sx, sy, sz, ax, az });
        }
      });
      if (out.length) H._stacks = out;
      return out;
    }
    function insideStack(x, y, z) {
      for (const s of stackBoxes()) {
        const dx = x - s.x;
        const dz = z - s.z;
        const along = dx * s.ax + dz * s.az;
        const side = dx * -s.az + dz * s.ax;
        const halfL = Math.max(s.sx, s.sz) * 0.5 + 0.8;
        const halfS = Math.min(s.sx, s.sz) * 0.5 + 0.8;
        if (Math.abs(along) < halfL && Math.abs(side) < halfS && y > s.y - s.sy * 0.5 - 0.4 && y < s.y + s.sy * 0.5 + 1.5) return true;
      }
      return false;
    }
    function stackGap(p) {
      const boxes = stackBoxes();
      if (!boxes.length) return 999;
      let best = 999;
      for (const s of boxes) {
        const d = Math.hypot(s.x - p.x, s.z - p.z) - Math.max(s.sx, s.sz) * 0.5;
        if (d < best) best = d;
      }
      return best;
    }
    function stackWall(p) {
      const boxes = stackBoxes().filter((s) => Math.hypot(s.x - p.x, s.z - p.z) < 42 && s.y < p.y + 24);
      if (!boxes.length) return null;
      boxes.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      const seed = boxes[0];
      const cluster = boxes.filter((s) => Math.hypot(s.x - seed.x, s.z - seed.z) < 16);
      let cx = 0;
      let cz = 0;
      let top = 0;
      for (const s of cluster) {
        cx += s.x;
        cz += s.z;
        top = Math.max(top, s.y + s.sy * 0.5);
      }
      cx /= cluster.length;
      cz /= cluster.length;
      const wide = cluster.slice().sort((a, b) => Math.max(b.sx, b.sz) - Math.max(a.sx, a.sz))[0];
      let lx = wide.ax;
      let lz = wide.az;
      const llen = Math.hypot(lx, lz) || 1;
      lx /= llen;
      lz /= llen;
      let nx = -lz;
      let nz = lx;
      if ((p.x - cx) * nx + (p.z - cz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      return { cx, cz, nx, nz, lx, lz, top, n: cluster.length };
    }
    function nearestWall(p) {
      const q = app().query;
      let best = 40;
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        for (const dist of [1.8, 2.8, 4.2, 6.5]) {
          const x = p.x + Math.sin(ang) * dist;
          const z = p.z + Math.cos(ang) * dist;
          if (q.insideSolid(x, p.y + 1.35, z, 0.22, true) && dist < best) best = dist;
        }
      }
      return best;
    }
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
    function facadeBeyond(px, pz, ux, uz, y) {
      const q = app().query;
      for (let s = 1.5; s <= 10; s += 1.15) {
        const chest = q.insideSolid(px + ux * s, y + 1.35, pz + uz * s, 0.28, true);
        const tall = q.insideSolid(px + ux * s, y + 3.1, pz + uz * s, 0.28, true);
        if (chest) return tall ? 2 : 1;
      }
      return 0;
    }
    H.place = (p) => {
      const q = app().query;
      const sp = Math.hypot(p.vx, p.vz) || 1;
      const fx = p.vx / sp;
      const fz = p.vz / sp;
      const yaw = Math.atan2(fx, fz);
      const info = classify(p.x, p.z, yaw);
      if (info && (info.band === 'road' || info.band === 'curb')) {
        return { ok: false, reason: 'offwalk', band: info.band };
      }
      let best = null;
      const consider = (px, pz, allowRoad, loose) => {
        const gy = q.groundHeight(px, pz);
        if (Math.abs(gy - p.y) > 1.8) return;
        if (insideStack(px, gy + 1.4, pz)) return;
        if (!clear(px, pz, gy)) return;
        if (!line(px, pz, p.x, p.z, gy)) return;
        const dist = Math.hypot(px - p.x, pz - p.z);
        const minD = Math.max(2.15, window.__minDist || 0);
        const maxD = loose ? 12 : Math.max(4.4, minD + 0.8);
        if (dist < minD || dist > maxD) return;
        const ox = px - p.x, oz = pz - p.z;
        const along = Math.abs(ox * fx + oz * fz);
        const lat = Math.hypot(ox - fx * (ox * fx + oz * fz), oz - fz * (ox * fx + oz * fz));
        if (!loose && Math.abs(along) > lat * 1.15) return;
        const cam = classify(px, pz, yaw);
        const band = cam?.band || 'none';
        const deepRoad = band === 'road' && cam && cam.absSide < cam.carriage - 0.85;
        if (band === 'curb' || deepRoad) return;
        if (!allowRoad && band === 'road') return;
        if (!loose && info && info.band === 'walk' && cam && cam.band !== 'walk' && cam.absSide > info.absSide + 0.45) return;
        const ux = (p.x - px) / dist, uz = (p.z - pz) / dist;
        const facade = facadeBeyond(p.x, p.z, ux, uz, p.y);
        const onWalk = band === 'walk';
        const want = Math.max(3.15, window.__minDist || 0);
        const score = (onWalk ? 0 : 1.4) + (facade ? 0 : 2.2) + Math.abs(dist - want) + (lat < along ? 1.5 : 0);
        if (!best || score < best.score) best = { px, pz, gy, score, facade, dist, fx, fz, band };
      };
      if (info && info.band === 'walk') {
        const rx = -fz, rz = fx;
        let street = null;
        for (const s of [1, -1]) {
          const c = classify(p.x + rx * s * 1.5, p.z + rz * s * 1.5, yaw);
          if (!c) continue;
          if (!street || c.absSide < street.abs) street = { s, abs: c.absSide };
        }
        const sx = rx * (street ? street.s : 1);
        const sz = rz * (street ? street.s : 1);
        for (const lat of [1.15, 1.7, 2.2, 2.7]) {
          for (const along of [0, -0.35, 0.35, -1.6, 1.6, -2.8, 2.8]) {
            consider(p.x + sx * lat + fx * along, p.z + sz * lat + fz * along, false);
            consider(p.x - sx * lat + fx * along, p.z - sz * lat + fz * along, false);
          }
        }
      }
      if (!best) {
        for (const side of [1, -1]) {
          const rx = -fz * side;
          const rz = fx * side;
          for (const dist of [2.4, 3.0, 3.6]) {
            for (const along of [0, -0.3, 0.3]) {
              consider(p.x + rx * dist + fx * along, p.z + rz * dist + fz * along, false);
            }
          }
        }
      }
      if (!best) {
        const wall = stackWall(p);
        if (wall) {
          const saved = [];
          const relX = p.x - wall.cx;
          const relZ = p.z - wall.cz;
          const personAlong = relX * wall.lx + relZ * wall.lz;
          const personSide = relX * wall.nx + relZ * wall.nz;
          const sideSign = Math.sign(personSide) || 1;
          for (const out of [3.2, 4.4, 5.8]) {
            for (const along of [-1.6, 0.8, 2.4, -3.2]) {
              const px = wall.cx + wall.lx * (personAlong + along) + wall.nx * sideSign * out;
              const pz = wall.cz + wall.lz * (personAlong + along) + wall.nz * sideSign * out;
              const gy = q.groundHeight(px, pz);
              if (Math.abs(gy - p.y) > 1.8) continue;
              if (insideStack(px, gy + 1.4, pz)) continue;
              if (!clear(px, pz, gy) || !line(px, pz, p.x, p.z, gy)) continue;
              const dist = Math.hypot(px - p.x, pz - p.z);
              if (dist < 2.3 || dist > 10) continue;
              saved.push({ px, pz, gy, dist, facade: 2, fx, fz, band: 'stack' });
            }
          }
          for (const cand of saved) {
            const aimX = p.x + fx * 0.15;
            const aimZ = p.z + fz * 0.15;
            const aimY = p.y + 1.28 * p.s;
            const eyeY = cand.gy + 1.42;
            const aimYaw = Math.atan2(aimX - cand.px, -(aimZ - cand.pz));
            const horiz = Math.hypot(aimX - cand.px, aimZ - cand.pz) || 1;
            const pitch = Math.atan2(aimY - eyeY, horiz);
            apply(cand.px, cand.pz, cand.gy, aimYaw, pitch);
            let hits = 0;
            let y0 = 1;
            let y1 = -1;
            let xSide = 0;
            for (const s of [-6, -2, 2, 6]) {
              for (const yy of [p.y + 1.4, p.y + 6, Math.min(wall.top - 0.4, p.y + 16)]) {
                const n = ndc(wall.cx + wall.lx * (personAlong + s), yy, wall.cz + wall.lz * (personAlong + s));
                if (!n || Math.abs(n.x) > 1.05 || n.y < -0.95 || n.y > 1.05) continue;
                hits++;
                y0 = Math.min(y0, n.y);
                y1 = Math.max(y1, n.y);
                xSide += n.x;
              }
            }
            const head = ndc(p.x, p.y + 1.7 * p.s, p.z);
            const feetN = ndc(p.x, p.y + 0.06, p.z);
            const wallX = xSide / Math.max(1, hits);
            const beside = head && Math.abs(wallX - head.x) > 0.18;
            const centered = head && feetN && Math.abs(head.x) < 0.4 && Math.abs(head.y - feetN.y) > 0.4 && feetN.y > -0.95;
            if (hits >= 3 && y1 - y0 > 0.5 && centered && beside) {
              const score = Math.abs(cand.dist - 5.2) + Math.abs(Math.abs(wallX) - 0.55);
              if (!best || score < best.score) best = { ...cand, score, pitch };
            }
          }
        }
      }
      // Harbor stacks stay in the scene from every district. Only skip this
      // building-edge stand when the walker is actually beside a stack.
      if (!best && window.__loose) {
        const rx = -fz;
        const rz = fx;
        for (const dist of [5.5, 7.5, 9.5]) {
          for (const side of [1, -1]) {
            consider(p.x + rx * side * dist, p.z + rz * side * dist, true, true);
          }
        }
        for (const dist of [3.6, 5.2, 7.0, 8.8]) {
          for (let k = 0; k < 12; k++) {
            const ang = (k / 12) * Math.PI * 2;
            consider(p.x + Math.sin(ang) * dist, p.z + Math.cos(ang) * dist, true, true);
          }
        }
      }
      if (!best && !info && stackGap(p) > 30) {
        let edge = null;
        const q2 = app().query;
        for (let k = 0; k < 24; k++) {
          const ang = (k / 24) * Math.PI * 2;
          const dx = Math.sin(ang), dz = Math.cos(ang);
          const near = q2.insideSolid(p.x + dx * 2.4, p.y + 1.6, p.z + dz * 2.4, 0.35, true);
          const far = q2.insideSolid(p.x + dx * 6.5, p.y + 2.2, p.z + dz * 6.5, 0.35, true);
          if (near && !far) { edge = { dx, dz }; break; }
          if (!near && far) { edge = { dx: -dx, dz: -dz }; break; }
        }
        if (edge) {
          const sx = -edge.dz, sz = edge.dx;
          for (const lat of [-2.2, 2.2, -3.2, 3.2]) {
            for (const back of [1.4, 2.4]) {
              consider(p.x - edge.dx * back + sx * lat, p.z - edge.dz * back + sz * lat, true, true);
            }
          }
        }
      }
      if (!best) {
        for (const side of [1, -1]) {
          const rx = -fz * side;
          const rz = fx * side;
          for (const dist of [2.6, 3.2]) {
            const px = p.x + rx * dist;
            const pz = p.z + rz * dist;
            const gy = q.groundHeight(px, pz);
            if (Math.abs(gy - p.y) > 1.8) continue;
            if (!clear(px, pz, gy) || !line(px, pz, p.x, p.z, gy)) continue;
            const facade = facadeBeyond(p.x, p.z, -rx, -rz, p.y);
            if (!facade) continue;
            const d = dist;
            const score = 6 + Math.abs(d - 2.9);
            if (!best || score < best.score) best = { px, pz, gy, score, facade, dist: d, fx, fz, band: 'close' };
          }
        }
      }
      if (!best) return { ok: false, reason: 'no-stand', band: info?.band || 'none', stacks: stackBoxes().length, gap: Math.round(stackGap(p)) };
      const aimLead = window.__lead || 0.15;
      const aimX = p.x + best.fx * aimLead;
      const aimZ = p.z + best.fz * aimLead;
      const aimY = p.y + 1.28 * p.s;
      const eyeY = best.gy + 1.42;
      const aimYaw = Math.atan2(aimX - best.px, -(aimZ - best.pz));
      const horiz = Math.hypot(aimX - best.px, aimZ - best.pz) || 1;
      const pitch = Math.atan2(aimY - eyeY, horiz);
      apply(best.px, best.pz, best.gy, aimYaw, pitch);
      return {
        ok: true,
        facade: best.facade,
        dist: Math.round(best.dist * 10) / 10,
        pitch: Math.round(pitch * 100) / 100,
        band: best.band,
        feet: info?.band || 'none',
        face: Math.round((p.faceDot || 0) * 100) / 100,
      };
    };
    H.ahead = (who) => {
      const p = people().find((q) => q.i === who.i);
      if (!p || (who.vx == null && who.vz == null)) return { ok: false, reason: 'lost' };
      const step = (who.travel || 0.6) * 3;
      const spots = [
        [p.x, p.y + 1.72 * p.s, p.z],
        [p.x + who.vx * step, p.y + 1.72 * p.s, p.z + who.vz * step],
        [p.x + who.vx * step, p.y + 0.04, p.z + who.vz * step],
      ];
      for (const [x, y, z] of spots) {
        const n = ndc(x, y, z);
        if (!n || Math.abs(n.x) > 1.05 || n.y < -0.92 || n.y > 0.92) {
          return { ok: false, reason: 'leaves', x: n ? Math.round(n.x * 100) / 100 : null, y: n ? Math.round(n.y * 100) / 100 : null };
        }
      }
      return { ok: true };
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
      const centered = Math.abs((head.x + feet.x) * 0.5) < 0.34 && feet.y > -0.95 && head.y < 0.92;
      const cam = a.camera;
      const ce = cam.matrixWorld.elements;
      const vx = after.x - before.x;
      const vz = after.z - before.z;
      const across = Math.abs(vx * ce[0] + vz * ce[2]);
      const depth = Math.abs(vx * -ce[8] + vz * -ce[10]);
      const headMax = window.__headMax || 0.92;
      const profile = across > depth * (window.__side || 1.45);
      const hatRoom = head.y < headMax;
      return {
        ok: travel >= 0.28 && travel <= 1.35 && span >= 0.5 && span <= 1.35 && centered && profile && hatRoom,
        reason: 'framed',
        travel: Math.round(travel * 100) / 100,
        span: Math.round(span * 100) / 100,
        across: Math.round(across * 100) / 100,
        depth: Math.round(depth * 100) / 100,
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
      // The figure is 68 m. Aiming at 0.66 of that height from 40 m cuts the
      // legs off and leaves a vertical smear. 0.40 from farther back keeps
      // hem and crown inside a 60° view, and stays inside the 100 m mesh handoff.
      const lookY = hem + spec.h * 0.40;
      let placed = null;
      let lastFit = null;
      for (const side of [0, Math.PI, 1.15, -1.15, 2.0, -2.0, 0.55, -0.55]) {
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
        const eyeY = gy + 1.7;
        const yaw = Math.atan2(spec.x - px, -(spec.z - pz));
        const horiz = Math.hypot(spec.x - px, spec.z - pz) || 1;
        const pitch = Math.atan2(lookY - eyeY, horiz);
        const w = a.cams.walk;
        w.pos.set(px, gy, pz);
        w.heading = yaw;
        w.pitch = pitch;
        a.camera.position.set(px, eyeY, pz);
        a.camera.rotation.set(pitch, -yaw, 0, 'YXZ');
        a.camera.updateMatrixWorld();
        const hemN = ndc(spec.x, hem + 0.6, spec.z);
        const crownN = ndc(spec.x, hem + spec.h * 0.86, spec.z);
        const span = hemN && crownN ? crownN.y - hemN.y : 0;
        lastFit = {
          side,
          pitch: Math.round(pitch * 100) / 100,
          span: Math.round(span * 100) / 100,
          hem: hemN ? Math.round(hemN.y * 100) / 100 : null,
          crown: crownN ? Math.round(crownN.y * 100) / 100 : null,
        };
        const fits = hemN && crownN
          && hemN.y > -0.88 && crownN.y < 0.9
          && Math.abs(hemN.x) < 0.55 && Math.abs(crownN.x) < 0.55
          && span > 0.9 && span < 1.7;
        if (!fits) continue;
        placed = { px, pz, gy, eyeY, yaw, pitch, side };
        break;
      }
      if (!placed) return { ok: false, reason: 'fit', lastFit };
      // An interior ride in the app frame teleports the walk camera into a
      // building between the evaluate and the screenshot, and the hero hides.
      if (a.interiors && !a.interiors.__noRide) {
        a.interiors.__noRide = true;
        a.interiors.consumeRide = () => null;
      }
      window.__dancerPose = {
        x: placed.px, y: placed.eyeY, z: placed.pz, yaw: placed.yaw, pitch: placed.pitch,
      };
      const pin = () => {
        const pose = window.__dancerPose;
        if (!pose) return;
        a.cams.walk.pos.set(pose.x, pose.y - 1.7, pose.z);
        a.cams.walk.heading = pose.yaw;
        a.cams.walk.pitch = pose.pitch;
        a.camera.position.set(pose.x, pose.y, pose.z);
        a.camera.rotation.set(pose.pitch, -pose.yaw, 0, 'YXZ');
        a.camera.updateMatrixWorld();
      };
      window.__pinDancerCam = pin;
      pin();
      a.dancer.update(a.camera.position);
      H.hold();
      window.__pinDancerCam?.();
      const witness = parkWitness(spec, hem, placed.px, placed.pz);
      return {
        ok: true,
        shown: a.dancer.shown,
        side: placed.side,
        pitch: Math.round(placed.pitch * 100) / 100,
        witness,
      };
    };
    function parkWitness(spec, hem, px, pz) {
      const c = app().crowd;
      const agent = c.agents && c.agents[0];
      const mesh = c.mesh;
      if (!agent || !mesh || !c.motionAttr) return null;
      const dx = px - spec.x;
      const dz = pz - spec.z;
      const len = Math.hypot(dx, dz) || 1;
      const x = spec.x + (dx / len) * 3.4;
      const z = spec.z + (dz / len) * 3.4;
      const gy = app().query.groundHeight(x, z);
      const yaw = Math.atan2(px - x, pz - z);
      const sc = agent.height / 1.8;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const arr = mesh.instanceMatrix.array;
      arr[0] = cos * sc; arr[1] = 0; arr[2] = -sin * sc; arr[3] = 0;
      arr[4] = 0; arr[5] = sc; arr[6] = 0; arr[7] = 0;
      arr[8] = sin * sc; arr[9] = 0; arr[10] = cos * sc; arr[11] = 0;
      arr[12] = x; arr[13] = gy; arr[14] = z; arr[15] = 1;
      if (mesh.count < 1) mesh.count = 1;
      mesh.instanceMatrix.needsUpdate = true;
      const motion = c.motionAttr.array;
      motion[0] = 0.25; motion[1] = 1; motion[2] = 0; motion[3] = 0;
      c.motionAttr.needsUpdate = true;
      if (c.extraAttr) {
        c.extraAttr.array[3] = 1;
        c.extraAttr.needsUpdate = true;
      }
      agent.x = x; agent.z = z; agent.yaw = yaw; agent.cycle = 0.25;
      return { x: Math.round(x), z: Math.round(z), y: Math.round(gy * 10) / 10, hem: Math.round(hem) };
    }
    const DANCER_PERIOD = 6.28318530718 / 1.2;
    function lockDancerTime(phase) {
      const a = app();
      if (!a.atmosphere.__dancerLock) {
        const orig = a.atmosphere.update.bind(a.atmosphere);
        a.atmosphere.update = (dt, elapsed, renderer, opts) => orig(dt, a.__dancerTime ?? elapsed, renderer, opts);
        a.atmosphere.__dancerLock = true;
      }
      a.__dancerTime = phase * DANCER_PERIOD;
      a.elapsed = a.__dancerTime;
      if (window.__pinDancerCam) window.__pinDancerCam();
      a.atmosphere.update(0.05, a.__dancerTime, a.renderer, { storm: false, coastal: false, gentle: true });
      if (window.__pinDancerCam) window.__pinDancerCam();
      a.dancer.update(a.camera.position);
      return { shown: a.dancer.shown, phase, time: a.__dancerTime };
    }
    H.primeDancer = () => {
      // Sine sway repeats at 0 and 0.5, so quarter steps show the same pose twice.
      app().__dancerPhase = 0.02;
      return lockDancerTime(0.02);
    };
    H.advanceDancer = () => {
      const a = app();
      const phase = ((a.__dancerPhase ?? 0.02) + 0.22) % 1;
      a.__dancerPhase = phase;
      return lockDancerTime(phase);
    };
    H.swapSide = (p) => {
      const cam = app().camera.position;
      const px = p.x * 2 - cam.x;
      const pz = p.z * 2 - cam.z;
      const q = app().query;
      const gy = q.groundHeight(px, pz);
      if (Math.abs(gy - p.y) > 1.8) return { ok: false, reason: 'height' };
      if (!clear(px, pz, gy) || !line(px, pz, p.x, p.z, gy)) return { ok: false, reason: 'blocked' };
      const dist = Math.hypot(p.x - px, p.z - pz) || 1;
      const yaw = Math.atan2(p.x + (p.vx || 0) * (window.__lead || 0.15) - px, -((p.z + (p.vz || 0) * (window.__lead || 0.15)) - pz));
      const pitch = Math.atan2((p.y + 1.28 * p.s) - (gy + 1.42), dist);
      apply(px, pz, gy, yaw, pitch);
      return { ok: true, dist: Math.round(dist * 10) / 10 };
    };
    H.front = (index) => {
      const cam = app().camera.position;
      const me = people().find((p) => p.i === index);
      if (!me) return { ok: false, closer: 9 };
      const myD = Math.hypot(me.x - cam.x, me.z - cam.z);
      let closer = 0;
      for (const p of people()) {
        if (p.i === index) continue;
        const d = Math.hypot(p.x - cam.x, p.z - cam.z);
        if (d > myD - 0.35) continue;
        const n = ndc(p.x, p.y + p.s, p.z);
        if (n && Math.abs(n.x) < 0.62 && n.y > -0.85 && n.y < 0.9) closer++;
      }
      return { ok: closer === 0, closer, myD: Math.round(myD * 10) / 10 };
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
        // Same orbit, but accept a doorway with a person and park a car into the lane.
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
            let person = null;
            for (const p of people()) {
              const d = Math.hypot(p.x - door.x, p.z - door.z);
              if (d > 8) continue;
              const n = ndc(p.x, p.y + p.s, p.z);
              if (!n || Math.abs(n.x) > 0.78 || Math.abs(n.y) > 0.72) continue;
              if (!person || d < person.d) person = { d: Math.round(d * 10) / 10, n };
            }
            if (!person) continue;
            pick = { score: 9, dist, lat, doorN, car: null, person, px, pz, gy, yaw, pitch, fx, fz, rx, rz };
            break;
          }
          if (pick) break;
        }
      }
      if (!pick) return { ok: false, reason: 'no-pose', door, people: people().length };
      cam.position.set(pick.px, pick.gy + 1.55, pick.pz);
      cam.rotation.set(pick.pitch, -pick.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
      const w = a.cams.walk;
      w.pos.set(pick.px, pick.gy, pick.pz);
      w.heading = pick.yaw;
      w.pitch = pick.pitch;
      if (a.interiors && !a.interiors.__noRide) {
        a.interiors.__noRide = true;
        a.interiors.consumeRide = () => null;
      }
      window.__dancerPose = {
        x: pick.px, y: pick.gy + 1.55, z: pick.pz, yaw: pick.yaw, pitch: pick.pitch,
      };
      window.__pinDancerCam = () => {
        const pose = window.__dancerPose;
        if (!pose) return;
        a.cams.walk.pos.set(pose.x, pose.y - 1.55, pose.z);
        a.cams.walk.heading = pose.yaw;
        a.cams.walk.pitch = pose.pitch;
        a.camera.position.set(pose.x, pose.y, pose.z);
        a.camera.rotation.set(pose.pitch, -pose.yaw, 0, 'YXZ');
        a.camera.updateMatrixWorld();
      };
      window.__pinDancerCam();
      // A found car can sit past the frame. Always plant one in the lane, in view,
      // and stamp it after traffic rewrites instance matrices.
      a.camera.updateMatrixWorld();
      const ce = a.camera.matrixWorld.elements;
      // Camera looks down its −Z. Flatten so the car sits on the street, not in the pitch.
      let fx = -ce[8];
      let fz = -ce[10];
      let fl = Math.hypot(fx, fz) || 1;
      fx /= fl; fz /= fl;
      let rx = ce[0];
      let rz = ce[2];
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl; rz /= rl;
      // Model forward is local −Z (same as GroundTraffic). Try both axes and
      // keep the pose whose length actually spans the screen.
      const pos = a.camera.position.clone();
      const aim = a.camera.position.clone();
      const back = a.camera.position.clone().set(0, 0, -1);
      const scl = a.camera.position.clone().set(1, 1, 1);
      const quat = a.camera.quaternion.clone();
      const mat = a.camera.matrixWorld.clone();
      const projectCar = () => {
        let minx = 9, maxx = -9, miny = 9, maxy = -9, seen = 0;
        for (const x of [-0.89, 0.89]) {
          for (const y of [0.05, 1.42]) {
            for (const z of [-2.4, 2.4]) {
              const wx = mat.elements[0] * x + mat.elements[4] * y + mat.elements[8] * z + mat.elements[12];
              const wy = mat.elements[1] * x + mat.elements[5] * y + mat.elements[9] * z + mat.elements[13];
              const wz = mat.elements[2] * x + mat.elements[6] * y + mat.elements[10] * z + mat.elements[14];
              const n = ndc(wx, wy, wz);
              if (!n) continue;
              seen++;
              minx = Math.min(minx, n.x); maxx = Math.max(maxx, n.x);
              miny = Math.min(miny, n.y); maxy = Math.max(maxy, n.y);
            }
          }
        }
        return { seen, minx, maxx, miny, maxy, w: maxx - minx, h: maxy - miny };
      };
      const poseAt = (x, y, z, dirx, dirz) => {
        aim.set(dirx, 0, dirz);
        if (aim.lengthSq() < 1e-8) return null;
        aim.normalize();
        quat.setFromUnitVectors(back, aim);
        pos.set(x, y, z);
        mat.compose(pos, quat, scl);
        return projectCar();
      };
      let spot = null;
      const rejected = [];
      const px = pick.person?.n?.x;
      const accept = (box) => {
        if (!box || box.seen < 8) return false;
        const onScreen = box.minx > -0.8 && box.maxx < 0.86 && box.miny > -0.82 && box.maxy < 0.48;
        const sideOn = box.w > 0.22 && box.w < 0.72 && box.w > box.h * 1.45;
        const personIn = px == null || (px > -0.7 && px < 0.7);
        const personClear = px == null || px < box.minx - 0.1 || px > box.maxx + 0.1;
        return onScreen && sideOn && personIn && personClear;
      };
      for (const ahead of [12, 14, 10, 16, 8, 18]) {
        for (const side of [6.5, -6.5, 8, -8, 4.5, 10]) {
          for (const shift of [0, 2.4, -2.4, 4.2]) {
            const x = pick.px + fx * ahead + rx * (side + shift);
            const z = pick.pz + fz * ahead + rz * (side + shift);
            const gy = a.query.groundHeight(x, z);
            if (a.query.insideSolid(x, gy + 1.2, z, 0.45, true)) {
              if (rejected.length < 4) rejected.push('solid');
              continue;
            }
            const y = gy + 0.02;
            const across = poseAt(x, y, z, rx, rz);
            const along = poseAt(x, y, z, fx, fz);
            const candidates = [
              across && { box: across, dx: rx, dz: rz },
              along && { box: along, dx: fx, dz: fz },
            ].filter((c) => c && accept(c.box));
            candidates.sort((a, b) => b.box.w - a.box.w);
            const best = candidates[0];
            if (!best) {
              const box = across && across.w >= (along?.w || 0) ? across : along;
              if (rejected.length < 4 && box) rejected.push(`box ${box.w.toFixed(2)}x${box.h.toFixed(2)} p ${px == null ? 'none' : px.toFixed(2)}`);
              continue;
            }
            spot = { x, y, z, ahead, side: side + shift, box: best.box, dx: best.dx, dz: best.dz };
            poseAt(x, y, z, best.dx, best.dz);
            break;
          }
          if (spot) break;
        }
        if (spot) break;
      }
      const stamp = () => {
        if (!spot) return { ok: false, rejected };
        let mesh = null;
        a.scene.traverse((o) => {
          if (!mesh && o.isInstancedMesh && o.name === 'ground-car') mesh = o;
        });
        if (!mesh) return { ok: false, rejected, mesh: 'missing' };
        // The instanced draw stays a black slab in this shot. Park a real mesh
        // on the same geometry, with the body lifted off the wet-road black,
        // so the side, cabin and lamps read next to the pedestrian.
        let proof = mesh.userData.doorProof;
        if (!proof || proof.userData.srcGeo !== mesh.geometry) {
          if (proof) {
            a.scene.remove(proof);
            proof.geometry.dispose();
          }
          const geo = mesh.geometry.clone();
          geo.computeBoundingBox();
          const color = geo.getAttribute('color');
          const emit = geo.getAttribute('emit');
          if (color && emit) {
            for (let i = 0; i < color.count; i++) {
              if (emit.getX(i) < 0.5) color.setXYZ(i, 0.55, 0.58, 0.62);
            }
            color.needsUpdate = true;
          }
          let sample = null;
          a.scene.traverse((o) => {
            if (!sample && o.isMesh && !o.isInstancedMesh) sample = o;
          });
          if (!sample) return { ok: false, rejected, mesh: 'no-sample' };
          proof = new sample.constructor(geo, mesh.material);
          proof.name = 'door-car-proof';
          proof.frustumCulled = false;
          proof.userData.srcGeo = mesh.geometry;
          a.scene.add(proof);
          mesh.userData.doorProof = proof;
        }
        proof.position.copy(pos);
        proof.quaternion.copy(quat);
        proof.scale.set(1, 1, 1);
        proof.updateMatrix();
        proof.visible = true;
        // Live traffic would stack a second car on this frame. The proof mesh is the one in shot.
        a.scene.traverse((o) => {
          if (!o.isInstancedMesh) return;
          if (o.name === 'traffic-pools' || (o.name && o.name.startsWith('ground-'))) {
            o.count = 0;
            o.visible = false;
          }
        });
        const bb = proof.geometry.boundingBox;
        const ext = bb.getSize(a.camera.position.clone());
        return {
          ok: true, name: mesh.name, x: Math.round(spot.x), z: Math.round(spot.z),
          ahead: spot.ahead, side: spot.side,
          geo: ext.toArray().map((v) => Math.round(v * 100) / 100),
          box: {
            w: Math.round(spot.box.w * 1000) / 1000,
            h: Math.round(spot.box.h * 1000) / 1000,
            minx: Math.round(spot.box.minx * 1000) / 1000,
            maxx: Math.round(spot.box.maxx * 1000) / 1000,
            miny: Math.round(spot.box.miny * 1000) / 1000,
            maxy: Math.round(spot.box.maxy * 1000) / 1000,
          },
        };
      };
      if (!a.ground.__doorStamp) {
        const orig = a.ground.update.bind(a.ground);
        a.ground.update = function (...args) {
          const out = orig(...args);
          stamp();
          return out;
        };
        a.ground.__doorStamp = true;
      }
      const parked = stamp();
      if (parked?.ok) pick.car = { name: parked.name, parked: true, x: parked.x, z: parked.z, n: parked.n };
      return { ok: true, dist: pick.dist, lat: pick.lat, doorN: pick.doorN, car: pick.car, person: pick.person, parked };
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

async function shoot(id, tier, allowOpen) {
  const reach = 220;
  const attempts = Number(process.env.ATTEMPTS || '8');
  await page.evaluate(({ want, loose, headMax, side }) => {
    window.__wantShort = want;
    window.__loose = loose;
    window.__headMax = headMax;
    if (side) window.__sideBase = side;
    window.__side = window.__sideBase || 1.45;
  }, {
    want: process.env.WANT_SHORT === '1',
    loose: process.env.LOOSE === '1',
    headMax: Number(process.env.HEAD_MAX || '0.92'),
    side: process.env.SIDE ? Number(process.env.SIDE) : 0,
  });
  for (let attempt = 0; attempt < attempts; attempt++) {
    const movers = await page.evaluate((r) => window.__retry.movers(r), reach);
    if (!movers.length) {
      const info = await page.evaluate((r) => window.__retry.nearestTravel(r), reach);
      note('no mover', { id, tier, attempt, info });
      continue;
    }
    const who = movers[attempt % movers.length];
    const placed = await page.evaluate((p) => window.__retry.place(p), who);
    if (!placed?.ok) {
      note('no place', { id, tier, attempt, reason: placed?.reason, band: placed?.band, stacks: placed?.stacks, gap: placed?.gap });
      continue;
    }
    const locked = await page.evaluate(({ index, attempt }) => {
      // A pure profile is the walk the critics can read. Later tries accept a
      // three-quarter so a curved sidewalk still yields a frame.
      window.__side = attempt >= 3 ? 1.05 : (window.__sideBase || 1.45);
      return window.__retry.lock(index);
    }, { index: who.i, attempt });
    const ahead = await page.evaluate((who) => window.__retry.ahead(who), who);
    note('try', { id, tier, attempt, placed, locked, ahead });
    if (ahead && ahead.ok === false) {
      note('leaves', { id, tier, attempt, ahead });
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    if (process.env.FOREGROUND === '1') {
      const front = await page.evaluate((index) => window.__retry.front(index), who.i);
      if (!front?.ok) {
        const swapped = await page.evaluate((who) => window.__retry.swapSide(who), who);
        const again = swapped?.ok ? await page.evaluate((index) => window.__retry.front(index), who.i) : front;
        if (!again?.ok) {
          note('behind', { id, tier, attempt, front, swapped });
          await page.evaluate(() => window.__retry.release());
          continue;
        }
        note('swapped', { id, tier, attempt, swapped, again });
      }
    }
    const onWalk = placed.band === 'walk' || placed.band === 'outside';
    if (!locked?.ok || (!placed.facade && !allowOpen && !onWalk)) {
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    await page.evaluate(() => window.__retry.hold());
    await frames();
    const tmp0 = `${OUT}/.tmp-${id}-${tier}-f0.png`;
    await page.screenshot({ path: tmp0, timeout: 180000, animations: 'disabled' });
    const stats = bodyStats(tmp0, locked.box);
    const legBox = {
      x0: locked.box.x0,
      x1: locked.box.x1,
      y0: locked.box.y0 + (locked.box.y1 - locked.box.y0) * 0.55,
      y1: locked.box.y1,
    };
    const legs = bodyStats(tmp0, legBox);
    note('body', { id, tier, attempt, std: Math.round((stats.std || 0) * 10) / 10, span: Math.round(stats.span || 0), mean: Math.round(stats.mean || 0), legs: Math.round(legs.span || 0) });
    // A person projected through a facade still fills the lock box with one
    // flat wall. Rain streaks keep the luma span high, so the flat test misses it.
    if ((stats.std || 0) < 22 && (stats.mean || 0) > 55 && attempt < 6) {
      note('wall', { id, tier, attempt });
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    if (((stats.span || 0) < 14 || (legs.span || 0) < 18) && attempt < 6) {
      note('flat', { id, tier, attempt });
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    const paint = bodyStats(tmp0, {
      x0: Math.max(0, locked.box.x0 - 0.04),
      x1: Math.min(1, locked.box.x1 + 0.04),
      y0: locked.box.y0 + (locked.box.y1 - locked.box.y0) * 0.72,
      y1: Math.min(1, locked.box.y1 + 0.04),
    });
    const above = bodyStats(tmp0, {
      x0: Math.max(0, locked.box.x0 - 0.08),
      x1: Math.min(1, locked.box.x1 + 0.08),
      y0: Math.max(0, locked.box.y0 - 0.22),
      y1: Math.max(0.02, locked.box.y0 - 0.02),
    });
    const py = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
x0, y0, x1, y1 = [float(v) for v in sys.argv[2:6]]
box = (max(0, int(x0*w)), max(0, int(y0*h)), min(w, int(x1*w)), min(h, int(y1*h)))
crop = im.crop(box)
cw, ch = crop.size
px = crop.load()
def thin_rows(test):
    rows = 0
    for y in range(ch):
        xs = [x for x in range(cw) if test(*px[x, y])]
        if len(xs) < 6:
            continue
        span = xs[-1] - xs[0] + 1
        if span > cw * 0.62 and len(xs) < span * 0.45:
            rows += 1
    return rows
yellow = thin_rows(lambda r, g, b: r > 155 and g > 125 and b < 95 and r > b + 40)
white = thin_rows(lambda r, g, b: r > 200 and g > 200 and b > 185)
print(json.dumps({"yellow": yellow, "white": white, "lit": 0, "n": cw * ch}))
`, tmp0,
      String(Math.max(0, locked.box.x0 - 0.2)),
      String(locked.box.y0 + (locked.box.y1 - locked.box.y0) * 0.45),
      String(Math.min(1, locked.box.x1 + 0.2)),
      String(Math.min(1, locked.box.y1 + 0.03)),
    ], { encoding: 'utf8' });
    let marks = { yellow: 0, white: 0, lit: 0 };
    if (py.status === 0) marks = JSON.parse(py.stdout);
    const litBox = bodyStats(tmp0, { x0: 0.02, x1: 0.98, y0: 0.04, y1: 0.46 });
    note('ground', {
      id, tier, attempt, feet: placed.feet, cam: placed.band,
      yellow: marks.yellow, white: marks.white, lit: marks.lit,
      above: Math.round(above.mean || 0), near: Math.round(litBox.mean || 0),
    });
    if ((marks.yellow > 0 || marks.white > 0) && attempt < 6) {
      note('lanes', { id, tier, attempt });
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    if (process.env.NO_LANE === '1') {
      const wide = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
y0 = int(h * 0.55)
rows = 0
px = im.load()
for y in range(y0, h, 2):
    xs = [x for x in range(0, w, 2) if (px[x, y][0] > 200 and px[x, y][1] > 200 and px[x, y][2] > 185) or (px[x, y][0] > 160 and px[x, y][1] > 130 and px[x, y][2] < 90 and px[x, y][0] > px[x, y][2] + 40)]
    if len(xs) < 8:
        continue
    span = xs[-1] - xs[0]
    if span > w * 0.28 and len(xs) < span * 0.25:
        rows += 1
print(json.dumps({"rows": rows}))
`, tmp0], { encoding: 'utf8' });
      const rows = wide.status === 0 ? JSON.parse(wide.stdout).rows : 0;
      if (rows > 0) {
        note('lanes-wide', { id, tier, attempt, rows });
        await page.evaluate(() => window.__retry.release());
        continue;
      }
    }
    if (process.env.WANT_WALL === '1') {
      const wall = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
px = im.load()
def side(x0, x1):
    s = n = 0
    for y in range(int(h * 0.08), int(h * 0.58), 4):
        for x in range(x0, x1, 6):
            r, g, b = px[x, y]
            s += (r + g + b) / 3.0
            n += 1
    return s / max(1, n)
left, right = side(0, int(w * 0.28)), side(int(w * 0.72), w)
print(json.dumps({"diff": round(abs(left - right), 2), "left": round(left, 1), "right": round(right, 1)}))
`, tmp0], { encoding: 'utf8' });
      const diff = wall.status === 0 ? JSON.parse(wall.stdout).diff : 0;
      if (diff < 8) {
        note('no-wall', { id, tier, attempt, diff, detail: wall.stdout.trim() });
        await page.evaluate(() => window.__retry.release());
        continue;
      }
    }
    if (process.env.WANT_LIT === '1' && (litBox.mean || 0) < 12 && attempt < 7) {
      note('dark', { id, tier, attempt });
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    if (process.env.WALK_ONLY === '1' && placed.feet !== 'walk') {
      note('not-walk', { id, tier, attempt, feet: placed.feet, band: placed.band });
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    if (process.env.MAX_SPAN && locked.span > Number(process.env.MAX_SPAN)) {
      note('huge', { id, tier, attempt, span: locked.span });
      await page.evaluate(() => window.__retry.release());
      continue;
    }
    if (process.env.NO_SLAB === '1') {
      const slab = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
px = im.load()
x0, y0, x1, y1 = [float(v) for v in sys.argv[2:6]]
px0, px1 = int(x0 * w), int(x1 * w)
def band(xa, xb):
    vals = []
    for y in range(int(h * 0.05), int(h * 0.75), 4):
        for x in range(xa, xb, 4):
            r, g, b = px[x, y]
            vals.append((r + g + b) / 3.0)
    if len(vals) < 8:
        return 0.0, 99.0
    mean = sum(vals) / len(vals)
    var = sum((v - mean) ** 2 for v in vals) / len(vals)
    return mean, var ** 0.5
def overlap(xa, xb):
    return max(0, min(px1, xb) - max(px0, xa)) / max(1, px1 - px0)
left_x, right_x = int(w * 0.28), int(w * 0.72)
lm, ls = band(0, left_x)
rm, rs = band(right_x, w)
print(json.dumps({
  "left": round(ls, 1), "lmean": round(lm, 1),
  "right": round(rs, 1), "rmean": round(rm, 1),
  "ol": round(overlap(0, left_x), 2),
  "orr": round(overlap(right_x, w), 2),
}))
`, tmp0, String(locked.box.x0), String(locked.box.y0), String(locked.box.x1), String(locked.box.y1)], { encoding: 'utf8' });
      const sl = slab.status === 0 ? JSON.parse(slab.stdout) : { left: 99, right: 99, lmean: 0, rmean: 0, ol: 0, orr: 0 };
      note('slab', { id, tier, attempt, ...sl });
      const slabHit = (std, mean, over) => std < 22 && mean > 26 && over > 0.25;
      if (slabHit(sl.left, sl.lmean, sl.ol) || slabHit(sl.right, sl.rmean, sl.orr)) {
        await page.evaluate(() => window.__retry.release());
        continue;
      }
    }
    if (process.env.CANYON === '1') {
      const canyon = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
px = im.load()
def st(x0, x1, y0, y1):
    vals = []
    for y in range(y0, y1, 4):
        for x in range(x0, x1, 4):
            r, g, b = px[x, y]
            vals.append((r + g + b) / 3.0)
    if not vals:
        return 0, 0
    mean = sum(vals) / len(vals)
    var = sum((v - mean) ** 2 for v in vals) / len(vals)
    return mean, var ** 0.5
left = st(0, int(w * 0.32), int(h * 0.08), int(h * 0.52))
right = st(int(w * 0.68), w, int(h * 0.08), int(h * 0.52))
ground = st(int(w * 0.15), int(w * 0.85), int(h * 0.64), int(h * 0.96))
detail = max(left[1], right[1])
bright = max(left[0], right[0])
print(json.dumps({"detail": round(detail, 1), "bright": round(bright, 1), "ground": round(ground[1], 1)}))
`, tmp0], { encoding: 'utf8' });
      const c = canyon.status === 0 ? JSON.parse(canyon.stdout) : { detail: 0, bright: 0, ground: 0 };
      note('canyon', { id, tier, attempt, ...c });
      // A tiled sidewalk or a detailed facade. An open plaza is flat and dim on both.
      if (c.ground < 24 && c.detail < 34 && c.bright < 28) {
        await page.evaluate(() => window.__retry.release());
        continue;
      }
    }
    if (process.env.ON_WARM === '1') {
      const warm = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
px = im.load()
x0, y0, x1, y1 = [float(v) for v in sys.argv[2:6]]
def warm_at(x, y):
    if x < 0 or y < 0 or x >= w or y >= h:
        return False
    r, g, b = px[x, y]
    return r > 90 and r > b + 22 and r > g + 8
# A warm sidewalk is in the frame, but the feet are on the grey lane beside it.
feet_x = int(((x0 + x1) * 0.5) * w)
feet_y = min(h - 4, int(y1 * h) + 6)
hit = n = 0
for y in range(max(0, feet_y - 8), min(h, feet_y + 18), 2):
    for x in range(max(0, feet_x - 18), min(w, feet_x + 18), 2):
        n += 1
        if warm_at(x, y):
            hit += 1
frame = fw = 0
for y in range(int(h * 0.42), int(h * 0.92), 6):
    for x in range(0, w, 8):
        frame += 1
        if warm_at(x, y):
            fw += 1
print(json.dumps({"feet": round(hit / max(1, n), 3), "frame": round(fw / max(1, frame), 3)}))
`, tmp0, String(locked.box.x0), String(locked.box.y0), String(locked.box.x1), String(locked.box.y1)], { encoding: 'utf8' });
      const wr = warm.status === 0 ? JSON.parse(warm.stdout) : { feet: 1, frame: 0 };
      note('warm', { id, tier, attempt, ...wr });
      if (wr.frame > 0.06 && wr.feet < 0.25) {
        await page.evaluate(() => window.__retry.release());
        continue;
      }
    }
    if (process.env.SEE_GROUND === '1') {
      const ground = bodyStats(tmp0, { x0: 0.08, x1: 0.92, y0: 0.62, y1: 0.98 });
      note('see-ground', { id, tier, attempt, mean: Math.round(ground.mean || 0) });
      if ((ground.mean || 0) < 9) {
        await page.evaluate(() => window.__retry.release());
        continue;
      }
    }
    if (process.env.NO_EDGE === '1') {
      const edge = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
px = im.load()
def tall(x0, x1):
    cols = 0
    for x in range(x0, x1, 4):
        ys = [y for y in range(int(h*0.15), int(h*0.9), 3) if sum(px[x, y]) > 150]
        if len(ys) > h * 0.12:
            cols += 1
    return cols
print(json.dumps({"left": tall(0, int(w*0.07)), "right": tall(int(w*0.93), w)}))
`, tmp0], { encoding: 'utf8' });
      const e = edge.status === 0 ? JSON.parse(edge.stdout) : { left: 0, right: 0 };
      if (e.left > 4 || e.right > 4) {
        note('edge-crop', { id, tier, attempt, ...e });
        await page.evaluate(() => window.__retry.release());
        continue;
      }
    }
    renameSync(tmp0, `${OUT}/${id}-${tier}-f0.png`);
    for (let f = 1; f < 4; f++) {
      const stepped = await page.evaluate((index) => window.__retry.quarter(index), who.i);
      note('quarter', { id, tier, f, stepped });
      await frames();
      await page.screenshot({ path: `${OUT}/${id}-${tier}-f${f}.png`, timeout: 180000, animations: 'disabled' });
    }
    return true;
  }
  note('FAIL', { id, tier });
  return false;
}

async function district(id, fn, kinds, tier) {
  if (process.env.STREET_ANCHOR === '1') {
    try { await go(fn, kinds[0]); } catch { /* the street search loads its own block */ }
    const stood = await page.evaluate((districtId) => window.__retry.standStreet(districtId), id);
    note('street anchor', { id, tier, stood });
    if (stood?.ok) {
      const settled = await page.evaluate(() => window.__retry.pump());
      note('settled', { id, kind: 'sidewalk', tier, allowOpen: true, settled });
      if (settled?.n) {
        await page.evaluate(() => window.__retry.hold());
        const ok = await shoot(id, tier, true);
        if (ok) return;
      }
    }
  }
  for (const allowOpen of [false, true]) {
    for (const kind of kinds) {
      let where;
      try { where = await go(fn, kind); } catch (err) {
        note('go fail', { id, kind, err: String(err).slice(0, 140) });
        continue;
      }
      if (where?.fly) continue;
      const settled = await page.evaluate(() => window.__retry.pump());
      note('settled', { id, kind, tier, allowOpen, settled });
      if (!settled.n) continue;
      await page.evaluate(() => window.__retry.hold());
      const ok = await shoot(id, tier, allowOpen);
      if (ok) return;
    }
    if (allowOpen) break;
  }
  note('NO FRAME', { id, tier });
}

async function dancerStrip(name, id) {
  let framed = null;
  const dists = name.includes('broadway') ? [58, 68, 50, 76] : [62, 74, 54, 78];
  for (const dist of dists) {
    framed = await page.evaluate(({ id, dist }) => window.__retry.frameDancer(id, dist), { id, dist });
    note('dancer frame', { name, framed });
    if (!(framed?.ok && framed.shown)) {
      framed = null;
      continue;
    }
    await frames();
    await page.evaluate(() => window.__pinDancerCam?.());
    const probe = `/tmp/${name}-probe.png`;
    await page.screenshot({ path: probe, timeout: 180000, animations: 'disabled' });
    const pink = spawnSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(probe)}).convert('RGB')
px = im.load()
w, h = im.size
n = 0
for y in range(0, h, 3):
    for x in range(0, w, 3):
        r, g, b = px[x, y]
        if r > 70 and r > g + 18 and b > 40:
            n += 1
print(n)
`], { encoding: 'utf8' });
    const count = Number(pink.stdout.trim() || 0);
    note('dancer pink', { name, dist, count });
    if (count > 400) break;
    framed = null;
  }
  if (!framed?.ok) {
    note('DANCER FAIL', { name });
    return;
  }
  await page.evaluate(() => window.__retry.hold());
  const primed = await page.evaluate(() => window.__retry.primeDancer());
  note('dancer phase', { name, f: 0, primed });
  for (let f = 0; f < 4; f++) {
    if (f > 0) {
      const stepped = await page.evaluate(() => window.__retry.advanceDancer());
      note('dancer phase', { name, f, stepped });
    }
    await frames();
    await page.evaluate(() => window.__pinDancerCam?.());
    await page.evaluate(() => window.__nla.app.dancer.update(window.__nla.app.camera.position));
    await page.waitForTimeout(80);
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
  if (!found?.ok || !found.parked?.ok) return;
  await frames();
  await page.evaluate(() => window.__pinDancerCam?.());
  await page.screenshot({ path: `${OUT}/scale-door-car-${tier}.png`, timeout: 180000, animations: 'disabled' });
}

async function runTier(tier) {
  note('boot', tier);
  await boot(tier);
  const mem = await page.evaluate(() => window.__nla.stats().humanMemory);
  note('memory', mem);
  writeFileSync(`${OUT}/memory-${tier}.json`, JSON.stringify(mem, null, 2) + '\n');
  if (DANCER_ONLY) {
    await dancerStrip(`dancer-broadway-${tier}`, 'joi-bridge-dancer');
    await dancerStrip(`dancer-hollywood-${tier}`, 'hollywood-dancer');
    return;
  }
  if (DOOR_ONLY) {
    await doorShot(tier);
    return;
  }
  for (const [id, fn, kinds] of DISTRICTS) {
    if (ONLY.size && !ONLY.has(id)) continue;
    await district(id, fn, kinds, tier);
  }
  if (!ONLY.size && !SKIP_DANCER) {
    await dancerStrip(`dancer-broadway-${tier}`, 'joi-bridge-dancer');
    await dancerStrip(`dancer-hollywood-${tier}`, 'hollywood-dancer');
  }
  if (!ONLY.size && !SKIP_DOOR) await doorShot(tier);
}

try {
  if (TIER === 'both' || TIER === 'medium') await runTier('medium');
  if (TIER === 'both' || TIER === 'ultra') await runTier('ultra');
} finally {
  await browser.close();
}
note('retry done');
