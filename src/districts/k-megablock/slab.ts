// K's megablock. One 185 × 230 × 85 m residential slab, three LODs, city material only.
// The lobby, K's floor and the shaft are holes in the collider so the interior stream can sit inside.
// The roof cap stays solid. The head-house is a shell with no collider.
import { Mesh } from 'three/webgpu';
import { bearingToYaw } from '../../world/geo';
import { GeoWriter } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { makeSignMesh } from '../../world/materials/signMesh';
import { Style, SignColor, type Sign } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import { registerLandmarkType, type LandmarkEnv } from '../../world/landmarks/registry';
import { LightKind } from '../../world/landmarks/Beacons';
import type { Landmark } from '../../world/layout';
import { levelGroup } from '../_shared/megatower/place';
import { Mass, type Detail } from './mass';
import {
  HD, HW, K_Y, LOD_DIST, PAD, SLAB_D, SLAB_H, SLAB_W,
  localToWorld, slabHoles, type SlabRect,
} from './spec';

export const slabTris: number[] = [];

const face = (style: number, lit: number, tint: number, seed: number) => ({ style, lit, tint, seed });
const RES = face(Style.Residential, 0.16, 0.82, 0.37);
const BAND = face(Style.Solid, 0.04, 0.5, 0.18);
const DARK = face(Style.Solid, 0.03, 0.4, 0.14);
const SLIT = face(Style.Slit, 0.22, 0.7, 0.44);
const AMBER = face(Style.Glow, 0.72, 1.02, 0.31);

function subtract(base: SlabRect, holes: SlabRect[]): SlabRect[] {
  let parts = [base];
  for (const h of holes) {
    const next: SlabRect[] = [];
    for (const p of parts) {
      const ix0 = Math.max(p.x0, h.x0), ix1 = Math.min(p.x1, h.x1);
      const iz0 = Math.max(p.z0, h.z0), iz1 = Math.min(p.z1, h.z1);
      if (ix1 - ix0 < 0.05 || iz1 - iz0 < 0.05) { next.push(p); continue; }
      if (ix0 - p.x0 > 0.05) next.push({ x0: p.x0, x1: ix0, z0: p.z0, z1: p.z1 });
      if (p.x1 - ix1 > 0.05) next.push({ x0: ix1, x1: p.x1, z0: p.z0, z1: p.z1 });
      if (iz0 - p.z0 > 0.05) next.push({ x0: ix0, x1: ix1, z0: p.z0, z1: iz0 });
      if (p.z1 - iz1 > 0.05) next.push({ x0: ix0, x1: ix1, z0: iz1, z1: p.z1 });
    }
    parts = next;
  }
  return parts;
}

function solids(m: Mass, rects: SlabRect[], y0: number, y1: number): void {
  if (m.max !== 2) return;
  for (const r of rects) {
    m.solid((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, y0, y1);
  }
}

function body(m: Mass, g: number): void {
  const foot: SlabRect = { x0: -HW, x1: HW, z0: -HD, z1: HD };
  const lobby = slabHoles('ground')[1]!;
  const y = (h: number) => g + h;
  const westW = lobby.x0 - (-HW);
  const eastW = HW - lobby.x1;
  m.box(0, (-HW + lobby.x0) / 2, 0, y(0), westW, SLAB_D, 3.6, RES);
  m.box(0, (lobby.x1 + HW) / 2, 0, y(0), eastW, SLAB_D, 3.6, RES);
  const northD = lobby.z0 - (-HD);
  m.box(0, (lobby.x0 + lobby.x1) / 2, (-HD + lobby.z0) / 2, y(0), lobby.x1 - lobby.x0, northD, 3.6, RES);
  m.soffit(0, (lobby.x0 + lobby.x1) / 2, (lobby.z0 + HD) / 2, y(3.5), lobby.x1 - lobby.x0, HD - lobby.z0, 0.16, DARK);
  m.box(0, 0, 0, y(3.6), SLAB_W, SLAB_D, SLAB_H - 3.6, RES);

  solids(m, subtract(foot, slabHoles('ground')), y(0), y(3.6));
  solids(m, subtract(foot, slabHoles('shaft')), y(3.6), y(K_Y - 0.2));
  solids(m, subtract(foot, slabHoles('floor')), y(K_Y - 0.2), y(K_Y + 3.2));
  solids(m, subtract(foot, slabHoles('shaft')), y(K_Y + 3.2), y(SLAB_H - 0.14));
  solids(m, [foot], y(SLAB_H - 0.14), y(SLAB_H));
}

function bands(m: Mass, g: number): void {
  if (m.max < 1) return;
  const prot = 0.42;
  for (let h = 12; h < SLAB_H - 6; h += 13.6) {
    const yy = g + h;
    m.box(1, 0, HD + prot / 2, yy, SLAB_W + 0.2, prot, 0.62, BAND);
    m.box(1, 0, -(HD + prot / 2), yy, SLAB_W + 0.2, prot, 0.62, BAND);
    m.box(1, HW + prot / 2, 0, yy, prot, SLAB_D, 0.62, BAND);
    m.box(1, -(HW + prot / 2), 0, yy, prot, SLAB_D, 0.62, BAND);
  }
  m.box(1, 24, HD + 0.3, g + 10, 2.4, 0.55, 158, SLIT);
  m.box(1, 78, -(HD + 0.28), g + 14, 2.1, 0.5, 150, SLIT);
  m.box(1, -36, -(HD + 0.28), g + 18, 1.7, 0.45, 142, SLIT);
}

function clutter(m: Mass, g: number): void {
  if (m.max < 2) return;
  for (const x of [-78, -48, -8, 28, 62, 98]) {
    m.box(2, x, HD + 0.4, g + 4.4, 1.7, 0.65, 1.05, DARK);
    m.box(2, x + 0.4, HD + 0.55, g + 6.6, 1.05, 0.4, 0.62, DARK);
  }
  for (const x of [-55, 15, 85]) m.box(2, x, -(HD + 0.4), g + 5.2, 1.5, 0.55, 0.9, DARK);
  for (const h of [7.4, 10.8, 14.2]) m.box(2, 36, HD + 0.35, g + h, 70, 0.32, 0.14, BAND);
}

function roof(m: Mass, g: number): void {
  const H = g + SLAB_H;
  if (m.max >= 1) {
    const lip = 0.5;
    m.box(1, 0, HD - lip / 2, H, SLAB_W, lip, 0.85, DARK);
    m.box(1, 0, -(HD - lip / 2), H, SLAB_W, lip, 0.85, DARK);
    m.box(1, HW - lip / 2, 0, H, lip, SLAB_D, 0.85, DARK);
    m.box(1, -(HW - lip / 2), 0, H, lip, SLAB_D, 0.85, DARK);
    m.box(1, PAD.x, PAD.z, H, PAD.size, PAD.size, 0.06, DARK);
    const e = PAD.size / 2 - 0.55;
    m.box(1, PAD.x, PAD.z - e, H + 0.06, PAD.size - 1.6, 0.26, 0.08, AMBER);
    m.box(1, PAD.x, PAD.z + e, H + 0.06, PAD.size - 1.6, 0.26, 0.08, AMBER);
    m.box(1, PAD.x - e, PAD.z, H + 0.06, 0.26, PAD.size - 1.6, 0.08, AMBER);
    m.box(1, PAD.x + e, PAD.z, H + 0.06, 0.26, PAD.size - 1.6, 0.08, AMBER);
    m.box(1, PAD.x, PAD.z + 1.6, H + 0.06, 0.28, 3.4, 0.07, AMBER);
    m.box(1, PAD.x + 1.1, PAD.z - 1.2, H + 0.06, 2.2, 0.22, 0.07, AMBER);
    m.box(1, PAD.x - 1.1, PAD.z - 1.2, H + 0.06, 2.2, 0.22, 0.07, AMBER);
  }
  if (m.max < 2) return;
  m.box(2, 52, -16, H, 7.5, 4.2, 2.0, DARK);
  m.box(2, 86, 4, H, 3.6, 3.6, 1.8, DARK);
  m.box(2, -16, -26, H, 5.5, 3.2, 1.6, DARK);
  m.box(2, 36, -28, H, 0.7, 0.7, 4.8, DARK);
  headShell(m, H);
}

function headShell(m: Mass, H: number): void {
  const x0 = -100.95, x1 = -96.25, z0 = 25.45, z1 = 29.05;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0, d = z1 - z0;
  m.box(1, x0, cz, H, 0.28, d, 2.75, DARK);
  m.box(1, cx, z0, H, w, 0.28, 2.75, DARK);
  m.box(1, cx, z1, H, w, 0.28, 2.75, DARK);
  m.box(1, cx, cz, H + 2.6, w + 0.2, d + 0.2, 0.22, DARK);
  const gap = 1.55;
  const cheek = (d - gap) / 2;
  m.box(1, x1, z0 + cheek / 2, H, 0.26, cheek, 2.75, DARK);
  m.box(1, x1, z1 - cheek / 2, H, 0.26, cheek, 2.75, DARK);
  m.box(1, x1, cz, H + 2.15, 0.26, gap, 0.6, DARK);
}

function market(m: Mass, g: number): void {
  const runs: Array<[number, number]> = [[-HW + 0.4, -112], [-92, HW - 0.6]];
  for (const [a, b] of runs) {
    const w = b - a;
    const cx = (a + b) / 2;
    const z = HD + 2.35;
    m.box(m.max >= 1 ? 1 : 0, cx, z, g + 3.12, w, 4.4, 0.2, DARK);
    if (m.max === 2) m.solid(cx, z, w, 4.4, g + 3.12, g + 3.36);
    if (m.max < 2) continue;
    for (let x = a + 3; x < b - 1.5; x += 14) {
      m.box(2, x, HD + 4.3, g, 0.28, 0.28, 3.12, DARK);
      m.solid(x, HD + 4.3, 0.32, 0.32, g, g + 3.12);
    }
  }
  if (m.max !== 2) return;
  m.solid(-70, HD + 1.55, 4.4, 0.85, g, g + 1.08);
  m.solid(-40, HD + 1.1, 6.2, 0.7, g, g + 1.85);
}

function writeSlab(m: Mass, g: number): void {
  body(m, g);
  bands(m, g);
  clutter(m, g);
  roof(m, g);
  market(m, g);
}

function signsFor(l: Landmark, yaw: number, g: number): Sign[] {
  const at = (lx: number, y: number, lz: number, w: number, h: number, seed: number): Sign => {
    const [x, z] = localToWorld(l.x, l.z, yaw, lx, lz);
    return { x, y: g + y, z, yaw, w, h, color: SignColor.Amber, seed, kind: 0 };
  };
  return [
    at(-102, 4.35, HD + 0.35, 8.4, 1.35, phraseSeed(4)),
    at(-70, 2.55, HD + 1.15, 3.2, 0.7, phraseSeed(1)),
    at(-73.2, 2.35, HD + 1.15, 1.8, 0.55, phraseSeed(0)),
    at(-40, 2.15, HD + 0.7, 3.6, 0.8, phraseSeed(58)),
  ];
}

function beacons(l: Landmark, env: LandmarkEnv, yaw: number, g: number): void {
  const add = (lx: number, y: number, lz: number, kind: number, size: number) => {
    const [x, z] = localToWorld(l.x, l.z, yaw, lx, lz);
    env.beacons.add(x, g + y, z, kind, size);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(sx * (HW - 2.2), SLAB_H + 1.15, sz * (HD - 1.6), LightKind.Red, 3.4);
  }
  add(0, SLAB_H + 1.15, HD - 1.6, LightKind.Red, 3.2);
  add(0, SLAB_H + 1.15, -(HD - 1.6), LightKind.Red, 3.2);
  const e = PAD.size / 2 - 1.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(PAD.x + sx * e, SLAB_H + 0.55, PAD.z + sz * e, LightKind.Pad, 2.2);
  }
  add(-70, 3.3, HD + 2.2, LightKind.Warm, 1.8);
  add(-102, 3.5, HD + 0.8, LightKind.Warm, 1.5);
  add(-40, 2.6, HD + 1.4, LightKind.Warm, 1.3);
}

export function buildMegablockSlab(l: Landmark, env: LandmarkEnv) {
  const yaw = bearingToYaw(l.bearingDeg);
  const g = env.layout.heightAt(l.x, l.z);
  const levels: { mesh: Mesh; tris: number; cols: Mass['cols'] }[] = [];
  for (const d of [2, 1, 0] as Detail[]) {
    const w = new GeoWriter();
    const m = new Mass(w, l.x, l.z, yaw, d);
    writeSlab(m, g);
    const mesh = new Mesh(w.build(), getCityMaterial());
    mesh.name = `${l.id}-d${d}`;
    levels.push({ mesh, tris: (mesh.geometry.index?.count ?? 0) / 3, cols: m.cols });
  }
  slabTris.splice(0, slabTris.length, ...levels.map((lv) => lv.tris));
  if (slabTris[0]! > 10000 || slabTris[1]! > 2500 || slabTris[2]! > 200) {
    console.warn(`megablock-slab LOD tris ${slabTris.join('/')}`);
  }
  const full = levels[0]!;
  const signs = makeSignMesh(signsFor(l, yaw, g));
  signs.name = `${l.id}-signs`;
  const lod0 = levelGroup(full.mesh, signs);
  const r = Math.hypot(HW, HD);
  const object = env.lods.add(l.id, [lod0, levels[1]!.mesh, levels[2]!.mesh], LOD_DIST, l.x, l.z, g, g + SLAB_H + 8, r);
  beacons(l, env, yaw, g);
  return { object, colliders: full.cols };
}

registerLandmarkType('megablock-slab', buildMegablockSlab);
