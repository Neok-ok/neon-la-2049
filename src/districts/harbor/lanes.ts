// Container-hauler lattice, plus one freight spinner run.
// Nodes are prefixed. No ramps, no shared nodes. The lane is 7.5 m, so
// SpinnerTraffic must skip this district or it will park at 74 m and 112 m.
import { registerStreetLattice } from '../../vehicles/trafficRegistry';
import type { CityLayout } from '../../world/layout';
import { pastSeaWall } from '../coastal-strip/profile';
import { BEARING, BLOCK_A, BLOCK_B, FREIGHT_J, FREIGHT_Y, LANE, LATTICE } from './spec';

registerStreetLattice({
  id: LATTICE.id,
  districts: ['harbor'],
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

export interface HarborFreightRun {
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
 * One open polyline on a north-south street through the yards, above the crane houses.
 * Dropped if a landmark occupies the line. Not a street-graph edge.
 */
export function harborFreightRuns(
  layout: CityLayout,
  blocked: (x: number, y: number, z: number) => boolean,
): HarborFreightRun[] {
  const x = FREIGHT_J * BLOCK_B;
  const runs: Array<Array<[number, number, number]>> = [];
  let pts: Array<[number, number, number]> = [];
  const flush = () => {
    if (pts.length >= 3) runs.push(pts);
    pts = [];
  };
  for (let z = 29000; z <= 36000; z += 240) {
    if (layout.districtAt(x, z).id !== 'harbor') { flush(); continue; }
    if (layout.isReserved(x, z, 8) || layout.isOcean(x, z) || pastSeaWall(layout, x, z)) { flush(); continue; }
    const y = layout.heightAt(x, z) + FREIGHT_Y;
    if (blocked(x, y, z)) { flush(); continue; }
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(x - prev[0], z - prev[2]) > 500) flush();
    pts.push([x, y, z]);
  }
  flush();
  return runs.map((run, i) => ({
    id: i === 0 ? 'harbor-freight' : `harbor-freight-${i}`,
    loop: false,
    pts: run,
    weight: 1.25,
    police: 0,
    transport: 1,
    speed: [18, 30],
    sep: 10,
    altBias: 0,
    fade: 90,
    platoon: [2, 4],
  }));
}
