// The one GRID DOWN plate. The 5/10 reserve swallows the wall's midpoint, so the
// plate sits on the nearest segment whose face and a 9 m stance in front of it are clear.
import type { CityLayout } from '../../world/layout';
import { enumerateBlocks } from '../../world/fabric/generator';
import { gridIndex, noticeAnchor, type SprawlBlock } from '../_shared/sprawl/plan';
import { eastLaCrossings } from './crossings';
import { DISTRICT, EAST_LA_PARAMS } from './spec';

export interface GridDownSite {
  i: number;
  j: number;
  /** Crossing the plate is named for. The anchor search uses this, not the sign. */
  crossX: number;
  crossZ: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
}

let cache: { key: string; site: GridDownSite | null } | null = null;

function toBlock(b: {
  district: { id: string };
  cx: number; cz: number; ax: number; az: number; bx: number; bz: number;
  la: number; lb: number; street: number; seed: number; ground: number;
}): SprawlBlock {
  return {
    id: b.district.id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

function isHub(block: SprawlBlock): boolean {
  const hub = EAST_LA_PARAMS.hub;
  if (!hub || block.la < 70 || block.lb < 48) return false;
  const cell = gridIndex({ ...block, cx: hub.x, cz: hub.z });
  const here = gridIndex(block);
  return cell.i === here.i && cell.j === here.j;
}

/** Host block and world pose of the paper plate. Null when the crossing has no clear wall. */
export function findGridDown(layout: CityLayout): GridDownSite | null {
  const cross = eastLaCrossings(layout).find((c) => c.id === 'el-5-10');
  const key = cross ? `${cross.x.toFixed(2)},${cross.z.toFixed(2)}` : '';
  if (cache && cache.key === key) return cache.site;
  if (!cross) {
    cache = { key, site: null };
    return null;
  }
  const blocks = enumerateBlocks(layout, cross.x - 240, cross.z - 240, 480);
  let site: GridDownSite | null = null;
  let best = Infinity;
  for (const b of blocks) {
    if (b.district.id !== DISTRICT || b.ground > 45) continue;
    if (Math.hypot(b.cx - cross.x, b.cz - cross.z) > 190) continue;
    const block = toBlock(b);
    if (isHub(block)) continue;
    const spot = noticeAnchor(layout, block, cross);
    if (!spot) continue;
    const d = Math.hypot(spot.x - cross.x, spot.z - cross.z);
    if (d >= best) continue;
    best = d;
    site = {
      i: b.i, j: b.j,
      crossX: cross.x, crossZ: cross.z,
      x: spot.x, y: spot.y, z: spot.z, nx: spot.nx, nz: spot.nz,
    };
  }
  cache = { key, site };
  return site;
}
