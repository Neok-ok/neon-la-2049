// Finale apron mesh. Colliders come from the same plan the walker stands on.
import { Group, Mesh } from 'three/webgpu';
import type { CityLayout } from '../../world/layout';
import { GeoWriter, type FaceStyle } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { Style } from '../../world/fabric/types';
import type { LandmarkCollider } from '../../world/landmarks/registry';
import { framePoint } from './profile';
import { planApron, type ApronPlan, type ApronSolid } from './apronPlan';

const DECK: FaceStyle = { style: Style.Solid, lit: 0.04, tint: 1.15, seed: 0.21 };
const STEP: FaceStyle = { style: Style.Solid, lit: 0.03, tint: 1.02, seed: 0.37 };
const METAL: FaceStyle = { style: Style.Solid, lit: 0.02, tint: 0.4, seed: 0.63 };
const GRATE: FaceStyle = { style: Style.Solid, lit: 0, tint: 0.22, seed: 0.91 };
const GLOW: FaceStyle = { style: Style.Glow, lit: 0.85, tint: 1.9, seed: 0.18 };

function styleFor(s: ApronSolid): FaceStyle {
  if (s.role === 'grate') return GRATE;
  if (s.role === 'lamp' && !s.block) return GLOW;
  if (s.role === 'deck') return DECK;
  if (s.role === 'step') return STEP;
  return METAL;
}

let mesh: Mesh | null = null;

export function attachApron(group: Group, layout: CityLayout): { colliders: LandmarkCollider[]; plan: ApronPlan } {
  const plan = planApron(layout);
  const w = new GeoWriter();
  const colliders: LandmarkCollider[] = [];
  for (const s of plan.solids) {
    const p = framePoint(plan.frame, s.across, s.along);
    const yaw = plan.frame.yaw + s.yawExtra;
    w.box(p.x, p.z, s.y0, s.w, s.d, s.h, yaw, styleFor(s));
    if (!s.block) continue;
    colliders.push({
      x: p.x,
      z: p.z,
      hw: s.w / 2,
      hd: s.d / 2,
      yaw,
      y0: s.y0,
      top: s.y0 + s.h,
    });
  }
  mesh = new Mesh(w.build(), getCityMaterial());
  mesh.name = 'sea-wall-apron';
  mesh.frustumCulled = true;
  group.add(mesh);
  return { colliders, plan };
}

export function updateApron(camX: number, camZ: number, plan: ApronPlan): void {
  if (!mesh) return;
  const d = Math.hypot(camX - plan.frame.x, camZ - plan.frame.z);
  mesh.visible = d < 3600;
}
