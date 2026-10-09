// Near-range skin for the Wallace pyramid. The Stage 3 mesh and its LODs stay as they are.
// This layer exists only inside ~1.5 km of the hull, and only the face sectors nearest the
// camera are built — one sector per frame, so a stream-in does not hitch.
import { Group, Mesh, type Object3D, type Vector3 } from 'three/webgpu';
import { GeoWriter, type FaceStyle } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { Style } from '../../world/fabric/types';
import {
  ENTRANCE_FACE, PYRAMID_N, faceSample, halfWidthAtY, localToWorld, pyramidStepH,
} from './spec';

const ACTIVATE = 1500;
const BANDS = 4;
const SECTOR_W = 46;

const REACH: Record<string, number> = { low: 150, medium: 230, high: 300, ultra: 340 };
const CAP: Record<string, number> = { low: 3, medium: 6, high: 9, ultra: 12 };

interface Sector {
  key: string;
  mesh: Mesh;
}

interface Stream {
  group: Group;
  ox: number;
  oz: number;
  yaw: number;
  ground: number;
  sectors: Map<string, Sector>;
}

const streams: Stream[] = [];

const MONO: FaceStyle = { style: Style.Monolith, lit: 0.06, tint: 0.52, seed: 0.21 };
const GROOVE: FaceStyle = { style: Style.Monolith, lit: 0.02, tint: 0.38, seed: 0.44 };
const SLIT: FaceStyle = { style: Style.Glow, lit: 0.26, tint: 1.04, seed: 0.63 };
const LEDGE: FaceStyle = { style: Style.Monolith, lit: 0.08, tint: 0.6, seed: 0.15 };

function hullGap(s: Stream, cam: Vector3): number {
  const dx = cam.x - s.ox;
  const dz = cam.z - s.oz;
  const y = cam.y - s.ground;
  const horiz = Math.hypot(dx, dz);
  const half = halfWidthAtY(y);
  const radial = Math.max(0, horiz - half);
  const yOff = y < 0 ? -y : y > 3500 ? y - 3500 : 0;
  return Math.hypot(radial, yOff);
}

interface Want {
  key: string;
  d: number;
  face: 0 | 1 | 2 | 3;
  step: number;
  band: number;
  col: number;
  cols: number;
}

function wanted(s: Stream, cam: Vector3, reach: number, cap: number): Want[] {
  const out: Want[] = [];
  const stepH = pyramidStepH();
  const yCam = cam.y - s.ground;
  for (let step = 0; step < PYRAMID_N; step++) {
    if (step >= 15) continue;
    const y0 = step * stepH;
    if (y0 > yCam + reach + stepH || y0 + stepH < yCam - reach) continue;
    for (let face = 0 as 0 | 1 | 2 | 3; face < 4; face = (face + 1) as 0 | 1 | 2 | 3) {
      const mid = faceSample(step, face, 0, 0.5);
      const half = Math.hypot(mid.x, mid.z);
      const cols = Math.max(1, Math.round((half * 2) / SECTOR_W));
      for (let band = 0; band < BANDS; band++) {
        for (let col = 0; col < cols; col++) {
          const u = ((col + 0.5) / cols) * 2 - 1;
          const v = (band + 0.5) / BANDS;
          if (Math.abs(u) * half < 34) continue;
          if (face === ENTRANCE_FACE && step < 2 && Math.abs(u) < 0.08) continue;
          const p = faceSample(step, face, u, v);
          const [wx, wz] = localToWorld(s.ox, s.oz, s.yaw, p.x, p.z);
          const wy = s.ground + p.y;
          const d = Math.hypot(wx - cam.x, wy - cam.y, wz - cam.z);
          if (d > reach) continue;
          out.push({ key: `${face}:${step}:${band}:${col}`, d, face, step, band, col, cols });
        }
      }
    }
  }
  out.sort((a, b) => a.d - b.d);
  if (out.length > cap) out.length = cap;
  return out;
}

function buildSector(s: Stream, w: Want): Mesh {
  const gw = new GeoWriter();
  const u0 = (w.col / w.cols) * 2 - 1;
  const u1 = ((w.col + 1) / w.cols) * 2 - 1;
  const v0 = w.band / BANDS;
  const v1 = (w.band + 1) / BANDS;
  const put = (u: number, v: number, lift: number): number[] => {
    const p = faceSample(w.step, w.face, u, v);
    const [wx, wz] = localToWorld(s.ox, s.oz, s.yaw, p.x + p.nx * lift, p.z + p.nz * lift);
    return [wx, s.ground + p.y + p.ny * lift, wz];
  };
  // Winding is reversed so the normal points outward (the camera side).
  const quad = (ua: number, va: number, ub: number, vb: number, lift: number, st: FaceStyle) => {
    const a = put(ua, va, lift);
    const b = put(ub, va, lift);
    const c = put(ub, vb, lift);
    const d = put(ua, vb, lift);
    gw.quad([a, d, c, b], [[0, 0], [0, 1], [1, 1], [1, 0]], st);
  };
  // Board-formed bands and vertical panel joints, proud of the Stage 3 face.
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const va = v0 + ((v1 - v0) * i) / bands;
    const vb = va + (v1 - v0) * 0.045;
    quad(u0, va, u1, vb, 0.22, i % 2 ? GROOVE : MONO);
  }
  const joints = 4;
  for (let i = 1; i < joints; i++) {
    const u = u0 + ((u1 - u0) * i) / joints;
    quad(u - 0.004, v0, u + 0.004, v1, 0.28, GROOVE);
  }
  // One drainage channel and a scupper at the foot of the sector.
  const um = (u0 + u1) / 2;
  quad(um - 0.01, v0, um + 0.01, v1, 0.34, GROOVE);
  const lip = put(um, v0, 1.1);
  gw.box(lip[0], lip[2], lip[1], 1.3, 0.55, 0.28, s.yaw, LEDGE);
  // Maintenance ledge along the bottom edge of the sector, outside the stone.
  const a = put(u0, v0, 0.5);
  const b = put(u1, v0, 0.5);
  const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]);
  const lx = (a[0] + b[0]) / 2;
  const lz = (a[2] + b[2]) / 2;
  const ly = Math.min(a[1], b[1]);
  if (alongX) gw.box(lx, lz, ly, Math.max(2, span * 0.9), 0.9, 0.22, 0, LEDGE);
  else gw.box(lx, lz, ly, 0.9, Math.max(2, span * 0.9), 0.22, 0, LEDGE);
  // A few human-scale lit slits. Dim bronze, not a window wall. Skipped on the lowest band.
  if (w.band > 0 && w.step < 14) {
    for (const fu of [0.3, 0.7]) {
      const u = u0 + (u1 - u0) * fu;
      const va = v0 + (v1 - v0) * 0.35;
      const vb = va + (v1 - v0) * 0.12;
      quad(u - 0.006, va, u + 0.006, vb, 0.4, SLIT);
    }
  }
  const mesh = new Mesh(gw.build(), getCityMaterial());
  mesh.name = `wallace-face-${w.key}`;
  mesh.frustumCulled = true;
  return mesh;
}

export function attachFaceDetail(ox: number, oz: number, yaw: number, ground: number, parent: Object3D): void {
  const group = new Group();
  group.name = 'wallace-face-detail';
  parent.add(group);
  streams.push({ group, ox, oz, yaw, ground, sectors: new Map() });
}

/** One sector in or out per frame. `tier` is the live quality name. */
export function updateWallaceFaces(cam: Vector3, tier: string): void {
  const reach = REACH[tier] ?? REACH.medium!;
  const cap = CAP[tier] ?? CAP.medium!;
  for (const s of streams) {
    const active = hullGap(s, cam) < ACTIVATE;
    const want = active ? wanted(s, cam, reach, cap) : [];
    const keep = new Set(want.map((w) => w.key));
    let removed = false;
    for (const [key, sec] of s.sectors) {
      if (keep.has(key)) continue;
      s.group.remove(sec.mesh);
      sec.mesh.geometry.dispose();
      s.sectors.delete(key);
      removed = true;
      break;
    }
    if (removed) continue;
    if (s.sectors.size >= cap) continue;
    const next = want.find((w) => !s.sectors.has(w.key));
    if (!next) continue;
    const mesh = buildSector(s, next);
    s.group.add(mesh);
    s.sectors.set(next.key, { key: next.key, mesh });
  }
}

export function wallaceFaceSectorCount(): number {
  let n = 0;
  for (const s of streams) n += s.sectors.size;
  return n;
}
