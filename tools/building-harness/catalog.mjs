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
    .filter((b) => b.base < 0.8 && b.h > 3 && b.la > 2 && b.lb > 4)
    .sort((a, b) => b.lb * b.la - a.lb * a.la);
  const towers = [];
  for (const body of bodies) {
    const hit = towers.find((t) => t.family === body.family && Math.hypot(t.s - body.s, t.t - body.t) < 22);
    if (hit) continue;
    const near = kit.filter((b) => b.family === body.family && Math.hypot(b.s - body.s, b.t - body.t) < 36);
    let faceS = body.s - body.la / 2;
    const cheeks = near.filter((b) => b.base < 1 && b.la < 1.2 && b.s < body.s);
    if (cheeks.length) {
      faceS = Math.min(...cheeks.map((b) => b.s - b.la / 2));
    }
    const doorT = cheeks.length ? cheeks.reduce((s, b) => s + b.t, 0) / cheeks.length : body.t;
    const height = near.reduce((m, b) => Math.max(m, b.base + b.h), 0);
    const sidewalkS = -(block.la / 2 + 2.6);
    const gap = faceS - sidewalkS;
    towers.push({
      family: body.family,
      s: body.s,
      t: body.t,
      doorS: faceS,
      doorT,
      gap,
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

const report = { dressed, counts, towers: [...chosen, ...heroes] };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ dressed, counts, towers: report.towers.map((t) => ({ kind: t.kind, gap: t.gap, height: t.height, door: t.door, stand: t.stand })) }, null, 2));
await vite.close();
