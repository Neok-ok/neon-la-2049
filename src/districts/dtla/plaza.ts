// Pure module. Street furniture on the MT-1 and MT-5 podium aprons (inside the reserve, outside the
// podium) and along the ground line of the skybridges that leave those towers. Stage 4 owns this
// even where the financial-district polygon has priority: the apron is not fabric.
import { bearingToYaw } from '../../world/geo';
import type { CityLayout, Landmark } from '../../world/layout';
import { SIGN_RGB } from '../../world/materials/signPalette';
import { HERO_SPECS } from '../financial-megatowers/specs';
import type { DtlaPool, DtlaProp, DtlaSteam } from './block';

export interface PlazaDress {
  props: DtlaProp[];
  steam: DtlaSteam[];
  pools: DtlaPool[];
  loops: Array<Array<[number, number]>>;
}

const NONE: [number, number, number] = [0, 0, 0];
const APRONS = ['megatower-1', 'megatower-5'] as const;
const BRIDGES = ['skybridge-1', 'skybridge-3'] as const;

function inChunk(x: number, z: number, x0: number, z0: number, size: number): boolean {
  return x >= x0 && x < x0 + size && z >= z0 && z < z0 + size;
}

/** Kit yaw → world. See megatower README. */
function toWorld(x: number, z: number, yaw: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

function apron(layout: CityLayout, id: string, x0: number, z0: number, size: number, out: PlazaDress): void {
  const lm = layout.landmarkById(id);
  const spec = HERO_SPECS[id];
  if (!lm || !spec) return;
  const yaw = bearingToYaw(lm.bearingDeg) + ((spec.turn ?? 0) * Math.PI) / 2;
  const ground = layout.heightAt(lm.x, lm.z);
  const hw = spec.podium.w / 2, hd = spec.podium.d / 2;
  const gap = 9;
  const sides: Array<{ lx: number; lz: number; face: 0 | 1 | 2 | 3; len: number }> = [
    { lx: 0, lz: hd + gap, face: 0, len: spec.podium.w },
    { lx: 0, lz: -(hd + gap), face: 2, len: spec.podium.w },
    { lx: hw + gap, lz: 0, face: 1, len: spec.podium.d },
    { lx: -(hw + gap), lz: 0, face: 3, len: spec.podium.d },
  ];
  const normals: Array<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const corner = (lx: number, lz: number): [number, number] => toWorld(lm.x, lm.z, yaw, lx, lz);
  out.loops.push([
    corner(hw + gap, hd + gap), corner(-(hw + gap), hd + gap),
    corner(-(hw + gap), -(hd + gap)), corner(hw + gap, -(hd + gap)),
  ]);
  sides.forEach((side, si) => {
    const n = Math.max(2, Math.floor(side.len / 22));
    const [nx, nz] = normals[side.face]!;
    for (let i = 0; i < n; i++) {
      const a = -side.len / 2 + (i + 0.5) * (side.len / n);
      const lx = side.face % 2 === 0 ? a : side.lx;
      const lz = side.face % 2 === 0 ? side.lz : a;
      const [x, z] = toWorld(lm.x, lm.z, yaw, lx, lz);
      if (!inChunk(x, z, x0, z0, size)) continue;
      if (layout.isOcean(x, z)) continue;
      const rgb = SIGN_RGB[(i + si + id.length) % SIGN_RGB.length]!;
      // outward normal in world: rotate (nx, nz) by the frame. Frame +X is (cos yaw, -sin yaw), +Z is (sin yaw, cos yaw).
      const wnx = nx * Math.cos(yaw) + nz * Math.sin(yaw);
      const wnz = -nx * Math.sin(yaw) + nz * Math.cos(yaw);
      const propYaw = Math.atan2(wnx, wnz);
      out.props.push({
        template: 'box', x, y: ground + 1.2, z, yaw: propYaw,
        sx: 2.6, sy: 2.4, sz: 1.6, color: [0.11, 0.1, 0.1], emissive: NONE, metal: 0.4, rank: 0,
      });
      out.props.push({
        template: 'canopy', x: x + wnx * 0.3, y: ground + 2.55, z: z + wnz * 0.3, yaw: propYaw,
        sx: 3.4, sy: 1, sz: 3.4, color: rgb, emissive: [rgb[0] * 0.4, rgb[1] * 0.4, rgb[2] * 0.4],
        metal: 0, rank: 1, pass: 'fade', alpha: 0.9,
      });
      out.pools.push({ x, y: ground + 0.05, z, yaw: propYaw, len: 9, wid: 4, rgb, intensity: 1.25, rank: 0 });
      if (i % 2 === 0) {
        out.steam.push({ x: x - wnx * 3.5, y: ground, z: z - wnz * 3.5, seed: (i + 1) / (n + 2) + si * 0.17, rank: 0 });
        out.props.push({
          template: 'cyl', x: x - wnx * 3.2, y: ground + 0.5, z: z - wnz * 3.2, yaw: 0,
          sx: 1.1, sy: 1, sz: 1.1, color: [0.16, 0.15, 0.14], emissive: NONE, metal: 0.7, rank: 1,
        });
      }
    }
  });
}

function bridgeShadow(layout: CityLayout, id: string, x0: number, z0: number, size: number, out: PlazaDress): void {
  const bridge = layout.landmarkById(id);
  if (!bridge?.from || !bridge.to) return;
  const a = layout.landmarkById(bridge.from);
  const b = layout.landmarkById(bridge.to);
  if (!a || !b) return;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const sx = -uz, sz = ux;
  const steps = Math.max(2, Math.floor(len / 28));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + dx * t + sx * 10;
    const z = a.z + dz * t + sz * 10;
    if (!inChunk(x, z, x0, z0, size)) continue;
    if (layout.isReserved(x, z, -8) || layout.isOcean(x, z)) continue;
    const ground = layout.heightAt(x, z);
    const rgb = SIGN_RGB[i % 3 === 0 ? 1 : 5]!;
    out.steam.push({ x, y: ground, z, seed: (i * 0.17) % 1, rank: 0 });
    out.pools.push({
      x, y: ground + 0.04, z, yaw: Math.atan2(ux, uz), len: 14, wid: 5, rgb, intensity: 0.55, rank: 1,
    });
    if (i % 3 === 0) {
      out.props.push({
        template: 'box', x, y: ground + 1.15, z, yaw: Math.atan2(sx, sz),
        sx: 2.2, sy: 2.2, sz: 1.4, color: [0.09, 0.09, 0.1], emissive: NONE, metal: 0.3, rank: 1,
      });
    }
  }
}

/** Apron and under-bridge dressing whose points fall inside this chunk. */
export function dressPlaza(layout: CityLayout, x0: number, z0: number, size: number): PlazaDress {
  const out: PlazaDress = { props: [], steam: [], pools: [], loops: [] };
  const near = (lm: Landmark | undefined, r: number) =>
    !!lm && lm.x > x0 - r && lm.x < x0 + size + r && lm.z > z0 - r && lm.z < z0 + size + r;
  for (const id of APRONS) {
    const lm = layout.landmarkById(id);
    if (near(lm, 180)) apron(layout, id, x0, z0, size, out);
  }
  for (const id of BRIDGES) {
    const lm = layout.landmarkById(id);
    if (near(lm, 400)) bridgeShadow(layout, id, x0, z0, size, out);
  }
  return out;
}

/** Full apron loops (not chunk-clipped) for the crowd, one per tower. */
export function plazaLoops(layout: CityLayout): Array<Array<[number, number]>> {
  const dress = dressPlaza(layout, -1e7, -1e7, 1e8);
  return dress.loops;
}
