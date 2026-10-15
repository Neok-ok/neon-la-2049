// Main-thread "detail layers": extra meshes a district adds to LOD0 chunks (street props, kiosks,
// lamps, steam, interiors entrances...). Built when a chunk reaches LOD0, disposed when it leaves.
import type { Object3D } from 'three/webgpu';
import type { CityLayout } from '../layout';
import type { QualitySettings } from '../../core/quality';

/** Compact block record sent back by the chunk worker (see BLOCK_STRIDE). */
export interface ChunkBlock {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  la: number;
  lb: number;
  street: number;
  districtIndex: number;
  seed: number;
  ground: number;
}

export interface DetailContext {
  /** chunk origin (world) — the returned object is positioned in world space by the caller */
  x0: number;
  z0: number;
  size: number;
  blocks: ChunkBlock[];
  layout: CityLayout;
  quality: QualitySettings;
}

/** Return an Object3D in WORLD coordinates (or null). It will be removed + disposed with the chunk. */
export type DetailBuilder = (ctx: DetailContext) => Object3D | null;

const builders: Array<{ match: (districtId: string) => boolean; build: DetailBuilder; name: string }> = [];

/** `districts`: list of district ids, or '*' for every district. */
export function registerDetail(name: string, districts: string[] | '*', build: DetailBuilder): void {
  const match = districts === '*' ? () => true : (id: string) => districts.includes(id);
  builders.push({ name, match, build });
}

function districtIds(ctx: DetailContext): Set<string> {
  const ids = new Set<string>();
  for (const b of ctx.blocks) {
    const d = b.districtIndex === 0 ? ctx.layout.defaultDistrict : ctx.layout.districts[b.districtIndex - 1];
    ids.add(d.id);
  }
  return ids;
}

/** Detail passes that apply to this chunk, in registration order. */
export function detailNames(ctx: DetailContext): string[] {
  const ids = districtIds(ctx);
  const names: string[] = [];
  for (const b of builders) {
    if ([...ids].some((id) => b.match(id))) names.push(b.name);
  }
  return names;
}

/** One registered pass. The chunk streamer calls these across frames. */
export function buildNamedDetail(ctx: DetailContext, name: string): Object3D | null {
  const b = builders.find((item) => item.name === name);
  if (!b) return null;
  const ids = districtIds(ctx);
  if (![...ids].some((id) => b.match(id))) return null;
  const o = b.build(ctx);
  if (o) o.name = o.name || b.name;
  return o;
}

export function buildDetails(ctx: DetailContext): Object3D[] {
  const out: Object3D[] = [];
  for (const name of detailNames(ctx)) {
    const o = buildNamedDetail(ctx, name);
    if (o) out.push(o);
  }
  return out;
}
