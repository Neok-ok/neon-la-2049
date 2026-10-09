// Furniture and the lift car. Plain boxes in the corridor-room frame (door at the origin,
// street on +Z). The shell stays buildCorridorRoom. No film text, no figure.
import type { InteriorBox, InteriorCollider, InteriorDetail, InteriorLight, RGB } from '../../world/interiors';
import { APARTMENT, CORRIDOR } from './spec';

const CON: RGB = [0.34, 0.33, 0.32];
const DARK: RGB = [0.16, 0.15, 0.15];
const WOOD: RGB = [0.34, 0.24, 0.16];
const TILE: RGB = [0.42, 0.44, 0.46];
const CLOTH: RGB = [0.28, 0.22, 0.18];
const AMBER: RGB = [1.15, 0.62, 0.28];
const COLD: RGB = [0.72, 0.84, 0.95];
const GRAFF: RGB[] = [
  [0.42, 0.2, 0.16], [0.18, 0.3, 0.32], [0.48, 0.36, 0.14], [0.3, 0.22, 0.28], [0.22, 0.24, 0.22],
];

function push(
  boxes: InteriorBox[], x: number, y: number, z: number, w: number, h: number, d: number, color: RGB,
  extra?: Partial<InteriorBox>,
): void {
  boxes.push({ x, y, z, w, h, d, color, ...extra });
}

function glyphs(boxes: InteriorBox[], x: number, y: number, z: number, axis: 'x' | 'z', seed: number, detail: InteriorDetail): void {
  if (detail < 1) return;
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const n = 4 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const w = 0.06 + rnd() * 0.2;
    const h = 0.08 + rnd() * 0.32;
    const along = (rnd() - 0.5) * 0.85;
    const dy = rnd() * 0.9;
    const color = GRAFF[Math.floor(rnd() * GRAFF.length)]!;
    if (axis === 'z') push(boxes, x, y + dy, z + along, 0.025, h, w, color, { detail: 1 });
    else push(boxes, x + along, y + dy, z, w, h, 0.025, color, { detail: 1 });
  }
}

export function lobbyExtras(detail: InteriorDetail): InteriorBox[] {
  const boxes: InteriorBox[] = [];
  const C = { length: 4.5 }, R = { length: 9.25, width: 10.2 };
  const rZ = -C.length - R.length / 2;
  // mailbox bank on the east wall, lockers on the west. A worn desk is the template table.
  for (let i = 0; i < 8; i++) {
    const z = rZ - 2.6 + i * 0.62;
    push(boxes, R.width / 2 - 0.28, 0.12, z, 0.36, 1.35, 0.52, DARK, { detail: 0 });
    push(boxes, R.width / 2 - 0.42, 0.72, z, 0.04, 0.22, 0.28, COLD, { emissive: [0.35, 0.5, 0.62], flick: i * 0.4, detail: 1 });
  }
  for (let i = 0; i < 5; i++) {
    const z = rZ + 1.4 + (i - 2) * 0.7;
    push(boxes, -(R.width / 2 - 0.32), 0.12, z, 0.46, 1.85, 0.58, CON, { detail: 0 });
  }
  // security frame around the back opening
  const backZ = -C.length - R.length - 0.02;
  push(boxes, -1.05, 0, backZ, 0.28, 2.35, 0.16, DARK);
  push(boxes, 1.05, 0, backZ, 0.28, 2.35, 0.16, DARK);
  push(boxes, 0, 2.2, backZ, 1.9, 0.28, 0.16, DARK);
  push(boxes, 0.95, 1.15, backZ + 0.12, 0.12, 0.18, 0.08, COLD, { emissive: [0.4, 0.7, 0.85], flick: 0.2 });
  if (detail >= 1) {
    glyphs(boxes, R.width / 2 - 0.08, 0.4, rZ + 2.2, 'z', 11, detail);
    push(boxes, -1.6, 0.12, rZ, 0.42, 0.42, 1.1, CON, { detail: 1 });
  }
  return boxes;
}

export function corridorExtras(detail: InteriorDetail): InteriorBox[] {
  const boxes: InteriorBox[] = [];
  const { length, width, height, doorAt: realAt } = CORRIDOR;
  // identical doors. The real one is the gap; the rest are slabs in the wall.
  const step = 2.35;
  for (let at = 1.5; at < length - 0.8; at += step) {
    for (const side of [-1, 1] as const) {
      if (side === -1 && Math.abs(at - realAt) < 0.7) continue;
      const z = -at;
      const x = side * (width / 2 - 0.02);
      push(boxes, x, 0.08, z, 0.05, 2.02, 0.84, DARK, { detail: 0 });
      push(boxes, x - side * 0.03, 1.05, z + 0.28, 0.03, 0.08, 0.06, COLD, {
        emissive: [0.45, 0.62, 0.7], flick: (at + side) * 0.17, detail: 1,
      });
      if (detail >= 1 && (Math.floor(at) + side) % 2 === 0) {
        glyphs(boxes, x - side * 0.04, 0.35, z, 'z', Math.floor(at * 17 + side * 3), detail);
      }
    }
  }
  // grime band
  if (detail >= 1) {
    push(boxes, 0, 0.12, -length * 0.5, width - 0.2, 0.04, length * 0.7, [0.22, 0.2, 0.18], { detail: 1 });
    glyphs(boxes, width / 2 - 0.06, 1.15, -3.2, 'z', 41, detail);
    glyphs(boxes, -(width / 2 - 0.06), 0.5, -6.4, 'z', 77, detail);
  }
  // a dead tube that flickers harder than the template's
  push(boxes, 0.15, height - 0.1, -length * 0.72, 0.08, 0.04, 1.4, COLD, { emissive: COLD, flick: 2.4 });
  return boxes;
}

export function apartmentExtras(detail: InteriorDetail): InteriorBox[] {
  const boxes: InteriorBox[] = [];
  const C = { length: 1.55, width: 1.12, height: 2.38 };
  const R = { length: 4.7, width: 3.7, height: 2.46 };
  const rZ = -C.length - R.length / 2;
  const tableZ = -C.length - R.length * 0.58;
  // chair at the template table, kitchen counter on the east wall (local −X; +X is the west window)
  push(boxes, 0.15, 0.12, tableZ + 0.15, 0.42, 0.78, 0.42, WOOD);
  push(boxes, -(R.width / 2 - 0.38), 0.12, rZ + 0.15, 0.62, 0.9, 2.2, CON);
  push(boxes, -(R.width / 2 - 0.38), 1.02, rZ + 0.15, 0.66, 0.05, 2.2, DARK);
  push(boxes, -(R.width / 2 - 0.55), 1.15, rZ - 0.55, 0.28, 0.16, 0.28, [0.55, 0.5, 0.42], { detail: 1 });
  // warm practical over the table. The shell stays cool; this is the amber lamp.
  push(boxes, -0.35, 1.55, tableZ, 0.16, 0.28, 0.16, [0.4, 0.24, 0.12], { emissive: AMBER, flick: -1 });
  // bench along the south (local −Z is south when yaw is π — the far wall)
  const benchZ = -C.length - R.length + 0.55;
  push(boxes, 0.35, 0.12, benchZ, 1.5, 0.4, 0.55, CLOTH);
  push(boxes, 0.35, 0.5, benchZ - 0.2, 1.5, 0.38, 0.1, CLOTH, { detail: 1 });
  // shower alcove in the north-east corner of the room, a partition not a second room
  const sx = -(R.width / 2 - 0.7);
  const sz = -C.length - 0.85;
  push(boxes, sx, 0.12, sz, 1.15, 0.08, 1.05, TILE);
  push(boxes, sx + 0.45, 0.12, sz, 0.06, 1.9, 1.05, TILE, { detail: 0 });
  push(boxes, sx - 0.15, 1.85, sz, 0.12, 0.08, 0.12, [0.7, 0.72, 0.74], { detail: 1 });
  // shelves
  push(boxes, R.width / 2 - 0.22, 1.15, rZ - 0.7, 0.28, 0.04, 1.1, WOOD, { detail: 1 });
  push(boxes, R.width / 2 - 0.22, 1.55, rZ - 0.7, 0.28, 0.04, 1.1, WOOD, { detail: 1 });
  if (detail >= 2) {
    for (let i = 0; i < 3; i++) {
      push(boxes, R.width / 2 - 0.22, 1.2, rZ - 1.05 + i * 0.28, 0.12, 0.16, 0.1, [0.3, 0.28, 0.26], { detail: 2 });
    }
  }
  // lock panel beside the entry
  push(boxes, C.width / 2 - 0.02, 1.12, -0.35, 0.06, 0.16, 0.1, DARK, { emissive: [0.85, 0.45, 0.16], flick: 0.6 });
  // blinds over the template window (local +X, mid-room)
  const winX = R.width / 2 - 0.1;
  const winY = 1.5;
  const winZ = -C.length - R.length * 0.46;
  const winW = 1.15;
  const winH = 0.7;
  if (detail >= 1) {
    for (let i = 0; i < 6; i++) {
      const y = winY - winH / 2 + 0.06 + i * (winH / 7);
      push(boxes, winX, y, winZ, 0.02, 0.035, winW * 0.92, [0.12, 0.13, 0.15], { detail: 1 });
    }
  }
  return boxes;
}

/** Counter and bench. The template already collides the table. */
export function apartmentColliders(): InteriorCollider[] {
  const C = APARTMENT.corridor;
  const R = APARTMENT.room;
  const rZ = -C.length - R.length / 2;
  const benchZ = -C.length - R.length + 0.55;
  return [
    { x: -(R.width / 2 - 0.38), z: rZ + 0.15, hw: 0.34, hd: 1.1, y0: 0.12, top: 1.08 },
    { x: 0.35, z: benchZ, hw: 0.75, hd: 0.28, y0: 0.12, top: 0.55 },
  ];
}

export function apartmentLamp(): InteriorLight {
  const C = { length: 1.55 }, R = { length: 4.7 };
  const tableZ = -C.length - R.length * 0.58;
  return { x: -0.35, y: 1.7, z: tableZ, color: AMBER, intensity: 2.8, range: 3.4 };
}

export interface LiftPlan {
  boxes: InteriorBox[];
  lights: InteriorLight[];
  ambient: RGB;
  portals: [];
  colliders: InteriorCollider[];
}

/** A small car. Door at the origin, the hall on +Z, the car toward −Z. */
export function buildLift(detail: InteriorDetail): LiftPlan {
  const w = 2.05, d = 2.15, h = 2.32, th = 0.08;
  const boxes: InteriorBox[] = [];
  const cols: InteriorCollider[] = [];
  const cZ = -d / 2;
  push(boxes, 0, 0, cZ, w, 0.08, d, [0.22, 0.22, 0.23]);
  cols.push({ x: 0, z: cZ, hw: w / 2, hd: d / 2, y0: 0, top: 0.08 });
  push(boxes, 0, h, cZ, w, th, d, [0.4, 0.42, 0.44]);
  push(boxes, -(w / 2 + th / 2), 0, cZ, th, h + th, d, CON);
  push(boxes, w / 2 + th / 2, 0, cZ, th, h + th, d, CON);
  cols.push({ x: -(w / 2 + th / 2), z: cZ, hw: th / 2, hd: d / 2, y0: 0, top: h });
  cols.push({ x: w / 2 + th / 2, z: cZ, hw: th / 2, hd: d / 2, y0: 0, top: h });
  push(boxes, 0, 0, -d - th / 2, w + th, h + th, th, CON);
  cols.push({ x: 0, z: -d - th / 2, hw: (w + th) / 2, hd: th / 2, y0: 0, top: h });
  const doorW = 1.15;
  const cheek = (w - doorW) / 2;
  push(boxes, -(doorW / 2 + cheek / 2), 0, -th / 2, cheek, h, th, CON);
  push(boxes, doorW / 2 + cheek / 2, 0, -th / 2, cheek, h, th, CON);
  push(boxes, 0, 2.15, -th / 2, doorW, h - 2.15, th, CON);
  cols.push({ x: -(doorW / 2 + cheek / 2), z: 0, hw: cheek / 2, hd: th / 2, y0: 0, top: h });
  cols.push({ x: doorW / 2 + cheek / 2, z: 0, hw: cheek / 2, hd: th / 2, y0: 0, top: h });
  cols.push({ x: 0, z: 0, hw: doorW / 2, hd: th / 2, y0: 2.15, top: h });
  push(boxes, 0, h - 0.08, cZ, 0.12, 0.04, d * 0.7, COLD, { emissive: COLD, flick: 0.8 });
  // Right panel is the near stop, left panel is the far stop. Ride zones sit on the floor in front.
  push(boxes, 0.48, 1.05, -d + 0.06, 0.22, 0.36, 0.04, AMBER, { emissive: AMBER, flick: -1 });
  push(boxes, -0.48, 1.05, -d + 0.06, 0.22, 0.36, 0.04, COLD, { emissive: COLD, flick: -1 });
  if (detail >= 1) {
    push(boxes, 0, 0.9, -d + 0.05, 0.7, 0.5, 0.02, [0.1, 0.1, 0.11], { detail: 1 });
    glyphs(boxes, w / 2 - 0.02, 0.4, cZ, 'z', 19, detail);
  }
  const lights: InteriorLight[] = [
    { x: 0, y: h - 0.12, z: cZ, color: COLD, intensity: 2.6, range: 3.2 },
  ];
  return { boxes, lights, ambient: [0.16, 0.18, 0.2], portals: [], colliders: cols };
}
