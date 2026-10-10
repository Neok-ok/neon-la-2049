// LOD0 kit. Flames are the city-wide mesh, not this chunk. Spill quads stay here.
import { Group } from 'three/webgpu';
import { hash2i } from '../../core/rng';
import { registerDetail, type ChunkBlock } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { planSoutheast } from './plan';
import type { RefineryBlock, RefineryProp } from '../_shared/refinery/plan';
import { BLOCK_A, BLOCK_B } from './spec';

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
  // The worker ships `seed` in a Float32Array. Past 2^24 it rounds, the yard
  // kind changes, and the cylinders no longer sit on the fabric berm.
  const i = Math.round(-b.cz / BLOCK_A - 0.5);
  const j = Math.round(b.cx / BLOCK_B - 0.5);
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street,
    seed: hash2i(i + 100000, j + 100000, index * 7919 + 13),
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

registerDetail('southeast-street', ['southeast-industrial'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const spill = SPILL[ctx.quality.tier];
  const props: RefineryProp[] = [];
  let any = false;
  for (const b of ctx.blocks) {
    const district = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
    if (district?.id !== 'southeast-industrial') continue;
    any = true;
    const plan = planSoutheast(asBlock(b, district.index), ctx.layout);
    for (const p of plan.props) if (keepRank(p.rank, scale)) props.push(p);
  }
  if (!any || !props.length) return null;
  props.sort((a, b) => a.rank - b.rank);
  const kept = thin(props, CAP[ctx.quality.tier]);
  if (!kept.length) return null;
  const group = new Group();
  group.name = 'southeast-street';
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
  for (const mesh of buildKitMeshes(kit, 'southeast-kit')) group.add(mesh);
  return group;
});
