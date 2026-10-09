// LOD0 kit plus steam and spark cards. Shared sodium lamps stay on this district.
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3,
} from 'three/webgpu';
import { registerDetail, type ChunkBlock, type DetailContext } from '../../world/detail/registry';
import type { QualitySettings } from '../../core/quality';
import { buildKitMeshes, type KitInstance } from '../_shared/kit/batch';
import { makeCross } from '../_shared/kit/templates';
import { planArts, type ArtsProp, type ArtsPuff } from './plan';
import { getArtsSparkMaterial, getArtsSteamMaterial } from './particles';
import type { ArtsBlock } from './spec';

const CAP: Record<QualitySettings['tier'], { props: number; steam: number; sparks: number }> = {
  low: { props: 240, steam: 18, sparks: 0 },
  medium: { props: 680, steam: 40, sparks: 28 },
  high: { props: 1400, steam: 80, sparks: 56 },
  ultra: { props: 2200, steam: 120, sparks: 90 },
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

function asBlock(b: ChunkBlock): ArtsBlock {
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

let crossGeo: BufferGeometry | null = null;
function getCross(): BufferGeometry {
  if (crossGeo) return crossGeo;
  const t = makeCross();
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(t.position, 3));
  g.setAttribute('normal', new BufferAttribute(t.normal, 3));
  // Two quads. Without the index a triangle list keeps one triangle per quad.
  g.setIndex(new BufferAttribute(t.index.slice(), 1));
  crossGeo = g;
  return g;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

function thin<T>(items: T[], cap: number): T[] {
  if (items.length <= cap || cap <= 0) return cap <= 0 ? [] : items;
  const out: T[] = [];
  const step = items.length / cap;
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}

function cards(pts: ArtsPuff[], name: string, material: ReturnType<typeof getArtsSteamMaterial>): InstancedMesh {
  const geo = getCross().clone();
  const attr = new Float32Array(pts.length * 4);
  const mesh = new InstancedMesh(geo, material, pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    mesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(p.sx, p.sy, p.sz)));
    attr.set([p.seed, p.kind, 0, 0], i * 4);
  }
  geo.setAttribute('iPart', new InstancedBufferAttribute(attr, 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = name;
  mesh.renderOrder = name.includes('spark') ? 5 : 4;
  return mesh;
}

registerDetail('arts-street', ['arts-district'], (ctx) => {
  const scale = ctx.quality.detailScale;
  const cap = CAP[ctx.quality.tier];
  const low = ctx.quality.tier === 'low';
  const props: ArtsProp[] = [];
  const steam: ArtsPuff[] = [];
  const sparks: ArtsPuff[] = [];
  let any = false;
  for (const b of ctx.blocks) {
    if (idOf(b, ctx) !== 'arts-district') continue;
    any = true;
    const plan = planArts(asBlock(b), ctx.layout);
    for (const p of plan.props) if (keepRank(p.rank, scale)) props.push(p);
    for (const p of plan.puffs) {
      if (!keepRank(p.rank, scale)) continue;
      if (p.kind >= 3) {
        if (!low) sparks.push(p);
      } else if (low) {
        if (p.kind === 2) steam.push(p);
      } else if (ctx.quality.tier === 'medium') {
        if ((p.kind === 2) || ((p.seed * 17) % 1) < 0.5) steam.push(p);
      } else steam.push(p);
    }
  }
  if (!any) return null;
  props.sort((a, b) => a.rank - b.rank);
  const keptProps = thin(props, cap.props);
  const steamCap = Math.min(cap.steam, Math.max(8, Math.round(ctx.quality.steam * 0.22)));
  const plumes = steam.filter((p) => p.kind === 2);
  const drift = steam.filter((p) => p.kind !== 2);
  const keptPlumes = thin(plumes, steamCap);
  const keptSteam = keptPlumes.concat(thin(drift, Math.max(0, steamCap - keptPlumes.length)));
  const keptSparks = thin(sparks, cap.sparks);
  if (!keptProps.length && !keptSteam.length && !keptSparks.length) return null;
  const group = new Group();
  group.name = 'arts-street';
  const kit: KitInstance[] = keptProps.map((p) => ({
    template: p.template,
    x: p.x, y: p.y, z: p.z,
    yaw: p.yaw, pitch: p.pitch,
    sx: p.sx, sy: p.sy, sz: p.sz,
    color: p.color, emissive: p.emissive, metal: p.metal,
    alpha: p.alpha, pass: p.pass,
  }));
  for (const mesh of buildKitMeshes(kit, 'arts-kit')) group.add(mesh);
  if (keptSteam.length) group.add(cards(keptSteam, 'arts-steam', getArtsSteamMaterial()));
  if (keptSparks.length) group.add(cards(keptSparks, 'arts-spark', getArtsSparkMaterial()));
  return group;
});
