// Cross-section for one carriageway. The graph `lane` is a driving-line offset from the
// centreline, not a painted width. Wide remainders stay lanes and shoulder. Sidewalks stay
// in the 1.5–4.5 m band the scale audit asked for, and a car body stays on the asphalt.
// Hollywood's 6.4 m offset is left alone: the audit marks that row as passing.

export const CAR_HALF = 0.91;
export const CURB_H = 0.15;
export const CURB_W = 0.16;
export const LANE_W = 3.6;
/** Metres the tyre contact sits above the terrain. Roads stay just under that. */
export const ROAD_LIFT = 0.012;
export const CAR_LIFT = 0.02;

export type RoadKind = 'street' | 'canyon' | 'freeway';

export interface RoadProfile {
  street: number;
  sidewalk: number;
  curbW: number;
  curbH: number;
  laneW: number;
  /** Metres from the centreline to the tracked driving line. */
  driving: number;
  /** Asphalt half-width, centreline to the curb face. */
  carriageHalf: number;
  /** Painted lane centres, both directions, metres along the right vector. */
  lanes: number[];
  alley: boolean;
  kind: RoadKind;
}

/**
 * Districts that opted out of the shared sodium pole.
 * The road builder plants the replacement heads, and only in these districts.
 * Lakewood and the other grids keep the shared row in streetLamps.ts.
 */
export const ROAD_LAMPS = new Set([
  'lax-spaceport',
  'harbor',
  'south-bay-refineries',
  'civic-center',
  'historic-core',
  'south-la-megablocks',
  'hollywood',
  'coastal-strip',
]);

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function preferWalk(street: number, kind: RoadKind): number {
  if (kind === 'canyon') return 3.4;
  if (street >= 48) return 4.5;
  if (street >= 34) return 4.2;
  if (street >= 28) return 3.8;
  if (street >= 22) return 3.4;
  if (street >= 18) return 2.4;
  return 1.6;
}

/** Sidewalk that fits the driving line and a 1.82 m car, clamped to a real walk. */
export function sidewalkFor(street: number, driving: number, kind: RoadKind): number {
  const half = street * 0.5;
  const maxWalk = half - driving - CAR_HALF - 0.25 - CURB_W;
  const want = preferWalk(street, kind);
  if (maxWalk >= 1.5) return clamp(Math.min(want, maxWalk), 1.5, 4.5);
  const tight = half - driving - CAR_HALF - 0.12 - CURB_W;
  return clamp(tight, 1.5, 4.5);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lane centres inside the carriageway. One of them contains `driving` when it fits. */
export function laneCenters(carriageHalf: number, driving: number, laneW: number): number[] {
  const halfLane = laneW * 0.5;
  const outer = carriageHalf - halfLane;
  if (outer < 0.35) {
    const c = Math.max(0.35, carriageHalf * 0.42);
    return [round2(c), round2(-c)];
  }
  const pivot = clamp(Math.abs(driving), halfLane, outer);
  const mags: number[] = [];
  for (let c = pivot; c >= halfLane - 0.08; c -= laneW) mags.push(Math.max(halfLane, c));
  for (let c = pivot + laneW; c <= outer + 0.08; c += laneW) mags.push(c);
  const set = new Set<number>();
  for (const c of mags) {
    if (c + halfLane > carriageHalf + 0.08) continue;
    set.add(round2(c));
    set.add(round2(-c));
  }
  if (!set.size) {
    set.add(round2(pivot));
    set.add(round2(-pivot));
  }
  return [...set].sort((a, b) => a - b);
}

export function streetProfile(street: number, driving: number, kind: 'street' | 'canyon'): RoadProfile {
  const sidewalk = sidewalkFor(street, driving, kind);
  const carriageHalf = Math.max(1.2, street * 0.5 - sidewalk - CURB_W);
  const laneW = LANE_W;
  return {
    street,
    sidewalk,
    curbW: CURB_W,
    curbH: CURB_H,
    laneW,
    driving,
    carriageHalf,
    lanes: laneCenters(carriageHalf, driving, laneW),
    alley: street < 14,
    kind,
  };
}

/** Freeway paint uses the route spacing, which is already a lane width. */
export function freewayProfile(inset: number, spacing: number, lanesEachWay: number): RoadProfile {
  const laneW = spacing;
  const shoulder = 2.1;
  const outer = inset + Math.max(0, lanesEachWay - 1) * spacing;
  const carriageHalf = outer + laneW * 0.5 + shoulder;
  const lanes: number[] = [];
  for (let i = 0; i < lanesEachWay; i++) {
    const c = inset + i * spacing;
    lanes.push(round2(c), round2(-c));
  }
  lanes.sort((a, b) => a - b);
  return {
    street: carriageHalf * 2,
    sidewalk: 0,
    curbW: 0,
    curbH: 0.81,
    laneW,
    driving: inset,
    carriageHalf,
    lanes,
    alley: false,
    kind: 'freeway',
  };
}

/** Metres of asphalt outside the car body. Negative means the tyre crosses the curb. */
export function carClearance(p: RoadProfile): number {
  return p.carriageHalf - (Math.abs(p.driving) + CAR_HALF);
}

/** True when `driving` sits inside some painted lane of this direction. */
export function drivingInLane(p: RoadProfile): boolean {
  const d = Math.abs(p.driving);
  return p.lanes.some((c) => c > 0 && Math.abs(c - d) <= p.laneW * 0.5 + 0.05);
}
