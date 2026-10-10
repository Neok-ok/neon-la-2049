// Terminal concourse. Corridor template, cool light, no window, no rides.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { doorSite } from './spec';

const CORRIDOR = { length: 4.2, width: 3.2, height: 3.4 };
const ROOM = { length: 8.4, width: 7.2, height: 3.6 };

function roomProps(detail: number): InteriorBox[] {
  const z = -CORRIDOR.length - ROOM.length / 2;
  const boxes: InteriorBox[] = [
    { x: 0, y: 1.15, z, w: 4.4, h: 0.08, d: 0.7, color: [0.16, 0.18, 0.22], emissive: [0.35, 0.55, 0.85] },
    { x: 0, y: 0.55, z, w: 4.2, h: 1.05, d: 0.55, color: [0.12, 0.13, 0.16] },
    { x: -2.4, y: 1.6, z: z + 0.4, w: 0.08, h: 1.4, d: 2.2, color: [0.1, 0.12, 0.16], emissive: [0.55, 0.75, 1.05], flick: 0.25 },
    { x: 2.2, y: 0.45, z: z + 2.2, w: 1.4, h: 0.48, d: 0.48, color: [0.2, 0.22, 0.24], detail: 1 },
    { x: -1.6, y: 0.45, z: z + 2.2, w: 1.4, h: 0.48, d: 0.48, color: [0.2, 0.22, 0.24], detail: 1 },
    { x: 0.2, y: 1.35, z: z - 3.4, w: 1.6, h: 0.7, d: 0.08, color: [0.1, 0.12, 0.14], emissive: [0.7, 0.85, 1.05], flick: 0.15, detail: 2 },
  ];
  return boxes.filter((b) => (b.detail ?? 0) <= detail);
}

export function installLaxInterior(layout: CityLayout = getLayout()): void {
  const door = doorSite();
  const y = layout.heightAt(door.x, door.z);
  // Local −Z points south, into the hall. The apron is north of the door.
  const f: PlaceFrame = { x: door.x, y, z: door.z, yaw: Math.PI };
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.16,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras: roomProps(detail),
  });
  const built = plan(0);
  const deskZ = -CORRIDOR.length - ROOM.length / 2;
  built.colliders.push({ x: 0, z: deskZ, hw: 2.15, hd: 0.36, y0: 0, top: 1.15 });
  registerInterior({
    id: 'lax-concourse',
    volume: placeVolume(f, 0, -6.4, 4.0, 6.6, -0.2, 3.8),
    doors: [{ id: 'apron', exterior: true, box: placeVolume(f, 0, 0.6, 1.2, 0.8, 0, 2.5) }],
    showFromOutside: true,
    streamRadius: 48,
    muffle: 0.75,
    hum: 0,
    colliders: built.colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
