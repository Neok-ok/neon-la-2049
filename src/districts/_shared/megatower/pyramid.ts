// Pure module (worker-safe). Terraced pyramid generator (Wallace HQ and the 1982-style corporate pyramids).
// Tower frame like the megatower kit: origin at the base centre, faces 0 = +Z, 1 = +X, 2 = −Z, 3 = −X.
//
// Profile: `tiers` major tiers of `steps` battered steps each. Every step leans in (batter) and then sets
// back on a flat ledge, so the silhouette reads as a ziggurat at any distance; deep cornices mark the major
// tiers. The apex is a warm glass lantern under an overhanging cap (the lit interior at the top).
import { Style } from '../../../world/fabric/types';
import { kitBox, type FaceStyle, type KitDetail, type MassSink } from './sink';
import type { Face, KitCollider, KitLight, LightKind, TowerParts } from './tower';

export interface PyramidPlan {
  seed: number;
  height: number;
  base: number;
  top: number;
  tiers: number;
  steps: number;
  /** 'wallace': windowless monolith, slit channels, warm apex. 'old': 1982 light grid, elevator shafts, flame stacks. */
  look: 'wallace' | 'old';
  /** Face carrying the monumental entrance. */
  entrance: Face;
}

const FN: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

export function buildPyramid(p: PyramidPlan, sink: MassSink): TowerParts {
  const colliders: KitCollider[] = [];
  const lights: KitLight[] = [];
  const parts: TowerParts = { colliders, holos: [], lights, signs: [], flames: [], roof: p.height, top: p.height, halfW: p.base / 2, halfD: p.base / 2 };
  let k = 0;
  const face = (style: number, lit: number, tint: number): FaceStyle => ({ style, lit, tint, seed: (p.seed * 5.3 + (k++) * 0.0731) % 1 });
  const box = (lx: number, lz: number, y0: number, w: number, d: number, h: number, st: FaceStyle, detail: KitDetail, cap = true) => {
    if (h > 0.01 && w > 0.01 && d > 0.01) kitBox(sink, lx, lz, y0, w, d, h, st, detail, cap);
  };
  const light = (lx: number, y: number, lz: number, kind: LightKind) => lights.push({ lx, y, lz, kind });

  const wallace = p.look === 'wallace';
  const N = p.tiers * p.steps;
  const apexH = wallace ? Math.min(220, p.height * 0.06) : Math.min(120, p.height * 0.1);
  const bodyH = p.height - apexH;
  const stepH = bodyH / N;
  const widthAt = (i: number) => p.base + (p.top - p.base) * (i / N);
  const batterF = 0.42;
  const skin = wallace ? face(Style.Monolith, 0.5, 0.78) : face(Style.Office, 0.55, 0.72);
  const skinUpper = wallace ? face(Style.Monolith, 0.65, 0.74) : face(Style.Office, 0.62, 0.7);
  const cornice = wallace ? face(Style.Monolith, 0.2, 0.62) : face(Style.Megablock, 0.45, 0.68);
  const stripCold = face(Style.Glow, wallace ? 0.22 : 0.3, 1.85);
  const stripWarm = face(Style.Glow, wallace ? 0.42 : 0.45, 1.05);
  const ribSt = wallace ? face(Style.Monolith, 0.1, 0.55) : face(Style.Megablock, 0.35, 0.62);

  if (sink.maxDetail === 0) {
    // silhouette proxy: one battered frustum + ledge per major tier
    for (let t = 0; t < p.tiers; t++) {
      const i0 = t * p.steps, i1 = (t + 1) * p.steps;
      const wb = widthAt(i0), wn = widthAt(i1);
      const wt = wn + (widthAt(i1 - 1) - wn) * (1 - batterF);
      sink.frustum(0, 0, i0 * stepH, wb, wb, wt, wt, (i1 - i0) * stepH, t < p.tiers / 2 ? skin : skinUpper, 0, true);
    }
  } else {
    for (let i = 0; i < N; i++) {
      const wb = widthAt(i), wn = widthAt(i + 1);
      const wt = wb - (wb - wn) * batterF;
      const y0 = i * stepH;
      const tier = Math.floor(i / p.steps);
      const major = (i + 1) % p.steps === 0;
      sink.frustum(0, 0, y0, wb, wb, wt, wt, stepH, tier < p.tiers / 2 ? skin : skinUpper, 0, true);
      colliders.push({ lx: 0, lz: 0, hw: wt / 2, hd: wt / 2, y0, top: y0 + stepH });
      // ledge edge light line (dim) and, on the major tiers, a heavy cornice with a warm strip under its lip
      const y1 = y0 + stepH;
      if (major && i < N - 1) {
        const cw = wn + 30;
        box(0, 0, y1, cw, cw, 16, cornice, 0);
        for (const [nx, nz] of FN) {
          const ox = nx * (cw / 2 + 0.6), oz = nz * (cw / 2 + 0.6);
          box(ox, oz, y1 + 1, nx ? 1 : cw - 10, nz ? 1 : cw - 10, wallace ? 3.6 : 2.4, stripWarm, 1);
        }
      } else {
        // on the outer lip, so the line still shows when the step is seen from below
        for (const [nx, nz] of FN) {
          const e = wt / 2 - 0.8;
          box(nx * e, nz * e, y1, nx ? 1.2 : wt - 24, nz ? 1.2 : wt - 24, 1.8, stripCold, 1);
        }
      }
      // corner ribs following the batter
      const rib = 54 + (wb - wt) / 2;
      for (const [sx, sz] of CORNERS) {
        const c = (wb + wt) / 4;
        box(sx * c, sz * c, y0, rib, rib, stepH + (major ? 16 : 0), ribSt, 1);
      }
      // face channels: a central slot with flanking fins; warm interior light in the top tiers
      if (sink.maxDetail >= 2) {
        const hot = wallace && tier >= p.tiers - 2;
        const slot = hot ? face(Style.Glow, 0.42, 1.05) : wallace ? face(Style.Slit, 0.42, 0.9) : face(Style.Ribbon, 0.7, 0.8);
        const fin = wallace ? face(Style.Monolith, 0.05, 0.58) : face(Style.Solid, 0, 0.6);
        const mid = (wb + wt) / 4 + 2;
        const wide = wallace ? 46 : 60;
        for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
          const [nx, nz] = FN[f]!;
          const tx = nz !== 0 ? 1 : 0, tz = 1 - tx;
          const offs = !wallace ? [0, -wb * 0.27, wb * 0.27] : tier < 2 ? [0, -wb * 0.3, wb * 0.3] : [0];
          for (const a of offs) {
            if (f === p.entrance && i < 2 && Math.abs(a) < 1) continue;
            const x = nx * mid + tx * a, z = nz * mid + tz * a;
            box(x, z, y0 + 4, nx ? 6 : wide, nz ? 6 : wide, stepH - 8, slot, a === 0 ? 2 : 3);
            for (const s of [-1, 1]) {
              const fx = x + tx * s * (wide / 2 + 7), fz = z + tz * s * (wide / 2 + 7);
              box(fx, fz, y0, nx ? 14 : 12, nz ? 14 : 12, stepH, fin, 3);
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ apex
  const T = p.top;
  const yA = bodyH;
  if (wallace) {
    const lanternH = apexH * 0.36;
    const glow = face(Style.Glow, 0.95, 1.0);
    box(0, 0, yA, T * 0.8, T * 0.8, lanternH, glow, 0);
    if (sink.maxDetail >= 2) {
      const mull = face(Style.Monolith, 0, 0.5);
      for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
        const [nx, nz] = FN[f]!;
        const len = T * 0.8, n = Math.floor(len / 13);
        for (let j = 0; j <= n; j++) {
          const a = -len / 2 + (j * len) / n;
          const x = nx * (len / 2 + 0.8) + (nz ? a : 0), z = nz * (len / 2 + 0.8) + (nx ? a : 0);
          box(x, z, yA, nx ? 1.6 : 2.2, nz ? 1.6 : 2.2, lanternH, mull, j % 4 === 0 ? 2 : 3, false);
        }
      }
    }
    // overhanging cap, darker crown block, roof plant and the mast
    const capY = yA + lanternH;
    box(0, 0, capY, T * 1.02, T * 1.02, apexH * 0.2, face(Style.Monolith, 0.15, 0.6), 0);
    box(0, 0, capY - 2, T * 0.96, T * 0.96, 2, face(Style.Glow, 0.5, 1.15), 1);
    const crownY = capY + apexH * 0.2;
    box(0, 0, crownY, T * 0.62, T * 0.62, apexH * 0.3, face(Style.Monolith, 0.4, 0.66), 0);
    const roofY = crownY + apexH * 0.3;
    box(0, 0, roofY, T * 0.3, T * 0.3, apexH * 0.14, face(Style.Industrial, 0.05, 0.55), 1);
    colliders.push({ lx: 0, lz: 0, hw: T * 0.51, hd: T * 0.51, y0: yA, top: roofY + apexH * 0.14 });
    const mastY = roofY + apexH * 0.14;
    const mastH = 110;
    sink.frustum(0, 0, mastY, 12, 12, 3, 3, mastH, face(Style.Industrial, 0, 0.5), 0);
    colliders.push({ lx: 0, lz: 0, hw: 6, hd: 6, y0: mastY, top: mastY + mastH });
    light(0, mastY + mastH + 1, 0, 'strobe');
    light(0, mastY + mastH * 0.6, 0, 'red');
    parts.top = mastY + mastH;
    parts.roof = mastY;
    // warm points along the lantern so the apex reads through smog from across the basin
    for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
      const [nx, nz] = FN[f]!;
      for (const a of [-0.3, 0, 0.3]) {
        light(nx * (T * 0.4 + 2) + (nz ? a * T : 0), yA + lanternH * 0.5, nz * (T * 0.4 + 2) + (nx ? a * T : 0), 'warm');
      }
    }
    for (const [sx, sz] of CORNERS) light(sx * T * 0.51, capY + apexH * 0.2, sz * T * 0.51, 'red');
  } else {
    // flat 1982 top: lit penthouse block, two flame stacks, a short spire
    const office = face(Style.Office, 0.75, 0.75);
    box(0, 0, yA, T, T, apexH * 0.55, office, 0);
    box(0, 0, yA + apexH * 0.55, T * 0.6, T * 0.6, apexH * 0.45, face(Style.Glow, 0.6, 1.0), 0);
    colliders.push({ lx: 0, lz: 0, hw: T / 2, hd: T / 2, y0: yA, top: p.height });
    for (const s of [-1, 1]) {
      box(s * T * 0.36, 0, p.height, 6, 6, 40, face(Style.Industrial, 0, 0.5), 1);
      parts.flames.push({ lx: s * T * 0.36, y: p.height + 46, lz: 0, size: 16 });
    }
    sink.frustum(0, 0, p.height, 8, 8, 2, 2, 70, face(Style.Industrial, 0, 0.5), 1);
    light(0, p.height + 71, 0, 'red');
    parts.top = p.height + 70;
  }

  // obstruction lights at the corners of every major tier
  for (let t = 1; t <= p.tiers; t++) {
    const w = widthAt(t * p.steps) + 30;
    for (const [sx, sz] of CORNERS) light(sx * w / 2, t * p.steps * stepH + 17, sz * w / 2, t % 2 ? 'red' : 'steady');
  }

  // ------------------------------------------------------------------ monumental entrance
  const [enx, enz] = FN[p.entrance]!;
  const tx = enz !== 0 ? 1 : 0, tz = 1 - tx;
  const half = p.base / 2;
  const at = (a: number, out: number): [number, number] => [enx * (half + out) + tx * a, enz * (half + out) + tz * a];
  const portalW = wallace ? p.base * 0.09 : p.base * 0.12;
  const portalH = wallace ? stepH * 1.25 : stepH * 1.5;
  const lobby = face(Style.Glow, wallace ? 0.7 : 0.6, 1.0);
  {
    const [x, z] = at(0, 1.5);
    box(x, z, 0, tx ? portalW : 3, tz ? portalW : 3, portalH, lobby, 0);
  }
  const pylon = wallace ? face(Style.Monolith, 0.25, 0.7) : face(Style.Megablock, 0.5, 0.75);
  for (const s of [-1, 1]) {
    const [x, z] = at(s * (portalW / 2 + 30), 40);
    const pw = 60, pd = 80, ph = portalH * 1.55;
    box(x, z, 0, tx ? pw : pd, tz ? pw : pd, ph, pylon, 0);
    colliders.push({ lx: x, lz: z, hw: (tx ? pw : pd) / 2, hd: (tz ? pw : pd) / 2, y0: 0, top: ph });
    light(x + enx * (pd / 2 + 1), ph + 2, z + enz * (pd / 2 + 1), 'red');
    for (let j = 1; j <= 4; j++) light(x + enx * (pd / 2 + 1), (ph * j) / 5, z + enz * (pd / 2 + 1), 'warm');
  }
  {
    const [x, z] = at(0, 40);
    const lw = portalW + 120;
    box(x, z, portalH, tx ? lw : 80, tz ? lw : 80, 36, pylon, 0);
    colliders.push({ lx: x, lz: z, hw: (tx ? lw : 80) / 2, hd: (tz ? lw : 80) / 2, y0: portalH, top: portalH + 36 });
    box(x, z, portalH - 2.2, tx ? lw - 20 : 70, tz ? lw - 20 : 70, 2.2, face(Style.Glow, 0.4, 1.1), 1);
    // forecourt: a vast low plinth and a lit processional strip
    const [fx, fz] = at(0, 200);
    box(fx, fz, 0, tx ? portalW * 2.2 : 320, tz ? portalW * 2.2 : 320, 3, face(Style.Solid, 0, 0.55), 1);
    box(fx, fz, 3, tx ? 14 : 300, tz ? 14 : 300, 0.4, face(Style.Glow, 0.35, 1.8), 2);
    colliders.push({ lx: fx, lz: fz, hw: (tx ? portalW * 2.2 : 320) / 2, hd: (tz ? portalW * 2.2 : 320) / 2, y0: 0, top: 3 });
  }
  return parts;
}
