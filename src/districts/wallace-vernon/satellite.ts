// Wallace satellites A/B/C. Tapered monoliths in the pyramid's language: battered steps,
// a slot on each face, a warm crown, aviation lights. Three LODs. No hologram, no logo.
import { hashString } from '../../core/rng';
import { Style } from '../../world/fabric/types';
import { bearingToYaw } from '../../world/geo';
import { registerLandmarkType, type LandmarkEnv } from '../../world/landmarks/registry';
import type { Landmark } from '../../world/layout';
import { kitBox, type FaceStyle, type MassSink } from '../_shared/megatower/sink';
import type { KitFrame } from '../_shared/megatower/geoSink';
import { buildLevels, placeKit } from '../_shared/megatower/place';
import type { Face, TowerParts } from '../_shared/megatower/tower';
import { kitStats } from '../financial-megatowers/landmarks';

const FN: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const TIERS = 6;
/** Full model out to ~2.4 km, mid to ~8 km, then the silhouette. */
export const SATELLITE_LOD = [2400, 8000];

export interface SatellitePlan {
  seed: number;
  height: number;
  base: number;
  top: number;
}

export function buildSatellite(p: SatellitePlan, sink: MassSink): TowerParts {
  const lights: TowerParts['lights'] = [];
  const colliders: TowerParts['colliders'] = [];
  const parts: TowerParts = {
    colliders, holos: [], lights, signs: [], flames: [],
    roof: p.height, top: p.height, halfW: p.base / 2, halfD: p.base / 2,
  };
  let k = 0;
  const face = (style: number, lit: number, tint: number): FaceStyle => ({
    style, lit, tint, seed: (p.seed * 4.1 + (k++) * 0.061) % 1,
  });
  const skin = face(Style.Monolith, 0.42, 0.72);
  const skinTop = face(Style.Monolith, 0.58, 0.68);
  const rib = face(Style.Monolith, 0.08, 0.52);
  const slotCold = face(Style.Slit, 0.28, 0.85);
  const slotWarm = face(Style.Glow, 0.4, 1.05);
  // Crown and mast stay inside the published height. Nothing new clears 1,400 m.
  const mastH = 36;
  const crownH = Math.max(32, Math.min(78, p.height * 0.055));
  const bodyH = p.height - crownH - mastH;
  const stepH = bodyH / TIERS;
  const widthAt = (i: number) => p.base + (p.top - p.base) * Math.pow(i / TIERS, 0.82);

  if (sink.maxDetail === 0) {
    sink.frustum(0, 0, 0, p.base, p.base, p.top, p.top, bodyH, skin, 0, true);
  } else {
    for (let i = 0; i < TIERS; i++) {
      const wb = widthAt(i);
      const wn = widthAt(i + 1);
      const wt = wb - (wb - wn) * 0.46;
      const y0 = i * stepH;
      const upper = i >= TIERS - 2;
      sink.frustum(0, 0, y0, wb, wb, wt, wt, stepH, upper ? skinTop : skin, 0, true);
      colliders.push({ lx: 0, lz: 0, hw: wt / 2, hd: wt / 2, y0, top: y0 + stepH });
      const ledge = wn + 8;
      kitBox(sink, 0, 0, y0 + stepH, ledge, ledge, 4.5, rib, 1);
      if (sink.maxDetail >= 2) {
        const mid = (wb + wt) / 4 + 1.5;
        const wide = Math.max(10, wb * 0.045);
        for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
          const [nx, nz] = FN[f]!;
          const x = nx * mid;
          const z = nz * mid;
          kitBox(sink, x, z, y0 + stepH * 0.12, nx ? 2.2 : wide, nz ? 2.2 : wide, stepH * 0.72, upper ? slotWarm : slotCold, 2);
        }
      }
      if (i % 2 === 0) {
        for (const [sx, sz] of CORNERS) {
          lights.push({ lx: sx * (wt / 2), y: y0 + stepH + 5, lz: sz * (wt / 2), kind: i % 4 === 0 ? 'red' : 'steady' });
        }
      }
    }
  }

  const yA = bodyH;
  const glow = face(Style.Glow, 0.9, 1.02);
  kitBox(sink, 0, 0, yA, p.top * 0.72, p.top * 0.72, crownH * 0.42, glow, 0);
  kitBox(sink, 0, 0, yA + crownH * 0.42, p.top * 0.92, p.top * 0.92, crownH * 0.22, face(Style.Monolith, 0.12, 0.55), 0);
  const roofY = yA + crownH * 0.64;
  kitBox(sink, 0, 0, roofY, p.top * 0.4, p.top * 0.4, crownH * 0.36, face(Style.Monolith, 0.3, 0.6), 1);
  colliders.push({ lx: 0, lz: 0, hw: p.top * 0.46, hd: p.top * 0.46, y0: yA, top: yA + crownH });
  sink.frustum(0, 0, yA + crownH, 4.5, 4.5, 1.2, 1.2, mastH, face(Style.Solid, 0, 0.45), 0);
  colliders.push({ lx: 0, lz: 0, hw: 2.4, hd: 2.4, y0: yA + crownH, top: p.height });
  parts.roof = yA + crownH;
  parts.top = p.height;
  lights.push({ lx: 0, y: p.height - 0.4, lz: 0, kind: 'strobe' });
  lights.push({ lx: 0, y: yA + crownH + mastH * 0.55, lz: 0, kind: 'red' });
  for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
    const [nx, nz] = FN[f]!;
    lights.push({ lx: nx * p.top * 0.38, y: yA + crownH * 0.2, lz: nz * p.top * 0.38, kind: 'warm' });
  }
  return parts;
}

function buildOne(l: Landmark, env: LandmarkEnv) {
  const frame: KitFrame = { x: l.x, z: l.z, y: env.layout.heightAt(l.x, l.z), yaw: bearingToYaw(l.bearingDeg) };
  const plan: SatellitePlan = {
    seed: (hashString(l.id) % 1000) / 1000,
    height: l.height,
    base: l.baseWidth,
    top: l.topWidth ?? 55,
  };
  const { meshes, parts, tris } = buildLevels(l.id, frame, [3, 1, 0], (sink) => buildSatellite(plan, sink));
  kitStats.push({ id: l.id, tris });
  const placed = placeKit(parts, frame, env, { id: l.id, seed: plan.seed });
  const object = env.lods.add(l.id, meshes, SATELLITE_LOD, l.x, l.z, frame.y, frame.y + parts.top, plan.base * 0.5);
  return { object, colliders: placed.colliders };
}

registerLandmarkType('wallace-tower', (l, env) => buildOne(l, env));
