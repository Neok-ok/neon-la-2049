// LOD0 curb kit and sparse hillside lamps. Shared kit materials. No sodium lamps.
import { Group, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3 } from 'three/webgpu';
import { registerDetail, type ChunkBlock, type DetailContext } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { getPoolMaterial } from '../_shared/kit/materials';
import { planHollywood, type HwBlock, type HwPool, type HwProp } from './plan';
import { indexOf } from './spec';

const CAP: Record<QualitySettings['tier'], { props: number; pools: number }> = {
  low: { props: 180, pools: 24 },
  medium: { props: 480, pools: 60 },
  high: { props: 900, pools: 100 },
  ultra: { props: 1400, pools: 140 },
};

function keepRank(rank: number, scale: number): boolean {
  if (rank <= 0) return true;
  if (rank === 1) return scale >= 0.45;
  if (rank === 2) return scale >= 0.75;
  return scale >= 0.95;
}

function idOf(b: ChunkBlock, ctx: DetailContext): string {
  const d = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asBlock(b: ChunkBlock): HwBlock {
  const { i, j } = indexOf(b.cx, b.cz);
  return {
    i, j,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

let poolGeo: PlaneGeometry | null = null;
function getPoolGeo(): PlaneGeometry {
  if (poolGeo) return poolGeo;
  poolGeo = new PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  return poolGeo;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

function thin<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const out: T[] = [];
  const step = items.length / cap;
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}

function toKit(p: HwProp): KitInstance {
  return {
    template: p.template, x: p.x, y: p.y, z: p.z, yaw: p.yaw,
    sx: p.sx, sy: p.sy, sz: p.sz,
    color: p.color, emissive: p.emissive, metal: p.metal,
    pass: p.pass,
  };
}

function buildPools(pts: HwPool[]): InstancedMesh {
  const geo = getPoolGeo().clone();
  const attr = new Float32Array(pts.length * 4);
  const mesh = new InstancedMesh(geo, getPoolMaterial(), pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    mesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q.setFromAxisAngle(_up, p.yaw), _s.set(p.wid, 1, p.len)));
    attr.set([p.rgb[0], p.rgb[1], p.rgb[2], p.intensity], i * 4);
  }
  geo.setAttribute('iLight', new InstancedBufferAttribute(attr, 4));
  mesh.frustumCulled = false;
  mesh.name = 'hollywood-pools';
  mesh.renderOrder = 1;
  return mesh;
}

registerDetail('hollywood-street', ['hollywood'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const cap = CAP[ctx.quality.tier];
  const props: HwProp[] = [];
  const pools: HwPool[] = [];
  let any = false;
  for (const b of ctx.blocks) {
    if (idOf(b, ctx) !== 'hollywood') continue;
    any = true;
    const d = planHollywood(asBlock(b));
    for (const p of d.props) if (keepRank(p.rank, scale)) props.push(p);
    for (const p of d.pools) if (keepRank(p.rank, scale)) pools.push(p);
  }
  if (!any) return null;
  const keptP = thin(props, cap.props);
  const keptL = thin(pools, cap.pools);
  if (!keptP.length && !keptL.length) return null;
  const g = new Group();
  g.name = 'hollywood-street';
  for (const mesh of buildKitMeshes(keptP.map(toKit), 'hollywood-kit')) g.add(mesh);
  if (keptL.length) g.add(buildPools(keptL));
  return g;
});
