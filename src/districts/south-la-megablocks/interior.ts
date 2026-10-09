// One laundromat hall on the north side of the Exposition yard.
// Corridor template, cooler than Lakewood's shop, no window, no rides, no scene lights.
import type { InteriorBox } from '../../world/interiors';
import type { CityLayout } from '../../world/layout';
import { getLayout } from '../../world/layout';
import {
  buildCorridorRoom, placeCollider, placeInterior, placeVolume, registerInterior,
} from '../../world/interiors';
import type { PlaceFrame } from '../../world/interiors';
import { laundryOrigin } from './locate';

const CORRIDOR = { length: 3.2, width: 1.8, height: 2.65 };
const ROOM = { length: 7.8, width: 5.4, height: 2.7 };

function vol(f: PlaceFrame, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
  return placeVolume(f, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, y0, y1);
}

function washers(): InteriorBox[] {
  const out: InteriorBox[] = [];
  const steel: InteriorBox['color'] = [0.62, 0.64, 0.66];
  for (let i = 0; i < 5; i++) {
    const z = -4.5 - i * 1.15;
    out.push({
      x: -2.15, y: 0.12, z, w: 0.72, h: 0.95, d: 0.7,
      color: steel, emissive: [0.12, 0.2, 0.28], flick: i * 0.35,
    });
    out.push({
      x: 2.15, y: 0.12, z, w: 0.72, h: 0.95, d: 0.7,
      color: steel, emissive: [0.1, 0.16, 0.14], flick: 0.6 + i * 0.3,
    });
  }
  return out;
}

export function installSouthLaInterior(layout: CityLayout = getLayout()): void {
  const origin = laundryOrigin(layout);
  if (!origin) return;
  const f: PlaceFrame = origin;
  const extras = washers();
  const plan = (detail: 0 | 1 | 2 | 3) => buildCorridorRoom({
    warmth: 0.35,
    corridor: CORRIDOR,
    room: ROOM,
    window: false,
    detail,
    extras,
  });
  registerInterior({
    id: 'south-la-laundry',
    volume: vol(f, -3.05, 3.05, -11.3, 1.15, -0.2, 3.05),
    doors: [{ id: 'yard', exterior: true, box: vol(f, -0.72, 0.72, -0.25, 1.4, 0, 2.35) }],
    showFromOutside: true,
    streamRadius: 42,
    muffle: 0.84,
    hum: 0,
    colliders: plan(0).colliders.map((c) => placeCollider(f, c)),
    build: (detail) => placeInterior(f, plan(detail)),
  });
}
