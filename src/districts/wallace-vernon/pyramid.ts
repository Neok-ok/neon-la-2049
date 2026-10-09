// Stage 3: the Wallace Corporation pyramid (hero landmark, three LODs) and the two dormant 1982-style
// corporate pyramids in the refinery belt. Both come from the shared terraced-pyramid generator.
import { registerLandmarkType, type LandmarkEnv } from '../../world/landmarks/registry';
import { bearingToYaw } from '../../world/geo';
import type { Landmark } from '../../world/layout';
import { Rng, hashString } from '../../core/rng';
import { Style } from '../../world/fabric/types';
import { buildPyramid, type PyramidPlan } from '../_shared/megatower/pyramid';
import { kitBox } from '../_shared/megatower/sink';
import type { KitFrame } from '../_shared/megatower/geoSink';
import { buildLevels, placeKit } from '../_shared/megatower/place';
import { kitStats } from '../financial-megatowers/landmarks';

/** The pyramid is 3.5 km tall: full detail inside ~6 km, mid to ~18 km, then the tier proxy. */
export const WALLACE_LOD_DIST = [6000, 18000];
const OLD_LOD_DIST = [3500, 11000];

function build(l: Landmark, env: LandmarkEnv, plan: PyramidPlan, dists: number[]) {
  const frame: KitFrame = { x: l.x, z: l.z, y: env.layout.heightAt(l.x, l.z), yaw: bearingToYaw(l.bearingDeg) };
  const rng = new Rng(hashString(l.id + ':stacks'));
  const stacks: Array<[number, number, number]> = [];
  if (plan.look === 'old') {
    // refinery stacks around the base, a nod to the first film's opening
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2), r = plan.base * rng.range(0.62, 0.9);
      stacks.push([Math.cos(a) * r, Math.sin(a) * r, rng.range(70, 150)]);
    }
  }
  const { meshes, parts, tris } = buildLevels(l.id, frame, [3, 1, 0], (sink) => {
    const p = buildPyramid(plan, sink);
    for (const [x, z, h] of stacks) {
      kitBox(sink, x, z, 0, 7, 7, h, { style: Style.Industrial, lit: 0.05, tint: 0.55, seed: (x * 0.001) % 1 }, 1);
      p.colliders.push({ lx: x, lz: z, hw: 3.5, hd: 3.5, y0: 0, top: h });
      p.flames.push({ lx: x, y: h + 6, lz: z, size: rng.range(10, 24) });
      p.lights.push({ lx: x, y: h + 1, lz: z, kind: 'red' });
    }
    return p;
  });
  kitStats.push({ id: l.id, tris });
  const placed = placeKit(parts, frame, env, { id: l.id, seed: plan.seed });
  const object = env.lods.add(l.id, meshes, dists, l.x, l.z, frame.y, frame.y + parts.top, plan.base * 0.5);
  return { object, colliders: placed.colliders };
}

registerLandmarkType('wallace-pyramid', (l, env) => {
  const plan: PyramidPlan = {
    seed: (hashString(l.id) % 1000) / 1000,
    height: l.height,
    base: l.baseWidth,
    top: l.topWidth ?? 420,
    tiers: 7,
    steps: 3,
    look: 'wallace',
    // the monumental entrance is on the north face, the one turned toward downtown and the spinner approach
    entrance: 2,
  };
  return build(l, env, plan, WALLACE_LOD_DIST);
});

registerLandmarkType('old-pyramid', (l, env) => {
  const plan: PyramidPlan = {
    seed: (hashString(l.id) % 1000) / 1000,
    height: l.height,
    base: l.baseWidth,
    top: l.topWidth ?? 140,
    tiers: 6,
    steps: 3,
    look: 'old',
    entrance: 3,
  };
  return build(l, env, plan, OLD_LOD_DIST);
});
