// Districts register street lattices and freeway routes here. The builder in streetGraph.ts
// turns both into one graph. Do not start a second graph.
// Coastal strip, K's megablock and the Wallace precinct never receive edges.

export const NO_STREET_GRAPH = new Set(['coastal-strip', 'k-megablock', 'wallace-vernon']);

export type LatticeKind = 'street' | 'canyon';

export interface StreetLatticeSpec {
  id: string;
  /** Edge midpoints must fall in one of these districts, and that district's `traffic` must be > 0. */
  districts: readonly string[];
  bearingDeg: number;
  blockA: number;
  blockB: number;
  /** Inclusive node index range. Edges run between i and i+1, j and j+1. */
  i0: number;
  i1: number;
  j0: number;
  j1: number;
  /** Metres from the centreline to the driving line. */
  lane: number;
  /** Node keys are prefixed so two lattices never share a node. */
  prefix: string;
  kind: LatticeKind;
}

export interface FreewayTrafficSpec {
  /** Id in city-layout.json `freeways`. */
  id: string;
  /** Metres the deck sits below the terrain. 0 leaves the lights on grade. */
  depth: number;
  /** Sunken concrete. Depth should be > 0. */
  trench: boolean;
  /** Near vehicles on the shared graph. False keeps far light streaks only. */
  vehicles: boolean;
  /** Vehicle lanes each way. */
  lanes: number;
  /** Metres from the centreline to the first lane, right of travel. */
  inset: number;
  /** Metres between adjacent lanes. */
  spacing: number;
  /** Streak lanes each way. Can be fewer than `lanes`. */
  streakLanes: number;
  /** Metres between streak slots along the road. */
  streakStep: number;
  /** Spawn weight along the route. */
  density: number;
}

const lattices: StreetLatticeSpec[] = [];
const freeways: FreewayTrafficSpec[] = [];
let revision = 0;

export function trafficRevision(): number {
  return revision;
}

export function registerStreetLattice(spec: StreetLatticeSpec): void {
  const prev = lattices.findIndex((s) => s.id === spec.id);
  if (prev >= 0) lattices[prev] = spec;
  else lattices.push(spec);
  revision++;
}

export function registerFreewayTraffic(spec: FreewayTrafficSpec): void {
  const prev = freeways.findIndex((s) => s.id === spec.id);
  if (prev >= 0) freeways[prev] = spec;
  else freeways.push(spec);
  revision++;
}

export function streetLattices(): readonly StreetLatticeSpec[] {
  return lattices;
}

export function freewayRoutes(): readonly FreewayTrafficSpec[] {
  return freeways;
}
