// LOD0 street kit for a Downtown chunk, plus the MT-1 / MT-5 apron when this chunk contains it.
// Draws, on top of fabric and signs: kit opaque, optional fade, optional add, steam, pools.
// Caps are tighter than the market — a megablock chunk already spends its triangles on the masses.
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry,
  Quaternion, Vector3,
} from 'three/webgpu';
import { registerDetail, type ChunkBlock, type DetailContext } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { makeCross } from '../_shared/kit/templates';
import { getPoolMaterial, getSteamMaterial } from '../_shared/kit/materials';
import { blockIndexAt } from '../_shared/megablock/grid';
import { dressBlock, type DtlaBlock, type DtlaPool, type DtlaProp, type DtlaSteam } from './block';
import { dressPlaza } from './plaza';

const CAP: Record<QualitySettings['tier'], { props: number; steam: number; pools: number }> = {
  low: { props: 700, steam: 24, pools: 40 },
  medium: { props: 1600, steam: 80, pools: 140 },
  high: { props: 4200, steam: 160, pools: 280 },
  ultra: { props: 7000, steam: 280, pools: 480 },
};

function keepRank(rank: number, scale: number): boolean {
  if (rank <= 0) return true;
  if (rank === 1) return scale >= 0.45;
  if (rank === 2) return scale >= 0.75;
  return scale >= 0.95;
}

function districtId(b: ChunkBlock, ctx: DetailContext): string {
  const d = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

/** Chunk blocks omit i/j and the B axis. Both are a function of the downtown grid. */
function asDtla(b: ChunkBlock): DtlaBlock {
  const idx = blockIndexAt(b.cx, b.cz);
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
    i: idx.i, j: idx.j,
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

function buildSteam(pts: DtlaSteam[], name: string): Mesh {
  const geo = getSteamGeo().clone();
  const attr = new Float32Array(pts.length * 4);
  const mesh = new InstancedMesh(geo, getSteamMaterial(), pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    _p.set(p.x, p.y + 0.55, p.z);
    _q.identity();
    _s.set(0.9, 1.5, 0.9);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    attr.set([p.seed, 0, 0, 0], i * 4);
  }
  geo.setAttribute('iSteam', new InstancedBufferAttribute(attr, 4));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = name;
  mesh.renderOrder = 4;
  return mesh;
}

function buildPools(pts: DtlaPool[], name: string): Mesh {
  const geo = getPoolGeo().clone();
  const attr = new Float32Array(pts.length * 4);
  const mesh = new InstancedMesh(geo, getPoolMaterial(), pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    _p.set(p.x, p.y, p.z);
    _q.setFromAxisAngle(_up, p.yaw);
    _s.set(p.wid, 1, p.len);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    attr.set([p.rgb[0], p.rgb[1], p.rgb[2], p.intensity], i * 4);
  }
  geo.setAttribute('iLight', new InstancedBufferAttribute(attr, 4));
  mesh.frustumCulled = false;
  mesh.name = name;
  mesh.renderOrder = 1;
  return mesh;
}

function addDress(
  group: Group, name: string, props: DtlaProp[], steam: DtlaSteam[], pools: DtlaPool[],
  cap: { props: number; steam: number; pools: number }, steamCap: number,
): void {
  props.sort((a, b) => a.rank - b.rank);
  steam.sort((a, b) => a.rank - b.rank);
  pools.sort((a, b) => a.rank - b.rank);
  const kept = thin(props, cap.props) as unknown as KitInstance[];
  for (const mesh of buildKitMeshes(kept, name)) group.add(mesh);
  const steamKept = thin(steam, Math.min(cap.steam, steamCap));
  if (steamKept.length) group.add(buildSteam(steamKept, `${name}-steam`));
  const poolKept = thin(pools, cap.pools);
  if (poolKept.length) group.add(buildPools(poolKept, `${name}-pools`));
}

registerDetail('dtla-street', ['dtla'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const cap = CAP[ctx.quality.tier];
  const props: DtlaProp[] = [];
  const steam: DtlaSteam[] = [];
  const pools: DtlaPool[] = [];
  for (const b of ctx.blocks) {
    if (districtId(b, ctx) !== 'dtla') continue;
    const d = dressBlock(asDtla(b), ctx.layout);
    for (const p of d.props) if (keepRank(p.rank, scale)) props.push(p);
    for (const s of d.steam) if (keepRank(s.rank, scale)) steam.push(s);
    for (const p of d.pools) if (keepRank(p.rank, scale)) pools.push(p);
  }
  if (!props.length && !steam.length && !pools.length) return null;
  const group = new Group();
  group.name = 'dtla-street';
  addDress(group, 'dtla-kit', props, steam, pools, cap, ctx.quality.steam);
  return group;
});

registerDetail('dtla-plaza', ['dtla', 'financial-megatowers'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const cap = CAP[ctx.quality.tier];
  const d = dressPlaza(ctx.layout, ctx.x0, ctx.z0, ctx.size);
  const props = d.props.filter((p) => keepRank(p.rank, scale));
  const steam = d.steam.filter((s) => keepRank(s.rank, scale));
  const pools = d.pools.filter((p) => keepRank(p.rank, scale));
  if (!props.length && !steam.length && !pools.length) return null;
  const group = new Group();
  group.name = 'dtla-plaza';
  // The plaza shares the chunk with street props. Keep it to about a third of the street cap.
  addDress(group, 'dtla-plaza', props, steam, pools, {
    props: Math.round(cap.props * 0.35),
    steam: Math.round(cap.steam * 0.4),
    pools: Math.round(cap.pools * 0.4),
  }, ctx.quality.steam);
  return group;
});
