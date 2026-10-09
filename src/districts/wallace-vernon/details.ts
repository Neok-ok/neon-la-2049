// LOD0 extras for the Wallace precinct: steam on the same stacks the archetype built,
// and bronze bars along the owned street edge. Buildings stay in the fabric mesh.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three/webgpu';
import { registerDetail, type ChunkBlock, type DetailContext } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { GeoWriter, type FaceStyle } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { Style } from '../../world/fabric/types';
import { makeCross } from '../_shared/kit/templates';
import { getSteamMaterial } from '../_shared/kit/materials';
import { designBlock, type SteamPoint, type WallaceBlock } from './plan';

const STEAM_CAP: Record<QualitySettings['tier'], number> = { low: 8, medium: 18, high: 36, ultra: 56 };
const POST_CAP: Record<QualitySettings['tier'], number> = { low: 10, medium: 24, high: 40, ultra: 64 };

const BRONZE: FaceStyle = { style: Style.Glow, lit: 0.4, tint: 1.06, seed: 0.47 };

function idOf(b: ChunkBlock, ctx: DetailContext): string {
  const d = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asBlock(b: ChunkBlock): WallaceBlock {
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, seed: b.seed, ground: b.ground,
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

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

function thin<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const out: T[] = [];
  const step = items.length / cap;
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}

function steamMesh(pts: SteamPoint[]): InstancedMesh {
  const geo = getSteamGeo().clone();
  const attr = new Float32Array(pts.length * 4);
  const mesh = new InstancedMesh(geo, getSteamMaterial(), pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    mesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y + 0.6, p.z), _q.identity(), _s.set(1.4, 2.4, 1.4)));
    attr.set([p.seed, 0, 0, 0], i * 4);
  }
  geo.setAttribute('iSteam', new InstancedBufferAttribute(attr, 4));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = 'wallace-steam';
  mesh.renderOrder = 4;
  return mesh;
}

registerDetail('wallace-vernon', ['wallace-vernon'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const steam: SteamPoint[] = [];
  const posts: Array<[number, number, number]> = [];
  let any = false;
  for (const raw of ctx.blocks) {
    if (idOf(raw, ctx) !== 'wallace-vernon') continue;
    any = true;
    const b = asBlock(raw);
    const pts = designBlock(b, () => {});
    for (const p of pts) {
      if (p.rank > 0 && scale < 0.45) continue;
      if (ctx.layout.isReserved(p.x, p.z, 6)) continue;
      steam.push(p);
    }
    if (scale < 0.4) continue;
    for (let t = -b.lb / 2 + 10; t < b.lb / 2 - 4; t += 52) {
      const x = b.cx + b.ax * (b.la / 2 - 1.4) + b.bx * t;
      const z = b.cz + b.az * (b.la / 2 - 1.4) + b.bz * t;
      if (ctx.layout.isReserved(x, z, 3)) continue;
      posts.push([x, b.ground, z]);
    }
  }
  if (!any) return null;
  const g = new Group();
  g.name = 'wallace-detail';
  const keptSteam = thin(steam, STEAM_CAP[ctx.quality.tier]);
  if (keptSteam.length) g.add(steamMesh(keptSteam));
  const keptPosts = thin(posts, POST_CAP[ctx.quality.tier]);
  if (keptPosts.length) {
    const w = new GeoWriter();
    for (const [x, y, z] of keptPosts) w.box(x, z, y, 0.28, 0.28, 6.2, 0, BRONZE);
    const mesh = new Mesh(w.build(), getCityMaterial());
    mesh.name = 'wallace-posts';
    g.add(mesh);
  }
  return g;
});
