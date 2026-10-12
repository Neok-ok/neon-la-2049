// Old City Hall, kept and re-clad. The pale shaft and pyramid are the 1928 tower;
// the dark podium is the 2049 concrete jacket. The beacon is a lamp, not a copied sculpture,
// and there is no seal. The ceremonial stair faces LAPD, across the mall.
import { Mesh } from 'three/webgpu';
import { bearingToYaw } from '../../world/geo';
import { GeoWriter } from '../../world/landmarks/GeoWriter';
import { createLandmarkLevels, landmarkLevel } from '../../world/landmarks/authoredModel';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { makeSignMesh } from '../../world/materials/signMesh';
import { Style, SignColor, type Sign } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import { registerLandmarkType, type LandmarkEnv } from '../../world/landmarks/registry';
import { LightKind } from '../../world/landmarks/Beacons';
import type { Landmark } from '../../world/layout';
import { openDoorLeaf } from '../../world/architecture/trim';
import { Mass } from './mass';
import { HALL, HALL_STAIR, localToWorld } from './spec';

export const HALL_LOD_DIST = [420, 1500];
export const hallTris: number[] = [];

const face = (style: number, lit: number, tint: number, seed: number) => ({ style, lit, tint, seed });
const STONE = face(Style.Office, 0.14, 1.34, 0.62);
const JACKET = face(Style.Civic, 0.05, 0.58, 0.27);
const DARK = face(Style.Civic, 0.03, 0.46, 0.16);
const COLD = face(Style.Glow, 0.85, 1.75, 0.4);
const WARM = face(Style.Glow, 0.9, 1.02, 0.7);

function stairs(m: Mass): void {
  const { width, z0, z1, y0, y1, n } = HALL_STAIR;
  const run = (z1 - z0) / n;
  const rise = (y1 - y0) / n;
  if (m.max === 2) {
    for (let i = 0; i < n; i++) {
      const z = z0 + run * (i + 0.5);
      m.solid(0, z, width, Math.abs(run) * 0.96, y0 + rise * i, y0 + rise * (i + 1));
    }
  }
  const steps = m.max >= 1 ? n : 0;
  const rs = (z1 - z0) / n;
  const rh = (y1 - y0) / n;
  for (let i = 0; i < steps; i++) {
    const z = z0 + rs * (i + 0.5);
    m.box(m.max >= 2 ? 2 : 1, 0, z, y0 + rh * i, width, Math.abs(rs) * 0.94, rh, i % 2 ? JACKET : DARK);
  }
  if (m.max >= 1) {
    const zc = (z0 + z1) / 2;
    m.box(1, -(width / 2 + 0.4), zc, 0, 0.65, Math.abs(z1 - z0), y1 + 1.05, DARK);
    m.box(1, width / 2 + 0.4, zc, 0, 0.65, Math.abs(z1 - z0), y1 + 1.05, DARK);
  }
}

function portico(m: Mass): void {
  const floor = HALL_STAIR.y1;
  const ceil = 10.2;
  // The porch stays wide. The walk-through hole is a 2.2 m leaf.
  const hall = 6.0;
  const leaf = 1.1;
  const head = floor + 2.2;
  const faceZ = HALL.baseD / 2;
  const backZ = faceZ - 5.2;
  const wingW = HALL.baseW / 2 - hall;
  const wingCx = hall + wingW / 2;
  const frontD = faceZ - backZ;
  const rearD = backZ - (-HALL.baseD / 2);
  const rearCz = -HALL.baseD / 2 + rearD / 2;
  const mouthCz = (faceZ + backZ) / 2;
  const jambW = hall - leaf;
  const jambX = leaf + jambW / 2;
  m.solid(-wingCx, 0, wingW, HALL.baseD, 0, HALL.baseH);
  m.solid(wingCx, 0, wingW, HALL.baseD, 0, HALL.baseH);
  m.solid(0, rearCz, hall * 2, rearD, 0, HALL.baseH);
  m.solid(0, mouthCz, hall * 2, frontD, ceil, HALL.baseH);
  m.solid(0, mouthCz + 0.3, hall * 2 - 0.8, frontD + 0.8, floor - 0.14, floor);
  m.solid(-jambX, faceZ, jambW, 0.7, floor, ceil);
  m.solid(jambX, faceZ, jambW, 0.7, floor, ceil);
  m.solid(0, faceZ, leaf * 2, 0.7, head, ceil);
  // landing from the portico out to the top tread
  m.solid(0, 34.2, 16, 8.4, floor - 0.14, floor);

  if (m.max < 1) {
    m.box(0, 0, 0, 0, HALL.baseW, HALL.baseD, HALL.baseH, JACKET);
    return;
  }
  m.box(1, -wingCx, 0, 0, wingW, HALL.baseD, HALL.baseH, JACKET);
  m.box(1, wingCx, 0, 0, wingW, HALL.baseD, HALL.baseH, JACKET);
  m.box(1, 0, rearCz, 0, hall * 2, rearD, HALL.baseH, JACKET);
  m.soffit(1, 0, mouthCz, ceil, hall * 2, frontD, HALL.baseH - ceil, DARK);
  m.box(1, 0, mouthCz + 0.2, floor - 0.14, hall * 2 - 0.6, frontD + 0.5, 0.14, DARK);
  m.box(1, -jambX, faceZ + 0.15, floor, jambW, 0.55, ceil - floor, DARK);
  m.box(1, jambX, faceZ + 0.15, floor, jambW, 0.55, ceil - floor, DARK);
  m.box(1, 0, faceZ + 0.2, head, leaf * 2 + 0.4, 0.5, ceil - head, DARK);
  m.box(1, 0, 34.2, floor - 0.14, 16, 8.4, 0.14, DARK);
  // Piers flank the leaf. They sit on the landing, outside the 2.2 m hole.
  if (m.max >= 2) {
    for (const lx of [-8.4, -3.1, 3.1, 8.4]) {
      m.box(2, lx, faceZ + 1.6, floor, 1.15, 1.15, 6.4, STONE);
      m.solid(lx, faceZ + 1.6, 1.15, 1.15, floor, floor + 6.4);
    }
    m.box(2, 0, faceZ + 1.6, floor + 6.4, 20, 1.3, 0.7, STONE);
    m.box(2, 0, backZ + 0.25, floor + 4.2, 8.5, 0.22, 0.4, COLD);
  }
}

function tower(m: Mass): void {
  const shaftH = HALL.shaftTop - HALL.baseH;
  m.box(0, 0, 0, HALL.baseH, HALL.shaft, HALL.shaft, shaftH, STONE);
  m.box(0, 0, 0, HALL.shaftTop, HALL.neck, HALL.neck, HALL.neckTop - HALL.shaftTop, STONE);
  m.frustum(0, 0, 0, HALL.neckTop, HALL.neck - 2, HALL.neck - 2, 4.2, 4.2, HALL.pyramidTop - HALL.neckTop, STONE);
  m.box(0, 0, 0, HALL.pyramidTop, 3.2, 3.2, HALL.height - HALL.pyramidTop, WARM);
  if (m.max === 2) {
    m.solid(0, 0, HALL.shaft, HALL.shaft, HALL.baseH, HALL.shaftTop);
    m.solid(0, 0, HALL.neck, HALL.neck, HALL.shaftTop, HALL.neckTop);
    m.solid(0, 0, HALL.neck, HALL.neck, HALL.neckTop, HALL.height);
  }
  if (m.max < 1) return;
  // setbacks the real tower is known for, drawn as rings rather than a traced profile
  m.box(1, 0, 0, HALL.baseH - 1.2, HALL.shaft + 6, HALL.shaft + 6, 2.4, STONE);
  m.box(1, 0, 0, 62, HALL.shaft + 2.4, HALL.shaft + 2.4, 2.2, STONE);
  m.box(1, 0, 0, 84, HALL.shaft + 1.4, HALL.shaft + 1.4, 1.8, STONE);
  m.box(1, 0, 0, HALL.neckTop - 1.4, HALL.neck + 2, HALL.neck + 2, 2.2, COLD);
  m.box(1, 0, 0, HALL.pyramidTop, 5.5, 5.5, 2.4, WARM);
  if (m.max < 2) return;
  // vertical piers on the shaft, the art-deco read without copying a relief
  for (const x of [-12, -6, 0, 6, 12]) {
    m.box(2, x, HALL.shaft / 2 + 0.45, HALL.baseH, 1.15, 0.9, shaftH, STONE);
    m.box(2, x, -(HALL.shaft / 2 + 0.45), HALL.baseH, 1.15, 0.9, shaftH, STONE);
  }
  for (const z of [-10, -4, 4, 10]) {
    m.box(2, HALL.shaft / 2 + 0.45, z, HALL.baseH, 0.9, 1.15, shaftH, STONE);
    m.box(2, -(HALL.shaft / 2 + 0.45), z, HALL.baseH, 0.9, 1.15, shaftH, STONE);
  }
  // grooves in the jacket, on the approach face
  for (let x = -36; x <= 36; x += 9) {
    m.box(2, x, HALL.baseD / 2 + 0.35, 2, 1.3, 0.55, HALL.baseH - 4, DARK);
  }
}

function court(m: Mass): void {
  m.box(0, 0, 58, 0.02, 30, 16, 0.14, DARK);
  if (m.max === 2) m.solid(0, 58, 30, 16, 0.02, 0.16);
}

function writeHall(m: Mass): void {
  stairs(m);
  portico(m);
  tower(m);
  court(m);
}

function signsFor(l: Landmark, yaw: number): Sign[] {
  const [x, z] = localToWorld(l.x, l.z, yaw, 0, HALL.baseD / 2 + 0.6);
  return [{
    x, y: 7.2, z, yaw, w: 7.4, h: 1.35,
    color: SignColor.White, seed: phraseSeed(62), kind: 0,
  }];
}

function beacons(l: Landmark, env: LandmarkEnv, yaw: number): void {
  const add = (lx: number, y: number, lz: number, kind: number, size: number) => {
    const [x, z] = localToWorld(l.x, l.z, yaw, lx, lz);
    env.beacons.add(x, y, z, kind, size);
  };
  add(0, HALL.height + 1.4, 0, LightKind.Warm, 8);
  add(0, HALL.height + 1.4, 0, LightKind.Red, 3.2);
  const s = HALL.neck / 2 - 1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * s, HALL.neckTop + 1, sz * s, LightKind.Warm, 4);
  add(-14, 9.2, 62, LightKind.Warm, 2.2);
  add(14, 9.2, 62, LightKind.Warm, 2.2);
}

export function buildCityHall(l: Landmark, env: LandmarkEnv) {
  const yaw = bearingToYaw(l.bearingDeg);
  const collider = new Mass(new GeoWriter(), l.x, l.z, yaw, 2, { draw: false });
  writeHall(collider);
  const groundWriter = new GeoWriter();
  const groundMass = new Mass(groundWriter, l.x, l.z, yaw, 2, { collide: false });
  court(groundMass);
  const ground = new Mesh(groundWriter.build(), getCityMaterial());
  ground.name = `${l.id}-court`;
  ground.userData.sharedGeometry = true;
  const [near, mid, far] = createLandmarkLevels('hall', l.x, 0, l.z, yaw);
  hallTris.splice(0, hallTris.length, 0, 0, 0);
  const signs = makeSignMesh(signsFor(l, yaw));
  signs.name = `${l.id}-signs`;
  const leaf = openDoorLeaf('full', 2.2, 2.2);
  if (leaf) {
    const [hx, hz] = localToWorld(l.x, l.z, yaw, 1.1, HALL.baseD / 2 + 0.35);
    leaf.position.set(hx, HALL_STAIR.y1, hz);
    leaf.rotation.y = yaw + 1.15;
  }
  const r = Math.hypot(HALL.baseW, HALL.baseD) / 2 + 8;
  const object = env.lods.add(
    l.id,
    [landmarkLevel(near!, signs, leaf), mid!, far!],
    HALL_LOD_DIST, l.x, l.z, 0, HALL.height + 2, r,
  );
  object.add(ground);
  beacons(l, env, yaw);
  return { object, colliders: collider.cols };
}

registerLandmarkType('heritage-tower', buildCityHall);
