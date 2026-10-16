// LOD0 street kit for one Little Tokyo chunk: merged props, instanced steam, instanced neon pools.
// Draw calls: opaque + fade + pools + steam (about 4), on top of the chunk's fabric and signs.
// That is more than the "≤2 detail draws" guide. The market is the exception; the global medium
// budget (≤250 draws, ≤1.5 M tris) is still the limit. See the district README.
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry,
  Quaternion, Vector3,
} from 'three/webgpu';
import { registerDetail, type ChunkBlock, type DetailContext } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { makeCross } from '../_shared/kit/templates';
import { getPoolMaterial, getSteamMaterial } from '../_shared/kit/materials';
import { retainChunk } from '../../lighting/registry.ts';
import type { PunctualInput } from '../../lighting/validate.ts';
import { dressBlock, type MarketBlock, type MarketProp } from './dress';

const CAP: Record<QualitySettings['tier'], { props: number; steam: number; pools: number }> = {
  low: { props: 1400, steam: 48, pools: 90 },
  medium: { props: 4200, steam: 140, pools: 280 },
  high: { props: 8000, steam: 300, pools: 520 },
  ultra: { props: 14000, steam: 520, pools: 900 },
};

function keepRank(rank: number, scale: number): boolean {
  if (rank <= 0) return true;
  if (rank === 1) return scale >= 0.45;
  if (rank === 2) return scale >= 0.75;
  return scale >= 0.95;
}

function isMarket(b: ChunkBlock, ctx: DetailContext): boolean {
  const d = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
  return d?.id === 'little-tokyo-market';
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

registerDetail('little-tokyo-market', ['little-tokyo-market'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const cap = CAP[ctx.quality.tier];
  const props: MarketProp[] = [];
  const grates: MarketProp[] = [];
  const steam: Array<{ x: number; y: number; z: number; seed: number; rank: number }> = [];
  const pools: Array<{ x: number; y: number; z: number; yaw: number; len: number; wid: number; rgb: [number, number, number]; intensity: number; rank: number }> = [];

  for (const b of ctx.blocks) {
    if (!isMarket(b, ctx)) continue;
    const mb: MarketBlock = {
      cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, la: b.la, lb: b.lb,
      street: b.street, seed: b.seed, ground: b.ground,
    };
    const d = dressBlock(mb, ctx.layout);
    for (const p of d.props) {
      if (p.template === 'quadY' && p.sx === 1.1 && p.sz === 1.1) grates.push(p);
      if (keepRank(p.rank, scale)) props.push(p);
    }
    for (const s of d.steam) if (keepRank(s.rank, scale)) steam.push(s);
    for (const p of d.pools) if (keepRank(p.rank, scale)) pools.push(p);
  }
  if (!props.length && !steam.length && !pools.length) return null;

  props.sort((a, b) => a.rank - b.rank);
  steam.sort((a, b) => a.rank - b.rank);
  pools.sort((a, b) => a.rank - b.rank);

  const group = new Group();
  group.name = 'little-tokyo-market';
  const keptProps = thin(props, cap.props);
  // Rank 1 drops the courtyard grate on low. Put that quad back so the steam has a plate.
  // Medium and ultra already keep it, and this does not reshuffle their thin sample.
  if (scale < 0.45) {
    for (const g of grates) keptProps.push(g);
  }
  for (const mesh of buildKitMeshes(keptProps as unknown as KitInstance[], 'lt-kit')) group.add(mesh);

  const steamKept = thin(steam, Math.min(cap.steam, ctx.quality.steam));
  if (steamKept.length) group.add(buildSteam(steamKept));
  const poolKept = thin(pools, cap.pools);
  if (poolKept.length) group.add(buildPools(poolKept));
  const lights = marketLamps(keptProps);
  if (lights.length) group.userData.releaseLights = retainChunk(`lt-lamps:${ctx.x0}:${ctx.z0}`, lights);
  return group;
});

/**
 * The dress file only paints the lantern box. A 4 m head at 1 800 cd is about the
 * same ground lux as a 7 500 cd street lamp at 8 m, so the pool stays under the shell.
 * Cyan boxes stay shells. A cyan cone with the head out of frame read as a sourceless wash.
 */
function marketLamps(props: MarketProp[]): PunctualInput[] {
  const lights: PunctualInput[] = [];
  for (const p of props) {
    if (p.template !== 'box' || p.sx !== 0.9 || p.sy !== 0.2 || p.sz !== 0.42) continue;
    if (p.emissive[2] > p.emissive[0]) continue;
    if (p.emissive[0] + p.emissive[1] + p.emissive[2] < 1) continue;
    lights.push({ preset: 'street-sodium', x: p.x, y: p.y, z: p.z, candela: 1800, range: 14, dx: 0, dy: -1, dz: 0 });
  }
  return lights;
}

/** Even stride so a cap thins the whole chunk instead of deleting the far end of the block list. */
function thin<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const out: T[] = [];
  const step = items.length / cap;
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

function buildSteam(pts: Array<{ x: number; y: number; z: number; seed: number }>): Mesh {
  const geo = getSteamGeo().clone();
  const attr = new Float32Array(pts.length * 4);
  const mesh = new InstancedMesh(geo, getSteamMaterial(), pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    _p.set(p.x, p.y + 0.55, p.z);
    _q.identity();
    _s.set(0.85, 1.35, 0.85);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    attr.set([p.seed, 0, 0, 0], i * 4);
  }
  geo.setAttribute('iSteam', new InstancedBufferAttribute(attr, 4));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = 'lt-steam';
  mesh.renderOrder = 4;
  return mesh;
}

function buildPools(pts: Array<{ x: number; y: number; z: number; yaw: number; len: number; wid: number; rgb: [number, number, number]; intensity: number }>): Mesh {
  const geo = getPoolGeo().clone();
  const attr = new Float32Array(pts.length * 4);
  const mesh = new InstancedMesh(geo, getPoolMaterial(), pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    _p.set(p.x, p.y, p.z);
    _q.setFromAxisAngle(_up, p.yaw);
    _s.set(p.wid, 1, p.len);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    attr.set([p.rgb[0], p.rgb[1], p.rgb[2], p.intensity], i * 4);
  }
  geo.setAttribute('iLight', new InstancedBufferAttribute(attr, 4));
  mesh.frustumCulled = false;
  mesh.name = 'lt-pools';
  mesh.renderOrder = 1;
  return mesh;
}
