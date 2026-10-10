// Transit concourse on the south face of the core slab. Corridor template, no window, no rides.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { concourseDoor } from './spec';

const CORRIDOR = { length: 3.6, width: 2.6, height: 3.2 };
const ROOM = { length: 6.8, width: 6.2, height: 3.6 };

function roomProps(detail: number): InteriorBox[] {
  const concrete: InteriorBox['color'] = [0.22, 0.2, 0.18];
  const z = -CORRIDOR.length - ROOM.length / 2;
  const boxes: InteriorBox[] = [
    { x: 0, y: 1.05, z, w: 3.4, h: 0.08, d: 0.72, color: concrete, emissive: [0.28, 0.16, 0.05] },
    { x: 0, y: 0.5, z, w: 3.2, h: 0.92, d: 0.55, color: [0.12, 0.11, 0.1] },
    { x: -2.2, y: 0.42, z: z + 1.4, w: 1.3, h: 0.42, d: 0.42, color: concrete, detail: 1 },
    { x: 2.2, y: 0.42, z: z + 1.4, w: 1.3, h: 0.42, d: 0.42, color: concrete, detail: 1 },
    { x: 0, y: 1.7, z: z - 2.4, w: 2.4, h: 0.9, d: 0.08, color: [0.08, 0.09, 0.1], emissive: [0.25, 0.55, 0.62], flick: 0.35, detail: 2 },
  ];
  return boxes.filter((b) => (b.detail ?? 0) <= detail);
}

export function installLongBeachInterior(layout: CityLayout = getLayout()): void {
  const door = concourseDoor(layout);
  const f: PlaceFrame = { x: door.x, y: door.y, z: door.z, yaw: door.yaw };
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.48,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras: roomProps(detail),
  });
  const built = plan(0);
  const deskZ = -CORRIDOR.length - ROOM.length / 2;
  built.colliders.push({ x: 0, z: deskZ, hw: 1.6, hd: 0.34, y0: 0, top: 1.1 });
  registerInterior({
    id: 'long-beach-concourse',
    volume: placeVolume(f, 0, -5.4, 3.4, 5.6, -0.2, 3.8),
    doors: [{ id: 'street', exterior: true, box: placeVolume(f, 0, 0.4, 1.05, 0.6, 0, 2.6) }],
    showFromOutside: true,
    streamRadius: 46,
    muffle: 0.75,
    hum: 0.12,
    colliders: built.colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
