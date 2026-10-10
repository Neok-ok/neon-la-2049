// One diner counter in the covered yard. Corridor template, warmer than the laundry
// and the shop, no window, no rides, no scene lights.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { dinerOrigin } from './locate';

const CORRIDOR = { length: 2.6, width: 1.7, height: 2.55 };
const ROOM = { length: 5.4, width: 4.6, height: 2.6 };

function vol(f: PlaceFrame, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
  return placeVolume(f, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, y0, y1);
}

function counter(): InteriorBox[] {
  const wood: InteriorBox['color'] = [0.42, 0.26, 0.14];
  const steel: InteriorBox['color'] = [0.55, 0.52, 0.48];
  const out: InteriorBox[] = [];
  out.push({
    x: -1.2, y: 0, z: -5.5, w: 0.72, h: 1.05, d: 3.5,
    color: wood,
  });
  out.push({
    x: -1.85, y: 0.85, z: -7.15, w: 0.4, h: 0.55, d: 1.5,
    color: steel, emissive: [0.85, 0.32, 0.08], flick: 0.4,
  });
  for (let i = 0; i < 4; i++) {
    out.push({
      x: -0.45, y: 0, z: -4.4 - i * 0.85, w: 0.36, h: 0.72, d: 0.36,
      color: [0.22, 0.16, 0.12], detail: 1,
    });
  }
  return out;
}

export function installWestsideInterior(layout: CityLayout = getLayout()): void {
  const origin = dinerOrigin(layout);
  if (!origin) return;
  const f: PlaceFrame = origin;
  const extras = counter();
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.94,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras,
  });
  registerInterior({
    id: 'westside-diner',
    volume: vol(f, -2.55, 2.55, -8.55, 1.15, -0.2, 3.0),
    doors: [{ id: 'yard', exterior: true, box: vol(f, -0.7, 0.7, -0.2, 1.35, 0, 2.3) }],
    showFromOutside: true,
    streamRadius: 42,
    muffle: 0.82,
    hum: 0,
    colliders: plan(0).colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
