// Arcade lobby on the boulevard. Corridor template, gold warmth, no window, no rides.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { lobbyDoor } from './spec';

const CORRIDOR = { length: 3.4, width: 2.4, height: 3.2 };
const ROOM = { length: 6.8, width: 5.6, height: 3.4 };

function roomProps(detail: number): InteriorBox[] {
  const wood: InteriorBox['color'] = [0.32, 0.18, 0.22];
  const z = -CORRIDOR.length - ROOM.length / 2;
  const boxes: InteriorBox[] = [
    { x: 0, y: 1.05, z, w: 3.2, h: 0.08, d: 0.7, color: wood, emissive: [0.45, 0.16, 0.28] },
    { x: 0, y: 0.52, z, w: 3.0, h: 0.96, d: 0.55, color: [0.16, 0.1, 0.14] },
    { x: -1.8, y: 1.5, z: z + 0.2, w: 0.08, h: 1.8, d: 1.4, color: [0.1, 0.08, 0.12], emissive: [0.7, 0.2, 0.45], flick: 0.6 },
    { x: 1.6, y: 0.45, z: z + 1.6, w: 0.42, h: 0.9, d: 0.42, color: [0.22, 0.14, 0.16], detail: 1 },
    { x: -0.7, y: 0.45, z: z + 1.6, w: 0.42, h: 0.9, d: 0.42, color: [0.22, 0.14, 0.16], detail: 1 },
    { x: 0.4, y: 1.2, z: z - 2.2, w: 0.7, h: 0.9, d: 0.12, color: [0.12, 0.1, 0.14], emissive: [0.85, 0.55, 0.15], flick: 0.3, detail: 2 },
  ];
  return boxes.filter((b) => (b.detail ?? 0) <= detail);
}

export function installHollywoodInterior(layout: CityLayout = getLayout()): void {
  const door = lobbyDoor();
  const y = layout.heightAt(door.x, door.z);
  const f: PlaceFrame = { x: door.x, y, z: door.z, yaw: 0 };
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.78,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras: roomProps(detail),
  });
  const built = plan(0);
  const deskZ = -CORRIDOR.length - ROOM.length / 2;
  built.colliders.push({ x: 0, z: deskZ, hw: 1.55, hd: 0.36, y0: 0, top: 1.1 });
  registerInterior({
    id: 'hollywood-lobby',
    volume: placeVolume(f, 0, -5.6, 3.1, 5.6, -0.2, 3.5),
    doors: [{ id: 'strip', exterior: true, box: placeVolume(f, 0, 0.55, 1.05, 0.7, 0, 2.4) }],
    showFromOutside: true,
    streamRadius: 42,
    muffle: 0.8,
    hum: 0,
    colliders: built.colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
