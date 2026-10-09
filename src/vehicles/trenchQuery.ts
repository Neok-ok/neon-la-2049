// Pure (worker-safe). Where the sunken freeways cut the city ground sheet.
// The sheet is a solid quad at grade, so a deck below it is invisible until these cells are omitted.
import type { CityLayout } from '../world/layout';
import { distToPolyline } from '../world/layout';
import { NO_STREET_GRAPH, freewayRoutes } from './trafficRegistry';
import './traffic-index';

/** Cells whose centre is closer than this lose their ground quad. The concrete lip covers the edge. */
export const TRENCH_CUT = 32;
/** Outer shoulder of the trench mesh, metres from the centreline. Wider than the cut so it laps the next ground cell. */
export const TRENCH_LIP = 50;

/** Metres to the nearest sunken freeway centreline, or Infinity where no trench is built. */
export function trenchDistance(layout: CityLayout, x: number, z: number): number {
  if (!layout.inBounds(x, z) || layout.isOcean(x, z)) return Infinity;
  if (NO_STREET_GRAPH.has(layout.districtAt(x, z).id)) return Infinity;
  if (layout.inLandmark(x, z, 2)) return Infinity;
  let best = Infinity;
  for (const spec of freewayRoutes()) {
    if (!spec.trench) continue;
    const line = layout.freeways.find((f) => f.id === spec.id);
    if (!line) continue;
    const bb = line.bbox;
    if (x < bb[0] - 120 || z < bb[1] - 120 || x > bb[2] + 120 || z > bb[3] + 120) continue;
    const d = distToPolyline(x, z, line);
    if (d < best) best = d;
  }
  return best;
}
