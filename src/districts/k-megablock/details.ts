// LOD0 street kit for K's megablock. One opaque batch, plus steam and sodium pools.
// The hero market is added when its props fall inside the chunk.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three/webgpu';
import { registerDetail, type ChunkBlock, type DetailContext } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { makeCross } from '../_shared/kit/templates';
import { getPoolMaterial, getSteamMaterial } from '../_shared/kit/materials';
import { dressBlock, marketKit, type KBlock, type KPool, type KProp, type KSteam } from './dress';

const CAP: Record<QualitySettings['tier'], { props: number; steam: number; pools: number }> = {
  low: { props: 280, steam: 10, pools: 20 },
  medium: { props: 720, steam: 22, pools: 48 },
  high: { props: 1600, steam: 40, pools: 90 },
  ultra: { props: 2600, steam: 64, pools: 140 },
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

function asBlock(b: ChunkBlock): KBlock {
  return {
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

function buildSteam(pts: KSteam[]): Mesh {
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
  mesh.name = 'k-steam';
  mesh.renderOrder = 4;
  return mesh;
}

function buildPools(pts: KPool[]): Mesh {
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
  mesh.name = 'k-pools';
  mesh.renderOrder = 1;
  return mesh;
}

registerDetail('k-street', ['k-megablock'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const cap = CAP[ctx.quality.tier];
  const props: KProp[] = [];
  const steam: KSteam[] = [];
  const pools: KPool[] = [];
  let any = false;
  for (const b of ctx.blocks) {
    if (idOf(b, ctx) !== 'k-megablock') continue;
    any = true;
    const d = dressBlock(asBlock(b), ctx.layout);
    for (const p of d.props) if (keepRank(p.rank, scale)) props.push(p);
    for (const s of d.steam) if (keepRank(s.rank, scale)) steam.push(s);
    for (const p of d.pools) if (keepRank(p.rank, scale)) pools.push(p);
  }
  if (!any) return null;
  const hero = marketKit(ctx.layout);
  const x1 = ctx.x0 + ctx.size, z1 = ctx.z0 + ctx.size;
  const inside = (x: number, z: number) => x >= ctx.x0 && x < x1 && z >= ctx.z0 && z < z1;
  for (const p of hero.props) if (inside(p.x, p.z) && keepRank(p.rank, scale)) props.push(p);
  for (const s of hero.steam) if (inside(s.x, s.z) && keepRank(s.rank, scale)) steam.push(s);
  for (const p of hero.pools) if (inside(p.x, p.z) && keepRank(p.rank, scale)) pools.push(p);
  if (!props.length && !steam.length && !pools.length) return null;
  props.sort((a, b) => a.rank - b.rank);
  const group = new Group();
  group.name = 'k-street';
  for (const mesh of buildKitMeshes(thin(props, cap.props) as unknown as KitInstance[], 'k-kit')) group.add(mesh);
  const steamKept = thin(steam, Math.min(cap.steam, ctx.quality.steam));
  if (steamKept.length) group.add(buildSteam(steamKept));
  const poolKept = thin(pools, cap.pools);
  if (poolKept.length) group.add(buildPools(poolKept));
  return group;
});
