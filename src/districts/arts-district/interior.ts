// The pour hall. Corridor template, orange warmth, no window, no rides, no scene lights.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { doorWorld, pourBlock } from './spec';

const CORRIDOR = { length: 3.6, width: 2.2, height: 3.4 };
const ROOM = { length: 9.2, width: 7.6, height: 7.2 };

function foundryProps(detail: number): InteriorBox[] {
  const steel: InteriorBox['color'] = [0.28, 0.29, 0.31];
  const brick: InteriorBox['color'] = [0.42, 0.22, 0.15];
  const z = -CORRIDOR.length - ROOM.length / 2;
  const boxes: InteriorBox[] = [
    { x: 0, y: 0.02, z, w: 2.4, h: 0.06, d: 2.4, color: brick, emissive: [0.85, 0.28, 0.05], flick: 0.15 },
    { x: 0, y: 0.08, z, w: 1.55, h: 1.15, d: 1.55, color: [0.22, 0.12, 0.08], emissive: [1.15, 0.38, 0.06], flick: 0.22 },
    { x: 0.15, y: 6.35, z, w: 0.32, h: 0.36, d: 8.4, color: steel, emissive: [0.08, 0.05, 0.02] },
    { x: 0.55, y: 5.85, z: z + 1.1, w: 0.72, h: 0.42, d: 0.72, color: steel, detail: 1 },
    { x: 0.55, y: 3.5, z: z + 1.1, w: 0.1, h: 2.3, d: 0.1, color: steel, detail: 1 },
    { x: -2.7, y: 3.15, z, w: 1.15, h: 0.08, d: 7.6, color: [0.24, 0.25, 0.27] },
    { x: -2.2, y: 3.65, z, w: 0.06, h: 0.9, d: 7.4, color: steel, detail: 1 },
    { x: 2.55, y: 1.15, z: z + 2.2, w: 0.55, h: 2.1, d: 0.55, color: [0.62, 0.6, 0.58], emissive: [0.22, 0.18, 0.14], flick: 0.8, detail: 1 },
    { x: -0.9, y: 1.0, z: z - 1.2, w: 0.4, h: 1.7, d: 0.4, color: [0.58, 0.56, 0.54], emissive: [0.16, 0.14, 0.12], flick: 1.4, detail: 2 },
  ];
  return boxes.filter((b) => (b.detail ?? 0) <= detail);
}

export function installArtsInterior(layout: CityLayout = getLayout()): void {
  const block = pourBlock(layout);
  if (!block) return;
  const door = doorWorld(block);
  const f: PlaceFrame = { x: door.x, y: door.y, z: door.z, yaw: 0 };
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.82,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras: foundryProps(detail),
  });
  const built = plan(0);
  const crucibleZ = -CORRIDOR.length - ROOM.length / 2;
  built.colliders.push({ x: 0, z: crucibleZ, hw: 0.85, hd: 0.85, y0: 0, top: 1.25 });
  registerInterior({
    id: 'arts-foundry',
    volume: placeVolume(f, 0, -6.5, 4.15, 6.7, -0.2, 7.55),
    doors: [{ id: 'dock', exterior: true, box: placeVolume(f, 0, 0.45, 0.78, 0.55, 0, 2.4) }],
    showFromOutside: true,
    streamRadius: 46,
    muffle: 0.8,
    hum: 0.5,
    colliders: built.colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
