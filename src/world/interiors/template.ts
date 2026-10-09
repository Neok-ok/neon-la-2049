// Corridor + room. Door at the origin, the street on +Z, the corridor running toward −Z,
// the room beyond that. Stage 8 tints `warmth`, punches `sideDoors` / `backDoor`, and appends
// furniture. It should not rebuild the shell.
// warmth 0 is a pale tube, 1 is tungsten. No three.js imports: the result is plain data.
import type { InteriorBox, InteriorCollider, InteriorDetail, InteriorLight, InteriorPortal, RGB } from './types';

export interface CorridorRoomSize {
  length: number;
  width: number;
  height: number;
}

export interface WallGap {
  /** Corridor: metres from the front door toward −Z. Back wall: local X of the centre. Omitted on a back door means the middle. */
  at?: number;
  width?: number;
  height?: number;
}

export interface CorridorRoomOpts {
  warmth: number;
  corridor: CorridorRoomSize;
  room: CorridorRoomSize;
  detail: InteriorDetail;
  /** Openings in the corridor side walls. `side` −1 is local −X. */
  sideDoors?: Array<WallGap & { side: -1 | 1 }>;
  /** Opening in the room's far wall. Omitted leaves that wall solid. */
  backDoor?: WallGap;
  /**
   * The room's +X window and its portal card. Default on.
   * Pass false for a hall with no exterior on that wall (a lobby, a corridor).
   */
  window?: boolean;
  extras?: InteriorBox[];
}

export interface CorridorRoomPlan {
  boxes: InteriorBox[];
  lights: InteriorLight[];
  ambient: RGB;
  portals: InteriorPortal[];
  colliders: InteriorCollider[];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const u = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function box(
  boxes: InteriorBox[], x: number, y: number, z: number, w: number, h: number, d: number, color: RGB,
  extra?: Partial<InteriorBox>,
): void {
  boxes.push({ x, y, z, w, h, d, color, ...extra });
}

function wall(
  cols: InteriorCollider[], x: number, z: number, w: number, d: number, y0: number, top: number,
): void {
  cols.push({ x, z, hw: w / 2, hd: d / 2, y0, top, yaw: 0 });
}

function span(
  boxes: InteriorBox[], cols: InteriorCollider[],
  x: number, z: number, w: number, d: number, y0: number, h: number, color: RGB,
): void {
  if (w < 0.04 || d < 0.04 || h < 0.04) return;
  box(boxes, x, y0, z, w, h, d, color);
  wall(cols, x, z, w, d, y0, y0 + h);
}

/** Solid runs along Z, with lintels over each gap. `zHi` is the street end. */
function cutZ(
  boxes: InteriorBox[], cols: InteriorCollider[],
  x: number, th: number, zHi: number, zLo: number, height: number, color: RGB,
  gaps: Array<{ z: number; w: number; h: number }>,
): void {
  const list = gaps
    .map((g) => ({ z: g.z, w: g.w, h: Math.min(height - 0.04, g.h) }))
    .filter((g) => g.z + g.w / 2 < zHi - 0.08 && g.z - g.w / 2 > zLo + 0.08)
    .sort((a, b) => b.z - a.z);
  let z = zHi;
  for (const g of list) {
    const near = g.z + g.w / 2;
    const far = g.z - g.w / 2;
    if (z - near > 0.05) span(boxes, cols, x, (z + near) / 2, th, z - near, 0, height, color);
    if (height - g.h > 0.05) span(boxes, cols, x, g.z, th, g.w, g.h, height - g.h, color);
    z = far;
  }
  if (z - zLo > 0.05) span(boxes, cols, x, (z + zLo) / 2, th, z - zLo, 0, height, color);
}

/** Solid runs along X. `x0` < `x1`. */
function cutX(
  boxes: InteriorBox[], cols: InteriorCollider[],
  z: number, th: number, x0: number, x1: number, height: number, color: RGB,
  gaps: Array<{ x: number; w: number; h: number }>,
): void {
  const list = gaps
    .map((g) => ({ x: g.x, w: g.w, h: Math.min(height - 0.04, g.h) }))
    .filter((g) => g.x - g.w / 2 > x0 + 0.08 && g.x + g.w / 2 < x1 - 0.08)
    .sort((a, b) => a.x - b.x);
  let x = x0;
  for (const g of list) {
    const left = g.x - g.w / 2;
    const right = g.x + g.w / 2;
    if (left - x > 0.05) span(boxes, cols, (x + left) / 2, z, left - x, th, 0, height, color);
    if (height - g.h > 0.05) span(boxes, cols, g.x, z, g.w, th, g.h, height - g.h, color);
    x = right;
  }
  if (x1 - x > 0.05) span(boxes, cols, (x + x1) / 2, z, x1 - x, th, 0, height, color);
}

/** Local plan. `detail` drops trim; the colliders stay the same at every tier. */
export function buildCorridorRoom(o: CorridorRoomOpts): CorridorRoomPlan {
  const t = Math.max(0, Math.min(1, o.warmth));
  const wallC = mix([0.58, 0.60, 0.62], [0.70, 0.56, 0.40], t);
  const floorC = mix([0.30, 0.31, 0.32], [0.38, 0.28, 0.20], t);
  const ceilC = mix([0.50, 0.52, 0.54], [0.62, 0.52, 0.40], t);
  const trimC = mix([0.42, 0.43, 0.44], [0.48, 0.36, 0.26], t);
  const tube = mix([0.82, 0.92, 1.05], [1.15, 0.78, 0.40], t);
  const tubeEm = mix([0.95, 1.15, 1.35], [1.45, 0.72, 0.28], t);
  const ambient = mix([0.26, 0.28, 0.30], [0.32, 0.18, 0.10], t);
  const wood: RGB = [0.36, 0.26, 0.18];

  const C = o.corridor, R = o.room;
  const th = 0.14;
  const doorW = Math.min(1.4, C.width - 0.3);
  const doorH = Math.min(2.2, C.height - 0.2);
  const boxes: InteriorBox[] = [];
  const cols: InteriorCollider[] = [];

  const cZ = -C.length / 2;
  box(boxes, 0, 0, cZ, C.width, 0.12, C.length, floorC);
  wall(cols, 0, cZ, C.width, C.length, 0, 0.12);
  box(boxes, 0, C.height, cZ, C.width, th, C.length, ceilC);
  const sideGaps = (side: -1 | 1) => (o.sideDoors ?? [])
    .filter((d) => d.side === side)
    .map((d) => ({
      z: -(d.at ?? 0),
      w: d.width ?? 0.96,
      h: d.height ?? Math.min(2.08, C.height - 0.12),
    }));
  const wallH = C.height + th;
  cutZ(boxes, cols, -(C.width / 2 + th / 2), th, 0, -C.length, wallH, wallC, sideGaps(-1));
  cutZ(boxes, cols, C.width / 2 + th / 2, th, 0, -C.length, wallH, wallC, sideGaps(1));

  const cheekW = (C.width - doorW) / 2;
  const cheekX = doorW / 2 + cheekW / 2;
  box(boxes, -cheekX, 0, -th / 2, cheekW, C.height, th, wallC);
  box(boxes, cheekX, 0, -th / 2, cheekW, C.height, th, wallC);
  box(boxes, 0, doorH, -th / 2, doorW, C.height - doorH, th, wallC);
  wall(cols, -cheekX, -th / 2, cheekW, th, 0, C.height);
  wall(cols, cheekX, -th / 2, cheekW, th, 0, C.height);
  wall(cols, 0, -th / 2, doorW, th, doorH, C.height);

  if (o.detail >= 1) {
    box(boxes, 0.12, 0.12, -0.62, doorW * 0.86, doorH - 0.08, 0.05, trimC, { yaw: 0.5, detail: 1 });
    box(boxes, -(C.width / 2 - 0.04), 0.12, cZ, 0.06, 0.12, C.length - 0.2, trimC, { detail: 1 });
    box(boxes, C.width / 2 - 0.04, 0.12, cZ, 0.06, 0.12, C.length - 0.2, trimC, { detail: 1 });
  }

  box(boxes, 0, C.height - 0.08, cZ, 0.14, 0.05, C.length * 0.72, tube, { emissive: tubeEm, flick: 0.35 });

  const rZ = -C.length - R.length / 2;
  box(boxes, 0, 0, rZ, R.width, 0.12, R.length, floorC);
  wall(cols, 0, rZ, R.width, R.length, 0, 0.12);
  box(boxes, 0, R.height, rZ, R.width, th, R.length, ceilC);
  box(boxes, -(R.width / 2 + th / 2), 0, rZ, th, R.height + th, R.length, wallC);
  box(boxes, R.width / 2 + th / 2, 0, rZ, th, R.height + th, R.length, wallC);
  wall(cols, -(R.width / 2 + th / 2), rZ, th, R.length, 0, R.height);
  wall(cols, R.width / 2 + th / 2, rZ, th, R.length, 0, R.height);
  const backZ = -C.length - R.length - th / 2;
  const backHalf = R.width / 2 + th;
  const backGaps = o.backDoor
    ? [{
      x: o.backDoor.at ?? 0,
      w: o.backDoor.width ?? 1.2,
      h: o.backDoor.height ?? Math.min(2.15, R.height - 0.12),
    }]
    : [];
  cutX(boxes, cols, backZ, th, -backHalf, backHalf, R.height + th, wallC, backGaps);

  const shoulder = (R.width - C.width) / 2;
  if (shoulder > 0.08) {
    const sx = C.width / 2 + shoulder / 2;
    const sz = -C.length;
    box(boxes, -sx, 0, sz, shoulder, R.height, th, wallC);
    box(boxes, sx, 0, sz, shoulder, R.height, th, wallC);
    wall(cols, -sx, sz, shoulder, th, 0, R.height);
    wall(cols, sx, sz, shoulder, th, 0, R.height);
  }

  box(boxes, 0, R.height - 0.08, rZ, 0.14, 0.05, R.length * 0.62, tube, { emissive: tubeEm, flick: 1.7 });

  const tableZ = -C.length - R.length * 0.58;
  box(boxes, -0.35, 0.12, tableZ, 1.15, 0.62, 0.7, wood);
  wall(cols, -0.35, tableZ, 1.15, 0.7, 0.12, 0.74);

  if (o.detail >= 1) {
    box(boxes, R.width / 2 - 0.28, 0.12, rZ + 0.15, 0.42, 0.46, 1.3, trimC, { detail: 1 });
    box(boxes, -(R.width / 2 - 0.04), 0.12, rZ, 0.06, 0.12, R.length - 0.2, trimC, { detail: 1 });
    box(boxes, R.width / 2 - 0.04, 0.12, rZ, 0.06, 0.12, R.length - 0.2, trimC, { detail: 1 });
  }

  const winW = 1.15, winH = 0.7;
  const winX = R.width / 2 - 0.02;
  const winY = 1.5;
  const winZ = -C.length - R.length * 0.46;
  const wantWindow = o.window !== false;
  if (wantWindow && o.detail >= 2) {
    const ft = 0.06;
    box(boxes, winX - 0.04, winY - winH / 2 - ft, winZ, ft, ft, winW + ft * 2, trimC, { detail: 2 });
    box(boxes, winX - 0.04, winY + winH / 2, winZ, ft, ft, winW + ft * 2, trimC, { detail: 2 });
    box(boxes, winX - 0.04, winY - winH / 2, winZ - winW / 2, ft, winH, ft, trimC, { detail: 2 });
    box(boxes, winX - 0.04, winY - winH / 2, winZ + winW / 2, ft, winH, ft, trimC, { detail: 2 });
  }
  if (o.detail >= 3) {
    box(boxes, 0.85, 0.12, -C.length - 0.7, 0.48, 0.38, 0.48, mix(trimC, wood, 0.4), { detail: 3 });
  }
  if (o.extras) for (const e of o.extras) boxes.push(e);

  const lights: InteriorLight[] = [
    { x: 0, y: C.height - 0.15, z: -C.length * 0.45, color: tube, intensity: 3.4, range: Math.max(6, C.length) },
    { x: 0, y: R.height - 0.15, z: rZ, color: tube, intensity: 3.6, range: Math.max(6, R.length + 1) },
  ];
  const portals: InteriorPortal[] = wantWindow
    ? [{ x: winX, y: winY, z: winZ, w: winW, h: winH, yaw: -Math.PI / 2 }]
    : [];
  return { boxes, lights, ambient, portals, colliders: cols };
}
