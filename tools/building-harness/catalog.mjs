// One street-facing instance of each B1 family, plus the three heroes.
// Run: node tools/building-harness/catalog.mjs
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = process.env.OUT ?? '/opt/cursor/artifacts/b1/catalog.json';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const layoutMod = await vite.ssrLoadModule('/src/world/layout.ts');
const gen = await vite.ssrLoadModule('/src/world/fabric/generator.ts');
const dtla = await vite.ssrLoadModule('/src/districts/dtla/block.ts');
const place = await vite.ssrLoadModule('/src/world/buildings/place.ts');
const parts = await vite.ssrLoadModule('/src/world/buildings/parts.ts');
const rngMod = await vite.ssrLoadModule('/src/core/rng.ts');
const layout = layoutMod.getLayout();
const { enumerateBlocks } = gen;
const { dressBlock } = dtla;
const { placeHero } = place;
const { doorFace, HERO_KINDS } = parts;
const { hashString } = rngMod;

function toWorld(b, s, t) {
  return [b.cx + b.ax * s + b.bx * t, b.cz + b.az * s + b.bz * t];
}

function clusterTowers(block, dress) {
  const kit = dress.boxes.filter((b) => b.kit && b.family);
  const bodies = kit
    .filter((b) => b.base < 0.8 && b.h > 8 && b.la > 6 && b.lb > 9)
    .sort((a, b) => b.lb * b.la - a.lb * a.la);
  const towers = [];
  for (const body of bodies) {
    const hit = towers.find((t) => t.family === body.family && Math.hypot(t.s - body.s, t.t - body.t) < 22);
    if (hit) continue;
    const near = kit.filter((b) => b.family === body.family && Math.hypot(b.s - body.s, b.t - body.t) < 36);
    let faceS = body.s - body.la / 2;
    // Door cheeks are the tall thin wall. Treads (h ~ 0.17) and jambs sit in front of that face.
    const cheeks = near.filter((b) => b.base < 1 && b.la < 1.2 && b.h > 2.5 && b.s < body.s);
    if (cheeks.length) {
      faceS = Math.min(...cheeks.map((b) => b.s - b.la / 2));
    }
    // Jambs mark the opening. Cheek centers sit on the wall when the door is offset.
    // Jambs are 2.83 m (2.2 m leaf plus the buried glow sill). A 2.6 m cap missed them.
    const jambs = near.filter((b) => b.base < 0.2 && b.h > 1.5 && b.h < 3.05 && b.lb < 0.3 && b.la < 0.3);
    const doorT = jambs.length
      ? jambs.reduce((s, b) => s + b.t, 0) / jambs.length
      : cheeks.length
        ? cheeks.reduce((s, b) => s + b.t, 0) / cheeks.length
        : body.t;
    const height = near.reduce((m, b) => Math.max(m, b.base + b.h), 0);
    const sidewalkS = -(block.la / 2 + 2.6);
    const gap = faceS - sidewalkS;
    // Metres of open ground in front of the door, before another mass.
    let clear = 80;
    for (const b of dress.boxes) {
      if (b.h < 1.6 || b.base > 2.2) continue;
      const t0 = b.t - b.lb / 2;
      const t1 = b.t + b.lb / 2;
      if (doorT < t0 + 0.3 || doorT > t1 - 0.3) continue;
      const front = b.s + b.la / 2;
      if (front > faceS - 0.35) continue;
      clear = Math.min(clear, faceS - front);
    }
    towers.push({
      family: body.family,
      s: body.s,
      t: body.t,
      doorS: faceS,
      doorT,
      gap,
      clear,
      height,
      w: body.lb,
      d: body.la,
      block,
    });
  }
  return towers;
}

function poseOf(tower) {
  const b = tower.block;
  const [dx, dz] = toWorld(b, tower.doorS, tower.doorT);
  const [cx, cz] = toWorld(b, tower.s, tower.t);
  const nx = -b.ax;
  const nz = -b.az;
  const sidewalkS = -(b.la / 2 + 2.6);
  const standS = sidewalkS - 3.2;
  const standT = tower.doorT + 2.4;
  const [sx, sz] = toWorld(b, standS, standT);
  const ground = layout.heightAt(sx, sz);
  return {
    kind: tower.family,
    district: 'dtla',
    height: Number(tower.height.toFixed(1)),
    gap: Number(tower.gap.toFixed(2)),
    w: Number(tower.w.toFixed(1)),
    d: Number(tower.d.toFixed(1)),
    door: [Number(dx.toFixed(2)), Number(dz.toFixed(2))],
    center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
    stand: [Number(sx.toFixed(2)), Number(sz.toFixed(2))],
    ground: Number(ground.toFixed(2)),
    normal: [Number(nx.toFixed(4)), Number(nz.toFixed(4))],
    ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    heading: Math.atan2(b.ax, -b.az),
  };
}

const blocks = enumerateBlocks(layout, -4500, -3500, 9000).filter((b) => b.district.id === 'dtla');
const byKind = new Map();
let dressed = 0;
for (const b of blocks) {
  const dress = dressBlock(b, layout);
  dressed++;
  for (const tower of clusterTowers(b, dress)) {
    const list = byKind.get(tower.family) ?? [];
    list.push(tower);
    byKind.set(tower.family, list);
  }
}

function pick(list) {
  const street = list.filter((t) => t.gap > 5 && t.gap < 11 && t.height > 70);
  const pool = street.length ? street : list.filter((t) => t.gap > 3.5 && t.gap < 18 && t.height > 50);
  const use = pool.length ? pool : list;
  use.sort((a, b) => Math.abs(a.gap - 7.5) - Math.abs(b.gap - 7.5) || b.height - a.height);
  return use[0];
}

const chosen = [];
const counts = {};
for (const [kind, list] of byKind) {
  counts[kind] = list.length;
  const best = pick(list);
  if (best) chosen.push(poseOf(best));
}

const heroes = [];
for (const id of ['b1-gate', 'b1-step', 'b1-obelisk']) {
  const l = layout.landmarkById(id);
  const kind = HERO_KINDS.find((k) => id.endsWith(k.slice(5))) ?? (id === 'b1-gate' ? 'hero-gate' : id === 'b1-step' ? 'hero-step' : 'hero-obelisk');
  const placed = placeHero(kind, l.baseWidth, l.baseDepth ?? l.baseWidth * 0.7, l.height, (hashString(l.id) % 1000) / 1000);
  const door = doorFace(placed.draft);
  const [ax, az] = [Math.sin(l.bearingDeg * Math.PI / 180), -Math.cos(l.bearingDeg * Math.PI / 180)];
  const [bx, bz] = [Math.sin((l.bearingDeg + 90) * Math.PI / 180), -Math.cos((l.bearingDeg + 90) * Math.PI / 180)];
  const top = placed.draft.boxes.reduce((m, b) => Math.max(m, b.base + b.h), 0);
  const ds = door.s;
  const dt = door.t;
  const dx = l.x + ax * ds + bx * dt;
  const dz = l.z + az * ds + bz * dt;
  const standS = door.s - 9.5;
  const standT = door.t + 2.6;
  const sx = l.x + ax * standS + bx * standT;
  const sz = l.z + az * standS + bz * standT;
  heroes.push({
    kind,
    id,
    district: 'financial-megatowers',
    height: Number(top.toFixed(1)),
    w: l.baseWidth,
    d: l.baseDepth,
    door: [Number(dx.toFixed(2)), Number(dz.toFixed(2))],
    center: [Number(l.x.toFixed(2)), Number(l.z.toFixed(2))],
    stand: [Number(sx.toFixed(2)), Number(sz.toFixed(2))],
    ground: Number(layout.heightAt(sx, sz).toFixed(2)),
    normal: [Number((-ax).toFixed(4)), Number((-az).toFixed(4))],
    ax, az, bx, bz,
    heading: Math.atan2(ax, -az),
  });
}

const hwPlan = await vite.ssrLoadModule('/src/districts/hollywood/plan.ts');
const artsPlan = await vite.ssrLoadModule('/src/districts/arts-district/plan.ts');
const sprawlMod = await vite.ssrLoadModule('/src/districts/_shared/sprawl/plan.ts');
const eastSpec = await vite.ssrLoadModule('/src/districts/east-la/spec.ts');
const sbPlan = await vite.ssrLoadModule('/src/districts/south-bay-refineries/plan.ts');

function blocksIn(id) {
  const d = layout.districts.find((x) => x.id === id);
  if (!d) return [];
  const [minX, minZ, maxX, maxZ] = d.bbox;
  const size = Math.max(maxX - minX, maxZ - minZ) + 800;
  return enumerateBlocks(layout, minX - 400, minZ - 400, size).filter((b) => b.district.id === id && b.ground <= 45);
}

const field = new Map();
const worldBoxes = [];
function note(block, boxes) {
  for (const b of boxes) {
    if (b.h < 1.5 || b.base > 3) continue;
    const [cx, cz] = toWorld(block, b.s, b.t);
    worldBoxes.push({
      cx, cz, ax: block.ax, az: block.az, bx: block.bx, bz: block.bz,
      hs: b.la / 2, ht: b.lb / 2, y0: b.base || 0, top: (b.base || 0) + b.h,
    });
  }
  for (const tower of clusterTowers(block, { boxes })) {
    const list = field.get(tower.family) ?? [];
    list.push(tower);
    field.set(tower.family, list);
  }
}

function worldClear(tower) {
  const b = tower.block;
  const [dx, dz] = toWorld(b, tower.doorS, tower.doorT);
  const nx = -b.ax;
  const nz = -b.az;
  for (let dist = 1.4; dist <= 16; dist += 1.2) {
    const x = dx + nx * dist;
    const z = dz + nz * dist;
    for (const box of worldBoxes) {
      const s = (x - box.cx) * box.ax + (z - box.cz) * box.az;
      const t = (x - box.cx) * box.bx + (z - box.cz) * box.bz;
      if (Math.abs(s) > box.hs || Math.abs(t) > box.ht) continue;
      if (1.4 < box.y0 || 1.4 > box.top) continue;
      return Number(dist.toFixed(1));
    }
  }
  return 16;
}

for (const b of blocksIn('hollywood')) note(b, hwPlan.planHollywood(b).boxes);
for (const b of blocksIn('arts-district')) note(b, artsPlan.planArts(b, layout).boxes);
for (const b of blocksIn('east-la')) {
  const plan = sprawlMod.planSprawl({
    id: 'east-la',
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  }, eastSpec.EAST_LA_PARAMS, layout);
  note(b, plan.boxes);
}
for (const b of blocksIn('south-bay-refineries')) {
  note(b, sbPlan.planSouthBay({
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  }, layout).boxes);
}

for (const [kind, list] of field) {
  counts[kind] = list.length;
  for (const tower of list) tower.clear = worldClear(tower);
  const open = list.filter((t) => t.clear >= 12 && t.height > 45);
  open.sort((a, b) => b.height - a.height || b.clear - a.clear);
  const best = open[0] ?? list.slice().sort((a, b) => b.clear - a.clear)[0];
  if (!best) continue;
  const pose = poseOf(best);
  pose.clear = Number((best.clear ?? 0).toFixed(1));
  pose.district = best.block.district.id;
  const standS = best.doorS - 8;
  const standT = best.doorT + 2.2;
  const [sx, sz] = toWorld(best.block, standS, standT);
  pose.stand = [Number(sx.toFixed(2)), Number(sz.toFixed(2))];
  pose.ground = Number(layout.heightAt(sx, sz).toFixed(2));
  pose.gap = 8;
  chosen.push(pose);
}

const report = { dressed, counts, towers: [...chosen, ...heroes] };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ dressed, counts, towers: report.towers.map((t) => ({ kind: t.kind, gap: t.gap, clear: t.clear, height: t.height, door: t.door, stand: t.stand })) }, null, 2));
await vite.close();
