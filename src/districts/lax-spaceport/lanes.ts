// Service lattice. Prefix `lx` so nodes do not meet any other lattice. No ramps.
// Lane is 11.5 m, and the gantries are 420 m, so SpinnerTraffic must not park here.
import { registerStreetLattice } from '../../vehicles/trafficRegistry';
import type { CityLayout } from '../../world/layout';
import { BEARING, BLOCK_A, BLOCK_B, LANE, LATTICE, SHUTTLE_LINE, SHUTTLE_Y } from './spec';

registerStreetLattice({
  id: LATTICE.id,
  districts: ['lax-spaceport'],
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

export interface LaxShuttleRun {
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
 * One open polyline on the street between the centre pad and the terminal.
 * Altitude clears the 70 m roof and stays under the 460 m ambient floor.
 * Dropped if a gantry collider occupies a sample. Not a street-graph edge.
 */
export function laxShuttleRuns(
  layout: CityLayout,
  blocked: (x: number, y: number, z: number) => boolean,
): LaxShuttleRun[] {
  const z = -SHUTTLE_LINE * BLOCK_A;
  const pts: Array<[number, number, number]> = [];
  for (let j = LATTICE.j0; j <= LATTICE.j1; j++) {
    const x = j * BLOCK_B;
    if (layout.districtAt(x, z).id !== 'lax-spaceport') continue;
    if (layout.isOcean(x, z) || layout.isReserved(x, z, 6)) continue;
    const y = layout.heightAt(x, z) + SHUTTLE_Y;
    if (blocked(x, y, z)) return [];
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(x - prev[0], z - prev[2]) > 560) continue;
    pts.push([x, y, z]);
  }
  if (pts.length < 3) return [];
  return [{
    id: 'lax-shuttle',
    loop: false,
    pts,
    weight: 1.2,
    police: 0,
    transport: 1,
    speed: [24, 36],
    sep: 14,
    altBias: 0,
    fade: 90,
    platoon: [2, 3],
  }];
}
