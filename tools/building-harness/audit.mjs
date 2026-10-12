// Headless checks for the B1 kit: scale, fabric tops, street clearance, hero reserves, silhouette IoU.
// Run: node tools/building-harness/audit.mjs
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const recipes = await vite.ssrLoadModule('/src/world/buildings/recipes.ts');
const scaleMod = await vite.ssrLoadModule('/src/world/buildings/scale.ts');
const parts = await vite.ssrLoadModule('/src/world/buildings/parts.ts');
const layoutMod = await vite.ssrLoadModule('/src/world/layout.ts');
const gen = await vite.ssrLoadModule('/src/world/fabric/generator.ts');
const lb = await vite.ssrLoadModule('/src/districts/long-beach/plan.ts');
const lbSpec = await vite.ssrLoadModule('/src/districts/long-beach/spec.ts');
const dtla = await vite.ssrLoadModule('/src/districts/dtla/block.ts');

const { buildTower } = recipes;
const { measureDraft, scaleOk } = scaleMod;
const { TOWER_KINDS, HERO_KINDS, FIELD_KINDS, STOREY } = parts;
const layout = layoutMod.getLayout();
const fails = [];

function check(name, cond, detail) {
  if (!cond) fails.push(`${name}: ${detail}`);
}

const specs = [];
for (const kind of TOWER_KINDS) {
  for (const variant of [0, 1, 2]) {
    specs.push({ kind, variant, height: 220, w: 48, d: 36, minH: 151.2, maxH: 302.4, plinth: variant === 1 ? 21.6 : 0 });
  }
}
for (const kind of HERO_KINDS) {
  const height = kind === 'hero-gate' ? 560 : kind === 'hero-step' ? 640 : 480;
  specs.push({ kind, variant: 0, height, w: 70, d: 48, minH: height - 8, maxH: height + 8, plinth: 0 });
}
for (const kind of FIELD_KINDS) {
  const height = kind === 'spine-bar' ? 54.4 : kind === 'flue-bank' ? 108 : 115.2;
  for (const variant of [0, 1, 2]) {
    specs.push({ kind, variant, height, w: 48, d: 32, minH: Math.max(40, height - 8), maxH: Math.min(160, height + 8), plinth: 0 });
  }
}
specs.push({ kind: 'band-slab', variant: 0, height: 90, w: 22, d: 16, minH: 57.6, maxH: 120, plinth: 0 });
specs.push({ kind: 'res-stack', variant: 2, height: 80, w: 20, d: 14, minH: 57.6, maxH: 120, plinth: 0 });

for (const s of specs) {
  const draft = buildTower({
    ...s, seed: 0.37, lit: 0.4, tint: 0.7, decks: s.plinth ? [46] : [], phrases: [79, 77], holo: s.kind === 'holo-shaft',
  });
  const report = measureDraft(draft);
  const bad = scaleOk(report);
  if (bad.length) fails.push(`${s.kind} v${s.variant} h${s.height}: ${bad.join(', ')} door=${report.doorH} rail=${report.railH} storey=${report.storey}`);
  const treads = draft.boxes.filter((b) => b.role === 'stair' && b.h < 0.4).length;
  if (s.w >= 40 && s.kind !== 'lantern' && treads < 8) fails.push(`${s.kind} v${s.variant} flight ${treads} treads`);
  const top = Math.max(...draft.boxes.map((b) => b.base + b.h));
  if (s.maxH <= 320 && top > 305.5) fails.push(`${s.kind} fabric top ${top.toFixed(1)} > 305`);
  if (s.kind.startsWith('hero') && top < s.height - 12) fails.push(`${s.kind} top ${top.toFixed(1)} short of ${s.height}`);
  const off = draft.boxes.filter((b) => Math.abs(b.t) + b.lb / 2 > s.w / 2 + 2.2 || Math.abs(b.s) + b.la / 2 > s.d / 2 + 2.2);
  if (off.length) fails.push(`${s.kind} v${s.variant} ${off.length} boxes outside footprint`);
}

function raster(draft, axis) {
  const boxes = draft.boxes.filter((b) => b.detail === 0 && (b.ornament === undefined || b.ornament === 0));
  const W = 96, H = 160;
  const mask = new Uint8Array(W * H);
  let maxU = 0.01, maxV = 0.01;
  for (const b of boxes) {
    const u0 = axis === 't' ? b.t - b.lb / 2 : b.s - b.la / 2;
    const u1 = axis === 't' ? b.t + b.lb / 2 : b.s + b.la / 2;
    maxU = Math.max(maxU, Math.abs(u0), Math.abs(u1));
    maxV = Math.max(maxV, b.base + b.h);
  }
  const paint = (pred) => {
    const m = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const v = ((H - 1 - y) + 0.5) / H * maxV;
      for (let x = 0; x < W; x++) {
        const u = ((x + 0.5) / W * 2 - 1) * maxU;
        if (pred(u, v)) m[y * W + x] = 1;
      }
    }
    return m;
  };
  const mesh = paint((u, v) => boxes.some((b) => {
    const u0 = axis === 't' ? b.t - b.lb / 2 : b.s - b.la / 2;
    const u1 = axis === 't' ? b.t + b.lb / 2 : b.s + b.la / 2;
    return u >= u0 && u <= u1 && v >= b.base && v <= b.base + b.h;
  }));
  return { mesh, paint, maxU, maxV, W, H };
}

function iou(a, b) {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x || y) union++;
    if (x && y) inter++;
  }
  return union ? inter / union : 0;
}

/** Three stacks on a plinth. Signed across the width, because the shafts are not a mirror. */
function flueEnv(s, y) {
  if (y < 0 || y > 1.05) return false;
  if (y < 0.16 && Math.abs(s) < 1.02) return true;
  const cols = [
    { c: -0.68, half: 0.28, top: 0.82 },
    { c: 0.02, half: 0.36, top: 1.03 },
    { c: 0.7, half: 0.26, top: 0.68 },
  ];
  return cols.some((col) => y < col.top && Math.abs(s - col.c) < col.half);
}

/** Design envelopes, drawn as profiles, not traced off the mesh. u is centred, v is up. */
function envelope(kind, u, v, maxU, maxV) {
  const x = Math.abs(u) / maxU;
  const y = v / maxV;
  if (y < 0 || y > 1.08 || x > 1.05) return false;
  if (kind === 'ziggurat' || kind === 'hero-step') {
    const steps = kind === 'hero-step' ? 11 : 6;
    const i = Math.min(steps - 1, Math.floor(y * steps));
    const f = 1 - i * (0.62 / steps);
    return x < f * 0.92 + 0.08;
  }
  if (kind === 'monolith') {
    return x < (1 - y * 0.62) * 0.9 + 0.08;
  }
  if (kind === 'hero-obelisk') {
    const p = recipes.kiteProfile(Math.max(0, Math.min(1, y)));
    return x < p + 0.02;
  }
  if (kind === 'screen-wall') return x < 1.02;
  if (kind === 'spine-bar') return y < 0.7 ? x < 1.02 : x < 0.42;
  if (kind === 'flue-bank') return flueEnv(u / maxU, y);
  if (kind === 'cantilever') return x < (y < 0.3 ? 0.72 : 1.02);
  if (kind === 'holo-shaft') return x < (y < 0.14 ? 0.95 : 0.62);
  if (kind === 'buttress') return x < (y < 0.66 ? 1.02 : 0.58);
  if (kind === 'hero-gate') return x > 0.18 && x < 1.02;
  if (kind === 'lantern') return x < 1.02;
  return x < 1.02;
}

const iouRows = [];
for (const kind of [...TOWER_KINDS, ...HERO_KINDS, ...FIELD_KINDS]) {
  const height = kind === 'hero-gate' ? 560
    : kind === 'hero-step' ? 640
      : kind === 'hero-obelisk' ? 480
        : kind === 'spine-bar' ? 54.4
          : kind === 'flue-bank' ? 108
            : kind === 'screen-wall' ? 115.2
              : 220;
  const field = FIELD_KINDS.includes(kind);
  const maxH = kind.startsWith('hero') ? height + 8 : field ? Math.min(160, height + 8) : 302.4;
  const minH = kind.startsWith('hero') ? height - 8 : field ? Math.max(40, height - 8) : 151.2;
  const draft = buildTower({
    kind, variant: 0, seed: 0.2, height, w: 64, d: 40, lit: 0.4, tint: 0.7,
    plinth: 0, decks: [], phrases: [], holo: false, minH, maxH,
  });
  let best = 0;
  for (const axis of ['t', 's']) {
    const { mesh, paint, maxU, maxV } = raster(draft, axis);
    const env = paint((u, v) => envelope(kind, u, v, maxU, maxV));
    best = Math.max(best, iou(mesh, env));
  }
  iouRows.push({ kind, iou: Number(best.toFixed(3)) });
  if (best < 0.45) fails.push(`${kind} silhouette IoU ${best.toFixed(2)}`);
}

const fin = generateChunk(-2000, -200, 1000);
const finTops = fin.boxes.map((b) => b.y0 + b.h);
const finMax = Math.max(...finTops);
check('financial top', finMax <= 306, finMax.toFixed(1));
check('financial has boxes', fin.boxes.length > 100, String(fin.boxes.length));
const finReserved = fin.boxes.filter((b) => layout.isReserved(b.x, b.z, 2) || layout.isOcean(b.x, b.z));
check('financial reserved boxes', finReserved.length === 0, String(finReserved.length));

const heroes = ['b1-gate', 'b1-step', 'b1-obelisk'].map((id) => layout.landmarkById(id));
for (const h of heroes) {
  check(h.id + ' found', !!h, 'missing');
  if (!h) continue;
  check(h.id + ' district', layout.districtAt(h.x, h.z).id === 'financial-megatowers', layout.districtAt(h.x, h.z).id);
  check(h.id + ' ground', layout.heightAt(h.x, h.z) < 2, String(layout.heightAt(h.x, h.z)));
  check(h.id + ' ocean', !layout.isOcean(h.x, h.z), 'in ocean');
}
const pair = Math.hypot(heroes[1].x - heroes[2].x, heroes[1].z - heroes[2].z);
check('step-obelisk gap', pair > 100, pair.toFixed(1));

const geo = await vite.ssrLoadModule('/src/world/geo.ts');
const [ox, oz] = geo.geoToLocal(34.0505, -118.2405);
const pyr = layout.landmarkById('wallace-pyramid');
const rayX = pyr.x - ox;
const rayZ = pyr.z - oz;
const rayLen2 = rayX * rayX + rayZ * rayZ;
function rayDist(x, z) {
  const t = ((x - ox) * rayX + (z - oz) * rayZ) / rayLen2;
  return Math.hypot(x - (ox + rayX * t), z - (oz + rayZ * t));
}
for (const h of heroes) {
  if (!h) continue;
  const d = rayDist(h.x, h.z);
  check(h.id + ' off opening ray', d > 140, d.toFixed(1));
}
const lapd = layout.landmarkById('lapd-hq');
const hall = layout.landmarkById('city-hall');
check('lapd spared', !!lapd && lapd.type !== 'b1-hero', lapd && lapd.type);
check('city hall spared', !!hall && hall.type !== 'b1-hero', hall && hall.type);
check('wallace spared', pyr && pyr.type === 'wallace-pyramid', pyr && pyr.type);

function generateChunk(x0, z0, size) {
  return gen.generateFabric(layout, x0, z0, size);
}

// street clearance: box extent past the block face should not cross the street centreline
function streetClips(fab) {
  const hits = [];
  for (const b of fab.boxes) {
    let best = null;
    let bestD = 1e9;
    for (const block of fab.blocks) {
      const dx = b.x - block.cx, dz = b.z - block.cz;
      const s = dx * block.ax + dz * block.az;
      const t = dx * block.bx + dz * block.bz;
      const dist = Math.hypot(s, t);
      if (dist < bestD) { bestD = dist; best = { block, s, t }; }
    }
    if (!best) continue;
    if (b.y0 > 6 || b.detail > 0) continue;
    const { block, s, t } = best;
    const yawDelta = Math.atan2(Math.sin(b.yaw - block.yaw), Math.cos(b.yaw - block.yaw));
    if (Math.abs(yawDelta) > 0.02) continue;
    if (Math.abs(s) > block.la / 2 + 4 || Math.abs(t) > block.lb / 2 + 4) continue;
    const sReach = Math.abs(s) + b.d / 2;
    const tReach = Math.abs(t) + b.w / 2;
    const sOver = sReach - (block.la / 2 + block.street / 2);
    const tOver = tReach - (block.lb / 2 + block.street / 2);
    if (sOver > 0.4 || tOver > 0.4) {
      hits.push({
        over: Number(Math.max(sOver, tOver).toFixed(1)),
        s: Number(s.toFixed(1)), t: Number(t.toFixed(1)),
        la: block.la, lb: block.lb, street: block.street,
        h: Number(b.h.toFixed(1)), w: Number(b.w.toFixed(1)), d: Number(b.d.toFixed(1)),
        arch: block.archetype,
      });
    }
  }
  hits.sort((a, c) => c.over - a.over);
  return hits;
}

const finClips = streetClips(fin);
check('financial street centre', finClips.length === 0, JSON.stringify(finClips.slice(0, 4)));

const dtlaFab = generateChunk(-400, -200, 800);
check('dtla boxes', dtlaFab.boxes.length > 50, String(dtlaFab.boxes.length));
const dtlaMax = Math.max(...dtlaFab.boxes.map((b) => b.y0 + b.h));
check('dtla top', dtlaMax < 320, dtlaMax.toFixed(1));
const dtlaClips = streetClips(dtlaFab);
check('dtla street', dtlaClips.length === 0, JSON.stringify(dtlaClips.slice(0, 4)));

const lbBlock = lbSpec.longBeachBlock(layout, lbSpec.HERO_A.i, lbSpec.HERO_A.j);
const planA = lb.planLongBeach(lbBlock, layout);
const door = planA.boxes.filter((b) => Math.abs(b.s - (lbSpec.DOOR_S + 0.24)) < 1 && b.base === 0 && Math.abs(b.h - STOREY * 4) < 0.05 && b.la < 1);
check('concourse cheeks', door.length >= 2, String(door.length));
const massSouth = Math.min(...planA.boxes.filter((b) => b.h > 40).map((b) => b.s - b.la / 2));
check('slab north of door', massSouth > lbSpec.DOOR_S + 10, massSouth.toFixed(1));
const heroTop = Math.max(...planA.boxes.map((b) => b.base + b.h));
check('long beach hero A', heroTop >= 175 && heroTop <= 200, heroTop.toFixed(1));

const blockB = lbSpec.longBeachBlock(layout, lbSpec.HERO_B.i, lbSpec.HERO_B.j);
const planB = lb.planLongBeach(blockB, layout);
const topB = Math.max(...planB.boxes.map((b) => b.base + b.h));
check('long beach hero B', topB >= 155 && topB <= 175, topB.toFixed(1));

const kinds = new Set();
for (let n = 0; n < 40; n++) {
  const draft = buildTower({
    kind: TOWER_KINDS[n % TOWER_KINDS.length], variant: n % 3, seed: n / 40, height: 180 + n, w: 40, d: 28,
    lit: 0.4, tint: 0.7, plinth: 0, decks: [], phrases: [79], holo: false, minH: 151.2, maxH: 302.4,
  });
  kinds.add(draft.kind + ':' + draft.variant);
}
check('variant spread', kinds.size >= 16, String(kinds.size));

const mesher = await vite.ssrLoadModule('/src/world/fabric/mesher.ts');
const budget = await vite.ssrLoadModule('/src/world/buildings/kitBudget.ts');
const place = await vite.ssrLoadModule('/src/world/buildings/place.ts');
const quality = await vite.ssrLoadModule('/src/core/quality.ts');
const tiers = await vite.ssrLoadModule('/src/world/buildings/tiers.ts');
function owningBlock(fab, b) {
  let best = null;
  let bestD = 1e12;
  for (const block of fab.blocks) {
    const dist = (b.x - block.cx) ** 2 + (b.z - block.cz) ** 2;
    if (dist < bestD) { bestD = dist; best = block; }
  }
  return best;
}
const finOwned = fin.boxes.filter((b) => owningBlock(fin, b)?.archetype === 'financial-megatowers');
const finKit = finOwned.filter((b) => b.kit).length;
check('financial towers are kit instances', finOwned.length > 0 && finKit === finOwned.length, `${finKit}/${finOwned.length}`);

function chunkTris(arrays) {
  const instances = arrays.kit.length / budget.KIT_STRIDE;
  return {
    boxes: arrays.boxCount,
    tris: arrays.index.length / 3 + budget.kitTris(instances),
    kit: instances,
    uniqueTris: arrays.index.length / 3,
  };
}
const tierTris = {};
for (const cap of [0, 1, 2]) {
  tierTris['cap' + cap] = chunkTris(mesher.buildChunkArrays(layout, fin, -2000, -200, 1000, 0, cap));
}
tierTris.lod2 = chunkTris(mesher.buildChunkArrays(layout, fin, -2000, -200, 1000, 2, 0));

const SUPER = 2000;
const CHUNK = 500;
const AABB_TOP = 260;
const districts = ['financial-megatowers', 'dtla', 'long-beach']
  .map((id) => layout.districts.find((d) => d.id === id))
  .filter(Boolean);

function distToBox(px, py, pz, x0, z0, size) {
  const dx = Math.max(x0 - px, 0, px - (x0 + size));
  const dz = Math.max(z0 - pz, 0, pz - (z0 + size));
  const dy = Math.max(0 - py, 0, py - AABB_TOP);
  return Math.hypot(dx, dy, dz);
}
function overlaps(x0, z0, size, box) {
  const [minX, minZ, maxX, maxZ] = box;
  return x0 < maxX && x0 + size > minX && z0 < maxZ && z0 + size > minZ;
}
function countKit(boxes, lod, cap) {
  let n = 0;
  for (const b of boxes) if (b.kit && mesher.keepBox(b, lod, cap)) n++;
  return n;
}

const cache = new Map();
function superFabric(x0, z0) {
  const key = `${x0},${z0}`;
  let fab = cache.get(key);
  if (!fab) {
    fab = gen.generateFabric(layout, x0, z0, SUPER);
    cache.set(key, fab);
  }
  return fab;
}

function residentAt(px, pz, tier) {
  const q = quality.settingsFor(tier);
  const cap = tiers.buildingDetailCap(tier);
  let instances = 0;
  let meshes = 0;
  const sy0 = Math.floor((pz - q.farRadius) / SUPER) * SUPER;
  const sy1 = Math.floor((pz + q.farRadius) / SUPER) * SUPER;
  const sx0 = Math.floor((px - q.farRadius) / SUPER) * SUPER;
  const sx1 = Math.floor((px + q.farRadius) / SUPER) * SUPER;
  for (let sz = sy0; sz <= sy1; sz += SUPER) {
    for (let sx = sx0; sx <= sx1; sx += SUPER) {
      if (distToBox(px, 2, pz, sx, sz, SUPER) > q.farRadius) continue;
      if (!districts.some((d) => overlaps(sx, sz, SUPER, d.bbox))) continue;
      const fab = superFabric(sx, sz);
      const near = distToBox(px, 2, pz, sx, sz, SUPER) < q.nearRadius;
      if (!near) {
        const n = countKit(fab.boxes, 2, 0);
        if (n > 0) { instances += n; meshes++; }
        continue;
      }
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const x0 = sx + i * CHUNK;
          const z0 = sz + j * CHUNK;
          const lod = distToBox(px, 2, pz, x0, z0, CHUNK) < q.lod0Radius ? 0 : 1;
          let n = 0;
          for (const b of fab.boxes) {
            if (!b.kit || !mesher.keepBox(b, lod, cap)) continue;
            if (b.x < x0 || b.x >= x0 + CHUNK || b.z < z0 || b.z >= z0 + CHUNK) continue;
            n++;
          }
          if (n > 0) { instances += n; meshes++; }
        }
      }
    }
  }
  return { instances, meshes };
}

function heroBytes(cap) {
  let bytes = 0;
  let instances = 0;
  let meshes = 0;
  const caps = [];
  for (let c = cap; c >= 0; c--) caps.push(c);
  for (const id of ['b1-gate', 'b1-step', 'b1-obelisk']) {
    const lm = layout.landmarkById(id);
    const kind = id === 'b1-gate' ? 'hero-gate' : id === 'b1-step' ? 'hero-step' : 'hero-obelisk';
    const placed = place.placeHero(kind, lm.baseWidth, lm.baseDepth, lm.height, 0.2);
    for (const c of caps) {
      const n = placed.boxes.filter((b) => b.detail <= c && (b.ornament === undefined || b.ornament <= c)).length;
      if (n <= 0) continue;
      bytes += budget.kitMeshBytes(n);
      instances += n;
      meshes++;
    }
  }
  return { bytes, instances, meshes };
}

const memory = {};
for (const tier of ['low', 'medium', 'high', 'ultra']) {
  const cap = tiers.buildingDetailCap(tier);
  let best = null;
  for (const d of districts) {
    const [minX, minZ, maxX, maxZ] = d.bbox;
    const hit = residentAt((minX + maxX) / 2, (minZ + maxZ) / 2, tier);
    if (!best || hit.instances > best.instances) best = { district: d.id, ...hit };
  }
  const heroesMem = heroBytes(cap);
  const fabricBytes = best.instances * budget.KIT_INSTANCE_BYTES + best.meshes * budget.KIT_TEMPLATE_BYTES;
  memory[tier] = {
    texturesMB: 0,
    geometryMB: Number(((fabricBytes + heroesMem.bytes) / (1024 * 1024)).toFixed(3)),
    fabricInstances: best.instances,
    fabricMeshes: best.meshes,
    heroInstances: heroesMem.instances,
    heroMeshes: heroesMem.meshes,
    cameraDistrict: best.district,
    cap,
  };
}

console.log(JSON.stringify({
  fails,
  iou: iouRows,
  financial: { boxes: fin.boxes.length, signs: fin.signs.length, maxTop: Number(finMax.toFixed(1)), clips: finClips },
  dtla: { boxes: dtlaFab.boxes.length, maxTop: Number(dtlaMax.toFixed(1)) },
  heroes: heroes.map((h) => h && { id: h.id, x: Number(h.x.toFixed(1)), z: Number(h.z.toFixed(1)), h: h.height }),
  longBeach: { heroA: Number(heroTop.toFixed(1)), heroB: Number(topB.toFixed(1)), doorCheeks: door.length },
  storey: STOREY,
  tierTris,
  memory,
}, null, 2));

const fabricIndex = await vite.ssrLoadModule('/src/districts/fabric-index.ts');
await fabricIndex.farFabricReady;
await vite.close();
process.exit(fails.length ? 1 : 0);
