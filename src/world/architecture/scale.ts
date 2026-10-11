/**
 * Real-world metres for doors, stairs, rails and storeys.
 *
 * Three.js does not enforce a unit. Physically based lights, fog and glTF
 * assume 1 unit = 1 metre, and this city already builds in metres. These
 * helpers snap openings and flights onto that grid so a 1.80 m person reads
 * next to them. Graphics tiers may drop nosings and balusters. They do not
 * rescale the metres.
 *
 * A flight takes its rise from the floor-to-floor height, splits that into
 * equal risers, then sets the going from Blondel's 2×rise + tread ≈ 0.63 m.
 * The run grows by adding steps. A step is never stretched to fill a span.
 */

export const PERSON_M = 1.8;

/** Shared module for heads, risers and storey datums. */
export const MODULE_M = 0.05;

export function snapMetres(metres: number, module = MODULE_M): number {
  const m = module > 0 ? module : MODULE_M;
  return Math.round(metres / m) * m;
}

/** Leaf a person walks through. Headroom stays inside 2.0–2.4 m. */
export const DOOR_H = 2.2;
export const DOOR_W = 1.0;
/** Pair of leaves. */
export const DOUBLE_DOOR_W = 1.8;
/**
 * Grand entry. Wider than a leaf, still a door, not a lobby mouth.
 * Heritage portals clamp to this.
 */
export const GRAND_DOOR_H = 3.6;
export const GRAND_DOOR_W = 3.2;

/** Handrail height above the walking surface. */
export const RAIL_H = 1.05;

export const RISE_MIN = 0.15;
export const RISE_MAX = 0.18;
export const RISE_TARGET = 0.17;
export const TREAD_MIN = 0.28;
export const TREAD_MAX = 0.32;
/** 2R + G. A comfort rule of thumb, not a cited building code. */
export const BLONDEL_M = 0.63;

/** Housing, shops, and office floors that should count as a 3–4 m storey. */
export const STOREY_M = 3.6;

export interface Flight {
  risers: number;
  rise: number;
  tread: number;
  /**
   * Horizontal run when each riser carries its own tread.
   * The box stairs in this city are built that way.
   */
  run: number;
}

/**
 * Equal risers for a floor-to-floor height.
 * `run` is the tread times the riser count. Callers keep the landing
 * and let the flight occupy `run`; they do not stretch one step.
 */
export function planFlight(totalRise: number): Flight {
  const span = Math.max(0.05, totalRise);
  let risers = Math.max(1, Math.round(span / RISE_TARGET));
  let rise = span / risers;
  if (rise > RISE_MAX) risers = Math.max(1, Math.ceil(span / RISE_MAX - 1e-9));
  if (rise < RISE_MIN && span >= RISE_MIN) risers = Math.max(1, Math.floor(span / RISE_MIN));
  rise = span / risers;
  let tread = BLONDEL_M - 2 * rise;
  if (tread < TREAD_MIN) tread = TREAD_MIN;
  if (tread > TREAD_MAX) tread = TREAD_MAX;
  tread = snapMetres(tread, 0.01);
  return { risers, rise, tread, run: risers * tread };
}

/** Nearest whole storeys, so a retargeted floor module keeps the old roof band. */
export function storeyHeight(targetM: number, module = STOREY_M): number {
  const n = Math.max(1, Math.round(targetM / module));
  return snapMetres(n * module, 0.01);
}

export function storeyCount(targetM: number, module = STOREY_M): number {
  return Math.max(1, Math.round(targetM / module));
}

/** Ornament only. The walking dimensions stay on every tier. */
export type ArchDetail = 'low' | 'medium' | 'full';

export function archDetail(detailScale: number): ArchDetail {
  if (detailScale >= 0.8) return 'full';
  if (detailScale >= 0.5) return 'medium';
  return 'low';
}

/** Landmark LOD: 2 is the near mesh, 0 the far silhouette. */
export function archDetailFromLod(maxDetail: number): ArchDetail {
  if (maxDetail >= 2) return 'full';
  if (maxDetail >= 1) return 'medium';
  return 'low';
}
