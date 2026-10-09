// Hero structures placed from city-layout.json `landmarks`. Each landmark `type` maps to a builder.
// Blockout builders live here; district stages register detailed ones from src/districts/landmark-index.ts
// (Stage 3: `megatower`, `legacy-tower`, `skybridge`, `wallace-pyramid`, `old-pyramid`).
import { Group, Mesh, ShapeGeometry, Shape, Vector2, type Object3D, type Vector3 } from 'three/webgpu';
import { getLayout, type CityLayout } from '../layout';
import { bearingToYaw } from '../geo';
import { GeoWriter, type FaceStyle } from './GeoWriter';
import { getCityMaterial } from '../materials/cityMaterial';
import { makeSignMesh } from '../materials/signMesh';
import { Style, SignColor, type Sign } from '../fabric/types';
import { Rng, hashString } from '../../core/rng';
import type { CityQuery } from '../CityQuery';
import '../../districts/landmark-index';
import { getOceanMaterial } from '../materials/oceanMaterial';
import { Beacons } from './Beacons';
import { Flares } from './Flares';
import { LandmarkLods } from './LandmarkLods';
import { landmarkBuilder, registerLandmarkDefault, registerLandmarkType, type LandmarkCollider, type LandmarkEnv } from './registry';

export { registerLandmarkType };
export type { LandmarkCollider, LandmarkBuild, LandmarkEnv, LandmarkBuilder } from './registry';

const st = (style: number, lit: number, tint: number, seed: number): FaceStyle => ({ style, lit, tint, seed });

function meshOf(w: GeoWriter, name: string): Mesh {
  const m = new Mesh(w.build(), getCityMaterial());
  m.name = name;
  return m;
}

// ---------------------------------------------------------------- slender Wallace towers
registerLandmarkDefault('wallace-tower', (l, env) => {
  const w = new GeoWriter();
  const yaw = bearingToYaw(l.bearingDeg);
  const H = l.height, B = l.baseWidth, Tt = l.topWidth ?? 50;
  const segs = 5;
  const cols: LandmarkCollider[] = [];
  for (let i = 0; i < segs; i++) {
    const f0 = i / segs, f1 = (i + 1) / segs;
    const wb = B + (Tt - B) * Math.pow(f0, 0.8), wt = B + (Tt - B) * Math.pow(f1, 0.8);
    w.frustum(l.x, l.z, H * f0, wb, wb, wt, wt, H * (f1 - f0), yaw, st(Style.Civic, 0.05, 0.55, 0.2 + i * 0.1), i === segs - 1);
    cols.push({ x: l.x, z: l.z, hw: wb / 2, hd: wb / 2, yaw, y0: H * f0, top: H * f1 });
  }
  env.beacons.add(l.x, H + 4, l.z, 1, 10);
  return { object: meshOf(w, l.id), colliders: cols };
});

// ---------------------------------------------------------------- LAPD HQ (top-heavy monolith with inverted-pyramid crown)
registerLandmarkDefault('lapd-hq', (l, env) => {
  const w = new GeoWriter();
  const yaw = bearingToYaw(l.bearingDeg);
  const H = l.height, bw = l.baseWidth, bd = l.baseDepth ?? bw;
  const ch = l.crownHeight ?? 60, cw = l.crownWidth ?? bw * 1.8, cd = l.crownDepth ?? bd * 1.6;
  const shaft = H - ch;
  const face = st(Style.Civic, 0.12, 0.75, 0.42);
  w.box(l.x, l.z, 0, bw * 1.25, bd * 1.25, 18, yaw, st(Style.Civic, 0.5, 0.7, 0.4));
  w.box(l.x, l.z, 18, bw, bd, shaft - 18, yaw, face, false);
  // flaring inverted pyramid crown
  w.frustum(l.x, l.z, shaft, bw, bd, cw, cd, ch, yaw, st(Style.Civic, 0.02, 0.6, 0.47));
  // spinner landing pads on the roof
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const [lx, lz] of [[-cw * 0.28, -cd * 0.3], [cw * 0.28, -cd * 0.3], [-cw * 0.28, cd * 0.3], [cw * 0.28, cd * 0.3]]) {
    w.box(l.x + lx * c + lz * s, l.z - lx * s + lz * c, H, 26, 26, 1.5, yaw, st(Style.Industrial, 0, 0.5, 0.1));
    env.beacons.add(l.x + lx * c + lz * s, H + 2, l.z - lx * s + lz * c, 2, 3);
  }
  env.beacons.add(l.x, H + 8, l.z, 1, 6);
  // the department's lettering is represented by a generic emissive band (stage 5 will letter it properly)
  const signs: Sign[] = [];
  const out = cd / 2 + 0.6;
  signs.push({ x: l.x + out * s, y: shaft + ch * 0.45, z: l.z + out * c, yaw: yaw, w: cw * 0.6, h: ch * 0.35, color: SignColor.White, seed: 0.33, kind: 0 });
  const g = new Group();
  g.add(meshOf(w, l.id), makeSignMesh(signs));
  return {
    object: g,
    colliders: [
      { x: l.x, z: l.z, hw: bw / 2, hd: bd / 2, yaw, y0: 0, top: shaft },
      { x: l.x, z: l.z, hw: cw / 2, hd: cd / 2, yaw, y0: shaft, top: H },
    ],
  };
});

// ---------------------------------------------------------------- heritage tower (old City Hall silhouette)
registerLandmarkDefault('heritage-tower', (l, env) => {
  const w = new GeoWriter();
  const yaw = bearingToYaw(l.bearingDeg);
  const B = l.baseWidth, H = l.height;
  const face = st(Style.Office, 0.45, 1.25, 0.61);
  w.box(l.x, l.z, 0, B * 2.6, B * 1.6, 32, yaw, face);
  w.box(l.x, l.z, 32, B, B, H * 0.6 - 32, yaw, face);
  w.box(l.x, l.z, H * 0.6, B * 0.75, B * 0.75, H * 0.22, yaw, face);
  w.frustum(l.x, l.z, H * 0.82, B * 0.6, B * 0.6, 3, 3, H * 0.18, yaw, face);
  env.beacons.add(l.x, H + 1, l.z, 0, 3);
  return { object: meshOf(w, l.id), colliders: [{ x: l.x, z: l.z, hw: B / 2, hd: B / 2, yaw, y0: 0, top: H }] };
});

// ---------------------------------------------------------------- K's megablock slab
registerLandmarkDefault('megablock-slab', (l, env) => {
  const w = new GeoWriter();
  const yaw = bearingToYaw(l.bearingDeg);
  const H = l.height, bw = l.baseWidth, bd = l.baseDepth ?? 80;
  const face = st(Style.Residential, 0.5, 0.85, 0.27);
  // two slab wings joined by a podium and sky bridges, top-heavy
  w.box(l.x, l.z, 0, bw, bd * 1.3, 24, yaw, st(Style.Market, 0.8, 0.9, 0.2));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const cols: LandmarkCollider[] = [{ x: l.x, z: l.z, hw: bw / 2, hd: bd * 0.65, yaw, y0: 0, top: 24 }];
  for (const k of [-1, 1]) {
    const lx = k * bw * 0.27;
    const x = l.x + lx * c, z = l.z - lx * s;
    w.box(x, z, 24, bw * 0.36, bd * 0.85, H * 0.55 - 24, yaw, face);
    w.box(x, z, H * 0.55, bw * 0.42, bd, H * 0.45, yaw, face);
    cols.push({ x, z, hw: bw * 0.21, hd: bd / 2, yaw, y0: 24, top: H });
  }
  for (const y of [H * 0.35, H * 0.62, H * 0.86]) w.box(l.x, l.z, y, bw * 0.2, bd * 0.3, 8, yaw, st(Style.Industrial, 0.4, 0.8, 0.3));
  env.beacons.add(l.x, H + 2, l.z, 0, 4);
  const signs: Sign[] = [];
  const rng = new Rng(77);
  for (let i = 0; i < 26; i++) {
    const along = rng.range(-bw / 2 + 4, bw / 2 - 4);
    const out = (bd * 0.65 + 0.5) * (i % 2 ? 1 : -1);
    signs.push({ x: l.x + along * c + out * s, y: rng.range(3, 20), z: l.z - along * s + out * c, yaw: yaw + (i % 2 ? 0 : Math.PI), w: rng.range(2, 6), h: rng.range(0.8, 2.5), color: rng.pick([0, 2, 3, 7, 1]), seed: rng.next(), kind: 0 });
  }
  const g = new Group();
  g.add(meshOf(w, l.id), makeSignMesh(signs));
  return { object: g, colliders: cols };
});

// ---------------------------------------------------------------- LAX off-world spaceport gantries
registerLandmarkDefault('spaceport', (l, env) => {
  const w = new GeoWriter();
  const r = new Rng(hashString(l.id));
  const cols: LandmarkCollider[] = [];
  const spots = [[-700, -150], [0, 250], [700, -150]];
  for (const [dx, dz] of spots) {
    const x = l.x + dx, z = l.z + dz;
    w.box(x, z, 0, 220, 220, 6, 0, st(Style.Industrial, 0, 0.6, r.next()));
    w.box(x - 70, z, 6, 34, 34, l.height, 0, st(Style.Industrial, 0.15, 0.7, r.next()));
    for (let k = 1; k <= 6; k++) w.box(x - 40, z, (l.height * k) / 7, 40, 8, 6, 0, st(Style.Industrial, 0.3, 0.6, r.next()));
    // launch vehicle placeholder
    w.frustum(x + 10, z, 6, 40, 40, 14, 14, l.height * 0.75, 0, st(Style.Coastal, 0.02, 1.2, r.next()));
    cols.push({ x: x - 70, z, hw: 17, hd: 17, yaw: 0, y0: 0, top: l.height + 6 });
    cols.push({ x: x + 10, z, hw: 20, hd: 20, yaw: 0, y0: 0, top: l.height * 0.75 });
    env.beacons.add(x - 70, l.height + 8, z, 1, 6);
  }
  // terminal megastructure
  w.box(l.x, l.z + 650, 0, 1400, 180, 70, 0, st(Style.Megablock, 0.4, 0.8, 0.9));
  cols.push({ x: l.x, z: l.z + 650, hw: 700, hd: 90, yaw: 0, y0: 0, top: 70 });
  return { object: meshOf(w, l.id), colliders: cols };
});

// ---------------------------------------------------------------- refinery flare stacks ("Hades" homage)
registerLandmarkDefault('flare-field', (l, env) => {
  const w = new GeoWriter();
  const r = new Rng(hashString(l.id));
  const cols: LandmarkCollider[] = [];
  for (let i = 0; i < 14; i++) {
    const x = l.x + r.range(-l.baseWidth / 2, l.baseWidth / 2);
    const z = l.z + r.range(-(l.baseDepth ?? 800) / 2, (l.baseDepth ?? 800) / 2);
    const h = l.height * r.range(0.6, 1.1);
    w.box(x, z, 0, 5, 5, h, 0, st(Style.Industrial, 0, 0.5, r.next()));
    cols.push({ x, z, hw: 3, hd: 3, yaw: 0, y0: 0, top: h });
    if (r.chance(0.6)) env.flares.add(x, h + 4, z, r.range(8, 22));
    env.beacons.add(x, h + 1, z, 0, 2);
  }
  return { object: meshOf(w, l.id), colliders: cols };
});

// ---------------------------------------------------------------- sea walls + ocean
function buildSeaWalls(layout: CityLayout): { object: Object3D; colliders: LandmarkCollider[] } {
  const w = new GeoWriter();
  const cols: LandmarkCollider[] = [];
  for (const wall of layout.seaWalls) {
    const H = wall.crestHeight, base = wall.baseWidth, crest = wall.crestWidth, T = wall.terraces;
    // cross-section (across, height): landward base -> crest -> stepped seaward face -> toe below the water
    const land = -crest / 2 - 8;
    const prof: number[][] = [[land, -2], [-crest / 2, H], [crest / 2, H]];
    const run = base - crest;
    for (let k = 0; k < T; k++) {
      const x0 = crest / 2 + (run * k) / T;
      const yBot = H - (H * (k + 1)) / T;
      prof.push([x0 + run / T * 0.35, yBot + 2]);
      prof.push([x0 + run / T, yBot]);
    }
    prof.push([base - crest / 2 + 4, -12]);
    let u = 0;
    for (let i = 0; i < wall.pts.length - 1; i++) {
      const [ax, az] = wall.pts[i], [bx, bz] = wall.pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      let nx = -dz / len, nz = dx / len;
      // make +n point to the ocean
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      let flip = false;
      if (!layout.isOcean(mx + nx * 400, mz + nz * 400) && layout.isOcean(mx - nx * 400, mz - nz * 400)) { nx = -nx; nz = -nz; flip = true; }
      // extend segments slightly to hide joints
      const ex = (dx / len) * 6, ez = (dz / len) * 6;
      const A = [ax - ex, az - ez], Bp = [bx + ex, bz + ez];
      for (let k = 0; k < prof.length - 1; k++) {
        const [o0, y0] = prof[k], [o1, y1] = prof[k + 1];
        const p0 = [A[0] + nx * o0, y0, A[1] + nz * o0];
        const p1 = [A[0] + nx * o1, y1, A[1] + nz * o1];
        const q0 = [Bp[0] + nx * o0, y0, Bp[1] + nz * o0];
        const q1 = [Bp[0] + nx * o1, y1, Bp[1] + nz * o1];
        const sl = Math.hypot(o1 - o0, y1 - y0);
        const fs = st(Style.Coastal, k === 1 ? 0.25 : 0.02, 0.7, 0.13 + k * 0.01);
        if (flip) w.quad([p0, q0, q1, p1], [[u, 0], [u + len, 0], [u + len, sl], [u, sl]], fs);
        else w.quad([p0, p1, q1, q0], [[u, 0], [u, sl], [u + len, sl], [u + len, 0]], fs);
      }
      cols.push({ x: mx + nx * (base / 2 - crest / 2), z: mz + nz * (base / 2 - crest / 2), hw: base / 2 + 4, hd: len / 2 + 6, yaw: Math.atan2(nx, nz), y0: -20, top: H });
      u += len;
    }
  }
  // ocean surface: the 2049 sea stands well above the old beaches, held back by the wall
  const shape = new Shape(layout.oceanPoly.map(([x, z]) => new Vector2(x, -z)));
  const og = new ShapeGeometry(shape);
  og.rotateX(-Math.PI / 2);
  og.translate(0, SEA_LEVEL_2049, 0);
  const ocean = new Mesh(og, getOceanMaterial());
  ocean.name = 'ocean';
  const g = new Group();
  g.name = 'sea-walls';
  g.add(meshOf(w, 'sea-wall'), ocean);
  return { object: g, colliders: cols };
}

/** 2049 mean sea level relative to the (flattened) basin floor. */
export const SEA_LEVEL_2049 = 6;

export class Landmarks {
  readonly root = new Group();
  readonly beacons = new Beacons();
  readonly flares = new Flares();
  readonly lods = new LandmarkLods();

  constructor(query: CityQuery) {
    const layout = getLayout();
    this.root.name = 'landmarks';
    const env: LandmarkEnv = { layout, beacons: this.beacons, flares: this.flares, lods: this.lods };
    for (const l of layout.landmarks) {
      const b = landmarkBuilder(l.type);
      if (!b) {
        console.warn(`No landmark builder for type ${l.type} (${l.id})`);
        continue;
      }
      const res = b(l, env);
      res.object.name = res.object.name || l.id;
      this.root.add(res.object);
      query.addColliders(res.colliders);
    }
    const walls = buildSeaWalls(layout);
    this.root.add(walls.object);
    query.addColliders(walls.colliders);
    this.root.add(this.lods.root, this.beacons.build(), this.flares.build());
  }

  /** `scale` stretches the LOD switch distances per quality tier. */
  update(cam: Vector3, scale: number): void {
    this.lods.update(cam, scale);
  }
}
