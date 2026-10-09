// Per-frame Grey Coast: streamed wall segments, breakers, apron, piers, one hauler.
// Sea fog and surf stay on the shared fog uniform and the ambience bus.
import { Group, type Scene, type Vector3 } from 'three/webgpu';
import type { CityQuery } from '../../world/CityQuery';
import type { QualitySettings } from '../../core/quality';
import { attachApron, updateApron } from './apron';
import { planApron } from './apronPlan';
import { attachHauler, updateHauler } from './hauler';
import { attachPiers, updatePiers } from './piers';
import { nearestWall, waveClock, type WaveState } from './profile';
import { updateWall, wallSegmentCount, warmWall } from './surface';
import { attachWaves, updateWaves } from './waves';

export interface CoastClimate {
  fog: number;
  surf: number;
  impact: number;
  /** 1 on the crest road, else 0. Multiplies rain wind. */
  crest: number;
  /** 0..1, 1 against the wall. */
  near: number;
}

let installed = false;
let apronFrame = { x: 0, z: 0 };
let lastImpact = 0;

export function coastImpact(): number {
  return lastImpact;
}

export function coastSegmentCount(): number {
  return wallSegmentCount();
}

export function installCoast(scene: Scene, query: CityQuery, tier: QualitySettings['tier']): void {
  if (installed) return;
  installed = true;
  const g = new Group();
  g.name = 'grey-coast';
  scene.add(g);
  const layout = query.layout;
  const apron = attachApron(g, layout);
  query.addColliders(apron.colliders);
  apronFrame = { x: apron.plan.frame.x, z: apron.plan.frame.z };
  attachWaves(g);
  attachPiers(g, layout);
  attachHauler(g, layout);
  warmWall(g, layout, tier);
}

export function updateCoast(
  cam: Vector3,
  tier: QualitySettings['tier'],
  dt: number,
  time: number,
  rain: number,
  wind: number,
  layout: CityQuery['layout'],
  holdSurf = false,
): CoastClimate {
  const hit = nearestWall(layout, cam.x, cam.z);
  let clock = time;
  if (holdSurf) {
    const preview = waveClock(0, rain, wind);
    clock = preview.period * 0.78;
  }
  const state: WaveState = waveClock(clock, rain, wind);
  lastImpact = state.impact;
  updateWall(layout, cam.x, cam.z, tier);
  updateWaves(layout, cam.x, cam.y, cam.z, tier, state, rain);
  updatePiers(cam.x, cam.z);
  updateHauler(cam.x, cam.z, dt);
  updateApron(cam.x, cam.z, planApron(layout));

  const dist = Math.min(hit.dist, Math.hypot(cam.x - apronFrame.x, cam.z - apronFrame.z));
  const near = Math.max(0, Math.min(1, 1 - dist / 980));
  const low = Math.max(0, Math.min(1, 1 - Math.max(0, cam.y - 6) / 70));
  const onCrest = hit.dist < 22 && Math.abs(cam.y - hit.frame.H) < 16;
  let fog = near * (0.32 + state.storm * 0.48) * (0.42 + 0.58 * Math.max(low, onCrest ? 0.35 : 0));
  if (onCrest) fog *= 0.62;
  const amount = near * (0.35 + state.storm * 0.65);
  let surf = amount;
  let impact = near * state.impact;
  if (tier === 'low') {
    surf *= 0.4;
    impact *= 0.25;
  }
  return { fog, surf, impact, crest: onCrest ? 1 : 0, near };
}
