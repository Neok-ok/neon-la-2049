// LOD0 street kit. Cold pylons, one opaque batch, plus puddles and the occasional steam card.
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh,
  Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3,
} from 'three/webgpu';
import { registerDetail, type ChunkBlock, type DetailContext } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { makeCross } from '../_shared/kit/templates';
import { getPoolMaterial, getSteamMaterial } from '../_shared/kit/materials';
import { dressResidential, type ResPool, type ResProp, type ResSteam } from '../_shared/residential/dress';
import { planResidential, type ResBlock } from '../_shared/residential/plan';
import { SOUTH_LA_PARAMS } from './spec';

const CAP: Record<QualitySettings['tier'], { props: number; steam: number; pools: number }> = {
  low: { props: 280, steam: 8, pools: 16 },
  medium: { props: 720, steam: 20, pools: 40 },
  high: { props: 1600, steam: 36, pools: 80 },
  ultra: { props: 2600, steam: 56, pools: 120 },
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

function asBlock(b: ChunkBlock, id: string): ResBlock {
  return {
    id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

let steamGeo: BufferGeometry | null = null;
function getSteamGeo(): BufferGeometry {
  if (steamGeo) return steamGeo;
  const t = makeCross();
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(t.position, 3));
  g.setAttribute('normal', new BufferAttribute(t.normal, 3));
  steamGeo = g;
  return g;
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

function buildSteam(pts: ResSteam[]): Mesh {
  const geo = getSteamGeo().clone();
  const attr = new Float32Array(pts.length * 4);
  const mesh = new InstancedMesh(geo, getSteamMaterial(), pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    mesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y + 0.5, p.z), _q.identity(), _s.set(0.7, 1.2, 0.7)));
    attr.set([p.seed, 0, 0, 0], i * 4);
  }
  geo.setAttribute('iSteam', new InstancedBufferAttribute(attr, 4));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = 'southla-steam';
  mesh.renderOrder = 4;
  return mesh;
}

function buildPools(pts: ResPool[]): Mesh {
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
  mesh.name = 'southla-pools';
  mesh.renderOrder = 1;
  return mesh;
}

registerDetail('southla-street', ['south-la-megablocks'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const cap = CAP[ctx.quality.tier];
  const props: ResProp[] = [];
  const steam: ResSteam[] = [];
  const pools: ResPool[] = [];
  let any = false;
  for (const b of ctx.blocks) {
    const id = idOf(b, ctx);
    if (id !== 'south-la-megablocks') continue;
    any = true;
    const block = asBlock(b, id);
    const plan = planResidential(block, SOUTH_LA_PARAMS, ctx.layout);
    const d = dressResidential(block, plan, ctx.layout, {
      lamps: 'cold',
      busy: plan.spine || plan.hub,
    });
    for (const p of d.props) if (keepRank(p.rank, scale)) props.push(p);
    for (const s of d.steam) if (keepRank(s.rank, scale)) steam.push(s);
    for (const p of d.pools) if (keepRank(p.rank, scale)) pools.push(p);
  }
  if (!any) return null;
  if (!props.length && !steam.length && !pools.length) return null;
  props.sort((a, b) => a.rank - b.rank);
  const group = new Group();
  group.name = 'southla-street';
  for (const mesh of buildKitMeshes(thin(props, cap.props) as unknown as KitInstance[], 'southla-kit')) group.add(mesh);
  const steamKept = thin(steam, Math.min(cap.steam, ctx.quality.steam));
  if (steamKept.length) group.add(buildSteam(steamKept));
  const poolKept = thin(pools, cap.pools);
  if (poolKept.length) group.add(buildPools(poolKept));
  return group;
});
