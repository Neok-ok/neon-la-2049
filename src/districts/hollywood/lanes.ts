// One street lattice. Prefix `hw` so nodes do not meet any other lattice. No ramps.
// Lane is 6.4 m, so SpinnerTraffic must skip this district or it will park at 74 m and 112 m.
import { registerStreetLattice } from '../../vehicles/trafficRegistry';
import { BEARING, BLOCK_A, BLOCK_B, LANE, LATTICE } from './spec';

registerStreetLattice({
  id: LATTICE.id,
  districts: ['hollywood'],
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
