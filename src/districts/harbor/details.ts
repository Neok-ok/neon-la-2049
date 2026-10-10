// LOD0 quay kit: bollards and a sodium spill under the nearest mast.
// The worker ships `seed` as float32. Rebuild it with hash2i so the props
// stay on the same block the fabric used.
import { Group } from 'three/webgpu';
import { registerDetail } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { blockSeed } from './spec';
import { BLOCK_A, BLOCK_B } from './spec';
import { craneNear, harborSites } from './sites';
import { Rng } from '../../core/rng';

const CAP: Record<QualitySettings['tier'], number> = {
  low: 80,
  medium: 180,
  high: 320,
  ultra: 480,
};

function thin<T>(items: T[], cap: number): T[] {
  if (items.length <= cap || cap <= 0) return cap <= 0 ? [] : items;
  const out: T[] = [];
  const step = items.length / cap;
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}

registerDetail('harbor-quay', ['harbor'], (ctx) => {
  const sites = harborSites(ctx.layout);
  const props: KitInstance[] = [];
  let any = false;
  for (const b of ctx.blocks) {
    const district = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
    if (district?.id !== 'harbor') continue;
    any = true;
    const i = Math.round(-b.cz / BLOCK_A - 0.5);
    const j = Math.round(b.cx / BLOCK_B - 0.5);
    if (!craneNear(sites, b.cx, b.cz, 160)) continue;
    const r = new Rng(blockSeed(i, j, district.index));
    const bx = -b.az;
    const bz = b.ax;
    const yaw = Math.atan2(bx, bz);
    for (let k = 0; k < 4; k++) {
      const side = k < 2 ? -1 : 1;
      const along = (k % 2 === 0 ? -1 : 1) * r.range(18, 36);
      props.push({
        template: 'box',
        x: b.cx + bx * along + b.ax * side * (b.la * 0.42),
        y: b.ground + 0.55,
        z: b.cz + bz * along + b.az * side * (b.la * 0.42),
        yaw, sx: 0.35, sy: 1.1, sz: 0.35,
        color: [0.18, 0.16, 0.13],
        emissive: [0, 0, 0],
        metal: 0.4,
      });
    }
    if (ctx.quality.detailScale >= 0.45) {
      props.push({
        template: 'quadY',
        x: b.cx, y: b.ground + 0.4, z: b.cz,
        yaw, sx: 14, sy: 1, sz: 14,
        color: [0, 0, 0],
        emissive: [1.0, 0.55, 0.16],
        metal: 0,
        alpha: 0.35,
        pass: 'add',
      });
    }
  }
  if (!any || !props.length) return null;
  const kept = thin(props, CAP[ctx.quality.tier]);
  const group = new Group();
  group.name = 'harbor-quay';
  for (const mesh of buildKitMeshes(kept, 'harbor-kit')) group.add(mesh);
  return group;
});
