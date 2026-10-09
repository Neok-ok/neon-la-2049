// LAPD headquarters, Stage 5 hero. Three LODs share the city material.
// The crown is an inverted pyramid (narrow at the shaft, wide at the roof) with a landing deck.
// The lobby is a recess in the podium on the City Hall face: you walk the steps and go in.
// No department insignia. The light band is a glow strip; the only words are the atlas phrase SECTOR 5.
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
import { HQ, PADS, SHAFT_Y, STAIR, localToWorld } from './spec';

export const HQ_LOD_DIST = [520, 1900];

/** Triangle counts per level (detail 2 / 1 / 0), filled when the landmark builds. */
export const hqTris: number[] = [];

const face = (style: number, lit: number, tint: number, seed: number) => ({ style, lit, tint, seed });
const CON = face(Style.Civic, 0.07, 0.74, 0.41);
const DARK = face(Style.Civic, 0.03, 0.52, 0.22);
const SLIT = face(Style.Slit, 0.28, 0.66, 0.55);
const COLD = face(Style.Glow, 0.92, 1.88, 0.18);
const AMBER = face(Style.Glow, 0.8, 1.04, 0.33);
const SOLID = face(Style.Solid, 0.02, 0.48, 0.12);

function stairs(m: Mass): void {
  const { width, z0, z1, y0, y1, n } = STAIR;
  const run = (z1 - z0) / n;
  const rise = (y1 - y0) / n;
  // Colliders are the real treads, so a walk up the steps does not depend on which mesh is showing.
  if (m.max === 2) {
    for (let i = 0; i < n; i++) {
      const z = z0 + run * (i + 0.5);
      m.solid(0, z, width, Math.abs(run) * 0.96, y0 + rise * i, y0 + rise * (i + 1));
    }
    m.solid(-(width / 2 + 0.45), (z0 + z1) / 2, 0.7, Math.abs(z1 - z0), 0, y1 + 0.9);
    m.solid(width / 2 + 0.45, (z0 + z1) / 2, 0.7, Math.abs(z1 - z0), 0, y1 + 0.9);
  }
  const steps = m.max >= 2 ? n : m.max >= 1 ? 8 : 0;
  const rs = (z1 - z0) / Math.max(1, steps);
  const rh = (y1 - y0) / Math.max(1, steps);
  for (let i = 0; i < steps; i++) {
    const z = z0 + rs * (i + 0.5);
    m.box(m.max >= 2 ? 2 : 1, 0, z, y0 + rh * i, width, Math.abs(rs) * 0.94, rh, i % 2 ? CON : DARK);
    if (m.max >= 2 && i % 4 === 3) {
      m.box(2, 0, z + rs * 0.28, y0 + rh * (i + 1) - 0.06, width * 0.92, 0.18, 0.08, COLD);
    }
  }
  if (m.max >= 1) {
    const zc = (z0 + z1) / 2;
    m.box(1, -(width / 2 + 0.45), zc, 0, 0.7, Math.abs(z1 - z0), y1 + 0.9, DARK);
    m.box(1, width / 2 + 0.45, zc, 0, 0.7, Math.abs(z1 - z0), y1 + 0.9, DARK);
    // centre drain, a darker slot so the rain has a line to follow
    m.box(2, 0, zc, y0 + 0.02, 0.55, Math.abs(z1 - z0) * 0.98, 0.05, SOLID);
  }
}

function lobby(m: Mass): void {
  const floor = HQ.lobbyFloor;
  const ceil = HQ.lobbyCeil;
  const door = HQ.doorHalf;
  // Podium face is local −Z. The room runs 17 m back, under the shaft (the shaft collider starts at the podium roof).
  const faceZ = -HQ.podiumD / 2;
  const backZ = -42;
  const wingW = HQ.podiumW / 2 - door;
  const wingCx = door + wingW / 2;
  const rearD = HQ.podiumD / 2 - backZ;
  const rearCz = backZ + rearD / 2;
  const mouthD = backZ - faceZ;
  const mouthCz = (faceZ + backZ) / 2;
  m.solid(-wingCx, 0, wingW, HQ.podiumD, 0, HQ.podiumH);
  m.solid(wingCx, 0, wingW, HQ.podiumD, 0, HQ.podiumH);
  m.solid(0, rearCz, door * 2, rearD, 0, HQ.podiumH);
  m.solid(0, mouthCz, door * 2, mouthD, ceil, HQ.podiumH);
  m.solid(0, mouthCz - 0.4, door * 2 - 0.9, mouthD + 1.1, floor - 0.16, floor);
  m.solid(0, backZ - 1.7, 8.6, 1.35, floor, floor + 1.15);
  for (const lx of [-5.4, 5.4]) {
    for (const lz of [-56.2, -50.4, -45.2]) m.solid(lx, lz, 0.9, 0.9, floor, ceil - 0.05);
  }

  if (m.max < 1) {
    m.box(0, 0, 0, 0, HQ.podiumW, HQ.podiumD, HQ.podiumH, CON);
    return;
  }
  m.box(1, -wingCx, 0, 0, wingW, HQ.podiumD, HQ.podiumH, CON);
  m.box(1, wingCx, 0, 0, wingW, HQ.podiumD, HQ.podiumH, CON);
  m.box(1, 0, rearCz, 0, door * 2, rearD, HQ.podiumH, CON);
  m.soffit(1, 0, mouthCz, ceil, door * 2, mouthD, HQ.podiumH - ceil, DARK);
  m.box(1, 0, mouthCz - 0.35, floor - 0.16, door * 2 - 0.7, mouthD + 0.9, 0.16, DARK);
  m.box(1, -door, faceZ - 0.15, floor, 0.55, 0.8, ceil - floor, DARK);
  m.box(1, door, faceZ - 0.15, floor, 0.55, 0.8, ceil - floor, DARK);
  m.box(2, 0, faceZ - 0.25, ceil - 0.4, door * 2 - 0.5, 0.4, 0.32, COLD);

  if (m.max < 2) return;
  m.box(2, 0, backZ - 1.7, floor, 8.6, 1.35, 1.15, SOLID);
  m.box(2, 0, backZ - 1.7, floor + 1.05, 8.6, 0.16, 0.1, COLD);
  m.box(2, 0, mouthCz, floor, 1.2, mouthD - 1.2, 0.05, COLD);
  m.box(2, 0, backZ - 0.4, floor + 1.4, 13, 0.45, 6.8, COLD);
  for (const lx of [-5.4, 5.4]) {
    for (const lz of [-56.2, -50.4, -45.2]) m.box(2, lx, lz, floor, 0.9, 0.9, ceil - floor - 0.1, CON);
  }
  m.box(2, -door + 0.4, mouthCz, floor, 0.45, mouthD - 0.6, ceil - floor, DARK);
  m.box(2, door - 0.4, mouthCz, floor, 0.45, mouthD - 0.6, ceil - floor, DARK);
  // low barriers in the aisle and a directory on the right. The centre line stays open.
  for (const lx of [-3.6, 3.6]) {
    m.box(2, lx, -48.6, floor, 0.32, 2.2, 1.05, SOLID);
    m.solid(lx, -48.6, 0.32, 2.2, floor, floor + 1.05);
  }
  m.box(2, 6.6, -49.5, floor, 0.28, 1.6, 2.4, DARK);
  m.solid(6.6, -49.5, 0.28, 1.6, floor, floor + 2.4);
  m.box(2, 6.6, -49.2, floor + 1.45, 0.12, 1.15, 0.7, COLD);
}

function shaftAndCrown(m: Mass): void {
  const H = HQ.height;
  m.box(0, 0, 0, HQ.podiumH, HQ.shaftW, HQ.shaftD, SHAFT_Y - HQ.podiumH, CON);
  m.frustum(0, 0, 0, SHAFT_Y, HQ.shaftW, HQ.shaftD, HQ.crownW, HQ.crownD, HQ.crownH, DARK);
  if (m.max === 2) {
    m.solid(0, 0, HQ.shaftW, HQ.shaftD, HQ.podiumH, SHAFT_Y);
    m.solid(0, 0, HQ.crownW, HQ.crownD, SHAFT_Y, H);
  }
  if (m.max < 1) return;

  // mechanical belts and a slit core on the east face
  m.box(1, 0, 0, 58, HQ.shaftW + 1.2, HQ.shaftD + 1.2, 4.2, DARK);
  m.box(1, 0, 0, 108, HQ.shaftW + 1.6, HQ.shaftD + 1.6, 4.6, DARK);
  m.box(1, HQ.shaftW / 2 + 0.7, 0, HQ.podiumH, 2.2, 14, SHAFT_Y - HQ.podiumH, SLIT);
  // collar where the crown takes off
  m.box(1, 0, 0, SHAFT_Y - 2.2, HQ.shaftW + 3.2, HQ.shaftD + 3.2, 3.4, DARK);
  for (const f of [0.34, 0.66]) {
    const w = HQ.shaftW + (HQ.crownW - HQ.shaftW) * f + 1.4;
    const d = HQ.shaftD + (HQ.crownD - HQ.shaftD) * f + 1.4;
    m.box(1, 0, 0, SHAFT_Y + HQ.crownH * f, w, d, 1.35, f > 0.5 ? COLD : DARK);
  }
  m.box(1, 0, 0, SHAFT_Y + HQ.crownH - 1.5, HQ.crownW + 1.2, HQ.crownD + 1.2, 1.5, COLD);
  // tall slits on the approach face, in the gaps between the fins
  for (const y of [40, 78, 96, 128]) {
    for (const x of [-16, -8, 8, 16]) m.box(1, x, -HQ.shaftD / 2 - 0.4, y, 4.2, 0.5, 6.5, SLIT);
  }

  if (m.max < 2) return;
  // fins, broken by the belts so they don't pass through them
  const bands: Array<[number, number]> = [[HQ.podiumH + 2, 56], [64.5, 106], [115, SHAFT_Y - 3]];
  const fin = (lx: number, lz: number, w: number, d: number) => {
    for (const [y0, y1] of bands) m.box(2, lx, lz, y0, w, d, y1 - y0, DARK);
  };
  for (let z = -44; z <= 44; z += 8) {
    fin(-HQ.shaftW / 2 - 0.7, z, 1.5, 0.7);
    fin(HQ.shaftW / 2 + 0.7, z, 1.5, 0.7);
  }
  for (let x = -28; x <= 28; x += 8) {
    fin(x, -HQ.shaftD / 2 - 0.7, 0.7, 1.5);
    fin(x, HQ.shaftD / 2 + 0.7, 0.7, 1.5);
  }
  // light bands on the approach face and on the crown lip (the "white band", not a wordmark)
  m.box(2, 0, -HQ.shaftD / 2 - 0.55, 26, 42, 0.7, 2.6, COLD);
  const f = 0.58;
  const lipD = HQ.shaftD / 2 + ((HQ.crownD - HQ.shaftD) / 2) * f;
  m.box(2, 0, -(lipD + 0.45), SHAFT_Y + HQ.crownH * f, 56, 0.8, 2.4, COLD);
  m.box(2, 0, lipD + 0.45, SHAFT_Y + HQ.crownH * f, 36, 0.7, 1.8, COLD);
}

function deck(m: Mass): void {
  const H = HQ.height;
  if (m.max >= 2) {
    for (const p of PADS) m.solid(p.lx, p.lz, HQ.pad, HQ.pad, H, H + HQ.padH);
    m.solid(0, 0, 1.4, 1.4, H, H + 6);
  }
  if (m.max < 1) return;
  for (const p of PADS) {
    m.box(1, p.lx, p.lz, H, HQ.pad, HQ.pad, HQ.padH, DARK);
    const e = HQ.pad / 2 - 0.45;
    m.box(1, p.lx, p.lz - e, H + HQ.padH, HQ.pad - 1, 0.35, 0.16, AMBER);
    m.box(1, p.lx, p.lz + e, H + HQ.padH, HQ.pad - 1, 0.35, 0.16, AMBER);
    m.box(1, p.lx - e, p.lz, H + HQ.padH, 0.35, HQ.pad - 1, 0.16, AMBER);
    m.box(1, p.lx + e, p.lz, H + HQ.padH, 0.35, HQ.pad - 1, 0.16, AMBER);
  }
  // taxiway between the plaza-side pads and a lip around the crown
  m.box(1, 0, -38, H + 0.02, 78, 1.1, 0.12, AMBER);
  m.box(1, 0, 38, H + 0.02, 78, 1.1, 0.12, AMBER);
  m.box(2, 0, 0, H + HQ.padH, 1.2, 1.2, 6, DARK);
  const lip = 0.9;
  m.box(2, 0, HQ.crownD / 2 - lip / 2, H, HQ.crownW, lip, 0.7, DARK);
  m.box(2, 0, -(HQ.crownD / 2 - lip / 2), H, HQ.crownW, lip, 0.7, DARK);
  m.box(2, HQ.crownW / 2 - lip / 2, 0, H, lip, HQ.crownD, 0.7, DARK);
  m.box(2, -(HQ.crownW / 2 - lip / 2), 0, H, lip, HQ.crownD, 0.7, DARK);
}

function forecourt(m: Mass, hall: { x: number; z: number } | undefined): void {
  // paving at the foot of the steps, inside the reserve
  m.box(0, 0, -89, 0.02, 46, 22, 0.16, DARK);
  if (m.max === 2) m.solid(0, -89, 46, 22, 0.02, 0.18);
  if (m.max >= 2) {
    m.box(2, 0, -84, 0.18, 40, 0.25, 0.05, SOLID);
    m.box(2, 0, -94, 0.18, 40, 0.25, 0.05, SOLID);
  }
  if (!hall || m.max < 1) return;
  // the gap between the forecourts, along the line to City Hall
  const dx = hall.x - m.x, dz = hall.z - m.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const yaw = Math.atan2(ux, uz);
  const a = 108, b = len - 58;
  if (b - a < 20) return;
  const mid = (a + b) / 2;
  const cx = m.x + ux * mid, cz = m.z + uz * mid;
  const depth = b - a;
  m.worldBox(1, cx, cz, yaw, 0.02, 34, depth, 0.14, DARK);
  if (m.max === 2) m.worldSolid(cx, cz, yaw, 34, depth, 0.02, 0.16);
  // two darker joints so the mall reads as slabs, not one texture
  if (m.max >= 2) {
    m.worldBox(2, cx, cz, yaw, 0.16, 0.4, depth * 0.96, 0.04, SOLID);
  }
}

function writeHq(m: Mass, hall: { x: number; z: number } | undefined): void {
  stairs(m);
  lobby(m);
  shaftAndCrown(m);
  deck(m);
  forecourt(m, hall);
}

function signsFor(l: Landmark, yaw: number): Sign[] {
  const at = (lx: number, y: number, lz: number, w: number, h: number, syaw: number, seed: number, kind: 0 | 2): Sign => {
    const [x, z] = localToWorld(l.x, l.z, yaw, lx, lz);
    return { x, y, z, yaw: syaw, w, h, color: SignColor.White, seed, kind };
  };
  const out = yaw + Math.PI;
  return [
    // over the door, readable from the steps. Atlas cell is the invented "SECTOR 5", not a badge.
    at(0, 9.4, -HQ.podiumD / 2 - 0.5, 9.2, 1.55, out, phraseSeed(39), 0),
    at(0, 8.4, -42.7, 6.4, 1.2, out, phraseSeed(39), 0),
  ];
}

function beacons(l: Landmark, env: LandmarkEnv, yaw: number): void {
  const add = (lx: number, y: number, lz: number, kind: number, size: number) => {
    const [x, z] = localToWorld(l.x, l.z, yaw, lx, lz);
    env.beacons.add(x, y, z, kind, size);
  };
  for (const p of PADS) {
    const e = HQ.pad / 2 - 1.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      add(p.lx + sx * e, HQ.height + HQ.padH + 0.4, p.lz + sz * e, LightKind.Pad, 2.4);
    }
  }
  add(0, HQ.height + 7.2, 0, LightKind.Strobe, 5);
  const cw = HQ.crownW / 2 - 2, cd = HQ.crownD / 2 - 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * cw, HQ.height + 1.2, sz * cd, LightKind.Police, 3.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * (HQ.shaftW / 2 - 1), SHAFT_Y * 0.55, sz * (HQ.shaftD / 2 - 1), LightKind.Steady, 2.2);
  add(-6.4, 8.2, -HQ.podiumD / 2 - 1.2, LightKind.Police, 1.8);
  add(6.4, 8.2, -HQ.podiumD / 2 - 1.2, LightKind.Police, 1.8);
  add(-18, 6.5, -96, LightKind.Warm, 7);
  add(18, 6.5, -96, LightKind.Warm, 7);
  add(0, 7.2, -70, LightKind.Warm, 5);
}

export function buildLapdHq(l: Landmark, env: LandmarkEnv) {
  const yaw = bearingToYaw(l.bearingDeg);
  const hall = env.layout.landmarkById('city-hall');
  const levels: { mesh: Mesh; tris: number; cols: Mass['cols'] }[] = [];
  for (const d of [2, 1, 0] as Detail[]) {
    const w = new GeoWriter();
    const m = new Mass(w, l.x, l.z, yaw, d);
    writeHq(m, hall);
    const mesh = new Mesh(w.build(), getCityMaterial());
    mesh.name = `${l.id}-d${d}`;
    levels.push({ mesh, tris: (mesh.geometry.index?.count ?? 0) / 3, cols: m.cols });
  }
  hqTris.splice(0, hqTris.length, ...levels.map((lv) => lv.tris));
  const full = levels[0]!;
  const signs = makeSignMesh(signsFor(l, yaw));
  signs.name = `${l.id}-signs`;
  const lod0 = levelGroup(full.mesh, signs);
  const r = Math.hypot(HQ.crownW, HQ.crownD) / 2;
  const object = env.lods.add(l.id, [lod0, levels[1]!.mesh, levels[2]!.mesh], HQ_LOD_DIST, l.x, l.z, 0, HQ.height + 8, r);
  beacons(l, env, yaw);
  return { object, colliders: full.cols };
}

registerLandmarkType('lapd-hq', buildLapdHq);
