// CPU mirror of the facade lottery. Counts window cells on fabric boxes, not pixels.
// Landmarks (the K slab, the megatowers, the Bradbury) are not in this census; they use the same shader.
// The before/after delta uses one enumerator, so it stays valid even where a float32 facade
// coordinate would disagree with the GPU by a cell on a seam.
import type { CityLayout, District } from '../layout';
import { generateFabric } from '../fabric/generator';
import type { Box } from '../fabric/types';
import { CELL_H, CELL_W, SCHED_BAND, WIN_H, WIN_W } from './facade';
import { facadeHashes, scheduledLit } from './hash';

export interface LitDistrict {
  id: string;
  windows: number;
  litBefore: number;
  litAfter: number;
  fractionBefore: number;
  fractionAfter: number;
  samples: number;
}

const SPAN = 150;

function countBox(b: Box, windowLit: number, timeSec: number, acc: { total: number; before: number; after: number }): void {
  if (b.style === 13) return;
  const cw = CELL_W[b.style] ?? 0;
  const ch = CELL_H[b.style] ?? 0;
  const ww = WIN_W[b.style] ?? 0;
  const wh = WIN_H[b.style] ?? 0;
  if (cw <= 0 || ch <= 0 || ww <= 0 || wh <= 0) return;
  const seed = Math.fround(b.seed);
  const u0 = 100 + seed * 1000;
  const litFrac = b.lit * windowLit * 0.45;
  const spans = [b.w, b.d, b.w, b.d];
  let u = u0;
  for (const span of spans) {
    const x0 = u;
    const x1 = u + span;
    const c0 = Math.floor(x0 / cw);
    const c1 = Math.floor((x1 - 1e-4) / cw);
    const y1 = Math.floor((Math.max(b.h, 0) - 1e-4) / ch);
    for (let cx = c0; cx <= c1; cx++) {
      const fx = (cx + 0.5) * cw;
      if (fx < x0 || fx >= x1) continue;
      for (let cy = 0; cy <= y1; cy++) {
        const fy = (cy + 0.55) * ch;
        if (fy < 0 || fy >= b.h) continue;
        acc.total++;
        const { h1, seedQ } = facadeHashes(cx, cy, seed);
        if (h1 <= litFrac) acc.before++;
        if (scheduledLit(h1, litFrac, cx, cy, seedQ, timeSec, SCHED_BAND)) acc.after++;
      }
    }
    u += span;
  }
}

function sampleOrigins(layout: CityLayout, d: District): Array<[number, number]> {
  const [x0, z0, x1, z1] = d.bbox;
  const out: Array<[number, number]> = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const cx = x0 + ((i + 0.5) / 3) * (x1 - x0);
      const cz = z0 + ((j + 0.5) / 3) * (z1 - z0);
      if (layout.districtAt(cx, cz).id !== d.id) continue;
      out.push([cx, cz]);
    }
  }
  if (out.length === 0) out.push([(x0 + x1) / 2, (z0 + z1) / 2]);
  return out;
}

export function measureLit(layout: CityLayout, districtId: string, windowLit: number, timeSec: number): LitDistrict | null {
  const d = layout.districts.find((x) => x.id === districtId);
  if (!d) return null;
  const acc = { total: 0, before: 0, after: 0 };
  const seen = new Set<string>();
  const origins = sampleOrigins(layout, d);
  for (const [cx, cz] of origins) {
    const fab = generateFabric(layout, cx - SPAN / 2, cz - SPAN / 2, SPAN);
    for (const b of fab.boxes) {
      if (layout.districtAt(b.x, b.z).id !== districtId) continue;
      const key = `${Math.round(b.x)}|${Math.round(b.z)}|${Math.round(b.y0)}|${b.w.toFixed(2)}|${b.h.toFixed(2)}|${b.seed.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      countBox(b, windowLit, timeSec, acc);
    }
  }
  return {
    id: districtId,
    windows: acc.total,
    litBefore: acc.before,
    litAfter: acc.after,
    fractionBefore: acc.total ? acc.before / acc.total : 0,
    fractionAfter: acc.total ? acc.after / acc.total : 0,
    samples: origins.length,
  };
}

const cache = new Map<string, LitDistrict[]>();

export function measureLitByDistrict(layout: CityLayout, windowLit: number, timeSec: number): LitDistrict[] {
  const key = `${windowLit.toFixed(4)}|${timeSec.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = layout.districts.map((d) => measureLit(layout, d.id, windowLit, timeSec)).filter((r): r is LitDistrict => !!r);
  cache.set(key, rows);
  return rows;
}
