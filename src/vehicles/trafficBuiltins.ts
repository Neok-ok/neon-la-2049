// The downtown avenues, the Broadway canyon, and the basin freeways. Later districts add a
// lattice from traffic-index.ts. They do not build their own graph.
import { DOWNTOWN_BLOCK_A, DOWNTOWN_BLOCK_B, DOWNTOWN_BEARING } from '../districts/_shared/megablock/grid';
import { BEARING, BLOCK_A, BLOCK_B, LANE } from '../districts/historic-core/spec';
import { registerFreewayTraffic, registerStreetLattice } from './trafficRegistry';

registerStreetLattice({
  id: 'downtown-avenues',
  districts: ['dtla', 'financial-megatowers', 'civic-center'],
  bearingDeg: DOWNTOWN_BEARING,
  blockA: DOWNTOWN_BLOCK_A,
  blockB: DOWNTOWN_BLOCK_B,
  i0: -42,
  i1: 42,
  j0: -42,
  j1: 42,
  lane: 7.2,
  prefix: 'd',
  kind: 'street',
});

registerStreetLattice({
  id: 'broadway-canyon',
  districts: ['historic-core'],
  bearingDeg: BEARING,
  blockA: BLOCK_A,
  blockB: BLOCK_B,
  i0: -28,
  i1: 8,
  j0: -12,
  j1: 6,
  lane: LANE,
  prefix: 'h',
  kind: 'canyon',
});

// The 110 is the deep downtown cut. The 101 and the 10 are a little shallower.
// The other freeways stay on grade: far streaks only, so the basin reads from the air.
registerFreewayTraffic({
  id: 'I-110', depth: 8.6, trench: true, vehicles: true,
  lanes: 3, inset: 4.8, spacing: 3.5, streakLanes: 2, streakStep: 30, density: 1,
});
registerFreewayTraffic({
  id: 'US-101', depth: 8.1, trench: true, vehicles: true,
  lanes: 3, inset: 4.7, spacing: 3.45, streakLanes: 2, streakStep: 32, density: 0.9,
});
registerFreewayTraffic({
  id: 'I-10', depth: 7.5, trench: true, vehicles: true,
  lanes: 3, inset: 4.9, spacing: 3.55, streakLanes: 2, streakStep: 30, density: 1,
});
for (const id of ['I-405', 'I-5', 'I-105', 'I-710']) {
  registerFreewayTraffic({
    id, depth: 0, trench: false, vehicles: false,
    lanes: 2, inset: 5.2, spacing: 3.6, streakLanes: 1, streakStep: 74, density: 0.45,
  });
}
