// Drowned pier remains seaward of the wall, near the real Santa Monica and Venice
// pier sites. Positions are invented. The wheel and the coaster spine are unbranded.
import {
  BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardNodeMaterial, Quaternion, Vector3,
} from 'three/webgpu';
import { geoToLocal } from '../../world/geo';
import type { CityLayout } from '../../world/layout';
import { framePoint, nearestWall, type WallFrame } from './profile';

interface Bit {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  pitch: number;
  lamp: boolean;
}

export interface PierFocus {
  x: number;
  y: number;
  z: number;
  frame: WallFrame;
}

let body: InstancedMesh | null = null;
let lamps: InstancedMesh | null = null;
let focus: PierFocus | null = null;
let anchor = { x: 0, z: 0, x2: 0, z2: 0 };

const _m = new Matrix4();
const _q = new Quaternion();
const _qp = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _x = new Vector3(1, 0, 0);
function oceanAcross(layout: CityLayout, frame: WallFrame, from: number): number {
  for (let a = from; a < from + 220; a += 4) {
    const p = framePoint(frame, a, 0);
    if (layout.isOcean(p.x, p.z)) return a + 10;
  }
  return from + 36;
}

function pushBox(bits: Bit[], frame: WallFrame, across: number, along: number, y: number, sx: number, sy: number, sz: number, lamp = false): void {
  const p = framePoint(frame, across, along);
  bits.push({ x: p.x, y, z: p.z, sx, sy, sz, yaw: frame.yaw, pitch: 0, lamp });
}

function placeWheel(bits: Bit[], frame: WallFrame, across: number): void {
  const R = 16.5;
  const cy = 4.2;
  const n = 16;
  for (let i = 0; i < n; i++) {
    const am = -2.0 + (i / (n - 1)) * 4.0;
    const y = cy + Math.cos(am) * R;
    if (y < 1.5) continue;
    const ac = across + Math.sin(am) * R;
    const p = framePoint(frame, ac, 0);
    bits.push({
      x: p.x, y, z: p.z,
      sx: 0.42, sy: 2.6, sz: 0.42,
      yaw: Math.atan2(frame.nx * Math.cos(am), frame.nz * Math.cos(am) || 1e-4),
      pitch: -am,
      lamp: false,
    });
  }
  // Hub, half under the water.
  pushBox(bits, frame, across, 0, cy, 1.4, 1.4, 1.4);
  for (const side of [-1, 1]) {
    pushBox(bits, frame, across, side * 6, 7.2, 0.35, 8, 0.35);
  }
}

function cluster(layout: CityLayout, lat: number, lon: number, kind: 'wheel' | 'spine'): { bits: Bit[]; focus: PierFocus } {
  const pin = geoToLocal(lat, lon);
  const hit = nearestWall(layout, pin[0], pin[1]);
  const across = oceanAcross(layout, hit.frame, hit.piece.profile.toeAcross);
  const bits: Bit[] = [];
  if (kind === 'wheel') placeWheel(bits, hit.frame, across + 6);
  else {
    for (let i = 0; i < 14; i++) {
      const along = -22 + i * 3.4;
      const y = 5.2 + Math.sin(i * 0.62) * 4.4;
      pushBox(bits, hit.frame, across + 4, along, y, 3.1, 0.55, 0.7);
      if (i % 3 === 0) pushBox(bits, hit.frame, across + 4, along, y - 3.2, 0.45, 3.2, 0.45);
    }
  }
  for (let i = 0; i < 8; i++) {
    const along = -16 + i * 4.5;
    const ac = across + (i % 3) * 3.5;
    pushBox(bits, hit.frame, ac, along, 3.1, 0.55, 6.4, 0.55);
  }
  for (let i = 0; i < 4; i++) {
    const along = -12 + i * 8;
    pushBox(bits, hit.frame, across + 2, along, 6.35, 6.5, 0.45, 3.2);
  }
  for (let i = 0; i < 3; i++) {
    const along = -8 + i * 9;
    pushBox(bits, hit.frame, across + 14 + i * 2, along, 7.4, 5.5, 2.2 + i * 0.4, 4.2);
  }
  for (let i = 0; i < 4; i++) {
    const along = -14 + i * 9;
    pushBox(bits, hit.frame, across - 2, along, 4.6, 0.22, 5.2, 0.22);
    pushBox(bits, hit.frame, across - 2, along, 7.4, 0.55, 0.28, 0.55, true);
  }
  const c = framePoint(hit.frame, across + 6, 0);
  return {
    bits,
    focus: { x: c.x, y: kind === 'wheel' ? 8 : 7, z: c.z, frame: hit.frame },
  };
}

function write(mesh: InstancedMesh, bits: Bit[]): void {
  mesh.count = bits.length;
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i]!;
    _q.setFromAxisAngle(_up, b.yaw);
    if (b.pitch) {
      _qp.setFromAxisAngle(_x, b.pitch);
      _q.multiply(_qp);
    }
    _p.set(b.x, b.y, b.z);
    _s.set(b.sx, b.sy, b.sz);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function pierFocusPoint(): PierFocus | null {
  return focus;
}

export function attachPiers(group: Group, layout: CityLayout): void {
  const sm = cluster(layout, 34.0094, -118.4973, 'wheel');
  const ve = cluster(layout, 33.986, -118.472, 'spine');
  focus = sm.focus;
  anchor = { x: sm.focus.x, z: sm.focus.z, x2: ve.focus.x, z2: ve.focus.z };
  const bits = [...sm.bits, ...ve.bits];
  const bodies = bits.filter((b) => !b.lamp);
  const heads = bits.filter((b) => b.lamp);
  const geo = new BoxGeometry(1, 1, 1);
  const mat = new MeshStandardNodeMaterial({ color: 0x6a7076, roughness: 0.88, metalness: 0.06 });
  body = new InstancedMesh(geo, mat, Math.max(1, bodies.length));
  body.name = 'drowned-piers';
  body.frustumCulled = false;
  write(body, bodies);
  const lampMat = new MeshStandardNodeMaterial({
    color: 0x9aa4a8, emissive: 0xb7c2c6, emissiveIntensity: 0.8, roughness: 0.4,
  });
  lamps = new InstancedMesh(geo, lampMat, Math.max(1, heads.length));
  lamps.name = 'drowned-pier-lamps';
  lamps.frustumCulled = false;
  write(lamps, heads);
  group.add(body, lamps);
}

export function updatePiers(camX: number, camZ: number): void {
  if (!body || !lamps) return;
  const d = Math.min(
    Math.hypot(camX - anchor.x, camZ - anchor.z),
    Math.hypot(camX - anchor.x2, camZ - anchor.z2),
  );
  const on = d < 2400;
  body.visible = on;
  lamps.visible = on;
}
