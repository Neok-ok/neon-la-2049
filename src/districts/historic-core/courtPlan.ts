// Bradbury court in the building's local frame (origin at the pin, +Z toward Broadway).
// Masonry galleries and one switchback stair. Not the real iron atrium. Stage 8 does not extend this file.
import type { InteriorBox, InteriorCollider, InteriorDetail, InteriorLight, InteriorPortal, RGB } from '../../world/interiors/types';

const H = 22.4;
const STONE: RGB = [0.62, 0.52, 0.42];
const PLASTER: RGB = [0.70, 0.60, 0.48];
const DARK: RGB = [0.22, 0.17, 0.14];
const IRON: RGB = [0.28, 0.24, 0.22];
const WARM: RGB = [1.0, 0.62, 0.28];
const LANTERN: RGB = [1.45, 0.62, 0.22];

const LEVELS = [4.4, 8.8, 13.2, 17.6];
const SLAB = 0.22;
const TOPS = LEVELS.map((y) => y + SLAB);

const GX0 = 5.25;
const GX1 = 6.87;
const STAIR_N = 12;
const XA = 3.35;
const XB = 4.55;
const Z_BACK = 9.85;
const Z_FRONT = 13.85;

export interface CourtPlan {
  boxes: InteriorBox[];
  lights: InteriorLight[];
  ambient: RGB;
  portals: InteriorPortal[];
  openSky: { x: number; z: number; hw: number; hd: number; y0: number; y1: number };
  colliders: InteriorCollider[];
}

function add(
  boxes: InteriorBox[], cols: InteriorCollider[],
  x: number, y: number, z: number, w: number, h: number, d: number, color: RGB,
  opt?: { collide?: boolean; detail?: number; emissive?: RGB; flick?: number; yaw?: number },
): void {
  boxes.push({
    x, y, z, w, h, d, color,
    detail: opt?.detail, emissive: opt?.emissive, flick: opt?.flick, yaw: opt?.yaw,
  });
  if (opt?.collide === false) return;
  cols.push({ x, z, hw: w / 2, hd: d / 2, y0: y, top: y + h, yaw: opt?.yaw ?? 0 });
}

function steps(
  boxes: InteriorBox[], cols: InteriorCollider[],
  zLo: number, zHi: number, yLo: number, yHi: number,
): void {
  const rise = (yHi - yLo) / STAIR_N;
  const run = (zHi - zLo) / STAIR_N;
  const w = XB - XA;
  const cx = (XA + XB) / 2;
  for (let i = 0; i < STAIR_N; i++) {
    const z0 = zLo + run * i;
    const z1 = zLo + run * (i + 1);
    const top = yLo + rise * (i + 1);
    const sink = i === 0 ? 0.012 : 0;
    const zc = (z0 + z1) / 2;
    const zd = Math.abs(z1 - z0);
    add(boxes, cols, cx, top - rise - sink, zc, w, rise + sink, zd, STONE);
    if (i > 0 && i < STAIR_N - 1) {
      add(boxes, cols, XA - 0.07, top, zc, 0.06, 0.86, 0.06, IRON);
    }
  }
}

function railSegments(z0: number, z1: number, gaps: Array<[number, number]>): Array<[number, number]> {
  const ordered = gaps
    .map(([a, b]) => [Math.max(a, z0), Math.min(b, z1)] as [number, number])
    .filter(([a, b]) => b - a > 0.05)
    .sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let cursor = z0;
  for (const [a, b] of ordered) {
    if (a > cursor + 0.25) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (z1 > cursor + 0.25) out.push([cursor, z1]);
  return out;
}

function structure(): { boxes: InteriorBox[]; colliders: InteriorCollider[] } {
  const boxes: InteriorBox[] = [];
  const cols: InteriorCollider[] = [];

  add(boxes, cols, 0, 0, 9.025, 10.5, 0.14, 13.95, DARK);
  add(boxes, cols, 0, 0, 19.9, 4.5, 0.14, 7.7, DARK);

  const gx = (GX0 + GX1) / 2;
  const gw = GX1 - GX0;
  for (const y of LEVELS) {
    add(boxes, cols, gx, y, 9.025, gw, SLAB, 13.95, STONE);
    add(boxes, cols, -gx, y, 9.025, gw, SLAB, 13.95, STONE);
    add(boxes, cols, 0, y, 2.85, GX0 * 2, SLAB, 1.6, STONE);
  }

  const flights: Array<[number, number, number, number]> = [
    [Z_FRONT, Z_BACK, 0.14, TOPS[0]!],
    [Z_BACK, Z_FRONT, TOPS[0]!, TOPS[1]!],
    [Z_FRONT, Z_BACK, TOPS[1]!, TOPS[2]!],
    [Z_BACK, Z_FRONT, TOPS[2]!, TOPS[3]!],
  ];
  for (const [zLo, zHi, yLo, yHi] of flights) steps(boxes, cols, zLo, zHi, yLo, yHi);

  const landings: Array<[number, number, number]> = [
    [Z_BACK, 11.25, TOPS[0]!],
    [12.45, Z_FRONT, TOPS[1]!],
    [Z_BACK, 11.25, TOPS[2]!],
    [12.45, Z_FRONT, TOPS[3]!],
  ];
  for (const [z0, z1, top] of landings) {
    add(boxes, cols, (XB + GX0) / 2, top - SLAB, (z0 + z1) / 2, GX0 - XB, SLAB, z1 - z0, STONE);
  }

  const gapBack: [number, number] = [Z_BACK - 0.05, 11.4];
  const gapFront: [number, number] = [12.3, Z_FRONT + 0.08];
  for (let i = 0; i < TOPS.length; i++) {
    const top = TOPS[i]!;
    const open = i % 2 === 0 ? [gapBack] : [gapFront];
    for (const [z0, z1] of railSegments(3.7, 15.95, open)) {
      add(boxes, cols, GX0 - 0.06, top, (z0 + z1) / 2, 0.08, 0.96, z1 - z0, IRON);
    }
    for (const [z0, z1] of railSegments(3.7, 15.95, [])) {
      add(boxes, cols, -(GX0 - 0.06), top, (z0 + z1) / 2, 0.08, 0.96, z1 - z0, IRON);
    }
    add(boxes, cols, 0, top, 3.62, GX0 * 2 - 0.4, 0.96, 0.08, IRON);
  }

  const colsAt: Array<[number, number]> = [
    [-6.3, 14.8], [6.3, 14.8], [-6.3, 9], [6.3, 9], [-6.3, 3], [6.3, 3], [-3.1, 2.8], [3.1, 2.8],
  ];
  for (const [x, z] of colsAt) add(boxes, cols, x, 0.14, z, 0.5, H - 0.7, 0.5, STONE, { collide: false });

  for (let i = 0; i < 4; i++) {
    const z = 13.8 - i * 3.2;
    add(boxes, cols, 0, H - 0.4, z, 12.6, 0.28, 0.34, IRON, { collide: false });
  }
  for (const x of [-3.6, 0, 3.6]) add(boxes, cols, x, H - 0.22, 9, 0.28, 0.24, 12.2, IRON, { collide: false });

  add(boxes, cols, 6.94, 0.16, 9.05, 0.05, 21.3, 13.6, PLASTER, { collide: false });
  add(boxes, cols, -6.94, 0.16, 9.05, 0.05, 21.3, 13.6, PLASTER, { collide: false });
  add(boxes, cols, -3.8, 0.16, 2.2, 6.1, 21.3, 0.06, PLASTER, { collide: false });
  add(boxes, cols, 3.8, 0.16, 2.2, 6.1, 21.3, 0.06, PLASTER, { collide: false });
  add(boxes, cols, 0, 2.42, 2.2, 1.5, 19.05, 0.06, PLASTER, { collide: false });
  add(boxes, cols, 2.36, 0.16, 19.95, 0.05, 6.85, 7.5, PLASTER, { collide: false });
  add(boxes, cols, -2.36, 0.16, 19.95, 0.05, 6.85, 7.5, PLASTER, { collide: false });
  add(boxes, cols, 0, 7.02, 19.95, 4.55, 0.1, 7.5, PLASTER, { collide: false });

  add(boxes, cols, 0.15, 0.14, 2.42, 1.2, 2.15, 0.05, [0.34, 0.24, 0.16], { collide: false, yaw: -0.42 });
  add(boxes, cols, 0, 10.35, 9, 1.55, 0.48, 1.55, [0.42, 0.26, 0.14], { collide: false, emissive: LANTERN, flick: 0.4 });

  return { boxes, colliders: cols };
}

function dress(detail: InteriorDetail): InteriorBox[] {
  const boxes: InteriorBox[] = [];
  if (detail >= 1) {
    const step = detail === 1 ? 1.5 : detail === 2 ? 0.95 : 0.58;
    for (const top of TOPS) {
      for (const side of [1, -1]) {
        for (let z = 4.1; z <= 15.5; z += step) {
          const inBack = z >= Z_BACK - 0.05 && z <= 11.4;
          const inFront = z >= 12.3 && z <= Z_FRONT + 0.08;
          if (side > 0 && ((top === TOPS[0] || top === TOPS[2]) && inBack)) continue;
          if (side > 0 && ((top === TOPS[1] || top === TOPS[3]) && inFront)) continue;
          boxes.push({ x: side * (GX0 - 0.06), y: top, z, w: 0.05, h: 0.9, d: 0.05, color: IRON, detail });
        }
      }
    }
    boxes.push({ x: 0, y: 10.9, z: 9, w: 0.08, h: 10.6, d: 0.08, color: IRON, detail: 1 });
    for (const [x, y, z] of [[5.55, 6.3, 7.2], [-5.55, 6.3, 7.2], [5.55, 10.7, 12.4], [-5.55, 10.7, 12.4]] as const) {
      boxes.push({ x, y, z, w: 0.16, h: 0.28, d: 0.1, color: WARM, emissive: WARM, flick: x + z, detail: 1 });
    }
  }
  if (detail >= 2) {
    boxes.push({ x: -5.2, y: 2.2, z: 12, w: 0.12, h: 0.9, d: 0.16, color: WARM, emissive: [1.1, 0.55, 0.2], flick: 1.2, detail: 2 });
    boxes.push({ x: 5.2, y: 2.2, z: 6.5, w: 0.12, h: 0.9, d: 0.16, color: WARM, emissive: [1.1, 0.55, 0.2], flick: 2.4, detail: 2 });
  }
  if (detail >= 3) {
    boxes.push({ x: 0, y: 0.145, z: 9.2, w: 0.07, h: 0.015, d: 8.5, color: [0.45, 0.26, 0.12], emissive: [0.4, 0.16, 0.05], detail: 3 });
  }
  return boxes;
}

const BUILT = structure();

export function courtColliders(): InteriorCollider[] {
  return BUILT.colliders;
}

export function buildCourt(detail: InteriorDetail): Omit<CourtPlan, 'colliders'> {
  const lights: InteriorLight[] = [
    { x: 0, y: 11.2, z: 9, color: [1, 0.58, 0.24], intensity: 6.2, range: 28 },
    { x: 4.0, y: 6.5, z: 11.6, color: [1, 0.64, 0.32], intensity: 2.4, range: 12 },
    { x: 0, y: 4.2, z: 20.2, color: [1, 0.72, 0.42], intensity: 1.8, range: 14 },
    { x: -5.4, y: 7.4, z: 8, color: [1, 0.55, 0.22], intensity: 1.3, range: 10 },
    { x: 5.4, y: 11.6, z: 11, color: [1, 0.55, 0.22], intensity: 1.3, range: 10 },
  ];
  return {
    boxes: [...BUILT.boxes, ...dress(detail)],
    lights,
    ambient: [0.24, 0.16, 0.11],
    portals: [{ x: 0, y: 3.45, z: 23.85, w: 4.5, h: 6.5, yaw: 0 }],
    openSky: { x: 0, z: 9, hw: 5.4, hd: 6.2, y0: 3, y1: 20 },
  };
}
