// Compares Lakewood residential plans against a snapshot, and prints a South LA sample.
//   node scripts/check-residential.mjs snapshot
//   node scripts/check-residential.mjs check
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'check';
const snapPath = new URL('./.lakewood-plan-snap.json', import.meta.url);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const planMod = await server.ssrLoadModule('/src/districts/_shared/residential/plan.ts');
const layoutMod = await server.ssrLoadModule('/src/world/layout.ts');
const genMod = await server.ssrLoadModule('/src/world/fabric/generator.ts');
const lakeMod = await server.ssrLoadModule('/src/districts/lakewood-megablocks/spec.ts');
let southMod = null;
try {
  southMod = await server.ssrLoadModule('/src/districts/south-la-megablocks/spec.ts');
} catch {
  southMod = null;
}

const layout = layoutMod.getLayout();
const { planResidential } = planMod;
const { enumerateBlocks } = genMod;

function toRes(b) {
  return {
    id: b.district.id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

function digest(plan) {
  return {
    family: plan.family,
    height: plan.height,
    hub: plan.hub,
    edge: plan.edge,
    seam: plan.seam,
    stalls: plan.stalls.length,
    spine: !!plan.spine,
    face: !!plan.face,
    wall: !!plan.wall,
    signs: plan.signs.length,
    boxes: plan.boxes.length,
    box0: plan.boxes[0] ?? null,
    boxN: plan.boxes[plan.boxes.length - 1] ?? null,
    sign0: plan.signs[0] ?? null,
  };
}

function sample(id, params, x, z, span) {
  const out = [];
  for (const b of enumerateBlocks(layout, x - span / 2, z - span / 2, span)) {
    if (b.district.id !== id) continue;
    const block = toRes(b);
    out.push({ i: b.i, j: b.j, seed: b.seed, ...digest(planResidential(block, params, layout)) });
  }
  out.sort((a, b) => a.i - b.i || a.j - b.j || a.seed - b.seed);
  return out;
}

const lake = sample('lakewood-megablocks', lakeMod.LAKEWOOD_PARAMS, lakeMod.HUB.x, lakeMod.HUB.z, 2400);

if (mode === 'snapshot') {
  writeFileSync(snapPath, JSON.stringify(lake, null, 2));
  console.log(`snap ${lake.length} blocks`);
} else {
  const prev = JSON.parse(readFileSync(snapPath, 'utf8'));
  const key = (r) => `${r.i},${r.j},${r.seed}`;
  const map = new Map(prev.map((r) => [key(r), r]));
  let same = 0;
  let diff = 0;
  for (const r of lake) {
    const p = map.get(key(r));
    if (!p) { diff++; console.log('missing', key(r)); continue; }
    const keys = Object.keys(p);
    const drifted = keys.some((k) => JSON.stringify(p[k]) !== JSON.stringify(r[k]));
    if (drifted) {
      diff++;
      if (diff <= 8) console.log('DIFF', key(r), '\n prev', p, '\n now ', r);
    } else same++;
  }
  console.log(`lakewood same ${same} diff ${diff} prev ${prev.length} now ${lake.length}`);
}

if (southMod?.SOUTH_LA_PARAMS) {
  const south = sample('south-la-megablocks', southMod.SOUTH_LA_PARAMS, southMod.HUB.x, southMod.HUB.z, 1800);
  const fam = {};
  let spine = 0;
  let face = 0;
  let hub = 0;
  let edge = 0;
  let markets = 0;
  let heights = [];
  for (const r of south) {
    fam[r.family] = (fam[r.family] ?? 0) + 1;
    if (r.spine) spine++;
    if (r.face) face++;
    if (r.hub) hub++;
    if (r.edge) edge++;
    if (r.stalls) markets++;
    heights.push(r.height);
  }
  heights.sort((a, b) => a - b);
  const mid = heights[Math.floor(heights.length / 2)] ?? 0;
  console.log(`south blocks ${south.length} fam`, fam, { spine, face, hub, edge, markets, mid, min: heights[0], max: heights[heights.length - 1] });
  const east = sample('south-la-megablocks', southMod.SOUTH_LA_PARAMS, 400, 7000, 2200);
  const ef = { n: east.length, face: 0, wall: 0, edge: 0, bars: 0 };
  const eh = [];
  for (const r of east) {
    if (r.face) ef.face++;
    if (r.wall) ef.wall++;
    if (r.edge) ef.edge++;
    if (r.family === 'bar') ef.bars++;
    if (r.face) eh.push(r.height);
  }
  eh.sort((a, b) => a - b);
  console.log('east', ef, 'face heights', eh[0], eh[Math.floor(eh.length / 2)], eh[eh.length - 1]);
  const trench = sample('south-la-megablocks', southMod.SOUTH_LA_PARAMS, -3400, 8000, 1600);
  console.log('trench edges', trench.filter((r) => r.edge).length, 'of', trench.length);
  const viewMod = await server.ssrLoadModule('/src/districts/south-la-megablocks/view.ts');
  for (const k of ['street', 'courtyard', 'market', 'spine', 'hub', 'traffic', 'trench', 'wallace', 'aerial', 'seam', 'room']) {
    const p = viewMod.southLaCamera(layout, k);
    console.log(k, p ? `${p.mode} ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)} h${(p.heading * 180 / Math.PI).toFixed(0)}` : 'NULL');
  }
}

await server.close();
