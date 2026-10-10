// Three launch gantries. Anything past 320 m is a landmark in the megatower kit.
// The published 420 m includes the mast. The Stage 1 blockout of type `spaceport` is replaced.
import { bearingToYaw } from '../../world/geo';
import { Style } from '../../world/fabric/types';
import { registerLandmarkType, type LandmarkEnv } from '../../world/landmarks/registry';
import type { Landmark } from '../../world/layout';
import { CountingSink, kitBox, type FaceStyle, type MassSink } from '../_shared/megatower/sink';
import type { KitFrame } from '../_shared/megatower/geoSink';
import { buildLevels, placeKit } from '../_shared/megatower/place';
import type { TowerParts } from '../_shared/megatower/tower';
import { PAD_BLOCKS, STACK_H, blockCenter } from './spec';

/** Full model out to ~2.4 km from the hull, mid to ~9 km, then the silhouette. */
export const GANTRY_LOD = [2400, 9000];
/** Covers the three pads so a camera on the apron still gets the near mesh. */
const HULL = 960;
const SHAFT_LX = -32;
const STACK_LX = 6;
const CORE = 14;
const MAST = 30;

interface PadOff { lx: number; lz: number }

function toLocal(frame: KitFrame, x: number, z: number): PadOff {
  const dx = x - frame.x;
  const dz = z - frame.z;
  const c = Math.cos(frame.yaw);
  const s = Math.sin(frame.yaw);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

export function buildGantries(sink: MassSink, pads: readonly PadOff[], height: number): TowerParts {
  const shaftTop = height - MAST;
  const colliders: TowerParts['colliders'] = [];
  const lights: TowerParts['lights'] = [];
  const parts: TowerParts = {
    colliders, holos: [], lights, signs: [], flames: [],
    roof: shaftTop, top: height, halfW: HULL, halfD: HULL,
  };
  let k = 0;
  const face = (style: number, lit: number, tint: number): FaceStyle => ({
    style, lit, tint, seed: ((k++) * 0.173) % 1,
  });
  const skin = face(Style.Industrial, 0.08, 0.7);
  const deck = face(Style.Industrial, 0.03, 0.55);
  const dark = face(Style.Solid, 0, 0.4);
  const cage = face(Style.Slit, 0.22, 0.85);
  const mast = face(Style.Solid, 0.04, 0.5);
  const arm = face(Style.Industrial, 0.16, 0.78);
  const stack = face(Style.Coastal, 0.05, 1.15);
  const chord = face(Style.Industrial, 0.1, 0.64);
  const arms = [60, 120, 180, 240, 300, 360].filter((y) => y < shaftTop - 8);

  for (const pad of pads) {
    const ox = pad.lx;
    const oz = pad.lz;
    const sx = ox + SHAFT_LX;
    kitBox(sink, ox, oz, 0, 92, 92, 0.4, deck, 0);
    kitBox(sink, ox + STACK_LX, oz, 0.4, 12, 40, 0.18, dark, 1);
    if (sink.maxDetail === 0) {
      sink.frustum(sx, oz, 0, CORE, CORE, CORE * 0.7, CORE * 0.7, shaftTop, skin, 0, true);
    } else {
      const n = 6;
      const h = shaftTop / n;
      for (let i = 0; i < n; i++) {
        const w0 = CORE * (1 - i * 0.035);
        const w1 = CORE * (1 - (i + 1) * 0.035);
        sink.frustum(sx, oz, i * h, w0, w0, w1, w1, h, skin, 0, true);
      }
    }
    kitBox(sink, sx, oz, shaftTop - 12, 24, 24, 12, cage, 0);
    sink.frustum(sx, oz, shaftTop, 4.2, 4.2, 1.3, 1.3, MAST, mast, 0);
    const span = STACK_LX - SHAFT_LX;
    for (const y of arms) {
      kitBox(sink, ox + (SHAFT_LX + STACK_LX) / 2, oz, y, span, 3.4, 2.2, arm, 1);
    }
    sink.frustum(ox + STACK_LX, oz, 0.4, 9, 9, 6.2, 6.2, STACK_H, stack, 1);
    if (sink.maxDetail >= 2) {
      for (const [cx, cz] of [[12, 12], [12, -12], [-12, 12], [-12, -12]] as const) {
        kitBox(sink, sx + cx, oz + cz, 0, 2.2, 2.2, shaftTop, chord, 2);
      }
      for (let y = 30; y < shaftTop; y += 30) {
        kitBox(sink, sx, oz + 12, y, 26, 1.3, 1.15, chord, 2);
        kitBox(sink, sx, oz - 12, y, 26, 1.3, 1.15, chord, 2);
        kitBox(sink, sx + 12, oz, y, 1.3, 26, 1.15, chord, 2);
        kitBox(sink, sx - 12, oz, y, 1.3, 26, 1.15, chord, 2);
      }
    }
    colliders.push({ lx: sx, lz: oz, hw: 8, hd: 8, y0: 0, top: height });
    colliders.push({ lx: ox + STACK_LX, lz: oz, hw: 5, hd: 5, y0: 0.4, top: 0.4 + STACK_H });
    lights.push({ lx: sx, y: height - 0.6, lz: oz, kind: 'strobe' });
    lights.push({ lx: sx, y: shaftTop + 1, lz: oz, kind: 'red' });
    lights.push({ lx: sx + 8, y: shaftTop * 0.5, lz: oz, kind: 'steady' });
    lights.push({ lx: ox + 40, y: 3.2, lz: oz + 40, kind: 'warm' });
    lights.push({ lx: ox - 40, y: 3.2, lz: oz - 40, kind: 'warm' });
  }
  return parts;
}

/** Filled when the landmark builds: LOD0, LOD1, proxy. */
export const gantryTris: number[] = [];

/** Triangle counts at detail 3 / 1 / 0. The landmark builder records the same plan. */
export function countGantries(height = 420): number[] {
  const pads = PAD_BLOCKS.map(() => ({ lx: 0, lz: 0 }));
  return [3, 1, 0].map((d) => {
    const sink = new CountingSink(d);
    buildGantries(sink, pads, height);
    return sink.tris;
  });
}

function buildOne(l: Landmark, env: LandmarkEnv) {
  const frame: KitFrame = {
    x: l.x, z: l.z, y: env.layout.heightAt(l.x, l.z), yaw: bearingToYaw(l.bearingDeg),
  };
  const pads = PAD_BLOCKS.map(([i, j]) => {
    const c = blockCenter(i, j);
    return toLocal(frame, c.x, c.z);
  });
  const { meshes, parts, tris } = buildLevels(l.id, frame, [3, 1, 0], (sink) => buildGantries(sink, pads, l.height));
  gantryTris.splice(0, gantryTris.length, ...tris);
  const placed = placeKit(parts, frame, env, { id: l.id, seed: 0.17 });
  const object = env.lods.add(
    l.id, meshes, GANTRY_LOD, l.x, l.z, frame.y, frame.y + parts.top, HULL,
  );
  return { object, colliders: placed.colliders };
}

registerLandmarkType('spaceport', (l, env) => buildOne(l, env));
