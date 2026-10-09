// Residential street lattice. One registration. Nodes are prefixed so they do not meet
// the avenues, the Broadway canyon, or a freeway chain.
import { registerStreetLattice } from '../../vehicles/trafficRegistry';
import { BEARING, BLOCK_A, BLOCK_B, LANE, LATTICE } from './spec';

registerStreetLattice({
  id: LATTICE.id,
  districts: ['lakewood-megablocks'],
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
