// Centreline of one carriageway that the street graph does not pave.
// The chunk that owns the clipped centre draws it. A neighbour does not draw it again.
import type { CityLayout } from '../world/layout';
import { enumerateBlocks } from '../world/fabric/generator';
import { streetProfile } from './profile';

export interface SpanSpec {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  street: number;
  driving: number;
  lamps: boolean;
  salt: number;
  /** Added to terrain height. Wallace's deck sits above the ground mesh. */
  lift: number;
}

export interface CarriagePose {
  x: number;
  z: number;
  fx: number;
  fz: number;
  y: number;
}

function drivingFor(street: number): number {
  if (street >= 18) return 3.4;
  if (street >= 14) return 2.6;
  return Math.max(0.9, street * 0.18);
}

export interface GridBlock {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  la: number;
  lb: number;
  street: number;
  seed: number;
}

/**
 * +A runs through the crossings. +B stops at the building so the corner belongs to +A.
 * `lamps` is false where the shared sodium row already stands on this street.
 */
export function ownedStreets(b: GridBlock, lamps: boolean): SpanSpec[] {
  const bx = -b.az;
  const bz = b.ax;
  const out: SpanSpec[] = [];
  const push = (ax: number, az: number, bx2: number, bz2: number, salt: number) => {
    if (Math.hypot(bx2 - ax, bz2 - az) < 6) return;
    out.push({
      ax, az, bx: bx2, bz: bz2,
      street: b.street,
      driving: drivingFor(b.street),
      lamps,
      salt: b.seed + salt,
      lift: 0,
    });
  };
  const s = b.la / 2 + b.street / 2;
  const t0 = -(b.lb / 2 + b.street);
  const t1 = b.lb / 2 + b.street;
  push(
    b.cx + b.ax * s + bx * t0, b.cz + b.az * s + bz * t0,
    b.cx + b.ax * s + bx * t1, b.cz + b.az * s + bz * t1,
    11,
  );
  const t = b.lb / 2 + b.street / 2;
  const s0 = -(b.la / 2 - 0.2);
  const s1 = b.la / 2 - 0.2;
  push(
    b.cx + b.ax * s0 + bx * t, b.cz + b.az * s0 + bz * t,
    b.cx + b.ax * s1 + bx * t, b.cz + b.az * s1 + bz * t,
    29,
  );
  return out;
}

function project(span: SpanSpec, x: number, z: number): CarriagePose & { dist: number } {
  const dx = span.bx - span.ax;
  const dz = span.bz - span.az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((x - span.ax) * dx + (z - span.az) * dz) / l2;
  t = Math.max(0.04, Math.min(0.96, t));
  const px = span.ax + dx * t;
  const pz = span.az + dz * t;
  const len = Math.sqrt(l2);
  const fx = dx / len;
  const fz = dz / len;
  const rx = fz;
  const rz = -fx;
  const lat = (x - px) * rx + (z - pz) * rz;
  const profile = streetProfile(span.street, span.driving, 'street');
  const lane = profile.lanes.reduce((best, c) => (
    Math.abs(c - lat) < Math.abs(best - lat) ? c : best
  ), profile.lanes[0] ?? 0);
  const side = Math.max(-profile.carriageHalf + 0.45, Math.min(profile.carriageHalf - 0.45, lane));
  const qx = px + rx * side;
  const qz = pz + rz * side;
  return { x: qx, z: qz, fx, fz, y: 0, dist: Math.hypot(qx - x, qz - z) };
}

/** Nearest paved lane of `district` around a point. Null when the grid has no block there. */
export function carriageNear(
  layout: CityLayout, x: number, z: number, district: string, radius = 48,
): CarriagePose | null {
  const spans: SpanSpec[] = [];
  for (const b of enumerateBlocks(layout, x - radius, z - radius, radius * 2)) {
    if (b.district.id !== district) continue;
    spans.push(...ownedStreets(b, false));
  }
  let best: (CarriagePose & { dist: number }) | null = null;
  for (const span of spans) {
    const hit = project(span, x, z);
    if (!best || hit.dist < best.dist) best = hit;
  }
  if (!best || best.dist > radius) return null;
  return { x: best.x, z: best.z, fx: best.fx, fz: best.fz, y: layout.heightAt(best.x, best.z) };
}
