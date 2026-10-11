// Whether the camera is low over a carriageway. The wet reflector already exists;
// this only answers the question so a street can use it. No three.js imports.
import type { CityLayout } from '../world/layout';
import { distToPolyline } from '../world/layout';
import { edgeNear, streetGraph } from '../vehicles/streetGraph';
import { freewayRoutes } from '../vehicles/trafficRegistry';

/** True when (x, z) sits on a paved street or freeway, including the sidewalk. */
export function cameraOverRoad(layout: CityLayout, x: number, z: number): boolean {
  const g = streetGraph(layout);
  const hit = edgeNear(g, x, z, 36);
  if (hit) {
    const e = g.edges[hit.edge];
    if (e) {
      const half = e.kind === 'freeway' ? 18 : layout.districtAt(x, z).grid.street * 0.5 + 0.6;
      if (hit.dist <= half) return true;
    }
  }
  for (const spec of freewayRoutes()) {
    if (spec.vehicles) continue;
    const line = layout.freeways.find((f) => f.id === spec.id);
    if (!line) continue;
    const bb = line.bbox;
    if (x < bb[0] - 40 || x > bb[2] + 40 || z < bb[1] - 40 || z > bb[3] + 40) continue;
    if (distToPolyline(x, z, line) <= line.width * 0.5 + 1) return true;
  }
  return false;
}
