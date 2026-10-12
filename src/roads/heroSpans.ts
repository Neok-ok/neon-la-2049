// Carriageways the street graph never receives: K's south face, the sea-wall blocks,
// the Little Tokyo lane, and the Wallace causeway. Each is a centreline. The road
// builder clips it to the chunk.
import type { CityLayout } from '../world/layout';
import { bearingToYaw } from '../world/geo';
import { enumerateBlocks } from '../world/fabric/generator';
import { inApron } from '../districts/coastal-strip/apronPlan';
import { pastSeaWall } from '../districts/coastal-strip/profile';
import { HD, HW, localToWorld as kLocal } from '../districts/k-megablock/spec';
import { COURT, localToWorld as wallaceLocal } from '../districts/wallace-vernon/spec';
import { ownedStreets, type SpanSpec } from './streetSpan';

const PAD = 220;

function segmentHits(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, size: number): boolean {
  const x1 = x0 + size;
  const z1 = z0 + size;
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (x >= x0 - 2 && x < x1 + 2 && z >= z0 - 2 && z < z1 + 2) return true;
  }
  return false;
}

function kSpan(layout: CityLayout): SpanSpec | null {
  const l = layout.landmarkById('k-megablock-tower');
  if (!l) return null;
  const yaw = bearingToYaw(l.bearingDeg);
  const z = HD + 15;
  const [ax, az] = kLocal(l.x, l.z, yaw, -HW - 24, z);
  const [bx, bz] = kLocal(l.x, l.z, yaw, HW + 36, z);
  return {
    ax, az, bx, bz,
    street: 18,
    driving: 3.4,
    lamps: true,
    salt: 81001,
    lift: 0,
  };
}

function wallaceSpan(layout: CityLayout): SpanSpec | null {
  const pyr = layout.landmarkById('wallace-pyramid');
  if (!pyr) return null;
  const yaw = bearingToYaw(pyr.bearingDeg);
  const x = 0;
  const z0 = COURT.roadNorth + 15;
  const z1 = COURT.roadSouth - 12;
  const [ax, az] = wallaceLocal(pyr.x, pyr.z, yaw, x, z0);
  const [bx, bz] = wallaceLocal(pyr.x, pyr.z, yaw, x, z1);
  return {
    ax, az, bx, bz,
    street: 22,
    driving: 3.4,
    lamps: true,
    salt: 81022,
    lift: 0.17,
  };
}

function gridSpans(layout: CityLayout, x0: number, z0: number, size: number): SpanSpec[] {
  const ids = new Set(layout.districtsOverlapping(x0 - PAD, z0 - PAD, x0 + size + PAD, z0 + size + PAD).map((d) => d.id));
  const wantCoast = ids.has('coastal-strip');
  const wantMarket = ids.has('little-tokyo-market');
  if (!wantCoast && !wantMarket) return [];
  const out: SpanSpec[] = [];
  for (const b of enumerateBlocks(layout, x0 - PAD, z0 - PAD, size + PAD * 2)) {
    const id = b.district.id;
    if (id === 'coastal-strip' && !wantCoast) continue;
    if (id === 'little-tokyo-market' && !wantMarket) continue;
    if (id !== 'coastal-strip' && id !== 'little-tokyo-market') continue;
    const lamps = id === 'little-tokyo-market';
    for (const span of ownedStreets(b, lamps)) {
      const mx = (span.ax + span.bx) * 0.5;
      const mz = (span.az + span.bz) * 0.5;
      if (layout.isOcean(mx, mz) || layout.isReserved(mx, mz, 2)) continue;
      if (id === 'coastal-strip' && (pastSeaWall(layout, mx, mz) || inApron(layout, mx, mz, 2))) continue;
      if (!segmentHits(span.ax, span.az, span.bx, span.bz, x0, z0, size)) continue;
      out.push(span);
    }
  }
  return out;
}

/** Spans that can meet this chunk. Clipping happens in the road builder. */
export function heroSpans(layout: CityLayout, x0: number, z0: number, size: number): SpanSpec[] {
  const out: SpanSpec[] = [];
  const k = kSpan(layout);
  if (k && segmentHits(k.ax, k.az, k.bx, k.bz, x0, z0, size)) out.push(k);
  const w = wallaceSpan(layout);
  if (w && segmentHits(w.ax, w.az, w.bx, w.bz, x0, z0, size)) out.push(w);
  out.push(...gridSpans(layout, x0, z0, size));
  return out;
}
