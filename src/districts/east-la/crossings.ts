// Where the on-grade 5 and the 710 cross the sunk 10, inside this polygon.
// Positions come from the existing polylines. Nothing here moves a freeway.
import type { CityLayout } from '../../world/layout';
import { DISTRICT } from './spec';

export interface Crossing {
  id: 'el-5-10' | 'el-10-710';
  /** The on-grade freeway. The 10 is the trench it crosses. */
  crossId: 'I-5' | 'I-710';
  x: number;
  z: number;
  /** Unit tangent of the on-grade freeway, in the polyline's direction. */
  tx: number;
  tz: number;
  /** Unit right of that tangent. */
  rx: number;
  rz: number;
  /** Unit tangent of the 10. */
  ux: number;
  uz: number;
  /** Unit right of the 10. */
  vx: number;
  vz: number;
}

interface Seg { ax: number; az: number; bx: number; bz: number }

function segs(pts: ReadonlyArray<readonly number[]>): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    out.push({ ax: a[0]!, az: a[1]!, bx: b[0]!, bz: b[1]! });
  }
  return out;
}

function hit(a: Seg, b: Seg): { x: number; z: number; t: number; u: number } | null {
  const rx = a.bx - a.ax;
  const rz = a.bz - a.az;
  const sx = b.bx - b.ax;
  const sz = b.bz - b.az;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-4) return null;
  const qx = b.ax - a.ax;
  const qz = b.az - a.az;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < -0.02 || t > 1.02 || u < -0.02 || u > 1.02) return null;
  return { x: a.ax + rx * t, z: a.az + rz * t, t, u };
}

function unit(dx: number, dz: number): { x: number; z: number } {
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

function find(
  layout: CityLayout,
  id: Crossing['id'],
  crossId: Crossing['crossId'],
): Crossing | null {
  const ten = layout.freeways.find((f) => f.id === 'I-10');
  const cross = layout.freeways.find((f) => f.id === crossId);
  if (!ten || !cross) return null;
  for (const a of segs(ten.pts)) {
    for (const b of segs(cross.pts)) {
      const p = hit(a, b);
      if (!p) continue;
      if (layout.districtAt(p.x, p.z).id !== DISTRICT) continue;
      const u = unit(a.bx - a.ax, a.bz - a.az);
      const t = unit(b.bx - b.ax, b.bz - b.az);
      return {
        id, crossId, x: p.x, z: p.z,
        tx: t.x, tz: t.z, rx: t.z, rz: -t.x,
        ux: u.x, uz: u.z, vx: u.z, vz: -u.x,
      };
    }
  }
  return null;
}

let cache: { layout: CityLayout; list: Crossing[] } | null = null;

/** The 5/10 and the 10/710, in that order, when each crossing falls inside East LA. */
export function eastLaCrossings(layout: CityLayout): Crossing[] {
  if (cache?.layout === layout) return cache.list;
  const list: Crossing[] = [];
  const a = find(layout, 'el-5-10', 'I-5');
  const b = find(layout, 'el-10-710', 'I-710');
  if (a) list.push(a);
  if (b) list.push(b);
  cache = { layout, list };
  return list;
}

/**
 * Freeway bed on the existing machinery bus. Loudest on the deck, a short tail
 * outside the polygon, nothing that reaches downtown.
 */
export function eastLaMachinery(x: number, y: number, z: number, layout: CityLayout): number {
  const alt = Math.max(0, y - layout.heightAt(x, z));
  const fade = Math.max(0, 1 - alt / 80);
  if (fade <= 0) return 0;
  let best = 0;
  for (const c of eastLaCrossings(layout)) {
    const d = Math.hypot(x - c.x, z - c.z);
    const n = Math.exp(-d / 320) * fade;
    if (n > best) best = n;
  }
  if (layout.districtAt(x, z).id !== DISTRICT && best < 0.05) return 0;
  return best * 0.36;
}
