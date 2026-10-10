// Pump-house control room. Corridor template, sodium warmth, no window, no rides.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { doorWorld, pumpBlock } from './spec';

const CORRIDOR = { length: 3.2, width: 2.1, height: 3.2 };
const ROOM = { length: 6.6, width: 5.4, height: 3.4 };

function roomProps(detail: number): InteriorBox[] {
  const steel: InteriorBox['color'] = [0.26, 0.28, 0.3];
  const z = -CORRIDOR.length - ROOM.length / 2;
  const boxes: InteriorBox[] = [
    { x: 0.2, y: 0.92, z, w: 2.4, h: 0.08, d: 0.7, color: steel, emissive: [0.15, 0.1, 0.04] },
    { x: 0.2, y: 0.46, z, w: 2.2, h: 0.84, d: 0.55, color: [0.16, 0.16, 0.17] },
    { x: -1.6, y: 1.35, z: z + 0.15, w: 0.08, h: 1.5, d: 1.8, color: [0.12, 0.13, 0.14], emissive: [0.55, 0.28, 0.06], flick: 0.4 },
    { x: 1.7, y: 1.7, z: z - 1.4, w: 0.42, h: 2.6, d: 0.42, color: steel, emissive: [0.12, 0.06, 0.02], detail: 1 },
    { x: -0.4, y: 0.42, z: z + 1.5, w: 0.42, h: 0.84, d: 0.42, color: [0.2, 0.18, 0.14], detail: 1 },
    { x: 0.9, y: 1.05, z: z - 2.1, w: 0.55, h: 0.7, d: 0.4, color: [0.18, 0.19, 0.2], emissive: [0.2, 0.16, 0.08], flick: 1.1, detail: 2 },
  ];
  return boxes.filter((b) => (b.detail ?? 0) <= detail);
}

export function installSoutheastInterior(layout: CityLayout = getLayout()): void {
  const block = pumpBlock(layout);
  if (!block) return;
  const door = doorWorld(block);
  const f: PlaceFrame = { x: door.x, y: door.y, z: door.z, yaw: 0 };
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.46,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras: roomProps(detail),
  });
  const built = plan(0);
  const deskZ = -CORRIDOR.length - ROOM.length / 2;
  built.colliders.push({ x: 0.2, z: deskZ, hw: 1.15, hd: 0.32, y0: 0, top: 0.96 });
  registerInterior({
    id: 'southeast-pump',
    volume: placeVolume(f, 0, -5.4, 2.9, 5.2, -0.2, 3.6),
    doors: [{ id: 'yard', exterior: true, box: placeVolume(f, 0, 0.4, 0.72, 0.5, 0, 2.3) }],
    showFromOutside: true,
    streamRadius: 42,
    muffle: 0.74,
    hum: 0.32,
    colliders: built.colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
