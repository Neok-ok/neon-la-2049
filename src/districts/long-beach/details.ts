// LOD0 street kit: bollards. The street lamp is the pool.
// A coloured quad on the lane had no lamp and read as a teal sheet.
// The worker ships `seed` as float32. Rebuild it with hash2i.
import { Group } from 'three/webgpu';
import { registerDetail } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { DOOR_S, HERO_A, blockIndexAt } from './spec';

const CAP: Record<QualitySettings['tier'], number> = {
  low: 160,
  medium: 420,
  high: 800,
  ultra: 1200,
};

interface Prop extends KitInstance {
  rank: number;
}

function thin<T>(items: T[], cap: number): T[] {
  if (items.length <= cap || cap <= 0) return cap <= 0 ? [] : items;
  const out: T[] = [];
  const step = items.length / cap;
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}

function at(ax: number, az: number, cx: number, cz: number, s: number, t: number): [number, number] {
  const bx = -az;
  const bz = ax;
  return [cx + ax * s + bx * t, cz + az * s + bz * t];
}

registerDetail('long-beach-street', ['long-beach'], (ctx) => {
  const props: Prop[] = [];
  const scale = ctx.quality.detailScale;
  let any = false;
  for (const b of ctx.blocks) {
    const district = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
    if (district?.id !== 'long-beach') continue;
    any = true;
    if (b.ground > 45) continue;
    const { i, j } = blockIndexAt(b.cx, b.cz);
    if (ctx.layout.isReserved(b.cx, b.cz, 8) || ctx.layout.isOcean(b.cx, b.cz)) continue;
    const yawN = Math.atan2(b.ax, b.az);
    const edges: Array<{ s: number; t: number }> = [
      { s: b.la / 2 + 2.5, t: 0 },
      { s: 0, t: b.lb / 2 + 2.5 },
    ];
    if (i === HERO_A.i && j === HERO_A.j) edges.push({ s: DOOR_S - 4.2, t: 0 });
    for (const edge of edges) {
      for (const side of [-1, 1] as const) {
        const [bx, bz] = at(b.ax, b.az, b.cx, b.cz, edge.s, edge.t + side * 6.5);
        props.push({
          template: 'cyl',
          x: bx, y: b.ground + 0.45, z: bz,
          yaw: yawN, sx: 0.32, sy: 0.9, sz: 0.32,
          color: [0.16, 0.15, 0.13],
          emissive: [0, 0, 0],
          metal: 0.45,
          rank: 0,
        });
      }
    }
  }
  if (!any) return null;
  const kept = thin(props.filter((p) => p.rank === 0 || scale >= 0.45), CAP[ctx.quality.tier]);
  if (!kept.length) return null;
  const group = new Group();
  group.name = 'long-beach-street';
  for (const mesh of buildKitMeshes(kept, 'long-beach-kit')) group.add(mesh);
  return group;
});
