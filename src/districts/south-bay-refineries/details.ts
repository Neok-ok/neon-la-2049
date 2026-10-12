// LOD0 kit. Flames are the city-wide mesh, not this chunk. Spill quads stay here.
// The worker ships `seed` as float32. Past 2^24 the rounded value changes the yard,
// so the cylinders and spheres miss the berm. Rebuild it from the block indices.
import { Group } from 'three/webgpu';
import { registerDetail, type ChunkBlock } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { retainChunk } from '../../lighting/registry.ts';
import type { PunctualInput } from '../../lighting/validate.ts';
import { planSouthBay } from './plan';
import type { RefineryBlock, RefineryFlame, RefineryProp } from '../_shared/refinery/plan';
import { BLOCK_A, BLOCK_B, blockSeed } from './spec';

const CAP: Record<QualitySettings['tier'], number> = {
  low: 220,
  medium: 560,
  high: 1100,
  ultra: 1700,
};

const SPILL: Record<QualitySettings['tier'], number> = {
  low: 0.5,
  medium: 0.8,
  high: 1.2,
  ultra: 1.5,
};

function keepRank(rank: number, scale: number): boolean {
  if (rank <= 0) return true;
  if (rank === 1) return scale >= 0.45;
  if (rank === 2) return scale >= 0.75;
  return scale >= 0.95;
}

function asBlock(b: ChunkBlock, index: number): RefineryBlock {
  const i = Math.round(-b.cz / BLOCK_A - 0.5);
  const j = Math.round(b.cx / BLOCK_B - 0.5);
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street,
    seed: blockSeed(i, j, index),
    ground: b.ground,
  };
}

function thin<T>(items: T[], cap: number): T[] {
  if (items.length <= cap || cap <= 0) return cap <= 0 ? [] : items;
  const out: T[] = [];
  const step = items.length / cap;
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}

registerDetail('south-bay-street', ['south-bay-refineries'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const spill = SPILL[ctx.quality.tier];
  const props: RefineryProp[] = [];
  const flames: RefineryFlame[] = [];
  let any = false;
  const x1 = ctx.x0 + ctx.size, z1 = ctx.z0 + ctx.size;
  for (const b of ctx.blocks) {
    const district = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
    if (district?.id !== 'south-bay-refineries') continue;
    any = true;
    const plan = planSouthBay(asBlock(b, district.index), ctx.layout);
    for (const p of plan.props) if (keepRank(p.rank, scale)) props.push(p);
    for (const f of plan.flames) {
      if (f.x >= ctx.x0 && f.x < x1 && f.z >= ctx.z0 && f.z < z1) flames.push(f);
    }
  }
  if (!any || !props.length) return null;
  props.sort((a, b) => a.rank - b.rank);
  const kept = thin(props, CAP[ctx.quality.tier]);
  if (!kept.length) return null;
  const group = new Group();
  group.name = 'south-bay-street';
  const kit: KitInstance[] = kept.map((p) => ({
    template: p.template,
    x: p.x, y: p.y, z: p.z,
    yaw: p.yaw, pitch: p.pitch,
    sx: p.sx, sy: p.sy, sz: p.sz,
    color: p.color,
    emissive: p.pass === 'add'
      ? [p.emissive[0] * spill, p.emissive[1] * spill, p.emissive[2] * spill]
      : p.emissive,
    metal: p.metal,
    alpha: p.alpha,
    pass: p.pass,
  }));
  for (const mesh of buildKitMeshes(kit, 'south-bay-kit')) group.add(mesh);
  const lights: PunctualInput[] = [];
  for (const p of kept) {
    if (p.template === 'box' && p.sy < 0.22 && p.sx > 0.4 && p.sx < 1.2 && p.emissive[0] > 1 && p.emissive[1] > 0.4) {
      lights.push({ preset: 'street-sodium', x: p.x, y: p.y, z: p.z, dx: 0, dy: -1, dz: 0, candela: 9000, range: 24 });
    }
  }
  for (const f of flames) lights.push({ preset: 'flare', x: f.x, y: f.y, z: f.z });
  if (lights.length) group.userData.releaseLights = retainChunk(`south-bay:${ctx.x0}:${ctx.z0}`, lights);
  return group;
});
