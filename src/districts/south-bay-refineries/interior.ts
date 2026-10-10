// Control room on the south face of one yard. Corridor template, no window, no rides.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { controlBlock, doorWorld } from './spec';

const CORRIDOR = { length: 3.4, width: 2.2, height: 3.2 };
const ROOM = { length: 7.2, width: 5.8, height: 3.6 };

function roomProps(detail: number): InteriorBox[] {
  const steel: InteriorBox['color'] = [0.24, 0.25, 0.26];
  const z = -CORRIDOR.length - ROOM.length / 2;
  const wallX = ROOM.width / 2;
  const backZ = -CORRIDOR.length - ROOM.length + 0.08;
  const boxes: InteriorBox[] = [
    { x: 0.1, y: 0.96, z, w: 2.8, h: 0.08, d: 0.72, color: steel, emissive: [0.18, 0.08, 0.03] },
    { x: 0.1, y: 0.48, z, w: 2.6, h: 0.88, d: 0.58, color: [0.14, 0.14, 0.15] },
    { x: -wallX + 0.06, y: 1.4, z: z + 0.2, w: 0.08, h: 1.6, d: 2.2, color: [0.1, 0.1, 0.11], emissive: [0.7, 0.28, 0.05], flick: 0.35 },
    { x: wallX - 0.28, y: 1.2, z: z - 1.6, w: 0.4, h: 2.4, d: 0.4, color: steel, emissive: [0.16, 0.06, 0.02], detail: 1 },
    { x: -0.6, y: 0.42, z: z + 1.6, w: 0.42, h: 0.84, d: 0.42, color: [0.18, 0.16, 0.12], detail: 1 },
    { x: 1.1, y: 1.35, z: backZ, w: 1.2, h: 0.7, d: 0.08, color: [0.16, 0.16, 0.17], emissive: [0.35, 0.12, 0.04], flick: 0.8, detail: 2 },
  ];
  return boxes.filter((b) => (b.detail ?? 0) <= detail);
}

export function installSouthBayInterior(layout: CityLayout = getLayout()): void {
  const block = controlBlock(layout);
  if (!block) return;
  const door = doorWorld(block);
  const f: PlaceFrame = { x: door.x, y: door.y, z: door.z, yaw: 0 };
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.4,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras: roomProps(detail),
  });
  const built = plan(0);
  const deskZ = -CORRIDOR.length - ROOM.length / 2;
  built.colliders.push({ x: 0.1, z: deskZ, hw: 1.35, hd: 0.34, y0: 0, top: 1.0 });
  registerInterior({
    id: 'south-bay-control',
    volume: placeVolume(f, 0, -5.8, 3.2, 5.6, -0.2, 3.8),
    doors: [{ id: 'yard', exterior: true, box: placeVolume(f, 0, 0.4, 0.75, 0.55, 0, 2.4) }],
    showFromOutside: true,
    streamRadius: 42,
    muffle: 0.72,
    hum: 0.28,
    colliders: built.colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
