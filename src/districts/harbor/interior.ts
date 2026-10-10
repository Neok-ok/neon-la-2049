// Port control room on the landward face of one quay shed. Corridor template, no window, no rides.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { harborSites } from './sites';

const CORRIDOR = { length: 3.4, width: 2.2, height: 3.2 };
const ROOM = { length: 6.4, width: 5.4, height: 3.6 };

function roomProps(detail: number): InteriorBox[] {
  const steel: InteriorBox['color'] = [0.2, 0.21, 0.22];
  const z = -CORRIDOR.length - ROOM.length / 2;
  const wallX = ROOM.width / 2;
  const backZ = -CORRIDOR.length - ROOM.length + 0.08;
  const boxes: InteriorBox[] = [
    { x: 0, y: 0.96, z, w: 2.6, h: 0.08, d: 0.7, color: steel, emissive: [0.16, 0.08, 0.03] },
    { x: 0, y: 0.46, z, w: 2.4, h: 0.84, d: 0.55, color: [0.12, 0.13, 0.14] },
    { x: -wallX + 0.06, y: 1.5, z: z + 0.1, w: 0.08, h: 1.8, d: 2.4, color: [0.08, 0.09, 0.1], emissive: [0.75, 0.42, 0.12], flick: 0.25 },
    { x: wallX - 0.3, y: 0, z: z - 1.2, w: 0.42, h: 1.6, d: 0.42, color: steel, detail: 1 },
    { x: 0.4, y: 1.4, z: backZ, w: 1.6, h: 0.7, d: 0.08, color: [0.1, 0.11, 0.12], emissive: [0.3, 0.55, 0.7], flick: 0.6, detail: 2 },
  ];
  return boxes.filter((b) => (b.detail ?? 0) <= detail);
}

export function installHarborInterior(layout: CityLayout = getLayout()): void {
  const door = harborSites(layout).control;
  if (!door) return;
  const f: PlaceFrame = { x: door.x, y: door.y, z: door.z, yaw: door.yaw };
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.32,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras: roomProps(detail),
  });
  const built = plan(0);
  const deskZ = -CORRIDOR.length - ROOM.length / 2;
  built.colliders.push({ x: 0, z: deskZ, hw: 1.25, hd: 0.32, y0: 0, top: 1.0 });
  registerInterior({
    id: 'harbor-control',
    volume: placeVolume(f, 0, -5.2, 3.2, 5.4, -0.2, 3.8),
    doors: [{ id: 'quay', exterior: true, box: placeVolume(f, 0, 0.45, 0.85, 0.55, 0, 2.5) }],
    showFromOutside: true,
    streamRadius: 48,
    muffle: 0.7,
    hum: 0.24,
    colliders: built.colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
