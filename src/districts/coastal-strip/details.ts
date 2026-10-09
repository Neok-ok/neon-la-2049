// LOD0 street clutter for the Grey Coast: sandbags, a rusted rail, puddles, litter.
// Two kit draws per chunk (opaque + fade). Shared sodium lamps are off for this district.
import { Group } from 'three/webgpu';
import { registerDetail, type ChunkBlock, type DetailContext } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { hash2i } from '../../core/rng';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { inApron } from './apronPlan';
import { nearSeaWall } from './profile';

const CAP: Record<QualitySettings['tier'], number> = { low: 36, medium: 80, high: 140, ultra: 200 };

function idOf(b: ChunkBlock, ctx: DetailContext): string {
  const d = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

registerDetail('coastal-strip', ['coastal-strip'], (ctx) => {
  const cap = CAP[ctx.quality.tier];
  const items: KitInstance[] = [];
  let any = false;
  const push = (it: KitInstance) => {
    if (items.length < cap) items.push(it);
  };
  for (const b of ctx.blocks) {
    if (idOf(b, ctx) !== 'coastal-strip') continue;
    any = true;
    const bx = -b.az;
    const bz = b.ax;
    const g = b.ground;
    const n = 1 + (hash2i(b.seed, 3) % 3);
    for (let k = 0; k < n; k++) {
      const u = ((hash2i(b.seed, 10 + k) % 1000) / 1000) * b.la - b.la / 2;
      const side = (hash2i(b.seed, 20 + k) & 1) ? 1 : -1;
      const x = b.cx + b.ax * u + bx * side * (b.lb / 2 - 1.2);
      const z = b.cz + b.az * u + bz * side * (b.lb / 2 - 1.2);
      if (ctx.layout.isOcean(x, z) || ctx.layout.isReserved(x, z, 1) || nearSeaWall(ctx.layout, x, z, 6) || inApron(ctx.layout, x, z, 2)) continue;
      const yaw = Math.atan2(bx, bz);
      const bags = 3 + (hash2i(b.seed, 30 + k) % 3);
      for (let i = 0; i < bags; i++) {
        push({
          template: 'box',
          x: x + bx * i * 0.72,
          y: g + 0.28,
          z: z + bz * i * 0.72,
          yaw,
          sx: 0.7,
          sy: 0.42,
          sz: 0.38,
          color: [0.42, 0.4, 0.34],
          emissive: [0, 0, 0],
          metal: 0,
        });
      }
      if ((hash2i(b.seed, 40 + k) % 3) !== 0) {
        push({
          template: 'box',
          x: x + bx * 1.4,
          y: g + 0.55,
          z: z + bz * 1.4,
          yaw,
          sx: 2.4,
          sy: 0.08,
          sz: 0.08,
          color: [0.38, 0.28, 0.2],
          emissive: [0, 0, 0],
          metal: 0.65,
        });
        push({
          template: 'box',
          x, y: g + 0.45, z, yaw, sx: 0.08, sy: 0.9, sz: 0.08,
          color: [0.34, 0.26, 0.18], emissive: [0, 0, 0], metal: 0.7,
        });
      }
      if ((hash2i(b.seed, 50 + k) % 2) === 0) {
        const px = x - bx * 2.2;
        const pz = z - bz * 2.2;
        push({
          template: 'quadY',
          x: px, y: g + 0.04, z: pz, yaw,
          sx: 2.4 + (hash2i(b.seed, 51 + k) % 5) * 0.3,
          sy: 1,
          sz: 1.6,
          color: [0.22, 0.26, 0.3],
          emissive: [0, 0, 0],
          metal: 0.85,
          alpha: 0.5,
        });
      }
      const tilt = ((hash2i(b.seed, 60 + k) % 8) - 4) * 0.08;
      push({
        template: 'box',
        x: x + bx * 0.4,
        y: g + 0.06,
        z: z - bz * 0.8,
        yaw,
        pitch: tilt,
        sx: 0.55,
        sy: 0.04,
        sz: 0.32,
        color: [0.45, 0.42, 0.36],
        emissive: [0, 0, 0],
        metal: 0.1,
      });
    }
  }
  if (!any || !items.length) return null;
  const g = new Group();
  g.name = 'coast-detail';
  for (const m of buildKitMeshes(items, 'coast-clutter')) g.add(m);
  return g;
});
