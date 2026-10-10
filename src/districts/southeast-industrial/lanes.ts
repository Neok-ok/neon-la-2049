// Tanker and box-truck lattice, plus one freight spinner run.
// Nodes are prefixed. No ramps, no shared nodes. The lane is 6.6 m, so
// SpinnerTraffic must skip this district or it will park at 74 m and 112 m.
import { registerStreetLattice } from '../../vehicles/trafficRegistry';
import type { CityLayout } from '../../world/layout';
import { BEARING, BLOCK_A, BLOCK_B, FREIGHT_J, FREIGHT_Y, LANE, LATTICE } from './spec';

registerStreetLattice({
  id: LATTICE.id,
  districts: ['southeast-industrial'],
  bearingDeg: BEARING,
  blockA: BLOCK_A,
  blockB: BLOCK_B,
  i0: LATTICE.i0,
  i1: LATTICE.i1,
  j0: LATTICE.j0,
  j1: LATTICE.j1,
  lane: LANE,
  prefix: LATTICE.prefix,
  kind: 'street',
});

export interface SoutheastFreightRun {
  id: string;
  loop: boolean;
  pts: Array<[number, number, number]>;
  weight: number;
  police: number;
  transport: number;
  speed: [number, number];
  sep: number;
  altBias: number;
  fade: number;
  platoon: [number, number];
}

/**
 * One open polyline on the eastern north-south street, above the tallest stack.
 * Dropped if a landmark occupies the line. Not a street-graph edge.
 */
export function southeastFreightRuns(
  layout: CityLayout,
  blocked: (x: number, y: number, z: number) => boolean,
): SoutheastFreightRun[] {
  const x = FREIGHT_J * BLOCK_B;
  const pts: Array<[number, number, number]> = [];
  for (let z = 3600; z <= 11000; z += 220) {
    if (layout.districtAt(x, z).id !== 'southeast-industrial') continue;
    if (layout.isReserved(x, z, 8)) continue;
    const y = layout.heightAt(x, z) + FREIGHT_Y;
    if (blocked(x, y, z)) return [];
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(x - prev[0], z - prev[2]) > 460) continue;
    pts.push([x, y, z]);
  }
  if (pts.length < 3) return [];
  return [{
    id: 'southeast-freight',
    loop: false,
    pts,
    weight: 1.4,
    police: 0,
    transport: 1,
    speed: [22, 34],
    sep: 8,
    altBias: 0,
    fade: 90,
    platoon: [2, 4],
  }];
}
